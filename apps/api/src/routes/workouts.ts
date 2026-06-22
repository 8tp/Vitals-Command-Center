import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { queries } from '@vcc/db';
import { parseRange } from '../lib/range.js';
import { ok } from '../lib/envelope.js';
import { StravaClient } from '../services/strava.js';

const rangeQ = z.object({ range: z.string().optional(), sport: z.string().optional() });

export const registerWorkoutRoutes: FastifyPluginAsync = async (app) => {
  app.get('/workouts', { schema: { querystring: rangeQ } }, async (req) => {
    const { range, sport } = req.query as z.infer<typeof rangeQ>;
    const r = parseRange(range, 30);
    const all = queries.workouts.list(req.server.db, r.start, r.end);
    const rows = sport ? all.filter((w) => w.sport.toLowerCase() === sport.toLowerCase()) : all;
    return ok({ range: r, workouts: rows });
  });

  // Single workout + rich detail. Detail is normally backfilled by sync; for a
  // Strava row that still lacks it (e.g. seeded before the integration), fetch
  // on demand, persist, and return. A fetch failure degrades to detail:null
  // rather than erroring the request.
  app.get('/workouts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const found = queries.workouts.getWithDetail(req.server.db, id);
    if (!found) {
      return reply
        .status(404)
        .send({ ok: false, error: { error: 'workout not found', code: 'NOT_FOUND' } });
    }

    let detail = found.detail;
    if (
      detail == null &&
      found.workout.source === 'strava' &&
      process.env.STRAVA_CLIENT_ID &&
      queries.settings.getIntegrationSetting(req.server.db, 'strava').enabled
    ) {
      try {
        const client = new StravaClient(undefined, req.log.child({ module: 'strava-detail' }));
        if (client.hasTokens()) {
          const res = await client.getActivityDetail(id.replace(/^strava-/, ''));
          if (res) {
            queries.workouts.upsertDetail(req.server.db, id, res.detail);
            if (res.calories != null) {
              queries.workouts.setCalories(req.server.db, id, res.calories);
              found.workout.calories = res.calories;
            }
            detail = res.detail;
          }
        }
      } catch (err) {
        req.log.warn({ err, id }, 'on-demand strava detail fetch failed');
      }
    }

    return ok({ workout: found.workout, detail });
  });
};
