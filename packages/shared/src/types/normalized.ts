import type { DeviceSource } from '../devices.js';
import type { ConfidenceLevel } from '../confidence.js';

/** One row per date — cross-device snapshot backed by daily_summary table. */
export interface NormalizedDailySummary {
  date: string; // YYYY-MM-DD
  syncedAt: string | null;

  devices: {
    whoop: boolean;
    oura: boolean;
    apple: boolean;
    fitbit: boolean;
    active: number;
  };

  whoop: WhoopDay | null;
  oura: OuraDay | null;
  apple: AppleDay | null;
  fitbit: FitbitDay | null;

  consensus: {
    hrv: number | null;
    rhr: number | null;
    sleepHours: number | null;
    level: ConfidenceLevel;
  };
}

export interface WhoopDay {
  recoveryScore: number | null;
  hrv: number | null;
  rhr: number | null;
  strain: number | null;
  calories: number | null;
  spo2: number | null;
  skinTempDelta: number | null;
  sleepScore: number | null;
  sleepHours: number | null;
  deepHours: number | null;
  remHours: number | null;
  lightHours: number | null;
}

export interface OuraDay {
  readinessScore: number | null;
  sleepScore: number | null;
  activityScore: number | null;
  hrv: number | null;
  rhr: number | null;
  tempDeviation: number | null;
  spo2: number | null;
  respiratoryRate: number | null;
  sleepHours: number | null;
  deepHours: number | null;
  remHours: number | null;
  lightHours: number | null;
  steps: number | null;
  activeCalories: number | null;
  totalCalories: number | null;
  stressHighMinutes: number | null;
}

/** Fitbit Air via Google Health API (primary vitals source as of 2026-06). */
export interface FitbitDay {
  hrv: number | null;
  rhr: number | null;
  spo2: number | null;
  skinTempDelta: number | null;
  respiratoryRate: number | null;
  sleepScore: number | null;
  sleepHours: number | null;
  deepHours: number | null;
  remHours: number | null;
  lightHours: number | null;
  steps: number | null;
  caloriesBurned: number | null; // active energy burned (kcal)
  caloriesIn: number | null; // logged food intake (kcal); null when not logged / no nutrition scope
}

export interface AppleDay {
  hrv: number | null;
  rhr: number | null;
  spo2: number | null;
  vo2max: number | null;
  respiratoryRate: number | null;
  steps: number | null;
  activeCalories: number | null;
  basalCalories: number | null;
  distanceKm: number | null;
  exerciseMinutes: number | null;
  standHours: number | null;
}

export interface SleepSession {
  id: string;
  date: string;
  source: DeviceSource;
  startTime: string; // ISO
  endTime: string;
  isNap: boolean;
  totalMinutes: number;
  deepMinutes: number;
  remMinutes: number;
  lightMinutes: number;
  awakeMinutes: number;
  sleepScore: number | null;
  avgHr: number | null;
  avgHrv: number | null;
  avgRespiratoryRate: number | null;
  spo2: number | null;
}

export interface Workout {
  id: string;
  date: string;
  source: DeviceSource;
  sport: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  strain: number | null; // WHOOP only (0..21)
  avgHr: number | null;
  maxHr: number | null;
  calories: number | null;
  distanceKm: number | null;
  zoneMinutes: {
    z1: number;
    z2: number;
    z3: number;
    z4: number;
    z5: number;
  };
  notes: string | null;
}

export interface MetricTrendPoint {
  date: string;
  value: number | null;
  source: DeviceSource | 'consensus';
}

export interface MetricTrend {
  metric: string;
  range: { start: string; end: string; days: number };
  points: MetricTrendPoint[];
  movingAverage7d: Array<{ date: string; value: number | null }>;
  delta: { pct: number | null; direction: 'up' | 'down' | 'flat' };
}

export interface DeviceStatus {
  source: DeviceSource;
  connected: boolean;
  lastSeen: string | null;
  lastSyncOk: boolean;
  message: string | null;
}
