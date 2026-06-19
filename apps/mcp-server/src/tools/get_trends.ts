import type { Database } from 'better-sqlite3';

// Fitbit Air is the primary source as of 2026-06. The dropped whoop/oura/apple
// columns (recovery/strain/readiness/etc.) are always NULL, so they're gone from
// the catalog. Vitals come from consensus_* (cross-device) or fitbit_* directly.
const COL_MAP: Record<string, string> = {
  hrv: 'consensus_hrv',
  rhr: 'consensus_rhr',
  sleep_hours: 'consensus_sleep_hours',
  deep_hours: 'fitbit_deep_hours',
  rem_hours: 'fitbit_rem_hours',
  steps: 'fitbit_steps',
  spo2: 'fitbit_spo2',
  temp_deviation: 'fitbit_skin_temp_delta',
  respiratory_rate: 'fitbit_respiratory_rate',
  calories_burned: 'fitbit_calories_burned',
  calories_in: 'fitbit_calories_in',
};

export function getTrends(db: Database, args: Record<string, unknown>) {
  const metric = String(args.metric ?? '');
  const days = Number(args.days ?? 30);
  const col = COL_MAP[metric];
  if (!col) return { error: `unknown metric: ${metric}` };

  const rows = db
    .prepare(
      `SELECT date, ${col} AS v FROM daily_summary
         WHERE date >= date('now', ?)
         ORDER BY date ASC`,
    )
    .all(`-${days} days`) as Array<{ date: string; v: number | null }>;

  const series = rows.map((r, i) => {
    const slice = rows.slice(Math.max(0, i - 6), i + 1);
    const nums = slice.map((s) => s.v).filter((v): v is number => typeof v === 'number');
    const ma = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    return { date: r.date, value: r.v, ma7: ma };
  });

  const nums = series.map((r) => r.value).filter((v): v is number => typeof v === 'number');
  const mean = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  return { metric, days, mean, series };
}
