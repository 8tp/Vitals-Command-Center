export const DEVICE_SOURCES = ['fitbit', 'whoop', 'oura', 'apple'] as const;
export type DeviceSource = (typeof DEVICE_SOURCES)[number];

export const DEVICE_LABEL: Record<DeviceSource, string> = {
  fitbit: 'Fitbit Air',
  whoop: 'WHOOP MG',
  oura: 'Oura Ring 4',
  apple: 'Apple Watch Ultra 2',
};

// Identity colors — do not change. Referenced by every chart, dot, pill.
export const DEVICE_COLOR: Record<DeviceSource, string> = {
  fitbit: '#00b0b9', // Fitbit teal
  whoop: '#e24b4a',
  oura: '#1d9e75',
  apple: '#378add',
};

export const DEVICE_COLOR_BG: Record<DeviceSource, string> = {
  fitbit: 'rgba(0, 176, 185, 0.10)',
  whoop: 'rgba(226, 75, 74, 0.10)',
  oura: 'rgba(29, 158, 117, 0.10)',
  apple: 'rgba(55, 138, 221, 0.10)',
};

// Per-metric device accuracy ranking. First entry = most trusted source.
// All four wearables are active again (multi-device consensus): Fitbit Air is
// the primary 24/7 vitals device, Oura/WHOOP provide strong sleep + recovery,
// and Apple Watch covers activity/VO2max. Rankings drive the weighted consensus.
export const DEVICE_ACCURACY: Record<string, DeviceSource[]> = {
  sleep_stages: ['fitbit', 'oura', 'whoop', 'apple'],
  hrv: ['fitbit', 'oura', 'whoop', 'apple'],
  rhr: ['fitbit', 'oura', 'whoop', 'apple'],
  steps: ['fitbit', 'apple', 'oura', 'whoop'],
  activity_calories: ['fitbit', 'apple', 'oura', 'whoop'],
  vo2max: ['apple'],
  temperature: ['fitbit', 'oura', 'whoop'],
  strain: ['whoop'],
  recovery: ['whoop', 'oura'],
  readiness: ['oura'],
  respiratory_rate: ['fitbit', 'oura', 'apple', 'whoop'],
  spo2: ['fitbit', 'oura', 'whoop', 'apple'],
};

export function accuracyWeight(metric: string, device: DeviceSource): number {
  const ranked = DEVICE_ACCURACY[metric] ?? DEVICE_SOURCES;
  const idx = ranked.indexOf(device);
  if (idx === -1) return 0;
  // Linear weights: first=1.0, second=0.7, third=0.5.
  return [1.0, 0.7, 0.5][idx] ?? 0.3;
}
