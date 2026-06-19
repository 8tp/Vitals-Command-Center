import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

// Resolve relative token-file paths against the repo root, not the api workspace cwd.
// __dirname here = apps/api/src/services → up 4 = repo root.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
import { request } from 'undici';
import type { FastifyBaseLogger } from 'fastify';
import type { SleepSession, Workout } from '@vcc/shared';

/**
 * WHOOP API v2 client (developer.whoop.com).
 *
 * OAuth 2.0 authorization code flow with offline scope for refresh tokens.
 * Refresh tokens rotate — persist the rotated token back to the token file.
 *
 * Endpoints consumed (all v2; v1 was deprecated):
 *   GET /v2/cycle                     daily "cycle" (24h window) — strain, kJ
 *   GET /v2/recovery                  recovery per cycle — score, HRV, RHR, SpO2, skin temp
 *   GET /v2/activity/sleep            sleep sessions (stages, nap flag, score)
 *   GET /v2/activity/workout          workouts (strain, HR zones, distance) — sport_name string
 *
 * v2 changes vs v1: sleep/workout ids are UUID strings; workout includes
 * sport_name directly (no lookup needed); zone_durations is the correct field
 * name (plural).
 *
 * Rate limit: 100 requests per minute per user.
 */

const AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const API_BASE = 'https://api.prod.whoop.com/developer';

interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

// --- Normalized output row consumed by apps/api/src/services/normalizer.ts.
export interface WhoopDailyRow {
  date: string;
  recoveryScore: number | null;
  hrv: number | null;
  rhr: number | null;
  strain: number | null;
  calories: number | null;
  spo2: number | null;
  skinTempDelta: number | null;
  sleepScore: number | null;
  sleepHours: number | null;
  deepHours: number | null;
  remHours: number | null;
  lightHours: number | null;
}

export interface WhoopFetchResult {
  daily: WhoopDailyRow[];
  sleepSessions: SleepSession[];
  workouts: Workout[];
}

// --- Raw WHOOP payload shapes (partial — only fields we consume). --------

interface WhoopCycle {
  id: number;
  start: string;
  end: string | null;
  timezone_offset: string;
  score_state: string;
  score?: { strain?: number; kilojoule?: number; average_heart_rate?: number; max_heart_rate?: number };
}

interface WhoopRecovery {
  cycle_id: number;
  sleep_id: string; // v2: UUID
  score_state: string;
  score?: {
    user_calibrating?: boolean;
    recovery_score?: number;
    resting_heart_rate?: number;
    hrv_rmssd_milli?: number;
    spo2_percentage?: number;
    skin_temp_celsius?: number;
  };
}

interface WhoopSleepStageSummary {
  total_in_bed_time_milli: number;
  total_awake_time_milli: number;
  total_no_data_time_milli: number;
  total_light_sleep_time_milli: number;
  total_slow_wave_sleep_time_milli: number;
  total_rem_sleep_time_milli: number;
  sleep_cycle_count: number;
  disturbance_count: number;
}

interface WhoopSleep {
  id: string; // v2: UUID
  start: string;
  end: string;
  timezone_offset: string;
  nap: boolean;
  score_state: string;
  score?: {
    stage_summary?: WhoopSleepStageSummary;
    respiratory_rate?: number;
    sleep_performance_percentage?: number;
  };
}

interface WhoopWorkout {
  id: string; // v2: UUID
  start: string;
  end: string;
  timezone_offset: string;
  sport_name: string; // v2: direct string, no lookup required
  sport_id?: number;  // still present for callers that want the int
  score_state: string;
  score?: {
    strain?: number;
    average_heart_rate?: number;
    max_heart_rate?: number;
    kilojoule?: number;
    distance_meter?: number;
    zone_durations?: {
      zone_zero_milli?: number;
      zone_one_milli?: number;
      zone_two_milli?: number;
      zone_three_milli?: number;
      zone_four_milli?: number;
      zone_five_milli?: number;
    };
  };
}

// --- Client ---------------------------------------------------------------

export class WhoopClient {
  private tokens: Tokens | null = null;
  constructor(
    private readonly config = {
      clientId: process.env.WHOOP_CLIENT_ID ?? '',
      clientSecret: process.env.WHOOP_CLIENT_SECRET ?? '',
      redirectUri: process.env.WHOOP_REDIRECT_URI ?? '',
      tokenFile: resolveRepoRelative(process.env.WHOOP_TOKEN_FILE ?? './data/.whoop-tokens.json'),
    },
    private readonly log?: FastifyBaseLogger,
  ) {}

  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope:
        'read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement offline',
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<Tokens> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });
    const res = await request(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (res.statusCode !== 200) {
      const text = await res.body.text();
      throw new Error(`WHOOP token exchange failed ${res.statusCode}: ${text}`);
    }
    const json = (await res.body.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    const tokens: Tokens = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
    this.persist(tokens);
    return tokens;
  }

  private persist(tokens: Tokens): void {
    this.tokens = tokens;
    mkdirSync(dirname(this.config.tokenFile), { recursive: true });
    writeFileSync(this.config.tokenFile, JSON.stringify(tokens, null, 2));
  }

  private load(): Tokens | null {
    if (this.tokens) return this.tokens;
    if (!existsSync(this.config.tokenFile)) return null;
    try {
      this.tokens = JSON.parse(readFileSync(this.config.tokenFile, 'utf8')) as Tokens;
      return this.tokens;
    } catch {
      return null;
    }
  }

  private async refresh(): Promise<Tokens> {
    const existing = this.load();
    if (!existing) throw new Error('WHOOP: no refresh token persisted. Run OAuth flow first.');
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: existing.refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      scope: 'offline',
    });
    const res = await request(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (res.statusCode !== 200) {
      const text = await res.body.text();
      throw new Error(`WHOOP refresh failed ${res.statusCode}: ${text}`);
    }
    const json = (await res.body.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    const rotated: Tokens = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? existing.refreshToken,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
    this.persist(rotated);
    return rotated;
  }

  private async accessToken(): Promise<string> {
    const existing = this.load();
    if (!existing) throw new Error('WHOOP not authorized');
    if (existing.expiresAt - Date.now() < 60_000) {
      const t = await this.refresh();
      return t.accessToken;
    }
    return existing.accessToken;
  }

  async fetchDaysInRange(start: string, end: string): Promise<WhoopFetchResult> {
    const token = await this.accessToken();
    const startIso = new Date(`${start}T00:00:00Z`).toISOString();
    const endIso = new Date(`${end}T23:59:59Z`).toISOString();

    const [cycles, recovery, sleep, workouts] = await Promise.all([
      this.paginate<WhoopCycle>(`${API_BASE}/v2/cycle`, { start: startIso, end: endIso }, token),
      this.paginate<WhoopRecovery>(`${API_BASE}/v2/recovery`, { start: startIso, end: endIso }, token),
      this.paginate<WhoopSleep>(`${API_BASE}/v2/activity/sleep`, { start: startIso, end: endIso }, token),
      this.paginate<WhoopWorkout>(`${API_BASE}/v2/activity/workout`, { start: startIso, end: endIso }, token),
    ]);

    this.log?.info(
      {
        cycles: cycles.length,
        recovery: recovery.length,
        sleep: sleep.length,
        workouts: workouts.length,
      },
      'whoop fetched',
    );

    return transform({ cycles, recovery, sleep, workouts });
  }

  private async paginate<T>(url: string, params: Record<string, string>, token: string): Promise<T[]> {
    const out: T[] = [];
    let nextToken: string | undefined;
    do {
      const search = new URLSearchParams({
        ...params,
        limit: '25',
        ...(nextToken ? { nextToken } : {}),
      });
      const res = await request(`${url}?${search.toString()}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.statusCode === 429) {
        await new Promise((r) => setTimeout(r, 60_000));
        continue;
      }
      if (res.statusCode !== 200) {
        const text = await res.body.text();
        throw new Error(`WHOOP ${url} → ${res.statusCode}: ${text}`);
      }
      const json = (await res.body.json()) as { records?: T[]; next_token?: string };
      out.push(...(json.records ?? []));
      nextToken = json.next_token;
    } while (nextToken);
    return out;
  }
}

// --- Pure transform — easy to unit-test without HTTP. --------------------

export function transform(raw: {
  cycles: WhoopCycle[];
  recovery: WhoopRecovery[];
  sleep: WhoopSleep[];
  workouts: WhoopWorkout[];
}): WhoopFetchResult {
  const sleepById = new Map<string, WhoopSleep>();
  for (const s of raw.sleep) sleepById.set(s.id, s);

  // Re-key WHOOP data so it aligns with Oura's wake-date semantics:
  //   - Recovery/HRV/RHR/sleep metrics land on the date the sleep ENDED (wake day)
  //   - Strain/calories land on the date the cycle STARTED (the awake day)
  // On the current day, the open cycle contributes today's strain while
  // *last* night's recovery (linked to the cycle that just closed) lands on today too.
  const strainByDate = new Map<string, WhoopCycle>();
  for (const cyc of raw.cycles) {
    strainByDate.set(localDate(cyc.start, cyc.timezone_offset), cyc);
  }

  const morningByDate = new Map<string, { rec: WhoopRecovery; sleep: WhoopSleep }>();
  for (const rec of raw.recovery) {
    const sleep = sleepById.get(rec.sleep_id);
    if (!sleep) continue;
    morningByDate.set(localDate(sleep.end, sleep.timezone_offset), { rec, sleep });
  }

  const byDate = new Map<string, WhoopDailyRow>();
  const allDates = new Set<string>([...strainByDate.keys(), ...morningByDate.keys()]);
  for (const date of allDates) {
    const cyc = strainByDate.get(date);
    const morning = morningByDate.get(date);
    const stages = morning?.sleep.score?.stage_summary;

    byDate.set(date, {
      date,
      recoveryScore: morning?.rec.score?.recovery_score ?? null,
      hrv: morning?.rec.score?.hrv_rmssd_milli ?? null,
      rhr: morning?.rec.score?.resting_heart_rate ?? null,
      strain: cyc?.score?.strain ?? null,
      calories: cyc?.score?.kilojoule != null ? Math.round(cyc.score.kilojoule / 4.184) : null,
      spo2: morning?.rec.score?.spo2_percentage ?? null,
      skinTempDelta: morning?.rec.score?.skin_temp_celsius ?? null,
      sleepScore: morning?.sleep.score?.sleep_performance_percentage ?? null,
      sleepHours: stages
        ? (stages.total_in_bed_time_milli - stages.total_awake_time_milli) / 3_600_000
        : null,
      deepHours: stages ? stages.total_slow_wave_sleep_time_milli / 3_600_000 : null,
      remHours: stages ? stages.total_rem_sleep_time_milli / 3_600_000 : null,
      lightHours: stages ? stages.total_light_sleep_time_milli / 3_600_000 : null,
    });
  }

  // SleepSession rows — per-session detail for the sleep timeline view.
  const sleepSessions: SleepSession[] = raw.sleep
    .filter((s) => s.score?.stage_summary)
    .map((s) => {
      const stages = s.score!.stage_summary!;
      return {
        id: `sleep_w_${s.id}`,
        date: localDate(s.end, s.timezone_offset), // wake-up date
        source: 'whoop',
        startTime: s.start,
        endTime: s.end,
        isNap: s.nap,
        totalMinutes: Math.round(
          (stages.total_in_bed_time_milli - stages.total_awake_time_milli) / 60_000,
        ),
        deepMinutes: Math.round(stages.total_slow_wave_sleep_time_milli / 60_000),
        remMinutes: Math.round(stages.total_rem_sleep_time_milli / 60_000),
        lightMinutes: Math.round(stages.total_light_sleep_time_milli / 60_000),
        awakeMinutes: Math.round(stages.total_awake_time_milli / 60_000),
        sleepScore: s.score?.sleep_performance_percentage ?? null,
        avgHr: null, // WHOOP does not surface avg HR per sleep on this endpoint
        avgHrv: null,
        avgRespiratoryRate: s.score?.respiratory_rate ?? null,
        spo2: null,
      };
    });

  // Workout rows.
  const workouts: Workout[] = raw.workouts.map((w) => {
    const zd = w.score?.zone_durations ?? {};
    const durationMs = new Date(w.end).getTime() - new Date(w.start).getTime();
    return {
      id: `wo_w_${w.id}`,
      date: localDate(w.start, w.timezone_offset),
      source: 'whoop',
      sport: (w.sport_name ?? 'other').toLowerCase().replace(/\s+/g, '_'),
      startTime: w.start,
      endTime: w.end,
      durationMinutes: Math.max(0, durationMs / 60_000),
      strain: w.score?.strain ?? null,
      avgHr: w.score?.average_heart_rate ?? null,
      maxHr: w.score?.max_heart_rate ?? null,
      calories: w.score?.kilojoule != null ? Math.round(w.score.kilojoule / 4.184) : null,
      distanceKm: w.score?.distance_meter != null ? w.score.distance_meter / 1000 : null,
      zoneMinutes: {
        z1: (zd.zone_one_milli ?? 0) / 60_000,
        z2: (zd.zone_two_milli ?? 0) / 60_000,
        z3: (zd.zone_three_milli ?? 0) / 60_000,
        z4: (zd.zone_four_milli ?? 0) / 60_000,
        z5: (zd.zone_five_milli ?? 0) / 60_000,
      },
      notes: null,
    };
  });
  void randomUUID; // referenced by seed path; keep import stable for future use

  return { daily: [...byDate.values()], sleepSessions, workouts };
}

/** Turn a repo-relative path into an absolute one so the api workspace cwd doesn't matter. */
function resolveRepoRelative(p: string): string {
  return isAbsolute(p) ? p : resolve(REPO_ROOT, p);
}

/**
 * Map an ISO timestamp + WHOOP timezone_offset ("-05:00") to the local calendar date.
 * WHOOP timestamps are UTC; applying the offset gets the user's local "today".
 */
function localDate(isoUtc: string, offset: string): string {
  const utcMs = new Date(isoUtc).getTime();
  const sign = offset.startsWith('-') ? -1 : 1;
  const [hh, mm] = offset.slice(1).split(':').map(Number);
  const offsetMs = sign * ((hh ?? 0) * 3600_000 + (mm ?? 0) * 60_000);
  return new Date(utcMs + offsetMs).toISOString().slice(0, 10);
}
