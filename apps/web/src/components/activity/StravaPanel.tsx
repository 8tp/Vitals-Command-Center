import { IconActivity } from '../shared/icons.js';

/**
 * Runs and cardio are tracked on the Apple Watch and live in a separate Strava
 * integration — not in this dashboard's database. This panel sets that
 * expectation and points the user at the claude.ai connector for analysis.
 */
export function StravaPanel() {
  return (
    <div className="card p-5">
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-signal-soft text-signal"
          aria-hidden
        >
          <IconActivity size={20} />
        </span>
        <div>
          <h3 className="text-base font-semibold text-ink">Runs &amp; cardio live in Strava</h3>
          <p className="text-sm text-ink-dim leading-relaxed mt-1.5">
            Your Apple Watch runs and cardio sessions sync to <strong className="text-ink">Strava</strong>,
            not to this dashboard. This page covers all-day movement — steps and energy — from your Fitbit.
          </p>
          <p className="text-sm text-ink-dim leading-relaxed mt-2">
            To look at pace, splits, or training load, just ask the{' '}
            <strong className="text-ink">claude.ai Strava connector</strong>. It can pull your recent
            activities, zones, and training plan on request.
          </p>
        </div>
      </div>
    </div>
  );
}
