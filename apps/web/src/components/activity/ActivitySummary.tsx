import type { NormalizedDailySummary } from '@vcc/shared';
import { fmtNum } from '../../lib/formatters.js';
import { VAR } from '../../lib/colors.js';
import { toActivitySeries, avg, sum } from './activity-data.js';

const STEP_TARGET = 10000;

interface Props {
  daily: NormalizedDailySummary[];
}

/** Top-of-page summary tiles: today's steps, daily averages, range totals. */
export function ActivitySummary({ daily }: Props) {
  const series = toActivitySeries(daily);
  const days = series.length;

  const latest = series[series.length - 1] ?? null;
  const avgSteps = avg(series.map((d) => d.steps));
  const totalBurned = sum(series.map((d) => d.caloriesBurned));
  const stepPct =
    latest?.steps != null ? Math.min(100, Math.round((latest.steps / STEP_TARGET) * 100)) : null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Tile label="Steps today">
        <div className="num text-3xl font-semibold text-ink">
          {latest?.steps != null ? fmtNum(latest.steps) : '—'}
        </div>
        <StepProgress pct={stepPct} />
        <div className="text-xs text-ink-mute mt-2 tabular-nums">
          {stepPct != null ? `${stepPct}% of your ${fmtNum(STEP_TARGET)} goal` : 'No steps logged yet'}
        </div>
      </Tile>

      <Tile label="Daily average">
        <div className="num text-3xl font-semibold text-ink">
          {avgSteps != null ? fmtNum(avgSteps) : '—'}
        </div>
        <div className="text-xs text-ink-mute mt-2">Steps over {days} day{days === 1 ? '' : 's'}</div>
      </Tile>

      <Tile label="Energy burned today">
        <div className="num text-3xl font-semibold text-ink">
          {latest?.caloriesBurned != null ? fmtNum(latest.caloriesBurned) : '—'}
        </div>
        <div className="text-xs text-ink-mute mt-2">Active calories</div>
      </Tile>

      <Tile label="Burned this range">
        <div className="num text-3xl font-semibold text-ink">
          {totalBurned != null ? fmtNum(totalBurned) : '—'}
        </div>
        <div className="text-xs text-ink-mute mt-2">{days}-day total</div>
      </Tile>
    </div>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="text-sm font-medium text-ink-dim mb-2">{label}</div>
      {children}
    </div>
  );
}

function StepProgress({ pct }: { pct: number | null }) {
  return (
    <div
      className="track mt-3"
      role="progressbar"
      aria-valuenow={pct ?? 0}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="track-fill" style={{ width: `${pct ?? 0}%`, background: VAR.signal }} />
    </div>
  );
}
