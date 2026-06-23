export type BriefingType = 'daily' | 'weekly' | 'query_response';

export interface BriefingRecord {
  id: string;
  date: string;
  type: BriefingType;
  content: string; // markdown
  metricsSnapshot: unknown; // JSON blob Claude analyzed
  createdAt: string;
}

/** One metric's week-over-week movement in the weekly digest. */
export interface WeeklyMetric {
  key: string;
  label: string;
  unit: string;
  /** Mean across days with data this week, or null if none. */
  avg: number | null;
  /** Mean across the prior 7-day window, or null. */
  prevAvg: number | null;
  /** Percent change vs prior week, or null when not computable. */
  deltaPct: number | null;
  direction: 'up' | 'down' | 'flat';
  /** Which direction is healthier — drives the tone (green/amber) in the UI. */
  betterWhen: 'higher' | 'lower';
  /** Days with a reading this week (out of 7). */
  samples: number;
}

/** Deterministic 7-day digest: per-metric movement vs the prior week + sleep highs/lows. */
export interface WeeklySummary {
  start: string;
  end: string;
  /** Days in the window with any device data. */
  daysWithData: number;
  metrics: WeeklyMetric[];
  bestSleep: { date: string; hours: number } | null;
  worstSleep: { date: string; hours: number } | null;
}

export interface InsightItem {
  id: string;
  severity: 'green' | 'amber' | 'red' | 'blue';
  title: string;
  body: string;
  sources: string[]; // metric names or device names cited
}
