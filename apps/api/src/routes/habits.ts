import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { queries } from '@vcc/db';
import { schemas } from '@vcc/shared';
import { parseRange, todayIso } from '../lib/range.js';
import { ok } from '../lib/envelope.js';

export const registerHabitRoutes: FastifyPluginAsync = async (app) => {
  app.get('/habits', async (req) => ok({ habits: queries.habits.list(req.server.db) }));

  app.post('/habits', { schema: { body: schemas.createHabitSchema } }, async (req) => {
    const body = req.body as z.infer<typeof schemas.createHabitSchema>;
    const created = queries.habits.create(req.server.db, {
      name: body.name,
      category: body.category,
      type: body.type,
      unit: body.unit ?? null,
      targetValue: body.targetValue ?? null,
      sortOrder: body.sortOrder ?? 0,
    });
    return ok(created);
  });

  app.put('/habits/:id', { schema: { body: schemas.updateHabitSchema } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const updated = queries.habits.update(req.server.db, id, req.body as Record<string, unknown>);
    if (!updated) return reply.status(404).send({ ok: false, error: { error: 'habit not found', code: 'NOT_FOUND' } });
    return ok(updated);
  });

  app.delete('/habits/:id', async (req) => {
    const { id } = req.params as { id: string };
    queries.habits.softDelete(req.server.db, id);
    return ok({ deleted: id });
  });

  app.get('/habits/log', async (req) => {
    const { range } = req.query as { range?: string };
    const r = parseRange(range, 30);
    return ok({ range: r, logs: queries.habits.listLogs(req.server.db, r.start, r.end) });
  });

  app.post('/habits/log', { schema: { body: schemas.logHabitSchema } }, async (req) => {
    const body = req.body as z.infer<typeof schemas.logHabitSchema>;
    const log = queries.habits.logEntry(req.server.db, body.habitId, body.date ?? todayIso(), body.value);
    return ok(log);
  });

  app.get('/habits/streaks', async (req) => ok({ streaks: queries.habits.streaks(req.server.db) }));

  app.get('/habits/correlations', async () => {
    // Phase 3 implementation — correlation engine runs nightly and caches results.
    // Until then, return empty so UI can render the empty state.
    return ok({ correlations: [], note: 'Correlation engine not yet implemented (Phase 3).' });
  });
};
