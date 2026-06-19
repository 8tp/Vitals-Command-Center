import type { FastifyPluginAsync } from 'fastify';
import { queries } from '@vcc/db';
import { ok, fail } from '../lib/envelope.js';
import { normalizeAndUpsert } from '../services/normalizer.js';
import {
  parseHealthAutoExport,
  type HealthAutoExportPayload,
} from '../services/apple-health.js';

/**
 * Apple Health native bridge — REST ingest of the iOS "Health Auto Export" app.
 *
 * POST /api/ingest/apple
 *   Header: x-apple-ingest-secret: <APPLE_INGEST_SECRET>
 *   Body:   { data: { metrics: [...], workouts: [...] } }  (Health Auto Export)
 *
 * Maps the key metrics to apple_* daily rows, sleep_sessions (source 'apple')
 * and workouts (source 'apple'), then upserts via the normalizer + queries.
 *
 * Security: requires APPLE_INGEST_SECRET to be set AND to match the header.
 * If the env is unset, the route rejects every request (fail closed).
 */
export const registerIngestRoutes: FastifyPluginAsync = async (app) => {
  app.post('/ingest/apple', async (req, reply) => {
    const secret = process.env.APPLE_INGEST_SECRET;
    const provided =
      (req.headers['x-apple-ingest-secret'] as string | undefined) ??
      (req.headers['authorization'] as string | undefined)?.replace(/^Bearer\s+/i, '');

    if (!secret || provided !== secret) {
      return reply.status(401).send(fail('unauthorized', 'UNAUTHORIZED'));
    }

    const payload = (req.body ?? {}) as HealthAutoExportPayload;
    if (!payload || typeof payload !== 'object' || !payload.data) {
      return reply.status(400).send(fail('expected { data: { metrics, workouts } }', 'VALIDATION'));
    }

    const db = req.server.db;
    const log = req.server.log.child({ module: 'ingest-apple' });

    let parsed;
    try {
      parsed = parseHealthAutoExport(payload);
    } catch (err) {
      log.error({ err }, 'apple ingest parse failed');
      return reply.status(400).send(fail((err as Error).message, 'PARSE_ERROR'));
    }

    const daily = normalizeAndUpsert(db, { apple: parsed.daily });

    let sleepUpserted = 0;
    let workoutUpserted = 0;
    db.transaction(() => {
      for (const s of parsed.sleepSessions) {
        ensureDailyStub(db, s.date);
        queries.sleep.upsert(db, s);
        sleepUpserted += 1;
      }
      for (const w of parsed.workouts) {
        ensureDailyStub(db, w.date);
        queries.workouts.upsert(db, w);
        workoutUpserted += 1;
      }
    })();

    log.info(
      {
        days: daily.upserted,
        sleep: sleepUpserted,
        workouts: workoutUpserted,
        metrics: payload.data.metrics?.length ?? 0,
      },
      'apple ingest complete',
    );

    return ok({
      dailyUpserted: daily.upserted,
      sleepUpserted,
      workoutUpserted,
      dates: daily.dates,
    });
  });
};

function ensureDailyStub(db: import('better-sqlite3').Database, date: string): void {
  db.prepare(`INSERT OR IGNORE INTO daily_summary (date, devices_active) VALUES (?, 0)`).run(date);
}
