/*
 * Unit formatting. The DB + API are ALWAYS metric (km, °C); this layer converts
 * for display based on the user's Metric/Imperial preference (see unitsStore).
 * Unit-agnostic metrics (HRV ms, RHR bpm, SpO₂ %, steps, calories, hours) don't
 * pass through here — only distance, pace, and temperature differ by system.
 */
export type Units = 'metric' | 'imperial';

const KM_PER_MI = 1.609344;

export function distanceUnit(units: Units): string {
  return units === 'imperial' ? 'mi' : 'km';
}

/** Distance from kilometres → {value, unit} in the chosen system. */
export function fmtDistance(
  km: number | null | undefined,
  units: Units,
  digits = 2,
): { value: string; unit: string } {
  const unit = distanceUnit(units);
  if (km == null || !Number.isFinite(km)) return { value: '—', unit };
  const v = units === 'imperial' ? km / KM_PER_MI : km;
  return { value: v.toFixed(digits), unit };
}

/** Pace (mm:ss per km/mi) from a duration + distance, or null if no distance. */
export function paceFor(
  durationMinutes: number,
  distanceKm: number | null | undefined,
  units: Units,
): { value: string; unit: string } | null {
  if (distanceKm == null || distanceKm <= 0) return null;
  const dist = units === 'imperial' ? distanceKm / KM_PER_MI : distanceKm;
  const secPer = (durationMinutes * 60) / dist;
  if (!Number.isFinite(secPer) || secPer <= 0) return null;
  let m = Math.floor(secPer / 60);
  let s = Math.round(secPer % 60);
  if (s === 60) {
    m += 1;
    s = 0;
  }
  return { value: `${m}:${s.toString().padStart(2, '0')}`, unit: units === 'imperial' ? '/mi' : '/km' };
}

/**
 * A temperature *delta* (e.g. skin temp vs baseline). A Celsius delta scales by
 * 9/5 to a Fahrenheit delta (no +32 offset — it's a difference, not a reading).
 */
export function fmtTempDelta(
  celsius: number | null | undefined,
  units: Units,
): { value: string; unit: string } {
  const unit = units === 'imperial' ? '°F' : '°C';
  if (celsius == null || !Number.isFinite(celsius)) return { value: '—', unit };
  const v = units === 'imperial' ? celsius * (9 / 5) : celsius;
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return { value: `${sign}${Math.abs(v).toFixed(1)}`, unit };
}
