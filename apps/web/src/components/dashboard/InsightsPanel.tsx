import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { InsightItem, BriefingRecord } from '@vcc/shared';
import { apiGet, apiPost } from '../../lib/api.js';
import { Markdown } from '../shared/Markdown.js';
import { ClaudeSetupPanel } from '../shared/ClaudeSetupPanel.js';
import { useConfigStatus } from '../../hooks/useConfigStatus.js';
import { SEVERITY_VAR, SEVERITY_SOFT_VAR } from '../../lib/colors.js';
import { fmtDate } from '../../lib/formatters.js';

interface TodayResp {
  date: string;
  insights: InsightItem[];
  briefing: BriefingRecord | null;
  summary: unknown;
}

/**
 * DAILY BRIEF — the persistent ops-dispatch panel. Renders today's flags
 * (severity-coded) and the markdown briefing styled like a field dispatch:
 * a mono meta line, then clean typographic body.
 */
export function InsightsPanel() {
  const [data, setData] = useState<TodayResp | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const config = useConfigStatus();

  const load = useCallback(() => {
    apiGet<TodayResp>('/api/insights/today')
      .then(setData)
      .catch(() => setData(null));
  }, []);

  useEffect(() => {
    let t: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (t == null) t = setInterval(load, 15_000);
    };
    const stop = () => {
      if (t != null) {
        clearInterval(t);
        t = null;
      }
    };
    // Poll only while the tab is visible; refresh on re-show. Saves battery
    // on the installed PWA instead of polling forever in the background.
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        load();
        start();
      }
    };
    load();
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const briefing = await apiPost<{ date?: string }, BriefingRecord>('/api/insights/generate', {});
      setData((d) => (d ? { ...d, briefing } : d));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }, []);

  const flags = data?.insights ?? [];
  const briefDate = data?.briefing
    ? fmtDate(data.briefing.createdAt.slice(0, 10), 'EEEE, MMM d')
    : fmtDate(data?.date ?? new Date().toISOString().slice(0, 10), 'EEEE, MMM d');
  const briefTime = data?.briefing
    ? new Date(data.briefing.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="card flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-5 py-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Your daily brief</h2>
          <div className="text-sm text-ink-mute mt-1">
            {briefDate}
            {briefTime && <span> · {briefTime}</span>}
            <span className="text-ink-mute/80"> · written by Claude</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {config?.claudeApiConfigured && (
            <button
              className="inline-flex items-center justify-center min-h-[40px] rounded-full px-4 text-sm font-medium text-signal bg-signal-soft hover:opacity-80 disabled:opacity-40 transition-opacity"
              onClick={generate}
              disabled={generating || !data?.summary}
              title={!data?.summary ? 'Sync first to populate today' : 'Refresh your brief'}
            >
              {generating ? 'Writing…' : data?.briefing ? 'Refresh' : 'Generate'}
            </button>
          )}
          <Link
            to="/ask"
            className="inline-flex items-center justify-center min-h-[40px] rounded-full px-4 text-sm font-medium text-ink-dim bg-bg-surface2 hover:text-ink transition-colors"
          >
            Ask
          </Link>
        </div>
      </div>

      {/* Flags / things to watch */}
      <div className="px-5 space-y-2.5">
        {flags.length === 0 && (
          <div className="flex items-center gap-2 rounded-2xl bg-signal-soft px-4 py-3 text-sm font-medium text-signal">
            <CheckIcon />
            Everything looks good today
          </div>
        )}
        {flags.map((i) => {
          const color = SEVERITY_VAR[i.severity];
          const soft = SEVERITY_SOFT_VAR[i.severity];
          return (
            <div key={i.id} className="rounded-2xl px-4 py-3" style={{ background: soft }}>
              <div className="text-sm font-semibold" style={{ color }}>
                {i.title}
              </div>
              <div className="text-sm text-ink-dim mt-0.5 leading-relaxed">{i.body}</div>
            </div>
          );
        })}
      </div>

      {error && <div className="px-5 pt-2 text-alert text-sm">{error}</div>}

      {/* Brief body */}
      {data?.briefing ? (
        <div className="px-5 py-5 mt-4 flex-1 overflow-y-auto scrollbar-thin">
          <Markdown>{data.briefing.content}</Markdown>
        </div>
      ) : config && !config.claudeApiConfigured ? (
        <div className="px-5 py-5 mt-4">
          <ClaudeSetupPanel variant="inline" />
        </div>
      ) : (
        <div className="px-5 py-8 mt-4 flex-1 flex items-center justify-center text-center">
          <div className="text-sm text-ink-mute max-w-[18rem] leading-relaxed">
            No brief yet today. Sync your tracker, then generate one to see how your day is shaping up.
          </div>
        </div>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
