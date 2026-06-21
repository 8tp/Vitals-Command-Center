import type { Workout } from '@vcc/shared';
import { useUnits } from '../../stores/unitsStore.js';
import { fmtDistance, paceFor } from '../../lib/units.js';

/* ---- per-row formatting (mirrors DashboardPage run-strip math) ---- */
function hms(min: number): string {
  const total = Math.round(min * 60);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    : `${m}:${s.toString().padStart(2, '0')}`;
}

/** Source presentation: Strava = orange run glyph, everything else = Apple-blue watch glyph. */
function sourceMeta(source: Workout['source']) {
  if (source === 'strava') {
    return { label: 'Strava', gradient: 'linear-gradient(140deg,#fc5200,#e24400)', glyph: <RunGlyph /> };
  }
  if (source === 'apple') {
    return { label: 'Apple Watch', gradient: 'linear-gradient(140deg,#378add,#2563eb)', glyph: <WatchGlyph /> };
  }
  const labels: Record<string, string> = { whoop: 'WHOOP', oura: 'Oura', fitbit: 'Fitbit' };
  return { label: labels[source] ?? source, gradient: 'linear-gradient(140deg,#378add,#2563eb)', glyph: <WatchGlyph /> };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <div className="label-micro">{label}</div>
      <b className="num text-[14px] font-semibold text-ink mt-1 block tabular-nums">{value}</b>
    </div>
  );
}

/**
 * One hairline-separated workout row (NOT a card). Left: colored squircle source
 * icon + name + date·time·source caption. Right: a right-aligned stat group —
 * Dist/Time/Pace for runs with distance, else Time/Avg HR/Cal.
 */
export function WorkoutRow({ workout, dateLabel }: { workout: Workout; dateLabel: string }) {
  const units = useUnits();
  const { label, gradient, glyph } = sourceMeta(workout.source);
  const time = workout.startTime ? workout.startTime.slice(11, 16) : null;
  const hasDistance = workout.distanceKm != null && workout.distanceKm > 0;
  const dist = fmtDistance(workout.distanceKm, units);
  const p = paceFor(workout.durationMinutes, workout.distanceKm, units);

  return (
    <div className="flex items-center gap-4 py-4 border-b border-hairline last:border-0">
      <span
        className="grid place-items-center w-10 h-10 rounded-[12px] text-white shrink-0"
        style={{ background: gradient }}
        aria-hidden
      >
        {glyph}
      </span>
      <div className="min-w-0">
        <div className="font-display font-semibold text-[14.5px] tracking-tight text-ink capitalize truncate">
          {workout.sport}
        </div>
        <div className="meta-mono mt-0.5 truncate">
          {[dateLabel, time, label].filter(Boolean).join(' · ')}
        </div>
      </div>
      <div className="flex items-start gap-5 sm:gap-7 ml-auto shrink-0">
        {hasDistance && p ? (
          <>
            <Stat label="Dist" value={`${dist.value} ${dist.unit}`} />
            <Stat label="Time" value={hms(workout.durationMinutes)} />
            <Stat label={`Pace ${p.unit}`} value={p.value} />
          </>
        ) : (
          <>
            <Stat label="Time" value={hms(workout.durationMinutes)} />
            <Stat label="Avg HR" value={workout.avgHr != null ? String(Math.round(workout.avgHr)) : '—'} />
            <Stat label="Cal" value={workout.calories != null ? String(Math.round(workout.calories)) : '—'} />
          </>
        )}
      </div>
    </div>
  );
}

function RunGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12h4l2.5-7 4 14 2.5-7H21" />
    </svg>
  );
}
function WatchGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="6" y="2.5" width="12" height="19" rx="4" />
      <path d="M9 9l1.5 3L12 7l1.5 4L15 9" />
    </svg>
  );
}
