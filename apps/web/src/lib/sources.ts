import {
  DEVICE_SOURCES,
  type DeviceSource,
  type NormalizedDailySummary,
} from '@vcc/shared';

/** Which sources actually contributed a row for this day, in canonical order. */
export function activeSources(day: NormalizedDailySummary | undefined): DeviceSource[] {
  if (!day) return [];
  return DEVICE_SOURCES.filter((s) => day[s] != null);
}

/** Per-source value of a shared metric (hrv | rhr | sleepHours) for one day. */
export function perSource(
  day: NormalizedDailySummary | undefined,
  metric: 'hrv' | 'rhr' | 'sleepHours',
): Array<{ source: DeviceSource; value: number }> {
  if (!day) return [];
  const out: Array<{ source: DeviceSource; value: number }> = [];
  for (const s of DEVICE_SOURCES) {
    const row = day[s];
    if (!row) continue;
    const v = (row as unknown as Record<string, number | null | undefined>)[metric];
    if (v != null && Number.isFinite(v)) out.push({ source: s, value: v });
  }
  return out;
}

/** Sources (with a value for `metric`) for a given day — used for device dots. */
export function sourcesWithMetric(
  day: NormalizedDailySummary | undefined,
  metric: 'hrv' | 'rhr' | 'sleepHours',
): DeviceSource[] {
  return perSource(day, metric).map((r) => r.source);
}
