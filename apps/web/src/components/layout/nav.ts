import type { NavIconKey } from '../shared/icons.js';

/** Single source of truth for primary navigation (Sidebar + mobile BottomNav). */
export const NAV = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: 'home' },
  { to: '/sleep', label: 'Sleep', short: 'Sleep', icon: 'sleep' },
  { to: '/workouts', label: 'Activity', short: 'Activity', icon: 'activity' },
  { to: '/trends', label: 'Trends', short: 'Trends', icon: 'trends' },
  { to: '/habits', label: 'Habits', short: 'Habits', icon: 'habits' },
  { to: '/ask', label: 'Ask AI', short: 'Ask AI', icon: 'ask', ai: true },
] as const satisfies ReadonlyArray<{
  to: string;
  label: string;
  short: string;
  icon: NavIconKey;
  /** AI-only tab: hidden when the AI master switch is off. */
  ai?: boolean;
}>;

/** Nav items visible given the AI master switch (drops AI-only tabs when off). */
export function visibleNav(aiEnabled: boolean): (typeof NAV)[number][] {
  return NAV.filter((item) => aiEnabled || !('ai' in item && item.ai));
}
