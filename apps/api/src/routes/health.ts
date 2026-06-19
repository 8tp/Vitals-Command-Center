import type { FastifyPluginAsync } from 'fastify';
import { queries } from '@vcc/db';
import { ok } from '../lib/envelope.js';

export const registerHealthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async (req) => {
    const latest = queries.syncLog.latestPerSource(req.server.db);
    return ok({
      status: 'operational',
      uptimeSec: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      lastSyncs: latest,
    });
  });
};
