import type { Database } from 'better-sqlite3';
import { queries } from '@vcc/db';

export function getHabitStreaks(db: Database) {
  return { streaks: queries.habits.streaks(db) };
}
