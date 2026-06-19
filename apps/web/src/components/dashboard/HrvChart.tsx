import { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  Line,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { NormalizedDailySummary } from '@vcc/shared';
import { DEVICE_COLOR } from '@vcc/shared';
import { CHART } from '../../lib/colors.js';
import { fmtDate, fmtNum } from '../../lib/formatters.js';

const FITBIT = DEVICE_COLOR.fitbit;

interface Props {
  daily: NormalizedDailySummary[];
}

/** HRV trend with a dashed 7-day baseline reference — the readiness anchor. */
export function HrvChart({ daily }: Props) {
  const { data, baseline } = useMemo(() => {
    const asc = [...daily].sort((a, b) => a.date.localeCompare(b.date));
    const rows = asc.map((d) => ({
      date: d.date,
      hrv: d.fitbit?.hrv ?? d.consensus.hrv ?? null,
    }));
    const recent = rows
      .slice(-7)
      .map((r) => r.hrv)
      .filter((v): v is number => v != null && Number.isFinite(v));
    const base = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : null;
    return { data: rows, baseline: base };
  }, [daily]);

  const hasData = data.some((d) => d.hrv != null);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display text-base font-semibold text-ink">Heart rate variability</h3>
          <div className="text-sm text-ink-mute mt-0.5">Overnight trend from Fitbit</div>
        </div>
        {baseline != null && (
          <div className="text-sm text-ink-mute">
            7-day average{' '}
            <span className="text-ink-dim font-medium tabular-nums">{fmtNum(baseline, 0)} ms</span>
          </div>
        )}
      </div>
      <div className="h-56">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
              <defs>
                <linearGradient id="hrvFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={FITBIT} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={FITBIT} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={CHART.grid} strokeDasharray="2 6" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: CHART.tick, fontFamily: CHART.font, fontSize: 11 }}
                tickFormatter={(d) => fmtDate(d as string, 'MMM d')}
                stroke={CHART.axis}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis
                tick={{ fill: CHART.tick, fontFamily: CHART.font, fontSize: 11 }}
                stroke={CHART.axis}
                width={40}
                tickLine={false}
                axisLine={false}
                domain={['auto', 'auto']}
              />
              <Tooltip
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
                formatter={(v) => [`${fmtNum(v as number, 0)} ms`, 'HRV']}
              />
              {baseline != null && (
                <ReferenceLine
                  y={baseline}
                  stroke="var(--ink-mute)"
                  strokeDasharray="4 6"
                  strokeWidth={1.5}
                />
              )}
              <Area
                type="natural"
                dataKey="hrv"
                stroke="none"
                fill="url(#hrvFill)"
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="natural"
                dataKey="hrv"
                stroke={FITBIT}
                strokeWidth={3}
                strokeLinecap="round"
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0 }}
                connectNulls
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <ChartEmpty label="No heart rate variability recorded for this range yet" />
        )}
      </div>
    </div>
  );
}

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="h-full flex items-center justify-center px-6 text-center">
      <span className="text-sm text-ink-mute">{label}</span>
    </div>
  );
}
