import { DEVICE_COLOR, type DeviceSource } from '@vcc/shared';

export const DEVICE_HEX = DEVICE_COLOR;

/**
 * Readiness / signal scale — the design system's state colors.
 * mint (good) -> amber (attention) -> alert (low). Blue is neutral info.
 */
export const SIGNAL_HEX = {
  signal: '#2dd4bf',
  warn: '#fbbf24',
  alert: '#fb7185',
  info: '#60a5fa',
} as const;

/** Insight severity (green/amber/red/blue) mapped onto the signal scale. */
export const SEVERITY_HEX = {
  green: SIGNAL_HEX.signal,
  amber: SIGNAL_HEX.warn,
  red: SIGNAL_HEX.alert,
  blue: SIGNAL_HEX.info,
} as const;

/** Theme-aware severity colors (CSS vars) — AA on both light and dark. */
export const SEVERITY_VAR = {
  green: 'var(--signal)',
  amber: 'var(--warn)',
  red: 'var(--alert)',
  blue: 'var(--info)',
} as const;

export const SEVERITY_SOFT_VAR = {
  green: 'var(--signal-soft)',
  amber: 'var(--warn-soft)',
  red: 'var(--alert-soft)',
  blue: 'var(--info-soft)',
} as const;

/** Ink — used for consensus / neutral lines in charts. */
export const INK_HEX = '#eaeef3';
export const INK_DIM_HEX = '#9ba7b6';
/** Consensus / neutral chart ink, theme-aware. */
export const CONSENSUS_COLOR = 'var(--ink)';

/**
 * CSS-variable handles for theme-driven series colors. Recharts accepts
 * `var(--x)` strings for SVG `fill`/`stroke` and for inline tooltip styles,
 * so charts re-skin automatically when the theme flips.
 */
export const VAR = {
  signal: 'var(--signal)',
  warn: 'var(--warn)',
  alert: 'var(--alert)',
  info: 'var(--info)',
  ink: 'var(--ink)',
  inkDim: 'var(--ink-dim)',
  inkMute: 'var(--ink-mute)',
  neutral: 'var(--chart-neutral)',
  deviceFitbit: 'var(--device-fitbit)',
  deviceWhoop: 'var(--device-whoop)',
  deviceOura: 'var(--device-oura)',
  deviceApple: 'var(--device-apple)',
} as const;

/**
 * Shared Recharts chrome. Values are CSS variables (defined per-theme in
 * tokens.css) so every chart reads from one source and adapts to light/dark.
 */
export const CHART = {
  grid: 'var(--chart-grid)',
  axis: 'var(--chart-axis)',
  tick: 'var(--chart-tick)',
  tooltipBg: 'var(--chart-tooltip-bg)',
  tooltipBorder: 'var(--chart-tooltip-border)',
  tooltipInk: 'var(--ink)',
  cursor: 'var(--chart-cursor)',
  font: 'Plus Jakarta Sans',
} as const;

export function deviceTextClass(source: DeviceSource): string {
  return {
    fitbit: 'text-device-fitbit',
    whoop: 'text-device-whoop',
    oura: 'text-device-oura',
    apple: 'text-device-apple',
  }[source];
}

export function deviceBgClass(source: DeviceSource): string {
  return {
    fitbit: 'bg-device-fitbit/10',
    whoop: 'bg-device-whoop/10',
    oura: 'bg-device-oura/10',
    apple: 'bg-device-apple/10',
  }[source];
}

export function deviceDotClass(source: DeviceSource): string {
  return {
    fitbit: 'bg-device-fitbit',
    whoop: 'bg-device-whoop',
    oura: 'bg-device-oura',
    apple: 'bg-device-apple',
  }[source];
}
