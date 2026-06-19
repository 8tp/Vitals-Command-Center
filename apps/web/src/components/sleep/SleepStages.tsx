import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { NormalizedDailySummary } from '@vcc/shared';
import { fmtDate } from '../../lib/formatters.js';
import { EmptyState } from '../shared/EmptyState.js';
import { axisTick, axisStroke, gridStroke, tooltipStyle, cursorFill } from '../activity/chart-theme.js';
import { STAGE_COLOR, STAGE_LABEL, toSleepSeries } from './sleep-data.js';

export function SleepStages({ daily }: { daily: NormalizedDailySummary[] }) {
  const data = toSleepSeries(daily).map((n) => ({
    date: n.date,
    deep: n.deep ?? 0,
    rem: n.rem ?? 0,
    light: n.light ?? 0,
    awake: n.awake,
  }));
  const hasData = data.some((d) => d.deep + d.rem + d.light > 0);

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <h3 className="text-base font-semibold text-ink">Sleep stages</h3>
          <p className="text-sm text-ink-mute mt-0.5">How your night was spent</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
          {(['deep', 'rem', 'light', 'awake'] as const).map((k) => (
            <Legend key={k} color={STAGE_COLOR[k]} label={STAGE_LABEL[k]} />
          ))}
        </div>
      </div>
      {!hasData ? (
        <EmptyState title="No stage data yet" hint="Your deep, REM and light sleep will show up here." />
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }} barCategoryGap="22%">
              <CartesianGrid stroke={gridStroke} strokeDasharray="4 4" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => fmtDate(d as string, 'MMM d')}
                tick={axisTick}
                stroke={axisStroke}
                tickLine={false}
              />
              <YAxis tick={axisTick} stroke={axisStroke} width={38} unit="h" tickLine={false} />
              <Tooltip
                cursor={{ fill: cursorFill }}
                contentStyle={tooltipStyle}
                labelFormatter={(l) => fmtDate(l as string)}
                formatter={(v: number, name) => [`${v.toFixed(1)} h`, STAGE_LABEL[name as keyof typeof STAGE_LABEL] ?? name]}
              />
              <Bar dataKey="deep" stackId="s" fill={STAGE_COLOR.deep} />
              <Bar dataKey="rem" stackId="s" fill={STAGE_COLOR.rem} />
              <Bar dataKey="light" stackId="s" fill={STAGE_COLOR.light} />
              <Bar dataKey="awake" stackId="s" fill={STAGE_COLOR.awake} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-ink-dim">
      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
