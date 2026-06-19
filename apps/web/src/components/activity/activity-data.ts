import type { NormalizedDailySummary } from '@vcc/shared';

/**
 * `activeCaloriesBurned` is active energy only (Google Health exposes no basal/
 * total for Fitbit Air), so the energy "balance" below is intake − active burn,
 * not a true net. Never returns NaN — null means "no data".
 */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export interface ActivityDay {
  date: string;
  steps: number | null;
  activeCaloriesBurned: number | null;
  caloriesIn: number | null;
  /** in − active out, only when both sides are present */
  balance: number | null;
}

export function toActivitySeries(daily: NormalizedDailySummary[]): ActivityDay[] {
  return [...daily]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const fb = d.fitbit;
      const steps = num(fb?.steps);
      const activeCaloriesBurned = num(fb?.activeCaloriesBurned);
      const caloriesIn = num(fb?.caloriesIn);
      const balance =
        caloriesIn != null && activeCaloriesBurned != null ? caloriesIn - activeCaloriesBurned : null;
      return { date: d.date, steps, activeCaloriesBurned, caloriesIn, balance };
    });
}

export function sum(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v != null);
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
}

export function avg(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v != null);
  return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
}
