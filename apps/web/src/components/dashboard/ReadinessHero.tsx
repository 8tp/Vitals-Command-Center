import { DEVICE_COLOR, type DeviceSource, type NormalizedDailySummary } from '@vcc/shared';
import { ReadinessRing } from '../shared/ReadinessRing.js';
import { SourceComparison } from './SourceComparison.js';
import { ConfidenceBadge } from '../shared/ConfidenceBadge.js';
import { deriveReadiness, READINESS_TONE_VAR, READINESS_TONE_SOFT } from '../../lib/readiness.js';
import { sourcesWithMetric } from '../../lib/sources.js';
import { fmtNum, fmtDuration, fmtDate } from '../../lib/formatters.js';

interface Props {
  daily: NormalizedDailySummary[];
}

interface ReadoutProps {
  label: string;
  value: string;
  unit?: string;
  delta: { text: string; tone: 'signal' | 'warn' | 'mute' } | null;
  baseline?: string;
  /** Sources that contributed this metric today — shown as device dots. */
  sources?: DeviceSource[];
}

function deltaFor(
  value: number | null,
  baseline: number | null,
  upIsGood: boolean,
): { text: string; tone: 'signal' | 'warn' | 'mute' } | null {
  if (value == null || baseline == null || baseline === 0) return null;
  const diff = value - baseline;
  const pct = (diff / Math.abs(baseline)) * 100;
  if (Math.abs(pct) < 1.5) return { text: 'Right at baseline', tone: 'mute' };
  const good = diff > 0 === upIsGood;
  const arrow = diff > 0 ? '↑' : '↓';
  return {
    text: `${arrow} ${Math.abs(pct).toFixed(0)}% vs 7-day`,
    tone: good ? 'signal' : 'warn',
  };
}

function Readout({ label, value, unit, delta, baseline, sources }: ReadoutProps) {
  const toneVar =
    delta?.tone === 'signal'
      ? 'var(--signal)'
      : delta?.tone === 'warn'
        ? 'var(--warn)'
        : 'var(--ink-mute)';
  return (
    <div className="rounded-2xl bg-bg-surface2/60 px-4 py-3.5 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-ink-dim">{label}</div>
        {sources && sources.length > 1 && (
          <span className="flex items-center gap-1" title={`${sources.length} sources`}>
            {sources.map((s) => (
              <span
                key={s}
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: DEVICE_COLOR[s] }}
              />
            ))}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tracking-tight text-ink tabular-nums">{value}</span>
        {unit && <span className="text-sm text-ink-mute font-medium">{unit}</span>}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium" style={{ color: toneVar }}>
          {delta ? delta.text : '—'}
        </span>
        {baseline && <span className="text-xs text-ink-mute">{baseline}</span>}
      </div>
    </div>
  );
}

export function ReadinessHero({ daily }: Props) {
  const readiness = deriveReadiness(daily);
  const { hrv, rhr, sleep } = readiness.inputs;
  const tone = READINESS_TONE_VAR[readiness.tone];
  const toneSoft = READINESS_TONE_SOFT[readiness.tone];
  const today = daily[0];
  const stale = readiness.date && today && readiness.date !== today.date;

  // Multi-device surfacing: which sources backed each readiness input today,
  // plus the consensus confidence (degrades to single-device gracefully).
  const hrvSources = sourcesWithMetric(today, 'hrv');
  const rhrSources = sourcesWithMetric(today, 'rhr');
  const sleepSources = sourcesWithMetric(today, 'sleepHours');
  const confidence = today?.consensus.level ?? null;
  const multiDevice = (today?.devices.active ?? 0) > 1;

  // Friendly, sentence-case state words for the pill.
  const stateLabel: Record<string, string> = {
    PRIMED: 'Primed',
    STEADY: 'Steady',
    STRAINED: 'Strained',
    LOW: 'Take it easy',
    'NO DATA': 'No data yet',
  };

  const stateCopy: Record<string, string> = {
    PRIMED: 'Your recovery signals look strong today. A great day to push the run.',
    STEADY: "You're holding near your baseline. Train as planned and watch the back half.",
    STRAINED: 'Recovery is lagging your baseline. Keep the intensity moderate today.',
    LOW: 'Your body is under load. Prioritize an easy day and good sleep tonight.',
    'NO DATA': 'No tracker data yet today. Sync your Fitbit to see your readiness.',
  };

  return (
    <section className="card p-5 md:p-7 animate-fade-rise">
      <div className="flex items-center justify-between mb-5 md:mb-6">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Morning readiness</h2>
          <div className="text-sm text-ink-mute mt-0.5">
            {readiness.date ? fmtDate(readiness.date) : '—'}
            {stale && <span className="text-warn"> · last reading</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {multiDevice && confidence && <ConfidenceBadge level={confidence} inline />}
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium"
            style={{ color: tone, background: toneSoft }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: tone }} />
            {stateLabel[readiness.state] ?? readiness.state}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-7 lg:gap-10 items-center">
        <div className="flex justify-center">
          <ReadinessRing
            value={readiness.score}
            tone={readiness.score == null ? 'mute' : readiness.tone}
            sublabel={stateLabel[readiness.state] ?? readiness.state}
            size={220}
            ariaLabel={`Readiness ${
              readiness.score == null ? 'no data yet' : `${readiness.score} of 100`
            }, ${stateLabel[readiness.state] ?? readiness.state}`}
          />
        </div>

        <div className="space-y-4">
          <p className="text-base text-ink-dim leading-relaxed max-w-md">
            {stateCopy[readiness.state] ?? ''}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Readout
              label="Heart rate variability"
              value={fmtNum(hrv.value, 0)}
              unit="ms"
              delta={deltaFor(hrv.value, hrv.baseline, true)}
              baseline={hrv.baseline != null ? `Base ${fmtNum(hrv.baseline, 0)}` : undefined}
              sources={hrvSources}
            />
            <Readout
              label="Resting heart rate"
              value={fmtNum(rhr.value, 0)}
              unit="bpm"
              delta={deltaFor(rhr.value, rhr.baseline, false)}
              baseline={rhr.baseline != null ? `Base ${fmtNum(rhr.baseline, 0)}` : undefined}
              sources={rhrSources}
            />
            <Readout
              label="Last night's sleep"
              value={fmtDuration(sleep.value)}
              delta={
                sleep.value == null
                  ? null
                  : sleep.value >= 7.5
                    ? { text: 'On target', tone: 'signal' }
                    : { text: `${(8 - sleep.value).toFixed(1)}h under`, tone: 'warn' }
              }
              baseline="Goal 8h"
              sources={sleepSources}
            />
          </div>
          <SourceComparison day={today} />
        </div>
      </div>
    </section>
  );
}
