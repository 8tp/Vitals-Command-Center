import type { Database } from 'better-sqlite3';
import { queries } from '@vcc/db';
import {
  INTEGRATION_IDS,
  INTEGRATIONS,
  type DeviceSource,
  type IntegrationId,
  type IntegrationMeta,
} from '@vcc/shared';
import { addDaysIso, todayIso } from './range.js';

/** A fully-resolved integration: registry metadata + user settings + live
 * connectivity. This is the one source of truth for both the Settings screen
 * and the header device cluster. */
export interface IntegrationStatus extends IntegrationMeta {
  enabled: boolean;
  autoSync: boolean;
  syncIntervalMinutes: number;
  /** Credentials are present in the environment (OAuth app / PAT / ingest secret). */
  configured: boolean;
  /** Producing data recently (or a recent sync upserted rows). */
  connected: boolean;
  hasTodayData: boolean;
  lastSeen: string | null;
  lastSyncOk: boolean;
  message: string | null;
}

function isConfigured(id: IntegrationId): boolean {
  switch (id) {
    case 'fitbit':
      return !!process.env.GOOGLE_CLIENT_ID;
    case 'apple':
      return !!process.env.APPLE_INGEST_SECRET || !!process.env.APPLE_HEALTH_EXPORT_PATH;
    case 'strava':
      return !!process.env.STRAVA_CLIENT_ID;
    case 'whoop':
      return !!process.env.WHOOP_CLIENT_ID;
    case 'oura':
      return !!process.env.OURA_PAT;
    default:
      return false;
  }
}

export function computeIntegrationStatuses(db: Database): IntegrationStatus[] {
  const today = todayIso();
  const weekAgo = addDaysIso(today, -6);
  const todayRow = queries.dailySummary.get(db, today);
  const recentRows = queries.dailySummary.list(db, weekAgo, today);
  const latestLogs = queries.syncLog.latestPerSource(db);
  const settings = new Map(
    queries.settings.listIntegrationSettings(db).map((s) => [s.id, s]),
  );
  // Strava lives in the workouts table, not daily_summary.
  const recentStravaWorkouts = queries.workouts
    .list(db, weekAgo, today)
    .filter((w) => w.source === 'strava');

  return INTEGRATION_IDS.map((id): IntegrationStatus => {
    const meta = INTEGRATIONS[id];
    const setting = settings.get(id) ?? {
      enabled: meta.defaultEnabled,
      autoSync: meta.defaultEnabled,
      syncIntervalMinutes: meta.defaultSyncIntervalMinutes,
    };
    const log = latestLogs[id];

    let hasTodayData: boolean;
    let hasRecentData: boolean;
    if (id === 'strava') {
      hasTodayData = recentStravaWorkouts.some((w) => w.date === today);
      hasRecentData = recentStravaWorkouts.length > 0;
    } else {
      const dev = id as DeviceSource;
      hasTodayData = todayRow?.devices[dev] ?? false;
      hasRecentData = recentRows.some((r) => r.devices[dev]);
    }

    const recentOkSync =
      !!log?.ok && !!log.finishedAt && Date.parse(log.finishedAt) > Date.now() - 24 * 3600_000;
    const recentSyncProducedRows =
      recentOkSync && typeof log?.recordsUpserted === 'number' && log.recordsUpserted > 0;
    const connected = hasRecentData || recentSyncProducedRows;
    const configured = isConfigured(id);

    let message: string | null = null;
    if (!configured) message = meta.connectHint;
    else if (!connected) message = log?.message ?? 'not connected';
    else if (!hasTodayData) message = "connected · today's data syncing";

    return {
      ...meta,
      enabled: setting.enabled,
      autoSync: setting.autoSync,
      syncIntervalMinutes: setting.syncIntervalMinutes,
      configured,
      connected,
      hasTodayData,
      lastSeen: log?.finishedAt ?? null,
      lastSyncOk: log?.ok ?? false,
      message,
    };
  });
}
