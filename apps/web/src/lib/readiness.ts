import type { NormalizedDailySummary } from '@vcc/shared';

/**
 * Readiness instrument formula (derived client-side from Fitbit + consensus).
 *
 * There are no WHOOP/Oura recovery or readiness scores anymore. We synthesize a
 * single 0-100 "morning readiness" from three signals, weighted:
 *
 *   HRV vs 7-day baseline ........ 50%  (primary autonomic signal; up = good)
 *   Resting HR vs 7-day baseline . 30%  (down = good)
 *   Last night's sleep hours ..... 20%  (8h target band)
 *
 * Each sub-signal is scored 0-100 around its baseline, then weighted by
 * whichever signals are actually present (re-normalized so a missing input
 * doesn't drag the score down). The result maps to a state word + color.
 */

export type ReadinessState = 'PRIMED' | 'STEADY' | 'STRAINED' | 'LOW' | 'NO DATA';

export interface ReadinessResult {
  score: number | null; // 0-100, null when no inputs
  state: ReadinessState;
  /** signal | warn | alert | mute — drives instrument color. */
  tone: 'signal' | 'warn' | 'alert' | 'mute';
  date: string | null;
  inputs: {
    hrv: { value: number | null; baseline: number | null; sub: number | null };
    rhr: { value: number | null; baseline: number | null; sub: number | null };
    sleep: { value: number | null; sub: number | null };
  };
}

const SLEEP_TARGET = 8; // hours; band centered here

function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Pull a baseline mean for a metric from the days AFTER `todayIdx` (history). */
function baselineFrom(
  daily: NormalizedDailySummary[],
  startIdx: number,
  pick: (d: NormalizedDailySummary) => number | null | undefined,
  window = 7,
): number | null {
  const vals: number[] = [];
  for (let i = startIdx + 1; i < daily.length && vals.length < window; i++) {
    const v = pick(daily[i]!);
    if (v != null && Number.isFinite(v)) vals.push(v);
  }
  return mean(vals);
}

/** Score HRV: ratio to baseline, where parity = 70, +20% ~ 100, -20% ~ 30. */
function scoreHrv(value: number | null, baseline: number | null): number | null {
  if (value == null) return null;
  if (baseline == null || baseline === 0) return 70; // have a value, no baseline -> neutral-good
  const ratio = value / baseline;
  // 1.0 -> 75, clamp slope so ±25% spans most of the range
  const s = 75 + (ratio - 1) * 120;
  return clamp(s);
}

/** Score RHR: lower than baseline is good (inverted). */
function scoreRhr(value: number | null, baseline: number | null): number | null {
  if (value == null) return null;
  if (baseline == null || baseline === 0) return 70;
  const ratio = value / baseline;
  // below baseline -> above 75; above baseline -> below
  const s = 75 - (ratio - 1) * 220;
  return clamp(s);
}

/** Score sleep: 8h band optimal; falls off either side. */
function scoreSleep(value: number | null): number | null {
  if (value == null) return null;
  const diff = Math.abs(value - SLEEP_TARGET);
  // within 0.5h of target -> ~100; each hour off ~ -22
  const s = 100 - Math.max(0, diff - 0.5) * 22;
  return clamp(s);
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

export function deriveReadiness(daily: NormalizedDailySummary[]): ReadinessResult {
  const todayIdx = 0;
  const today = daily[todayIdx];

  const empty: ReadinessResult = {
    score: null,
    state: 'NO DATA',
    tone: 'mute',
    date: today?.date ?? null,
    inputs: {
      hrv: { value: null, baseline: null, sub: null },
      rhr: { value: null, baseline: null, sub: null },
      sleep: { value: null, sub: null },
    },
  };
  if (!today) return empty;

  const hrvVal = today.fitbit?.hrv ?? today.consensus.hrv ?? null;
  const rhrVal = today.fitbit?.rhr ?? today.consensus.rhr ?? null;
  const sleepVal = today.fitbit?.sleepHours ?? today.consensus.sleepHours ?? null;

  const hrvBase = baselineFrom(daily, todayIdx, (d) => d.fitbit?.hrv ?? d.consensus.hrv);
  const rhrBase = baselineFrom(daily, todayIdx, (d) => d.fitbit?.rhr ?? d.consensus.rhr);

  const hrvSub = scoreHrv(hrvVal, hrvBase);
  const rhrSub = scoreRhr(rhrVal, rhrBase);
  const sleepSub = scoreSleep(sleepVal);

  const parts: Array<{ sub: number; w: number }> = [];
  if (hrvSub != null) parts.push({ sub: hrvSub, w: 0.5 });
  if (rhrSub != null) parts.push({ sub: rhrSub, w: 0.3 });
  if (sleepSub != null) parts.push({ sub: sleepSub, w: 0.2 });

  const inputs = {
    hrv: { value: hrvVal, baseline: hrvBase, sub: hrvSub },
    rhr: { value: rhrVal, baseline: rhrBase, sub: rhrSub },
    sleep: { value: sleepVal, sub: sleepSub },
  };

  if (parts.length === 0) return { ...empty, inputs };

  const wSum = parts.reduce((a, p) => a + p.w, 0);
  const score = Math.round(parts.reduce((a, p) => a + p.sub * p.w, 0) / wSum);

  return {
    score,
    date: today.date,
    inputs,
    ...stateFor(score),
  };
}

export function stateFor(score: number): {
  state: ReadinessState;
  tone: 'signal' | 'warn' | 'alert' | 'mute';
} {
  if (score >= 75) return { state: 'PRIMED', tone: 'signal' };
  if (score >= 55) return { state: 'STEADY', tone: 'signal' };
  if (score >= 38) return { state: 'STRAINED', tone: 'warn' };
  return { state: 'LOW', tone: 'alert' };
}

export const READINESS_TONE_HEX: Record<ReadinessResult['tone'], string> = {
  signal: '#2dd4bf', // brand teal
  warn: '#fbbf24', // caution amber
  alert: '#fb7185', // alert rose
  mute: '#6b7888',
};

/** Friendly sentence-case label for a readiness state (UI display). */
export const READINESS_STATE_LABEL: Record<ReadinessState, string> = {
  PRIMED: 'Primed',
  STEADY: 'Steady',
  STRAINED: 'Strained',
  LOW: 'Low',
  'NO DATA': 'No data yet',
};

/** Map a readiness tone to the ReadinessRing's tone prop. */
export const READINESS_TONE_RING: Record<ReadinessResult['tone'], 'brand' | 'warn' | 'alert' | 'mute'> = {
  signal: 'brand',
  warn: 'warn',
  alert: 'alert',
  mute: 'mute',
};

/**
 * Theme-aware tone colors as CSS variables. Preferred over the static hexes for
 * anything rendered on a surface (instrument, pills) so the readiness color
 * follows the active light/dark palette and keeps AA contrast.
 */
export const READINESS_TONE_VAR: Record<ReadinessResult['tone'], string> = {
  signal: 'var(--signal)',
  warn: 'var(--warn)',
  alert: 'var(--alert)',
  mute: 'var(--ink-mute)',
};

export const READINESS_TONE_SOFT: Record<ReadinessResult['tone'], string> = {
  signal: 'var(--signal-soft)',
  warn: 'var(--warn-soft)',
  alert: 'var(--alert-soft)',
  mute: 'var(--hairline)',
};
