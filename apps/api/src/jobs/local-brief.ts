import type { Database } from 'better-sqlite3';
import type { FastifyBaseLogger } from 'fastify';
import { queries, openDb } from '@vcc/db';
import { todayIso } from '../lib/range.js';
import { generateLocalBrief } from '../services/localBrief.js';

/** Generate today's brief via the on-box CLI agent and store it as a 'daily' briefing. */
export async function runLocalBrief(
  db: Database,
  log: FastifyBaseLogger,
  date = todayIso(),
): Promise<{ date: string; chars: number }> {
  // Respect the app-level AI switches: the master gate and the auto-generate
  // toggle. Manual generation (the dashboard Regenerate button) goes through the
  // route's generateLocalBrief directly and is unaffected by this guard.
  const aiEnabled = queries.settings.getAppSettingJson<boolean>(db, 'aiEnabled', true);
  const autoSummary = queries.settings.getAppSettingJson<boolean>(db, 'aiAutoSummary', true);
  if (!aiEnabled || !autoSummary) {
    log.info({ date, aiEnabled, autoSummary }, 'local brief: auto-generate disabled, skipping');
    return { date, chars: 0 };
  }
  log.info({ date }, 'local brief starting');
  const content = await generateLocalBrief(db, date);
  queries.briefings.store(db, { date, type: 'daily', content, metricsSnapshot: null });
  log.info({ date, chars: content.length }, 'local brief stored');
  return { date, chars: content.length };
}

// CLI: `tsx src/jobs/local-brief.ts --once [--date YYYY-MM-DD]`
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain && process.argv.includes('--once')) {
  (async () => {
    const { config: loadEnv } = await import('dotenv');
    const { dirname, resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '.env') });
    const { default: pino } = await import('pino');
    const log = pino({ level: process.env.LOG_LEVEL ?? 'info' });
    const db = openDb();
    try {
      const di = process.argv.indexOf('--date');
      const date = di >= 0 ? process.argv[di + 1] : todayIso();
      const res = await runLocalBrief(db, log as unknown as FastifyBaseLogger, date);
      log.info(res, 'done');
    } finally {
      db.close();
    }
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
