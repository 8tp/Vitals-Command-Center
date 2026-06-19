import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { queries } from '@vcc/db';
import { parseRange } from '../lib/range.js';
import { ok } from '../lib/envelope.js';

const listQuery = z.object({ range: z.string().optional() });
const dateParam = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export const registerDailyRoutes: FastifyPluginAsync = async (app) => {
  app.get('/daily', { schema: { querystring: listQuery } }, async (req) => {
    const { range } = req.query as z.infer<typeof listQuery>;
    const { start, end, days } = parseRange(range, 7);
    const rows = queries.dailySummary.list(req.server.db, start, end);
    return ok({ range: { start, end, days }, rows });
  });

  app.get('/daily/:date', { schema: { params: dateParam } }, async (req, reply) => {
    const { date } = req.params as z.infer<typeof dateParam>;
    const row = queries.dailySummary.get(req.server.db, date);
    if (!row) return reply.status(404).send({ ok: false, error: { error: 'not found', code: 'NOT_FOUND' } });
    return ok(row);
  });
};
