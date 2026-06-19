import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { queries } from '@vcc/db';
import { DEVICE_SOURCES, confidenceFromSpread } from '@vcc/shared';
import { ok } from '../lib/envelope.js';

const compareQ = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

const METRICS = [
  { key: 'hrv', label: 'HRV (rMSSD)', unit: 'ms', toleranceAbs: 8 },
  { key: 'rhr', label: 'Resting HR', unit: 'bpm', toleranceAbs: 3 },
  { key: 'sleepHours', label: 'Sleep duration', unit: 'h', toleranceAbs: 0.5 },
  { key: 'spo2', label: 'SpO₂', unit: '%', toleranceAbs: 1 },
] as const;

export const registerCompareRoutes: FastifyPluginAsync = async (app) => {
  app.get('/compare', { schema: { querystring: compareQ } }, async (req, reply) => {
    const { date } = req.query as z.infer<typeof compareQ>;
    const row = queries.dailySummary.get(req.server.db, date);
    if (!row) return reply.status(404).send({ ok: false, error: { error: 'not found', code: 'NOT_FOUND' } });

    const comparison = METRICS.map((m) => {
      const perDevice = DEVICE_SOURCES.map((device) => {
        const bucket = row[device];
        return {
          device,
          value: bucket ? ((bucket as unknown as Record<string, unknown>)[m.key] as number | null) : null,
        };
      });
      const values = perDevice.map((d) => d.value).filter((v): v is number => typeof v === 'number');
      return {
        ...m,
        devices: perDevice,
        confidence: confidenceFromSpread(values, { toleranceAbs: m.toleranceAbs }),
      };
    });

    return ok({ date, comparison });
  });
};
