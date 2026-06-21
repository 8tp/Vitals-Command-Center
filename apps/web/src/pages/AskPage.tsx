import { AskClaude } from '../components/ask/AskClaude.js';
import { AskEmptyState } from '../components/ask/AskEmptyState.js';
import { useConfigStatus } from '../hooks/useConfigStatus.js';

/**
 * Ask AI — the AI health-coach chat. Unlike the other (full-bleed, hairline-
 * grouped) pages, this one is a centered conversation column with a sticky
 * composer. When the in-app Anthropic API is configured we render the live
 * streaming chat; otherwise a graceful, on-brand setup fallback.
 */
export default function AskPage() {
  const config = useConfigStatus();

  return (
    <div className="max-w-[780px] mx-auto px-4 sm:px-6">
      {config?.claudeApiConfigured ? <AskClaude /> : <AskEmptyState />}
    </div>
  );
}
