import type { FastifyPluginAsync } from 'fastify';
import { queries } from '@vcc/db';
import { DEVICE_SOURCES, type DeviceSource } from '@vcc/shared';
import { ok } from '../lib/envelope.js';
import { addDaysIso, todayIso } from '../lib/range.js';

/**
 * "connected" = integration is wired up and working, not "today's row is
 * populated yet". A WHOOP cycle that just started tonight won't produce a
 * daily_summary row for today until morning — but the device is still connected.
 *
 * Signals, in order of trust:
 *   1. Any successful sync_log entry for this source in the last 24h.
 *   2. Any daily_summary row in the last 7 days with this device flagged.
 *   3. Fallback: false with the last-known sync message.
 */
export const registerDeviceRoutes: FastifyPluginAsync = async (app) => {
  app.get('/devices/status', async (req) => {
    const today = todayIso();
    const sevenDaysAgo = addDaysIso(today, -6);
    const todayRow = queries.dailySummary.get(req.server.db, today);
    const recentRows = queries.dailySummary.list(req.server.db, sevenDaysAgo, today);
    const latestLogs = queries.syncLog.latestPerSource(req.server.db);

    const statuses = DEVICE_SOURCES.map((source: DeviceSource) => {
      const log = latestLogs[source];
      const hasTodayData = todayRow?.devices[source] ?? false;
      const hasRecentData = recentRows.some((r) => r.devices[source]);
      const recentOkSync =
        !!log?.ok && !!log.finishedAt && Date.parse(log.finishedAt) > Date.now() - 24 * 3600_000;
      const recentSyncProducedRows =
        recentOkSync && typeof log?.recordsUpserted === 'number' && log.recordsUpserted > 0;

      // A sync that "succeeded" but returned 0 records isn't really connected —
      // it just means the code path ran. Treat that as not connected unless we
      // have recent actual rows in daily_summary.
      const connected = hasRecentData || recentSyncProducedRows;

      let message: string | null = null;
      if (!connected) {
        message = log?.message ?? 'not connected';
      } else if (!hasTodayData) {
        message = "connected · today's cycle in progress";
      }

      return {
        source,
        connected,
        hasTodayData,
        lastSeen: log?.finishedAt ?? null,
        lastSyncOk: log?.ok ?? false,
        message,
      };
    });

    return ok({ date: today, statuses });
  });
};
