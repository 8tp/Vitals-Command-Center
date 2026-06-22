import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { openDb, queries } from '@vcc/db';
import { normalizeAndUpsert } from '../apps/api/src/services/normalizer.js';

// Spins a throwaway on-disk SQLite DB (migrations applied) and folds per-device
// rows through the SAME normalizer production sync uses, then reads the
// consensus back out — the true integration test for the weighted-average +
// confidence machinery.

const dbs: { db: Database; path: string }[] = [];

function freshDb(): Database {
  const path = join(tmpdir(), `vitals-test-${randomUUID()}.db`);
  const db = openDb({ path, migrate: true });
  dbs.push({ db, path });
  return db;
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

const approx = (actual: number | null, expected: number, eps = 1e-6) => {
  assert.ok(actual !== null, 'expected a numeric consensus, got null');
  assert.ok(Math.abs((actual as number) - expected) < eps, `${actual} ≉ ${expected}`);
};

describe('normalizeAndUpsert consensus', () => {
  it('a single source yields MEDIUM confidence and mirrors its readings', () => {
    const db = freshDb();
    normalizeAndUpsert(db, {
      fitbit: [{ date: '2026-01-01', hrv: 50, rhr: 55, sleepHours: 7.5 }] as never,
    });
    const day = queries.dailySummary.get(db, '2026-01-01');
    assert.ok(day);
    assert.equal(day!.devices.active, 1);
    assert.equal(day!.devices.fitbit, true);
    assert.equal(day!.consensus.level, 'MEDIUM');
    approx(day!.consensus.hrv, 50);
    approx(day!.consensus.rhr, 55);
    approx(day!.consensus.sleepHours, 7.5);
  });

  it('two sources produce HIGH confidence and an accuracy-weighted mean', () => {
    const db = freshDb();
    normalizeAndUpsert(db, {
      fitbit: [{ date: '2026-02-01', hrv: 40, rhr: 50, sleepHours: 8 }] as never,
      oura: [{ date: '2026-02-01', hrv: 60, rhr: 60, sleepHours: 7 }] as never,
    });
    const day = queries.dailySummary.get(db, '2026-02-01');
    assert.ok(day);
    assert.equal(day!.devices.active, 2);
    assert.equal(day!.consensus.level, 'HIGH');
    // weights: fitbit 1.0, oura 0.7 → (v_fb*1.0 + v_oura*0.7) / 1.7
    approx(day!.consensus.hrv, (40 * 1.0 + 60 * 0.7) / 1.7);
    approx(day!.consensus.rhr, (50 * 1.0 + 60 * 0.7) / 1.7);
    approx(day!.consensus.sleepHours, (8 * 1.0 + 7 * 0.7) / 1.7);
  });

  it('treats a 0h sleep value as "no data" and excludes it from consensus', () => {
    const db = freshDb();
    normalizeAndUpsert(db, {
      fitbit: [{ date: '2026-03-01', hrv: 48, rhr: 52, sleepHours: 0 }] as never,
    });
    const day = queries.dailySummary.get(db, '2026-03-01');
    assert.ok(day);
    assert.equal(day!.consensus.sleepHours, null); // 0 dropped, not averaged in
    approx(day!.consensus.hrv, 48); // other metrics still resolve
  });

  it('a missing device is not an anomaly — partial coverage still resolves', () => {
    const db = freshDb();
    normalizeAndUpsert(db, {
      fitbit: [{ date: '2026-04-01', hrv: 55, rhr: 58, sleepHours: 6.5 }] as never,
      // oura/whoop/apple absent this day on purpose
    });
    const day = queries.dailySummary.get(db, '2026-04-01');
    assert.ok(day);
    assert.notEqual(day!.consensus.level, 'NONE');
    assert.equal(day!.devices.oura, false);
    assert.equal(day!.devices.active, 1);
  });
});
