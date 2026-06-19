import type { NormalizedDailySummary } from '@vcc/shared';

export const SLEEP_TARGET_HOURS = 8;

/** Stage colors — warm brand teal/emerald for restorative stages, soft ink for awake. */
export const STAGE_COLOR = {
  deep: 'var(--signal)', // brand teal — deepest, most restorative
  rem: 'var(--info)', // calm blue — dreaming
  light: 'var(--chart-neutral)', // soft neutral — light sleep
  awake: 'var(--ink-mute)',
} as const;

export type StageKey = keyof typeof STAGE_COLOR;

export const STAGE_LABEL: Record<StageKey, string> = {
  deep: 'Deep',
  rem: 'REM',
  light: 'Light',
  awake: 'Awake',
};

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export interface SleepNight {
  date: string;
  total: number | null;
  deep: number | null;
  rem: number | null;
  light: number | null;
  awake: number;
}

/** Per-day sleep stage hours from the Fitbit daily row, ascending by date. */
export function toSleepSeries(daily: NormalizedDailySummary[]): SleepNight[] {
  return [...daily]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const fb = d.fitbit;
      const total = num(fb?.sleepHours) ?? num(d.consensus.sleepHours);
      const deep = num(fb?.deepHours);
      const rem = num(fb?.remHours);
      const light = num(fb?.lightHours);
      const staged = (deep ?? 0) + (rem ?? 0) + (light ?? 0);
      const awake = total != null ? Math.max(0, total - staged) : 0;
      return { date: d.date, total, deep, rem, light, awake };
    });
}

/**
 * Derived sleep quality — there is no Fitbit "sleep score" in this source, so we
 * approximate from duration adequacy and restorative-stage share (deep + rem vs
 * total). Returns 0..100 or null when there isn't enough to judge.
 */
export function deriveQuality(night: SleepNight): number | null {
  if (night.total == null || night.total <= 0) return null;
  const durationScore = Math.min(1, night.total / SLEEP_TARGET_HOURS);
  const restorative = (night.deep ?? 0) + (night.rem ?? 0);
  // Healthy adults land near ~40% deep+rem; treat that as full marks.
  const stageScore = night.total > 0 ? Math.min(1, restorative / night.total / 0.4) : 0;
  return Math.round((durationScore * 0.6 + stageScore * 0.4) * 100);
}

export function qualityLabel(score: number | null): string {
  if (score == null) return 'no data yet';
  if (score >= 80) return 'restful night';
  if (score >= 60) return 'decent rest';
  return 'a bit short';
}
