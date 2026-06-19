import type { Database } from 'better-sqlite3';
import { queries } from '@vcc/db';

export function logHabitEntry(db: Database, args: Record<string, unknown>) {
  const name = String(args.habit_name ?? '');
  const value = String(args.value ?? '');
  const date = (args.date as string) ?? new Date().toISOString().slice(0, 10);
  const habit = queries.habits.byName(db, name);
  if (!habit) return { error: `no habit named "${name}"` };
  const log = queries.habits.logEntry(db, habit.id, date, value);
  return { logged: log, habit };
}
