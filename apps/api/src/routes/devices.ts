import type { FastifyPluginAsync } from 'fastify';
import { ok } from '../lib/envelope.js';
import { todayIso } from '../lib/range.js';
import { computeIntegrationStatuses } from '../lib/integrationStatus.js';

/**
 * Device status for the header cluster.
 *
 * Only ENABLED wearables are reported. A wearable the user switched off in
 * Settings is simply omitted — it never reads as "disconnected", which is the
 * point: dormant WHOOP/Oura shouldn't look offline when you're just not wearing
 * them. Strava is an activity integration, not a device, so it's excluded here;
 * GET /api/settings returns the full integration list.
 *
 * "connected" = integration is wired up and producing data, not "today's row is
 * populated yet" (a cycle that started tonight has no row until morning).
 */
export const registerDeviceRoutes: FastifyPluginAsync = async (app) => {
  app.get('/devices/status', async (req) => {
    const statuses = computeIntegrationStatuses(req.server.db)
      .filter((s) => s.kind === 'wearable' && s.enabled)
      .map((s) => ({
        source: s.id,
        connected: s.connected,
        hasTodayData: s.hasTodayData,
        lastSeen: s.lastSeen,
        lastSyncOk: s.lastSyncOk,
        message: s.message,
      }));

    return ok({ date: todayIso(), statuses });
  });
};
