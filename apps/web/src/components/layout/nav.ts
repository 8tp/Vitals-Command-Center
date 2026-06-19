import type { NavIconKey } from '../shared/icons.js';

/** Single source of truth for primary navigation (Sidebar + mobile BottomNav). */
export const NAV = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: 'home' },
  { to: '/sleep', label: 'Sleep', short: 'Sleep', icon: 'sleep' },
  { to: '/workouts', label: 'Activity', short: 'Activity', icon: 'activity' },
  { to: '/habits', label: 'Habits', short: 'Habits', icon: 'habits' },
  { to: '/ask', label: 'Ask Claude', short: 'Ask', icon: 'sparkle' },
] as const satisfies ReadonlyArray<{
  to: string;
  label: string;
  short: string;
  icon: NavIconKey;
}>;
