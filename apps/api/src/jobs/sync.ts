import type { Database } from 'better-sqlite3';
import type { FastifyBaseLogger } from 'fastify';
import type { SleepSession, Workout } from '@vcc/shared';
import { queries, openDb } from '@vcc/db';
import { addDaysIso, todayIso } from '../lib/range.js';
import type { DeviceSource } from '@vcc/shared';
import { WhoopClient, type WhoopFetchResult } from '../services/whoop.js';
import { OuraClient, type OuraFetchResult } from '../services/oura.js';
import { AppleHealthParser, type AppleFetchResult } from '../services/apple-health.js';
import {
  FitbitClient,
  parseBridgeSources,
  type FitbitDailyRow,
  type FitbitSleepRow,
} from '../services/fitbit.js';
import { normalizeAndUpsert } from '../services/normalizer.js';
import type { WhoopDailyRow } from '../services/whoop.js';
import type { OuraDailyRow } from '../services/oura.js';
import type { AppleDailyRow } from '../services/apple-health.js';

let running = false;
export function isSyncRunning(): boolean {
  return running;
}

export interface SyncOptions {
  rangeDays?: number; // default 7 — pull last N days on each run
  includeApple?: boolean; // default true if APPLE_HEALTH_EXPORT_PATH exists
}

export interface SyncResult {
  dates: string[];
  dailyUpserted: number;
  sleepUpserted: number;
  workoutUpserted: number;
}

const EMPTY_WHOOP: WhoopFetchResult = { daily: [], sleepSessions: [], workouts: [] };
const EMPTY_OURA: OuraFetchResult = { daily: [], sleepSessions: [], workouts: [] };
const EMPTY_APPLE: AppleFetchResult = { daily: [], sleepSessions: [], workouts: [] };

// Flattened Google Health bridge result: per-source daily rows (still in the
// FitbitDailyRow shape) plus already-normalized sleep sessions tagged by source.
interface BridgeSyncResult {
  daily: Record<DeviceSource, FitbitDailyRow[]>;
  sleepSessions: SleepSession[];
  workouts: Workout[];
}
const EMPTY_BRIDGE: BridgeSyncResult = {
  daily: { fitbit: [], whoop: [], oura: [], apple: [] },
  sleepSessions: [],
  workouts: [],
};

export async function runSync(
  db: Database,
  log: FastifyBaseLogger,
  opts: SyncOptions = {},
): Promise<SyncResult> {
  if (running) throw new Error('sync already running');
  running = true;
  try {
    const end = todayIso();
    const start = addDaysIso(end, -((opts.rangeDays ?? 7) - 1));
    log.info({ start, end }, 'sync starting');

    // -- Source ownership (prevents double-counting) ------------------------
    // A device is taken from the Google Health BRIDGE if it's listed in
    // GOOGLE_HEALTH_SOURCES; otherwise it falls to its NATIVE client (when
    // creds exist). Each device is populated by exactly one path.
    const bridgeSources = new Set<DeviceSource>(parseBridgeSources(process.env.GOOGLE_HEALTH_SOURCES));

    // Fetch the bridge once (multi-source). Gated on an existing OAuth token
    // (run /api/auth/google/authorize once to create it).
    const bridge = await pullSource('fitbit', db, log, async () => {
      if (!process.env.GOOGLE_CLIENT_ID) return EMPTY_BRIDGE;
      const client = new FitbitClient(undefined, log.child({ module: 'fitbit' }));
      if (!client.hasTokens()) return EMPTY_BRIDGE;
      const res = await client.fetchDaysInRange(start, end);
      // Flatten the per-source bridge result into daily rows + sleep sessions.
      const daily: Record<DeviceSource, FitbitDailyRow[]> = { fitbit: [], whoop: [], oura: [], apple: [] };
      const sleepSessions: SleepSession[] = [];
      for (const src of bridgeSources) {
        const sub = res[src];
        if (!sub) continue;
        daily[src] = sub.daily;
        for (const s of sub.sleepSessions) sleepSessions.push(toSleepSession(s, src));
      }
      return { daily, sleepSessions, workouts: [] as Workout[] };
    });

    // WHOOP native client — only when the bridge does NOT own whoop and creds exist.
    const whoop = await pullSource('whoop', db, log, async () => {
      if (bridgeSources.has('whoop') || !process.env.WHOOP_CLIENT_ID) return EMPTY_WHOOP;
      const client = new WhoopClient(undefined, log.child({ module: 'whoop' }));
      return client.fetchDaysInRange(start, end);
    });

    // Oura native client — only when the bridge does NOT own oura and PAT exists.
    const oura = await pullSource('oura', db, log, async () => {
      if (bridgeSources.has('oura') || !process.env.OURA_PAT) return EMPTY_OURA;
      const client = new OuraClient(undefined, log.child({ module: 'oura' }));
      return client.fetchDaysInRange(start, end);
    });

    // Apple — only via the legacy XML export parser when the bridge does NOT
    // own apple. (The REST /api/ingest/apple route is the other native path; it
    // writes directly and is independent of this scheduled sync.)
    const apple = await pullSource('apple', db, log, async () => {
      if (bridgeSources.has('apple')) return EMPTY_APPLE;
      const path = process.env.APPLE_HEALTH_EXPORT_PATH;
      if (!path || opts.includeApple === false) return EMPTY_APPLE;
      const parser = new AppleHealthParser(log.child({ module: 'apple' }));
      try {
        return await parser.parseFile(path, start, end);
      } catch (err) {
        log.warn({ err }, 'apple health parse skipped');
        return EMPTY_APPLE;
      }
    });

    // Per-device daily rows: bridge owns its sources; native fills the rest.
    // For whoop/oura/apple the bridge emits FitbitDailyRow-shaped rows, so map
    // them into the target device's row shape. The bridge and native paths are
    // mutually exclusive per device, so exactly one side is non-empty.
    const daily = normalizeAndUpsert(db, {
      fitbit: bridge.daily.fitbit,
      whoop: bridgeSources.has('whoop') ? bridge.daily.whoop.map(toWhoopRow) : whoop.daily,
      oura: bridgeSources.has('oura') ? bridge.daily.oura.map(toOuraRow) : oura.daily,
      apple: bridgeSources.has('apple') ? bridge.daily.apple.map(toAppleRow) : apple.daily,
    });

    const { sleepUpserted, workoutUpserted } = writeSessions(db, [
      ...bridge.sleepSessions,
      ...whoop.sleepSessions,
      ...oura.sleepSessions,
      ...apple.sleepSessions,
    ], [
      ...whoop.workouts,
      ...oura.workouts,
      ...apple.workouts,
    ]);

    const result: SyncResult = {
      dates: daily.dates,
      dailyUpserted: daily.upserted,
      sleepUpserted,
      workoutUpserted,
    };
    log.info(result, 'sync complete');
    return result;
  } finally {
    running = false;
  }
}

function writeSessions(
  db: Database,
  sleepSessions: SleepSession[],
  workouts: Workout[],
): { sleepUpserted: number; workoutUpserted: number } {
  let sleepUpserted = 0;
  let workoutUpserted = 0;
  db.transaction(() => {
    for (const s of sleepSessions) {
      // Workouts/sleep require a parent daily_summary row (FK). Create a stub if missing.
      ensureDailyStub(db, s.date);
      queries.sleep.upsert(db, s);
      sleepUpserted += 1;
    }
    for (const w of workouts) {
      ensureDailyStub(db, w.date);
      queries.workouts.upsert(db, w);
      workoutUpserted += 1;
    }
  })();
  return { sleepUpserted, workoutUpserted };
}

function ensureDailyStub(db: Database, date: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO daily_summary (date, devices_active) VALUES (?, 0)`,
  ).run(date);
}

// --- Bridge → shared shape adapters --------------------------------------

/** A FitbitSleepRow (bridge) → the shared SleepSession, tagged with its source. */
function toSleepSession(s: FitbitSleepRow, source: DeviceSource): SleepSession {
  return {
    id: s.id,
    date: s.date,
    source,
    startTime: s.startTime,
    endTime: s.endTime,
    isNap: false,
    totalMinutes: s.totalMinutes ?? 0,
    deepMinutes: s.deepMinutes ?? 0,
    remMinutes: s.remMinutes ?? 0,
    lightMinutes: s.lightMinutes ?? 0,
    awakeMinutes: s.awakeMinutes ?? 0,
    sleepScore: s.sleepScore,
    avgHr: null,
    avgHrv: null,
    avgRespiratoryRate: s.avgRespiratoryRate,
    spo2: s.spo2,
  };
}

/**
 * Bridge WHOOP/Oura/Apple data arrives in the generic FitbitDailyRow shape
 * (the Google Health API exposes the same metric fields regardless of which
 * physical device wrote them). Map the common vitals into each device's row so
 * the normalizer writes them to the correct `{device}_*` columns. Metrics the
 * bridge doesn't carry for that device (e.g. WHOOP strain) stay null.
 */
function toWhoopRow(r: FitbitDailyRow): WhoopDailyRow {
  return {
    date: r.date,
    recoveryScore: null,
    hrv: r.hrv,
    rhr: r.rhr,
    strain: null,
    calories: r.caloriesBurned,
    spo2: r.spo2,
    skinTempDelta: r.skinTempDelta,
    sleepScore: r.sleepScore,
    sleepHours: r.sleepHours,
    deepHours: r.deepHours,
    remHours: r.remHours,
    lightHours: r.lightHours,
  };
}

function toOuraRow(r: FitbitDailyRow): OuraDailyRow {
  return {
    date: r.date,
    readinessScore: null,
    sleepScore: r.sleepScore,
    activityScore: null,
    hrv: r.hrv,
    rhr: r.rhr,
    tempDeviation: r.skinTempDelta,
    spo2: r.spo2,
    respiratoryRate: r.respiratoryRate,
    sleepHours: r.sleepHours,
    deepHours: r.deepHours,
    remHours: r.remHours,
    lightHours: r.lightHours,
    steps: r.steps,
    activeCalories: r.caloriesBurned,
    totalCalories: null,
    stressHighMinutes: null,
  };
}

function toAppleRow(r: FitbitDailyRow): AppleDailyRow {
  return {
    date: r.date,
    hrv: r.hrv,
    rhr: r.rhr,
    spo2: r.spo2,
    vo2max: null,
    respiratoryRate: r.respiratoryRate,
    steps: r.steps,
    activeCalories: r.caloriesBurned,
    basalCalories: null,
    distanceKm: null,
    exerciseMinutes: null,
    standHours: null,
  };
}

/** Wrap a per-device pull with sync_log bookkeeping and error containment. */
async function pullSource<
  T extends {
    daily: unknown[] | Record<string, unknown[]>;
    sleepSessions: unknown[];
    workouts: unknown[];
  },
>(
  source: 'whoop' | 'oura' | 'apple' | 'fitbit',
  db: Database,
  log: FastifyBaseLogger,
  fn: () => Promise<T>,
): Promise<T> {
  const id = queries.syncLog.start(db, source);
  try {
    const result = await fn();
    const dailyCount = Array.isArray(result.daily)
      ? result.daily.length
      : Object.values(result.daily).reduce((n, arr) => n + arr.length, 0);
    const records = dailyCount + result.sleepSessions.length + result.workouts.length;
    queries.syncLog.finish(db, id, { ok: true, records });
    return result;
  } catch (err) {
    const message = (err as Error).message;
    log.error({ source, err }, 'source sync failed');
    queries.syncLog.finish(db, id, { ok: false, message });
    // Bridge ('fitbit' sync slot) needs a per-source Record; the native slots
    // need an array. Return the matching empty so consumers stay type-safe.
    const empty =
      source === 'fitbit'
        ? EMPTY_BRIDGE
        : { daily: [], sleepSessions: [], workouts: [] };
    return empty as unknown as T;
  }
}

// CLI entry: `tsx src/jobs/sync.ts --once` for one-shot manual pulls.
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain && process.argv.includes('--once')) {
  (async () => {
    const { config: loadEnv } = await import('dotenv');
    const { dirname, resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '.env') });
    const { default: pino } = await import('pino');
    const log = pino({ level: process.env.LOG_LEVEL ?? 'info' });
    const db = openDb();
    try {
      const days = Number(process.argv[process.argv.indexOf('--days') + 1]) || 7;
      await runSync(db, log as unknown as FastifyBaseLogger, { rangeDays: days });
    } finally {
      db.close();
    }
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
