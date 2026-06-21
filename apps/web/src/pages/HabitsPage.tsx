import { useEffect, useMemo, useState } from 'react';
import type { Habit, HabitLog, HabitStreak, HabitCorrelation } from '@vcc/shared';
import { useHabits } from '../hooks/useHabits.js';
import { apiGet } from '../lib/api.js';
import { PageHeader, HeaderDate } from '../components/layout/PageHeader.js';
import { IconCheck } from '../components/shared/icons.js';
import { fmtDate } from '../lib/formatters.js';

const SECTION = 'px-6 md:px-10 py-7 border-b border-hairline animate-fade-rise';

/* ---------------- date helpers ---------------- */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dayOfYear(iso: string): number {
  const d = new Date(iso + 'T00:00:00');
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
}
/** Last 7 ISO dates, oldest → newest, ending today. */
function lastSevenDays(today: string): string[] {
  const base = new Date(today + 'T00:00:00');
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
}

/* ---------------- value interpretation ---------------- */
/** A log counts as "done / positive" for booleans = true; for everything else, any logged value. */
function isPositive(habit: Habit, value: string): boolean {
  if (habit.type === 'boolean') return value === 'true' || value === '1';
  return value.trim().length > 0;
}
/** Short human detail for a logged value, by habit type. */
function detailFor(habit: Habit, value: string): string {
  switch (habit.type) {
    case 'boolean':
      return isPositive(habit, value) ? 'Done today' : 'Marked no';
    case 'scale_1_5':
      return `Rated ${value} / 5`;
    case 'time':
      return `Logged ${value}`;
    case 'number':
      return habit.unit ? `${value} ${habit.unit} logged` : `${value} logged`;
    default:
      return 'Logged today';
  }
}

/* ---------------- weekly dot ---------------- */
type DotState = 'on' | 'half' | 'off';
function Dot({ state }: { state: DotState }) {
  const base = 'w-[22px] h-[22px] rounded-[7px]';
  if (state === 'on') return <i className={`${base} bg-gradient-to-br from-accent to-accent-deep`} />;
  if (state === 'half') return <i className={`${base} bg-accent-wash shadow-[inset_0_0_0_1px_rgba(37,99,235,0.2)]`} />;
  return <i className={`${base} bg-bg-surface2 shadow-[inset_0_0_0_1px_var(--hairline)]`} />;
}

/* ---------------- correlation effect formatting ---------------- */
/** Format a correlation as a signed, unit-aware effect string + tone. */
function effect(c: HabitCorrelation): { text: string; good: boolean } {
  // Prefer an explicit summary if the engine supplies one; else fall back to r.
  const sign = c.direction === 'positive' ? '+' : '−';
  const good = c.direction === 'positive';
  if (c.summary && /\d/.test(c.summary)) return { text: c.summary, good };
  return { text: `${sign}${Math.abs(c.r).toFixed(2)} r`, good };
}

export default function HabitsPage() {
  const { habits, logs, streaks, loading, logHabit } = useHabits();
  const [correlations, setCorrelations] = useState<HabitCorrelation[] | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ correlations: HabitCorrelation[] }>('/api/habits/correlations')
      .then((r) => setCorrelations(r.correlations))
      .catch(() => setCorrelations([]));
  }, []);

  const today = useMemo(
    () => logs.reduce<string | null>((max, l) => (max && max > l.date ? max : l.date), null) ?? localToday(),
    [logs],
  );

  const active = useMemo(
    () => habits.filter((h) => h.active).sort((a, b) => a.sortOrder - b.sortOrder),
    [habits],
  );
  const streakBy = useMemo(() => {
    const m = new Map<string, HabitStreak>();
    for (const s of streaks) m.set(s.habitId, s);
    return m;
  }, [streaks]);

  // habitId -> (date -> log) for fast lookup
  const logIndex = useMemo(() => {
    const m = new Map<string, Map<string, HabitLog>>();
    for (const l of logs) {
      let byDate = m.get(l.habitId);
      if (!byDate) m.set(l.habitId, (byDate = new Map()));
      byDate.set(l.date, l);
    }
    return m;
  }, [logs]);

  const todayLogOf = (id: string) => logIndex.get(id)?.get(today) ?? null;
  const doneToday = (h: Habit) => {
    const l = todayLogOf(h.id);
    return l != null && isPositive(h, l.value);
  };

  const week = useMemo(() => lastSevenDays(today), [today]);
  const completedCount = active.filter(doneToday).length;

  const toggle = async (h: Habit) => {
    if (pendingId) return;
    // Re-marking sets the canonical "done" value; for booleans we flip true/false.
    const next = h.type === 'boolean' ? (doneToday(h) ? 'false' : 'true') : 'true';
    setPendingId(h.id);
    try {
      await logHabit(h.id, next);
    } finally {
      setPendingId(null);
    }
  };

  /* ----- subtitle / streak note ----- */
  const topStreak = useMemo(
    () => [...streaks].sort((a, b) => b.currentStreak - a.currentStreak)[0] ?? null,
    [streaks],
  );
  const subtitle = active.length
    ? `${completedCount} of ${active.length} done today.${
        topStreak && topStreak.currentStreak > 0
          ? ` ${topStreak.habitName} is your longest run at ${topStreak.currentStreak} day${topStreak.currentStreak === 1 ? '' : 's'}.`
          : ''
      }`
    : 'No habits yet — add a few to start building streaks.';

  /* ----- loading skeleton (mirror DashboardPage) ----- */
  if (loading && habits.length === 0) {
    return (
      <div>
        <div className="px-6 md:px-10 pt-8 pb-5 border-b border-hairline">
          <div className="h-9 w-48 rounded-md bg-bg-surface2 animate-pulse" />
        </div>
        <div className="px-6 md:px-10 py-7 border-b border-hairline space-y-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 rounded-md bg-bg-surface2 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Habits"
        subtitle={subtitle}
        date={<HeaderDate primary={fmtDate(today, 'EEEE, MMMM d')} caption={`DAY ${dayOfYear(today)} · ${today.slice(0, 4)}`} />}
      />

      {/* ---------------- Today check-in ---------------- */}
      <section className={SECTION}>
        <div className="flex items-baseline justify-between mb-5">
          <h3 className="section-heading text-[15px]">Today</h3>
          <span className="meta-mono">
            {completedCount} / {active.length} complete
          </span>
        </div>

        {active.length === 0 ? (
          <div className="py-10 text-center">
            <div className="text-sm font-semibold text-ink-dim">No habits yet</div>
            <p className="mt-1.5 text-[13px] text-ink-mute max-w-sm mx-auto leading-relaxed">
              Habits you track will appear here. Seed a few via the API
              (<code className="rounded-md bg-bg-surface2 px-1.5 py-0.5 text-ink-dim">POST /api/habits</code>) to start logging streaks.
            </p>
          </div>
        ) : (
          <div>
            {active.map((h) => {
              const done = doneToday(h);
              const log = todayLogOf(h.id);
              const streak = streakBy.get(h.id)?.currentStreak ?? 0;
              const busy = pendingId === h.id;
              return (
                <div
                  key={h.id}
                  className={`flex items-center gap-4 py-4 border-b border-hairline last:border-0 ${busy ? 'opacity-60' : ''}`}
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={done}
                    aria-label={`${done ? 'Unmark' : 'Mark'} ${h.name} done`}
                    disabled={busy}
                    onClick={() => toggle(h)}
                    className={`grid place-items-center w-6 h-6 rounded-lg shrink-0 transition-[background,box-shadow,color] duration-200 motion-reduce:transition-none ${
                      done
                        ? 'bg-gradient-to-br from-accent to-accent-deep text-white'
                        : 'text-transparent shadow-[inset_0_0_0_1.5px_var(--hairline)] hover:shadow-[inset_0_0_0_1.5px_var(--hairline-strong)]'
                    }`}
                  >
                    <IconCheck size={14} strokeWidth={3} />
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] text-ink leading-tight truncate">{h.name}</div>
                    <div className="meta-mono mt-1">
                      {log ? detailFor(h, log.value) : 'Pending'}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="label-micro">Streak</div>
                    <div className="num text-[15px] font-bold text-ink mt-1">{streak}d</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ---------------- This week | What's moving your recovery ---------------- */}
      <section className="grid md:grid-cols-2 animate-fade-rise">
        {/* LEFT — weekly completion grid */}
        <div className="px-6 md:px-10 py-7">
          <div className="flex items-baseline justify-between mb-5">
            <h3 className="section-heading text-[15px]">This week</h3>
            <span className="meta-mono">completion grid</span>
          </div>
          {active.length === 0 ? (
            <p className="text-[13px] text-ink-mute">Add habits to see your weekly grid.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {active.map((h) => (
                <div key={h.id}>
                  <div className="text-[12.5px] font-medium text-ink-dim mb-1.5 truncate">{h.name}</div>
                  <div className="flex gap-1.5">
                    {week.map((date) => {
                      const l = logIndex.get(h.id)?.get(date) ?? null;
                      const state: DotState = !l ? 'off' : isPositive(h, l.value) ? 'on' : 'half';
                      return <Dot key={date} state={state} />;
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT — correlations (last section: no border-b) */}
        <div className="px-6 md:px-10 py-7 md:border-l border-hairline max-md:border-t">
          <div className="flex items-baseline justify-between mb-5">
            <h3 className="section-heading text-[15px]">What&apos;s moving your recovery</h3>
            <span className="meta-mono">30-day correlation</span>
          </div>
          {correlations == null ? (
            <p className="text-[13px] text-ink-mute">Looking for patterns…</p>
          ) : correlations.length === 0 ? (
            <div className="py-2">
              <div className="text-sm font-semibold text-ink-dim">Not enough history yet</div>
              <p className="mt-1.5 text-[13px] text-ink-mute max-w-sm leading-relaxed">
                Once you&apos;ve logged about a month of habits, we&apos;ll surface which ones move your HRV,
                sleep, and resting heart rate.
              </p>
            </div>
          ) : (
            <div>
              {correlations.map((c) => {
                const e = effect(c);
                return (
                  <div
                    key={c.habitId + c.metric}
                    className="flex items-center justify-between gap-4 py-[13px] border-b border-hairline last:border-0"
                  >
                    <div className="min-w-0">
                      <div className="text-[13.5px] text-ink leading-tight truncate">{c.habitName}</div>
                      <div className="meta-mono mt-1">on {c.metric}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="label-micro">Effect</div>
                      <div className={`num text-[15px] font-bold mt-1 ${e.good ? 'text-good' : 'text-warn'}`}>
                        {e.text}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
