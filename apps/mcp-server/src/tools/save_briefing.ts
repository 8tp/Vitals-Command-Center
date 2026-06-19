import type { Database } from 'better-sqlite3';
import { queries } from '@vcc/db';

/**
 * Claude Desktop / claude.ai generated a briefing in-chat. Call this to persist
 * it so the web dashboard's InsightsPanel can display it alongside the rule-based
 * insights. Safe to call repeatedly — re-running just stores a new record.
 */
export function saveBriefing(db: Database, args: Record<string, unknown>) {
  const date = (args.date as string) ?? new Date().toISOString().slice(0, 10);
  const content = String(args.content ?? '').trim();
  const type = (args.type as 'daily' | 'weekly' | 'query_response') ?? 'daily';

  if (!content) {
    return { saved: false, error: 'content is required' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { saved: false, error: 'date must be YYYY-MM-DD' };
  }

  // Ensure the parent daily_summary row exists; the briefings FK requires it.
  db.prepare('INSERT OR IGNORE INTO daily_summary (date, devices_active) VALUES (?, 0)').run(date);

  const summary = queries.dailySummary.get(db, date);
  const stored = queries.briefings.store(db, {
    date,
    type,
    content,
    metricsSnapshot: summary,
  });

  return { saved: true, id: stored.id, date: stored.date, type: stored.type, bytes: content.length };
}
