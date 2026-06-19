import type { Database } from 'better-sqlite3';
import type { Habit, HabitCategory, HabitLog, HabitStreak, HabitType } from '@vcc/shared';
import { randomUUID } from 'node:crypto';

interface HabitRow {
  id: string;
  name: string;
  category: HabitCategory;
  type: HabitType;
  unit: string | null;
  target_value: number | null;
  active: number;
  sort_order: number;
  created_at: string;
}

function toHabit(r: HabitRow): Habit {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    type: r.type,
    unit: r.unit,
    targetValue: r.target_value,
    active: !!r.active,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  };
}

export function list(db: Database, includeInactive = false): Habit[] {
  const sql = includeInactive
    ? 'SELECT * FROM habits ORDER BY sort_order ASC'
    : 'SELECT * FROM habits WHERE active = 1 ORDER BY sort_order ASC';
  return (db.prepare(sql).all() as HabitRow[]).map(toHabit);
}

export function byId(db: Database, id: string): Habit | null {
  const row = db.prepare('SELECT * FROM habits WHERE id = ?').get(id) as HabitRow | undefined;
  return row ? toHabit(row) : null;
}

export function byName(db: Database, name: string): Habit | null {
  const row = db.prepare('SELECT * FROM habits WHERE LOWER(name) = LOWER(?)').get(name) as
    | HabitRow
    | undefined;
  return row ? toHabit(row) : null;
}

export function create(
  db: Database,
  h: Omit<Habit, 'id' | 'active' | 'createdAt'> & { id?: string },
): Habit {
  const id = h.id ?? `habit_${randomUUID()}`;
  db.prepare(
    `INSERT INTO habits (id, name, category, type, unit, target_value, active, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, datetime('now'))`,
  ).run(id, h.name, h.category, h.type, h.unit, h.targetValue, h.sortOrder);
  return byId(db, id)!;
}

export function update(db: Database, id: string, patch: Partial<Habit>): Habit | null {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (patch.name !== undefined) { fields.push('name = ?'); values.push(patch.name); }
  if (patch.category !== undefined) { fields.push('category = ?'); values.push(patch.category); }
  if (patch.type !== undefined) { fields.push('type = ?'); values.push(patch.type); }
  if (patch.unit !== undefined) { fields.push('unit = ?'); values.push(patch.unit); }
  if (patch.targetValue !== undefined) { fields.push('target_value = ?'); values.push(patch.targetValue); }
  if (patch.active !== undefined) { fields.push('active = ?'); values.push(patch.active ? 1 : 0); }
  if (patch.sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(patch.sortOrder); }
  if (fields.length === 0) return byId(db, id);
  values.push(id);
  db.prepare(`UPDATE habits SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return byId(db, id);
}

export function softDelete(db: Database, id: string): void {
  db.prepare('UPDATE habits SET active = 0 WHERE id = ?').run(id);
}

// --- logs -----------------------------------------------------------------

interface LogRow {
  id: string;
  habit_id: string;
  date: string;
  value: string;
  logged_at: string;
}

function toLog(r: LogRow): HabitLog {
  return { id: r.id, habitId: r.habit_id, date: r.date, value: r.value, loggedAt: r.logged_at };
}

export function listLogs(db: Database, start: string, end: string): HabitLog[] {
  const rows = db
    .prepare('SELECT * FROM habit_logs WHERE date BETWEEN ? AND ? ORDER BY date DESC, logged_at DESC')
    .all(start, end) as LogRow[];
  return rows.map(toLog);
}

export function logEntry(db: Database, habitId: string, date: string, value: string): HabitLog {
  const id = `habitlog_${randomUUID()}`;
  db.prepare(
    `INSERT INTO habit_logs (id, habit_id, date, value, logged_at) VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(habit_id, date) DO UPDATE SET value = excluded.value, logged_at = excluded.logged_at`,
  ).run(id, habitId, date, value);
  const row = db
    .prepare('SELECT * FROM habit_logs WHERE habit_id = ? AND date = ?')
    .get(habitId, date) as LogRow;
  return toLog(row);
}

export function streaks(db: Database): HabitStreak[] {
  const habits = list(db);
  return habits.map((h) => {
    const rows = db
      .prepare('SELECT date FROM habit_logs WHERE habit_id = ? ORDER BY date DESC')
      .all(h.id) as Array<{ date: string }>;
    const dates = new Set(rows.map((r) => r.date));
    let current = 0;
    const today = new Date().toISOString().slice(0, 10);
    let cursor = new Date(today);
    while (dates.has(cursor.toISOString().slice(0, 10))) {
      current += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    let longest = 0;
    let run = 0;
    let prev: string | null = null;
    const sorted = [...dates].sort();
    for (const d of sorted) {
      if (prev && isConsecutive(prev, d)) run += 1;
      else run = 1;
      longest = Math.max(longest, run);
      prev = d;
    }
    return {
      habitId: h.id,
      habitName: h.name,
      currentStreak: current,
      longestStreak: longest,
      lastLoggedDate: rows[0]?.date ?? null,
    };
  });
}

function isConsecutive(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (db.getTime() - da.getTime()) / 86400000 === 1;
}
