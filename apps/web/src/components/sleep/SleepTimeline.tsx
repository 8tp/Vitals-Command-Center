import type { SleepSession } from '@vcc/shared';
import { fmtDuration, fmtDate } from '../../lib/formatters.js';
import { EmptyState } from '../shared/EmptyState.js';
import { STAGE_COLOR, STAGE_LABEL } from './sleep-data.js';

interface Props {
  sessions: SleepSession[];
}

export function SleepTimeline({ sessions }: Props) {
  if (sessions.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="text-base font-semibold text-ink mb-3">Night by night</h3>
        <EmptyState title="No nights to show yet" hint="Each night you sleep will appear here." />
      </div>
    );
  }

  const byDate = new Map<string, SleepSession[]>();
  for (const s of sessions) {
    const arr = byDate.get(s.date) ?? [];
    arr.push(s);
    byDate.set(s.date, arr);
  }

  return (
    <div className="card p-5">
      <h3 className="text-base font-semibold text-ink mb-4">Night by night</h3>
      <div className="divide-y divide-hairline">
        {[...byDate.entries()]
          .sort((a, b) => b[0].localeCompare(a[0]))
          .map(([date, rows]) => (
            <div key={date} className="py-4 first:pt-0">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-ink">{fmtDate(date)}</div>
                {rows.length > 1 && (
                  <div className="text-xs text-ink-mute">
                    {rows.length} sessions
                  </div>
                )}
              </div>
              <div className="mt-2.5 space-y-2">
                {rows.map((r) => (
                  <div key={r.id} className="grid grid-cols-[1fr_64px] gap-3 items-center">
                    <StackedBar row={r} />
                    <span className="num text-xs text-right text-ink-dim tabular-nums">
                      {fmtDuration(r.totalMinutes / 60)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function StackedBar({ row }: { row: SleepSession }) {
  const total = Math.max(1, row.totalMinutes);
  const segs = [
    { key: 'deep' as const, mins: row.deepMinutes },
    { key: 'rem' as const, mins: row.remMinutes },
    { key: 'light' as const, mins: row.lightMinutes },
    { key: 'awake' as const, mins: row.awakeMinutes },
  ];
  return (
    <div className="flex h-3 rounded-full overflow-hidden bg-bg-inset">
      {segs.map((s) => (
        <div
          key={s.key}
          style={{ width: `${(s.mins / total) * 100}%`, background: STAGE_COLOR[s.key] }}
          title={`${STAGE_LABEL[s.key]}: ${s.mins}m`}
        />
      ))}
    </div>
  );
}
