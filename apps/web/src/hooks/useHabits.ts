import { useCallback, useEffect, useState } from 'react';
import type { Habit, HabitLog, HabitStreak } from '@vcc/shared';
import { apiGet, apiPost } from '../lib/api.js';

export function useHabits() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [streaks, setStreaks] = useState<HabitStreak[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const [h, l, s] = await Promise.all([
      apiGet<{ habits: Habit[] }>('/api/habits'),
      apiGet<{ logs: HabitLog[] }>('/api/habits/log?range=30d'),
      apiGet<{ streaks: HabitStreak[] }>('/api/habits/streaks'),
    ]);
    setHabits(h.habits);
    setLogs(l.logs);
    setStreaks(s.streaks);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const logHabit = useCallback(
    async (habitId: string, value: string) => {
      await apiPost<{ habitId: string; value: string }, HabitLog>('/api/habits/log', {
        habitId,
        value,
      });
      await reload();
    },
    [reload],
  );

  return { habits, logs, streaks, loading, reload, logHabit };
}
