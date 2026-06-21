import { useId } from 'react';
import type { NormalizedDailySummary, FitbitDay, Workout } from '@vcc/shared';
import { useHealthData } from '../hooks/useHealthData.js';
import { Metric } from '../components/shared/Metric.js';
import { PageHeader, HeaderDate } from '../components/layout/PageHeader.js';
import { WorkoutRow } from '../components/activity/WorkoutRow.js';
import { fmtDate } from '../lib/formatters.js';
import { useUnits } from '../stores/unitsStore.js';
import { fmtDistance, paceFor } from '../lib/units.js';

const STEP_TARGET = 10000;
const SECTION = 'px-6 md:px-10 py-7 border-b border-hairline animate-fade-rise';

/* ---- run-strip math (mirrors DashboardPage) ---- */
function findRun(workouts: Workout[]): Workout | null {
  return workouts.find((w) => /run|jog/i.test(w.sport)) ?? workouts[0] ?? null;
}
function hms(min: number): string {
  const total = Math.round(min * 60);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    : `${m}:${s.toString().padStart(2, '0')}`;
}

/* ---- daily helpers (descending-date `daily`) ---- */
function latest(daily: NormalizedDailySummary[], pick: (f: FitbitDay) => number | null | undefined) {
  for (const d of daily) {
    const v = d.fitbit ? pick(d.fitbit) : null;
    if (v != null && Number.isFinite(v)) return v;
  }
  return null;
}

export default function WorkoutsPage() {
  const { daily, workouts, loading, error } = useHealthData();
  const units = useUnits();

  if (error) {
    return (
      <div className="px-6 md:px-10 pt-8">
        <div className="card p-5 text-warn text-sm leading-relaxed">
          We couldn’t reach your data ({error}). Start the backend with{' '}
          <code className="rounded-md bg-bg-surface2 px-1.5 py-0.5 text-ink-dim">npm run dev:api</code>.
        </div>
      </div>
    );
  }

  if (loading && daily.length === 0 && workouts.length === 0) {
    return (
      <div>
        <div className="px-6 md:px-10 pt-8 pb-5 border-b border-hairline">
          <div className="h-9 w-64 rounded-md bg-bg-surface2 animate-pulse" />
        </div>
        <div className="px-6 md:px-10 py-7 border-b border-hairline flex gap-5 items-center">
          <div className="w-14 h-14 rounded-2xl bg-bg-surface2 animate-pulse" />
          <div className="flex-1 h-16 rounded-md bg-bg-surface2 animate-pulse" />
        </div>
        <div className="px-6 md:px-10 py-7 space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 rounded-md bg-bg-surface2 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const today = daily[0]?.date ?? new Date().toISOString().slice(0, 10);
  const run = findRun(workouts);
  const heroDist = run ? fmtDistance(run.distanceKm, units) : null;
  const heroPace = run ? paceFor(run.durationMinutes, run.distanceKm, units) : null;

  // subtitle: count today's workouts + describe the hero run
  const todaysWorkouts = workouts.filter((w) => w.date === today);
  const heroIsToday = run?.date === today;
  const subtitle =
    run == null
      ? 'No workouts synced yet — connect Strava in Settings to see your runs here.'
      : heroIsToday && run.distanceKm != null
        ? `${todaysWorkouts.length === 1 ? 'One' : todaysWorkouts.length} ${todaysWorkouts.length === 1 ? 'workout' : 'workouts'} today — ${heroDist!.value} ${heroDist!.unit} logged. Steps on track for your 10k goal.`
        : 'Your recent Apple Watch and Strava sessions, with steps and energy below.';

  // steps + energy (today, from Fitbit)
  const steps = latest(daily, (f) => f.steps);
  const burned = latest(daily, (f) => f.activeCaloriesBurned);
  const eaten = latest(daily, (f) => f.caloriesIn);
  const net = burned != null && eaten != null ? Math.round(burned - eaten) : null;
  const stepPct = steps != null ? Math.round((steps / STEP_TARGET) * 100) : null;

  // last 7 days of steps, oldest → newest (for the bar trend)
  const stepDays = [...daily]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7)
    .map((d) => ({ date: d.date, steps: d.fitbit?.steps ?? null }));

  return (
    <div>
      <PageHeader
        title="Activity"
        subtitle={subtitle}
        date={<HeaderDate primary={fmtDate(today, 'EEEE, MMMM d')} caption={`DAY ${dayOfYear(today)} · ${today.slice(0, 4)}`} />}
      />

      {/* Today's run hero — reuses the dashboard run-strip layout */}
      {run && (
        <section className={`${SECTION} flex items-center gap-5 flex-wrap`}>
          <HeroBadge source={run.source} />
          <div className="min-w-0">
            <div className="label-micro" style={{ color: run.source === 'strava' ? 'var(--device-strava)' : 'var(--device-apple)' }}>
              {heroIsToday ? 'Today' : fmtDate(run.date, 'EEE')} · {run.source === 'strava' ? 'Strava' : run.source === 'apple' ? 'Apple Watch' : run.source}
            </div>
            <div className="font-display font-semibold text-[22px] tracking-tight mt-1 capitalize truncate">{run.sport}</div>
            <div className="meta-mono mt-1">
              {[run.startTime ? run.startTime.slice(11, 16) : null, zoneLabel(run), heroPace ? `${heroPace.value}${heroPace.unit} avg pace` : null]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:items-center ml-auto">
            {run.distanceKm != null && (
              <Metric size="xl" className="pr-6 sm:px-6" label="Distance" value={heroDist!.value} unit={heroDist!.unit} />
            )}
            <Metric
              size="xl"
              className={run.distanceKm != null ? 'pl-6 sm:px-6 border-l border-hairline' : 'pr-6 sm:px-6'}
              label="Time"
              value={hms(run.durationMinutes)}
            />
            {heroPace && (
              <Metric
                size="xl"
                className="pr-6 sm:px-6 border-l border-hairline max-sm:border-l-0 max-sm:pl-0 max-sm:border-t max-sm:pt-4 max-sm:mt-3"
                label="Pace"
                value={heroPace.value}
                unit={heroPace.unit}
              />
            )}
            {run.calories != null && (
              <Metric
                size="xl"
                className="pl-6 sm:px-6 border-l border-hairline max-sm:pt-4 max-sm:mt-3 max-sm:border-t"
                label="Calories"
                value={Math.round(run.calories).toLocaleString()}
              />
            )}
          </div>
        </section>
      )}

      {/* Recent workouts — hairline rows, not cards */}
      <section className={SECTION}>
        <div className="flex items-baseline justify-between mb-5">
          <h3 className="section-heading text-[15px]">Recent workouts</h3>
          <span className="meta-mono">Apple Watch · Strava</span>
        </div>
        {workouts.length > 0 ? (
          <div>
            {workouts.map((w) => (
              <WorkoutRow key={w.id} workout={w} dateLabel={w.date === today ? 'Today' : fmtDate(w.date, 'EEE')} />
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-ink-mute py-3">
            No workouts synced yet — connect Strava in Settings to see your runs here.
          </p>
        )}
      </section>

      {/* Steps | Energy balance — last section, no bottom hairline */}
      <section className="grid md:grid-cols-2 animate-fade-rise">
        {/* Steps */}
        <div className="px-6 md:px-10 py-7">
          <div className="flex items-baseline justify-between mb-1">
            <h3 className="section-heading text-[15px]">Steps</h3>
            <span className="meta-mono">
              {steps != null ? `${steps.toLocaleString()} · ${stepPct}% of 10k` : 'No steps yet'}
            </span>
          </div>
          <StepsBars days={stepDays} />
        </div>

        {/* Energy balance */}
        <div className="px-6 md:px-10 py-7 md:border-l border-hairline max-md:border-t">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="section-heading text-[15px]">Energy balance</h3>
            <span className="meta-mono">{net != null ? `net ${net >= 0 ? '+' : '−'}${Math.abs(net)} kcal` : 'active burn'}</span>
          </div>
          <div className="grid grid-cols-3">
            <Metric label="Burned" value={burned != null ? Math.round(burned).toLocaleString() : '—'} className="pr-5"
              size="lg" />
            <Metric label="Eaten" value={eaten != null ? Math.round(eaten).toLocaleString() : '—'} className="px-5 border-l border-hairline" size="lg" />
            <Metric label="Net" value={net != null ? `${net >= 0 ? '+' : '−'}${Math.abs(net)}` : '—'} className="px-5 border-l border-hairline" size="lg" />
          </div>
          <p className="text-[12.5px] text-ink-mute mt-4 leading-relaxed">{energyNote(net, eaten)}</p>
        </div>
      </section>
    </div>
  );
}

/* ---- Steps bar trend: rounded SVG bars, today's bar filled with the accent gradient ---- */
function StepsBars({ days }: { days: { date: string; steps: number | null }[] }) {
  const id = useId().replace(/:/g, '');
  const W = 360;
  const H = 110;
  const pad = 6;
  const gap = 16;
  const present = days.filter((d) => d.steps != null);
  const max = Math.max(STEP_TARGET, ...present.map((d) => d.steps ?? 0)) || STEP_TARGET;
  const n = Math.max(days.length, 1);
  const bw = (W - pad * 2 - gap * (n - 1)) / n;

  if (present.length === 0) {
    return <div style={{ height: H }} className="grid place-items-center text-[13px] text-ink-mute">No step data yet.</div>;
  }

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: H, width: '100%', marginTop: 6 }}>
        <defs>
          <linearGradient id={`steps-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" />
            <stop offset="1" stopColor="var(--accent-deep)" />
          </linearGradient>
        </defs>
        {days.map((d, i) => {
          const x = pad + i * (bw + gap);
          const h = d.steps == null ? 6 : Math.max(6, (Math.min(d.steps, max) / max) * (H - pad * 2));
          const y = H - h - pad / 2;
          const isToday = i === days.length - 1;
          return (
            <rect
              key={d.date}
              x={x.toFixed(1)}
              y={y.toFixed(1)}
              width={bw.toFixed(1)}
              height={h.toFixed(1)}
              rx="5"
              fill={isToday ? `url(#steps-${id})` : 'var(--surface-2)'}
            />
          );
        })}
      </svg>
      <div className="flex justify-between meta-mono mt-2">
        <span>{fmtDate(days[0]?.date ?? '', 'EEE')}</span>
        {days.length > 2 && <span>{fmtDate(days[Math.floor(days.length / 2)]?.date ?? '', 'EEE')}</span>}
        <span style={{ color: 'var(--accent)' }}>Today</span>
      </div>
    </>
  );
}

function HeroBadge({ source }: { source: Workout['source'] }) {
  if (source === 'strava') {
    return (
      <span
        className="grid place-items-center w-14 h-14 rounded-[16px] text-white shrink-0"
        style={{ background: 'linear-gradient(140deg,#fc5200,#e24400)', boxShadow: '0 10px 22px -10px rgba(252,82,0,0.6)' }}
        aria-hidden
      >
        <StravaGlyph />
      </span>
    );
  }
  return (
    <span
      className="grid place-items-center w-14 h-14 rounded-[16px] text-white shrink-0"
      style={{ background: 'linear-gradient(140deg,#378add,#2563eb)', boxShadow: '0 10px 22px -10px rgba(37,99,235,0.55)' }}
      aria-hidden
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="2.5" width="12" height="19" rx="4" />
        <path d="M9 9l1.5 3L12 7l1.5 4L15 9" />
      </svg>
    </span>
  );
}

function StravaGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M10.6 2 4.2 14.1h3.7l2.7-5.2 2.6 5.2h3.6L10.6 2Zm3.4 12.1-1.8 3.5-1.8-3.5H7.1L12.2 24l5.1-9.9h-3.3Z" />
    </svg>
  );
}

function zoneLabel(w: Workout): string | null {
  const z = w.zoneMinutes;
  if (!z) return null;
  const entries: [string, number][] = [
    ['zone 1', z.z1],
    ['zone 2', z.z2],
    ['zone 3', z.z3],
    ['zone 4', z.z4],
    ['zone 5', z.z5],
  ];
  let top: [string, number] | null = null;
  for (const e of entries) if (e[1] > 0 && (top == null || e[1] > top[1])) top = e;
  return top ? top[0] : null;
}

function energyNote(net: number | null, eaten: number | null): string {
  if (net == null || eaten == null) {
    return 'Only active energy burned is tracked — log a meal to see your net balance.';
  }
  if (net > 150) return 'Running a slight deficit — good for your PT-test cut without bleeding recovery.';
  if (net < -150) return 'Eating in a surplus today — useful on hard training days, watch it on rest days.';
  return 'Energy in and out are roughly even — a balanced maintenance day.';
}

function dayOfYear(iso: string): number {
  const d = new Date(iso + 'T00:00:00');
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
}
