import type { Database } from 'better-sqlite3';
import { queries } from '@vcc/db';

export function getBriefing(db: Database, args: Record<string, unknown>) {
  const date = (args.date as string) ?? new Date().toISOString().slice(0, 10);
  const briefing = queries.briefings.latestOfType(db, 'daily', date);
  if (!briefing) {
    return {
      date,
      generated: false,
      note: "No briefing stored. Ask the API's /api/insights endpoint or wait for the 06:00 cron.",
    };
  }
  return briefing;
}
