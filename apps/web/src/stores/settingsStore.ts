import { create } from 'zustand';
import { apiGet, apiPatch } from '../lib/api.js';

/** App-level preference flags (mirror of the server's settings.app payload). */
export interface AppFlags {
  autoSyncEnabled: boolean;
  aiEnabled: boolean;
  aiAutoSummary: boolean;
}

interface SettingsState {
  /** null until first load; consumers should fall back to sensible defaults. */
  app: AppFlags | null;
  loadApp: () => Promise<void>;
  /** Replace app flags (used by useSettings to keep this store in sync). */
  setApp: (app: AppFlags) => void;
  /** PATCH a subset of app flags and store the returned canonical state. */
  patchApp: (patch: Partial<AppFlags>) => Promise<void>;
}

/**
 * Global app-settings store. Loaded once at app start so navigation and the
 * dashboard can gate AI surfaces immediately, independent of the Settings modal
 * (which uses the heavier useSettings hook for integrations). useSettings mirrors
 * its app payload into here on every load/patch, so the two never diverge.
 */
export const useSettingsStore = create<SettingsState>((set) => ({
  app: null,
  setApp: (app) => set({ app }),
  loadApp: async () => {
    const s = await apiGet<{ app: AppFlags }>('/api/settings');
    set({ app: s.app });
  },
  patchApp: async (patch) => {
    const s = await apiPatch<Partial<AppFlags>, { app: AppFlags }>('/api/settings/app', patch);
    set({ app: s.app });
  },
}));

/** Convenience selector: AI on unless explicitly disabled (default-open while loading). */
export const selectAiEnabled = (s: SettingsState): boolean => s.app?.aiEnabled ?? true;
export const selectAiAutoSummary = (s: SettingsState): boolean => s.app?.aiAutoSummary ?? true;
