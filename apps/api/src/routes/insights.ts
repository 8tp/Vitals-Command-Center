import type { FastifyPluginAsync } from 'fastify';
import { queries } from '@vcc/db';
import { ok } from '../lib/envelope.js';
import { todayIso } from '../lib/range.js';
import { buildInsightsForDate } from '../services/insights.js';
import { generateLocalBrief } from '../services/localBrief.js';
import { computeWeeklySummary } from '../services/weekly.js';

export const registerInsightsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/insights/today', async (req) => {
    const date = todayIso();
    const summary = queries.dailySummary.get(req.server.db, date);
    const briefing = queries.briefings.latestOfType(req.server.db, 'daily', date);
    const insights = summary ? buildInsightsForDate(req.server.db, summary) : [];
    return ok({ date, summary, briefing, insights });
  });

  // Deterministic weekly digest, computed on demand (no AI provider needed) so
  // the Trends page renders even if the weekly cron hasn't run yet.
  app.get('/insights/weekly', async (req) => {
    const { end } = req.query as { end?: string };
    return ok(computeWeeklySummary(req.server.db, end || todayIso()));
  });

  app.get('/insights/briefing/:date', async (req, reply) => {
    const { date } = req.params as { date: string };
    const briefing = queries.briefings.latestOfType(req.server.db, 'daily', date);
    if (!briefing) return reply.status(404).send({ ok: false, error: { error: 'no briefing', code: 'NOT_FOUND' } });
    return ok(briefing);
  });

  app.post<{ Body?: { date?: string } }>('/insights/generate', async (req, reply) => {
    const date = req.body?.date ?? todayIso();
    const summary = queries.dailySummary.get(req.server.db, date);
    if (!summary) {
      return reply
        .status(400)
        .send({ ok: false, error: { error: `no summary for ${date}; run sync first`, code: 'NO_DATA' } });
    }
    try {
      const content = await generateLocalBrief(req.server.db, date);
      const stored = queries.briefings.store(req.server.db, {
        date,
        type: 'daily',
        content,
        metricsSnapshot: summary,
      });
      return ok(stored);
    } catch (err) {
      req.log.error({ err }, 'briefing generation failed');
      return reply
        .status(502)
        .send({ ok: false, error: { error: (err as Error).message, code: 'CLAUDE_FAILED' } });
    }
  });
};
