import { DEVICE_COLOR, DEVICE_LABEL, type NormalizedDailySummary } from '@vcc/shared';
import { perSource } from '../../lib/sources.js';
import { fmtNum } from '../../lib/formatters.js';

interface Props {
  day: NormalizedDailySummary | undefined;
}

const METRICS = [
  { key: 'hrv' as const, label: 'Heart rate variability', unit: 'ms', digits: 0 },
  { key: 'rhr' as const, label: 'Resting heart rate', unit: 'bpm', digits: 0 },
  { key: 'sleepHours' as const, label: 'Sleep', unit: 'h', digits: 1 },
];

/**
 * Lean per-source comparison for the readiness inputs. Renders only when more
 * than one device reported on the day — single-device days fall back to null so
 * the hero stays clean. Each cell is colored by its device identity.
 */
export function SourceComparison({ day }: Props) {
  if (!day || day.devices.active < 2) return null;

  // Only show metrics where >1 source disagrees/agrees (multi-source value).
  const rows = METRICS.map((m) => ({ ...m, vals: perSource(day, m.key) })).filter(
    (r) => r.vals.length >= 2,
  );
  if (rows.length === 0) return null;

  return (
    <div className="rounded-2xl bg-bg-surface2/60 px-4 py-3.5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-ink-dim">Across your devices</span>
        <span className="text-xs text-ink-mute">{day.devices.active} devices</span>
      </div>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-3">
            <span className="text-xs text-ink-mute w-36 shrink-0">{r.label}</span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {r.vals.map((v) => (
                <span
                  key={v.source}
                  className="inline-flex items-center gap-1.5 rounded-full bg-bg-surface px-2.5 py-1"
                  title={DEVICE_LABEL[v.source]}
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: DEVICE_COLOR[v.source] }}
                  />
                  <span className="text-sm font-medium text-ink tabular-nums">
                    {fmtNum(v.value, r.digits)}
                  </span>
                  <span className="text-xs text-ink-mute">{r.unit}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
