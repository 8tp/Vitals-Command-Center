import type { Database } from 'better-sqlite3';
import { queries } from '@vcc/db';
import { DEVICE_SOURCES, accuracyWeight, confidenceFromSources, type DeviceSource } from '@vcc/shared';

import type { WhoopDailyRow } from './whoop.js';
import type { OuraDailyRow } from './oura.js';
import type { AppleDailyRow } from './apple-health.js';
import type { FitbitDailyRow } from './fitbit.js';

/**
 * Fold per-device daily rows into one unified row per date, computing:
 *  - device availability booleans
 *  - weighted-average consensus for HRV / RHR / sleep hours
 *  - confidence level based on how many sources contributed
 */
export interface UpsertResult {
  upserted: number;
  dates: string[];
}

export function normalizeAndUpsert(
  db: Database,
  perDevice: {
    whoop?: WhoopDailyRow[];
    oura?: OuraDailyRow[];
    apple?: AppleDailyRow[];
    fitbit?: FitbitDailyRow[];
  },
): UpsertResult {
  const dates = new Set<string>();
  const byDate = {
    whoop: indexByDate(perDevice.whoop ?? []),
    oura: indexByDate(perDevice.oura ?? []),
    apple: indexByDate(perDevice.apple ?? []),
    fitbit: indexByDate(perDevice.fitbit ?? []),
  };
  for (const map of Object.values(byDate)) for (const k of map.keys()) dates.add(k);

  let count = 0;
  db.transaction(() => {
    for (const date of dates) {
      const w = byDate.whoop.get(date);
      const o = byDate.oura.get(date);
      const a = byDate.apple.get(date);
      const fb = byDate.fitbit.get(date);

      const devicesPresent: DeviceSource[] = [];
      if (fb) devicesPresent.push('fitbit');
      if (w) devicesPresent.push('whoop');
      if (o) devicesPresent.push('oura');
      if (a) devicesPresent.push('apple');

      const consensusHrv = weightedAvg('hrv', {
        fitbit: fb?.hrv ?? null,
        whoop: w?.hrv ?? null,
        oura: o?.hrv ?? null,
        apple: a?.hrv ?? null,
      });
      const consensusRhr = weightedAvg('rhr', {
        fitbit: fb?.rhr ?? null,
        whoop: w?.rhr ?? null,
        oura: o?.rhr ?? null,
        apple: a?.rhr ?? null,
      });
      const consensusSleep = weightedAvg('sleep_stages', {
        fitbit: fb?.sleepHours ?? null,
        whoop: w?.sleepHours ?? null,
        oura: o?.sleepHours ?? null,
        apple: null,
      });

      const confidence = confidenceFromSources(devicesPresent);

      queries.dailySummary.upsert(db, {
        date,
        has_whoop: w ? 1 : 0,
        has_oura: o ? 1 : 0,
        has_apple: a ? 1 : 0,
        has_fitbit: fb ? 1 : 0,

        whoop_recovery_score: w?.recoveryScore ?? null,
        whoop_hrv: w?.hrv ?? null,
        whoop_rhr: w?.rhr ?? null,
        whoop_strain: w?.strain ?? null,
        whoop_calories: w?.calories ?? null,
        whoop_spo2: w?.spo2 ?? null,
        whoop_skin_temp_delta: w?.skinTempDelta ?? null,
        whoop_sleep_score: w?.sleepScore ?? null,
        whoop_sleep_hours: w?.sleepHours ?? null,
        whoop_deep_hours: w?.deepHours ?? null,
        whoop_rem_hours: w?.remHours ?? null,
        whoop_light_hours: w?.lightHours ?? null,

        oura_readiness_score: o?.readinessScore ?? null,
        oura_sleep_score: o?.sleepScore ?? null,
        oura_activity_score: o?.activityScore ?? null,
        oura_hrv: o?.hrv ?? null,
        oura_rhr: o?.rhr ?? null,
        oura_temp_deviation: o?.tempDeviation ?? null,
        oura_spo2: o?.spo2 ?? null,
        oura_respiratory_rate: o?.respiratoryRate ?? null,
        oura_sleep_hours: o?.sleepHours ?? null,
        oura_deep_hours: o?.deepHours ?? null,
        oura_rem_hours: o?.remHours ?? null,
        oura_light_hours: o?.lightHours ?? null,
        oura_steps: o?.steps ?? null,
        oura_active_calories: o?.activeCalories ?? null,
        oura_total_calories: o?.totalCalories ?? null,
        oura_stress_high_min: o?.stressHighMinutes ?? null,

        apple_hrv: a?.hrv ?? null,
        apple_rhr: a?.rhr ?? null,
        apple_spo2: a?.spo2 ?? null,
        apple_vo2max: a?.vo2max ?? null,
        apple_respiratory_rate: a?.respiratoryRate ?? null,
        apple_steps: a?.steps ?? null,
        apple_active_calories: a?.activeCalories ?? null,
        apple_basal_calories: a?.basalCalories ?? null,
        apple_distance_km: a?.distanceKm ?? null,
        apple_exercise_minutes: null, // filled by apple parser for workouts
        apple_stand_hours: a?.standHours ?? null,

        fitbit_hrv: fb?.hrv ?? null,
        fitbit_rhr: fb?.rhr ?? null,
        fitbit_spo2: fb?.spo2 ?? null,
        fitbit_skin_temp_delta: fb?.skinTempDelta ?? null,
        fitbit_respiratory_rate: fb?.respiratoryRate ?? null,
        fitbit_sleep_score: fb?.sleepScore ?? null,
        fitbit_sleep_hours: fb?.sleepHours ?? null,
        fitbit_deep_hours: fb?.deepHours ?? null,
        fitbit_rem_hours: fb?.remHours ?? null,
        fitbit_light_hours: fb?.lightHours ?? null,
        fitbit_steps: fb?.steps ?? null,
        fitbit_calories_burned: fb?.caloriesBurned ?? null,
        fitbit_calories_in: fb?.caloriesIn ?? null,

        consensus_hrv: consensusHrv,
        consensus_rhr: consensusRhr,
        consensus_sleep_hours: consensusSleep,
        confidence_level: confidence,
        devices_active: devicesPresent.length,
      });
      count += 1;
    }
  })();

  return { upserted: count, dates: [...dates].sort() };
}

function indexByDate<T extends { date: string }>(rows: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) m.set(r.date, r);
  return m;
}

/**
 * Per-device weighted mean, respecting DEVICE_ACCURACY hierarchy.
 * Missing values are dropped rather than counted as zero.
 */
function weightedAvg(metric: string, values: Record<DeviceSource, number | null>): number | null {
  let num = 0;
  let den = 0;
  for (const device of DEVICE_SOURCES) {
    const v = values[device];
    if (v == null || !Number.isFinite(v)) continue;
    const w = accuracyWeight(metric, device);
    if (w === 0) continue;
    num += v * w;
    den += w;
  }
  return den > 0 ? num / den : null;
}
