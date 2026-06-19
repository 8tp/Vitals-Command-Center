import type { Database } from 'better-sqlite3';

/**
 * Phase 3 replaces this with the nightly correlation job's cached output.
 * Until then we return the schema shape but an explanatory note so Claude
 * knows the data isn't yet available.
 */
export function getCorrelations(_db: Database, _args: Record<string, unknown>) {
  return {
    correlations: [],
    note: 'Correlation engine runs in Phase 3. Gather >=14 days of habit logs first.',
  };
}
