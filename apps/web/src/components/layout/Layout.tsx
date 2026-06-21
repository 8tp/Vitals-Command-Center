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
    <div className="h-full flex flex-col md:flex-row">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="max-w-[1320px] mx-auto pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-12">
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav />
      <SettingsModal />
    </div>
  );
}
