import { useHabits } from '../../hooks/useHabits.js';

export function HabitEditor() {
  const { habits, loading } = useHabits();
  // Phase-2 ships read-only. Create/edit/delete UI is planned once the dashboard view stabilizes.
  return (
    <div className="card p-5">
      <h3 className="text-base font-semibold text-ink mb-4">Your habits ({habits.length})</h3>
      {loading ? (
        <div className="text-ink-mute text-sm">Loading…</div>
      ) : (
        <ul className="divide-y divide-hairline">
          {habits.map((h) => (
            <li key={h.id} className="py-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm text-ink">{h.name}</div>
                <div className="text-xs text-ink-mute mt-0.5">
                  {labelCategory(h.category)} · {labelType(h.type)}
                </div>
              </div>
              <span
                className={
                  h.active
                    ? 'pill bg-signal-soft text-signal'
                    : 'pill bg-bg-inset text-ink-mute'
                }
              >
                {h.active ? 'Active' : 'Paused'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function labelCategory(c: string): string {
  return c.replace(/_/g, ' ');
}

function labelType(t: string): string {
  switch (t) {
    case 'boolean':
      return 'yes / no';
    case 'scale_1_5':
      return '1–5 scale';
    default:
      return t;
  }
}
