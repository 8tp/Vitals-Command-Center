import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { visibleNav } from './nav.js';
import { NAV_ICONS } from '../shared/icons.js';
import { useSettingsStore, selectAiEnabled } from '../../stores/settingsStore.js';

/**
 * Mobile bottom tab bar — the only navigation below md (the Sidebar is
 * hidden there). A normal flex child at the bottom of the app shell (NOT
 * position:fixed — that jumps and overlaps content over a nested scroller in
 * iOS standalone PWAs), 5 tabs, safe-area aware so it clears the iPhone home
 * indicator when installed as a PWA.
 */
export function BottomNav() {
  const aiEnabled = useSettingsStore(selectAiEnabled);
  return (
    <nav
      className="md:hidden shrink-0 border-t border-hairline bg-bg-base"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary"
    >
      <ul className="flex items-stretch">
        {visibleNav(aiEnabled).map((item) => {
          const Icon = NAV_ICONS[item.icon];
          return (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  clsx(
                    'flex flex-col items-center justify-center gap-1 min-h-[56px] py-2 transition-colors',
                    isActive ? 'text-accent' : 'text-ink-mute hover:text-ink',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={22} strokeWidth={isActive ? 2 : 1.75} />
                    <span className={clsx('text-3xs', isActive ? 'font-semibold' : 'font-medium')}>
                      {item.short}
                    </span>
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
