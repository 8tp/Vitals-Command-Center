import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { queries } from '@vcc/db';
import { parseRange } from '../lib/range.js';
import { ok } from '../lib/envelope.js';

const rangeQ = z.object({ range: z.string().optional(), sport: z.string().optional() });

export const registerWorkoutRoutes: FastifyPluginAsync = async (app) => {
  app.get('/workouts', { schema: { querystring: rangeQ } }, async (req) => {
    const { range, sport } = req.query as z.infer<typeof rangeQ>;
    const r = parseRange(range, 30);
    const all = queries.workouts.list(req.server.db, r.start, r.end);
    const rows = sport ? all.filter((w) => w.sport.toLowerCase() === sport.toLowerCase()) : all;
    return ok({ range: r, workouts: rows });
  });
};
