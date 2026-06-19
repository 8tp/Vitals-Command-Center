import type { NormalizedDailySummary } from '@vcc/shared';
import { SleepHoursTrend } from './SleepHoursTrend.js';
import { SleepStages } from './SleepStages.js';

// Fitbit-only sleep view: duration trend + nightly stage balance.
export function SleepTrends({ daily }: { daily: NormalizedDailySummary[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <SleepHoursTrend daily={daily} />
      <SleepStages daily={daily} />
    </div>
  );
}
