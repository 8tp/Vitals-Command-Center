import { useMemo } from 'react';
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
import { CHART, VAR } from '../../lib/colors.js';
import { fmtDate, fmtNum } from '../../lib/formatters.js';

const STAGE = {
  deep: { hex: VAR.signal, label: 'Deep' },
  rem: { hex: VAR.info, label: 'REM' },
  light: { hex: VAR.neutral, label: 'Light' },
  awake: { hex: VAR.inkMute, label: 'Awake' },
} as const;

interface Props {
  daily: NormalizedDailySummary[];
}

/** Stacked sleep stages from Fitbit. */
export function SleepArchitecture({ daily }: Props) {
  const data = useMemo(() => {
    return [...daily]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => {
        const f = d.fitbit;
        const deep = f?.deepHours ?? 0;
        const rem = f?.remHours ?? 0;
        const light = f?.lightHours ?? 0;
        const total = f?.sleepHours ?? deep + rem + light;
        return {
          date: d.date,
          deep,
          rem,
          light,
          awake: Math.max(0, total - (deep + rem + light)),
          _has: f?.sleepHours != null,
        };
      });
  }, [daily]);

  const hasData = data.some((d) => d._has);

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="font-display text-base font-semibold text-ink">Sleep stages</h3>
        <div className="flex items-center gap-3">
          {(Object.keys(STAGE) as (keyof typeof STAGE)[]).map((k) => (
            <span key={k} className="flex items-center gap-1.5 text-xs text-ink-dim">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: STAGE[k].hex }} />
              {STAGE[k].label}
            </span>
          ))}
        </div>
      </div>
      <div className="h-48">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, left: -14, bottom: 0 }} barCategoryGap="32%">
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
                width={40}
                unit="h"
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
                formatter={(v, n) => [`${fmtNum(v as number, 1)} h`, String(n)]}
              />
              <Bar dataKey="deep" stackId="s" fill={STAGE.deep.hex} />
              <Bar dataKey="rem" stackId="s" fill={STAGE.rem.hex} />
              <Bar dataKey="light" stackId="s" fill={STAGE.light.hex} />
              <Bar dataKey="awake" stackId="s" fill={STAGE.awake.hex} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center px-6 text-center">
            <span className="text-sm text-ink-mute">No sleep recorded for this range yet</span>
          </div>
        )}
      </div>
    </div>
  );
}
