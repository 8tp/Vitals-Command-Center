import type { ReactNode } from 'react';
import { SyncButton } from '../shared/SyncButton.js';

interface PageHeaderProps {
  /** The page title / greeting. Wrap secondary words in <span className="text-ink-mute">. */
  title: ReactNode;
  /** One-line context under the title (the "why", replaces the old eyebrow). */
  subtitle?: ReactNode;
  /** Right-side date block (stacked label + small caption). */
  date?: ReactNode;
  /** Extra right-side actions, placed before the sync button. */
  actions?: ReactNode;
  /** Show the sync control. Default true. */
  showSync?: boolean;
}

/**
 * Standard page header for the Instrument shell: big Geist title + a one-line
 * subhead, with a date + sync control on the right. Edge-to-edge with a single
 * bottom hairline — no card. Used by every page.
 */
export function PageHeader({ title, subtitle, date, actions, showSync = true }: PageHeaderProps) {
  return (
    <header className="flex items-end justify-between gap-5 flex-wrap px-6 md:px-10 pt-7 md:pt-8 pb-5 border-b border-hairline">
      <div className="min-w-0">
        <h1 className="font-display font-semibold text-[clamp(25px,3.2vw,36px)] leading-none tracking-tightest text-ink">
          {title}
        </h1>
        {subtitle && <p className="mt-2.5 text-[13.5px] text-ink-mute">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {date && <div className="text-right leading-tight">{date}</div>}
        {actions}
        {showSync && <SyncButton />}
      </div>
    </header>
  );
}

/** Compact date block for the header right side. */
export function HeaderDate({ primary, caption }: { primary: string; caption?: string }) {
  return (
    <div className="text-right">
      <div className="text-[12.5px] font-medium text-ink-dim">{primary}</div>
      {caption && <div className="meta-mono mt-0.5">{caption}</div>}
    </div>
  );
}
