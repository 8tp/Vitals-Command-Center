import { useHealthData } from '../hooks/useHealthData.js';
import { SleepTimeline } from '../components/sleep/SleepTimeline.js';
import { SleepTrends } from '../components/sleep/SleepTrends.js';
import { SleepDebt } from '../components/sleep/SleepDebt.js';

export default function SleepPage() {
  const { daily, sleep } = useHealthData();
  return (
    <div className="space-y-4">
      <SleepDebt daily={daily} />
      <SleepTrends daily={daily} />
      <SleepTimeline sessions={sleep} />
    </div>
  );
}
