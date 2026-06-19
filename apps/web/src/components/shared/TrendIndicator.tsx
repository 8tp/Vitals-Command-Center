import clsx from 'clsx';
import { fmtPct } from '../../lib/formatters.js';
import { IconArrowUp, IconArrowDown, IconFlat } from './icons.js';

interface Props {
  pct: number | null;
  direction?: 'up' | 'down' | 'flat';
  /** Whether "up" is good. HRV: up is good. RHR: up is bad. */
  upIsGood?: boolean;
}

export function TrendIndicator({ pct, direction, upIsGood = true }: Props) {
  if (pct == null) return <span className="text-ink-mute text-2xs">—</span>;
  const dir = direction ?? (pct > 1 ? 'up' : pct < -1 ? 'down' : 'flat');
  const good = dir === 'flat' ? null : (dir === 'up') === upIsGood;
  const color = good === null ? 'text-ink-mute' : good ? 'text-signal' : 'text-warn';
  const Icon = dir === 'up' ? IconArrowUp : dir === 'down' ? IconArrowDown : IconFlat;
  return (
    <span className={clsx('num text-2xs font-semibold inline-flex items-center gap-0.5', color)}>
      <Icon size={13} strokeWidth={2.25} />
      {fmtPct(Math.abs(pct), 0)}
    </span>
  );
}
