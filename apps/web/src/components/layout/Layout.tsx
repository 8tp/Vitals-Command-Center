import { Outlet } from 'react-router-dom';
import { Header } from './Header.js';
import { StatusBar } from './StatusBar.js';
import { Sidebar } from './Sidebar.js';
import { BottomNav } from './BottomNav.js';

export function Layout() {
  return (
    <div className="h-full flex flex-col">
      <Header />
      <StatusBar />
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          {/* Bottom padding clears the fixed mobile tab bar (incl. its
              safe-area inset); md+ has no bottom bar so it collapses. */}
          <div className="max-w-[1400px] mx-auto px-5 md:px-6 py-6 pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-6">
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
