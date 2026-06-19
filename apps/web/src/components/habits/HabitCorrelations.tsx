import { useEffect, useState } from 'react';
import type { HabitCorrelation } from '@vcc/shared';
import { apiGet } from '../../lib/api.js';
import { EmptyState } from '../shared/EmptyState.js';
import { IconChevronRight } from '../shared/icons.js';

export function HabitCorrelations() {
  const [rows, setRows] = useState<HabitCorrelation[] | null>(null);

  useEffect(() => {
    apiGet<{ correlations: HabitCorrelation[]; note?: string }>('/api/habits/correlations')
      .then((r) => setRows(r.correlations))
      .catch(() => setRows([]));
  }, []);

  if (rows == null) return <div className="card p-5 text-ink-mute text-sm">Looking for patterns…</div>;
  if (!rows.length)
    return (
      <div className="card p-6">
        <h3 className="text-base font-semibold text-ink mb-3">What's connected</h3>
        <EmptyState
          title="No patterns yet"
          hint="Once you've logged about a month of habits, we'll surface what moves your metrics."
        />
      </div>
    );

  return (
    <div className="card p-5">
      <h3 className="text-base font-semibold text-ink mb-4">What's connected</h3>
      <ul className="space-y-3">
        {rows.map((c) => (
          <li key={c.habitId + c.metric} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-ink-dim truncate">{c.habitName}</span>
              <IconChevronRight size={14} className="text-ink-mute shrink-0" />
              <span className="text-ink truncate">{c.metric}</span>
            </div>
            <div className="num text-xs text-ink-mute tabular-nums shrink-0">
              r {c.r.toFixed(2)} · {c.n} days
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
