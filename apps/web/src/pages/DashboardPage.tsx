import type { NormalizedDailySummary, FitbitDay, Workout } from '@vcc/shared';
import { useHealthData } from '../hooks/useHealthData.js';
import { deriveReadiness, type ReadinessState } from '../lib/readiness.js';
import { ReadinessRing } from '../components/shared/ReadinessRing.js';
import { Metric } from '../components/shared/Metric.js';
import { Sparkline } from '../components/shared/Sparkline.js';
import { StageBar } from '../components/shared/StageBar.js';
import { PageHeader, HeaderDate } from '../components/layout/PageHeader.js';
import { InsightsPanel } from '../components/dashboard/InsightsPanel.js';
import { fmtNum, fmtDate } from '../lib/formatters.js';
import { useUnits } from '../stores/unitsStore.js';
import { fmtDistance, paceFor, fmtTempDelta } from '../lib/units.js';
import { useSettingsStore, selectAiEnabled, selectAiAutoSummary } from '../stores/settingsStore.js';

/* ---- small data helpers (descending-date `daily`) ---- */
function latest(daily: NormalizedDailySummary[], pick: (f: FitbitDay) => number | null | undefined) {
  for (const d of daily) {
    const v = d.fitbit ? pick(d.fitbit) : null;
    if (v != null && Number.isFinite(v)) return { value: v, date: d.date };
  }
  return { value: null as number | null, date: null as string | null };
}
function prevAfter(daily: NormalizedDailySummary[], date: string | null, pick: (f: FitbitDay) => number | null | undefined) {
  if (!date) return null;
  const i = daily.findIndex((d) => d.date === date);
  for (let j = i + 1; j < daily.length; j++) {
    const v = daily[j]?.fitbit ? pick(daily[j]!.fitbit!) : null;
    if (v != null && Number.isFinite(v)) return v;
  }
  return null;
}

const HEADLINE: Record<ReadinessState, [string, string]> = {
  PRIMED: ['Primed for ', 'training.'],
  STEADY: ['Steady and ', 'ready.'],
  STRAINED: ['Ease back ', 'today.'],
  LOW: ['Prioritize ', 'recovery.'],
  'NO DATA': ['Awaiting your ', 'data.'],
};
const SUBHEAD: Record<ReadinessState, string> = {
  PRIMED: 'Recovery markers are trending up — a strong window for a quality session.',
  STEADY: 'Solid baseline today. Train as planned and protect tonight’s sleep.',
  STRAINED: 'Your system is working harder than usual — favor zone 2 or mobility.',
  LOW: 'Recovery is down. Prioritize sleep, hydration, and an easy day.',
  'NO DATA': 'Connect a device and sync to see your morning readiness.',
};

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** Optional display name from VITE_USER_NAME (.env, gitignored) — keeps the
 * user's name out of source. Falls back to an unnamed greeting. */
const USER_NAME = (import.meta.env.VITE_USER_NAME as string | undefined)?.trim() || '';

function findRun(workouts: Workout[]): Workout | null {
  return workouts.find((w) => /run|jog/i.test(w.sport)) ?? workouts[0] ?? null;
}
function hms(min: number): string {
  const total = Math.round(min * 60);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`;
}

const SECTION = 'px-6 md:px-10 border-b border-hairline';

export default function DashboardPage() {
  const { daily, workouts, loading, error } = useHealthData();
  const units = useUnits();
  const aiEnabled = useSettingsStore(selectAiEnabled);
  const aiAutoSummary = useSettingsStore(selectAiAutoSummary);

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

  const readiness = deriveReadiness(daily);
  const today = daily[0]?.date ?? new Date().toISOString().slice(0, 10);
  const [hA, hB] = HEADLINE[readiness.state];

  // deltas
  const hrv = readiness.inputs.hrv;
  const rhr = readiness.inputs.rhr;
  const hrvPct = hrv.value != null && hrv.baseline ? ((hrv.value - hrv.baseline) / hrv.baseline) * 100 : null;
  const rhrDiff = rhr.value != null && rhr.baseline != null ? rhr.value - rhr.baseline : null;
  const sleepNow = latest(daily, (f) => f.sleepHours);
  const sleepPrev = prevAfter(daily, sleepNow.date, (f) => f.sleepHours);
  const sleepDeltaMin = sleepNow.value != null && sleepPrev != null ? Math.round((sleepNow.value - sleepPrev) * 60) : null;

  // vitals
  const spo2 = latest(daily, (f) => f.spo2);
  const resp = latest(daily, (f) => f.respiratoryRate);
  const skin = latest(daily, (f) => f.skinTempDelta);
  const steps = latest(daily, (f) => f.steps);
  const burned = latest(daily, (f) => f.activeCaloriesBurned);
  const eaten = latest(daily, (f) => f.caloriesIn);
  const net = burned.value != null && eaten.value != null ? Math.round(burned.value - eaten.value) : null;

  // hrv series (oldest → newest)
  const hrvSeries = [...daily].reverse().map((d) => d.fitbit?.hrv ?? d.consensus.hrv ?? null);
  const hrvDates = [...daily].reverse().map((d) => d.date);

  // sleep stages (latest night)
  const sd = daily.find((d) => d.fitbit?.sleepHours != null)?.fitbit;
  const stages = sd
    ? {
        deep: (sd.deepHours ?? 0) * 60,
        rem: (sd.remHours ?? 0) * 60,
        light: (sd.lightHours ?? 0) * 60,
        awake: Math.max(0, ((sd.sleepHours ?? 0) - (sd.deepHours ?? 0) - (sd.remHours ?? 0) - (sd.lightHours ?? 0)) * 60),
      }
    : null;

  const run = findRun(workouts);

  // Freshness signal for the AI brief: newest workout event today. When a run
  // syncs in, this advances past the current brief's timestamp and triggers an
  // auto-refresh (see InsightsPanel).
  const freshnessKey = workouts
    .filter((w) => w.date === today)
    .map((w) => w.endTime || w.startTime)
    .filter(Boolean)
    .sort()
    .pop();

  if (loading && daily.length === 0) {
    return (
      <div>
        <div className="px-6 md:px-10 pt-8 pb-5 border-b border-hairline">
          <div className="h-9 w-64 rounded-md bg-bg-surface2 animate-pulse" />
        </div>
        <div className="px-6 md:px-10 py-9 border-b border-hairline flex gap-12 items-center">
          <div className="w-44 h-44 rounded-full bg-bg-surface2 animate-pulse" />
          <div className="flex-1 h-24 rounded-md bg-bg-surface2 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={
          <>
            {greeting()}
            {USER_NAME ? (
              <>
                , <span className="text-ink-mute">{USER_NAME}.</span>
              </>
            ) : (
              '.'
            )}
          </>
        }
        subtitle={SUBHEAD[readiness.state]}
        date={<HeaderDate primary={fmtDate(today, 'EEEE, MMMM d')} caption={`DAY ${dayOfYear(today)} · ${today.slice(0, 4)}`} />}
      />

      {/* Readiness strip */}
      <section className={`${SECTION} py-8 md:py-9 grid gap-8 md:gap-12 md:grid-cols-[auto_1fr] items-center animate-fade-rise`}>
        <ReadinessRing
          value={readiness.score}
          tone="brand"
          size={184}
          thickness={10}
          sublabel={<span className="label-micro">Readiness</span>}
          label={
            <span>
              {readiness.score ?? '—'}
              <span className="text-ink-mute text-[0.32em] font-medium align-baseline">/100</span>
            </span>
          }
        />
        <div>
          <h2 className="font-display font-semibold text-[clamp(24px,2.7vw,33px)] leading-[1.04] tracking-tightest">
            {hA}
            <span className="text-accent">{hB}</span>
          </h2>
          <div className="grid grid-cols-3 gap-0 mt-6 max-w-xl">
            <Metric size="xl" className="min-w-0 pr-3 sm:pr-7" label="HRV" value={fmtNum(hrv.value, 0)} unit="ms"
              delta={hrvPct != null ? { text: `${hrvPct > 0 ? '+' : ''}${hrvPct.toFixed(0)}%`, dir: hrvPct >= 0 ? 'up' : 'down', tone: hrvPct >= 0 ? 'good' : 'alert' } : undefined} />
            <Metric size="xl" className="min-w-0 px-3 sm:px-7 border-l border-hairline" label="Resting HR" value={fmtNum(rhr.value, 0)} unit="bpm"
              delta={rhrDiff != null ? { text: `${rhrDiff > 0 ? '+' : '−'}${Math.abs(Math.round(rhrDiff))}`, dir: rhrDiff <= 0 ? 'down' : 'up', tone: rhrDiff <= 0 ? 'accent' : 'warn' } : undefined} />
            <Metric size="xl" className="min-w-0 px-3 sm:px-7 border-l border-hairline" label="Sleep" value={sleepNow.value != null ? hoursLabel(sleepNow.value) : '—'}
              delta={sleepDeltaMin != null ? { text: `${sleepDeltaMin >= 0 ? '+' : '−'}${Math.abs(sleepDeltaMin)}m`, dir: sleepDeltaMin >= 0 ? 'up' : 'down', tone: sleepDeltaMin >= 0 ? 'good' : 'warn' } : undefined} />
          </div>
        </div>
      </section>

      {/* Today's vitals */}
      <section className={`${SECTION} py-7 animate-fade-rise`}>
        <div className="flex items-baseline justify-between mb-5">
          <h3 className="section-heading text-[15px]">Today’s vitals</h3>
          <span className="meta-mono">Fitbit Air</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          <Metric label="SpO₂" value={fmtNum(spo2.value, 0)} unit="%" sub="Blood oxygen" className="pr-6 py-1" />
          <Metric label="Respiratory" value={fmtNum(resp.value, 1)} unit="br/min" sub="Overnight avg" className="px-6 py-1 border-l border-hairline" />
          <Metric label="Skin temp" value={fmtTempDelta(skin.value, units).value} unit={fmtTempDelta(skin.value, units).unit} sub="vs baseline" className="px-6 py-1 border-l border-hairline" />
          <Metric label="Steps" value={steps.value == null ? '—' : steps.value.toLocaleString()} className="px-6 py-1 border-l border-hairline lg:border-l max-sm:border-l-0 max-sm:pl-0 max-sm:border-t max-sm:pt-4 max-sm:mt-3 sm:border-t-0 sm:mt-0 sm:pt-1"
            sub={steps.value != null ? `${Math.round((steps.value / 10000) * 100)}% of 10,000` : 'No steps yet'}>
            {steps.value != null && (
              <div className="track mt-3 max-w-[120px]"><div className="track-fill" style={{ width: `${Math.min(100, (steps.value / 10000) * 100)}%` }} /></div>
            )}
          </Metric>
          <Metric label="Energy" value={net == null ? (burned.value != null ? Math.round(burned.value).toLocaleString() : '—') : `${net >= 0 ? '+' : '−'}${Math.abs(net)}`}
            className="px-6 py-1 border-l border-hairline max-sm:border-l max-sm:pl-6 sm:border-l"
            sub={burned.value != null ? `${Math.round(burned.value).toLocaleString()} burned${eaten.value != null ? ` · ${Math.round(eaten.value).toLocaleString()} eaten` : ''}` : 'Not tracked'} />
        </div>
      </section>

      {/* HRV trend | Sleep stages */}
      <section className="grid md:grid-cols-[1.35fr_1fr] border-b border-hairline animate-fade-rise">
        <div className="px-6 md:px-10 py-7">
          <div className="flex items-baseline justify-between mb-1">
            <h3 className="section-heading text-[15px]">14-day HRV</h3>
            <span className="meta-mono">{fmtNum(hrv.value, 0)} ms · baseline {fmtNum(hrv.baseline, 0)}</span>
          </div>
          <Sparkline
            values={hrvSeries}
            labels={hrvDates}
            baseline={hrv.baseline}
            height={120}
            format={(v) => `${fmtNum(v, 0)} ms`}
            formatLabel={(d) => fmtDate(d, 'EEE, MMM d')}
          />
          <div className="flex justify-between meta-mono mt-2">
            <span>{fmtDate(daily[daily.length - 1]?.date ?? today, 'MMM d')}</span>
            <span>{fmtDate(today, 'MMM d')}</span>
          </div>
        </div>
        <div className="px-6 md:px-10 py-7 md:border-l border-hairline max-md:border-t">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="section-heading text-[15px]">Sleep stages</h3>
            <span className="meta-mono">{sleepNow.value != null ? hoursLabel(sleepNow.value) : '—'}</span>
          </div>
          {stages ? <StageBar stages={stages} /> : <p className="text-[13px] text-ink-mute">No sleep recorded last night.</p>}
        </div>
      </section>

      {/* Today's run */}
      {run && (
        <section className={`${SECTION} py-6 flex items-center gap-5 flex-wrap animate-fade-rise`} style={{ borderBottom: 'none' }}>
          <span className="grid place-items-center w-12 h-12 rounded-[14px] text-white shrink-0" style={{ background: 'linear-gradient(140deg,#fc5200,#e24400)', boxShadow: '0 10px 22px -10px rgba(252,82,0,0.6)' }}>
            <StravaGlyph />
          </span>
          <div>
            <div className="label-micro" style={{ color: 'var(--device-strava)' }}>Today · {run.source === 'strava' ? 'Strava' : 'Apple Watch'}</div>
            <div className="font-display font-semibold text-[22px] tracking-tight mt-1 capitalize">{run.sport}</div>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:items-center ml-auto">
            {run.distanceKm != null && <Metric size="lg" className="pr-6 sm:px-6" label="Distance" value={fmtDistance(run.distanceKm, units).value} unit={fmtDistance(run.distanceKm, units).unit} />}
            <Metric size="lg" className="pl-6 sm:px-6 border-l border-hairline" label="Time" value={hms(run.durationMinutes)} />
            {paceFor(run.durationMinutes, run.distanceKm, units) && <Metric size="lg" className="pr-6 sm:px-6 border-l border-hairline max-sm:border-l-0 max-sm:pl-0 max-sm:border-t max-sm:pt-4 max-sm:mt-3" label="Pace" value={paceFor(run.durationMinutes, run.distanceKm, units)!.value} unit={paceFor(run.durationMinutes, run.distanceKm, units)!.unit} />}
            {run.calories != null && <Metric size="lg" className="pl-6 sm:px-6 border-l border-hairline max-sm:pt-4 max-sm:mt-3 max-sm:border-t" label="Calories" value={Math.round(run.calories).toLocaleString()} />}
          </div>
        </section>
      )}

      {/* AI daily brief — last, compact; hidden entirely when AI features are off */}
      {aiEnabled && (
        <section className="px-6 md:px-10 py-7 border-t border-hairline animate-fade-rise">
          <InsightsPanel autoSummary={aiAutoSummary} freshnessKey={freshnessKey} compact />
        </section>
      )}
    </div>
  );
}

function hoursLabel(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}h ${mm.toString().padStart(2, '0')}m`;
}
function dayOfYear(iso: string): number {
  const d = new Date(iso + 'T00:00:00');
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
}

function StravaGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M10.6 2 4.2 14.1h3.7l2.7-5.2 2.6 5.2h3.6L10.6 2Zm3.4 12.1-1.8 3.5-1.8-3.5H7.1L12.2 24l5.1-9.9h-3.3Z" />
    </svg>
  );
}
