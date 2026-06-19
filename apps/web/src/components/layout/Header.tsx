import { DateRangePicker } from '../shared/DateRangePicker.js';
import { DeviceStatusCluster } from './DeviceStatusCluster.js';
import { ThemeToggle } from './ThemeToggle.js';
import { BrandMark } from '../shared/icons.js';

export function Header() {
  return (
    <header
      className="h-16 flex items-center justify-between gap-3 px-5 md:px-6 border-b border-hairline bg-bg-surface/70 backdrop-blur-md box-content"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2.5">
          {/* Brand mark: a pulse curving into a ring, teal→emerald gradient. */}
          <BrandMark size={26} className="shrink-0" />
          <div className="font-display font-extrabold text-lg tracking-tight text-ink">
            Vitals
          </div>
        </div>
        <DeviceStatusCluster />
      </div>
      <div className="flex items-center gap-2 md:gap-3 shrink-0">
        <DateRangePicker />
        <ThemeToggle />
      </div>
    </header>
  );
}
