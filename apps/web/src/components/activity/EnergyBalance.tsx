import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { NormalizedDailySummary } from '@vcc/shared';
import { fmtNum, fmtDate } from '../../lib/formatters.js';
import { EmptyState } from '../shared/EmptyState.js';
import { VAR } from '../../lib/colors.js';
import { toActivitySeries, sum } from './activity-data.js';
import { axisTick, axisStroke, gridStroke, tooltipStyle, cursorFill } from './chart-theme.js';

const BURN_COLOR = VAR.signal; // brand teal — energy out
const IN_COLOR = VAR.warn; // warm amber — energy in (food logged)

/**
 * Calories in vs out. `caloriesIn` is frequently null/0 because food logging is
 * manual — when nothing is logged we still show the burn side and a friendly note
 * rather than a broken or empty chart.
 */
export function EnergyBalance({ daily }: { daily: NormalizedDailySummary[] }) {
  const series = toActivitySeries(daily);
  const data = series.map((d) => ({
    date: d.date,
    out: d.caloriesBurned,
    in: d.caloriesIn && d.caloriesIn > 0 ? d.caloriesIn : null,
  }));

  const hasBurn = data.some((d) => d.out != null);
  const hasIntake = data.some((d) => d.in != null);
  const netTotal = (() => {
    const totalIn = sum(data.map((d) => d.in));
    const totalOut = sum(data.map((d) => d.out));
    if (totalIn == null || totalOut == null) return null;
    return totalIn - totalOut;
  })();

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <h3 className="text-base font-semibold text-ink">Energy balance</h3>
          <p className="text-sm text-ink-mute mt-0.5">Calories in vs out</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <Legend color={BURN_COLOR} label="Burned" />
          <Legend color={IN_COLOR} label="Eaten" />
        </div>
      </div>

      {!hasBurn ? (
        <EmptyState title="No energy data yet" hint="Your calories burned will appear here once they sync." />
      ) : (
        <>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke={gridStroke} strokeDasharray="4 4" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => fmtDate(d as string, 'MMM d')}
                  tick={axisTick}
                  stroke={axisStroke}
                  tickLine={false}
                />
                <YAxis tick={axisTick} stroke={axisStroke} width={44} tickLine={false} />
                <Tooltip
                  cursor={{ fill: cursorFill }}
                  contentStyle={tooltipStyle}
                  labelFormatter={(l) => fmtDate(l as string)}
                  formatter={(v: number, name) => [Math.round(v).toLocaleString(), name === 'out' ? 'Burned' : 'Eaten']}
                />
                <Bar dataKey="out" fill={BURN_COLOR} radius={[6, 6, 0, 0]} maxBarSize={18} />
                <Bar dataKey="in" fill={IN_COLOR} radius={[6, 6, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {!hasIntake ? (
            <div className="mt-4 rounded-2xl bg-info-soft px-4 py-3 text-sm text-ink-dim leading-relaxed">
              No food logged today, so we're only showing energy burned. Log a meal to see your net balance.
            </div>
          ) : (
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-sm font-medium text-ink-dim">Net this range</span>
              <span className="num text-base font-semibold text-ink tabular-nums">
                {netTotal == null ? '—' : `${netTotal > 0 ? '+' : ''}${fmtNum(netTotal)} kcal`}
              </span>
              <span className="text-xs text-ink-mute">
                {netTotal == null ? '' : netTotal > 0 ? 'surplus' : netTotal < 0 ? 'deficit' : 'even'}
              </span>
            </div>
          )}
        </>
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
