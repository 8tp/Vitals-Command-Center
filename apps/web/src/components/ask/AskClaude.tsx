import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useAsk } from '../../hooks/useAsk.js';
import { useHealthData } from '../../hooks/useHealthData.js';
import { deriveReadiness } from '../../lib/readiness.js';
import { Markdown } from '../shared/Markdown.js';
import { AskAvatar, AskGreeting, CHIPS, GROUNDING_NOTE } from './AskShell.js';
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

  const { ask, answer, pending, error, stop } = useAsk();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  // The assistant message currently receiving streamed tokens.
  const streamingId = useRef<string | null>(null);
  const scrollAnchor = useRef<HTMLDivElement>(null);
  const inputId = useId();

  const started = messages.length > 0;

  // Mirror streamed tokens into the in-flight assistant message as they arrive.
  useEffect(() => {
    const id = streamingId.current;
    if (!id) return;
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: answer } : m)));
  }, [answer]);

  // When the request settles, surface any error in the bubble and release the
  // streaming slot so the next question starts a fresh assistant message.
  useEffect(() => {
    if (pending) return;
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
  }, [pending, error]);

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
    ask(question);
  };

  return (
    // Fill the scroll viewport so the composer pins to the bottom even on a
    // short conversation. Mobile subtracts the sticky top bar (h-14 + safe area);
    // desktop has no top bar (the rail is the chrome).
    <div className="flex flex-col min-h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] md:min-h-[100dvh]">
      {/* Greeting */}
      <header className="pt-9 sm:pt-10 pb-2 animate-fade-rise">
        <AskGreeting readiness={readiness} />
        {!started && (
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
          <ChatMessage key={m.id} message={m} streaming={pending && i === messages.length - 1} />
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
