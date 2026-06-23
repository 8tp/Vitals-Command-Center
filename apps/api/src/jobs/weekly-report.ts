import type { Database } from 'better-sqlite3';
import type { FastifyBaseLogger } from 'fastify';
import type { WeeklyMetric, WeeklySummary } from '@vcc/shared';
import { queries } from '@vcc/db';
import { todayIso } from '../lib/range.js';
import { computeWeeklySummary } from '../services/weekly.js';

export async function runWeeklyReport(db: Database, log: FastifyBaseLogger): Promise<void> {
  const end = todayIso();
  const summary = computeWeeklySummary(db, end);
  log.info(
    { start: summary.start, end: summary.end, days: summary.daysWithData },
    'weekly report: assembled',
  );
  queries.briefings.store(db, {
    date: end,
    type: 'weekly',
    content: renderWeeklyMarkdown(summary),
    metricsSnapshot: summary,
  });
}

/** A terse markdown digest from the computed summary — what the brief surfaces. */
function renderWeeklyMarkdown(s: WeeklySummary): string {
  const lines: string[] = [`## Weekly digest · ${s.start} → ${s.end}`, ''];
  if (s.daysWithData === 0) {
    lines.push('_No device data this week._');
    return lines.join('\n');
  }
  lines.push(`Coverage: ${s.daysWithData}/7 days with data.`, '');
  for (const m of s.metrics) {
    lines.push(`- ${metricLine(m)}`);
  }
  if (s.bestSleep || s.worstSleep) {
    lines.push('');
    if (s.bestSleep) lines.push(`- Best night: ${s.bestSleep.hours}h (${s.bestSleep.date})`);
    if (s.worstSleep) lines.push(`- Shortest night: ${s.worstSleep.hours}h (${s.worstSleep.date})`);
  }
  return lines.join('\n');
}

function metricLine(m: WeeklyMetric): string {
  if (m.avg == null) return `${m.label}: no data`;
  const head = `${m.label}: ${m.avg}${m.unit}`;
  if (m.deltaPct == null) return `${head} (no prior week)`;
  const arrow = m.direction === 'up' ? '▲' : m.direction === 'down' ? '▼' : '–';
  const better =
    m.direction === 'flat'
      ? 'steady'
      : (m.direction === 'up') === (m.betterWhen === 'higher')
        ? 'improving'
        : 'declining';
  return `${head} ${arrow} ${Math.abs(m.deltaPct)}% vs last week (${better})`;
}
