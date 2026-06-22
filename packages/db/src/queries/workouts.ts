import type { Database } from 'better-sqlite3';
import type { Workout, WorkoutSource, WorkoutDetail } from '@vcc/shared';

interface WorkoutRow {
  id: string;
  date: string;
  source: WorkoutSource;
  sport: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  strain: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  calories: number | null;
  distance_km: number | null;
  zone_1_minutes: number | null;
  zone_2_minutes: number | null;
  zone_3_minutes: number | null;
  zone_4_minutes: number | null;
  zone_5_minutes: number | null;
  notes: string | null;
}

function toWorkout(r: WorkoutRow): Workout {
  return {
    id: r.id,
    date: r.date,
    source: r.source,
    sport: r.sport ?? 'unknown',
    startTime: r.start_time ?? '',
    endTime: r.end_time ?? '',
    durationMinutes: r.duration_minutes ?? 0,
    strain: r.strain,
    avgHr: r.avg_hr,
    maxHr: r.max_hr,
    calories: r.calories,
    distanceKm: r.distance_km,
    zoneMinutes: {
      z1: r.zone_1_minutes ?? 0,
      z2: r.zone_2_minutes ?? 0,
      z3: r.zone_3_minutes ?? 0,
      z4: r.zone_4_minutes ?? 0,
      z5: r.zone_5_minutes ?? 0,
    },
    notes: r.notes,
  };
}

export function list(db: Database, start: string, end: string): Workout[] {
  const rows = db
    .prepare('SELECT * FROM workouts WHERE date BETWEEN ? AND ? ORDER BY start_time DESC')
    .all(start, end) as WorkoutRow[];
  return rows.map(toWorkout);
}

export function upsert(db: Database, w: Workout): void {
  db.prepare(
    `INSERT INTO workouts (id, date, source, sport, start_time, end_time, duration_minutes, strain, avg_hr, max_hr, calories, distance_km, zone_1_minutes, zone_2_minutes, zone_3_minutes, zone_4_minutes, zone_5_minutes, notes)
     VALUES (@id, @date, @source, @sport, @startTime, @endTime, @durationMinutes, @strain, @avgHr, @maxHr, @calories, @distanceKm, @z1, @z2, @z3, @z4, @z5, @notes)
     ON CONFLICT(id) DO UPDATE SET
       date=excluded.date, source=excluded.source, sport=excluded.sport, start_time=excluded.start_time, end_time=excluded.end_time,
       duration_minutes=excluded.duration_minutes, strain=excluded.strain, avg_hr=excluded.avg_hr, max_hr=excluded.max_hr,
       calories=excluded.calories, distance_km=excluded.distance_km,
       zone_1_minutes=excluded.zone_1_minutes, zone_2_minutes=excluded.zone_2_minutes, zone_3_minutes=excluded.zone_3_minutes,
       zone_4_minutes=excluded.zone_4_minutes, zone_5_minutes=excluded.zone_5_minutes, notes=excluded.notes`,
  ).run({
    id: w.id,
    date: w.date,
    source: w.source,
    sport: w.sport,
    startTime: w.startTime,
    endTime: w.endTime,
    durationMinutes: w.durationMinutes,
    strain: w.strain,
    avgHr: w.avgHr,
    maxHr: w.maxHr,
    calories: w.calories,
    distanceKm: w.distanceKm,
    z1: w.zoneMinutes.z1,
    z2: w.zoneMinutes.z2,
    z3: w.zoneMinutes.z3,
    z4: w.zoneMinutes.z4,
    z5: w.zoneMinutes.z5,
    notes: w.notes,
  });
}

/** Persist rich detail (JSON) for an already-upserted workout. */
export function upsertDetail(db: Database, id: string, detail: WorkoutDetail): void {
  db.prepare('UPDATE workouts SET detail_json = ? WHERE id = ?').run(JSON.stringify(detail), id);
}

/** Optionally refresh calories when the detail endpoint supplies a value the
 * summary list omits (Strava: calories live only on the detail endpoint). */
export function setCalories(db: Database, id: string, calories: number): void {
  db.prepare('UPDATE workouts SET calories = ? WHERE id = ?').run(calories, id);
}

/** A workout row plus its parsed detail (null until fetched). */
export function getWithDetail(
  db: Database,
  id: string,
): { workout: Workout; detail: WorkoutDetail | null } | null {
  const row = db.prepare('SELECT * FROM workouts WHERE id = ?').get(id) as
    | (WorkoutRow & { detail_json: string | null })
    | undefined;
  if (!row) return null;
  let detail: WorkoutDetail | null = null;
  if (row.detail_json) {
    try {
      detail = JSON.parse(row.detail_json) as WorkoutDetail;
    } catch {
      detail = null;
    }
  }
  return { workout: toWorkout(row), detail };
}

/** IDs of workouts in [start,end] from `source` that have no detail yet. */
export function listMissingDetail(
  db: Database,
  source: WorkoutSource,
  start: string,
  end: string,
): string[] {
  const rows = db
    .prepare(
      'SELECT id FROM workouts WHERE source = ? AND date BETWEEN ? AND ? AND detail_json IS NULL',
    )
    .all(source, start, end) as { id: string }[];
  return rows.map((r) => r.id);
}
