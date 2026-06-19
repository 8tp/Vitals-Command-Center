import type { DeviceSource } from './devices.js';

export const CONFIDENCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW', 'NONE'] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

// Numeric weight applied to confidence bars in the UI (0..1).
export const CONFIDENCE_FILL: Record<ConfidenceLevel, number> = {
  HIGH: 1.0,
  MEDIUM: 0.6,
  LOW: 0.3,
  NONE: 0,
};

/**
 * Derive confidence from how many devices contributed a reading.
 * Per SPEC:
 *   3 devices agree         → HIGH
 *   2 devices agree         → HIGH
 *   1 device                → MEDIUM ("single source")
 *   0 devices               → NONE (fall back to habit tracker / prior trend)
 */
export function confidenceFromSources(sources: DeviceSource[]): ConfidenceLevel {
  const n = new Set(sources).size;
  if (n >= 2) return 'HIGH';
  if (n === 1) return 'MEDIUM';
  return 'NONE';
}

/**
 * Downgrade confidence when present-device readings diverge beyond a threshold.
 * For HRV/RHR, readings should agree within 2-3 bpm / ~5ms. Wider spread → LOW.
 */
export function confidenceFromSpread(
  values: number[],
  opts: { toleranceAbs?: number; toleranceRelPct?: number } = {},
): ConfidenceLevel {
  const nonNull = values.filter((v): v is number => Number.isFinite(v));
  if (nonNull.length === 0) return 'NONE';
  if (nonNull.length === 1) return 'MEDIUM';
  const min = Math.min(...nonNull);
  const max = Math.max(...nonNull);
  const spread = max - min;
  const mean = nonNull.reduce((a, b) => a + b, 0) / nonNull.length;
  const relPct = mean ? (spread / Math.abs(mean)) * 100 : 0;
  const absOk = opts.toleranceAbs !== undefined ? spread <= opts.toleranceAbs : true;
  const relOk = opts.toleranceRelPct !== undefined ? relPct <= opts.toleranceRelPct : true;
  return absOk && relOk ? 'HIGH' : 'LOW';
}

// Alert thresholds from SPEC — centralized so briefings + UI use the same constants.
export const ALERT_THRESHOLDS = {
  hrvDropPctFrom7dAvg: 15,
  rhrElevationBpmFrom14dBaseline: 5,
  tempDeviationCAboveBaseline: 0.5,
  sleepDebtHoursPerNight: 6,
  consecutiveSleepDebtNights: 2,
  consecutiveRecoveryDecline: 3,
  spo2LowerBound: 95,
  deepSleepMinHours: 1.5,
} as const;
