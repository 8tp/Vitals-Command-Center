import { useId } from 'react';

interface SparklineProps {
  /** Oldest → newest values. nulls create gaps but are interpolated for the line. */
  values: (number | null)[];
  /** Optional dashed reference line (e.g. baseline / goal). */
  baseline?: number | null;
  /** Pixel height of the rendered SVG. Width is fluid. Default 120. */
  height?: number;
  /** Stroke color. Default electric-blue accent. */
  color?: string;
  /** Show the filled area under the line. Default true. */
  fill?: boolean;
  /** Mark the latest point. Default true. */
  marker?: boolean;
  className?: string;
}

const W = 360;

/**
 * A calm single-line area sparkline on a near-invisible grid — the Instrument
 * chart vocabulary. Fluid width, fixed height; values map oldest→newest L→R.
 */
export function Sparkline({
  values,
  baseline = null,
  height = 120,
  color = 'var(--accent)',
  fill = true,
  marker = true,
  className,
}: SparklineProps) {
  const id = useId().replace(/:/g, '');
  const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (finite.length < 2) {
    return <div className={className} style={{ height }} aria-hidden />;
  }

  const pad = 10;
  const lo = Math.min(...finite, baseline ?? Infinity);
  const hi = Math.max(...finite, baseline ?? -Infinity);
  const span = hi - lo || 1;
  const yOf = (v: number) => pad + (1 - (v - lo) / span) * (height - pad * 2);
  const xOf = (i: number) => (i / (values.length - 1)) * W;

  // Build the line through finite points (skip nulls, keep index spacing).
  const pts: { x: number; y: number }[] = [];
  values.forEach((v, i) => {
    if (v != null && Number.isFinite(v)) pts.push({ x: xOf(i), y: yOf(v) });
  });
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1]!.x.toFixed(1)},${height} L${pts[0]!.x.toFixed(1)},${height} Z`;
  const last = pts[pts.length - 1]!;

  return (
    <svg
      className={className}
      width="100%"
      height={height}
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.16" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {baseline != null && Number.isFinite(baseline) && (
        <line x1="0" y1={yOf(baseline)} x2={W} y2={yOf(baseline)} stroke="var(--chart-neutral)" strokeWidth="1" strokeDasharray="4 5" />
      )}
      {fill && <path d={area} fill={`url(#spark-${id})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      {marker && <circle cx={last.x} cy={last.y} r="3.6" fill="var(--surface)" stroke={color} strokeWidth="2.4" />}
    </svg>
  );
}
