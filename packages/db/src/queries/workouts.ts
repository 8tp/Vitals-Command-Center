import type { Database } from 'better-sqlite3';
import type { DeviceSource, Workout } from '@vcc/shared';

interface WorkoutRow {
  id: string;
  date: string;
  source: DeviceSource;
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
