import { useState } from 'react';
import { useConfigStatus } from '../../hooks/useConfigStatus.js';
import { IconCopy, IconCheck } from './icons.js';

/**
 * When the direct Anthropic API isn't configured, this panel tells the user how
 * to wire Claude Desktop to the local MCP server instead — copy one JSON blob,
 * restart Claude, ask for a briefing. The MCP save_briefing tool round-trips the
 * generated briefing back into the dashboard.
 *
 * Designed to be dropped into any surface that would otherwise call the direct
 * API (InsightsPanel, AskPage).
 */
export function ClaudeSetupPanel({ variant = 'full' }: { variant?: 'full' | 'inline' }) {
  const status = useConfigStatus();
  const [copied, setCopied] = useState(false);

  if (!status) return null;

  const snippet = status.mcp.claudeDesktopConfig.snippet;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API can fail in non-secure contexts; fall through silently.
    }
  };

  return (
    <div className="instrument p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-display font-bold text-base text-ink">Use your own Claude subscription</div>
        <span className="pill bg-bg-inset text-ink-dim">MCP · stdio</span>
      </div>

      <p className="text-sm text-ink-dim leading-relaxed">
        Skip the Anthropic API. Connect <strong className="text-ink">Claude Desktop</strong> to the
        local MCP server and ask it for a briefing in chat — your existing Claude.ai or Max subscription
        covers it. The briefing is saved back to this dashboard automatically.
      </p>

      {variant === 'full' && (
        <ol className="list-decimal pl-5 text-sm text-ink-dim space-y-1">
          <li>
            Install{' '}
            <a
              className="text-info hover:underline"
              href="https://claude.ai/download"
              target="_blank"
              rel="noreferrer"
            >
              Claude Desktop
            </a>
            .
          </li>
          <li>
            Open{' '}
            <code className="num text-xs bg-bg-inset px-1 py-0.5 rounded">
              ~/Library/Application Support/Claude/claude_desktop_config.json
            </code>{' '}
            (create it if missing).
          </li>
          <li>Paste the block below. Save.</li>
          <li>Quit + relaunch Claude Desktop. The server shows up in the tool list.</li>
          <li>
            Ask Claude <em>“give me today’s vitals briefing”</em>. It will call{' '}
            <code className="num text-xs bg-bg-inset px-1 py-0.5 rounded">get_full_context</code>
            , compose the briefing, and call{' '}
            <code className="num text-xs bg-bg-inset px-1 py-0.5 rounded">save_briefing</code>{' '}
            — this panel refreshes with the result.
          </li>
        </ol>
      )}

      <div className="relative">
        <pre className="bg-bg-inset border border-hairline rounded-sm p-3 text-xs num text-ink overflow-x-auto scrollbar-thin max-h-64">
          {snippet}
        </pre>
        <button
          onClick={copy}
          className="absolute top-2 right-2 pill pill-tap bg-bg-surface2 border border-hairline hover:border-hairline-strong text-ink-dim"
        >
          {copied ? <IconCheck size={13} className="text-signal" /> : <IconCopy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {status.mcp.paths.mode === 'dev' && (
        <div className="text-2xs num text-ink-mute">
          Config resolved against <code>src/</code> via tsx (no build required). Run{' '}
          <code className="text-ink-dim">npm run build --workspace apps/mcp-server</code> once
          if you'd rather point Claude Desktop at the compiled <code>dist/</code> for faster cold starts.
        </div>
      )}
    </div>
  );
}
