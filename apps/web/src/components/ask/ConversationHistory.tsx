import { useEffect, useState } from 'react';
import type { ConversationSummary } from '@vcc/shared';
import { listConversations, deleteConversation } from '../../lib/api.js';
import { fmtDate } from '../../lib/formatters.js';

/** Relative-ish timestamp for the history list (sqlite stores tz-less UTC). */
function whenLabel(iso: string): string {
  const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso.replace(' ', 'T')}Z`);
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return fmtDate(new Date(t).toISOString().slice(0, 10), 'MMM d');
}

/**
 * Slide-in drawer listing past Ask conversations. Selecting one reopens the
 * thread; the trash button deletes it.
 */
export function ConversationHistory({
  open,
  onClose,
  onSelect,
  activeId,
  reloadKey,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  activeId: string | null;
  /** Bump to force a reload (e.g. after a new conversation is created). */
  reloadKey?: number;
}) {
  const [items, setItems] = useState<ConversationSummary[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setItems(null);
    listConversations()
      .then((list) => !cancelled && setItems(list))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [open, reloadKey]);

  const remove = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setItems((prev) => prev?.filter((c) => c.id !== id) ?? prev);
    try {
      await deleteConversation(id);
    } catch {
      /* best effort; list reloads on next open */
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <aside
        className="fixed right-0 top-0 z-50 h-full w-[86%] max-w-[360px] bg-bg-surface shadow-2xl flex flex-col"
        style={{ boxShadow: 'var(--shadow-card)', paddingTop: 'env(safe-area-inset-top)' }}
        role="dialog"
        aria-label="Conversation history"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-hairline">
          <h2 className="font-display font-semibold text-ink text-[15px]">History</h2>
          <button
            onClick={onClose}
            aria-label="Close history"
            className="icon-btn w-9 h-9"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3">
          {items == null ? (
            <div className="px-2 py-6 text-sm text-ink-mute">Loading…</div>
          ) : items.length === 0 ? (
            <div className="px-2 py-6 text-sm text-ink-mute leading-relaxed">
              No past conversations yet. Your chats will show up here.
            </div>
          ) : (
            <ul className="space-y-1">
              {items.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => onSelect(c.id)}
                    className={`group w-full text-left rounded-xl px-3 py-2.5 transition-colors ${
                      c.id === activeId ? 'bg-accent-wash' : 'hover:bg-bg-surface2'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-medium text-ink truncate">{c.title}</div>
                        <div className="meta-mono mt-0.5">
                          {c.anchorDate && <span className="text-accent">brief · </span>}
                          {whenLabel(c.updatedAt)} · {c.messageCount} msg
                        </div>
                      </div>
                      <span
                        onClick={(e) => remove(e, c.id)}
                        role="button"
                        aria-label="Delete conversation"
                        className="shrink-0 p-1 rounded-md text-ink-mute opacity-0 group-hover:opacity-100 hover:text-alert transition-opacity"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
                        </svg>
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
