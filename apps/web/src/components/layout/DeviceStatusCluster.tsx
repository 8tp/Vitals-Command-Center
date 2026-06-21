import { useEffect } from 'react';
import { DEVICE_LABEL, DEVICE_SOURCES, type DeviceSource } from '@vcc/shared';
import { useHealthStore } from '../../stores/healthStore.js';
import { useUiStore } from '../../stores/uiStore.js';

const DEVICE_COLOR: Record<DeviceSource, string> = {
  fitbit: 'var(--device-fitbit)',
  whoop: 'var(--device-whoop)',
  oura: 'var(--device-oura)',
  apple: 'var(--device-apple)',
};

/**
 * Connected-device chip for the rail foot. Shows a STATIC dot per connected
 * (enabled) source — no flashing. The /api/devices/status endpoint already
 * filters to enabled wearables, so a disabled device never appears as "offline".
 */
export function DeviceStatusCluster() {
  const ds = useHealthStore((s) => s.deviceStatus);
  const fetchAll = useHealthStore((s) => s.fetchAll);
  const range = useUiStore((s) => s.range);

  // The rail is always mounted; ensure device status loads even on pages that
  // don't otherwise fetch health data (e.g. Habits), so the chip is consistent.
  useEffect(() => {
    if (!ds) void fetchAll(range);
  }, [ds, fetchAll, range]);

  const statuses = ds?.statuses ?? [];

  const connected = DEVICE_SOURCES.filter((s) =>
    statuses.some((st) => st.source === s && st.connected),
  );

  if (connected.length === 0) {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-[11px] bg-bg-surface2 text-[12.5px] font-medium text-ink-mute">
        <span className="w-[7px] h-[7px] rounded-full bg-ink-mute/50 shrink-0" />
        No device syncing
      </div>
    );
  }

  const single = connected.length === 1 ? connected[0]! : null;

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-[11px] bg-bg-surface2 text-[12.5px] font-medium text-ink-dim"
      title={connected.map((s) => DEVICE_LABEL[s]).join(' · ')}
    >
      <span className="flex items-center gap-1 shrink-0">
        {connected.map((s) => (
          <span key={s} className="w-[7px] h-[7px] rounded-full" style={{ background: DEVICE_COLOR[s] }} />
        ))}
      </span>
      <span className="truncate">
        {single ? `${DEVICE_LABEL[single]} · connected` : `${connected.length} devices connected`}
      </span>
    </div>
  );
}
