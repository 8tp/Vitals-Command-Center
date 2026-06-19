import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { NormalizedDailySummary } from '@vcc/shared';
import { fmtDate } from '../../lib/formatters.js';
import { EmptyState } from '../shared/EmptyState.js';
import { VAR } from '../../lib/colors.js';
import { toActivitySeries } from './activity-data.js';
import { axisTick, axisStroke, tooltipStyle, cursorFill } from './chart-theme.js';

const STEP_TARGET = 10000;

export function StepsTrend({ daily }: { daily: NormalizedDailySummary[] }) {
  const data = toActivitySeries(daily).map((d) => ({ date: d.date, steps: d.steps }));
  const hasData = data.some((d) => d.steps != null);

  return (
    <div className="card p-5">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-ink">Steps</h3>
        <p className="text-sm text-ink-mute mt-0.5">Daily totals vs your {fmtNumShort(STEP_TARGET)} goal</p>
      </div>
      {!hasData ? (
        <EmptyState title="No steps yet" hint="Your daily steps will show up here once they sync." />
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }} barCategoryGap="24%">
              <XAxis
                dataKey="date"
                tickFormatter={(d) => fmtDate(d as string, 'MMM d')}
                tick={axisTick}
                stroke={axisStroke}
                tickLine={false}
              />
              <YAxis tick={axisTick} stroke={axisStroke} width={44} tickLine={false} />
              <ReferenceLine
                y={STEP_TARGET}
                stroke="var(--ink-mute)"
                strokeDasharray="4 4"
                strokeWidth={1}
              />
              <Tooltip
                cursor={{ fill: cursorFill }}
                contentStyle={tooltipStyle}
                labelFormatter={(l) => fmtDate(l as string)}
                formatter={(v: number) => [v.toLocaleString(), 'Steps']}
              />
              <Bar dataKey="steps" radius={[6, 6, 0, 0]} maxBarSize={28}>
                {data.map((d, i) => (
                  <Cell
                    key={i}
                    fill={
                      d.steps == null
                        ? 'var(--surface-2)'
                        : d.steps >= STEP_TARGET
                          ? VAR.signal
                          : VAR.signal
                    }
                    fillOpacity={d.steps != null && d.steps >= STEP_TARGET ? 1 : 0.45}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function fmtNumShort(n: number): string {
  return n >= 1000 ? `${n / 1000}k` : String(n);
}
