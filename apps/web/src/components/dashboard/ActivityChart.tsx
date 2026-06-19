import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { NormalizedDailySummary, FitbitDay } from '@vcc/shared';
import { CHART, VAR } from '../../lib/colors.js';
import { fmtDate } from '../../lib/formatters.js';

type FitbitExt = FitbitDay & { caloriesBurned?: number | null };

interface Props {
  daily: NormalizedDailySummary[];
}

/** Daily steps (with a 10k goal line via color) — calories live in the grid. */
export function ActivityChart({ daily }: Props) {
  const data = useMemo(() => {
    return [...daily]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        date: d.date,
        steps: d.fitbit?.steps ?? null,
        burned: (d.fitbit as FitbitExt | null)?.caloriesBurned ?? null,
      }));
  }, [daily]);

  const hasData = data.some((d) => d.steps != null);
  const goal = 10000;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-base font-semibold text-ink">Daily steps</h3>
        <span className="rounded-full bg-bg-surface2 px-2.5 py-1 text-xs font-medium text-ink-mute">
          Goal 10,000
        </span>
      </div>
      <div className="h-48">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, left: -6, bottom: 0 }} barCategoryGap="32%">
              <CartesianGrid stroke={CHART.grid} strokeDasharray="2 6" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => fmtDate(d as string, 'MMM d')}
                tick={{ fill: CHART.tick, fontFamily: CHART.font, fontSize: 11 }}
                stroke={CHART.axis}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis
                tick={{ fill: CHART.tick, fontFamily: CHART.font, fontSize: 11 }}
                stroke={CHART.axis}
                width={44}
                tickFormatter={(v) => `${Math.round((v as number) / 1000)}k`}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: CHART.cursor, radius: 8 }}
                contentStyle={{
                  background: CHART.tooltipBg,
                  border: `1px solid ${CHART.tooltipBorder}`,
                  borderRadius: 14,
                  fontFamily: CHART.font,
                  fontSize: 12,
                  color: CHART.tooltipInk,
                  boxShadow: '0 6px 20px rgba(16,32,48,0.12)',
                  padding: '8px 12px',
                }}
                labelFormatter={(l) => fmtDate(l as string)}
                formatter={(v) => [(v as number).toLocaleString(), 'Steps']}
              />
              <Bar dataKey="steps" radius={[8, 8, 8, 8]}>
                {data.map((d, i) => (
                  <Cell key={i} fill={(d.steps ?? 0) >= goal ? VAR.signal : VAR.neutral} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center px-6 text-center">
            <span className="text-sm text-ink-mute">No activity recorded for this range yet</span>
          </div>
        )}
      </div>
    </div>
  );
}
