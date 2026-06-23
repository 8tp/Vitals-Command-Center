import { useId, useLayoutEffect, useRef, useState } from 'react';

interface SparklineProps {
  /** Oldest → newest values. nulls create gaps but the line bridges them. */
  values: (number | null)[];
  /** Per-point labels (e.g. ISO dates), aligned with `values`. Enables hover. */
  labels?: string[];
  /** Optional dashed reference line (e.g. baseline / goal). */
  baseline?: number | null;
  /** Pixel height of the rendered SVG. Width is fluid. Default 120. */
  height?: number;
  /** Stroke color. Default electric-blue accent. */
  color?: string;
  /** Show the filled area under the line. Default true. */
  fill?: boolean;
  /** Mark the latest point when not hovering. Default true. */
  marker?: boolean;
  /** Format a value for the hover tooltip. */
  format?: (v: number) => string;
  /** Format a label for the hover tooltip. */
  formatLabel?: (s: string) => string;
  className?: string;
}

/**
 * A calm single-line area chart. Rendered at its real measured pixel width (so
 * strokes and the marker stay round — no preserveAspectRatio stretching), with
 * an optional per-point hover tooltip + guide line for reading individual days.
 */
export function Sparkline({
  values,
  labels,
  baseline = null,
  height = 120,
  color = 'var(--accent)',
  fill = true,
  marker = true,
  format,
  formatLabel,
  className,
}: SparklineProps) {
  const id = useId().replace(/:/g, '');
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  // Track the real rendered width so the SVG coordinate system is 1:1 with
  // pixels — no horizontal stretching of the stroke or marker.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width ?? 0;
      if (cw > 0) setW(Math.round(cw));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
  // Until measured (w===0) render an empty box of the right height to avoid a flash.
  if (finite.length < 2 || w === 0) {
    return <div ref={wrapRef} className={className} style={{ height }} aria-hidden />;
  }

  const padX = 5;
  const padY = 10;
  const lo = Math.min(...finite, baseline ?? Infinity);
  const hi = Math.max(...finite, baseline ?? -Infinity);
  const span = hi - lo || 1;
  const yOf = (v: number) => padY + (1 - (v - lo) / span) * (height - padY * 2);
  const xOf = (i: number) => padX + (i / Math.max(1, values.length - 1)) * (w - padX * 2);

  const pts: { x: number; y: number; i: number; v: number }[] = [];
  values.forEach((v, i) => {
    if (v != null && Number.isFinite(v)) pts.push({ x: xOf(i), y: yOf(v), i, v });
  });
  const line = pts.map((p, k) => `${k === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1]!.x.toFixed(1)},${height} L${pts[0]!.x.toFixed(1)},${height} Z`;
  const last = pts[pts.length - 1]!;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    let best = pts[0]!;
    let bestD = Infinity;
    for (const p of pts) {
      const d = Math.abs(p.x - x);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    setActive(best.i);
  };

  const activePt = active != null ? pts.find((p) => p.i === active) ?? null : null;
  const tipLeft = activePt ? Math.min(Math.max(activePt.x, 38), w - 38) : 0;

  return (
    <div ref={wrapRef} className={className} style={{ position: 'relative' }}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${w} ${height}`}
        style={{ display: 'block', overflow: 'visible', touchAction: 'pan-y' }}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setActive(null)}
      >
        <defs>
          <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.16" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {baseline != null && Number.isFinite(baseline) && (
          <line x1="0" y1={yOf(baseline)} x2={w} y2={yOf(baseline)} stroke="var(--chart-neutral)" strokeWidth="1" strokeDasharray="4 5" />
        )}
        {fill && <path d={area} fill={`url(#spark-${id})`} />}
        <path d={line} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        {activePt ? (
          <>
            <line x1={activePt.x} y1="0" x2={activePt.x} y2={height} stroke="var(--chart-neutral)" strokeWidth="1" />
            <circle cx={activePt.x} cy={activePt.y} r="4" fill="var(--surface)" stroke={color} strokeWidth="2.4" />
          </>
        ) : (
          marker && <circle cx={last.x} cy={last.y} r="3.6" fill="var(--surface)" stroke={color} strokeWidth="2.4" />
        )}
      </svg>
      {activePt && (
        <div
          className="pointer-events-none absolute -top-1 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg px-2.5 py-1.5 text-center"
          style={{
            left: tipLeft,
            background: 'var(--surface)',
            boxShadow: 'var(--shadow-card), inset 0 0 0 1px var(--hairline)',
          }}
        >
          {labels?.[activePt.i] && (
            <div className="meta-mono leading-none mb-1">
              {formatLabel ? formatLabel(labels[activePt.i]!) : labels[activePt.i]}
            </div>
          )}
          <div className="num text-[13px] font-semibold leading-none text-ink">
            {format ? format(activePt.v) : activePt.v}
          </div>
        </div>
      )}
    </div>
  );
}
