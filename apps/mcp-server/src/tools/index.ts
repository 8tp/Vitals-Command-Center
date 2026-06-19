import type { Database } from 'better-sqlite3';
import { getDailySummary } from './get_daily_summary.js';
import { getTrends } from './get_trends.js';
import { getSleepDetails } from './get_sleep_details.js';
import { getWorkouts } from './get_workouts.js';
import { getDeviceStatus } from './get_device_status.js';
import { getCorrelations } from './get_correlations.js';
import { getHabitStreaks } from './get_habit_streaks.js';
import { logHabitEntry } from './log_habit_entry.js';
import { getBriefing } from './get_briefing.js';
import { getFullContext } from './get_full_context.js';
import { saveBriefing } from './save_briefing.js';

/** Public catalog surfaced via ListTools. */
export const TOOL_DEFINITIONS = [
  {
    name: 'get_full_context',
    description:
      "ONE-SHOT briefing packet. Returns today's full summary + 14-day compact window + 7-day workouts + previous briefing + a briefingTemplate string. Call this first when the user asks for a morning briefing, status, or general health read. After composing the briefing, call save_briefing to persist it.",
    inputSchema: {
      type: 'object',
      properties: { date: { type: 'string', description: 'YYYY-MM-DD, defaults to today' } },
    },
  },
  {
    name: 'save_briefing',
    description:
      'Persist a briefing you just generated so the web dashboard displays it. Call after producing a morning/weekly briefing via get_full_context.',
    inputSchema: {
      type: 'object',
      required: ['content'],
      properties: {
        content: { type: 'string', description: 'Markdown body' },
        date: { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
        type: { type: 'string', enum: ['daily', 'weekly', 'query_response'], default: 'daily' },
      },
    },
  },
  {
    name: 'get_daily_summary',
    description:
      "Get health metrics for a specific date or today. Returns HRV, RHR, SpO2, sleep stages, skin-temp deviation, steps, and device availability (Fitbit Air primary). Use when the user asks for a single day's numbers without a narrative.",
    inputSchema: {
      type: 'object',
      properties: { date: { type: 'string', description: 'YYYY-MM-DD, defaults to today' } },
    },
  },
  {
    name: 'get_trends',
    description: 'Trend data for a metric over a time range with 7-day moving average.',
    inputSchema: {
      type: 'object',
      required: ['metric'],
      properties: {
        metric: {
          type: 'string',
          enum: [
            'hrv',
            'rhr',
            'sleep_hours',
            'deep_hours',
            'rem_hours',
            'steps',
            'spo2',
            'temp_deviation',
            'respiratory_rate',
            'calories_burned',
            'calories_in',
          ],
        },
        days: { type: 'number', default: 30 },
      },
    },
  },
  {
    name: 'get_sleep_details',
    description: 'Detailed sleep breakdown (stages, scores, per-device comparison) for a date.',
    inputSchema: {
      type: 'object',
      properties: { date: { type: 'string' } },
    },
  },
  {
    name: 'get_workouts',
    description: 'Recent workouts with HR zones, duration, and type (strain is WHOOP-only and unavailable now).',
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'number', default: 14 }, sport: { type: 'string' } },
    },
  },
  {
    name: 'get_device_status',
    description: 'Which devices have data today and their last sync time.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_correlations',
    description: 'Correlations between habits/behaviors and health metrics, ranked by |r|.',
    inputSchema: {
      type: 'object',
      properties: {
        metric: { type: 'string' },
        min_days: { type: 'number', default: 14 },
      },
    },
  },
  {
    name: 'get_habit_streaks',
    description: 'Current and longest streaks for all tracked habits.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'log_habit_entry',
    description: 'Log a habit check-in value for today.',
    inputSchema: {
      type: 'object',
      required: ['habit_name', 'value'],
      properties: {
        habit_name: { type: 'string' },
        value: { type: 'string' },
        date: { type: 'string' },
      },
    },
  },
  {
    name: 'get_briefing',
    description: "Retrieve a previously-stored briefing markdown for a date.",
    inputSchema: {
      type: 'object',
      properties: { date: { type: 'string' } },
    },
  },
] as const;

/**
 * Tools that mutate the DB. The public HTTP server opens the DB read-only and
 * excludes these from its catalog; the local stdio server exposes everything.
 */
export const WRITE_TOOLS: ReadonlySet<string> = new Set(['save_briefing', 'log_habit_entry']);

export async function runTool(db: Database, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_full_context':
      return getFullContext(db, args);
    case 'save_briefing':
      return saveBriefing(db, args);
    case 'get_daily_summary':
      return getDailySummary(db, args);
    case 'get_trends':
      return getTrends(db, args);
    case 'get_sleep_details':
      return getSleepDetails(db, args);
    case 'get_workouts':
      return getWorkouts(db, args);
    case 'get_device_status':
      return getDeviceStatus(db);
    case 'get_correlations':
      return getCorrelations(db, args);
    case 'get_habit_streaks':
      return getHabitStreaks(db);
    case 'log_habit_entry':
      return logHabitEntry(db, args);
    case 'get_briefing':
      return getBriefing(db, args);
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
