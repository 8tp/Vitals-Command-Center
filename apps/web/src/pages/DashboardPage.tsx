import { useHealthData } from '../hooks/useHealthData.js';
import { ReadinessHero } from '../components/dashboard/ReadinessHero.js';
import { MetricsGrid } from '../components/dashboard/MetricsGrid.js';
import { HrvChart } from '../components/dashboard/HrvChart.js';
import { SleepArchitecture } from '../components/dashboard/SleepArchitecture.js';
import { ActivityChart } from '../components/dashboard/ActivityChart.js';
import { InsightsPanel } from '../components/dashboard/InsightsPanel.js';

export default function DashboardPage() {
  const { daily, loading, error } = useHealthData();

  if (error) {
    return (
      <div className="card p-5 text-warn text-sm leading-relaxed">
        We couldn't reach your data ({error}). Start the backend with{' '}
        <code className="rounded-md bg-bg-surface2 px-1.5 py-0.5 text-ink-dim">npm run dev:api</code>.
      </div>
    );
  }

  if (loading && daily.length === 0) {
    return (
      <div className="space-y-5">
        <div className="card h-72 animate-pulse opacity-60" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card h-28 animate-pulse opacity-50" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Readiness hero */}
      <ReadinessHero daily={daily} />

      {/* Today's vitals + activity */}
      <MetricsGrid daily={daily} />

      {/* Trends + your daily brief */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-5 md:gap-6">
        <div className="space-y-5 md:space-y-6">
          <HrvChart daily={daily} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-6">
            <SleepArchitecture daily={daily} />
            <ActivityChart daily={daily} />
          </div>
        </div>
        <InsightsPanel />
      </div>
    </div>
  );
}
