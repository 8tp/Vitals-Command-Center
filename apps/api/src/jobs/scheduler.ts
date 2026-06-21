import cron from 'node-cron';
import type { FastifyBaseLogger } from 'fastify';
import type { Database } from 'better-sqlite3';
import { openDb, queries } from '@vcc/db';
import { runSync, isSyncRunning } from './sync.js';
import { runDailyBriefing } from './daily-briefing.js';
import { runWeeklyReport } from './weekly-report.js';

/**
 * Start node-cron schedules. Each handler opens its own DB handle via openDb
 * (which returns the singleton if already opened) and logs into a child logger.
 *
 * Data sync is no longer a single hardcoded SYNC_CRON. Instead a 1-minute
 * heartbeat re-reads the live settings each tick and syncs when due, honoring:
 *   - the master `autoSyncEnabled` app-setting (off → never auto-syncs), and
 *   - each enabled integration's `autoSync` + `syncIntervalMinutes`.
 * Re-reading every tick means Settings-modal changes take effect immediately,
 * and "due" is derived from the persisted last-sync time so restarts are safe.
 */
export function startSchedulers(log: FastifyBaseLogger): void {
  const briefingCron = process.env.BRIEFING_CRON ?? '0 6 * * *';
  const weeklyCron = process.env.WEEKLY_REPORT_CRON ?? '0 8 * * 0';

  // Settings-driven auto-sync heartbeat.
  cron.schedule('* * * * *', async () => {
    try {
      await maybeAutoSync(openDb(), log.child({ job: 'auto-sync' }));
    } catch (err) {
      log.error({ err }, 'auto-sync tick failed');
    }
  });
  log.info('scheduled settings-driven auto-sync (1-min heartbeat)');

  if (cron.validate(briefingCron)) {
    cron.schedule(briefingCron, async () => {
      try {
        await runDailyBriefing(openDb(), log.child({ job: 'daily-briefing' }));
      } catch (err) {
        log.error({ err }, 'scheduled briefing failed');
      }
    });
    log.info({ briefingCron }, 'scheduled daily briefing');
  }

  if (cron.validate(weeklyCron)) {
    cron.schedule(weeklyCron, async () => {
      try {
        await runWeeklyReport(openDb(), log.child({ job: 'weekly-report' }));
      } catch (err) {
        log.error({ err }, 'scheduled weekly report failed');
      }
    });
    log.info({ weeklyCron }, 'scheduled weekly report');
  }
}

/**
 * Decide whether a sync is due and run it. A full `runSync` covers every
 * source, so the cadence is driven by the *most frequent* enabled auto-sync
 * integration; "due" compares now against the last finished sync. No-op when
 * the master toggle is off, nothing is eligible, or a sync is already running.
 */
async function maybeAutoSync(db: Database, log: FastifyBaseLogger): Promise<void> {
  const masterOn = queries.settings.getAppSettingJson<boolean>(db, 'autoSyncEnabled', true);
  if (!masterOn) return;

  const active = queries.settings
    .listIntegrationSettings(db)
    .filter((s) => s.enabled && s.autoSync);
  if (active.length === 0) return;

  const minIntervalMin = Math.min(...active.map((s) => s.syncIntervalMinutes));

  const perSource = queries.syncLog.latestPerSource(db);
  const lastFinished = Object.values(perSource)
    .map((s) => s.finishedAt)
    .filter((v): v is string => !!v)
    .map((v) => Date.parse(v))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
    .pop();

  const dueAt = lastFinished != null ? lastFinished + minIntervalMin * 60_000 : 0;
  if (Date.now() < dueAt) return;
  if (isSyncRunning()) return;

  log.info(
    { everyMinutes: minIntervalMin, sources: active.map((s) => s.id) },
    'auto-sync due → running',
  );
  await runSync(db, log);
}
