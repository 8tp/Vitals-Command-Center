import type { Database } from 'better-sqlite3';
import { queries } from '@vcc/db';

export function getDailySummary(db: Database, args: Record<string, unknown>) {
  const date = (args.date as string) ?? new Date().toISOString().slice(0, 10);
  const row = queries.dailySummary.get(db, date);
  if (!row) return { date, found: false, message: 'No summary recorded for this date.' };
  return row;
}
