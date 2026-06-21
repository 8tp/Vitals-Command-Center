export interface HypnogramStages {
  /** Minutes per stage. */
  deep: number;
  rem: number;
  light: number;
  awake: number;
}

interface HypnogramProps {
  stages: HypnogramStages;
  /** ISO sleep start (bedtime). */
  startTime?: string | null;
  /** ISO wake time. */
  endTime?: string | null;
  height?: number;
}

/* Lanes top→bottom, matching the wireframe order. */
const LANES = [
  { key: 'awake', label: 'Awake' },
  { key: 'rem', label: 'REM' },
  { key: 'light', label: 'Light' },
  { key: 'deep', label: 'Deep' },
] as const;
type LaneKey = (typeof LANES)[number]['key'];

const W = 1000;
const LABEL_X = 70; // left gutter for lane labels / where the trace begins
const TOP = 10; // y of the first (Awake) lane line
const GAP = 40; // vertical gap between lanes
const laneY: Record<LaneKey, number> = {
  awake: TOP,
  rem: TOP + GAP,
  light: TOP + GAP * 2,
  deep: TOP + GAP * 3,
};

/**
 * A schematic overnight hypnogram. We only have per-stage TOTALS (not epochs),
 * so we synthesize a plausible cyclic descent (light → deep → light → rem …)
 * where the horizontal time spent in each lane is proportional to that stage's
 * minutes. It reads like a real hypnogram while staying honest as a schematic.
 */
export function Hypnogram({ stages, startTime, endTime, height = 168 }: HypnogramProps) {
  const total = stages.deep + stages.rem + stages.light + stages.awake;
  if (!(total > 0)) {
    return <p className="text-[13px] text-ink-mute">No stage data for last night.</p>;
  }

  const order = buildOrder(stages);
  const plotW = W - LABEL_X;
  const pxPerMin = plotW / total;

  // Build the stepped path across the synthesized segments.
  let x = LABEL_X;
  const cmds: string[] = [`M${x.toFixed(1)},${laneY[order[0]!.key]}`];
  for (let i = 0; i < order.length; i++) {
    const seg = order[i]!;
    const y = laneY[seg.key];
    // vertical move into this lane (no-op for the first segment)
    cmds.push(`L${x.toFixed(1)},${y}`);
    x += seg.minutes * pxPerMin;
    cmds.push(`L${x.toFixed(1)},${y}`);
  }
  const path = cmds.join(' ');

  const lineY = [laneY.awake, laneY.rem, laneY.light, laneY.deep];
  const startLabel = clockLabel(startTime);
  const endLabel = clockLabel(endTime);
  const midLabel = midClockLabel(startTime, endTime);

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      style={{ display: 'block', overflow: 'visible' }}
      role="img"
      aria-label="Overnight sleep stages"
    >
      {/* lane labels */}
      <g fontFamily="var(--font-mono, 'Geist Mono', monospace)" fontSize="11" fill="var(--ink-mute)">
        {LANES.map((l) => (
          <text key={l.key} x="0" y={laneY[l.key] + 4}>
            {l.label}
          </text>
        ))}
      </g>
      {/* lane gridlines */}
      <g stroke="var(--hairline)" strokeWidth="1">
        {lineY.map((y) => (
          <line key={y} x1={LABEL_X} y1={y} x2={W} y2={y} />
        ))}
      </g>
      {/* the stepped trace */}
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      {/* time axis */}
      <g fontFamily="var(--font-mono, 'Geist Mono', monospace)" fontSize="10.5" fill="var(--ink-mute)">
        <text x={LABEL_X} y={height - 6}>
          {startLabel}
        </text>
        {midLabel && (
          <text x={(LABEL_X + W) / 2} y={height - 6} textAnchor="middle">
            {midLabel}
          </text>
        )}
        <text x={W} y={height - 6} textAnchor="end">
          {endLabel}
        </text>
      </g>
    </svg>
  );
}

interface Seg {
  key: LaneKey;
  minutes: number;
}

/**
 * Distribute each stage's total minutes across a plausible number of cycles in a
 * canonical descent order, so the trace alternates like a real night while each
 * lane's total width stays exactly proportional to its minutes.
 */
function buildOrder(stages: HypnogramStages): Seg[] {
  // ~90-min cycles; clamp so very short/long nights still look reasonable.
  const totalMin = stages.deep + stages.rem + stages.light + stages.awake;
  const cycles = Math.max(3, Math.min(6, Math.round(totalMin / 90)));

  // Per-cycle minutes for each stage (even split is fine for a schematic).
  const per = {
    deep: stages.deep / cycles,
    rem: stages.rem / cycles,
    light: stages.light / cycles,
    awake: stages.awake / cycles,
  };

  const segs: Seg[] = [];
  const push = (key: LaneKey, minutes: number) => {
    if (minutes > 0) segs.push({ key, minutes });
  };

  for (let c = 0; c < cycles; c++) {
    // descend into sleep, dip to deep, climb back up through REM, brief wake
    push('light', per.light / 2);
    push('deep', per.deep);
    push('light', per.light / 2);
    push('rem', per.rem);
    // sprinkle the awake time as brief mid-night wakes between later cycles
    if (c > 0) push('awake', per.awake / Math.max(1, cycles - 1));
  }
  // Ensure totals are exactly preserved (correct any rounding drift on the
  // dominant `light` stage so widths sum to the real total).
  reconcile(segs, stages);
  return segs.length ? segs : [{ key: 'light', minutes: totalMin }];
}

function reconcile(segs: Seg[], stages: HypnogramStages) {
  (['deep', 'rem', 'light', 'awake'] as LaneKey[]).forEach((k) => {
    const want = stages[k];
    const have = segs.filter((s) => s.key === k).reduce((a, s) => a + s.minutes, 0);
    const drift = want - have;
    if (Math.abs(drift) < 0.01) return;
    const target = segs.find((s) => s.key === k);
    if (target) target.minutes += drift;
  });
}

/* ---- time helpers ---- */
function clockLabel(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}
function midClockLabel(start?: string | null, end?: string | null): string | null {
  if (!start || !end) return null;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return null;
  const mid = new Date(a + (b - a) / 2);
  return mid.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}
