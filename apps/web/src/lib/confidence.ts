import { CONFIDENCE_FILL, type ConfidenceLevel } from '@vcc/shared';

export function confidenceLabel(level: ConfidenceLevel): string {
  switch (level) {
    case 'HIGH':
      return 'High';
    case 'MEDIUM':
      return 'Med';
    case 'LOW':
      return 'Low';
    case 'NONE':
      return 'None';
  }
}

export function confidenceColorHex(level: ConfidenceLevel): string {
  switch (level) {
    case 'HIGH':
      return '#2dd4bf'; // signal
    case 'MEDIUM':
      return '#60a5fa'; // info
    case 'LOW':
      return '#fbbf24'; // warn
    case 'NONE':
      return '#6b7888'; // ink-mute
  }
}

/** Theme-aware confidence color as a CSS variable (preferred for on-surface UI). */
export function confidenceColorVar(level: ConfidenceLevel): string {
  switch (level) {
    case 'HIGH':
      return 'var(--signal)';
    case 'MEDIUM':
      return 'var(--info)';
    case 'LOW':
      return 'var(--warn)';
    case 'NONE':
      return 'var(--ink-mute)';
  }
}

export function confidenceSoftVar(level: ConfidenceLevel): string {
  switch (level) {
    case 'HIGH':
      return 'var(--signal-soft)';
    case 'MEDIUM':
      return 'var(--info-soft)';
    case 'LOW':
      return 'var(--warn-soft)';
    case 'NONE':
      return 'var(--hairline)';
  }
}

export function confidenceFillPct(level: ConfidenceLevel): number {
  return Math.round(CONFIDENCE_FILL[level] * 100);
}
