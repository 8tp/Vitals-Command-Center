import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'undici';
import type { FastifyBaseLogger } from 'fastify';
import type { Workout } from '@vcc/shared';

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

/** Turn a repo-relative path into an absolute one so the api workspace cwd doesn't matter. */
function resolveRepoRelative(p: string): string {
  return isAbsolute(p) ? p : resolve(REPO_ROOT, p);
}
