import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { visibleNav } from './nav.js';
import { NAV_ICONS, IconSettings } from '../shared/icons.js';
import { DeviceStatusCluster } from './DeviceStatusCluster.js';
import { ThemeToggle } from './ThemeToggle.js';
import { useUiStore } from '../../stores/uiStore.js';
import { useSettingsStore, selectAiEnabled } from '../../stores/settingsStore.js';

/**
 * Persistent left rail (md+). The Instrument shell's spine: brand, primary nav,
 * then the connected-device chip, settings, and theme at the foot. Hidden below
 * md, where navigation moves to the BottomNav + mobile top bar.
 */
export function Sidebar() {
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const aiEnabled = useSettingsStore(selectAiEnabled);

  return (
    <nav className="hidden md:flex md:flex-col w-[236px] shrink-0 h-full border-r border-hairline bg-bg-base px-4 py-6">
      {/* Brand */}
      <div className="flex items-center gap-3 px-2 pb-5 mb-2 border-b border-hairline">
        <BrandLogo />
        <span className="font-display font-semibold text-[18px] tracking-tight text-ink">Vitals</span>
      </div>

      {/* Primary nav */}
      <ul className="space-y-1 flex-1">
        {visibleNav(aiEnabled).map((item) => {
          const Icon = NAV_ICONS[item.icon];
          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  clsx(
                    'group flex items-center gap-3 px-3 py-2.5 rounded-[11px] text-[13.5px] transition-colors',
                    isActive
                      ? 'bg-accent-wash text-accent-deep font-semibold shadow-[inset_0_0_0_1px_var(--accent-soft)]'
                      : 'text-ink-mute hover:text-ink hover:bg-bg-surface2 font-medium',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={18} className={clsx('shrink-0', isActive ? 'text-accent' : 'text-ink-mute group-hover:text-ink')} />
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>

      {/* Foot: device · settings · theme */}
      <div className="space-y-2 pt-2">
        <DeviceStatusCluster />
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[11px] text-[13.5px] font-medium text-ink-mute hover:text-ink hover:bg-bg-surface2 transition-colors"
        >
          <IconSettings size={18} className="shrink-0" />
          <span>Settings</span>
        </button>
        <div className="px-1">
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}

/** Filled gradient squircle logo with the Vitals pulse glyph. */
export function BrandLogo({ size = 34 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="grid place-items-center shrink-0 text-white"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: 'linear-gradient(140deg, var(--accent), var(--accent-deep))',
        boxShadow: '0 6px 16px -6px rgba(37,99,235,0.6), inset 0 1px 0 rgba(255,255,255,0.4)',
      }}
    >
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {/* gauge + pulse — matches the app icon */}
        <path d="M6.4 17.3 A8 8 0 1 1 17.6 17.3" />
        <path d="M8.4 12 L10.6 12 L11.4 10.6 L12.1 12 L12.7 12 L13.3 9.2 L14 14.8 L14.6 12 L15.7 12" strokeWidth={1.8} />
      </svg>
    </span>
  );
}
