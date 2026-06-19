import { useEffect } from 'react';
import { useHealthStore } from '../stores/healthStore.js';
import { useUiStore } from '../stores/uiStore.js';

export function useHealthData() {
  const { daily, sleep, workouts, deviceStatus, loading, error, fetchAll } = useHealthStore();
  const range = useUiStore((s) => s.range);

  useEffect(() => {
    void fetchAll(range);
  }, [range, fetchAll]);

  return { daily, sleep, workouts, deviceStatus, loading, error, range };
}
