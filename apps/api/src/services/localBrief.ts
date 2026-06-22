import type { Database } from 'better-sqlite3';
import { queries } from '@vcc/db';
import { getUserProfile } from '@vcc/shared';
import { addDaysIso } from '../lib/range.js';
import { runAgent } from './agentCli.js';

/**
 * Local AI daily brief — generated on the Mini by the on-box CLI agent
 * (Codex by default; the model runs on the provider's servers, the orchestration
 * is local). No Anthropic API key needed. The result is stored as a 'daily'
 * briefing so the dashboard's /api/insights/today renders it unchanged.
 *
 * claude.ai (via the MCP connector) is for interactive questions; THIS is the
 * automatic morning dispatch.
 */

const SYSTEM = `You are the user's personal health analyst. Write their morning brief — terse, specific, concise. No fluff, no motivational filler. Personalize using the "About the user" section provided below.

How to read the data:
- Recovery is YOUR call from the trend — there is no recovery/readiness score. Weigh today's HRV vs its 7-day baseline (primary), resting HR vs baseline, and last night's sleep.
- Thresholds: HRV >15% below 7-day avg = stress/illness flag; RHR >5bpm over baseline = under-recovered; sleep <6h for 2+ nights = debt; SpO2 <95% = flag; deep sleep <1.5h = flag.
- Units: report ALL distances and paces in MILES (M:SS/mi). The user trains for a 2-mile PT test; never use kilometers.
- Food: calories in/out may be absent (the user doesn't always log). If absent, give brief general fueling guidance; do NOT nag about logging.
- Training: RECENT RUNS (Strava) is provided in miles. If a run is dated TODAY (isToday), that's this morning's session — reference it explicitly. For interval/fartlek runs use \`workIntervals\` (the detected RUN efforts, walk recoveries already removed): report how many efforts, their pace per mile, and whether they were CONSISTENT or drifted. Do NOT treat the auto-splits (\`splitPacePerMiSec\`) as a fade — they average the walk recoveries into each mile. Factor the session into recovery + the rest-of-day plan and the load trend.

Output GitHub-flavored markdown, this exact structure, nothing before or after:
## Readiness
One line: a state word (PRIMED / STEADY / STRAINED) + the why in <15 words (cite HRV/RHR/sleep numbers).
## Sleep
2 bullets on last night vs trend + one concrete fix if needed.
## Food
1-2 bullets: fueling guidance for today; reference calories in/out only if present.
## Training
1-2 bullets, miles only. If there's a run dated today, lead with it: for intervals say how many work efforts and their pace/mile + whether they held consistent (from workIntervals), not a fade; then what it means for the rest of the day. Otherwise prescribe today's session from recovery + recent run load + steps, tied to the user's goals.
## Actions
Up to 4, ranked, each specific (dose/time/duration). Reference the user's supplements/habits/goals where relevant.`;

/** Fitbit-centric context packet (today + 14-day window + prior brief). */
export function buildBriefContext(db: Database, date: string): string {
  const today = queries.dailySummary.get(db, date);
  const window = queries.dailySummary.list(db, addDaysIso(date, -13), date);
  // Previous brief for continuity: the most recent one BEFORE today, not
  // yesterday's exact date — otherwise a skipped day (no brief) drops continuity.
  const prior = queries.briefings.latestBefore(db, 'daily', date);

  const compact = window.map((d) => {
    const f = d.fitbit;
    return {
      date: d.date,
      hrv: d.consensus.hrv,
      rhr: d.consensus.rhr,
      spo2: f?.spo2 ?? null,
      sleepH: d.consensus.sleepHours,
      deepH: f?.deepHours ?? null,
      remH: f?.remHours ?? null,
      skinTempDelta: f?.skinTempDelta ?? null,
      steps: f?.steps ?? null,
      calOut: (f as { activeCaloriesBurned?: number | null })?.activeCaloriesBurned ?? null,
      calIn: (f as { caloriesIn?: number | null })?.caloriesIn ?? null,
    };
  });

  // Recent runs (last 7 days, newest first), in MILES, with reconstructed run/walk
  // intervals so the brief sees true interval structure rather than distance
  // auto-splits that average work efforts together with walk recoveries.
  const MI = 1.609344;
  const perMi = (secPerKm: number | null | undefined): number | null =>
    secPerKm != null ? Math.round(secPerKm * MI) : null;
  const runs = queries.workouts
    .list(db, addDaysIso(date, -7), date)
    .slice(0, 8)
    .map((w) => {
      const detail = queries.workouts.getWithDetail(db, w.id)?.detail ?? null;
      const work = (detail?.intervals ?? []).filter((i) => i.kind === 'work');
      return {
        date: w.date,
        isToday: w.date === date,
        sport: w.sport,
        name: w.notes,
        distanceMi: w.distanceKm != null ? +(w.distanceKm / MI).toFixed(2) : null,
        movingMin: Math.round(w.durationMinutes),
        avgHr: w.avgHr,
        maxHr: w.maxHr,
        calories: w.calories,
        avgCadence: detail?.avgCadence ?? null,
        // Detected work efforts (recoveries excluded). pacePerMiSec = seconds/mile.
        workIntervals: work.length
          ? work.map((i) => ({
              distanceMi: +(i.distanceKm / MI).toFixed(2),
              durationSec: i.durationSeconds,
              pacePerMiSec: perMi(i.avgPaceSecondsPerKm),
              avgHr: i.avgHr,
            }))
          : null,
        // Fallback only — distance auto-splits per mile (blend work + recovery).
        splitPacePerMiSec: detail?.splits?.map((s) => perMi(s.paceSecondsPerKm)) ?? null,
      };
    });

  return [
    `TODAY = ${date}. Most recent night's sleep + today's running totals are the latest row.`,
    `DAILY SERIES (oldest→newest), nulls mean no data that day:\n\`\`\`json\n${JSON.stringify(compact, null, 1)}\n\`\`\``,
    runs.length
      ? `RECENT RUNS (newest first; isToday=true is this morning's). Distances in MILES, paces in seconds/mile. \`workIntervals\` are the detected RUN efforts only (walk recoveries removed) — for interval sessions judge pacing/consistency from these, NOT from \`splitPacePerMiSec\` (auto-splits that average in the walks):\n\`\`\`json\n${JSON.stringify(runs, null, 1)}\n\`\`\``
      : `(No runs in the last 7 days.)`,
    today ? null : `(No row yet for ${date}; use the latest available day.)`,
    prior ? `YESTERDAY'S BRIEF (for continuity, don't repeat verbatim):\n${prior.content}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export async function generateLocalBrief(db: Database, date: string): Promise<string> {
  const context = buildBriefContext(db, date);
  const prompt = `${SYSTEM}\n\n## About the user\n${getUserProfile()}\n\n---\nDATA:\n${context}`;
  const { text } = await runAgent(prompt, {
    cli: process.env.BRIEF_CLI as 'claude' | 'codex' | undefined,
    model: process.env.BRIEF_MODEL,
  });
  return text;
}
