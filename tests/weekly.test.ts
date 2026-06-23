import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { openDb } from '@vcc/db';
import { normalizeAndUpsert } from '../apps/api/src/services/normalizer.js';
import { computeWeeklySummary } from '../apps/api/src/services/weekly.js';

// Deterministic week-over-week digest: this week vs the prior 7 days.

const dbs: { db: Database; path: string }[] = [];

function freshDb(): Database {
  const path = join(tmpdir(), `vitals-weekly-${randomUUID()}.db`);
  const db = openDb({ path, migrate: true });
  dbs.push({ db, path });
  return db;
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

after(() => {
  for (const { db, path } of dbs) {
    db.close();
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        rmSync(path + suffix);
      } catch {
        /* best effort */
      }
    }
  }
});

describe('computeWeeklySummary', () => {
  const END = '2026-06-22';

  it('averages each metric and compares to the prior week', () => {
    const db = freshDb();
    // This week (END-6..END): hrv 60, rhr 50, sleep 8. Prior week: hrv 50, rhr 55, sleep 7.
    const fitbit: unknown[] = [];
    for (let i = 0; i <= 6; i++) fitbit.push({ date: addDays(END, -i), hrv: 60, rhr: 50, sleepHours: 8 });
    for (let i = 7; i <= 13; i++) fitbit.push({ date: addDays(END, -i), hrv: 50, rhr: 55, sleepHours: 7 });
    normalizeAndUpsert(db, { fitbit: fitbit as never });

    const summary = computeWeeklySummary(db, END);
    assert.equal(summary.daysWithData, 7);

    const hrv = summary.metrics.find((m) => m.key === 'hrv')!;
    assert.equal(hrv.avg, 60);
    assert.equal(hrv.prevAvg, 50);
    assert.equal(hrv.deltaPct, 20); // (60-50)/50
    assert.equal(hrv.direction, 'up');
    assert.equal(hrv.betterWhen, 'higher'); // up = improving

    const rhr = summary.metrics.find((m) => m.key === 'rhr')!;
    assert.equal(rhr.direction, 'down'); // 55 → 50
    assert.equal(rhr.betterWhen, 'lower'); // down = improving
  });

  it('reports null deltas and zero coverage on an empty week', () => {
    const db = freshDb();
    const summary = computeWeeklySummary(db, END);
    assert.equal(summary.daysWithData, 0);
    for (const m of summary.metrics) {
      assert.equal(m.avg, null);
      assert.equal(m.deltaPct, null);
      assert.equal(m.direction, 'flat');
    }
    assert.equal(summary.bestSleep, null);
  });

  it('picks the best and shortest sleep night of the week', () => {
    const db = freshDb();
    normalizeAndUpsert(db, {
      fitbit: [
        { date: addDays(END, -1), hrv: 55, rhr: 52, sleepHours: 8.5 },
        { date: addDays(END, -2), hrv: 55, rhr: 52, sleepHours: 5.2 },
        { date: addDays(END, -3), hrv: 55, rhr: 52, sleepHours: 7.1 },
      ] as never,
    });
    const summary = computeWeeklySummary(db, END);
    assert.equal(summary.bestSleep?.hours, 8.5);
    assert.equal(summary.bestSleep?.date, addDays(END, -1));
    assert.equal(summary.worstSleep?.hours, 5.2);
    assert.equal(summary.worstSleep?.date, addDays(END, -2));
  });
});
