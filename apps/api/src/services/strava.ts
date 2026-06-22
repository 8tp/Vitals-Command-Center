import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'undici';
import type { FastifyBaseLogger } from 'fastify';
import type {
  Workout,
  WorkoutDetail,
  WorkoutSplit,
  WorkoutLap,
  WorkoutSegmentEffort,
  WorkoutInterval,
} from '@vcc/shared';

// apps/api/src/services → up 4 = repo root. Resolve relative token-file paths
// against the repo root, not the api workspace cwd (mirrors whoop.ts).
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/**
 * Strava API v3 client (developer.strava.com).
 *
 * OAuth 2.0 authorization code flow. Scope `activity:read_all` covers private
 * activities too. Unlike WHOOP, Strava expresses token lifetime as an absolute
 * `expires_at` (epoch *seconds*); refresh tokens may rotate, so the rotated
 * token is persisted back to the token file.
 *
 * Endpoints consumed:
 *   GET /api/v3/athlete/activities   summary list of the athlete's activities
 *
 * The summary list omits `calories` (that lives on the per-activity detail
 * endpoint), so calories is mapped only when present.
 *
 * Rate limit: 200 requests / 15 min, 2000 / day (default app limits).
 */

const AUTH_URL = 'https://www.strava.com/oauth/authorize';
const TOKEN_URL = 'https://www.strava.com/oauth/token';
const API_BASE = 'https://www.strava.com/api/v3';
const SCOPE = 'read,activity:read_all';

interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms (normalized from Strava's epoch seconds)
}

// --- Raw Strava activity shape (only the fields we read). ------------------
// /api/v3/athlete/activities summary objects. `calories` is typically absent
// here (detail-endpoint only); kept optional for callers that pass detail rows.
interface StravaActivity {
  id: number;
  name?: string;
  sport_type?: string; // newer field; preferred over `type`
  type?: string; // legacy activity type
  start_date?: string; // UTC ISO
  start_date_local?: string; // local-wall-clock ISO
  distance?: number; // meters
  moving_time?: number; // seconds
  elapsed_time?: number; // seconds
  average_speed?: number; // m/s
  max_speed?: number; // m/s
  average_heartrate?: number;
  max_heartrate?: number;
  calories?: number; // detail endpoint only
}

// --- Raw detail shapes (GET /activities/{id}, only fields we read). --------
interface StravaSplit {
  split: number;
  distance: number; // meters
  elapsed_time: number;
  moving_time: number;
  average_speed: number; // m/s (moving)
  average_heartrate?: number;
  elevation_difference?: number;
}
interface StravaLap {
  lap_index: number;
  name?: string;
  distance: number;
  elapsed_time: number;
  moving_time: number;
  average_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
}
interface StravaSegmentEffort {
  segment: { id: number; name: string };
  distance: number;
  elapsed_time: number;
  average_heartrate?: number;
  max_heartrate?: number;
  pr_rank?: number | null;
}
interface StravaActivityDetail extends StravaActivity {
  splits_metric?: StravaSplit[];
  laps?: StravaLap[];
  segment_efforts?: StravaSegmentEffort[];
  average_cadence?: number; // per-leg for runs
  total_elevation_gain?: number;
  average_watts?: number;
  suffer_score?: number | null;
  gear?: { name?: string } | null;
  device_name?: string | null;
  description?: string | null;
}

// --- Client ---------------------------------------------------------------

export class StravaClient {
  private tokens: Tokens | null = null;
  constructor(
    private readonly config = {
      clientId: process.env.STRAVA_CLIENT_ID ?? '',
      clientSecret: process.env.STRAVA_CLIENT_SECRET ?? '',
      redirectUri:
        process.env.STRAVA_REDIRECT_URI ?? 'http://localhost:3001/api/auth/strava/callback',
      tokenFile: resolveRepoRelative(process.env.STRAVA_TOKEN_FILE ?? './data/.strava-tokens.json'),
    },
    private readonly log?: FastifyBaseLogger,
  ) {}

  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      approval_prompt: 'auto',
      scope: SCOPE,
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<Tokens> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
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
      throw new Error(`Strava token exchange failed ${res.statusCode}: ${text}`);
    }
    const json = (await res.body.json()) as {
      access_token: string;
      refresh_token: string;
      expires_at: number; // epoch seconds
    };
    const tokens: Tokens = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: json.expires_at * 1000,
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

  /** True if a token file exists (used by /auth/strava/status). */
  hasTokens(): boolean {
    return existsSync(this.config.tokenFile);
  }

  private async refresh(): Promise<Tokens> {
    const existing = this.load();
    if (!existing) throw new Error('Strava: no refresh token persisted. Run OAuth flow first.');
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: existing.refreshToken,
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
      throw new Error(`Strava refresh failed ${res.statusCode}: ${text}`);
    }
    const json = (await res.body.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_at: number; // epoch seconds
    };
    const rotated: Tokens = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? existing.refreshToken,
      expiresAt: json.expires_at * 1000,
    };
    this.persist(rotated);
    return rotated;
  }

  private async accessToken(): Promise<string> {
    const existing = this.load();
    if (!existing) throw new Error('Strava not authorized');
    if (existing.expiresAt - Date.now() < 60_000) {
      return (await this.refresh()).accessToken;
    }
    return existing.accessToken;
  }

  /**
   * List activities started after `afterEpochSeconds`, mapped to Workout[].
   * Paginates `per_page=100` until a short page is returned.
   */
  async listActivities(afterEpochSeconds: number): Promise<Workout[]> {
    const token = await this.accessToken();
    const perPage = 100;
    const raw: StravaActivity[] = [];
    for (let page = 1; ; page++) {
      const search = new URLSearchParams({
        after: String(afterEpochSeconds),
        per_page: String(perPage),
        page: String(page),
      });
      const url = `${API_BASE}/athlete/activities?${search.toString()}`;
      const res = await request(url, { headers: { authorization: `Bearer ${token}` } });
      if (res.statusCode === 429) {
        // Rate-limited: wait out a 15-minute window boundary and retry the page.
        await new Promise((r) => setTimeout(r, 60_000));
        page--;
        continue;
      }
      if (res.statusCode !== 200) {
        const text = await res.body.text();
        throw new Error(`Strava ${url} → ${res.statusCode}: ${text}`);
      }
      const batch = (await res.body.json()) as StravaActivity[];
      raw.push(...batch);
      if (batch.length < perPage) break;
    }

    this.log?.info({ activities: raw.length }, 'strava fetched');
    return raw.map(mapActivity);
  }

  /**
   * Fetch one activity's full detail (splits/laps/segments + extra stats),
   * mapped to WorkoutDetail. Also returns `calories` so callers can backfill
   * the summary row (the list endpoint omits it). Returns null on 404 (a
   * deleted/inaccessible activity) so a single bad id doesn't fail a sync.
   */
  async getActivityDetail(
    activityId: number | string,
  ): Promise<{ detail: WorkoutDetail; calories: number | null } | null> {
    const token = await this.accessToken();
    const url = `${API_BASE}/activities/${activityId}?include_all_efforts=true`;
    for (let attempt = 0; ; attempt++) {
      const res = await request(url, { headers: { authorization: `Bearer ${token}` } });
      if (res.statusCode === 429 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 60_000));
        continue;
      }
      if (res.statusCode === 404) {
        this.log?.warn({ activityId }, 'strava activity not found; skipping detail');
        return null;
      }
      if (res.statusCode !== 200) {
        const text = await res.body.text();
        throw new Error(`Strava ${url} → ${res.statusCode}: ${text}`);
      }
      const a = (await res.body.json()) as StravaActivityDetail;
      const detail = mapDetail(a);
      // Reconstruct run/walk intervals from the velocity stream (the only place
      // interval structure lives when there's just one lap). Best-effort: a
      // stream failure leaves intervals null rather than failing the detail.
      detail.intervals = await this.getIntervals(activityId, token).catch((err) => {
        this.log?.warn({ err, activityId }, 'strava streams fetch failed; no intervals');
        return null;
      });
      return { detail, calories: a.calories ?? null };
    }
  }

  /** Fetch velocity/distance/time/HR streams and segment them into intervals. */
  private async getIntervals(
    activityId: number | string,
    token: string,
  ): Promise<WorkoutInterval[] | null> {
    const keys = 'time,distance,velocity_smooth,heartrate,moving';
    const url = `${API_BASE}/activities/${activityId}/streams?keys=${keys}&key_by_type=true`;
    const res = await request(url, { headers: { authorization: `Bearer ${token}` } });
    if (res.statusCode !== 200) {
      if (res.statusCode === 404) return null; // activity has no streams
      const text = await res.body.text();
      throw new Error(`Strava ${url} → ${res.statusCode}: ${text}`);
    }
    const body = (await res.body.json()) as Record<string, { data?: number[] }>;
    const streams = {
      time: body.time?.data ?? [],
      distance: body.distance?.data ?? [],
      velocity: body.velocity_smooth?.data ?? [],
      heartrate: body.heartrate?.data,
    };
    if (streams.time.length < 4 || streams.velocity.length < 4) return null;
    return detectIntervals(streams);
  }
}

// --- Pure transform — easy to unit-test without HTTP. ---------------------

// Strava sport_type/type → our normalized sport slug.
const SPORT_MAP: Record<string, string> = {
  Run: 'running',
  Ride: 'cycling',
  Walk: 'walking',
  Hike: 'hiking',
  Swim: 'swimming',
  WeightTraining: 'lifting',
  Workout: 'workout',
};

/** Map a single Strava activity to a normalized Workout row. */
export function mapActivity(a: StravaActivity): Workout {
  const rawSport = a.sport_type ?? a.type ?? 'workout';
  const sport = (SPORT_MAP[rawSport] ?? rawSport).toLowerCase();
  const date = (a.start_date_local ?? a.start_date ?? '').slice(0, 10);
  const startTime = a.start_date ?? a.start_date_local ?? '';
  const endTime =
    startTime && a.elapsed_time != null
      ? new Date(new Date(startTime).getTime() + a.elapsed_time * 1000).toISOString()
      : startTime;

  return {
    id: `strava-${a.id}`,
    date,
    source: 'strava',
    sport,
    startTime,
    endTime,
    durationMinutes: a.moving_time != null ? a.moving_time / 60 : 0,
    strain: null,
    avgHr: a.average_heartrate ?? null,
    maxHr: a.max_heartrate ?? null,
    calories: a.calories ?? null,
    distanceKm: a.distance != null ? a.distance / 1000 : null,
    zoneMinutes: { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 },
    notes: a.name ?? null,
  };
}

// Run/walk threshold (m/s). Running sits ~3-5 m/s, walking ~1-1.6 m/s, so 2.4
// cleanly separates work efforts from recovery for foot sports.
const WORK_SPEED_MS = 2.4;
// Ignore class flickers shorter than this (GPS noise, a brief slow corner).
const MIN_BOUT_SEC = 18;

/**
 * Segment a velocity stream into run ('work') and walk/stand ('recovery') bouts.
 * Pure + side-effect free. Classifies each sample by speed, then merges bouts
 * shorter than MIN_BOUT_SEC into their neighbor so noise doesn't fragment the
 * structure. Returns interval bouts with per-bout distance, duration, pace, HR.
 */
export function detectIntervals(streams: {
  time: number[];
  distance: number[];
  velocity: number[];
  heartrate?: number[];
}): WorkoutInterval[] {
  const { time, distance, velocity, heartrate } = streams;
  const n = Math.min(time.length, distance.length, velocity.length);
  if (n < 4) return [];

  const cls: number[] = Array.from({ length: n }, (_, i) =>
    (velocity[i] ?? 0) >= WORK_SPEED_MS ? 1 : 0,
  );

  const coalesce = (c: number[]): { v: number; s: number; e: number }[] => {
    const segs: { v: number; s: number; e: number }[] = [];
    for (let i = 0; i < c.length; i++) {
      if (i > 0 && c[i] === c[i - 1]) segs[segs.length - 1]!.e = i;
      else segs.push({ v: c[i]!, s: i, e: i });
    }
    return segs;
  };

  // Absorb sub-threshold bouts into a neighbor's class, then re-coalesce. Repeat
  // until stable so a short walk inside a long run (or vice versa) is smoothed.
  let segs = coalesce(cls);
  let changed = true;
  while (changed && segs.length > 1) {
    changed = false;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]!;
      if (time[seg.e]! - time[seg.s]! < MIN_BOUT_SEC) {
        const v = i > 0 ? segs[i - 1]!.v : segs[i + 1]!.v;
        for (let j = seg.s; j <= seg.e; j++) cls[j] = v;
        changed = true;
      }
    }
    if (changed) segs = coalesce(cls);
  }

  return segs.map((seg, idx) => {
    const durationSeconds = time[seg.e]! - time[seg.s]!;
    const distanceKm = (distance[seg.e]! - distance[seg.s]!) / 1000;
    let avgHr: number | null = null;
    if (heartrate && heartrate.length >= seg.e) {
      let sum = 0;
      let cnt = 0;
      for (let j = seg.s; j <= seg.e; j++) {
        const h = heartrate[j];
        if (h != null && h > 0) {
          sum += h;
          cnt += 1;
        }
      }
      avgHr = cnt ? Math.round(sum / cnt) : null;
    }
    return {
      index: idx + 1,
      kind: seg.v === 1 ? ('work' as const) : ('recovery' as const),
      distanceKm,
      durationSeconds,
      avgPaceSecondsPerKm: distanceKm > 0 ? durationSeconds / distanceKm : null,
      avgHr,
    };
  });
}

// pace (s/km) from a moving speed in m/s; null when stopped/unknown.
function paceFromSpeed(metersPerSecond: number | undefined): number | null {
  return metersPerSecond && metersPerSecond > 0 ? 1000 / metersPerSecond : null;
}
// pace (s/km) from distance (m) + moving time (s).
function paceFromDistance(meters: number, movingSeconds: number): number | null {
  return meters > 0 ? movingSeconds / (meters / 1000) : null;
}

/** Map a raw Strava activity detail to our WorkoutDetail. `fetchedAt` is set by
 * the caller path via `new Date()`; isolated here so the transform stays pure
 * apart from that single timestamp. */
export function mapDetail(a: StravaActivityDetail): WorkoutDetail {
  const splits: WorkoutSplit[] = (a.splits_metric ?? []).map((s) => ({
    index: s.split,
    distanceKm: s.distance / 1000,
    elapsedSeconds: s.elapsed_time,
    movingSeconds: s.moving_time,
    paceSecondsPerKm: paceFromSpeed(s.average_speed),
    avgHr: s.average_heartrate ?? null,
    elevationGain: s.elevation_difference ?? null,
  }));
  const laps: WorkoutLap[] = (a.laps ?? []).map((l) => ({
    index: l.lap_index,
    name: l.name ?? null,
    distanceKm: l.distance / 1000,
    elapsedSeconds: l.elapsed_time,
    movingSeconds: l.moving_time,
    avgHr: l.average_heartrate ?? null,
    maxHr: l.max_heartrate ?? null,
    avgPaceSecondsPerKm: paceFromSpeed(l.average_speed) ?? paceFromDistance(l.distance, l.moving_time),
  }));
  const segments: WorkoutSegmentEffort[] = (a.segment_efforts ?? []).map((e) => ({
    id: e.segment.id,
    name: e.segment.name,
    distanceKm: e.distance / 1000,
    elapsedSeconds: e.elapsed_time,
    avgHr: e.average_heartrate ?? null,
    maxHr: e.max_heartrate ?? null,
    prRank: e.pr_rank ?? null,
  }));
  // Strava reports run cadence per-leg; double to the conventional steps/min.
  const isRun = (a.sport_type ?? a.type) === 'Run';
  const avgCadence =
    a.average_cadence != null ? Math.round(a.average_cadence * (isRun ? 2 : 1)) : null;

  return {
    splits,
    laps,
    segments,
    avgCadence,
    totalElevationGain: a.total_elevation_gain ?? null,
    avgWatts: a.average_watts ?? null,
    sufferScore: a.suffer_score ?? null,
    gearName: a.gear?.name ?? null,
    deviceName: a.device_name ?? null,
    description: a.description ?? null,
    fetchedAt: new Date().toISOString(),
  };
}

/** Turn a repo-relative path into an absolute one so the api workspace cwd doesn't matter. */
function resolveRepoRelative(p: string): string {
  return isAbsolute(p) ? p : resolve(REPO_ROOT, p);
}
