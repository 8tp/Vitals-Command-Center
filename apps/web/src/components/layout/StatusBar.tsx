import { useHealthData } from '../../hooks/useHealthData.js';
import { fmtNum } from '../../lib/formatters.js';
import {
  deriveReadiness,
  READINESS_TONE_VAR,
  READINESS_TONE_SOFT,
  READINESS_STATE_LABEL,
} from '../../lib/readiness.js';

export function StatusBar() {
  const { daily, loading } = useHealthData();
  const today = daily[0];
  const readiness = deriveReadiness(daily);
  const tone = READINESS_TONE_VAR[readiness.tone];
  const toneSoft = READINESS_TONE_SOFT[readiness.tone];

  return (
    <div className="h-10 flex items-center justify-between px-5 md:px-6 border-b border-hairline bg-bg-base text-xs">
      <div className="flex items-center gap-3">
        <span className="label-micro text-ink-mute">Status</span>
        <span className="pill" style={{ color: tone, background: toneSoft }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone }} />
          {READINESS_STATE_LABEL[readiness.state]}
          {readiness.score != null && <span className="num ml-1 font-bold">{readiness.score}</span>}
        </span>
        {today && (
          <div className="hidden md:flex items-center gap-4 ml-3">
            <Stat label="HRV" value={readiness.inputs.hrv.value} unit="ms" />
            <Stat label="RHR" value={readiness.inputs.rhr.value} unit="bpm" />
            <Stat label="Sleep" value={readiness.inputs.sleep.value} unit="h" digits={1} />
          </div>
        )}
      </div>
      {loading && <span className="label-micro text-ink-mute animate-pulse">Syncing…</span>}
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  digits = 0,
}: {
  label: string;
  value: number | null;
  unit: string;
  digits?: number;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-ink-mute font-medium">{label}</span>
      <span className="num text-ink font-semibold">{fmtNum(value, digits)}</span>
      <span className="text-ink-mute num">{unit}</span>
    </span>
  );
}
