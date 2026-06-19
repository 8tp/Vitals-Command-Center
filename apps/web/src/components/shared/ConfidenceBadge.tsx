import type { ConfidenceLevel } from '@vcc/shared';
import {
  confidenceColorVar,
  confidenceSoftVar,
  confidenceFillPct,
  confidenceLabel,
} from '../../lib/confidence.js';

interface Props {
  level: ConfidenceLevel;
  inline?: boolean;
}

export function ConfidenceBadge({ level, inline }: Props) {
  const color = confidenceColorVar(level);
  const soft = confidenceSoftVar(level);
  if (inline) {
    return (
      <span className="pill" style={{ backgroundColor: soft, color }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} /> {confidenceLabel(level)}
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2.5">
      <span className="label-micro text-ink-mute">Confidence</span>
      <div className="flex-1 track">
        <div
          className="track-fill"
          style={{ width: `${confidenceFillPct(level)}%`, background: color }}
        />
      </div>
      <span className="text-2xs font-semibold" style={{ color }}>
        {confidenceLabel(level)}
      </span>
    </div>
  );
}
