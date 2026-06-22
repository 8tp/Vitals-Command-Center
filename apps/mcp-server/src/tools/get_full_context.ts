import type { Database } from 'better-sqlite3';
import { queries } from '@vcc/db';

/**
 * Returns the same analytical packet the server-side briefing generator hands
 * Claude when the direct API is configured: today's full detail + 14-day compact
 * window + previous briefing.
 *
 * Recent runs ARE included: since 2026-06 Strava activities sync into this DB
 * (with per-km splits/laps/segments backfilled), so the packet carries the last
 * ~14 days of workouts with split-level pace/HR for training analysis.
 *
 * Claude Desktop / claude.ai call this once, then synthesize a briefing or answer
 * and (for briefings) call `save_briefing` to persist.
 *
 * Kept as a standalone implementation in the MCP package so the MCP server does
 * NOT pull @anthropic-ai/sdk just to reuse buildContextBlock — MCP stays lean.
 */

const DAYS_WINDOW = 14;

function addDays(dateIso: string, n: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function getFullContext(db: Database, args: Record<string, unknown>) {
  const date = (args.date as string) ?? new Date().toISOString().slice(0, 10);
  const today = queries.dailySummary.get(db, date);
  const windowStart = addDays(date, -(DAYS_WINDOW - 1));
  const window = queries.dailySummary.list(db, windowStart, date);
  // Most recent briefing strictly BEFORE `date` (latestOfType matched the exact
  // date, which never returns a prior brief). Provided by @vcc/db (other agent).
  const previousBriefing = queries.briefings.latestBefore(db, 'daily', date);

  // Fitbit Air is the primary source as of 2026-06; whoop/oura/apple are always
  // null. Prefer fitbit fields first, then the cross-device consensus, then the
  // Apple Watch fallback for the few metrics it still provides (spo2/steps).
  const compactWindow = window.map((d) => ({
    date: d.date,
    devices: d.devices.active,
    confidence: d.consensus.level,
    hrv: d.fitbit?.hrv ?? d.consensus.hrv,
    rhr: d.fitbit?.rhr ?? d.consensus.rhr,
    sleepHours: d.fitbit?.sleepHours ?? d.consensus.sleepHours,
    deepHours: d.fitbit?.deepHours ?? null,
    remHours: d.fitbit?.remHours ?? null,
    skinTempDelta: d.fitbit?.skinTempDelta ?? null,
    respiratoryRate: d.fitbit?.respiratoryRate ?? null,
    spo2: d.fitbit?.spo2 ?? d.apple?.spo2 ?? null,
    steps: d.fitbit?.steps ?? d.apple?.steps ?? null,
    activeCaloriesBurned: d.fitbit?.activeCaloriesBurned ?? null,
    caloriesIn: d.fitbit?.caloriesIn ?? null,
  }));

  // Recent runs (most-recent first) with split-level pace/HR so Claude can
  // reason about training load, pacing, and intensity distribution directly.
  const recentRuns = queries.workouts.list(db, windowStart, date).slice(0, 10).map((w) => {
    const detail = queries.workouts.getWithDetail(db, w.id)?.detail ?? null;
    return {
      date: w.date,
      sport: w.sport,
      name: w.notes,
      distanceKm: w.distanceKm,
      movingMinutes: Math.round(w.durationMinutes),
      avgHr: w.avgHr,
      maxHr: w.maxHr,
      calories: w.calories,
      avgCadence: detail?.avgCadence ?? null,
      elevationGainM: detail?.totalElevationGain ?? null,
      splits:
        detail?.splits?.map((s) => ({
          km: s.index,
          paceSecPerKm: s.paceSecondsPerKm,
          avgHr: s.avgHr,
        })) ?? null,
    };
  });

  return {
    date,
    today,
    window: compactWindow,
    recentRuns,
    previousBriefing,
    /**
     * Briefing template Claude should follow when asked for a morning briefing.
     * Kept as plain text so it's visible to whatever chat surface Claude is on.
     */
    briefingTemplate: `Structure the morning briefing as:
**Status** — one paragraph: your own recovery read reasoned from HRV vs baseline, RHR, sleep quality and skin-temp deviation (there are no recovery/readiness scores). Cite key numbers + whether today has Fitbit data.
**Trends** — 2-3 bullets citing specific deltas vs the 14-day window (HRV, RHR, sleep hours/stages, steps).
**Training** — reference \`recentRuns\` in this packet (last ~14 days, with per-km splits + HR). Note recent load, pacing trend, and intensity distribution. One line on how today's recovery read should shape the session.
**Recommendations** — up to 5, ranked, specific (dosages/timings/durations).

After you finish the briefing, call save_briefing({ date, content }) so the web dashboard can display it. Use the same date this tool was called with.`,
  };
}
