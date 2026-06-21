import { fmtDuration } from '../../lib/formatters.js';

export interface SleepStages {
  /** Minutes per stage. */
  deep: number;
  rem: number;
  light: number;
  awake: number;
}

const STAGES = [
  { key: 'deep', label: 'Deep', cls: 'seg-deep' },
  { key: 'rem', label: 'REM', cls: 'seg-rem' },
  { key: 'light', label: 'Light', cls: 'seg-light' },
  { key: 'awake', label: 'Awake', cls: 'seg-awake' },
] as const;

/**
 * Sleep-stage ribbon + legend, in the dedicated multi-hue sleep palette
 * (indigo / teal / sky / amber) so stages are clearly distinguishable.
 * Shared by the Dashboard and Sleep pages.
 */
export function StageBar({ stages, showLegend = true }: { stages: SleepStages; showLegend?: boolean }) {
  const total = stages.deep + stages.rem + stages.light + stages.awake || 1;
  const pct = (m: number) => `${(m / total) * 100}%`;

  return (
    <div>
      <div className="flex gap-1 h-3.5 rounded-pill overflow-hidden shadow-[inset_0_0_0_1px_rgba(30,50,80,0.05)]">
        {STAGES.map((s) => (
          <span key={s.key} className={`${s.cls} rounded-[5px] h-full`} style={{ width: pct(stages[s.key]) }} />
        ))}
      </div>
      {showLegend && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-5">
          {STAGES.map((s) => (
            <div key={s.key} className="flex items-center gap-2.5">
              <span className={`${s.cls} w-[11px] h-[11px] rounded-[4px] shrink-0`} />
              <span className="text-[12.5px] font-medium text-ink-dim">{s.label}</span>
              <span className="ml-auto num text-[13px] font-semibold text-ink">{fmtDuration(stages[s.key] / 60)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
