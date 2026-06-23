import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { useAsk } from '../../hooks/useAsk.js';
import { useHealthData } from '../../hooks/useHealthData.js';
import { deriveReadiness } from '../../lib/readiness.js';
import { getConversation } from '../../lib/api.js';
import { fmtDate } from '../../lib/formatters.js';
import { Markdown } from '../shared/Markdown.js';
import { AskAvatar, AskGreeting, CHIPS, GROUNDING_NOTE } from './AskShell.js';
import { ConversationHistory } from './ConversationHistory.js';
import { IconSend } from '../shared/icons.js';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

let seq = 0;
const nextId = () => `m${++seq}`;

/**
 * The live AI health-coach chat. A centered conversation thread with a sticky
 * composer at the bottom — the "Ask AI" page when the Anthropic API is wired up.
 *
 * The streaming wiring is preserved from `useAsk` / `askStream`: while a request
 * is in flight, `answer` accumulates tokens; we mirror that into the latest
 * assistant message so it types in, then leave it committed when the request
 * settles.
 */
export function AskClaude() {
  const { daily } = useHealthData();
  const readiness = deriveReadiness(daily);

  const { ask, answer, typing, pending, error, stop } = useAsk();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  // The persisted thread these messages belong to (null until the first reply).
  const [conversationId, setConversationId] = useState<string | null>(null);
  // A daily brief this thread follows up on, when arriving via "Discuss".
  const [anchorDate, setAnchorDate] = useState<string | undefined>(undefined);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  // The assistant message currently receiving streamed tokens.
  const streamingId = useRef<string | null>(null);
  const scrollAnchor = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const location = useLocation();

  const started = messages.length > 0;

  // Arriving from a brief's "Discuss" button: start a fresh thread anchored to
  // that brief. location.key changes on every navigation so re-clicking works.
  const incomingAnchor = (location.state as { anchorBriefDate?: string } | null)?.anchorBriefDate;
  useEffect(() => {
    if (!incomingAnchor) return;
    stop();
    setMessages([]);
    setConversationId(null);
    setAnchorDate(incomingAnchor);
    // Clear nav state so a refresh doesn't re-anchor.
    window.history.replaceState({}, '');
  }, [incomingAnchor, location.key, stop]);

  const newChat = useCallback(() => {
    stop();
    setMessages([]);
    setConversationId(null);
    setAnchorDate(undefined);
    setDraft('');
  }, [stop]);

  const loadConversation = useCallback(
    async (id: string) => {
      setHistoryOpen(false);
      const conv = await getConversation(id);
      stop();
      streamingId.current = null;
      setConversationId(conv.id);
      setAnchorDate(conv.anchorDate ?? undefined);
      setMessages(conv.messages.map((m) => ({ id: m.id, role: m.role, text: m.content })));
    },
    [stop],
  );

  // Mirror streamed tokens into the in-flight assistant message as they arrive.
  useEffect(() => {
    const id = streamingId.current;
    if (!id) return;
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: answer } : m)));
  }, [answer]);

  // When the request settles AND the typewriter has caught up, surface any error
  // in the bubble and release the streaming slot so the next question starts a
  // fresh assistant message. Waiting on `typing` keeps the reveal mirroring.
  useEffect(() => {
    if (pending || typing) return;
    const id = streamingId.current;
    if (!id) return;
    streamingId.current = null;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id && !m.text.trim()
          ? { ...m, text: error ? `Sorry — ${error}` : '_No response. Try asking again._' }
          : m,
      ),
    );
  }, [pending, typing, error]);

  // Keep the newest message in view as it streams in.
  useLayoutEffect(() => {
    scrollAnchor.current?.scrollIntoView({ block: 'end', behavior: started ? 'smooth' : 'auto' });
  }, [messages, started]);

  const submit = (raw: string) => {
    const question = raw.trim();
    if (!question || pending) return;
    const assistantId = nextId();
    streamingId.current = assistantId;
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: 'user', text: question },
      { id: assistantId, role: 'assistant', text: '' },
    ]);
    setDraft('');
    const startingNew = !conversationId;
    ask(question, {
      conversationId: conversationId ?? undefined,
      // Anchor only applies to the first message of a brand-new anchored thread.
      anchorBriefDate: conversationId ? undefined : anchorDate,
      onConversationId: (id) => {
        setConversationId(id);
        if (startingNew) setHistoryKey((k) => k + 1); // refresh the drawer list
      },
    });
  };

  return (
    // Fill the scroll viewport so the composer pins to the bottom even on a
    // short conversation. Mobile subtracts the sticky top bar (h-14 + safe area);
    // desktop has no top bar (the rail is the chrome).
    <div className="flex flex-col min-h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] md:min-h-[100dvh]">
      {/* Control bar — new chat + history */}
      <div className="flex items-center justify-end gap-2 pt-4 -mb-2">
        {(started || conversationId) && (
          <button type="button" className="btn-soft px-3 py-1.5 text-[13px]" onClick={newChat}>
            New chat
          </button>
        )}
        <button
          type="button"
          className="btn-soft px-3 py-1.5 text-[13px]"
          onClick={() => setHistoryOpen(true)}
        >
          History
        </button>
      </div>

      {/* Greeting */}
      <header className="pt-5 pb-2 animate-fade-rise">
        <AskGreeting readiness={readiness} />
        {anchorDate && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent-wash text-accent-deep px-3.5 py-1.5 text-[12.5px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            Following up on your {fmtDate(anchorDate, 'EEE, MMM d')} brief
          </div>
        )}
        {!started && !anchorDate && (
          <div className="flex flex-wrap gap-2.5 mt-6">
            {CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                className="chip"
                onClick={() => submit(c)}
                disabled={pending}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Conversation thread */}
      <div className="flex-1 flex flex-col gap-5 py-4 pb-7">
        {messages.map((m, i) => (
          <ChatMessage
            key={m.id}
            message={m}
            streaming={(pending || typing) && i === messages.length - 1}
          />
        ))}
        <div ref={scrollAnchor} aria-hidden className="h-px" />
      </div>

      {/* Composer */}
      <div className="sticky bottom-0 z-10 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:pb-6 bg-gradient-to-t from-bg-base from-30% to-transparent">
        <form
          className="flex items-center gap-2.5 bg-bg-surface rounded-[18px] shadow-card pl-4 sm:pl-5 pr-2 py-2"
          style={{ boxShadow: 'var(--shadow-card), inset 0 0 0 1px var(--hairline)' }}
          onSubmit={(e) => {
            e.preventDefault();
            submit(draft);
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            Ask about your health
          </label>
          <input
            id={inputId}
            type="text"
            autoComplete="off"
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[14.5px] text-ink placeholder:text-ink-mute"
            placeholder="Ask about your health…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          {pending ? (
            <button
              type="button"
              onClick={stop}
              aria-label="Stop generating"
              className="grid place-items-center w-[44px] h-[44px] md:w-[38px] md:h-[38px] rounded-[13px] shrink-0 text-ink-dim bg-bg-inset hover:text-ink transition-colors"
            >
              <span className="block w-3 h-3 rounded-[3px] bg-current" aria-hidden />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="Send"
              className="grid place-items-center w-[44px] h-[44px] md:w-[38px] md:h-[38px] rounded-[13px] shrink-0 text-white transition-transform hover:-translate-y-px hover:scale-[1.03] disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:scale-100 motion-reduce:transition-none motion-reduce:hover:transform-none"
              style={{
                background: 'linear-gradient(140deg, var(--accent), var(--accent-deep))',
                boxShadow: '0 8px 18px -8px rgba(37,99,235,0.6)',
              }}
            >
              <IconSend size={18} strokeWidth={2} />
            </button>
          )}
        </form>
        <p className="text-center mt-2.5 text-ink-mute text-[11px]">{GROUNDING_NOTE}</p>
      </div>

      <ConversationHistory
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSelect={loadConversation}
        activeId={conversationId}
        reloadKey={historyKey}
      />
    </div>
  );
}

function ChatMessage({ message, streaming }: { message: Message; streaming: boolean }) {
  const isUser = message.role === 'user';
  return (
    <div
      className={clsx(
        'flex gap-3 max-w-[90%] animate-fade-rise',
        isUser ? 'self-end flex-row-reverse text-right' : 'self-start',
      )}
    >
      {isUser ? (
        <span
          className="grid place-items-center w-[30px] h-[30px] rounded-[9px] shrink-0 text-[12px] font-semibold text-ink-dim bg-bg-surface2"
          style={{ boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
          aria-hidden
        >
          H
        </span>
      ) : (
        <AskAvatar size={30} className="rounded-[9px]" iconSize={16} />
      )}

      {isUser ? (
        <div className="bg-accent-wash text-accent-deep rounded-[16px_16px_4px_16px] px-4 py-2.5 text-[14.5px] leading-relaxed font-medium">
          {message.text}
        </div>
      ) : (
        <div className="min-w-0 text-left">
          {message.text ? (
            <Markdown>{message.text}</Markdown>
          ) : (
            <ThinkingDots />
          )}
          {streaming && message.text && (
            <span className="inline-block w-1.5 h-4 ml-0.5 -mb-0.5 rounded-[1px] bg-accent/70 motion-safe:animate-pulse align-middle" aria-hidden />
          )}
        </div>
      )}
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1.5" aria-label="Thinking">
      <span className="w-1.5 h-1.5 rounded-full bg-accent/80 motion-safe:animate-pulse" />
      <span className="w-1.5 h-1.5 rounded-full bg-accent/60 motion-safe:animate-pulse [animation-delay:200ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-accent/40 motion-safe:animate-pulse [animation-delay:400ms]" />
    </span>
  );
}
