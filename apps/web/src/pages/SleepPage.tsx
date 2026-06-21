import type { SleepSession } from '@vcc/shared';
import { useHealthData } from '../hooks/useHealthData.js';
import { Metric } from '../components/shared/Metric.js';
import { Sparkline } from '../components/shared/Sparkline.js';
import { StageBar } from '../components/shared/StageBar.js';
import { PageHeader, HeaderDate } from '../components/layout/PageHeader.js';
import { Hypnogram } from '../components/sleep/Hypnogram.js';
import { fmtDate } from '../lib/formatters.js';
import { SLEEP_TARGET_HOURS, toSleepSeries } from '../components/sleep/sleep-data.js';

const SECTION = 'px-6 md:px-10 py-7 border-b border-hairline animate-fade-rise';

/* ---- helpers ---- */
function hms(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}
function clock(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}
function timeInBed(s: SleepSession): number | null {
  const a = new Date(s.startTime).getTime();
  const b = new Date(s.endTime).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return null;
  return (b - a) / 60000;
}
function efficiency(s: SleepSession): number | null {
  const tib = timeInBed(s);
  if (tib && tib > 0) return Math.round((s.totalMinutes / tib) * 100);
  return s.sleepScore != null ? Math.round(s.sleepScore) : null;
}
/** Qualitative restoration word + whether it's a "good" tone, from restorative-stage share. */
function restoration(s: SleepSession): { word: string; good: boolean } {
  const restorative = s.deepMinutes + s.remMinutes;
  const share = s.totalMinutes > 0 ? restorative / s.totalMinutes : 0;
  if (share >= 0.42) return { word: 'High', good: true };
  if (share >= 0.32) return { word: 'Solid', good: true };
  if (share >= 0.22) return { word: 'Fair', good: false };
  return { word: 'Low', good: false };
}
function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
function fmtSignedMin(min: number): string {
  const v = Math.round(min);
  return `${v >= 0 ? '+' : '−'}${Math.abs(v)}m`;
}

export default function SleepPage() {
  const { daily, sleep, loading, error } = useHealthData();

  if (error) {
    return (
      <div className="px-6 md:px-10 pt-8">
        <div className="card p-5 text-warn text-sm leading-relaxed">
          We couldn’t reach your sleep data ({error}). Start the backend with{' '}
          <code className="rounded-md bg-bg-surface2 px-1.5 py-0.5 text-ink-dim">npm run dev:api</code>.
        </div>
      </div>
    );
  }

  if (loading && sleep.length === 0 && daily.length === 0) {
    return (
      <div>
        <div className="px-6 md:px-10 pt-8 pb-5 border-b border-hairline">
          <div className="h-9 w-48 rounded-md bg-bg-surface2 animate-pulse" />
        </div>
        <div className="px-6 md:px-10 py-9 border-b border-hairline">
          <div className="h-20 rounded-md bg-bg-surface2 animate-pulse" />
        </div>
        <div className="px-6 md:px-10 py-9">
          <div className="h-40 rounded-md bg-bg-surface2 animate-pulse" />
        </div>
      </div>
    );
  }

  // Latest real session (newest first), and the previous one for the delta.
  const last = sleep.find((s) => !s.isNap) ?? sleep[0] ?? null;
  const prev = last ? sleep.filter((s) => !s.isNap && s.id !== last.id)[0] ?? null : null;

  // 14-day series from `daily` (ascending) for trend + debt.
  const series = toSleepSeries(daily);
  const nights = series.filter((n) => n.total != null);
  const sleepHours = series.map((n) => n.total);
  const avgHours = nights.length ? nights.reduce((a, n) => a + (n.total ?? 0), 0) / nights.length : null;

  // Rolling deficit vs target across the most recent 7 recorded nights.
  const last7 = nights.slice(-7);
  const debtHours = last7.reduce((a, n) => a + Math.max(0, SLEEP_TARGET_HOURS - (n.total ?? 0)), 0);
  const debtMin = Math.round(debtHours * 60);

  const consistency = consistencySentence(sleep, debtMin);

  const today = last?.date ?? daily[0]?.date ?? new Date().toISOString().slice(0, 10);
  const firstDate = series[0]?.date ?? today;

  const deltaMin = last && prev ? last.totalMinutes - prev.totalMinutes : null;
  const subtitle =
    last == null
      ? 'No sleep recorded yet — connect a device and sync to see last night.'
      : deltaMin == null
        ? `${hms(last.totalMinutes)} last night.`
        : `${hms(last.totalMinutes)} last night — ${fmtSignedMin(deltaMin)} vs the night before.`;

  const stages = last
    ? { deep: last.deepMinutes, rem: last.remMinutes, light: last.lightMinutes, awake: last.awakeMinutes }
    : null;
  const restore = last ? restoration(last) : null;
  const eff = last ? efficiency(last) : null;

  return (
    <div>
      <PageHeader
        title="Sleep"
        subtitle={subtitle}
        date={
          <HeaderDate
            primary={fmtDate(today, 'EEEE, MMMM d')}
            caption={last ? `WOKE ${clock(last.endTime)}` : 'NO SESSION'}
          />
        }
      />

      {/* 1 — Summary row */}
      <section className={SECTION}>
        {last ? (
          <div className="grid grid-cols-2 sm:grid-cols-4">
            <Metric
              size="xl"
              className="pr-6 py-1"
              label="Time asleep"
              value={hms(last.totalMinutes)}
              delta={
                deltaMin != null
                  ? {
                      text: fmtSignedMin(deltaMin),
                      dir: deltaMin >= 0 ? 'up' : 'down',
                      tone: deltaMin >= 0 ? 'good' : 'warn',
                    }
                  : undefined
              }
            />
            <Metric
              size="xl"
              className="px-6 py-1 border-l border-hairline"
              label="Efficiency"
              value={eff != null ? String(eff) : '—'}
              unit={eff != null ? '%' : undefined}
            />
            <Metric
              size="xl"
              className="px-6 py-1 border-l border-hairline max-sm:border-l-0 max-sm:pl-0 max-sm:border-t max-sm:pt-4 max-sm:mt-3"
              label="Resting HR"
              value={last.avgHr != null ? String(Math.round(last.avgHr)) : '—'}
              unit={last.avgHr != null ? 'bpm' : undefined}
            />
            <Metric
              size="xl"
              className="px-6 py-1 border-l border-hairline max-sm:pt-4 max-sm:mt-3 max-sm:border-t"
              label="Restoration"
              value={
                restore ? <span className={restore.good ? 'text-good' : undefined}>{restore.word}</span> : '—'
              }
            />
          </div>
        ) : (
          <EmptyLine text="No sleep recorded last night." />
        )}
      </section>

      {/* 2 — Last night hypnogram */}
      <section className={SECTION}>
        <div className="flex items-baseline justify-between mb-5">
          <h3 className="section-heading text-[15px]">Last night</h3>
          <span className="meta-mono">
            {last ? `${clock(last.startTime)} → ${clock(last.endTime)}` : '—'}
          </span>
        </div>
        {stages ? (
          <Hypnogram stages={stages} startTime={last?.startTime} endTime={last?.endTime} />
        ) : (
          <EmptyLine text="No stage breakdown for last night." />
        )}
      </section>

      {/* 3 — Stages | Sleep debt */}
      <section className="grid md:grid-cols-[1.35fr_1fr] border-b border-hairline animate-fade-rise">
        {/* LEFT — stages */}
        <div className="px-6 md:px-10 py-7">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="section-heading text-[15px]">Stages</h3>
            <span className="meta-mono">{last ? `${hms(last.totalMinutes)} total` : '—'}</span>
          </div>
          {stages ? <StageLegend stages={stages} /> : <EmptyLine text="No stages to show." />}
        </div>
        {/* RIGHT — sleep debt */}
        <div className="px-6 md:px-10 py-7 md:border-l border-hairline max-md:border-t">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="section-heading text-[15px]">Sleep debt</h3>
            <span className="meta-mono">rolling 7-day</span>
          </div>
          {last7.length ? (
            <>
              <div
                className={`font-display font-semibold num tracking-tightest leading-none text-[clamp(30px,3.6vw,42px)] ${
                  debtMin > 0 ? 'text-warn' : 'text-good'
                }`}
              >
                {debtMin > 0 ? `−${hms(debtMin)}` : 'On track'}
              </div>
              <p className="mt-3 text-[12.5px] text-ink-mute leading-relaxed max-w-sm">{consistency}</p>
            </>
          ) : (
            <EmptyLine text="Not enough nights yet to gauge debt." />
          )}
        </div>
      </section>

      {/* 4 — 14-day sleep (last section: no border-b) */}
      <section className="px-6 md:px-10 py-7 animate-fade-rise">
        <div className="flex items-baseline justify-between mb-1">
          <h3 className="section-heading text-[15px]">14-day sleep</h3>
          <span className="meta-mono">
            {avgHours != null ? `${hms(avgHours * 60)} avg` : '—'} · {SLEEP_TARGET_HOURS}h goal
          </span>
        </div>
        {nights.length >= 2 ? (
          <>
            <Sparkline values={sleepHours} baseline={SLEEP_TARGET_HOURS} height={120} />
            <div className="flex justify-between meta-mono mt-2">
              <span>{fmtDate(firstDate, 'MMM d')}</span>
              <span>{fmtDate(today, 'MMM d')}</span>
            </div>
          </>
        ) : (
          <EmptyLine text="Two or more nights of data will draw your trend here." />
        )}
      </section>
    </div>
  );
}

/* ---- sub-pieces ---- */

function StageLegend({ stages }: { stages: { deep: number; rem: number; light: number; awake: number } }) {
  const total = stages.deep + stages.rem + stages.light + stages.awake || 1;
  const rows = [
    { key: 'deep', label: 'Deep', cls: 'seg-deep', mins: stages.deep },
    { key: 'rem', label: 'REM', cls: 'seg-rem', mins: stages.rem },
    { key: 'light', label: 'Light', cls: 'seg-light', mins: stages.light },
    { key: 'awake', label: 'Awake', cls: 'seg-awake', mins: stages.awake },
  ] as const;
  return (
    <div>
      <StageBar stages={stages} showLegend={false} />
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-5">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2.5">
            <span className={`${r.cls} w-[11px] h-[11px] rounded-[4px] shrink-0`} />
            <span className="text-[12.5px] font-medium text-ink-dim">{r.label}</span>
            <span className="ml-auto num text-[13px] font-semibold text-ink whitespace-nowrap">
              {hms(r.mins)} · {pct(r.mins, total)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="text-[13px] text-ink-mute">{text}</p>;
}

/** A short consistency sentence keyed off debt + bedtime spread. */
function consistencySentence(sleep: SleepSession[], debtMin: number): string {
  const recent = sleep.filter((s) => !s.isNap).slice(0, 7);
  const bedMins = recent
    .map((s) => {
      const d = new Date(s.startTime);
      if (Number.isNaN(d.getTime())) return null;
      // minutes-from-midnight, wrapped so late-evenings cluster together
      let m = d.getHours() * 60 + d.getMinutes();
      if (m < 12 * 60) m += 24 * 60; // push post-midnight bedtimes past the evening
      return m;
    })
    .filter((m): m is number => m != null);

  let spread: number | null = null;
  if (bedMins.length >= 2) {
    spread = Math.round((Math.max(...bedMins) - Math.min(...bedMins)) / Math.max(1, bedMins.length - 1));
  }

  const debtPart =
    debtMin <= 0
      ? 'You’re square with your sleep target.'
      : debtMin <= 90
        ? 'You’re carrying a mild deficit — one solid night clears it.'
        : 'You’re building a real deficit — bank a couple of full nights.';

  const consistPart =
    spread == null
      ? ''
      : spread <= 25
        ? ` Consistency is strong — bedtime varied only ${spread} min on average.`
        : spread <= 60
          ? ` Bedtime drifted about ${spread} min night to night — worth tightening.`
          : ` Bedtimes are scattered (~${spread} min apart) — a steadier schedule would help.`;

  return debtPart + consistPart;
}
