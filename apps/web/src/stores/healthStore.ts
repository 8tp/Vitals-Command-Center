import { create } from 'zustand';
import type { NormalizedDailySummary, SleepSession, Workout } from '@vcc/shared';
import { apiGet } from '../lib/api.js';

interface DailyRangeResponse {
  range: { start: string; end: string; days: number };
  rows: NormalizedDailySummary[];
}
interface SleepRangeResponse {
  range: { start: string; end: string; days: number };
  sessions: SleepSession[];
}
interface WorkoutRangeResponse {
  range: { start: string; end: string; days: number };
  workouts: Workout[];
}
interface DeviceStatusResponse {
  date: string;
  statuses: Array<{
    source: 'fitbit' | 'whoop' | 'oura' | 'apple';
    connected: boolean;
    lastSeen: string | null;
    lastSyncOk: boolean;
    message: string | null;
  }>;
}

interface HealthState {
  daily: NormalizedDailySummary[];
  sleep: SleepSession[];
  workouts: Workout[];
  deviceStatus: DeviceStatusResponse | null;
  loading: boolean;
  error: string | null;
  fetchAll: (range: string) => Promise<void>;
}

export const useHealthStore = create<HealthState>((set) => ({
  daily: [],
  sleep: [],
  workouts: [],
  deviceStatus: null,
  loading: false,
  error: null,
  fetchAll: async (range) => {
    set({ loading: true, error: null });
    try {
      const [daily, sleep, workouts, deviceStatus] = await Promise.all([
        apiGet<DailyRangeResponse>(`/api/daily?range=${encodeURIComponent(range)}`),
        apiGet<SleepRangeResponse>(`/api/sleep?range=${encodeURIComponent(range)}`),
        apiGet<WorkoutRangeResponse>(`/api/workouts?range=${encodeURIComponent(range)}`),
        apiGet<DeviceStatusResponse>('/api/devices/status'),
      ]);
      set({
        daily: daily.rows,
        sleep: sleep.sessions,
        workouts: workouts.workouts,
        deviceStatus,
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
    }
  },
}));
