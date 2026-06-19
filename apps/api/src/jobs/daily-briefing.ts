import type { Database } from 'better-sqlite3';
import type { FastifyBaseLogger } from 'fastify';
import { queries } from '@vcc/db';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { todayIso } from '../lib/range.js';
import { generateDailyBriefing, isClaudeApiConfigured } from '../services/claude.js';

export async function runDailyBriefing(db: Database, log: FastifyBaseLogger, date = todayIso()): Promise<void> {
  if (!isClaudeApiConfigured()) {
    // MCP path: Claude Desktop / claude.ai generates briefings on-demand via
    // get_full_context + save_briefing. No server-side generation needed.
    log.debug('daily briefing: ANTHROPIC_API_KEY not set, skipping (MCP path is in use)');
    return;
  }
  log.info({ date }, 'daily briefing: generating');
  const summary = queries.dailySummary.get(db, date);
  if (!summary) {
    log.warn('daily briefing: no summary for date, skipping');
    return;
  }
  const content = await generateDailyBriefing(db, date);
  queries.briefings.store(db, {
    date,
    type: 'daily',
    content,
    metricsSnapshot: summary,
  });

  const dir = process.env.BRIEFINGS_DIR ?? './data/briefings';
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${date}.md`), content, 'utf8');
  log.info({ date, bytes: content.length }, 'daily briefing: stored');
}
