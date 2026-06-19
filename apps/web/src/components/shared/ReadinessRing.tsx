/*
 * ReadinessRing — the friendly progress ring at the heart of the dashboard.
 *
 * A soft circular track with a rounded-cap stroke that sweeps from the top,
 * filled with the teal→emerald brand gradient (or the readiness tone color),
 * and a large friendly number centered. NOT a ticked instrument gauge.
 *
 * Exported for the dashboard agent. Theme-aware (uses CSS vars). Animates the
 * sweep on mount, respecting prefers-reduced-motion (via the .ring-anim class).
 */
import { useId } from 'react';
import type { ReactNode } from 'react';

export type RingTone = 'signal' | 'warn' | 'alert' | 'info' | 'mute' | 'brand';

export interface ReadinessRingProps {
  /** 0–100 progress. null renders an empty track (no fill). */
  value: number | null;
  /**
   * Color of the progress stroke.
   *  - 'brand' (default): teal→emerald gradient
   *  - 'signal' | 'warn' | 'alert' | 'info' | 'mute': solid tone color
   */
  tone?: RingTone;
  /** Pixel diameter of the ring. Default 200. */
  size?: number;
  /** Stroke thickness in px. Default scales with size (~9% of size). */
  thickness?: number;
  /** Big centered value. Defaults to the rounded `value` (or "—"). */
  label?: ReactNode;
  /** Small caption under the value (e.g. state word "Primed"). */
  sublabel?: ReactNode;
  /** Show the faint background track. Default true. */
  showTrack?: boolean;
  /** Animate the sweep on mount. Default true (respects reduced-motion). */
  animate?: boolean;
  /** Accessible label; falls back to "Readiness <value> of 100". */
  ariaLabel?: string;
  className?: string;
}

const TONE_VAR: Record<Exclude<RingTone, 'brand'>, string> = {
  signal: 'var(--signal)',
  warn: 'var(--warn)',
  alert: 'var(--alert)',
  info: 'var(--info)',
  mute: 'var(--ink-mute)',
};

export function ReadinessRing({
  value,
  tone = 'brand',
  size = 200,
  thickness,
  label,
  sublabel,
  showTrack = true,
  animate = true,
  ariaLabel,
  className,
}: ReadinessRingProps) {
  const gradId = useId();
  const stroke = thickness ?? Math.max(8, Math.round(size * 0.09));
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const target = circumference * (1 - pct / 100);

  const strokeColor = tone === 'brand' ? `url(#${gradId})` : TONE_VAR[tone];
  const displayLabel = label ?? (value == null ? '—' : Math.round(value));

  return (
    <div
      className={className}
      style={{ position: 'relative', width: size, height: size }}
      role="img"
      aria-label={ariaLabel ?? `Readiness ${value == null ? 'no data' : `${Math.round(value)} of 100`}`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        /* rotate so the stroke starts at 12 o'clock and sweeps clockwise */
        style={{ transform: 'rotate(-90deg)' }}
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--brand-from)" />
            <stop offset="100%" stopColor="var(--brand-to)" />
          </linearGradient>
        </defs>

        {showTrack && (
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="var(--surface-inset)"
            strokeWidth={stroke}
          />
        )}

        {value != null && (
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={strokeColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={animate ? circumference : target}
            className={animate ? 'ring-anim' : undefined}
            style={
              animate
                ? ({
                    '--ring-len': `${circumference}`,
                    '--ring-target': `${target}`,
                  } as React.CSSProperties)
                : undefined
            }
          />
        )}
      </svg>

      {/* Centered friendly number + caption */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: 2,
        }}
      >
        <span
          className="num"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            lineHeight: 1,
            fontSize: Math.round(size * 0.3),
            color: 'var(--ink)',
            letterSpacing: '-0.02em',
          }}
        >
          {displayLabel}
        </span>
        {sublabel != null && (
          <span
            style={{
              fontSize: Math.max(11, Math.round(size * 0.075)),
              fontWeight: 600,
              color: 'var(--ink-dim)',
            }}
          >
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}
