import { useHabits } from '../../hooks/useHabits.js';
import { EmptyState } from '../shared/EmptyState.js';
import { IconFlame } from '../shared/icons.js';

export function HabitStreaks() {
  const { streaks, loading } = useHabits();
  if (loading) return <div className="card p-5 text-ink-mute text-sm">Loading your streaks…</div>;
  if (!streaks.length)
    return (
      <div className="card p-6">
        <h3 className="text-base font-semibold text-ink mb-3">Streaks</h3>
        <EmptyState title="No streaks yet" hint="Check in today to start your first streak." />
      </div>
    );
  return (
    <div className="card p-5">
      <h3 className="text-base font-semibold text-ink mb-4">Streaks</h3>
      <ul className="divide-y divide-hairline">
        {streaks.map((s) => (
          <li key={s.habitId} className="py-3 flex items-center justify-between gap-3">
            <span className="text-sm text-ink">{s.habitName}</span>
            <span className="flex items-center gap-1.5">
              <IconFlame
                size={16}
                className={s.currentStreak > 0 ? 'text-warn' : 'text-ink-mute'}
              />
              <span className="num text-sm tabular-nums">
                <span className="text-signal font-semibold">{s.currentStreak}</span>
                <span className="text-ink-mute"> day{s.currentStreak === 1 ? '' : 's'}</span>
                <span className="text-ink-mute"> · best {s.longestStreak}</span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
