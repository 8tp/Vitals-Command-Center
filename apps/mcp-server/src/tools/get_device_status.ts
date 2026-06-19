import type { Database } from 'better-sqlite3';
import { queries } from '@vcc/db';

export function getDeviceStatus(db: Database) {
  const today = new Date().toISOString().slice(0, 10);
  const row = queries.dailySummary.get(db, today);
  const latest = queries.syncLog.latestPerSource(db);
  return {
    date: today,
    hasFitbit: row?.devices?.fitbit ?? false, // primary device as of 2026-06
    hasWhoop: row?.devices?.whoop ?? false,
    hasOura: row?.devices?.oura ?? false,
    hasApple: row?.devices?.apple ?? false,
    lastSyncs: latest,
  };
}
