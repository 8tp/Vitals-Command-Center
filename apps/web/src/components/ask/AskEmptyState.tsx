import { useHealthData } from '../../hooks/useHealthData.js';
import { deriveReadiness } from '../../lib/readiness.js';
import { ClaudeSetupPanel } from '../shared/ClaudeSetupPanel.js';
import { AskGreeting, GROUNDING_NOTE } from './AskShell.js';
import { IconCheck } from '../shared/icons.js';

/**
 * Graceful fallback shown when the in-app Anthropic API (`/api/ask`) isn't
 * configured. Same warm greeting header as the live chat, then an explanation
 * that the daily brief is automatic and deeper questions go to claude.ai —
 * followed by the MCP setup panel for wiring Claude Desktop to the local server.
 */
export function AskEmptyState() {
  const { daily } = useHealthData();
  const readiness = deriveReadiness(daily);

  return (
    <div className="pt-9 sm:pt-10 pb-[max(2rem,env(safe-area-inset-bottom))] space-y-7">
      <header className="animate-fade-rise">
        <AskGreeting readiness={readiness} />
      </header>

      <div className="animate-fade-rise space-y-5">
        <p className="text-[14.5px] text-ink-dim leading-relaxed">
          In-app chat isn't switched on right now — and you don't need it for day-to-day use. Here's how
          to get answers in the meantime.
        </p>

        <ul className="space-y-4">
          <Point title="Your daily brief is automatic">
            A readiness brief is written for you each morning and shown on your dashboard — no prompt
            needed.
          </Point>
          <Point title="Deeper questions go to claude.ai">
            For follow-ups — trends, “why is my HRV down”, or run analysis from Strava — ask the claude.ai
            connector. It can read this dashboard's data and your Strava activities.
          </Point>
        </ul>

        <ClaudeSetupPanel />

        <p className="text-[11px] text-ink-mute">{GROUNDING_NOTE}</p>
      </div>
    </div>
  );
}

function Point({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"
        aria-hidden
      >
        <IconCheck size={12} strokeWidth={3} />
      </span>
      <div>
        <div className="text-[14px] font-semibold text-ink">{title}</div>
        <div className="text-[13.5px] text-ink-dim leading-relaxed mt-0.5">{children}</div>
      </div>
    </li>
  );
}
