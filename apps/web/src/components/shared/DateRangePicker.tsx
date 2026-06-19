import clsx from 'clsx';
import { useUiStore, type RangePreset } from '../../stores/uiStore.js';

const PRESETS: RangePreset[] = ['7d', '14d', '30d', '90d'];

export function DateRangePicker() {
  const { range, setRange } = useUiStore();
  return (
    <div className="inline-flex items-center bg-bg-inset border border-hairline rounded-pill p-1">
      {PRESETS.map((p) => (
        <button
          key={p}
          onClick={() => setRange(p)}
          aria-pressed={range === p}
          className={clsx(
            'min-h-[44px] md:min-h-0 px-3.5 md:px-3 py-1.5 text-2xs num font-semibold transition-colors rounded-pill',
            range === p ? 'bg-bg-surface text-ink shadow-card' : 'text-ink-dim hover:text-ink',
          )}
        >
          {p}
        </button>
      ))}
    </div>
  );
}
