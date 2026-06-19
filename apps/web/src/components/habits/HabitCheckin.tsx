import { useState } from 'react';
import clsx from 'clsx';
import type { Habit } from '@vcc/shared';
import { useHabits } from '../../hooks/useHabits.js';

const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 focus-visible:ring-offset-1 focus-visible:ring-offset-bg-surface';
const BTN_BASE =
  'inline-flex items-center justify-center min-h-[44px] rounded-full px-4 text-sm font-medium transition-colors motion-reduce:transition-none';

export function HabitCheckin() {
  const { habits, logHabit, loading } = useHabits();
  const morning = habits.filter((h) => h.category === 'morning_checkin');
  const evening = habits.filter((h) => h.category === 'evening_checkin');
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <CheckinColumn title="Morning check-in" habits={morning} onLog={logHabit} loading={loading} />
      <CheckinColumn title="Evening check-in" habits={evening} onLog={logHabit} loading={loading} />
    </div>
  );
}

function CheckinColumn({
  title,
  habits,
  onLog,
  loading,
}: {
  title: string;
  habits: Habit[];
  onLog: (id: string, value: string) => Promise<void>;
  loading: boolean;
}) {
  return (
    <div className="card p-5">
      <h3 className="text-base font-semibold text-ink mb-4">{title}</h3>
      <div className="space-y-4">
        {loading && <div className="text-ink-mute text-sm">Loading your habits…</div>}
        {!loading && habits.length === 0 && (
          <div className="text-ink-mute text-sm">Nothing to check in here yet.</div>
        )}
        {habits.map((h) => (
          <HabitInput key={h.id} habit={h} onLog={onLog} />
        ))}
      </div>
    </div>
  );
}

function HabitInput({ habit, onLog }: { habit: Habit; onLog: (id: string, value: string) => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const submit = async (value: string) => {
    setPending(true);
    try {
      await onLog(habit.id, value);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="text-sm text-ink">{habit.name}</div>
      <div className={clsx('flex items-center gap-2', pending && 'opacity-60 pointer-events-none')}>
        {habit.type === 'boolean' && (
          <>
            <button
              type="button"
              disabled={pending}
              className={clsx(
                BTN_BASE,
                'border border-hairline text-ink-dim hover:bg-bg-inset hover:text-ink',
                FOCUS,
              )}
              onClick={() => submit('false')}
            >
              No
            </button>
            <button
              type="button"
              disabled={pending}
              className={clsx(BTN_BASE, 'bg-signal text-white hover:opacity-90', FOCUS)}
              onClick={() => submit('true')}
            >
              Yes
            </button>
          </>
        )}
        {habit.type === 'scale_1_5' &&
          [1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              disabled={pending}
              className={clsx(
                BTN_BASE,
                'min-w-[44px] px-0 border border-hairline text-ink-dim tabular-nums hover:bg-bg-inset hover:text-ink',
                FOCUS,
              )}
              onClick={() => submit(String(n))}
            >
              {n}
            </button>
          ))}
        {(habit.type === 'text' || habit.type === 'number' || habit.type === 'time') && (
          <input
            className={clsx(
              'min-h-[44px] bg-bg-inset border border-hairline rounded-2xl px-3 text-sm text-ink tabular-nums hover:border-hairline-strong focus:border-signal',
              FOCUS,
            )}
            placeholder={habit.type === 'time' ? 'HH:MM' : `Enter ${habit.type}`}
            onBlur={(e) => e.target.value && submit(e.target.value)}
          />
        )}
      </div>
    </div>
  );
}
