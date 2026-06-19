import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export type ContextType = 'calendar' | 'weather' | 'location' | 'screen_time' | 'nutrition';

export interface ContextEntry<T = unknown> {
  id: string;
  date: string;
  type: ContextType;
  data: T;
}

interface ContextRow {
  id: string;
  date: string;
  type: ContextType;
  data: string;
}

export function upsert<T>(db: Database, date: string, type: ContextType, data: T): ContextEntry<T> {
  // one row per (date,type)
  const existing = db
    .prepare('SELECT id FROM context WHERE date = ? AND type = ?')
    .get(date, type) as { id: string } | undefined;
  const id = existing?.id ?? `ctx_${randomUUID()}`;
  db.prepare(
    `INSERT INTO context (id, date, type, data) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
  ).run(id, date, type, JSON.stringify(data));
  return { id, date, type, data };
}

export function get<T = unknown>(db: Database, date: string, type: ContextType): ContextEntry<T> | null {
  const row = db
    .prepare('SELECT * FROM context WHERE date = ? AND type = ?')
    .get(date, type) as ContextRow | undefined;
  return row ? { id: row.id, date: row.date, type: row.type, data: JSON.parse(row.data) as T } : null;
}
