import { create } from 'zustand';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'vcc-theme';

/** Read the saved choice (defaults to light — Soft Daylight). Safe on SSR. */
function readChoice(): ThemeChoice {
  try {
    // ?theme=dark|light forces a theme (screenshot/deep-link affordance).
    const m = /[?&]theme=(dark|light)/.exec(location.search);
    if (m) return m[1] as ThemeChoice;
  } catch {
    /* ignore */
  }
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* ignore */
  }
  return 'light';
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
  );
}

export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return choice;
}

/** Apply the resolved theme to <html data-theme> + the browser chrome color. */
export function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.dataset.theme = resolved;
  // Keep legacy `.dark` class in sync (Tailwind darkMode etc.).
  root.classList.toggle('dark', resolved === 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0B0F17' : '#F6F8FA');
}

interface ThemeState {
  /** User's choice: light | dark | system. */
  choice: ThemeChoice;
  /** The effective theme after resolving `system`. */
  resolved: ResolvedTheme;
  setChoice: (c: ThemeChoice) => void;
  /** Re-resolve from the OS (called on prefers-color-scheme change). */
  syncSystem: () => void;
}

const initialChoice = readChoice();

export const useThemeStore = create<ThemeState>((set, get) => ({
  choice: initialChoice,
  resolved: resolveTheme(initialChoice),
  setChoice: (choice) => {
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      /* ignore */
    }
    const resolved = resolveTheme(choice);
    applyTheme(resolved);
    set({ choice, resolved });
  },
  syncSystem: () => {
    if (get().choice !== 'system') return;
    const resolved = resolveTheme('system');
    applyTheme(resolved);
    set({ resolved });
  },
}));

/**
 * Wire the OS preference listener once. Call from app bootstrap. Returns a
 * disposer (used by the React effect to clean up).
 */
export function listenToSystemTheme(): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => useThemeStore.getState().syncSystem();
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
