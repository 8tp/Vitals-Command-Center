import { create } from 'zustand';

export type RangePreset = '7d' | '14d' | '30d' | '90d';

interface UiState {
  range: RangePreset;
  setRange: (r: RangePreset) => void;
}

export const useUiStore = create<UiState>((set) => ({
  range: '7d',
  setRange: (range) => set({ range }),
}));
