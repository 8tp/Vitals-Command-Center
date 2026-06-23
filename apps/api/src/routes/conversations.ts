import type { FastifyPluginAsync } from 'fastify';
import { queries } from '@vcc/db';
import { ok, fail } from '../lib/envelope.js';

/** Persisted Ask AI conversations — list, read, delete (for the history drawer). */
export const registerConversationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/conversations', async (req) => {
    const { limit } = req.query as { limit?: string };
    const n = Math.min(Math.max(Number(limit) || 30, 1), 100);
    return ok(queries.conversations.list(req.server.db, n));
  });

  app.get('/conversations/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const conv = queries.conversations.get(req.server.db, id);
    if (!conv) return reply.status(404).send(fail('conversation not found', 'NOT_FOUND'));
    return ok(conv);
  });

  app.delete('/conversations/:id', async (req) => {
    const { id } = req.params as { id: string };
    queries.conversations.remove(req.server.db, id);
    return ok({ deleted: true });
  });
};
