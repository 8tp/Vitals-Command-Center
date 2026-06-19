import { DEVICE_LABEL, DEVICE_SOURCES, type DeviceSource } from '@vcc/shared';
import { useDeviceStatus } from '../../hooks/useDeviceStatus.js';
import { DeviceDot } from '../shared/DeviceDot.js';

/**
 * Multi-device status in the header. Shows a dot per connected source (Fitbit,
 * WHOOP, Oura, Apple) with a short label, and degrades to a single "no sync"
 * pill when nothing is reporting. Replaces the old single Fitbit pill.
 */
export function DeviceStatusCluster() {
  const ds = useDeviceStatus();
  const statuses = ds?.statuses ?? [];

  const bySource = new Map<DeviceSource, boolean>();
  for (const s of statuses) {
    const src = s.source as DeviceSource;
    if ((DEVICE_SOURCES as readonly string[]).includes(src)) {
      bySource.set(src, s.connected);
    }
  }

  const connected = DEVICE_SOURCES.filter((s) => bySource.get(s));

  if (connected.length === 0) {
    return (
      <span
        className="hidden sm:inline-flex pill border border-hairline ml-1"
        title="No tracker syncing"
      >
        <DeviceDot source="fitbit" active={false} size="xs" />
        <span className="text-ink-mute">No sync</span>
      </span>
    );
  }

  // Multiple sources: compact dot cluster + count. Single source: dot + label.
  if (connected.length === 1) {
    const s = connected[0]!;
    return (
      <span
        className="hidden sm:inline-flex pill border border-hairline ml-1"
        title={`${DEVICE_LABEL[s]} connected`}
      >
        <DeviceDot source={s} size="xs" />
        <span className="text-ink-dim">{shortLabel(s)}</span>
      </span>
    );
  }

  return (
    <span
      className="hidden sm:inline-flex items-center gap-1.5 pill border border-hairline ml-1"
      title={connected.map((s) => DEVICE_LABEL[s]).join(' · ')}
    >
      <span className="flex items-center gap-1">
        {connected.map((s) => (
          <DeviceDot key={s} source={s} size="xs" title={DEVICE_LABEL[s]} />
        ))}
      </span>
      <span className="text-ink-dim">{connected.length} devices</span>
    </span>
  );
}

function shortLabel(s: DeviceSource): string {
  return { fitbit: 'Fitbit', whoop: 'Whoop', oura: 'Oura', apple: 'Apple' }[s];
}
