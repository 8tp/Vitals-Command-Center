import { z } from 'zod';

export const askSchema = z.object({
  question: z.string().min(3).max(2000),
  /** Continue an existing thread; omit to start a new one. */
  conversationId: z.string().optional(),
  /** Start a new thread anchored to this daily brief (a "discuss this brief" follow-up). */
  anchorBriefDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  context: z
    .object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      includeBriefing: z.boolean().default(true),
    })
    .optional(),
});
export type AskInput = z.infer<typeof askSchema>;
