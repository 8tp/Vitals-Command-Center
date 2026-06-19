import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'undici';
import type { FastifyBaseLogger } from 'fastify';
import { DEVICE_SOURCES, type DeviceSource } from '@vcc/shared';

// apps/api/src/services → up 4 = repo root.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/**
 * Fitbit Air client via the **Google Health API** (health.googleapis.com).
 *
 * Background: the legacy Fitbit Web API turns down Sept 2026; Fitbit accounts
 * migrated to Google accounts. The successor is the Google Health API, which
 * uses standard Google OAuth 2.0. For a personal project we run as an
 * "unverified" External app in Testing mode (cap 100 users) with our own Google
 * account added as a test user — no enterprise security review needed.
 *
 * Read endpoints (base https://health.googleapis.com):
 *   GET /v4/users/me/dataTypes/{dataType}/dataPoints            (list / intraday)
 *   GET /v4/users/me/dataTypes/{dataType}/dataPoints:dailyRollUp (date-range summary)
 *
 * Data types consumed (Fitbit Air sensors):
 *   daily-heart-rate-variability        HRV (overnight)
 *   daily-resting-heart-rate            RHR
 *   daily-oxygen-saturation             SpO2 (overnight)
 *   daily-sleep-temperature-derivations skin-temp deviation
 *   sleep                               sleep stages + score
 *   steps                               daily steps
 *
 * NOTE: The Google Health API launched ~May 2026 and does not publish exact
 * JSON *response* shapes. The OAuth flow below is standard and final; the
 * dataPoint PARSING in `transform()` is PROVISIONAL — run `--probe` once a
 * token exists to dump real payloads, then finalize the field mappings.
 */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://health.googleapis.com/v4/users/me/dataTypes';

// Flag file: set when Google rejects the refresh token (invalid_grant =
// revoked/expired). status/brief read it to surface "re-auth required".
const REAUTH_FLAG_FILE = resolve(REPO_ROOT, 'data', '.google-reauth-needed');

// Per-request network timeouts + retry policy for transient API blips.
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 3; // total attempts on 429/5xx (incl. the first)
const MAX_PAGES = 50; // hard cap on pagination to prevent infinite loops

/** Thrown when the Google refresh token is revoked/expired and re-auth is required. */
export class GoogleReauthRequiredError extends Error {
  readonly code = 'GOOGLE_REAUTH_REQUIRED';
  constructor(message = 'Google refresh token rejected (invalid_grant); re-authorize required') {
    super(message);
    this.name = 'GoogleReauthRequiredError';
  }
}

/** True if the re-auth flag file is present. */
export function googleReauthNeeded(): boolean {
  return existsSync(REAUTH_FLAG_FILE);
}

function setReauthFlag(): void {
  try {
    mkdirSync(dirname(REAUTH_FLAG_FILE), { recursive: true });
    writeFileSync(REAUTH_FLAG_FILE, new Date().toISOString());
  } catch {
    /* best-effort; failing to write the flag must not mask the real error */
  }
}

function clearReauthFlag(): void {
  try {
    if (existsSync(REAUTH_FLAG_FILE)) rmSync(REAUTH_FLAG_FILE, { force: true });
  } catch {
    /* best-effort */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const FITBIT_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  // Food/calorie logging (nutrition-log). Requires re-running the OAuth flow to
  // grant — until then nutrition reads 403 and is treated as absent.
  'https://www.googleapis.com/auth/googlehealth.nutrition.readonly',
];

// Map our metric → Google Health API dataType id (daily-rollup variants).
export const DATA_TYPES = {
  hrv: 'daily-heart-rate-variability',
  rhr: 'daily-resting-heart-rate',
  spo2: 'daily-oxygen-saturation',
  skinTemp: 'daily-sleep-temperature-derivations',
  respiratoryRate: 'daily-respiratory-rate', // overnight breaths/min (verified via --probe)
  sleep: 'sleep',
  steps: 'steps',
  activeEnergy: 'active-energy-burned', // calories OUT (intraday intervals → sum/day)
  nutritionLog: 'nutrition-log', // calories IN (needs nutrition scope; 403 until re-auth)
} as const;

interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

// --- Normalized daily row (consumed by normalizer during wiring step). -----
// Mirrors WhoopDailyRow minus strain (Fitbit Air has no strain metric).
export interface FitbitDailyRow {
  date: string;
  hrv: number | null;
  rhr: number | null;
  spo2: number | null;
  skinTempDelta: number | null;
  respiratoryRate: number | null;
  sleepScore: number | null;
  sleepHours: number | null;
  deepHours: number | null;
  remHours: number | null;
  lightHours: number | null;
  steps: number | null;
  activeCaloriesBurned: number | null; // active energy only; Google Health exposes no basal/total for Fitbit Air
  caloriesIn: number | null;
}

// Per-session sleep — kept local until the shared DeviceSource union gains
// 'fitbit' in the wiring step; mapped to @vcc/shared SleepSession there.
export interface FitbitSleepRow {
  id: string;
  date: string; // wake date
  startTime: string;
  endTime: string;
  totalMinutes: number | null;
  deepMinutes: number | null;
  remMinutes: number | null;
  lightMinutes: number | null;
  awakeMinutes: number | null;
  sleepScore: number | null;
  avgRespiratoryRate: number | null;
  spo2: number | null;
}

export interface FitbitFetchResult {
  daily: FitbitDailyRow[];
  sleepSessions: FitbitSleepRow[];
}

/**
 * Multi-source result from the Google Health "bridge". The Health API merges
 * data from several physical devices (Fitbit, Apple HealthKit, residual
 * WHOOP/Oura) — each dataPoint carries a `dataSource`. Instead of collapsing to
 * one Fitbit-preferred value, the bridge groups by device and emits a separate
 * daily-row + sleep-session set per source so the normalizer can fold them.
 *
 * Keys are a subset of DeviceSource ('fitbit' | 'apple' | 'whoop' | 'oura'),
 * filtered by the GOOGLE_HEALTH_SOURCES env at fetch time.
 */
export type BridgeFetchResult = Partial<Record<DeviceSource, FitbitFetchResult>>;

// --- Client ---------------------------------------------------------------

export class FitbitClient {
  private tokens: Tokens | null = null;
  constructor(
    private readonly config = {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirectUri:
        process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3001/api/auth/google/callback',
      tokenFile: resolveRepoRelative(process.env.GOOGLE_TOKEN_FILE ?? './data/.google-tokens.json'),
    },
    private readonly log?: FastifyBaseLogger,
  ) {}

  /**
   * Which devices the Google Health bridge is allowed to emit. Driven by
   * GOOGLE_HEALTH_SOURCES (comma list); defaults to all four. A device NOT in
   * this set is left to its native client (see jobs/sync.ts) — this is the
   * single source of truth that prevents double-counting.
   */
  bridgeSources(): DeviceSource[] {
    return parseBridgeSources(process.env.GOOGLE_HEALTH_SOURCES);
  }

  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: FITBIT_SCOPES.join(' '),
      access_type: 'offline', // request a refresh token
      prompt: 'consent', // force refresh-token issuance on re-consent
      include_granted_scopes: 'true',
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<Tokens> {
    const json = await this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });
    if (!json.refresh_token) {
      throw new Error(
        'Google did not return a refresh_token. Ensure access_type=offline and revoke prior ' +
          'grant so prompt=consent re-issues one (Google only sends it on first consent).',
      );
    }
    const tokens: Tokens = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
    this.persist(tokens);
    clearReauthFlag(); // fresh consent clears any prior re-auth flag
    return tokens;
  }

  private async tokenRequest(
    body: Record<string, string>,
  ): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
    const res = await request(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
      headersTimeout: REQUEST_TIMEOUT_MS,
      bodyTimeout: REQUEST_TIMEOUT_MS,
    });
    if (res.statusCode !== 200) {
      const text = await res.body.text();
      // invalid_grant (HTTP 400) = the refresh token is revoked/expired. This is
      // permanent — surface it as a typed re-auth error so callers don't treat
      // an empty fetch as "no data".
      if (res.statusCode === 400 && /invalid_grant/i.test(text)) {
        throw new GoogleReauthRequiredError(`Google token request: invalid_grant — ${text}`);
      }
      throw new Error(`Google token request failed ${res.statusCode}: ${text}`);
    }
    return res.body.json() as Promise<{
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    }>;
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
    if (!existing) throw new Error('Fitbit/Google: no refresh token persisted. Run OAuth first.');
    let json: { access_token: string; refresh_token?: string; expires_in: number };
    try {
      json = await this.tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: existing.refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      });
    } catch (err) {
      // Permanent (invalid_grant): record the re-auth flag and rethrow typed.
      if (err instanceof GoogleReauthRequiredError) {
        setReauthFlag();
        this.log?.error('Google refresh token rejected (invalid_grant) — re-auth required');
        throw err;
      }
      // Transient (network/5xx/timeout): do NOT flag as permanent.
      throw err;
    }
    // Google often omits refresh_token on refresh — keep the existing one.
    const rotated: Tokens = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? existing.refreshToken,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
    this.persist(rotated);
    clearReauthFlag(); // a successful refresh clears any stale re-auth flag
    return rotated;
  }

  private async accessToken(): Promise<string> {
    const existing = this.load();
    if (!existing) throw new Error('Fitbit/Google not authorized');
    if (existing.expiresAt - Date.now() < 60_000) return (await this.refresh()).accessToken;
    return existing.accessToken;
  }

  /** True if a token file exists (used by /auth/google/status). */
  hasTokens(): boolean {
    return existsSync(this.config.tokenFile);
  }

  /**
   * Low-level read of a dataType via the `list` method (GET .../dataPoints).
   * Time windowing is expressed through an AIP-160 `filter` string — the field
   * differs by data-type family:
   *   - daily summary types: `<type_snake>.date >= "YYYY-MM-DD" AND < "..."`
   *   - sleep sessions:      `sleep.interval.end_time >= "RFC3339" AND < "..."`
   *   - interval types:      `<type_snake>.interval.start_time >= "RFC3339" AND < "..."`
   */
  async readDataType(dataType: string, filter: string, pageSize = 200): Promise<unknown> {
    const params = new URLSearchParams({ filter, pageSize: String(pageSize) });
    const url = `${API_BASE}/${dataType}/dataPoints?${params.toString()}`;
    const text = await this.apiGet(dataType, url);
    return JSON.parse(text);
  }

  /**
   * GET a Health API URL with a per-request timeout and retry on transient
   * failures (429 / 5xx / network errors). Returns the response body text on
   * 200. Auth (401/403) and other 4xx are non-retryable and throw immediately.
   */
  private async apiGet(dataType: string, url: string): Promise<string> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const token = await this.accessToken();
        const res = await request(url, {
          headers: { authorization: `Bearer ${token}` },
          headersTimeout: REQUEST_TIMEOUT_MS,
          bodyTimeout: REQUEST_TIMEOUT_MS,
        });
        const text = await res.body.text();
        if (res.statusCode === 200) return text;
        const transient = res.statusCode === 429 || res.statusCode >= 500;
        const err = new Error(`Google Health API ${dataType} → ${res.statusCode}: ${text}`);
        if (!transient || attempt === MAX_RETRIES) throw err;
        lastErr = err;
      } catch (err) {
        // GoogleReauthRequiredError (from accessToken→refresh) is permanent.
        if (err instanceof GoogleReauthRequiredError) throw err;
        lastErr = err;
        if (attempt === MAX_RETRIES) throw err;
      }
      // Backoff: 500ms, 1000ms, … before the next attempt.
      await sleep(500 * attempt);
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  /** Build the correct AIP-160 filter for a data type over [start, endExclusive). */
  static buildFilter(dataType: string, start: string, endExclusive: string): string {
    const field = dataType.replace(/-/g, '_');
    if (dataType.startsWith('daily-')) {
      return `${field}.date >= "${start}" AND ${field}.date < "${endExclusive}"`;
    }
    if (dataType === 'sleep') {
      return `sleep.interval.end_time >= "${start}T00:00:00Z" AND sleep.interval.end_time < "${endExclusive}T00:00:00Z"`;
    }
    if (dataType === 'nutrition-log') {
      // Food entries filter on civil_start_time (date literal), not start_time.
      return `nutrition_log.interval.civil_start_time >= "${start}" AND nutrition_log.interval.civil_start_time < "${endExclusive}"`;
    }
    // interval-style (steps, active-energy, …)
    return `${field}.interval.start_time >= "${start}T00:00:00Z" AND ${field}.interval.start_time < "${endExclusive}T00:00:00Z"`;
  }

  /**
   * Discovery tool: dump raw payloads for every data type so the response
   * shapes can be read directly and `transform()` finalized. `endExclusive`
   * is the day AFTER the last day you want (the filter upper bound is `<`).
   */
  async probe(start: string, endExclusive: string): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    for (const [key, dataType] of Object.entries(DATA_TYPES)) {
      try {
        const filter = FitbitClient.buildFilter(dataType, start, endExclusive);
        out[`${key} (${dataType})`] = { filter, result: await this.readDataType(dataType, filter) };
      } catch (err) {
        out[`${key} (${dataType})`] = { ERROR: (err as Error).message };
      }
    }
    return out;
  }

  /** Paginated `list` — follows nextPageToken and returns all dataPoints. */
  private async listAll(dataType: string, filter: string): Promise<DataPoint[]> {
    const out: DataPoint[] = [];
    let pageToken: string | undefined;
    let pages = 0;
    do {
      const params = new URLSearchParams({
        filter,
        pageSize: '1000',
        ...(pageToken ? { pageToken } : {}),
      });
      const url = `${API_BASE}/${dataType}/dataPoints?${params.toString()}`;
      const text = await this.apiGet(dataType, url);
      const json = JSON.parse(text) as { dataPoints?: DataPoint[]; nextPageToken?: string };
      out.push(...(json.dataPoints ?? []));
      pageToken = json.nextPageToken || undefined;
      if (++pages >= MAX_PAGES) {
        this.log?.warn(`Google Health API ${dataType}: hit ${MAX_PAGES}-page cap; stopping pagination`);
        break;
      }
    } while (pageToken);
    return out;
  }

  /** start/end inclusive (YYYY-MM-DD), matching the WHOOP/Oura clients. */
  async fetchDaysInRange(start: string, end: string): Promise<BridgeFetchResult> {
    const endExclusive = addDays(end, 1);
    const f = (dt: string) => FitbitClient.buildFilter(dt, start, endExclusive);

    const [hrv, rhr, spo2, skinTemp, respiratoryRate, sleep, steps, activeEnergy] = await Promise.all([
      this.listAll(DATA_TYPES.hrv, f(DATA_TYPES.hrv)),
      this.listAll(DATA_TYPES.rhr, f(DATA_TYPES.rhr)),
      this.listAll(DATA_TYPES.spo2, f(DATA_TYPES.spo2)),
      this.listAll(DATA_TYPES.skinTemp, f(DATA_TYPES.skinTemp)),
      this.listAll(DATA_TYPES.respiratoryRate, f(DATA_TYPES.respiratoryRate)),
      this.listAll(DATA_TYPES.sleep, f(DATA_TYPES.sleep)),
      this.listAll(DATA_TYPES.steps, f(DATA_TYPES.steps)),
      this.listAll(DATA_TYPES.activeEnergy, f(DATA_TYPES.activeEnergy)),
    ]);

    // Food intake needs the nutrition OAuth scope — 403 until the user re-authorizes.
    let nutritionLog: DataPoint[] = [];
    try {
      nutritionLog = await this.listAll(DATA_TYPES.nutritionLog, f(DATA_TYPES.nutritionLog));
    } catch (err) {
      this.log?.info(`nutrition-log unavailable (re-auth with nutrition scope to enable): ${(err as Error).message.slice(0, 80)}`);
    }

    this.log?.info(
      { hrv: hrv.length, rhr: rhr.length, spo2: spo2.length, skinTemp: skinTemp.length, respiratoryRate: respiratoryRate.length, sleep: sleep.length, steps: steps.length, activeEnergy: activeEnergy.length, nutritionLog: nutritionLog.length },
      'fitbit fetched',
    );

    return transform(
      { hrv, rhr, spo2, skinTemp, respiratoryRate, sleep, steps, activeEnergy, nutritionLog },
      this.bridgeSources(),
    );
  }
}

// --- DataPoint shapes (only the fields we read) ---------------------------
interface CivilDate {
  year: number;
  month: number;
  day: number;
}
interface DataSource {
  platform?: string;
  application?: { packageName?: string };
  device?: { manufacturer?: string; model?: string };
}
interface DataPoint {
  dataSource?: DataSource;
  dailyHeartRateVariability?: { date: CivilDate; averageHeartRateVariabilityMilliseconds?: number };
  dailyRestingHeartRate?: { date: CivilDate; beatsPerMinute?: string | number };
  dailyOxygenSaturation?: { date: CivilDate; averagePercentage?: number };
  dailySleepTemperatureDerivations?: {
    date: CivilDate;
    nightlyTemperatureCelsius?: number | string;
    baselineTemperatureCelsius?: number | string;
  };
  dailyRespiratoryRate?: { date: CivilDate; breathsPerMinute?: number | string };
  sleep?: {
    interval: { startTime: string; endTime: string; endUtcOffset?: string };
    stages?: Array<{ startTime: string; endTime: string; type: string }>;
    // Authoritative per-night totals (Fitbit `STAGES` sleep). Preferred over
    // re-summing `stages` — an empty/zero session has no usable summary, which
    // is how we keep "no data" as null rather than a spurious 0h night.
    summary?: {
      minutesAsleep?: number | string;
      minutesAwake?: number | string;
      stagesSummary?: Array<{ type: string; minutes?: number | string }>;
    };
  };
  steps?: {
    interval: { civilStartTime?: { date: CivilDate } };
    count?: string | number;
  };
  // Energy value field is parsed defensively (caloriesKcal | energy.caloriesKcal | …).
  activeEnergyBurned?: {
    interval: { civilStartTime?: { date: CivilDate } };
    kcal?: number | string;
    energy?: { caloriesKcal?: number | string };
    caloriesKcal?: number | string;
    kilocalories?: number | string;
  };
  nutritionLog?: {
    interval?: { civilStartTime?: { date: CivilDate } };
    date?: CivilDate;
    energy?: { kcal?: number | string; caloriesKcal?: number | string };
    kcal?: number | string;
    totalCalories?: number | string;
    caloriesKcal?: number | string;
  };
}

// --- Pure transform — unit-testable without HTTP. -------------------------

export function transform(
  raw: {
    hrv: DataPoint[];
    rhr: DataPoint[];
    spo2: DataPoint[];
    skinTemp: DataPoint[];
    respiratoryRate: DataPoint[];
    sleep: DataPoint[];
    steps: DataPoint[];
    activeEnergy: DataPoint[];
    nutritionLog: DataPoint[];
  },
  // Devices the bridge is allowed to emit. Defaults to all four; sync.ts passes
  // the GOOGLE_HEALTH_SOURCES-derived list so native-only devices are excluded.
  allowed: DeviceSource[] = [...DEVICE_SOURCES],
): BridgeFetchResult {
  const allow = new Set(allowed);

  // Per-source accumulator. A dataPoint contributes to exactly ONE device
  // (the one its dataSource maps to) — never collapsed across sources.
  const perSource = new Map<DeviceSource, { byDate: Map<string, FitbitDailyRow>; sleep: FitbitSleepRow[] }>();
  const bucket = (src: DeviceSource) => {
    let b = perSource.get(src);
    if (!b) {
      b = { byDate: new Map(), sleep: [] };
      perSource.set(src, b);
    }
    return b;
  };
  const row = (src: DeviceSource, date: string): FitbitDailyRow => {
    const b = bucket(src);
    let r = b.byDate.get(date);
    if (!r) {
      r = {
        date,
        hrv: null, rhr: null, spo2: null, skinTempDelta: null, respiratoryRate: null,
        sleepScore: null, sleepHours: null, deepHours: null, remHours: null, lightHours: null,
        steps: null, activeCaloriesBurned: null, caloriesIn: null,
      };
      b.byDate.set(date, r);
    }
    return r;
  };
  // Resolve a dataPoint's device; null if unmapped or filtered out.
  const dev = (ds?: DataSource): DeviceSource | null => {
    const d = deviceOf(ds);
    return d && allow.has(d) ? d : null;
  };

  // Daily-summary metrics: assign each point to its own source/date.
  const civil = (cd?: CivilDate) => (cd ? isoDate(cd) : undefined);
  for (const p of raw.hrv) {
    const src = dev(p.dataSource);
    const date = civil(p.dailyHeartRateVariability?.date);
    if (!src || !date) continue;
    row(src, date).hrv = num(p.dailyHeartRateVariability?.averageHeartRateVariabilityMilliseconds);
  }
  for (const p of raw.rhr) {
    const src = dev(p.dataSource);
    const date = civil(p.dailyRestingHeartRate?.date);
    if (!src || !date) continue;
    row(src, date).rhr = num(p.dailyRestingHeartRate?.beatsPerMinute);
  }
  for (const p of raw.spo2) {
    const src = dev(p.dataSource);
    const date = civil(p.dailyOxygenSaturation?.date);
    if (!src || !date) continue;
    row(src, date).spo2 = num(p.dailyOxygenSaturation?.averagePercentage);
  }
  for (const p of raw.skinTemp) {
    const src = dev(p.dataSource);
    const date = civil(p.dailySleepTemperatureDerivations?.date);
    if (!src || !date) continue;
    const v = p.dailySleepTemperatureDerivations;
    const nightly = num(v?.nightlyTemperatureCelsius);
    const baseline = num(v?.baselineTemperatureCelsius); // "NaN" until ~30d baseline exists
    row(src, date).skinTempDelta = nightly != null && baseline != null ? nightly - baseline : null;
  }
  for (const p of raw.respiratoryRate) {
    const src = dev(p.dataSource);
    const date = civil(p.dailyRespiratoryRate?.date);
    if (!src || !date) continue;
    row(src, date).respiratoryRate = num(p.dailyRespiratoryRate?.breathsPerMinute);
  }

  // Sleep: one session per (source, wake-date). Prefer the API's authoritative
  // `summary` block; fall back to summing the `stages` array, then to the bare
  // interval (fallback sources like WHOOP-via-HealthKit give only an interval).
  for (const p of raw.sleep) {
    if (!p.sleep) continue;
    const src = dev(p.dataSource);
    if (!src) continue;
    const s = p.sleep;
    const date = civilDateFromIso(s.interval.endTime, s.interval.endUtcOffset);

    const mins = { AWAKE: 0, LIGHT: 0, DEEP: 0, REM: 0 };
    const stagesSummary = s.summary?.stagesSummary;
    if (stagesSummary?.length) {
      for (const ss of stagesSummary) {
        if (ss.type in mins) mins[ss.type as keyof typeof mins] = num(ss.minutes) ?? 0;
      }
    } else {
      for (const st of s.stages ?? []) {
        const d = (Date.parse(st.endTime) - Date.parse(st.startTime)) / 60_000;
        if (st.type in mins) mins[st.type as keyof typeof mins] += Number.isFinite(d) ? d : 0;
      }
    }
    const hasStages = mins.LIGHT + mins.DEEP + mins.REM > 0;
    const intervalMin = (Date.parse(s.interval.endTime) - Date.parse(s.interval.startTime)) / 60_000;
    // minutesAsleep is authoritative when present; else summed stages; else interval.
    const asleep =
      num(s.summary?.minutesAsleep) ??
      (hasStages ? mins.LIGHT + mins.DEEP + mins.REM : Math.max(0, intervalMin));

    // Standardize the "no data" sentinel on NULL: an empty / zero-duration sleep
    // record is not a real 0h night. Skip it so sleepHours stays null rather than
    // 0 (which would otherwise drag down averages/baselines downstream).
    if (!asleep || asleep <= 0) continue;

    const r = row(src, date);
    r.sleepHours = asleep / 60;
    r.deepHours = hasStages ? mins.DEEP / 60 : null;
    r.remHours = hasStages ? mins.REM / 60 : null;
    r.lightHours = hasStages ? mins.LIGHT / 60 : null;
    bucket(src).sleep.push({
      id: `sleep_${src}_${Date.parse(s.interval.startTime)}`,
      date,
      startTime: s.interval.startTime,
      endTime: s.interval.endTime,
      totalMinutes: Math.round(asleep),
      deepMinutes: hasStages ? Math.round(mins.DEEP) : null,
      remMinutes: hasStages ? Math.round(mins.REM) : null,
      lightMinutes: hasStages ? Math.round(mins.LIGHT) : null,
      awakeMinutes: hasStages ? Math.round(num(s.summary?.minutesAwake) ?? mins.AWAKE) : null,
      // Fitbit's sleep SCORE is not exposed by the Google Health API (no
      // sleep-score / sleep-quality dataType exists; verified via --probe).
      // Left null deliberately — this is a source limitation, not a mapping gap.
      sleepScore: null,
      avgRespiratoryRate: null, // per-night value not in the sleep payload; daily-respiratory-rate is mapped on the daily row instead
      spo2: null,
    });
  }

  // Steps: intraday intervals → sum per (source, civil date).
  for (const [src, date, sum] of sumBySourceDate(
    raw.steps,
    (p) => p.steps?.interval.civilStartTime?.date,
    (p) => num(p.steps?.count),
    dev,
  )) {
    row(src, date).steps = Math.round(sum);
  }

  // Active energy burned (calories out): intraday → sum per (source, civil date).
  for (const [src, date, sum] of sumBySourceDate(
    raw.activeEnergy,
    (p) => p.activeEnergyBurned?.interval.civilStartTime?.date,
    (p) => kcal(p.activeEnergyBurned),
    dev,
  )) {
    row(src, date).activeCaloriesBurned = Math.round(sum);
  }

  // Food intake (calories in): nutrition-log entries → sum per (source, day).
  for (const [src, date, sum] of sumBySourceDate(
    raw.nutritionLog,
    (p) => p.nutritionLog?.interval?.civilStartTime?.date ?? p.nutritionLog?.date,
    (p) => kcal(p.nutritionLog),
    dev,
  )) {
    row(src, date).caloriesIn = Math.round(sum);
  }

  const out: BridgeFetchResult = {};
  for (const [src, b] of perSource) {
    out[src] = { daily: [...b.byDate.values()], sleepSessions: b.sleep };
  }
  return out;
}

// --- helpers --------------------------------------------------------------

/** Parse the GOOGLE_HEALTH_SOURCES env (comma list) → valid DeviceSource[]. */
export function parseBridgeSources(raw?: string): DeviceSource[] {
  if (raw == null) return [...DEVICE_SOURCES];
  const valid = new Set<string>(DEVICE_SOURCES);
  const parsed = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => valid.has(s)) as DeviceSource[];
  return parsed;
}

/**
 * Map a Google Health `dataSource` to one of our four DeviceSources, or null if
 * it can't be identified. Mapping (checked WHOOP/Oura before Apple so a WHOOP
 * app writing through HealthKit isn't mislabeled 'apple'):
 *   platform === 'FITBIT'                         → fitbit
 *   packageName contains 'whoop'                  → whoop
 *   packageName contains 'oura'                   → oura
 *   packageName startsWith 'com.apple.health'
 *     OR device.manufacturer === 'Apple Inc.'     → apple
 *   else                                          → null (skip)
 */
function deviceOf(ds?: DataSource): DeviceSource | null {
  if (ds?.platform === 'FITBIT') return 'fitbit';
  const pkg = (ds?.application?.packageName ?? '').toLowerCase();
  if (pkg.includes('whoop')) return 'whoop';
  if (pkg.includes('oura')) return 'oura';
  const manufacturer = ds?.device?.manufacturer ?? '';
  if (pkg.startsWith('com.apple.health') || /apple/i.test(manufacturer)) return 'apple';
  return null;
}

/** Sum a per-interval value into (source, civil-date) totals. */
function sumBySourceDate(
  points: DataPoint[],
  dateOf: (p: DataPoint) => CivilDate | undefined,
  valueOf: (p: DataPoint) => number | null,
  dev: (ds?: DataSource) => DeviceSource | null,
): Array<[DeviceSource, string, number]> {
  const acc = new Map<string, { src: DeviceSource; date: string; sum: number }>();
  for (const p of points) {
    const src = dev(p.dataSource);
    if (!src) continue;
    const cd = dateOf(p);
    if (!cd) continue;
    const v = valueOf(p);
    if (v == null) continue;
    const date = isoDate(cd);
    const key = `${src} ${date}`;
    const cur = acc.get(key);
    if (!cur) acc.set(key, { src, date, sum: v });
    else cur.sum += v;
  }
  return [...acc.values()].map((e) => [e.src, e.date, e.sum]);
}

function isoDate(d: CivilDate): string {
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

/** Local calendar date of an ISO timestamp given a "-18000s" style offset. */
function civilDateFromIso(iso: string, utcOffset?: string): string {
  const offsetSec = utcOffset ? parseInt(utcOffset, 10) : 0;
  return new Date(Date.parse(iso) + offsetSec * 1000).toISOString().slice(0, 10);
}

/** Coerce string|number (incl. "NaN") to a finite number or null. */
function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

/** Extract a kcal value from an energy/nutrition object, trying known field names. */
function kcal(o?: {
  kcal?: number | string;
  caloriesKcal?: number | string;
  energy?: { kcal?: number | string; caloriesKcal?: number | string };
  kilocalories?: number | string;
  totalCalories?: number | string;
}): number | null {
  if (!o) return null;
  return (
    num(o.kcal) ?? // active-energy-burned.kcal
    num(o.energy?.kcal) ?? // nutrition-log.energy.kcal
    num(o.caloriesKcal) ??
    num(o.energy?.caloriesKcal) ??
    num(o.kilocalories) ??
    num(o.totalCalories)
  );
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function resolveRepoRelative(p: string): string {
  return isAbsolute(p) ? p : resolve(REPO_ROOT, p);
}

// --- CLI: `tsx src/services/fitbit.ts --probe [--days N]` ------------------
// Dumps raw Google Health API payloads to stdout for shape discovery.
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain && process.argv.includes('--probe')) {
  (async () => {
    const { config: loadEnv } = await import('dotenv');
    loadEnv({ path: resolve(REPO_ROOT, '.env') });
    const days = Number(process.argv[process.argv.indexOf('--days') + 1]) || 7;
    const endExclusive = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10); // today+1
    const start = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
    const client = new FitbitClient();
    const dump = await client.probe(start, endExclusive);
    process.stdout.write(JSON.stringify(dump, null, 2) + '\n');
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
