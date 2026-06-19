import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { queries } from '@vcc/db';
import { ok } from '../lib/envelope.js';
import { runSync, isSyncRunning } from '../jobs/sync.js';

const syncBody = z
  .object({
    days: z.number().int().min(1).max(1095).optional(), // up to ~3 years
    includeApple: z.boolean().optional(),
  })
  .optional();

export const registerSyncRoutes: FastifyPluginAsync = async (app) => {
  app.post('/sync', { schema: { body: syncBody } }, async (req, reply) => {
    if (isSyncRunning()) {
      return reply
        .status(409)
        .send({ ok: false, error: { error: 'sync in progress', code: 'CONFLICT' } });
    }
    const body = (req.body ?? {}) as z.infer<typeof syncBody> extends undefined
      ? Record<string, never>
      : NonNullable<z.infer<typeof syncBody>>;
    const rangeDays = body?.days;
    // Fire-and-forget so the HTTP response returns immediately even for big backfills.
    runSync(req.server.db, req.server.log.child({ module: 'sync', trigger: 'manual' }), {
      rangeDays,
      includeApple: body?.includeApple,
    }).catch((err) => req.server.log.error({ err }, 'manual sync failed'));
    return ok({ triggered: true, rangeDays: rangeDays ?? 7 });
  });

  app.get('/sync/status', async (req) => {
    const perSource = queries.syncLog.latestPerSource(req.server.db);
    const lastSyncAt =
      Object.values(perSource)
        .map((s) => s.finishedAt)
        .filter((v): v is string => !!v)
        .sort()
        .pop() ?? null;
    return ok({
      lastSyncAt,
      running: isSyncRunning(),
      perDevice: Object.entries(perSource).map(([source, s]) => ({
        source,
        lastSyncAt: s.finishedAt,
        ok: s.ok,
        message: s.message,
      })),
    });
  });
};
