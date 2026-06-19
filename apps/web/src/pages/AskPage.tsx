import { AskClaude } from '../components/ask/AskClaude.js';
import { AskEmptyState } from '../components/ask/AskEmptyState.js';
import { useConfigStatus } from '../hooks/useConfigStatus.js';

export default function AskPage() {
  const config = useConfigStatus();

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {config?.claudeApiConfigured ? <AskClaude /> : <AskEmptyState />}
    </div>
  );
}
