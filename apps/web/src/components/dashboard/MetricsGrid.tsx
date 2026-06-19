import type { NormalizedDailySummary, FitbitDay } from '@vcc/shared';
import { MetricCard } from './MetricCard.js';
import { fmtNum, fmtDate } from '../../lib/formatters.js';

interface Props {
  /** Descending-date-order slice of daily_summary rows. */
  daily: NormalizedDailySummary[];
}

type FitbitExt = FitbitDay;

interface Latest {
  value: number | null;
  date: string | null;
}

/** Walk descending days; return first finite value for a Fitbit metric. */
function latest(
  daily: NormalizedDailySummary[],
  pick: (f: FitbitExt) => number | null | undefined,
): Latest {
  for (const d of daily) {
    if (!d.fitbit) continue;
    const v = pick(d.fitbit as FitbitExt);
    if (v != null && Number.isFinite(v)) return { value: v, date: d.date };
  }
  return { value: null, date: null };
}

function trendPct(now: number | null, prev: number | null): number | null {
  if (now == null || prev == null || prev === 0) return null;
  return ((now - prev) / Math.abs(prev)) * 100;
}

/** Previous finite value strictly before `latest.date`. */
function prevOf(
  daily: NormalizedDailySummary[],
  latestDate: string | null,
  pick: (f: FitbitExt) => number | null | undefined,
): number | null {
  if (!latestDate) return null;
  const idx = daily.findIndex((d) => d.date === latestDate);
  for (let i = idx + 1; i < daily.length; i++) {
    const f = daily[i]?.fitbit;
    if (!f) continue;
    const v = pick(f as FitbitExt);
    if (v != null && Number.isFinite(v)) return v;
  }
  return null;
}

function stale(date: string | null, today: string | undefined): string | undefined {
  if (!date || !today || date === today) return undefined;
  return `Last read ${fmtDate(date, 'MMM d')}`;
}

export function MetricsGrid({ daily }: Props) {
  const todayDate = daily[0]?.date;

  const spo2 = latest(daily, (f) => f.spo2);
  const resp = latest(daily, (f) => f.respiratoryRate);
  const skin = latest(daily, (f) => f.skinTempDelta);
  const steps = latest(daily, (f) => f.steps);
  const burned = latest(daily, (f) => f.activeCaloriesBurned);
  const intake = latest(daily, (f) => f.caloriesIn);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
      <MetricCard
        label="Blood oxygen"
        value={fmtNum(spo2.value, 0)}
        unit="%"
        empty={spo2.value == null}
        footnote={stale(spo2.date, todayDate)}
      />
      <MetricCard
        label="Breathing rate"
        value={fmtNum(resp.value, 1)}
        unit="br/min"
        empty={resp.value == null}
        footnote={stale(resp.date, todayDate)}
      />
      <MetricCard
        label="Skin temperature"
        value={skin.value == null ? '—' : `${skin.value > 0 ? '+' : ''}${fmtNum(skin.value, 1)}`}
        unit="°C"
        empty={skin.value == null}
        footnote={stale(skin.date, todayDate) ?? 'vs your baseline'}
      />
      <MetricCard
        label="Steps today"
        value={steps.value == null ? '—' : steps.value.toLocaleString()}
        empty={steps.value == null}
        trendPct={trendPct(steps.value, prevOf(daily, steps.date, (f) => f.steps))}
        footnote={stale(steps.date, todayDate)}
      />
      <MetricCard
        label="Calories burned"
        value={burned.value == null ? '—' : Math.round(burned.value).toLocaleString()}
        unit="kcal"
        empty={!burned.value}
        footnote={burned.value ? stale(burned.date, todayDate) : 'Not tracked'}
      />
      <MetricCard
        label="Calories eaten"
        value={intake.value == null ? '—' : Math.round(intake.value).toLocaleString()}
        unit="kcal"
        empty={!intake.value}
        footnote={intake.value ? stale(intake.date, todayDate) : 'Not logged'}
      />
    </div>
  );
}
