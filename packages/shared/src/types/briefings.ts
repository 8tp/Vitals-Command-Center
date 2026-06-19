export type BriefingType = 'daily' | 'weekly' | 'query_response';

export interface BriefingRecord {
  id: string;
  date: string;
  type: BriefingType;
  content: string; // markdown
  metricsSnapshot: unknown; // JSON blob Claude analyzed
  createdAt: string;
}

export interface InsightItem {
  id: string;
  severity: 'green' | 'amber' | 'red' | 'blue';
  title: string;
  body: string;
  sources: string[]; // metric names or device names cited
}
