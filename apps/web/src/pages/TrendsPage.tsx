import { useEffect, useState } from 'react';
import type { WeeklySummary } from '@vcc/shared';
import { apiGet } from '../lib/api.js';
import { PageHeader, HeaderDate } from '../components/layout/PageHeader.js';
import { Sparkline } from '../components/shared/Sparkline.js';
import { TrendIndicator } from '../components/shared/TrendIndicator.js';
import { fmtDate, fmtNum } from '../lib/formatters.js';

const SECTION = 'px-6 md:px-10 py-7 border-b border-hairline animate-fade-rise';

/** Trend charts read a longer window than the dashboard's daily view. */
const RANGE = '30d';

interface VitalsResponse {
  metric: string;
  range: { start: string; end: string; days: number };
  points: Array<{ date: string; value: number | null; source: string }>;
  movingAverage7d: Array<{ date: string; value: number | null }>;
  delta: { pct: number | null; direction: 'up' | 'down' | 'flat' };
}

interface ChartSpec {
  metric: string;
  label: string;
  unit: string;
  upIsGood: boolean;
  dp: number;
}

const CHARTS: ChartSpec[] = [
  { metric: 'hrv', label: 'HRV', unit: 'ms', upIsGood: true, dp: 0 },
  { metric: 'rhr', label: 'Resting HR', unit: 'bpm', upIsGood: false, dp: 0 },
  { metric: 'sleep_hours', label: 'Sleep', unit: 'h', upIsGood: true, dp: 1 },
];

/** Pull the consensus series (oldest→newest) out of a /api/vitals response. */
function consensusSeries(resp: VitalsResponse): { dates: string[]; values: (number | null)[] } {
  const consensus = resp.points.filter((p) => p.source === 'consensus');
  return { dates: consensus.map((p) => p.date), values: consensus.map((p) => p.value) };
}

export default function TrendsPage() {
  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);
  const [charts, setCharts] = useState<Record<string, VitalsResponse>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiGet<WeeklySummary>('/api/insights/weekly'),
      ...CHARTS.map((c) =>
        apiGet<VitalsResponse>(`/api/vitals?metric=${c.metric}&range=${RANGE}`),
      ),
    ])
      .then(([week, ...series]) => {
        if (cancelled) return;
        setWeekly(week);
        const map: Record<string, VitalsResponse> = {};
        series.forEach((s, i) => {
          map[CHARTS[i]!.metric] = s;
        });
        setCharts(map);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'failed to load trends');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="px-6 md:px-10 pt-8">
        <div className="card p-5 text-warn text-sm leading-relaxed">
          We couldn’t reach your trend data ({error}). Start the backend with{' '}
          <code className="rounded-md bg-bg-surface2 px-1.5 py-0.5 text-ink-dim">npm run dev:api</code>.
        </div>
      </div>
    );
  }

  if (loading && !weekly) {
    return (
      <div>
        <div className="px-6 md:px-10 pt-8 pb-5 border-b border-hairline">
          <div className="h-9 w-48 rounded-md bg-bg-surface2 animate-pulse" />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="px-6 md:px-10 py-9 border-b border-hairline">
            <div className="h-28 rounded-md bg-bg-surface2 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  const coverage = weekly ? `${weekly.daysWithData}/7 days` : '—';

  return (
    <div>
      <PageHeader
        title="Trends"
        subtitle="How your readiness signals are moving over time."
        date={<HeaderDate primary={`Last ${RANGE}`} caption={`WEEK · ${coverage}`} />}
      />

      {/* Weekly digest — deterministic week-over-week movement */}
      <section className={SECTION}>
        <div className="flex items-baseline justify-between mb-5">
          <h3 className="section-heading text-[15px]">This week vs last</h3>
          {weekly && (
            <span className="meta-mono">
              {fmtDate(weekly.start, 'MMM d')} – {fmtDate(weekly.end, 'MMM d')}
            </span>
          )}
        </div>

        {weekly && weekly.daysWithData > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-hairline rounded-xl overflow-hidden">
              {weekly.metrics.map((m) => (
                <div key={m.key} className="bg-bg-surface px-5 py-4">
                  <div className="label-micro">{m.label}</div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="font-display font-semibold num tracking-tightest text-ink text-[28px] leading-none">
                      {m.avg != null ? fmtNum(m.avg, m.key === 'sleep' ? 1 : 0) : '—'}
                    </span>
                    {m.avg != null && <span className="text-[12px] text-ink-mute">{m.unit}</span>}
                  </div>
                  <div className="mt-2.5 flex items-center gap-2">
                    <TrendIndicator
                      pct={m.deltaPct}
                      direction={m.direction}
                      upIsGood={m.betterWhen === 'higher'}
                    />
                    <span className="meta-mono">
                      {m.prevAvg != null ? `from ${fmtNum(m.prevAvg, m.key === 'sleep' ? 1 : 0)}${m.unit}` : 'no prior week'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {(weekly.bestSleep || weekly.worstSleep) && (
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 meta-mono">
                {weekly.bestSleep && (
                  <span>
                    Best night <span className="text-good">{weekly.bestSleep.hours}h</span> ·{' '}
                    {fmtDate(weekly.bestSleep.date, 'EEE MMM d')}
                  </span>
                )}
                {weekly.worstSleep && (
                  <span>
                    Shortest <span className="text-warn">{weekly.worstSleep.hours}h</span> ·{' '}
                    {fmtDate(weekly.worstSleep.date, 'EEE MMM d')}
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-[13px] text-ink-mute">
            No device data in the last week yet — sync a source to see week-over-week movement.
          </p>
        )}
      </section>

      {/* Per-metric trend charts over the longer window */}
      {CHARTS.map((c, idx) => {
        const resp = charts[c.metric];
        const series = resp ? consensusSeries(resp) : { dates: [], values: [] };
        const finite = series.values.filter((v): v is number => v != null && Number.isFinite(v));
        const latest = [...series.values].reverse().find((v) => v != null) ?? null;
        const avg = finite.length ? finite.reduce((a, b) => a + b, 0) / finite.length : null;
        const last = idx === CHARTS.length - 1;
        return (
          <section
            key={c.metric}
            className={last ? 'px-6 md:px-10 py-7 animate-fade-rise' : SECTION}
          >
            <div className="flex items-baseline justify-between mb-1">
              <div className="flex items-baseline gap-3">
                <h3 className="section-heading text-[15px]">{c.label}</h3>
                {resp && (
                  <TrendIndicator
                    pct={resp.delta.pct}
                    direction={resp.delta.direction}
                    upIsGood={c.upIsGood}
                  />
                )}
              </div>
              <span className="meta-mono">
                {latest != null ? `${fmtNum(latest, c.dp)}${c.unit} now` : '—'}
                {avg != null ? ` · ${fmtNum(avg, c.dp)}${c.unit} avg` : ''}
              </span>
            </div>
            {finite.length >= 2 ? (
              <>
                <Sparkline
                  values={series.values}
                  labels={series.dates}
                  baseline={avg}
                  height={120}
                  color={c.upIsGood ? 'var(--signal)' : 'var(--accent)'}
                  format={(v) => `${fmtNum(v, c.dp)}${c.unit}`}
                  formatLabel={(d) => fmtDate(d, 'EEE, MMM d')}
                />
                <div className="flex justify-between meta-mono mt-2">
                  <span>{series.dates[0] ? fmtDate(series.dates[0], 'MMM d') : ''}</span>
                  <span>
                    {series.dates[series.dates.length - 1]
                      ? fmtDate(series.dates[series.dates.length - 1]!, 'MMM d')
                      : ''}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-[13px] text-ink-mute mt-2">
                Two or more days of data will draw your {c.label.toLowerCase()} trend here.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
