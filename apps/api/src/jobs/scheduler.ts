import cron from 'node-cron';
import type { FastifyBaseLogger } from 'fastify';
import { openDb } from '@vcc/db';
import { runSync } from './sync.js';
import { runDailyBriefing } from './daily-briefing.js';
import { runWeeklyReport } from './weekly-report.js';

/**
 * Start node-cron schedules. Each handler opens its own DB handle via openDb
 * (which returns the singleton if already opened) and logs into a child logger.
 */
export function startSchedulers(log: FastifyBaseLogger): void {
  const syncCron = process.env.SYNC_CRON ?? '0 */4 * * *';
  const briefingCron = process.env.BRIEFING_CRON ?? '0 6 * * *';
  const weeklyCron = process.env.WEEKLY_REPORT_CRON ?? '0 8 * * 0';

  if (cron.validate(syncCron)) {
    cron.schedule(syncCron, async () => {
      try {
        await runSync(openDb(), log.child({ job: 'sync' }));
      } catch (err) {
        log.error({ err }, 'scheduled sync failed');
      }
    });
    log.info({ syncCron }, 'scheduled data sync');
  }

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
