import { BrandLogo } from './Sidebar.js';
import { ThemeToggle } from './ThemeToggle.js';
import { IconSettings } from '../shared/icons.js';
import { useUiStore } from '../../stores/uiStore.js';

/**
 * Mobile top bar (below md only). The rail is hidden on small screens, so this
 * carries the brand + global chrome (settings, theme). Primary navigation lives
 * in the fixed BottomNav; per-page sync lives in the PageHeader.
 */
export function Header() {
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  return (
    <header
      className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-3 h-14 px-5 border-b border-hairline bg-bg-base/85 backdrop-blur-md box-content"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center gap-2.5">
        <BrandLogo size={30} />
        <span className="font-display font-semibold text-[17px] tracking-tight text-ink">Vitals</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          className="grid place-items-center w-10 h-10 rounded-full text-ink-dim hover:text-ink"
        >
          <IconSettings size={20} />
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}
