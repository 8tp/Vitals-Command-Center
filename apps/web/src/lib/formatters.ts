import { format, parseISO } from 'date-fns';

export function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

export function fmtPct(v: number | null | undefined, digits = 0, withSign = false): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const sign = withSign && v > 0 ? '+' : '';
  return `${sign}${v.toFixed(digits)}%`;
}

export function fmtDuration(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours)) return '—';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

export function fmtDate(iso: string, pattern = 'EEE, MMM d'): string {
  try {
    return format(parseISO(iso), pattern);
  } catch {
    return iso;
  }
}
