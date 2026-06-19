import type { Database } from 'better-sqlite3';
import { queries } from '@vcc/db';

export function getWorkouts(db: Database, args: Record<string, unknown>) {
  const days = Number(args.days ?? 14);
  const sport = args.sport as string | undefined;
  const endIso = new Date().toISOString().slice(0, 10);
  const startIso = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  let rows = queries.workouts.list(db, startIso, endIso);
  if (sport) rows = rows.filter((w) => w.sport.toLowerCase() === sport.toLowerCase());
  return { start: startIso, end: endIso, workouts: rows };
}
