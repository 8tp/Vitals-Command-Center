import { IconCheck } from '../shared/icons.js';

/**
 * Shown when the in-app Anthropic API (`/api/ask`) isn't configured. The daily
 * brief is generated automatically, and anything deeper is best asked through the
 * claude.ai connector, which can read this dashboard's data plus Strava.
 */
export function AskEmptyState() {
  return (
    <div className="card p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink">Ask about your health</h2>
        <p className="text-sm text-ink-mute mt-0.5">In-app questions aren't switched on right now.</p>
      </div>

      <p className="text-sm text-ink-dim leading-relaxed">
        That's okay — you don't need it for day-to-day use. Here's how to get answers in the meantime.
      </p>

      <ul className="space-y-4">
        <Point title="Your daily brief is automatic">
          A readiness brief is written for you each morning and shown on your dashboard — no prompt needed.
        </Point>
        <Point title="Deeper questions go to claude.ai">
          For follow-ups — trends, "why is my HRV down", or run analysis from Strava — ask the claude.ai
          connector. It can read this dashboard's data and your Strava activities.
        </Point>
      </ul>

      <div className="rounded-2xl bg-info-soft px-4 py-3 text-sm text-ink-dim leading-relaxed">
        To turn on in-app questions, add an Anthropic API key for the server. Until then this page stays
        read-only by design.
      </div>
    </div>
  );
}

function Point({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-signal-soft text-signal" aria-hidden>
        <IconCheck size={12} strokeWidth={3} />
      </span>
      <div>
        <div className="text-sm font-medium text-ink">{title}</div>
        <div className="text-sm text-ink-dim leading-relaxed mt-0.5">{children}</div>
      </div>
    </li>
  );
}
