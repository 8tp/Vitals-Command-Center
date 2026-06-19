import { useState } from 'react';
import clsx from 'clsx';
import { useAsk } from '../../hooks/useAsk.js';
import { Markdown } from '../shared/Markdown.js';

const SUGGESTIONS = [
  'What predicts my best deep sleep?',
  'Compare this week vs last week.',
  'Is my HRV trending down?',
  'Am I hitting my step goal?',
  'How does my sleep debt look right now?',
];

const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 focus-visible:ring-offset-1 focus-visible:ring-offset-bg-surface';

export function AskClaude() {
  const { ask, answer, pending, elapsed, error, stop } = useAsk();
  const [question, setQuestion] = useState('');

  const submit = () => {
    if (!question.trim()) return;
    ask(question.trim());
  };

  return (
    <div className="card p-6">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-ink">Ask about your health</h2>
        <p className="text-sm text-ink-mute mt-0.5">
          Questions about your sleep, activity, and trends — answered with your own data.
        </p>
      </div>

      <textarea
        className={clsx(
          'w-full h-28 bg-bg-inset border border-hairline rounded-2xl p-4 text-sm text-ink resize-none placeholder:text-ink-mute hover:border-hairline-strong focus:border-signal transition-colors motion-reduce:transition-none',
          FOCUS,
        )}
        placeholder="e.g. How's my sleep debt trending this week?"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
        }}
      />

      <div className="flex items-center justify-between mt-4 gap-3 flex-wrap">
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setQuestion(s)}
              className={clsx(
                'rounded-full border border-hairline bg-bg-inset px-3.5 py-2 text-xs text-ink-dim hover:border-hairline-strong hover:text-ink transition-colors motion-reduce:transition-none',
                FOCUS,
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {pending && (
            <button
              type="button"
              className={clsx(
                'inline-flex items-center min-h-[44px] rounded-full border border-hairline px-4 text-sm font-medium text-ink-dim hover:bg-bg-inset',
                FOCUS,
              )}
              onClick={stop}
            >
              Stop
            </button>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={!question.trim() || pending}
            className={clsx(
              'inline-flex items-center min-h-[44px] rounded-full bg-signal px-5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40 transition-opacity motion-reduce:transition-none',
              FOCUS,
            )}
          >
            {pending ? 'Thinking…' : 'Ask'}
          </button>
        </div>
      </div>

      <p className="mt-2 text-xs text-ink-mute">Tip: press Cmd + Enter to send.</p>

      {error && <div className="mt-4 rounded-2xl bg-alert-soft px-4 py-3 text-sm text-alert">{error}</div>}

      {pending && !answer && (
        <div
          className="mt-5 border-t border-hairline pt-5 flex items-center gap-3 text-ink-dim"
          aria-live="polite"
        >
          <span className="flex items-center gap-1" aria-hidden>
            <span className="device-dot bg-signal/80 motion-safe:animate-pulse" />
            <span className="device-dot bg-signal/60 motion-safe:animate-pulse [animation-delay:200ms]" />
            <span className="device-dot bg-signal/40 motion-safe:animate-pulse [animation-delay:400ms]" />
          </span>
          <span className="text-sm font-medium text-ink-dim">Thinking…</span>
          <span className="num text-xs text-ink-mute">{elapsed}s</span>
          <span className="text-xs text-ink-mute">· this usually takes ~40–60s</span>
        </div>
      )}

      {answer && (
        <div className="mt-5 border-t border-hairline pt-5">
          <Markdown>{answer}</Markdown>
        </div>
      )}
    </div>
  );
}
