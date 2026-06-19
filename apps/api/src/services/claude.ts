import Anthropic from '@anthropic-ai/sdk';
import type { Database } from 'better-sqlite3';
import { queries } from '@vcc/db';
import { getUserProfile } from '@vcc/shared';
import { addDaysIso, todayIso } from '../lib/range.js';
import type { AskInput } from '@vcc/shared/schemas';

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-6';

/**
 * Legacy direct-Anthropic-API path. The primary brief/ask now run on the on-box
 * agent (services/agentCli.ts). Personal context comes from USER_PROFILE
 * (getUserProfile) — never hardcoded.
 */
export const HEALTH_SYSTEM_PROMPT = `You are the user's personal health intelligence analyst. Their data comes from one or more connected wearables, unified for you with per-device values plus a weighted consensus and a confidence level.

## Your role
- Analyze the data and deliver actionable, specific recommendations
- Detect patterns, anomalies, and correlations across days and devices
- Be direct and concise. No fluff, no motivational filler
- State which device(s) contributed and your confidence

## Reading the data
- Prefer the consensus value; note disagreement between devices.
- Recovery/readiness: reason from HRV vs its 7-day baseline (primary), resting HR vs baseline, and sleep — there is no single vendor "recovery score".
- Some sources/metrics may be absent on a day; say so rather than inventing.

## Alert thresholds
- HRV >15% below the 7-day average → stress/illness flag
- Resting HR >5 bpm above the 14-day baseline → under stress
- Skin-temp deviation >0.5°C above baseline → early illness signal
- Sleep <6h for 2+ consecutive nights → sleep-debt warning
- SpO₂ <95% → flag; deep sleep <1.5h → flag

## Recommendation style
- Specific: dosages, times, durations — not vague
- Personalize using the "About the user" section below
- Max 5 recommendations per briefing, ranked by impact

## About the user
${getUserProfile()}`;

export function isClaudeApiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Thrown by ask / generate paths when the direct-API path isn't configured.
 *  Routes catch this and return a 501 pointing users at the Claude Desktop MCP path. */
export class ClaudeApiNotConfiguredError extends Error {
  code = 'CLAUDE_NOT_CONFIGURED' as const;
  constructor() {
    super(
      'Direct Anthropic API is not configured. Connect Claude Desktop (or claude.ai) to the local MCP server instead — see /api/config/status.',
    );
  }
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!isClaudeApiConfigured()) throw new ClaudeApiNotConfiguredError();
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/**
 * Assemble the standard analytical packet we hand Claude: latest day, prior briefing,
 * 14-day rolling window (trimmed), active workouts in range. Trend awareness beats
 * single-snapshot analysis and costs only a few hundred tokens more.
 *
 * Exported so the MCP `get_full_context` tool can hand the same packet to Claude Desktop.
 */
export function buildContextBlock(db: Database, date: string): string {
  const today = queries.dailySummary.get(db, date);
  const windowStart = addDaysIso(date, -13);
  const window = queries.dailySummary.list(db, windowStart, date);
  const briefing = queries.briefings.latestOfType(db, 'daily', date);
  const recentWorkouts = queries.workouts.list(db, addDaysIso(date, -7), date);

  // Trim each day down to the signal-carrying fields to keep token budget tight.
  const compacted = window.map((d) => ({
    date: d.date,
    devices: d.devices.active,
    confidence: d.consensus.level,
    hrv: d.consensus.hrv,
    rhr: d.consensus.rhr,
    sleepHours: d.consensus.sleepHours,
    recovery: d.whoop?.recoveryScore ?? null,
    readiness: d.oura?.readinessScore ?? null,
    strain: d.whoop?.strain ?? null,
    tempDeviation: d.oura?.tempDeviation ?? null,
    spo2: d.whoop?.spo2 ?? d.oura?.spo2 ?? d.apple?.spo2 ?? null,
    steps: d.apple?.steps ?? d.oura?.steps ?? null,
  }));

  const workoutsCompact = recentWorkouts.map((w) => ({
    date: w.date,
    sport: w.sport,
    strain: w.strain,
    durationMin: Math.round(w.durationMinutes),
    avgHr: w.avgHr,
    distanceKm: w.distanceKm,
  }));

  const parts = [
    today
      ? `TODAY (${date}) FULL DETAIL:\n\`\`\`json\n${JSON.stringify(today, null, 2)}\n\`\`\``
      : `No summary recorded for ${date}.`,
    compacted.length
      ? `14-DAY WINDOW (compact):\n\`\`\`json\n${JSON.stringify(compacted, null, 2)}\n\`\`\``
      : null,
    workoutsCompact.length
      ? `7-DAY WORKOUTS:\n\`\`\`json\n${JSON.stringify(workoutsCompact, null, 2)}\n\`\`\``
      : null,
    briefing ? `PREVIOUS BRIEFING (${briefing.date}):\n${briefing.content}` : null,
  ];
  return parts.filter(Boolean).join('\n\n');
}

export async function* askClaude(db: Database, input: AskInput): AsyncGenerator<{ text: string }> {
  const date = input.context?.date ?? todayIso();
  const context = buildContextBlock(db, date);

  const userMessage = `${context}\n\nQUESTION: ${input.question}`;

  const stream = await getClient().messages.stream({
    model: MODEL,
    max_tokens: 1024,
    system: HEALTH_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield { text: event.delta.text };
    }
  }
}

export async function generateDailyBriefing(db: Database, date: string): Promise<string> {
  const summary = queries.dailySummary.get(db, date);
  if (!summary) throw new Error(`No summary for ${date}`);
  const context = buildContextBlock(db, date);

  const userMessage = `Generate the morning briefing for ${date}.

Structure:
**Status** — one paragraph: recovery/readiness read, key numbers, device coverage (N of 3).
**Trends** — 2-3 bullets citing specific deltas vs the 14-day window.
**Training** — one line referencing last 7 days of workouts + how today's readiness should shape the session.
**Recommendations** — up to 5, ranked, specific (dosages/timings/durations).

${context}`;

  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: HEALTH_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = res.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  return text;
}
