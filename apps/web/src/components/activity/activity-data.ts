import type { NormalizedDailySummary } from '@vcc/shared';

/**
 * The `caloriesBurned` / `caloriesIn` fields are new on the Fitbit daily row and
 * are not yet present on the shared `FitbitDay` type (the lead/shared package owns
 * that type). Read them defensively so the UI compiles today and lights up the
 * moment the backing fields land. Never returns NaN — null means "no data".
 */
type FitbitExtras = {
  caloriesBurned?: number | null;
  caloriesIn?: number | null;
};

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export interface ActivityDay {
  date: string;
  steps: number | null;
  caloriesBurned: number | null;
  caloriesIn: number | null;
  /** in − out, only when both sides are present */
  balance: number | null;
}

export function toActivitySeries(daily: NormalizedDailySummary[]): ActivityDay[] {
  return [...daily]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const fb = (d.fitbit ?? {}) as FitbitExtras & { steps?: number | null };
      const steps = num(fb.steps);
      const caloriesBurned = num(fb.caloriesBurned);
      const caloriesIn = num(fb.caloriesIn);
      const balance =
        caloriesIn != null && caloriesBurned != null ? caloriesIn - caloriesBurned : null;
      return { date: d.date, steps, caloriesBurned, caloriesIn, balance };
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
