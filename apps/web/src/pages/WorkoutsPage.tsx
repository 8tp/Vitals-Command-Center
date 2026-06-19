import { useHealthData } from '../hooks/useHealthData.js';
import { ActivitySummary } from '../components/activity/ActivitySummary.js';
import { StepsTrend } from '../components/activity/StepsTrend.js';
import { EnergyBalance } from '../components/activity/EnergyBalance.js';
import { StravaPanel } from '../components/activity/StravaPanel.js';

// Route stays /workouts; content is repurposed as "Activity" (steps, energy).
// Runs/cardio now live in Strava, so /api/workouts is intentionally unused here.
export default function WorkoutsPage() {
  const { daily } = useHealthData();
  return (
    <div className="space-y-4">
      <ActivitySummary daily={daily} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StepsTrend daily={daily} />
        <EnergyBalance daily={daily} />
      </div>
      <StravaPanel />
    </div>
  );
}
