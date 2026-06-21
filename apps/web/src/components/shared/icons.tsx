/*
 * Vitals icon set — friendly rounded line icons (lucide / feather style).
 * Replaces the old unicode instrument glyphs (◎ ☾ ⇡ ▦ ✶ ▲ ▼ ◆).
 *
 * Every icon:
 *  - is a single React component taking standard SVG props,
 *  - draws on a 24×24 viewBox with `currentColor`, round caps + joins,
 *  - defaults to 1.75 stroke + 20px box but accepts `size` / `strokeWidth`.
 *
 * Usage: <IconSleep size={18} className="text-signal" />
 */
import type { SVGProps } from 'react';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> {
  /** Square pixel size (width === height). Default 20. */
  size?: number;
  /** Stroke width in viewBox units. Default 1.75. */
  strokeWidth?: number;
}

function Svg({ size = 20, strokeWidth = 1.75, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ---------------- Navigation ---------------- */

/** Dashboard / Home — a friendly house. */
export function IconHome(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M5.5 9.5V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
      <path d="M9.5 20v-5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V20" />
    </Svg>
  );
}

/** Sleep — soft crescent moon. */
export function IconSleep(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 14.2A8 8 0 1 1 9.8 4 6.4 6.4 0 0 0 20 14.2Z" />
    </Svg>
  );
}

/** Activity — friendly pulse / trend line. */
export function IconActivity(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 13h3.2l2.3-6 3.2 12 2.6-9 1.8 3H21" />
    </Svg>
  );
}

/** Habits — rounded checklist. */
export function IconHabits(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="4" width="17" height="16" rx="3" />
      <path d="M7.5 9l1.6 1.6L12 7.7" />
      <path d="M7.5 15.3l1.6 1.6L12 14" />
      <path d="M14.5 9.2h3.2M14.5 15.5h3.2" />
    </Svg>
  );
}

/** Ask Claude — friendly sparkle. */
export function IconSparkle(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5c.4 3.3 1.7 4.6 5 5-3.3.4-4.6 1.7-5 5-.4-3.3-1.7-4.6-5-5 3.3-.4 4.6-1.7 5-5Z" />
      <path d="M18.5 14.5c.2 1.4.8 2 2.2 2.2-1.4.2-2 .8-2.2 2.2-.2-1.4-.8-2-2.2-2.2 1.4-.2 2-.8 2.2-2.2Z" />
    </Svg>
  );
}

/** Ask AI — chat bubble with a small AI spark. */
export function IconAskAI(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 11.5c0 3.9-3.6 7-8 7a9 9 0 0 1-2.5-.35L4.5 19.5l1.2-3.2A6.6 6.6 0 0 1 4 11.5c0-3.9 3.6-7 8-7s8 3.1 8 7Z" />
      <path d="M12 8.4c.25 1.6.9 2.2 2.5 2.45-1.6.25-2.25.9-2.5 2.5-.25-1.6-.9-2.25-2.5-2.5 1.6-.25 2.25-.85 2.5-2.45Z" />
    </Svg>
  );
}

/** Sync — circular refresh arrows. */
export function IconSync(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
      <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
      <path d="M21 4v4h-4" />
      <path d="M3 20v-4h4" />
    </Svg>
  );
}

/** Settings — gear. */
export function IconSettings(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
    </Svg>
  );
}

/** Send — arrow, for the chat composer. */
export function IconSend(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </Svg>
  );
}

/* ---------------- Trends / arrows ---------------- */

export function IconArrowUp(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 19V6" />
      <path d="M6.5 11.5 12 6l5.5 5.5" />
    </Svg>
  );
}

export function IconArrowDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v13" />
      <path d="M6.5 12.5 12 18l5.5-5.5" />
    </Svg>
  );
}

/** Flat / steady — a gentle dash. */
export function IconFlat(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 12h12" />
    </Svg>
  );
}

export function IconTrendingUp(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 16.5 10 10l3.5 3.5L20 7" />
      <path d="M15.5 7H20v4.5" />
    </Svg>
  );
}

export function IconTrendingDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7.5 10 14l3.5-3.5L20 17" />
      <path d="M15.5 17H20v-4.5" />
    </Svg>
  );
}

/* ---------------- Theme ---------------- */

export function IconSun(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.4M12 19v2.4M2.6 12h2.4M19 12h2.4M5.1 5.1l1.7 1.7M17.2 17.2l1.7 1.7M18.9 5.1l-1.7 1.7M6.8 17.2l-1.7 1.7" />
    </Svg>
  );
}

export function IconMoon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 13.4A8 8 0 1 1 10.6 4a6.4 6.4 0 0 0 9.4 9.4Z" />
    </Svg>
  );
}

export function IconMonitor(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4.5" width="18" height="12" rx="2.5" />
      <path d="M9 20h6M12 16.5V20" />
    </Svg>
  );
}

/* ---------------- Metrics / general ---------------- */

/** Readiness — a pulse curving into a ring (matches the brand mark idea). */
export function IconReadiness(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 12a9 9 0 1 1-3.2-6.9" />
      <path d="M5 12h2.6l1.6-3.4 2.4 6.8 1.7-4.2 1.1 2.3H19" />
    </Svg>
  );
}

/** Heart — RHR / heart-rate metrics. */
export function IconHeart(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 20s-7-4.6-7-9.6A4.4 4.4 0 0 1 12 7.3 4.4 4.4 0 0 1 19 10.4c0 5-7 9.6-7 9.6Z" />
    </Svg>
  );
}

/** Pulse — HRV / live heart-rate variability. */
export function IconPulse(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 12h4l2-5 3 10 2-7 1.5 4H21" />
    </Svg>
  );
}

/** Flame — strain / energy / streak. */
export function IconFlame(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3c.5 2.5 2.5 3.8 2.5 6a2.5 2.5 0 0 1-5 0c0-.7.2-1.2.5-1.8C7.5 8.8 6 11 6 13.6a6 6 0 0 0 12 0c0-3.8-3-6.8-6-10.6Z" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12.5 10 17.5 19 7" />
    </Svg>
  );
}

export function IconX(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 5l7 7-7 7" />
    </Svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 9l7 7 7-7" />
    </Svg>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
      <path d="M5.5 15.5H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5h9A1.5 1.5 0 0 1 15.5 5v.5" />
    </Svg>
  );
}

export function IconInfo(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <circle cx="12" cy="7.8" r="0.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconAlert(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5 21 19H3L12 3.5Z" />
      <path d="M12 9.5v4" />
      <circle cx="12" cy="16.5" r="0.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** The brand mark — a pulse curving into a ring, drawn with the teal→emerald
 *  gradient. Self-contained (defines its own gradient). Use for the header. */
export function BrandMark({ size = 22, ...rest }: Omit<IconProps, 'strokeWidth'>) {
  const gid = 'vitals-brand-grad';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden {...rest}>
      <defs>
        <linearGradient id={gid} x1="3" y1="4" x2="21" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--brand-from)" />
          <stop offset="1" stopColor="var(--brand-to)" />
        </linearGradient>
      </defs>
      {/* pulse curving into a ring */}
      <path
        d="M21 12a9 9 0 1 1-2.6-6.3"
        stroke={`url(#${gid})`}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M5 12h2.4l1.5-3.6 2.4 7.2 1.7-4.4 1 2.3H19"
        stroke={`url(#${gid})`}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/** Map of nav route -> icon, consumed by the layout nav. */
export const NAV_ICONS = {
  home: IconHome,
  sleep: IconSleep,
  activity: IconActivity,
  habits: IconHabits,
  sparkle: IconSparkle,
  ask: IconAskAI,
} as const;

export type NavIconKey = keyof typeof NAV_ICONS;
