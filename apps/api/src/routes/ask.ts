import type { FastifyPluginAsync } from 'fastify';
import { schemas } from '@vcc/shared';
import { queries } from '@vcc/db';
import type { z } from 'zod';
import { answerQuestion } from '../services/localAsk.js';

/** Derive a short thread title from the opening question. */
function titleFrom(question: string): string {
  const t = question.trim().replace(/\s+/g, ' ');
  return t.length > 70 ? `${t.slice(0, 67)}…` : t;
}

/**
 * Free-form Q&A answered by the on-box AI CLI (claude -p → codex fallback) over
 * the user's recent data. The exchange is PERSISTED to a conversation so the
 * user can revisit it and ask follow-ups; the conversation id is returned in the
 * `X-Conversation-Id` response header. Keeps the SSE contract the web client
 * expects — the CLI is non-streaming so the answer arrives as a single event.
 */
export const registerAskRoutes: FastifyPluginAsync = async (app) => {
  app.post('/ask', { schema: { body: schemas.askSchema } }, async (req, reply) => {
    const body = req.body as z.infer<typeof schemas.askSchema>;
    const db = req.server.db;

    // Resolve (or open) the thread this question belongs to.
    let conversation = body.conversationId ? queries.conversations.meta(db, body.conversationId) : null;
    let anchorBrief: string | null = null;
    if (!conversation) {
      let anchorBriefId: string | null = null;
      let anchorDate: string | null = null;
      if (body.anchorBriefDate) {
        const brief = queries.briefings.latestOfType(db, 'daily', body.anchorBriefDate);
        if (brief) {
          anchorBriefId = brief.id;
          anchorDate = brief.date;
          anchorBrief = brief.content;
        }
      }
      conversation = queries.conversations.create(db, {
        title: titleFrom(body.question),
        anchorBriefId,
        anchorDate,
      });
    } else if (conversation.anchorBriefId) {
      anchorBrief = queries.briefings.byId(db, conversation.anchorBriefId)?.content ?? null;
    }

    // Prior turns (before persisting this one) feed the follow-up context.
    const history = queries.conversations
      .messages(db, conversation.id)
      .map((m) => ({ role: m.role, content: m.content }));
    queries.conversations.addMessage(db, conversation.id, 'user', body.question);

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.setHeader('X-Conversation-Id', conversation.id);
    reply.hijack();

    try {
      const { text, cli } = await answerQuestion(db, body.question, body.context?.date, {
        history,
        anchorBrief,
      });
      queries.conversations.addMessage(db, conversation.id, 'assistant', text);
      req.log.info({ cli, conversationId: conversation.id }, 'ask answered');
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
