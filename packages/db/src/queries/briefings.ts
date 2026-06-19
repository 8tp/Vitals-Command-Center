import type { Database } from 'better-sqlite3';
import type { BriefingRecord, BriefingType } from '@vcc/shared';
import { randomUUID } from 'node:crypto';

interface BriefingRow {
  id: string;
  date: string;
  type: BriefingType;
  content: string;
  metrics_snapshot: string | null;
  created_at: string;
}

function toBriefing(r: BriefingRow): BriefingRecord {
  return {
    id: r.id,
    date: r.date,
    type: r.type,
    content: r.content,
    metricsSnapshot: r.metrics_snapshot ? JSON.parse(r.metrics_snapshot) : null,
    createdAt: r.created_at,
  };
}

export function latestOfType(db: Database, type: BriefingType, date?: string): BriefingRecord | null {
  const sql = date
    ? 'SELECT * FROM briefings WHERE type = ? AND date = ? ORDER BY created_at DESC LIMIT 1'
    : 'SELECT * FROM briefings WHERE type = ? ORDER BY created_at DESC LIMIT 1';
  const row = (date
    ? db.prepare(sql).get(type, date)
    : db.prepare(sql).get(type)) as BriefingRow | undefined;
  return row ? toBriefing(row) : null;
}

/**
 * Most recent briefing of `type` STRICTLY BEFORE `date` (date < date), newest
 * first. Used for "previous briefing" continuity context — callers pass TODAY
 * and get the last brief that actually exists (yesterday, or older if a day was
 * skipped), instead of nothing.
 */
export function latestBefore(db: Database, type: BriefingType, date: string): BriefingRecord | null {
  const row = db
    .prepare(
      'SELECT * FROM briefings WHERE type = ? AND date < ? ORDER BY date DESC, created_at DESC LIMIT 1',
    )
    .get(type, date) as BriefingRow | undefined;
  return row ? toBriefing(row) : null;
}

export function store(
  db: Database,
  input: Omit<BriefingRecord, 'id' | 'createdAt'>,
): BriefingRecord {
  const id = `brief_${randomUUID()}`;
  db.prepare(
    `INSERT INTO briefings (id, date, type, content, metrics_snapshot, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
  ).run(
    id,
    input.date,
    input.type,
    input.content,
    input.metricsSnapshot ? JSON.stringify(input.metricsSnapshot) : null,
  );
  const row = db.prepare('SELECT * FROM briefings WHERE id = ?').get(id) as BriefingRow;
  return toBriefing(row);
}
