import type { Database } from 'better-sqlite3';
import type { NormalizedDailySummary, InsightItem } from '@vcc/shared';
import { ALERT_THRESHOLDS } from '@vcc/shared';

/**
 * Rule-based insights (fast, deterministic, no LLM). These sit alongside the
 * narrative briefing from Claude — always-on, cheap, consistent.
 */
export function buildInsightsForDate(db: Database, today: NormalizedDailySummary): InsightItem[] {
  const out: InsightItem[] = [];

  // HRV drop vs 7-day avg
  const consensusHrv = today.consensus.hrv;
  if (consensusHrv != null) {
    const avg = baselineAvg(db, 'consensus_hrv', today.date, 7);
    if (avg && consensusHrv < avg * (1 - ALERT_THRESHOLDS.hrvDropPctFrom7dAvg / 100)) {
      out.push({
        id: 'hrv-drop',
        severity: 'amber',
        title: `HRV down ${((1 - consensusHrv / avg) * 100).toFixed(0)}% vs 7d avg`,
        body: 'Possible overtraining or early illness. Prioritize recovery today.',
        sources: ['consensus_hrv'],
      });
    }
  }

  // RHR elevation vs 14-day baseline
  const consensusRhr = today.consensus.rhr;
  if (consensusRhr != null) {
    const avg = baselineAvg(db, 'consensus_rhr', today.date, 14);
    if (avg && consensusRhr - avg >= ALERT_THRESHOLDS.rhrElevationBpmFrom14dBaseline) {
      out.push({
        id: 'rhr-high',
        severity: 'amber',
        title: `RHR ${Math.round(consensusRhr - avg)} bpm above 14d baseline`,
        body: 'Body under stress. Hydrate, cut caffeine, consider deload.',
        sources: ['consensus_rhr'],
      });
    }
  }

  // Temperature deviation (Oura only)
  if (today.oura?.tempDeviation != null && today.oura.tempDeviation >= ALERT_THRESHOLDS.tempDeviationCAboveBaseline) {
    out.push({
      id: 'temp-elevated',
      severity: 'red',
      title: `Temp +${today.oura.tempDeviation.toFixed(2)}°C from baseline`,
      body: 'Early illness signal. Monitor symptoms; back off intensity.',
      sources: ['oura_temp_deviation'],
    });
  }

  // SpO2 low
  const spo2 = today.whoop?.spo2 ?? today.oura?.spo2 ?? today.apple?.spo2 ?? null;
  if (spo2 != null && spo2 < ALERT_THRESHOLDS.spo2LowerBound) {
    out.push({
      id: 'spo2-low',
      severity: 'red',
      title: `SpO₂ ${spo2.toFixed(1)}%`,
      body: 'Below 95% threshold — flag for attention, consider context (altitude, congestion).',
      sources: ['spo2'],
    });
  }

  // Deep sleep low
  const deep = today.whoop?.deepHours ?? today.oura?.deepHours ?? null;
  if (deep != null && deep < ALERT_THRESHOLDS.deepSleepMinHours) {
    out.push({
      id: 'deep-low',
      severity: 'amber',
      title: `Deep sleep ${deep.toFixed(1)}h`,
      body: 'Below 1.5h target. Consider 200-400mg magnesium glycinate, cooler room, earlier screen-off.',
      sources: ['deep_hours'],
    });
  }

  // Device coverage advisory
  if (today.devices.active === 0) {
    out.push({
      id: 'no-devices',
      severity: 'blue',
      title: 'No devices reporting',
      body: 'Falling back to habit tracker + previous trends. Not an anomaly.',
      sources: [],
    });
  } else if (today.devices.active < 3) {
    out.push({
      id: 'partial-coverage',
      severity: 'blue',
      title: `Running on ${today.devices.active}/3 devices`,
      body: `Missing: ${['whoop', 'oura', 'apple'].filter((d) => !today.devices[d as 'whoop' | 'oura' | 'apple']).join(', ')}.`,
      sources: [],
    });
  }

  return out;
}

function baselineAvg(db: Database, column: string, upToDate: string, days: number): number | null {
  const rows = db
    .prepare(
      `SELECT ${column} AS v FROM daily_summary
         WHERE date < ? ORDER BY date DESC LIMIT ?`,
    )
    .all(upToDate, days) as Array<{ v: number | null }>;
  const nums = rows.map((r) => r.v).filter((v): v is number => typeof v === 'number');
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}
