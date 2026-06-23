import type { Database } from 'better-sqlite3';
import { getUserProfile } from '@vcc/shared';
import { todayIso } from '../lib/range.js';
import { buildBriefContext } from './localBrief.js';
import { runAgent } from './agentCli.js';

/**
 * Answer a free-form health question using the on-box AI agent over the user's
 * recent data. Personal context comes from USER_PROFILE (see getUserProfile) —
 * never hardcoded here.
 */
const ASK_SYSTEM = `You are a personal health analyst. Answer the user's question using ONLY the data provided below (wearable vitals / sleep / steps / energy + any logged food).

Rules:
- Be direct, specific, concise. GitHub-flavored markdown.
- Cite actual numbers and trends from the data. If the data needed isn't present, say so plainly — don't invent it.
- Do not use any tools or run commands; answer from the provided data only.
- Workouts/runs may be tracked elsewhere (e.g. Strava) and absent here; for training questions reason from recovery + steps.`;

export interface AskOptions {
  /** Prior turns in this thread (oldest → newest), for follow-up context. */
  history?: { role: 'user' | 'assistant'; content: string }[];
  /** A daily brief this thread is anchored to — fed as additional context. */
  anchorBrief?: string | null;
}

export async function answerQuestion(
  db: Database,
  question: string,
  date?: string,
  opts: AskOptions = {},
): Promise<{ text: string; cli: 'claude' | 'codex' }> {
  const context = buildBriefContext(db, date ?? todayIso());

  const parts = [
    ASK_SYSTEM,
    `\n\n## About the user\n${getUserProfile()}`,
    `\n\n---\nHEALTH DATA:\n${context}`,
  ];

  if (opts.anchorBrief) {
    parts.push(
      `\n\n---\nEARLIER DAILY BRIEF (the user is asking a follow-up about this brief):\n${opts.anchorBrief}`,
    );
  }

  // Keep the last few turns so follow-ups have context without an unbounded prompt.
  const history = (opts.history ?? []).slice(-8);
  if (history.length) {
    const transcript = history
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
    parts.push(`\n\n---\nCONVERSATION SO FAR:\n${transcript}`);
  }

  parts.push(`\n\n---\nQUESTION: ${question}\n\nAnswer:`);

  return runAgent(parts.join(''), { cli: process.env.ASK_CLI as 'claude' | 'codex' | undefined });
}
