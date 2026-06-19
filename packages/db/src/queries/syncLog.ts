import type { Database } from 'better-sqlite3';

export interface SyncLogEntry {
  id: number;
  source: string;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean;
  message: string | null;
  recordsUpserted: number | null;
}

interface SyncLogRow {
  id: number;
  source: string;
  started_at: string;
  finished_at: string | null;
  ok: number;
  message: string | null;
  records_upserted: number | null;
}

function toEntry(r: SyncLogRow): SyncLogEntry {
  return {
    id: r.id,
    source: r.source,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    ok: !!r.ok,
    message: r.message,
    recordsUpserted: r.records_upserted,
  };
}

export function start(db: Database, source: string): number {
  const info = db
    .prepare('INSERT INTO sync_log (source, started_at) VALUES (?, datetime(\'now\'))')
    .run(source);
  return Number(info.lastInsertRowid);
}

export function finish(
  db: Database,
  id: number,
  result: { ok: boolean; message?: string; records?: number },
): void {
  db.prepare(
    `UPDATE sync_log SET finished_at = datetime('now'), ok = ?, message = ?, records_upserted = ?
     WHERE id = ?`,
  ).run(result.ok ? 1 : 0, result.message ?? null, result.records ?? null, id);
}

export function latestPerSource(db: Database): Record<string, SyncLogEntry> {
  const rows = db
    .prepare(
      `SELECT s.* FROM sync_log s
       INNER JOIN (SELECT source, MAX(id) AS max_id FROM sync_log GROUP BY source) m
       ON s.id = m.max_id`,
    )
    .all() as SyncLogRow[];
  return Object.fromEntries(rows.map((r) => [r.source, toEntry(r)]));
}
