import clsx from 'clsx';
import { useThemeStore, type ThemeChoice } from '../../stores/themeStore.js';
import { IconSun, IconMonitor, IconMoon } from '../shared/icons.js';

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof IconSun }[] = [
  { value: 'light', label: 'Light', Icon: IconSun },
  { value: 'system', label: 'System', Icon: IconMonitor },
  { value: 'dark', label: 'Dark', Icon: IconMoon },
];

/** Compact 3-state theme switch (light / system / dark) for the header. */
export function ThemeToggle() {
  const choice = useThemeStore((s) => s.choice);
  const setChoice = useThemeStore((s) => s.setChoice);

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="inline-flex items-center bg-bg-inset border border-hairline rounded-pill p-1"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = choice === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={`${label} theme`}
            onClick={() => setChoice(value)}
            className={clsx(
              'flex items-center justify-center min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 md:w-8 md:h-8 rounded-pill transition-colors',
              active ? 'bg-bg-surface text-signal shadow-card' : 'text-ink-mute hover:text-ink',
            )}
          >
            <Icon size={16} />
          </button>
        );
      })}
    </div>
  );
}
