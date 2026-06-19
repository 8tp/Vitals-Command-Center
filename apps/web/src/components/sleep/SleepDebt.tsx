import type { NormalizedDailySummary } from '@vcc/shared';
import { fmtDuration } from '../../lib/formatters.js';
import { SLEEP_TARGET_HOURS, toSleepSeries, deriveQuality, qualityLabel } from './sleep-data.js';

export function SleepDebt({ daily }: { daily: NormalizedDailySummary[] }) {
  const series = toSleepSeries(daily);
  const nights = series.filter((n) => n.total != null);

  const debt = nights.reduce((a, n) => a + Math.max(0, SLEEP_TARGET_HOURS - (n.total ?? 0)), 0);
  const avg = nights.length ? nights.reduce((a, n) => a + (n.total ?? 0), 0) / nights.length : null;
  const last = nights[nights.length - 1] ?? null;
  const lastQuality = last ? deriveQuality(last) : null;

  const debtTone = debt <= 2 ? 'text-signal' : debt <= 6 ? 'text-warn' : 'text-alert';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="card p-5">
        <div className="text-sm font-medium text-ink-dim mb-2">Sleep debt</div>
        <div className={`num text-3xl font-semibold ${nights.length ? debtTone : 'text-ink'}`}>
          {nights.length ? fmtDuration(debt) : '—'}
        </div>
        <div className="text-xs text-ink-mute mt-1.5">
          Behind your {SLEEP_TARGET_HOURS}-hour goal over {nights.length} night
          {nights.length === 1 ? '' : 's'}
        </div>
      </div>

      <div className="card p-5">
        <div className="text-sm font-medium text-ink-dim mb-2">Average sleep</div>
        <div className="num text-3xl font-semibold text-ink">{fmtDuration(avg)}</div>
        <div className="text-xs text-ink-mute mt-1.5">Per night in this range</div>
      </div>

      <div className="card p-5">
        <div className="text-sm font-medium text-ink-dim mb-2">Last night</div>
        <div className="num text-3xl font-semibold text-ink tabular-nums">
          {lastQuality == null ? '—' : lastQuality}
          {lastQuality != null && <span className="text-base font-normal text-ink-mute"> / 100</span>}
        </div>
        <div className="text-xs text-ink-mute mt-1.5">
          {capitalize(qualityLabel(lastQuality))} · from your stage balance
        </div>
      </div>
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
