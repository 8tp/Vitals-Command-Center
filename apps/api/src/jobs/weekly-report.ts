import type { Database } from 'better-sqlite3';
import type { FastifyBaseLogger } from 'fastify';
import { queries } from '@vcc/db';
import { addDaysIso, todayIso } from '../lib/range.js';

export async function runWeeklyReport(db: Database, log: FastifyBaseLogger): Promise<void> {
  const end = todayIso();
  const start = addDaysIso(end, -6);
  const week = queries.dailySummary.list(db, start, end);
  log.info({ start, end, rows: week.length }, 'weekly report: assembling');
  // Phase 3 fills this in with trend + correlation output. For now stash a placeholder.
  queries.briefings.store(db, {
    date: end,
    type: 'weekly',
    content: `Weekly report stub ${start}..${end} (${week.length} days).`,
    metricsSnapshot: { start, end, week },
  });
}
