import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { NAV } from './nav.js';
import { NAV_ICONS } from '../shared/icons.js';

export function Sidebar() {
  return (
    <nav className="w-56 shrink-0 border-r border-hairline bg-bg-surface/30 py-5 hidden md:flex md:flex-col">
      <ul className="space-y-1 px-3 flex-1">
        {NAV.map((item) => {
          const Icon = NAV_ICONS[item.icon];
          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  clsx(
                    'group flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors',
                    isActive
                      ? 'bg-signal-soft text-ink font-semibold'
                      : 'text-ink-dim hover:text-ink hover:bg-bg-surface2',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={20}
                      className={clsx('shrink-0', isActive ? 'text-signal' : 'text-ink-mute group-hover:text-ink')}
                    />
                    <span className="text-sm">{item.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
      <div className="px-5 pt-3 text-2xs text-ink-mute">Vitals · v0.1 · local</div>
    </nav>
  );
}
