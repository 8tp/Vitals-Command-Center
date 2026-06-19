import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { NormalizedDailySummary } from '@vcc/shared';
import { fmtDate } from '../../lib/formatters.js';
import { EmptyState } from '../shared/EmptyState.js';
import { VAR } from '../../lib/colors.js';
import { axisTick, axisStroke, gridStroke, tooltipStyle } from '../activity/chart-theme.js';
import { SLEEP_TARGET_HOURS, toSleepSeries } from './sleep-data.js';

export function SleepHoursTrend({ daily }: { daily: NormalizedDailySummary[] }) {
  const data = toSleepSeries(daily).map((n) => ({ date: n.date, hours: n.total }));
  const hasData = data.some((d) => d.hours != null);

  return (
    <div className="card p-5">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-ink">Time asleep</h3>
        <p className="text-sm text-ink-mute mt-0.5">Hours each night vs your {SLEEP_TARGET_HOURS}-hour goal</p>
      </div>
      {!hasData ? (
        <EmptyState title="No sleep yet" hint="Your nightly sleep will appear here once it syncs." />
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="sleepHoursFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={VAR.signal} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={VAR.signal} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={gridStroke} strokeDasharray="4 4" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => fmtDate(d as string, 'MMM d')}
                tick={axisTick}
                stroke={axisStroke}
                tickLine={false}
              />
              <YAxis tick={axisTick} stroke={axisStroke} width={38} unit="h" domain={[0, 'auto']} tickLine={false} />
              <ReferenceLine y={SLEEP_TARGET_HOURS} stroke="var(--ink-mute)" strokeDasharray="4 4" strokeWidth={1} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(l) => fmtDate(l as string)}
                formatter={(v: number) => [`${v.toFixed(1)} h`, 'Asleep']}
              />
              <Area
                type="monotone"
                dataKey="hours"
                stroke={VAR.signal}
                strokeWidth={2.5}
                fill="url(#sleepHoursFill)"
                connectNulls
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
