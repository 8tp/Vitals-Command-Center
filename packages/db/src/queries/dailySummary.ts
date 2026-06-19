import type { Database } from 'better-sqlite3';
import type {
  NormalizedDailySummary,
  ConfidenceLevel,
} from '@vcc/shared';

interface DailyRow {
  date: string;
  synced_at: string | null;
  has_whoop: number;
  has_oura: number;
  has_apple: number;
  has_fitbit: number;
  whoop_recovery_score: number | null;
  whoop_hrv: number | null;
  whoop_rhr: number | null;
  whoop_strain: number | null;
  whoop_calories: number | null;
  whoop_spo2: number | null;
  whoop_skin_temp_delta: number | null;
  whoop_sleep_score: number | null;
  whoop_sleep_hours: number | null;
  whoop_deep_hours: number | null;
  whoop_rem_hours: number | null;
  whoop_light_hours: number | null;
  oura_readiness_score: number | null;
  oura_sleep_score: number | null;
  oura_activity_score: number | null;
  oura_hrv: number | null;
  oura_rhr: number | null;
  oura_temp_deviation: number | null;
  oura_spo2: number | null;
  oura_respiratory_rate: number | null;
  oura_sleep_hours: number | null;
  oura_deep_hours: number | null;
  oura_rem_hours: number | null;
  oura_light_hours: number | null;
  oura_steps: number | null;
  oura_active_calories: number | null;
  oura_total_calories: number | null;
  oura_stress_high_min: number | null;
  apple_hrv: number | null;
  apple_rhr: number | null;
  apple_spo2: number | null;
  apple_vo2max: number | null;
  apple_respiratory_rate: number | null;
  apple_steps: number | null;
  apple_active_calories: number | null;
  apple_basal_calories: number | null;
  apple_distance_km: number | null;
  apple_exercise_minutes: number | null;
  apple_stand_hours: number | null;
  fitbit_hrv: number | null;
  fitbit_rhr: number | null;
  fitbit_spo2: number | null;
  fitbit_skin_temp_delta: number | null;
  fitbit_respiratory_rate: number | null;
  fitbit_sleep_score: number | null;
  fitbit_sleep_hours: number | null;
  fitbit_deep_hours: number | null;
  fitbit_rem_hours: number | null;
  fitbit_light_hours: number | null;
  fitbit_steps: number | null;
  fitbit_calories_burned: number | null;
  fitbit_calories_in: number | null;
  consensus_hrv: number | null;
  consensus_rhr: number | null;
  consensus_sleep_hours: number | null;
  confidence_level: ConfidenceLevel | null;
  devices_active: number;
}

const COLUMNS = [
  'date','synced_at','has_whoop','has_oura','has_apple','has_fitbit',
  'whoop_recovery_score','whoop_hrv','whoop_rhr','whoop_strain','whoop_calories','whoop_spo2','whoop_skin_temp_delta','whoop_sleep_score','whoop_sleep_hours','whoop_deep_hours','whoop_rem_hours','whoop_light_hours',
  'oura_readiness_score','oura_sleep_score','oura_activity_score','oura_hrv','oura_rhr','oura_temp_deviation','oura_spo2','oura_respiratory_rate','oura_sleep_hours','oura_deep_hours','oura_rem_hours','oura_light_hours','oura_steps','oura_active_calories','oura_total_calories','oura_stress_high_min',
  'apple_hrv','apple_rhr','apple_spo2','apple_vo2max','apple_respiratory_rate','apple_steps','apple_active_calories','apple_basal_calories','apple_distance_km','apple_exercise_minutes','apple_stand_hours',
  'fitbit_hrv','fitbit_rhr','fitbit_spo2','fitbit_skin_temp_delta','fitbit_respiratory_rate','fitbit_sleep_score','fitbit_sleep_hours','fitbit_deep_hours','fitbit_rem_hours','fitbit_light_hours','fitbit_steps','fitbit_calories_burned','fitbit_calories_in',
  'consensus_hrv','consensus_rhr','consensus_sleep_hours','confidence_level','devices_active',
] as const;

export function get(db: Database, date: string): NormalizedDailySummary | null {
  const row = db.prepare('SELECT * FROM daily_summary WHERE date = ?').get(date) as DailyRow | undefined;
  return row ? toNormalized(row) : null;
}

export function list(db: Database, start: string, end: string): NormalizedDailySummary[] {
  const rows = db
    .prepare('SELECT * FROM daily_summary WHERE date BETWEEN ? AND ? ORDER BY date DESC')
    .all(start, end) as DailyRow[];
  return rows.map(toNormalized);
}

export function upsert(db: Database, patch: Partial<DailyRow> & { date: string }): void {
  const current = db.prepare('SELECT * FROM daily_summary WHERE date = ?').get(patch.date) as
    | DailyRow
    | undefined;

  const merged: Partial<DailyRow> = { ...current, ...patch };
  merged.synced_at = new Date().toISOString();

  const cols = COLUMNS.filter((c) => merged[c] !== undefined);
  const placeholders = cols.map(() => '?').join(',');
  const updateSet = cols
    .filter((c) => c !== 'date')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');
  const sql = `INSERT INTO daily_summary (${cols.join(',')}) VALUES (${placeholders})
               ON CONFLICT(date) DO UPDATE SET ${updateSet}`;
  db.prepare(sql).run(cols.map((c) => merged[c] ?? null));
}

function toNormalized(r: DailyRow): NormalizedDailySummary {
  const active =
    (r.has_whoop ? 1 : 0) + (r.has_oura ? 1 : 0) + (r.has_apple ? 1 : 0) + (r.has_fitbit ? 1 : 0);
  return {
    date: r.date,
    syncedAt: r.synced_at,
    devices: {
      whoop: !!r.has_whoop,
      oura: !!r.has_oura,
      apple: !!r.has_apple,
      fitbit: !!r.has_fitbit,
      active,
    },
    whoop: r.has_whoop
      ? {
          recoveryScore: r.whoop_recovery_score,
          hrv: r.whoop_hrv,
          rhr: r.whoop_rhr,
          strain: r.whoop_strain,
          calories: r.whoop_calories,
          spo2: r.whoop_spo2,
          skinTempDelta: r.whoop_skin_temp_delta,
          sleepScore: r.whoop_sleep_score,
          sleepHours: r.whoop_sleep_hours,
          deepHours: r.whoop_deep_hours,
          remHours: r.whoop_rem_hours,
          lightHours: r.whoop_light_hours,
        }
      : null,
    oura: r.has_oura
      ? {
          readinessScore: r.oura_readiness_score,
          sleepScore: r.oura_sleep_score,
          activityScore: r.oura_activity_score,
          hrv: r.oura_hrv,
          rhr: r.oura_rhr,
          tempDeviation: r.oura_temp_deviation,
          spo2: r.oura_spo2,
          respiratoryRate: r.oura_respiratory_rate,
          sleepHours: r.oura_sleep_hours,
          deepHours: r.oura_deep_hours,
          remHours: r.oura_rem_hours,
          lightHours: r.oura_light_hours,
          steps: r.oura_steps,
          activeCalories: r.oura_active_calories,
          totalCalories: r.oura_total_calories,
          stressHighMinutes: r.oura_stress_high_min,
        }
      : null,
    apple: r.has_apple
      ? {
          hrv: r.apple_hrv,
          rhr: r.apple_rhr,
          spo2: r.apple_spo2,
          vo2max: r.apple_vo2max,
          respiratoryRate: r.apple_respiratory_rate,
          steps: r.apple_steps,
          activeCalories: r.apple_active_calories,
          basalCalories: r.apple_basal_calories,
          distanceKm: r.apple_distance_km,
          exerciseMinutes: r.apple_exercise_minutes,
          standHours: r.apple_stand_hours,
        }
      : null,
    fitbit: r.has_fitbit
      ? {
          hrv: r.fitbit_hrv,
          rhr: r.fitbit_rhr,
          spo2: r.fitbit_spo2,
          skinTempDelta: r.fitbit_skin_temp_delta,
          respiratoryRate: r.fitbit_respiratory_rate,
          sleepScore: r.fitbit_sleep_score,
          sleepHours: r.fitbit_sleep_hours,
          deepHours: r.fitbit_deep_hours,
          remHours: r.fitbit_rem_hours,
          lightHours: r.fitbit_light_hours,
          steps: r.fitbit_steps,
          caloriesBurned: r.fitbit_calories_burned,
          caloriesIn: r.fitbit_calories_in,
        }
      : null,
    consensus: {
      hrv: r.consensus_hrv,
      rhr: r.consensus_rhr,
      sleepHours: r.consensus_sleep_hours,
      level: (r.confidence_level ?? 'NONE') as ConfidenceLevel,
    },
  };
}
