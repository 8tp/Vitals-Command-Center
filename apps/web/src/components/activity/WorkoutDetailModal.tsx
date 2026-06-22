import { useEffect, useState } from 'react';
import type { Workout, WorkoutDetail, WorkoutSplit } from '@vcc/shared';
import { useUiStore } from '../../stores/uiStore.js';
import { useUnits } from '../../stores/unitsStore.js';
import { fmtDistance, paceFor, distanceUnit, type Units } from '../../lib/units.js';
import { apiGet } from '../../lib/api.js';
import { fmtDate } from '../../lib/formatters.js';
import { IconX } from '../shared/icons.js';

interface DetailResponse {
  workout: Workout;
  detail: WorkoutDetail | null;
}

/** h:mm:ss / m:ss from seconds. */
function hms(totalSeconds: number): string {
  const t = Math.round(totalSeconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    : `${m}:${s.toString().padStart(2, '0')}`;
}

/** mm:ss from a seconds-per-km pace, converted to the chosen unit. */
function fmtPace(secPerKm: number | null, units: Units): string {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 0) return '—';
  const per = units === 'imperial' ? secPerKm * 1.609344 : secPerKm;
  const m = Math.floor(per / 60);
  const s = Math.round(per % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label-micro">{label}</div>
      <b className="num text-[15px] font-semibold text-ink mt-1 block tabular-nums">{value}</b>
    </div>
  );
}

/** Per-km split rows with a relative pace bar (fastest split = fullest bar). */
function Splits({ splits, units }: { splits: WorkoutSplit[]; units: Units }) {
  const paces = splits.map((s) => s.paceSecondsPerKm).filter((p): p is number => p != null && p > 0);
  if (paces.length === 0) return null;
  const fastest = Math.min(...paces);
  const slowest = Math.max(...paces);
  const span = Math.max(1, slowest - fastest);
  const unitLabel = distanceUnit(units);

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="section-heading text-[13.5px]">Splits</h3>
        <span className="meta-mono">per {unitLabel}</span>
      </div>
      <div className="space-y-1.5">
        {splits.map((s) => {
          const pct =
            s.paceSecondsPerKm != null
              ? 0.18 + 0.82 * ((slowest - s.paceSecondsPerKm) / span)
              : 0.18;
          return (
            <div key={s.index} className="flex items-center gap-3">
              <span className="num text-[12px] text-ink-mute w-6 tabular-nums shrink-0">{s.index}</span>
              <div className="flex-1 h-7 rounded-md bg-bg-surface2 overflow-hidden relative">
                <div
                  className="h-full rounded-md"
                  style={{
                    width: `${Math.round(pct * 100)}%`,
                    background: 'linear-gradient(90deg, var(--accent-soft), var(--accent))',
                  }}
                />
                <span className="num absolute inset-y-0 left-2.5 flex items-center text-[12px] font-semibold text-ink tabular-nums">
                  {fmtPace(s.paceSecondsPerKm, units)}
                  <span className="text-ink-mute font-normal ml-0.5">/{unitLabel}</span>
                </span>
              </div>
              <span className="num text-[12px] text-ink-mute w-12 text-right tabular-nums shrink-0">
                {s.avgHr != null ? `${Math.round(s.avgHr)} bpm` : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Body({ data, units }: { data: DetailResponse; units: Units }) {
  const { workout: w, detail } = data;
  const dist = fmtDistance(w.distanceKm, units);
  const overallPace = paceFor(w.durationMinutes, w.distanceKm, units);
  const elevUnit = units === 'imperial' ? 'ft' : 'm';
  const elev =
    detail?.totalElevationGain != null
      ? units === 'imperial'
        ? Math.round(detail.totalElevationGain * 3.28084)
        : Math.round(detail.totalElevationGain)
      : null;

  const showLaps = (detail?.laps?.length ?? 0) > 1;
  const showSegments = (detail?.segments?.length ?? 0) > 0;

  return (
    <div className="space-y-7">
      {/* Summary stats */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-4 gap-y-5">
        <StatCell label="Distance" value={`${dist.value} ${dist.unit}`} />
        <StatCell label="Moving" value={hms(w.durationMinutes * 60)} />
        <StatCell label="Avg pace" value={overallPace ? `${overallPace.value}${overallPace.unit}` : '—'} />
        <StatCell label="Avg HR" value={w.avgHr != null ? `${Math.round(w.avgHr)}` : '—'} />
        <StatCell label="Max HR" value={w.maxHr != null ? `${Math.round(w.maxHr)}` : '—'} />
        <StatCell label="Calories" value={w.calories != null ? `${Math.round(w.calories)}` : '—'} />
        {detail?.avgCadence != null && <StatCell label="Cadence" value={`${detail.avgCadence} spm`} />}
        {elev != null && <StatCell label="Elev gain" value={`${elev} ${elevUnit}`} />}
        {detail?.sufferScore != null && <StatCell label="Effort" value={`${Math.round(detail.sufferScore)}`} />}
      </div>

      {detail?.description && (
        <p className="text-[13px] text-ink-dim leading-relaxed border-l-2 border-hairline pl-3">
          {detail.description}
        </p>
      )}

      {detail?.splits && detail.splits.length > 0 && <Splits splits={detail.splits} units={units} />}

      {showLaps && (
        <section>
          <h3 className="section-heading text-[13.5px] mb-3">Laps</h3>
          <div className="space-y-1">
            {detail!.laps.map((l) => (
              <div
                key={l.index}
                className="flex items-center justify-between py-2 border-b border-hairline last:border-0"
              >
                <span className="text-[13px] text-ink">{l.name ?? `Lap ${l.index}`}</span>
                <div className="flex items-center gap-5 num text-[12.5px] tabular-nums text-ink-mute">
                  <span>{fmtDistance(l.distanceKm, units).value} {distanceUnit(units)}</span>
                  <span className="text-ink">{fmtPace(l.avgPaceSecondsPerKm, units)}/{distanceUnit(units)}</span>
                  <span>{l.avgHr != null ? `${Math.round(l.avgHr)} bpm` : '—'}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {showSegments && (
        <section>
          <h3 className="section-heading text-[13.5px] mb-3">Segments</h3>
          <div className="space-y-1">
            {detail!.segments.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between py-2 border-b border-hairline last:border-0"
              >
                <span className="text-[13px] text-ink truncate mr-3 flex items-center gap-2">
                  {s.name}
                  {s.prRank === 1 && (
                    <span className="text-[10px] font-semibold text-white bg-accent rounded-full px-1.5 py-0.5">PR</span>
                  )}
                </span>
                <div className="flex items-center gap-5 num text-[12.5px] tabular-nums text-ink-mute shrink-0">
                  <span>{fmtDistance(s.distanceKm, units).value} {distanceUnit(units)}</span>
                  <span className="text-ink">{hms(s.elapsedSeconds)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {detail == null && (
        <p className="text-[13px] text-ink-mute">
          Detailed splits aren’t available for this activity yet — they’ll appear after the next sync.
        </p>
      )}
    </div>
  );
}

export function WorkoutDetailModal() {
  const id = useUiStore((s) => s.openWorkoutId);
  const setOpenWorkoutId = useUiStore((s) => s.setOpenWorkoutId);
  const units = useUnits();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = () => setOpenWorkoutId(null);

  useEffect(() => {
    if (!id) return;
    setData(null);
    setError(null);
    let cancelled = false;
    apiGet<DetailResponse>(`/api/workouts/${encodeURIComponent(id)}`)
      .then((d) => !cancelled && setData(d))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load'));
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id]);

  if (!id) return null;

  const title = data ? data.workout.sport : 'Workout';
  const caption = data
    ? [
        fmtDate(data.workout.date, 'EEEE, MMM d'),
        data.workout.startTime ? data.workout.startTime.slice(11, 16) : null,
        data.detail?.gearName ?? data.detail?.deviceName ?? null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-7 animate-fade-rise"
      style={{ background: 'rgba(20,33,61,0.34)', backdropFilter: 'blur(8px)' }}
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[600px] max-h-[88vh] overflow-y-auto scrollbar-thin bg-bg-surface rounded-[24px] shadow-card-hover"
      >
        <div className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="min-w-0">
              <h2 className="font-display font-semibold text-[22px] tracking-tight text-ink capitalize truncate">
                {title}
              </h2>
              {caption && <p className="meta-mono mt-1.5 truncate">{caption}</p>}
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="grid place-items-center w-9 h-9 rounded-full text-ink-dim bg-bg-surface2 hover:text-accent transition-colors shrink-0"
            >
              <IconX size={16} />
            </button>
          </div>

          {error ? (
            <p className="text-[13px] text-alert">Couldn’t load this run ({error}).</p>
          ) : !data ? (
            <p className="text-[13px] text-ink-mute animate-pulse">Loading splits…</p>
          ) : (
            <Body data={data} units={units} />
          )}
        </div>
      </div>
    </div>
  );
}
