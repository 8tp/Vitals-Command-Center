import { create } from 'zustand';
import type { Units } from '../lib/units.js';

/**
 * Measurement system for distance / pace / temperature display. A pure client
 * display preference (like theme) — persisted to localStorage so it's instant
 * with no flash. Defaults to Imperial (this dashboard's owner is US-based and
 * their Strava measurement preference is Imperial).
 */
const STORAGE_KEY = 'vcc-units';

function readUnits(): Units {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'metric' || v === 'imperial') return v;
  } catch {
    /* ignore */
  }
  return 'imperial';
}

interface UnitsState {
  units: Units;
  setUnits: (u: Units) => void;
}

export const useUnitsStore = create<UnitsState>((set) => ({
  units: readUnits(),
  setUnits: (units) => {
    try {
      localStorage.setItem(STORAGE_KEY, units);
    } catch {
      /* ignore */
    }
    set({ units });
  },
}));

/** Convenience selector. */
export const useUnits = (): Units => useUnitsStore((s) => s.units);
