import type { Database } from 'better-sqlite3';
import { queries } from '@vcc/db';

export function getSleepDetails(db: Database, args: Record<string, unknown>) {
  const date = (args.date as string) ?? new Date().toISOString().slice(0, 10);
  const summary = queries.dailySummary.get(db, date);
  const sessions = queries.sleep.forDate(db, date);
  return { date, summary, sessions };
}
