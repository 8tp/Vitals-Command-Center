import { request } from 'undici';
import type { FastifyBaseLogger } from 'fastify';
import type { SleepSession, Workout } from '@vcc/shared';

/**
 * Oura Cloud API v2 client (cloud.ouraring.com).
 * Auth: Personal Access Token (Bearer).
 * Rate limit: 5000 requests/day/PAT.
 *
 * Endpoints consumed:
 *   /v2/usercollection/daily_readiness
 *   /v2/usercollection/daily_sleep
 *   /v2/usercollection/daily_activity
 *   /v2/usercollection/sleep                  (per-session detail)
 *   /v2/usercollection/workout                (per-workout detail)
 *   /v2/usercollection/daily_spo2
 *   /v2/usercollection/daily_stress
 */

const BASE = 'https://api.ouraring.com/v2/usercollection';

export interface OuraDailyRow {
  date: string;
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

export interface OuraFetchResult {
  daily: OuraDailyRow[];
  sleepSessions: SleepSession[];
  workouts: Workout[];
}

// Raw payload types (partial).
interface OuraReadinessResp {
  data: Array<{ day: string; score: number | null; temperature_deviation: number | null }>;
}
interface OuraSleepScoreResp {
  data: Array<{ day: string; score: number | null }>;
}
interface OuraSleepResp {
  data: Array<{
    id: string;
    day: string;
    type: string; // long_sleep | late_nap | rest | ...
    bedtime_start: string;
    bedtime_end: string;
    total_sleep_duration?: number;      // seconds
    rem_sleep_duration?: number;
    deep_sleep_duration?: number;
    light_sleep_duration?: number;
    awake_time?: number;                // seconds
    average_heart_rate?: number;
    average_hrv?: number;
    average_breath?: number;
    lowest_heart_rate?: number;
  }>;
}
interface OuraActivityResp {
  data: Array<{
    day: string;
    score: number | null;
    steps: number | null;
    active_calories: number | null;
    total_calories: number | null;
  }>;
}
interface OuraSpo2Resp {
  data: Array<{ day: string; spo2_percentage: { average: number } | null }>;
}
interface OuraStressResp {
  data: Array<{ day: string; stress_high: number | null }>;
}
interface OuraWorkoutResp {
  data: Array<{
    id: string;
    day: string;
    activity: string;
    intensity: string;
    label: string | null;
    start_datetime: string;
    end_datetime: string;
    calories: number | null;
    distance: number | null; // meters
    source: string;
  }>;
}

export class OuraClient {
  constructor(
    private readonly pat = process.env.OURA_PAT ?? '',
    private readonly log?: FastifyBaseLogger,
  ) {}

  private async fetchJson<T>(path: string, params: Record<string, string>): Promise<T> {
    const q = new URLSearchParams(params);
    const res = await request(`${BASE}/${path}?${q.toString()}`, {
      headers: { authorization: `Bearer ${this.pat}` },
    });
    if (res.statusCode === 429) {
      this.log?.warn('oura rate limited, backing off 60s');
      await new Promise((r) => setTimeout(r, 60_000));
      return this.fetchJson<T>(path, params);
    }
    if (res.statusCode !== 200) {
      const text = await res.body.text();
      throw new Error(`Oura ${path} → ${res.statusCode}: ${text}`);
    }
    return (await res.body.json()) as T;
  }

  async fetchDaysInRange(start: string, end: string): Promise<OuraFetchResult> {
    const params = { start_date: start, end_date: end };
    const [readiness, sleepScore, activity, sleepDetail, spo2, stress, workoutResp] = await Promise.all([
      this.fetchJson<OuraReadinessResp>('daily_readiness', params),
      this.fetchJson<OuraSleepScoreResp>('daily_sleep', params),
      this.fetchJson<OuraActivityResp>('daily_activity', params),
      this.fetchJson<OuraSleepResp>('sleep', params),
      this.fetchJson<OuraSpo2Resp>('daily_spo2', params),
      this.fetchJson<OuraStressResp>('daily_stress', params),
      this.fetchJson<OuraWorkoutResp>('workout', params),
    ]);

    this.log?.info(
      {
        readiness: readiness.data.length,
        sleepScore: sleepScore.data.length,
        activity: activity.data.length,
        sleep: sleepDetail.data.length,
        spo2: spo2.data.length,
        stress: stress.data.length,
        workouts: workoutResp.data.length,
      },
      'oura fetched',
    );

    // --- Daily aggregation ------------------------------------------------
    const byDate = new Map<string, OuraDailyRow>();
    const getOrInit = (day: string): OuraDailyRow => {
      let row = byDate.get(day);
      if (!row) {
        row = {
          date: day,
          readinessScore: null,
          sleepScore: null,
          activityScore: null,
          hrv: null,
          rhr: null,
          tempDeviation: null,
          spo2: null,
          respiratoryRate: null,
          sleepHours: null,
          deepHours: null,
          remHours: null,
          lightHours: null,
          steps: null,
          activeCalories: null,
          totalCalories: null,
          stressHighMinutes: null,
        };
        byDate.set(day, row);
      }
      return row;
    };

    for (const r of readiness.data) {
      const row = getOrInit(r.day);
      row.readinessScore = r.score;
      row.tempDeviation = r.temperature_deviation;
    }
    for (const r of sleepScore.data) getOrInit(r.day).sleepScore = r.score;
    for (const r of activity.data) {
      const row = getOrInit(r.day);
      row.activityScore = r.score;
      row.steps = r.steps;
      row.activeCalories = r.active_calories;
      row.totalCalories = r.total_calories;
    }
    for (const s of sleepDetail.data) {
      if (s.type !== 'long_sleep') continue; // main nocturnal sleep only
      const row = getOrInit(s.day);
      row.hrv = s.average_hrv ?? row.hrv;
      row.rhr = s.lowest_heart_rate ?? row.rhr;
      row.respiratoryRate = s.average_breath ?? row.respiratoryRate;
      row.sleepHours = s.total_sleep_duration ? s.total_sleep_duration / 3600 : row.sleepHours;
      row.deepHours = s.deep_sleep_duration ? s.deep_sleep_duration / 3600 : row.deepHours;
      row.remHours = s.rem_sleep_duration ? s.rem_sleep_duration / 3600 : row.remHours;
      row.lightHours = s.light_sleep_duration ? s.light_sleep_duration / 3600 : row.lightHours;
    }
    for (const r of spo2.data) getOrInit(r.day).spo2 = r.spo2_percentage?.average ?? null;
    for (const r of stress.data) getOrInit(r.day).stressHighMinutes = r.stress_high;

    // --- Per-session sleep ------------------------------------------------
    const sleepSessions: SleepSession[] = sleepDetail.data.map((s) => ({
      id: `sleep_o_${s.id}`,
      date: s.day,
      source: 'oura',
      startTime: s.bedtime_start,
      endTime: s.bedtime_end,
      isNap: s.type !== 'long_sleep',
      totalMinutes: Math.round((s.total_sleep_duration ?? 0) / 60),
      deepMinutes: Math.round((s.deep_sleep_duration ?? 0) / 60),
      remMinutes: Math.round((s.rem_sleep_duration ?? 0) / 60),
      lightMinutes: Math.round((s.light_sleep_duration ?? 0) / 60),
      awakeMinutes: Math.round((s.awake_time ?? 0) / 60),
      sleepScore: null, // score lives on daily_sleep, not per-session on Oura
      avgHr: s.average_heart_rate ?? null,
      avgHrv: s.average_hrv ?? null,
      avgRespiratoryRate: s.average_breath ?? null,
      spo2: null,
    }));

    // --- Workouts ---------------------------------------------------------
    const workouts: Workout[] = workoutResp.data.map((w) => {
      const durationMs = new Date(w.end_datetime).getTime() - new Date(w.start_datetime).getTime();
      return {
        id: `wo_o_${w.id}`,
        date: w.day,
        source: 'oura',
        sport: normalizeOuraSport(w.activity),
        startTime: w.start_datetime,
        endTime: w.end_datetime,
        durationMinutes: Math.max(0, durationMs / 60_000),
        strain: null, // Oura doesn't compute strain
        avgHr: null,
        maxHr: null,
        calories: w.calories,
        distanceKm: w.distance != null ? w.distance / 1000 : null,
        zoneMinutes: { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 }, // Oura doesn't expose HR zones here
        notes: w.label,
      };
    });

    return {
      daily: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
      sleepSessions,
      workouts,
    };
  }
}

// Keep a consistent sport slug across WHOOP + Oura + Apple Health.
function normalizeOuraSport(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '_');
}
