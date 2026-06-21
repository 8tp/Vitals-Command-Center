import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { queries } from '@vcc/db';
import { INTEGRATION_IDS, type IntegrationId } from '@vcc/shared';
import { ok } from '../lib/envelope.js';
import { computeIntegrationStatuses } from '../lib/integrationStatus.js';

const ID_VALUES = [...INTEGRATION_IDS] as [string, ...string[]];

const idParam = z.object({ id: z.enum(ID_VALUES) });

const integrationPatch = z.object({
  enabled: z.boolean().optional(),
  autoSync: z.boolean().optional(),
  syncIntervalMinutes: z.number().int().min(15).max(1440).optional(),
});

const appPatch = z.object({
  autoSyncEnabled: z.boolean().optional(),
});

function buildSettings(db: import('better-sqlite3').Database) {
  return {
    app: {
      autoSyncEnabled: queries.settings.getAppSettingJson<boolean>(db, 'autoSyncEnabled', true),
    },
    integrations: computeIntegrationStatuses(db),
  };
}

/**
 * Settings surface for the web Settings modal:
 *   GET   /api/settings                       → app prefs + full integration list
 *   PATCH /api/settings/integrations/:id      → toggle enable / auto-sync / cadence
 *   PATCH /api/settings/app                   → app-level prefs (master auto-sync)
 *
 * Every mutation returns the full settings payload so the client can replace
 * its state without a second round-trip.
 */
export const registerSettingsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/settings', async (req) => ok(buildSettings(req.server.db)));

  app.patch(
    '/settings/integrations/:id',
    { schema: { params: idParam, body: integrationPatch } },
    async (req) => {
      const { id } = req.params as { id: IntegrationId };
      const patch = req.body as z.infer<typeof integrationPatch>;
      queries.settings.updateIntegrationSetting(req.server.db, id, patch);
      return ok(buildSettings(req.server.db));
    },
  );

  app.patch('/settings/app', { schema: { body: appPatch } }, async (req) => {
    const patch = req.body as z.infer<typeof appPatch>;
    if (typeof patch.autoSyncEnabled === 'boolean') {
      queries.settings.setAppSetting(
        req.server.db,
        'autoSyncEnabled',
        JSON.stringify(patch.autoSyncEnabled),
      );
    }
    return ok(buildSettings(req.server.db));
  });
};
