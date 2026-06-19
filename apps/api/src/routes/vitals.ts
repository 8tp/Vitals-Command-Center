import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { queries } from '@vcc/db';
import { DEVICE_SOURCES, type DeviceSource } from '@vcc/shared';
import { parseRange } from '../lib/range.js';
import { ok } from '../lib/envelope.js';

const vitalsQ = z.object({
  metric: z.enum([
    'hrv',
    'rhr',
    'sleep_hours',
    'recovery',
    'strain',
    'steps',
    'readiness',
    'temp_deviation',
    'spo2',
    'vo2max',
  ]),
  range: z.string().optional(),
});

// Map logical metric -> per-device column name.
const COLUMN_MAP: Record<string, Partial<Record<DeviceSource, string>>> = {
  hrv: { whoop: 'whoop_hrv', oura: 'oura_hrv', apple: 'apple_hrv' },
  rhr: { whoop: 'whoop_rhr', oura: 'oura_rhr', apple: 'apple_rhr' },
  sleep_hours: { whoop: 'whoop_sleep_hours', oura: 'oura_sleep_hours' },
  recovery: { whoop: 'whoop_recovery_score' },
  readiness: { oura: 'oura_readiness_score' },
  strain: { whoop: 'whoop_strain' },
  steps: { oura: 'oura_steps', apple: 'apple_steps' },
  temp_deviation: { oura: 'oura_temp_deviation', whoop: 'whoop_skin_temp_delta' },
  spo2: { whoop: 'whoop_spo2', oura: 'oura_spo2', apple: 'apple_spo2' },
  vo2max: { apple: 'apple_vo2max' },
};

const CONSENSUS_MAP: Partial<Record<string, string>> = {
  hrv: 'consensus_hrv',
  rhr: 'consensus_rhr',
  sleep_hours: 'consensus_sleep_hours',
};

export const registerVitalsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/vitals', { schema: { querystring: vitalsQ } }, async (req) => {
    const { metric, range } = req.query as z.infer<typeof vitalsQ>;
    const r = parseRange(range, 30);
    const cols = COLUMN_MAP[metric];
    const consensusCol = CONSENSUS_MAP[metric];
    if (!cols) return ok({ range: r, metric, points: [], movingAverage7d: [] });

    const selectCols = [
      'date',
      ...Object.values(cols),
      ...(consensusCol ? [consensusCol] : []),
    ].join(', ');

    const rows = req.server.db
      .prepare(`SELECT ${selectCols} FROM daily_summary WHERE date BETWEEN ? AND ? ORDER BY date ASC`)
      .all(r.start, r.end) as Array<Record<string, number | string | null>>;

    const points: Array<{ date: string; value: number | null; source: DeviceSource | 'consensus' }> = [];
    for (const row of rows) {
      for (const device of DEVICE_SOURCES) {
        const col = cols[device];
        if (!col) continue;
        const v = row[col];
        if (v != null && typeof v === 'number') {
          points.push({ date: row.date as string, value: v, source: device });
        }
      }
      if (consensusCol) {
        const v = row[consensusCol];
        points.push({
          date: row.date as string,
          value: typeof v === 'number' ? v : null,
          source: 'consensus',
        });
      }
    }

    const movingAverage7d = computeMovingAverage(rows, consensusCol ?? Object.values(cols)[0] ?? 'date', 7);
    const delta = computeDelta(movingAverage7d);

    return ok({ metric, range: r, points, movingAverage7d, delta });
  });
};

function computeMovingAverage(
  rows: Array<Record<string, unknown>>,
  col: string,
  window: number,
): Array<{ date: string; value: number | null }> {
  const out: Array<{ date: string; value: number | null }> = [];
  for (let i = 0; i < rows.length; i++) {
    const slice = rows.slice(Math.max(0, i - window + 1), i + 1);
    const nums = slice.map((r) => r[col]).filter((v): v is number => typeof v === 'number');
    const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    out.push({ date: rows[i]?.date as string, value: avg });
  }
  return out;
}

function computeDelta(series: Array<{ date: string; value: number | null }>) {
  const vals = series.map((p) => p.value).filter((v): v is number => v != null);
  if (vals.length < 2) return { pct: null, direction: 'flat' as const };
  const first = vals[0]!;
  const last = vals[vals.length - 1]!;
  const pct = first === 0 ? null : ((last - first) / Math.abs(first)) * 100;
  const direction = pct == null ? 'flat' : pct > 1 ? 'up' : pct < -1 ? 'down' : 'flat';
  return { pct, direction };
}
