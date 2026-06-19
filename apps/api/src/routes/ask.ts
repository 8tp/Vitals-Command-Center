import type { FastifyPluginAsync } from 'fastify';
import { schemas } from '@vcc/shared';
import type { z } from 'zod';
import { answerQuestion } from '../services/localAsk.js';

/**
 * Free-form Q&A answered by the on-box AI CLI (claude -p → codex fallback) over
 * the user's recent data. Keeps the SSE contract the web client expects, but the
 * CLI is non-streaming so the answer arrives as a single `data:` event.
 */
export const registerAskRoutes: FastifyPluginAsync = async (app) => {
  app.post('/ask', { schema: { body: schemas.askSchema } }, async (req, reply) => {
    const body = req.body as z.infer<typeof schemas.askSchema>;
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.hijack();

    try {
      const { text, cli } = await answerQuestion(req.server.db, body.question, body.context?.date);
      req.log.info({ cli }, 'ask answered');
      reply.raw.write(`data: ${JSON.stringify({ text })}\n\n`);
      reply.raw.write('data: [DONE]\n\n');
      reply.raw.end();
    } catch (err) {
      req.log.error({ err }, 'ask failed');
      reply.raw.write(`data: ${JSON.stringify({ error: (err as Error).message })}\n\n`);
      reply.raw.end();
    }
  });
};
