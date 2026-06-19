#!/usr/bin/env -S tsx
/**
 * Generates 90 days of realistic multi-device demo data so the UI can be
 * developed before wiring real APIs. Deterministic seed → reviewable diffs.
 *
 * Run:
 *   npm run db:seed                     # default 90 days ending today
 *   tsx scripts/seed_demo_data.ts 60    # custom day count
 */
import { openDb, queries } from '@vcc/db';
import { randomUUID } from 'node:crypto';
import { normalizeAndUpsert } from '../apps/api/src/services/normalizer.js';

type Rng = () => number;

function seeded(seed = 42): Rng {
  let s = seed >>> 0;
  return () => {
    // xorshift32 — deterministic across runs.
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 0xffffffff);
  };
}

function addDays(dateIso: string, n: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function gauss(rng: Rng, mu: number, sigma: number): number {
  // Box-Muller
  const u = Math.max(1e-9, rng());
  const v = rng();
  return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Device availability model
function deviceOn(date: string, device: 'whoop' | 'oura' | 'apple', rng: Rng): boolean {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  // Apple Watch off on Sundays (dress-watch days) 70% of the time
  if (device === 'apple' && dow === 0 && rng() < 0.7) return false;
  // WHOOP charging once every ~10 days
  if (device === 'whoop' && rng() < 0.07) return false;
  // Oura rarely off (ring fits in charger while showering)
  if (device === 'oura' && rng() < 0.03) return false;
  return true;
}

function main() {
  const daysArg = Number(process.argv[2]);
  const days = Number.isFinite(daysArg) ? daysArg : 90;
  const rng = seeded(20260414);

  const db = openDb();
  console.log(`[seed] generating ${days} days into ${process.env.DB_PATH ?? './data/vitals.db'}`);

  const start = addDays(todayIso(), -(days - 1));
  const whoopRows: Array<Record<string, unknown>> = [];
  const ouraRows: Array<Record<string, unknown>> = [];
  const appleRows: Array<Record<string, unknown>> = [];

  // Baseline drift — HRV trending up slightly, RHR slightly down (fitness improving)
  let baselineHrv = 58;
  let baselineRhr = 52;

  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    baselineHrv += gauss(rng, 0.02, 0.15);
    baselineRhr += gauss(rng, -0.01, 0.1);

    const whoopOn = deviceOn(date, 'whoop', rng);
    const ouraOn = deviceOn(date, 'oura', rng);
    const appleOn = deviceOn(date, 'apple', rng);

    if (whoopOn) {
      const hrv = clamp(gauss(rng, baselineHrv, 6), 25, 120);
      const rhr = clamp(gauss(rng, baselineRhr, 3), 38, 80);
      const recovery = clamp(Math.round(gauss(rng, 62, 18)), 5, 99);
      const strain = clamp(gauss(rng, 11, 4), 0, 21);
      const sleepHours = clamp(gauss(rng, 7.1, 0.9), 3.5, 10);
      const deep = clamp(gauss(rng, 1.6, 0.3), 0.3, 2.6);
      const rem = clamp(gauss(rng, 1.8, 0.4), 0.4, 3);
      const light = clamp(sleepHours - deep - rem, 0, sleepHours);
      whoopRows.push({
        date,
        recoveryScore: recovery,
        hrv,
        rhr,
        strain,
        calories: Math.round(2800 + (strain / 21) * 800 + gauss(rng, 0, 80)),
        spo2: clamp(gauss(rng, 97, 1), 88, 100),
        skinTempDelta: gauss(rng, 0, 0.18),
        sleepScore: clamp(Math.round(gauss(rng, 82, 9)), 30, 100),
        sleepHours,
        deepHours: deep,
        remHours: rem,
        lightHours: light,
      });

      // Workouts on 4-5 days/week
      if (rng() < 0.6) {
        const sport = rng() < 0.55 ? 'running' : rng() < 0.85 ? 'lifting' : 'cycling';
        const duration = clamp(gauss(rng, sport === 'lifting' ? 55 : 35, 10), 15, 120);
        const avgHr = clamp(Math.round(gauss(rng, sport === 'running' ? 158 : 140, 10)), 90, 185);
        queries.workouts.upsert(db, {
          id: `wo_${date}_${randomUUID().slice(0, 8)}`,
          date,
          source: 'whoop',
          sport,
          startTime: `${date}T17:30:00Z`,
          endTime: `${date}T${String(17 + Math.floor(duration / 60)).padStart(2, '0')}:${String(Math.floor(duration % 60)).padStart(2, '0')}:00Z`,
          durationMinutes: duration,
          strain: clamp(strain + gauss(rng, 1, 1.5), 0, 21),
          avgHr,
          maxHr: Math.min(195, avgHr + Math.round(gauss(rng, 18, 6))),
          calories: Math.round(duration * 9 + gauss(rng, 0, 40)),
          distanceKm: sport === 'running' ? clamp(duration * 0.14, 1, 20) : null,
          zoneMinutes: {
            z1: Math.round(duration * 0.1),
            z2: Math.round(duration * 0.25),
            z3: Math.round(duration * 0.3),
            z4: Math.round(duration * 0.25),
            z5: Math.round(duration * 0.1),
          },
          notes: null,
        });
      }

      queries.sleep.upsert(db, {
        id: `sleep_w_${date}`,
        date,
        source: 'whoop',
        startTime: `${addDays(date, -1)}T23:05:00Z`,
        endTime: `${date}T06:15:00Z`,
        isNap: false,
        totalMinutes: Math.round(sleepHours * 60),
        deepMinutes: Math.round(deep * 60),
        remMinutes: Math.round(rem * 60),
        lightMinutes: Math.round(light * 60),
        awakeMinutes: Math.round(gauss(rng, 14, 6)),
        sleepScore: Math.round(gauss(rng, 82, 9)),
        avgHr: Math.round(gauss(rng, 55, 4)),
        avgHrv: hrv,
        avgRespiratoryRate: gauss(rng, 14, 1.2),
        spo2: clamp(gauss(rng, 97, 1), 88, 100),
      });
    }

    if (ouraOn) {
      const hrv = clamp(gauss(rng, baselineHrv + 3, 5), 28, 125);
      const rhr = clamp(gauss(rng, baselineRhr, 3), 38, 80);
      const sleepHours = clamp(gauss(rng, 7.0, 0.9), 3.5, 10);
      const deep = clamp(gauss(rng, 1.55, 0.28), 0.3, 2.6);
      const rem = clamp(gauss(rng, 1.75, 0.4), 0.4, 3);
      const light = clamp(sleepHours - deep - rem, 0, sleepHours);
      ouraRows.push({
        date,
        readinessScore: clamp(Math.round(gauss(rng, 74, 10)), 20, 99),
        sleepScore: clamp(Math.round(gauss(rng, 82, 8)), 30, 100),
        activityScore: clamp(Math.round(gauss(rng, 80, 7)), 30, 100),
        hrv,
        rhr,
        tempDeviation: gauss(rng, 0, 0.22),
        spo2: clamp(gauss(rng, 97, 0.9), 88, 100),
        respiratoryRate: gauss(rng, 14.2, 1),
        sleepHours,
        deepHours: deep,
        remHours: rem,
        lightHours: light,
        steps: Math.max(0, Math.round(gauss(rng, 8500, 2200))),
        activeCalories: Math.max(0, Math.round(gauss(rng, 520, 170))),
        totalCalories: Math.max(0, Math.round(gauss(rng, 2600, 250))),
        stressHighMinutes: Math.max(0, Math.round(gauss(rng, 25, 20))),
      });

      queries.sleep.upsert(db, {
        id: `sleep_o_${date}`,
        date,
        source: 'oura',
        startTime: `${addDays(date, -1)}T23:00:00Z`,
        endTime: `${date}T06:10:00Z`,
        isNap: false,
        totalMinutes: Math.round(sleepHours * 60),
        deepMinutes: Math.round(deep * 60),
        remMinutes: Math.round(rem * 60),
        lightMinutes: Math.round(light * 60),
        awakeMinutes: Math.round(gauss(rng, 18, 7)),
        sleepScore: Math.round(gauss(rng, 82, 8)),
        avgHr: Math.round(gauss(rng, 54, 4)),
        avgHrv: hrv,
        avgRespiratoryRate: gauss(rng, 14.2, 1),
        spo2: clamp(gauss(rng, 97, 0.9), 88, 100),
      });
    }

    if (appleOn) {
      appleRows.push({
        date,
        hrv: clamp(gauss(rng, baselineHrv - 2, 7), 25, 120),
        rhr: clamp(gauss(rng, baselineRhr + 1, 4), 38, 82),
        spo2: clamp(gauss(rng, 97, 1), 88, 100),
        vo2max: clamp(gauss(rng, 48 + i * 0.01, 1.2), 25, 80),
        respiratoryRate: gauss(rng, 15, 1.4),
        steps: Math.max(0, Math.round(gauss(rng, 9600, 2500))),
        activeCalories: Math.max(0, Math.round(gauss(rng, 560, 180))),
        basalCalories: Math.max(0, Math.round(gauss(rng, 1880, 60))),
        distanceKm: clamp(gauss(rng, 7.2, 2.5), 0, 30),
        exerciseMinutes: Math.max(0, Math.round(gauss(rng, 42, 14))),
        standHours: Math.min(14, Math.max(4, Math.round(gauss(rng, 11, 1.2)))),
      });
    }
  }

  // Use same normalizer the production sync does, so consensus metrics + confidence
  // scores go through identical code paths.
  const result = normalizeAndUpsert(db, {
    whoop: whoopRows as never,
    oura: ouraRows as never,
    apple: appleRows as never,
  });

  // Seed some habit logs so streaks render.
  const habits = queries.habits.list(db);
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    for (const h of habits.filter((x) => x.category !== 'custom')) {
      if (rng() > 0.6) continue; // miss a few days for realism
      const value =
        h.type === 'boolean'
          ? rng() > 0.4
            ? 'true'
            : 'false'
          : h.type === 'scale_1_5'
            ? String(Math.max(1, Math.min(5, Math.round(gauss(rng, 3.5, 0.8)))))
            : h.type === 'time'
              ? `${String(Math.floor(gauss(rng, 22, 1))).padStart(2, '0')}:${String(Math.floor(rng() * 60)).padStart(2, '0')}`
              : 'seed';
      queries.habits.logEntry(db, h.id, date, value);
    }
  }

  console.log(`[seed] normalizer upserted ${result.upserted} daily rows`);
  console.log('[seed] complete');
  db.close();
}

main();
