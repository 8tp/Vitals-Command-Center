import { Outlet } from 'react-router-dom';
import { Header } from './Header.js';
import { Sidebar } from './Sidebar.js';
import { BottomNav } from './BottomNav.js';
import { SettingsModal } from '../settings/SettingsModal.js';

/**
 * Instrument shell: a persistent left rail (md+) beside a single scrolling
 * content column. Below md the rail collapses to a top bar + fixed BottomNav.
 * Pages render edge-to-edge, hairline-grouped — no global status bar.
 */
export function Layout() {
  return (
    <div className="app-shell flex flex-col md:flex-row">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="max-w-[1320px] mx-auto pb-8 md:pb-12">
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav />
      <SettingsModal />
    </div>
  );
}
