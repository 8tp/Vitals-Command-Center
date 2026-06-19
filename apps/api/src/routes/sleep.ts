import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { queries } from '@vcc/db';
import { parseRange } from '../lib/range.js';
import { ok } from '../lib/envelope.js';

const rangeQ = z.object({ range: z.string().optional() });

export const registerSleepRoutes: FastifyPluginAsync = async (app) => {
  app.get('/sleep', { schema: { querystring: rangeQ } }, async (req) => {
    const { range } = req.query as z.infer<typeof rangeQ>;
    const r = parseRange(range, 7);
    const rows = queries.sleep.list(req.server.db, r.start, r.end);
    return ok({ range: r, sessions: rows });
  });

  app.get('/sleep/:date', async (req) => {
    const { date } = req.params as { date: string };
    const rows = queries.sleep.forDate(req.server.db, date);
    return ok({ date, sessions: rows });
  });
};
