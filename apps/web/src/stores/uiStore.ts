import { create } from 'zustand';

export type RangePreset = '7d' | '14d' | '30d' | '90d';

interface UiState {
  range: RangePreset;
  setRange: (r: RangePreset) => void;
  /** Settings modal visibility (opened from the rail / mobile top bar). */
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  /** Workout-detail modal: the workout id to show, or null when closed. */
  openWorkoutId: string | null;
  setOpenWorkoutId: (id: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  range: '7d',
  setRange: (range) => set({ range }),
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  openWorkoutId: null,
  setOpenWorkoutId: (openWorkoutId) => set({ openWorkoutId }),
}));
