import type { Database } from 'better-sqlite3';
import type { DeviceSource, SleepSession } from '@vcc/shared';

interface SleepRow {
  id: string;
  date: string;
  source: DeviceSource;
  start_time: string | null;
  end_time: string | null;
  is_nap: number;
  total_minutes: number | null;
  deep_minutes: number | null;
  rem_minutes: number | null;
  light_minutes: number | null;
  awake_minutes: number | null;
  sleep_score: number | null;
  avg_hr: number | null;
  avg_hrv: number | null;
  avg_respiratory_rate: number | null;
  spo2: number | null;
}

function toSession(r: SleepRow): SleepSession {
  return {
    id: r.id,
    date: r.date,
    source: r.source,
    startTime: r.start_time ?? '',
    endTime: r.end_time ?? '',
    isNap: !!r.is_nap,
    totalMinutes: r.total_minutes ?? 0,
    deepMinutes: r.deep_minutes ?? 0,
    remMinutes: r.rem_minutes ?? 0,
    lightMinutes: r.light_minutes ?? 0,
    awakeMinutes: r.awake_minutes ?? 0,
    sleepScore: r.sleep_score,
    avgHr: r.avg_hr,
    avgHrv: r.avg_hrv,
    avgRespiratoryRate: r.avg_respiratory_rate,
    spo2: r.spo2,
  };
}

export function list(db: Database, start: string, end: string): SleepSession[] {
  const rows = db
    .prepare('SELECT * FROM sleep_sessions WHERE date BETWEEN ? AND ? ORDER BY start_time ASC')
    .all(start, end) as SleepRow[];
  return rows.map(toSession);
}

export function forDate(db: Database, date: string): SleepSession[] {
  const rows = db
    .prepare('SELECT * FROM sleep_sessions WHERE date = ? ORDER BY start_time ASC')
    .all(date) as SleepRow[];
  return rows.map(toSession);
}

export function upsert(db: Database, s: SleepSession): void {
  db.prepare(
    `INSERT INTO sleep_sessions (id, date, source, start_time, end_time, is_nap, total_minutes, deep_minutes, rem_minutes, light_minutes, awake_minutes, sleep_score, avg_hr, avg_hrv, avg_respiratory_rate, spo2)
     VALUES (@id, @date, @source, @startTime, @endTime, @isNap, @totalMinutes, @deepMinutes, @remMinutes, @lightMinutes, @awakeMinutes, @sleepScore, @avgHr, @avgHrv, @avgRespiratoryRate, @spo2)
     ON CONFLICT(id) DO UPDATE SET
       date=excluded.date, source=excluded.source, start_time=excluded.start_time, end_time=excluded.end_time,
       is_nap=excluded.is_nap, total_minutes=excluded.total_minutes, deep_minutes=excluded.deep_minutes,
       rem_minutes=excluded.rem_minutes, light_minutes=excluded.light_minutes, awake_minutes=excluded.awake_minutes,
       sleep_score=excluded.sleep_score, avg_hr=excluded.avg_hr, avg_hrv=excluded.avg_hrv,
       avg_respiratory_rate=excluded.avg_respiratory_rate, spo2=excluded.spo2`,
  ).run({
    ...s,
    isNap: s.isNap ? 1 : 0,
  });
}
