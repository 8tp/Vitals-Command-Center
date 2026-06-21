import type { ReactNode } from 'react';
import clsx from 'clsx';
import { IconArrowUp, IconArrowDown } from './icons.js';

export type DeltaTone = 'good' | 'accent' | 'alert' | 'warn' | 'mute';

const TONE_CLASS: Record<DeltaTone, string> = {
  good: 'text-good',
  accent: 'text-accent',
  alert: 'text-alert',
  warn: 'text-warn',
  mute: 'text-ink-mute',
};

/** A small directional delta badge (arrow + value), tone-colored by meaning. */
export function Delta({ text, dir, tone = 'good' }: { text: string; dir: 'up' | 'down'; tone?: DeltaTone }) {
  const Icon = dir === 'up' ? IconArrowUp : IconArrowDown;
  return (
    <span className={clsx('inline-flex items-center gap-0.5 text-[11.5px] font-semibold num', TONE_CLASS[tone])}>
      <Icon size={12} strokeWidth={2.4} />
      {text}
    </span>
  );
}

const SIZE: Record<'md' | 'lg' | 'xl', string> = {
  md: 'text-[26px]',
  lg: 'text-[32px]',
  xl: 'text-[clamp(30px,3.6vw,42px)]',
};

interface MetricProps {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  /** Optional small icon shown beside the label. */
  icon?: ReactNode;
  delta?: { text: string; dir: 'up' | 'down'; tone?: DeltaTone };
  /** Caption below the value. */
  sub?: ReactNode;
  /** Extra node below the value (mini bar, etc.). */
  children?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
  className?: string;
}

/**
 * The core Instrument metric: a quiet uppercase label over a big Geist
 * tabular numeral, with an optional unit, delta, and caption. No box — meant to
 * sit in a hairline-divided row or a bare section. Shared across all pages.
 */
export function Metric({ label, value, unit, icon, delta, sub, children, size = 'lg', className }: MetricProps) {
  return (
    <div className={className}>
      <div className="label-micro flex items-center gap-1.5">
        {icon && <span className="text-accent/80">{icon}</span>}
        {label}
      </div>
      <div className={clsx('font-display font-semibold num tracking-tightest text-ink leading-none mt-3.5', SIZE[size])}>
        {value}
        {unit && <span className="text-ink-mute font-medium text-[0.42em] ml-1">{unit}</span>}
      </div>
      {delta && (
        <div className="mt-2">
          <Delta {...delta} />
        </div>
      )}
      {children}
      {sub && <div className="mt-2 text-[11.5px] text-ink-mute font-normal">{sub}</div>}
    </div>
  );
}
