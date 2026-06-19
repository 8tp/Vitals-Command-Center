import clsx from 'clsx';

interface Props {
  label: string;
  value: React.ReactNode;
  unit?: string;
  trendPct?: number | null;
  upIsGood?: boolean;
  footnote?: string;
  /** optional value tint (use only for live/signal readings) */
  accent?: string;
  empty?: boolean;
}

/** Soft up/down/flat trend chip — friendly, rounded, sentence-case. */
function TrendChip({ pct, upIsGood = true }: { pct: number; upIsGood?: boolean }) {
  const dir = pct > 1 ? 'up' : pct < -1 ? 'down' : 'flat';
  const good = dir === 'flat' ? null : (dir === 'up') === upIsGood;
  const tone =
    good === null
      ? 'text-ink-mute bg-bg-surface2'
      : good
        ? 'text-signal bg-signal-soft'
        : 'text-warn bg-warn-soft';
  const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→';
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
        tone,
      )}
    >
      <span aria-hidden className="text-[0.7em] leading-none">
        {arrow}
      </span>
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

/**
 * Friendly metric card — big rounded number, sentence-case label, soft trend
 * chip. Reads well in both light and dark. Degrades to a muted dash when empty.
 */
export function MetricCard({
  label,
  value,
  unit,
  trendPct,
  upIsGood = true,
  footnote,
  accent,
  empty,
}: Props) {
  return (
    <div className="card p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm text-ink-dim leading-snug">{label}</div>
        {trendPct != null && <TrendChip pct={trendPct} upIsGood={upIsGood} />}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={clsx(
            'text-3xl font-semibold tracking-tight tabular-nums',
            empty && 'text-ink-mute',
            !accent && !empty && 'text-ink',
          )}
          style={accent && !empty ? { color: accent } : undefined}
        >
          {value}
        </span>
        {unit && !empty && <span className="text-sm text-ink-mute font-medium">{unit}</span>}
      </div>
      {footnote && <div className="text-xs text-ink-mute leading-snug">{footnote}</div>}
    </div>
  );
}
