import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { InsightItem, BriefingRecord } from '@vcc/shared';
import { apiGet, apiPost, listBriefings } from '../../lib/api.js';
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

/** Parse a timestamp to epoch ms, normalizing sqlite's tz-less 'YYYY-MM-DD HH:MM:SS' (UTC) to ISO. */
function toEpoch(s?: string | null): number {
  if (!s) return NaN;
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(' ', 'T')}Z`;
  return Date.parse(iso);
}

/**
 * DAILY BRIEF — the persistent ops-dispatch panel. Renders today's flags
 * (severity-coded) and the markdown briefing styled like a field dispatch.
 *
 * When `autoSummary` is on it generates today's brief automatically: once when
 * none exists, and again when `freshnessKey` (the newest data event today, e.g.
 * a run that just synced) is newer than the current brief — so the brief
 * refreshes itself after a morning workout. The Regenerate button is manual and
 * always available.
 */
export function InsightsPanel({
  autoSummary = false,
  freshnessKey,
  compact = false,
}: {
  autoSummary?: boolean;
  freshnessKey?: string;
  /** Dashboard placement: tighter header + a capped, scrollable brief body. */
  compact?: boolean;
}) {
  const [data, setData] = useState<TodayResp | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Brief history: an older brief being viewed instead of today's, + the list.
  const [viewing, setViewing] = useState<BriefingRecord | null>(null);
  const [history, setHistory] = useState<BriefingRecord[] | null>(null);
  const [histOpen, setHistOpen] = useState(false);
  const config = useConfigStatus();
  const navigate = useNavigate();
  const autoRef = useRef<string | null>(null);

  const openHistory = useCallback(() => {
    setHistOpen((o) => !o);
    if (history == null) listBriefings().then(setHistory).catch(() => setHistory([]));
  }, [history]);

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
      setViewing(null); // snap back to the fresh brief
      setHistory(null); // prior brief is retained; refetch the list lazily
      setHistOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }, []);

  // Auto-generate: when enabled, write the brief if it's missing for today, or
  // refresh it when newer data (freshnessKey) postdates the current brief. The
  // ref guards against re-firing for the same state (no generation loop).
  useEffect(() => {
    if (!autoSummary || generating || !data || !data.summary) return;
    const missing = !data.briefing;
    const stale =
      !!data.briefing &&
      !!freshnessKey &&
      toEpoch(data.briefing.createdAt) < toEpoch(freshnessKey);
    if (!missing && !stale) return;
    const key = missing ? `missing:${data.date}` : `stale:${freshnessKey}`;
    if (autoRef.current === key) return;
    autoRef.current = key;
    void generate();
  }, [autoSummary, data, freshnessKey, generating, generate]);

  const flags = data?.insights ?? [];
  // The brief being shown: an older one the user is browsing, else today's.
  const shown = viewing ?? data?.briefing ?? null;
  // Use the briefing's logical civil date for the header (the day it's about),
  // and the UTC-normalized createdAt for the time — sqlite stores a tz-less
  // 'YYYY-MM-DD HH:MM:SS' in UTC, which new Date() would misread as local.
  const briefDate = fmtDate(
    shown?.date ?? data?.date ?? new Date().toISOString().slice(0, 10),
    'EEEE, MMM d',
  );
  const briefEpoch = shown ? toEpoch(shown.createdAt) : NaN;
  const briefTime = Number.isFinite(briefEpoch)
    ? new Date(briefEpoch).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className={`card flex flex-col overflow-hidden ${compact ? '' : 'h-full'}`}>
      {/* Header */}
      <div className={`px-5 flex items-start justify-between gap-3 ${compact ? 'py-4' : 'py-5'}`}>
        <div>
          <h2 className={`font-display font-semibold text-ink ${compact ? 'text-[15px]' : 'text-lg'}`}>
            Your daily brief
          </h2>
          <div className="text-sm text-ink-mute mt-1">
            {briefDate}
            {briefTime && <span> · {briefTime}</span>}
            <span className="text-ink-mute/80"> · written by Claude</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {config?.claudeApiConfigured && !viewing && (
            <button
              className="inline-flex items-center justify-center min-h-[40px] rounded-full px-4 text-sm font-medium text-signal bg-signal-soft hover:opacity-80 disabled:opacity-40 transition-opacity"
              onClick={generate}
              disabled={generating || !data?.summary}
              title={!data?.summary ? 'Sync first to populate today' : 'Refresh your brief'}
            >
              {generating ? 'Writing…' : data?.briefing ? 'Regenerate' : 'Generate'}
            </button>
          )}
          {shown && config?.claudeApiConfigured ? (
            <button
              onClick={() => navigate('/ask', { state: { anchorBriefDate: shown.date } })}
              className="inline-flex items-center justify-center min-h-[40px] rounded-full px-4 text-sm font-medium text-ink-dim bg-bg-surface2 hover:text-ink transition-colors"
              title="Ask a follow-up about this brief"
            >
              Discuss
            </button>
          ) : (
            <Link
              to="/ask"
              className="inline-flex items-center justify-center min-h-[40px] rounded-full px-4 text-sm font-medium text-ink-dim bg-bg-surface2 hover:text-ink transition-colors"
            >
              Ask
            </Link>
          )}
          <button
            onClick={openHistory}
            aria-label="Past briefs"
            title="Past briefs"
            className="grid place-items-center w-10 h-10 rounded-full shrink-0 text-ink-dim bg-bg-surface2 hover:text-ink transition-colors"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 4v4h4" />
              <path d="M12 8v4l3 2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Past-briefs list */}
      {histOpen && (
        <div className="mx-5 mb-1 rounded-xl bg-bg-surface2 max-h-56 overflow-y-auto scrollbar-thin">
          {history == null ? (
            <div className="px-4 py-3 text-sm text-ink-mute">Loading…</div>
          ) : history.length === 0 ? (
            <div className="px-4 py-3 text-sm text-ink-mute">No briefs yet.</div>
          ) : (
            <ul className="divide-y divide-hairline">
              {history.map((b) => {
                const t = toEpoch(b.createdAt);
                const time = Number.isFinite(t)
                  ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : '';
                const isShown = shown?.id === b.id;
                return (
                  <li key={b.id}>
                    <button
                      onClick={() => {
                        setViewing(b);
                        setHistOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                        isShown ? 'text-accent' : 'text-ink-dim hover:text-ink'
                      }`}
                    >
                      {fmtDate(b.date, 'EEE, MMM d')} <span className="text-ink-mute">· {time}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {viewing && (
        <div className="mx-5 mb-2 flex items-center justify-between rounded-lg bg-accent-wash px-3.5 py-2 text-[12.5px] text-accent-deep">
          <span>Viewing an earlier brief</span>
          <button onClick={() => setViewing(null)} className="font-semibold hover:opacity-80">
            Back to latest
          </button>
        </div>
      )}

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
      {shown ? (
        <div
          className={`px-5 mt-4 overflow-y-auto scrollbar-thin ${compact ? 'py-4 max-h-[20rem]' : 'py-5 flex-1'}`}
        >
          <Markdown>{shown.content}</Markdown>
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
