import { createReadStream } from 'node:fs';
import { parseStringPromise } from 'xml2js';
import type { FastifyBaseLogger } from 'fastify';
import type { SleepSession, Workout } from '@vcc/shared';

/**
 * Apple Health XML parser.
 *
 * Path: export.zip from iOS Health > Profile > Export All Health Data, unzipped.
 * Contains export.xml with <Record ...> and <Workout ...> entries.
 *
 * Aggregates <Record> into daily rows; maps <Workout> entries directly to the
 * Workout table. Sleep sessions from Apple Health are noisy (per-segment) and
 * WHOOP/Oura provide cleaner per-session data, so we skip HK sleep aggregation.
 */

export interface AppleDailyRow {
  date: string;
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

export interface AppleFetchResult {
  daily: AppleDailyRow[];
  sleepSessions: SleepSession[];
  workouts: Workout[];
}

interface HkRecord {
  type: string;
  unit?: string;
  value?: string;
  startDate: string;
  endDate: string;
}

interface HkWorkout {
  workoutActivityType: string;
  duration?: string;
  durationUnit?: string;
  totalDistance?: string;
  totalDistanceUnit?: string;
  totalEnergyBurned?: string;
  startDate: string;
  endDate: string;
}

const PULL_TYPES = new Set([
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierOxygenSaturation',
  'HKQuantityTypeIdentifierVO2Max',
  'HKQuantityTypeIdentifierRespiratoryRate',
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierBasalEnergyBurned',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierAppleExerciseTime',
  'HKCategoryTypeIdentifierAppleStandHour',
]);

// Map HK workout activity types → our sport slugs.
const HK_WORKOUT_MAP: Record<string, string> = {
  HKWorkoutActivityTypeRunning: 'running',
  HKWorkoutActivityTypeWalking: 'walking',
  HKWorkoutActivityTypeHiking: 'hiking',
  HKWorkoutActivityTypeCycling: 'cycling',
  HKWorkoutActivityTypeTraditionalStrengthTraining: 'lifting',
  HKWorkoutActivityTypeFunctionalStrengthTraining: 'functional_fitness',
  HKWorkoutActivityTypeHighIntensityIntervalTraining: 'hiit',
  HKWorkoutActivityTypeElliptical: 'elliptical',
  HKWorkoutActivityTypeRowing: 'rowing',
  HKWorkoutActivityTypeSwimming: 'swimming',
  HKWorkoutActivityTypeYoga: 'yoga',
  HKWorkoutActivityTypeMixedCardio: 'hiit',
  HKWorkoutActivityTypeCoreTraining: 'functional_fitness',
  HKWorkoutActivityTypeOther: 'other',
};

export class AppleHealthParser {
  constructor(private readonly log?: FastifyBaseLogger) {}

  async parseFile(xmlPath: string, start: string, end: string): Promise<AppleFetchResult> {
    const content = await streamToString(createReadStream(xmlPath));
    const parsed = (await parseStringPromise(content, { explicitArray: false, mergeAttrs: true })) as {
      HealthData?: { Record?: HkRecord[] | HkRecord; Workout?: HkWorkout[] | HkWorkout };
    };
    const records = toArray(parsed.HealthData?.Record);
    const rawWorkouts = toArray(parsed.HealthData?.Workout);
    this.log?.info(
      { records: records.length, workouts: rawWorkouts.length, start, end },
      'apple-health: parsed',
    );

    // --- Daily aggregation ------------------------------------------------
    const byDate = new Map<string, AppleDailyRow>();
    for (const r of records) {
      if (!PULL_TYPES.has(r.type)) continue;
      const date = r.startDate.slice(0, 10);
      if (date < start || date > end) continue;
      const row = getOrInit(byDate, date);
      applyRecord(row, r);
    }

    // --- Workouts ---------------------------------------------------------
    const workouts: Workout[] = rawWorkouts
      .filter((w) => {
        const d = w.startDate.slice(0, 10);
        return d >= start && d <= end;
      })
      .map((w) => {
        const duration = Number(w.duration ?? 0) * durationFactor(w.durationUnit);
        const distanceKm =
          w.totalDistance != null
            ? Number(w.totalDistance) * distanceFactor(w.totalDistanceUnit)
            : null;
        return {
          id: `wo_a_${Buffer.from(w.startDate + w.workoutActivityType).toString('base64url').slice(0, 20)}`,
          date: w.startDate.slice(0, 10),
          source: 'apple',
          sport: HK_WORKOUT_MAP[w.workoutActivityType] ?? 'other',
          startTime: w.startDate,
          endTime: w.endDate,
          durationMinutes: duration,
          strain: null,
          avgHr: null,
          maxHr: null,
          calories: w.totalEnergyBurned != null ? Math.round(Number(w.totalEnergyBurned)) : null,
          distanceKm,
          zoneMinutes: { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 },
          notes: null,
        };
      });

    return {
      daily: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
      sleepSessions: [],
      workouts,
    };
  }
}

function applyRecord(row: AppleDailyRow, r: HkRecord): void {
  const v = r.value ? Number(r.value) : null;
  if (v == null || Number.isNaN(v)) return;
  switch (r.type) {
    case 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN':
      row.hrv = avg(row.hrv, v);
      break;
    case 'HKQuantityTypeIdentifierRestingHeartRate':
      row.rhr = avg(row.rhr, v);
      break;
    case 'HKQuantityTypeIdentifierOxygenSaturation':
      row.spo2 = avg(row.spo2, v * 100);
      break;
    case 'HKQuantityTypeIdentifierVO2Max':
      row.vo2max = v;
      break;
    case 'HKQuantityTypeIdentifierRespiratoryRate':
      row.respiratoryRate = avg(row.respiratoryRate, v);
      break;
    case 'HKQuantityTypeIdentifierStepCount':
      row.steps = (row.steps ?? 0) + v;
      break;
    case 'HKQuantityTypeIdentifierActiveEnergyBurned':
      row.activeCalories = (row.activeCalories ?? 0) + v;
      break;
    case 'HKQuantityTypeIdentifierBasalEnergyBurned':
      row.basalCalories = (row.basalCalories ?? 0) + v;
      break;
    case 'HKQuantityTypeIdentifierDistanceWalkingRunning': {
      const km = r.unit === 'mi' ? v * 1.609 : v;
      row.distanceKm = (row.distanceKm ?? 0) + km;
      break;
    }
    case 'HKQuantityTypeIdentifierAppleExerciseTime':
      row.exerciseMinutes = (row.exerciseMinutes ?? 0) + v;
      break;
    case 'HKCategoryTypeIdentifierAppleStandHour':
      row.standHours = (row.standHours ?? 0) + 1;
      break;
  }
}

function avg(existing: number | null, next: number): number {
  if (existing == null) return next;
  return (existing + next) / 2;
}

function getOrInit(map: Map<string, AppleDailyRow>, date: string): AppleDailyRow {
  let row = map.get(date);
  if (!row) {
    row = {
      date,
      hrv: null,
      rhr: null,
      spo2: null,
      vo2max: null,
      respiratoryRate: null,
      steps: null,
      activeCalories: null,
      basalCalories: null,
      distanceKm: null,
      exerciseMinutes: null,
      standHours: null,
    };
    map.set(date, row);
  }
  return row;
}

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined) return [];
  return Array.isArray(val) ? val : [val];
}

function durationFactor(unit: string | undefined): number {
  // HKWorkout.duration default is minutes; occasionally seconds or hours.
  if (!unit || unit === 'min') return 1;
  if (unit === 'sec' || unit === 's') return 1 / 60;
  if (unit === 'hr' || unit === 'h') return 60;
  return 1;
}

function distanceFactor(unit: string | undefined): number {
  if (!unit || unit === 'km') return 1;
  if (unit === 'mi') return 1.609;
  if (unit === 'm') return 0.001;
  return 1;
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

// ===========================================================================
// Health Auto Export (REST ingest) parser.
//
// The iOS "Health Auto Export" app POSTs JSON of the form:
//   { data: { metrics: [{ name, units, data: [{ date, qty|Avg|min|max, ... }] }],
//             workouts: [{ name|type, start, end, duration, ... }] } }
// We are tolerant of missing/extra fields and of value-field name variants.
// ===========================================================================

// Map Health Auto Export metric names → which AppleDailyRow field + how to fold.
// HAE metric names are snake/lower; we normalize before lookup.
type Fold = 'avg' | 'sum' | 'last';
interface MetricSpec {
  field: keyof AppleDailyRow;
  fold: Fold;
  scale?: number; // multiply each value (e.g. spo2 fraction → percent)
}
const HAE_METRIC_MAP: Record<string, MetricSpec> = {
  heart_rate_variability: { field: 'hrv', fold: 'avg' },
  heart_rate_variability_sdnn: { field: 'hrv', fold: 'avg' },
  hrv_sdnn: { field: 'hrv', fold: 'avg' },
  resting_heart_rate: { field: 'rhr', fold: 'avg' },
  blood_oxygen_saturation: { field: 'spo2', fold: 'avg' },
  oxygen_saturation: { field: 'spo2', fold: 'avg' },
  vo2_max: { field: 'vo2max', fold: 'last' },
  vo2max: { field: 'vo2max', fold: 'last' },
  respiratory_rate: { field: 'respiratoryRate', fold: 'avg' },
  step_count: { field: 'steps', fold: 'sum' },
  steps: { field: 'steps', fold: 'sum' },
  active_energy: { field: 'activeCalories', fold: 'sum' },
  active_energy_burned: { field: 'activeCalories', fold: 'sum' },
  basal_energy_burned: { field: 'basalCalories', fold: 'sum' },
  resting_energy: { field: 'basalCalories', fold: 'sum' },
  walking_running_distance: { field: 'distanceKm', fold: 'sum' },
  distance_walking_running: { field: 'distanceKm', fold: 'sum' },
  apple_exercise_time: { field: 'exerciseMinutes', fold: 'sum' },
  apple_stand_hour: { field: 'standHours', fold: 'sum' },
};

interface HaeMetricPoint {
  date?: string;
  qty?: number | string;
  Avg?: number | string;
  avg?: number | string;
  min?: number | string;
  Min?: number | string;
  max?: number | string;
  Max?: number | string;
  value?: number | string;
}
interface HaeMetric {
  name?: string;
  units?: string;
  data?: HaeMetricPoint[];
}
interface HaeWorkout {
  id?: string;
  name?: string;
  type?: string;
  activityType?: string;
  start?: string;
  end?: string;
  duration?: number | string; // typically minutes
  durationUnit?: string;
  distance?: { qty?: number | string; units?: string } | number | string;
  totalDistance?: number | string;
  distanceUnit?: string;
  activeEnergy?: { qty?: number | string } | number | string;
  totalEnergy?: number | string;
  energyBurned?: number | string;
  avgHeartRate?: number | string;
  maxHeartRate?: number | string;
}
interface HaeSleepPoint {
  date?: string;
  startDate?: string;
  endDate?: string;
  start?: string;
  end?: string;
  value?: string; // e.g. "asleep" / "inBed" / stage names
  qty?: number | string; // hours (some exports)
  totalSleep?: number | string;
  deep?: number | string;
  rem?: number | string;
  core?: number | string;
  light?: number | string;
  awake?: number | string;
  asleep?: number | string;
}

export interface HealthAutoExportPayload {
  data?: {
    metrics?: HaeMetric[];
    workouts?: HaeWorkout[];
  };
}

function n(v: unknown): number | null {
  if (v == null) return null;
  const x = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(x) ? x : null;
}

/** A metric point's representative value: prefer qty, then Avg, then value/min/max. */
function pointValue(p: HaeMetricPoint): number | null {
  return (
    n(p.qty) ??
    n(p.Avg) ??
    n(p.avg) ??
    n(p.value) ??
    n(p.Max ?? p.max) ??
    n(p.Min ?? p.min)
  );
}

/**
 * Parse a Health Auto Export JSON payload into the same shapes the rest of the
 * pipeline consumes: AppleDailyRow[] (→ apple_* columns), SleepSession[] and
 * Workout[] (source 'apple'). Tolerant of missing sections/fields.
 */
export function parseHealthAutoExport(payload: HealthAutoExportPayload): AppleFetchResult {
  const metrics = payload?.data?.metrics ?? [];
  const rawWorkouts = payload?.data?.workouts ?? [];

  const byDate = new Map<string, AppleDailyRow>();
  // Track running averages so 'avg' folds are correct across multiple points/day.
  const avgState = new Map<string, { sum: number; count: number }>();

  for (const metric of metrics) {
    const key = (metric.name ?? '').trim().toLowerCase();
    if (key === 'sleep_analysis') continue; // handled separately below
    const spec = HAE_METRIC_MAP[key];
    if (!spec) continue;
    const unitIsMiles = (metric.units ?? '').toLowerCase().includes('mi');
    for (const p of metric.data ?? []) {
      const date = (p.date ?? '').slice(0, 10);
      if (!date) continue;
      let v = pointValue(p);
      if (v == null) continue;
      if (spec.scale) v *= spec.scale;
      // spo2 may arrive as a 0..1 fraction; normalize to percent.
      if (spec.field === 'spo2' && v <= 1) v *= 100;
      if (spec.field === 'distanceKm' && unitIsMiles) v *= 1.609;
      const row = getOrInit(byDate, date);
      applyFold(row, spec, v, date, key, avgState);
    }
  }

  // --- Sleep (optional) ----------------------------------------------------
  const sleepSessions = parseHaeSleep(metrics);

  // --- Workouts ------------------------------------------------------------
  const workouts: Workout[] = rawWorkouts
    .map((w) => toHaeWorkout(w))
    .filter((w): w is Workout => w !== null);

  return {
    daily: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    sleepSessions,
    workouts,
  };
}

function applyFold(
  row: AppleDailyRow,
  spec: MetricSpec,
  v: number,
  date: string,
  key: string,
  avgState: Map<string, { sum: number; count: number }>,
): void {
  const f = spec.field;
  if (spec.fold === 'sum') {
    (row[f] as number | null) = ((row[f] as number | null) ?? 0) + v;
  } else if (spec.fold === 'last') {
    (row[f] as number | null) = v;
  } else {
    // running average per (date, metric)
    const sk = `${date}|${key}`;
    const st = avgState.get(sk) ?? { sum: 0, count: 0 };
    st.sum += v;
    st.count += 1;
    avgState.set(sk, st);
    (row[f] as number | null) = st.sum / st.count;
  }
}

function parseHaeSleep(metrics: HaeMetric[]): SleepSession[] {
  const sleepMetric = metrics.find((m) => (m.name ?? '').trim().toLowerCase() === 'sleep_analysis');
  if (!sleepMetric?.data?.length) return [];
  const out: SleepSession[] = [];
  for (const raw of sleepMetric.data as HaeSleepPoint[]) {
    const start = raw.startDate ?? raw.start ?? raw.date;
    const end = raw.endDate ?? raw.end;
    if (!start) continue;
    const date = (raw.date ?? start).slice(0, 10);
    const hours = (x: unknown): number => Math.round((n(x) ?? 0) * 60);
    const total =
      n(raw.totalSleep) != null
        ? hours(raw.totalSleep)
        : n(raw.asleep) != null
          ? hours(raw.asleep)
          : n(raw.qty) != null
            ? hours(raw.qty)
            : 0;
    const deep = hours(raw.deep);
    const rem = hours(raw.rem);
    const light = hours(raw.light ?? raw.core);
    out.push({
      id: `sleep_a_${Buffer.from(String(start)).toString('base64url').slice(0, 24)}`,
      date,
      source: 'apple',
      startTime: String(start),
      endTime: String(end ?? start),
      isNap: false,
      totalMinutes: total || deep + rem + light,
      deepMinutes: deep,
      remMinutes: rem,
      lightMinutes: light,
      awakeMinutes: hours(raw.awake),
      sleepScore: null,
      avgHr: null,
      avgHrv: null,
      avgRespiratoryRate: null,
      spo2: null,
    });
  }
  return out;
}

function toHaeWorkout(w: HaeWorkout): Workout | null {
  const start = w.start;
  if (!start) return null;
  const name = (w.name ?? w.type ?? w.activityType ?? 'other').toString();
  const durMin = n(w.duration);
  const durationMinutes =
    durMin != null
      ? (w.durationUnit === 'sec' || w.durationUnit === 's' ? durMin / 60 : durMin)
      : w.end
        ? Math.max(0, (Date.parse(w.end) - Date.parse(start)) / 60_000)
        : 0;
  const distObj = typeof w.distance === 'object' ? w.distance : undefined;
  const distRaw = distObj ? n(distObj.qty) : n(w.distance ?? w.totalDistance);
  const distUnit = (distObj?.units ?? w.distanceUnit ?? '').toLowerCase();
  const distanceKm =
    distRaw != null ? (distUnit.includes('mi') ? distRaw * 1.609 : distRaw) : null;
  const energy =
    typeof w.activeEnergy === 'object'
      ? n(w.activeEnergy.qty)
      : n(w.activeEnergy ?? w.totalEnergy ?? w.energyBurned);
  return {
    id: `wo_a_${Buffer.from(start + name).toString('base64url').slice(0, 20)}`,
    date: start.slice(0, 10),
    source: 'apple',
    sport: normalizeHaeSport(name),
    startTime: start,
    endTime: w.end ?? start,
    durationMinutes,
    strain: null,
    avgHr: n(w.avgHeartRate),
    maxHr: n(w.maxHeartRate),
    calories: energy != null ? Math.round(energy) : null,
    distanceKm,
    zoneMinutes: { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 },
    notes: null,
  };
}

function normalizeHaeSport(s: string): string {
  // Accept either HK identifiers ("HKWorkoutActivityTypeRunning") or plain names.
  if (s.startsWith('HKWorkoutActivityType')) return HK_WORKOUT_MAP[s] ?? 'other';
  return s.toLowerCase().replace(/\s+/g, '_');
}
