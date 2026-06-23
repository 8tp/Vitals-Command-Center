import type { Database } from 'better-sqlite3';
import type { NormalizedDailySummary, WeeklyMetric, WeeklySummary } from '@vcc/shared';
import { queries } from '@vcc/db';
import { addDaysIso, todayIso } from '../lib/range.js';

// Deterministic, AI-free weekly digest: average each consensus metric over the
// trailing 7 days and compare to the 7 days before that. Pure read + arithmetic
// so it always works (no provider needed) and is easy to test.

interface MetricSpec {
  key: string;
  label: string;
  unit: string;
  betterWhen: 'higher' | 'lower';
  pick: (d: NormalizedDailySummary) => number | null;
}

const METRICS: MetricSpec[] = [
  { key: 'hrv', label: 'HRV', unit: 'ms', betterWhen: 'higher', pick: (d) => d.consensus.hrv },
  { key: 'rhr', label: 'Resting HR', unit: 'bpm', betterWhen: 'lower', pick: (d) => d.consensus.rhr },
  {
    key: 'sleep',
    label: 'Sleep',
    unit: 'h',
    betterWhen: 'higher',
    pick: (d) => d.consensus.sleepHours,
  },
];

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function round(v: number | null, dp = 1): number | null {
  if (v == null) return null;
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

function buildMetric(spec: MetricSpec, week: NormalizedDailySummary[], prev: NormalizedDailySummary[]): WeeklyMetric {
  const cur = week.map(spec.pick).filter((v): v is number => v != null && Number.isFinite(v));
  const before = prev.map(spec.pick).filter((v): v is number => v != null && Number.isFinite(v));
  const avg = mean(cur);
  const prevAvg = mean(before);
  const deltaPct = avg != null && prevAvg != null && prevAvg !== 0 ? ((avg - prevAvg) / Math.abs(prevAvg)) * 100 : null;
  const direction = deltaPct == null ? 'flat' : deltaPct > 1 ? 'up' : deltaPct < -1 ? 'down' : 'flat';
  return {
    key: spec.key,
    label: spec.label,
    unit: spec.unit,
    avg: round(avg, spec.key === 'sleep' ? 1 : 0),
    prevAvg: round(prevAvg, spec.key === 'sleep' ? 1 : 0),
    deltaPct: round(deltaPct, 1),
    direction,
    betterWhen: spec.betterWhen,
    samples: cur.length,
  };
}

/**
 * Compute the trailing-7-day digest ending at `end` (default today), comparing
 * each metric to the prior 7-day window.
 */
export function computeWeeklySummary(db: Database, end: string = todayIso()): WeeklySummary {
  const start = addDaysIso(end, -6);
  const prevStart = addDaysIso(end, -13);
  const prevEnd = addDaysIso(end, -7);

  const week = queries.dailySummary.list(db, start, end);
  const prev = queries.dailySummary.list(db, prevStart, prevEnd);

  const daysWithData = week.filter((d) => d.devices.active > 0).length;
  const metrics = METRICS.map((m) => buildMetric(m, week, prev));

  // Sleep highs/lows from this week's consensus hours.
  const nights = week
    .map((d) => ({ date: d.date, hours: d.consensus.sleepHours }))
    .filter((n): n is { date: string; hours: number } => n.hours != null && n.hours > 0);
  let bestSleep: WeeklySummary['bestSleep'] = null;
  let worstSleep: WeeklySummary['worstSleep'] = null;
  for (const n of nights) {
    if (!bestSleep || n.hours > bestSleep.hours) bestSleep = { date: n.date, hours: round(n.hours, 1)! };
    if (!worstSleep || n.hours < worstSleep.hours) worstSleep = { date: n.date, hours: round(n.hours, 1)! };
  }

  return { start, end, daysWithData, metrics, bestSleep, worstSleep };
}
