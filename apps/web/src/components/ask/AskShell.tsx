import clsx from 'clsx';
import type { ReadinessResult, ReadinessState } from '../../lib/readiness.js';
import { IconSparkle } from '../shared/icons.js';

/** Optional display name from VITE_USER_NAME (.env, gitignored). */
const USER_NAME = (import.meta.env.VITE_USER_NAME as string | undefined)?.trim() || '';

/** Suggestion chips — clicking one submits it as the question. */
export const CHIPS = [
  'How should I train today?',
  'Why is my HRV up?',
  'Plan my recovery week',
  'How was my sleep?',
] as const;

export const GROUNDING_NOTE = 'Vitals AI reads your Fitbit Air, sleep, and Strava data';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** A friendly, readiness-aware second line under the greeting. */
const CONTEXT: Record<ReadinessState, (score: number | null) => string> = {
  PRIMED: (s) => `Readiness is ${s} — primed for training. What do you want to dig into?`,
  STEADY: (s) => `Readiness is ${s} — steady and ready. What's on your mind?`,
  STRAINED: (s) => `Readiness is ${s} — ease back today. Want to plan a lighter session?`,
  LOW: (s) => `Readiness is ${s} — recovery comes first today. Let's talk it through.`,
  'NO DATA': () => 'Connect a device and sync to see your readiness. Ask me anything in the meantime.',
};

/**
 * The gradient "AI" avatar — an electric-blue squircle with a white spark. Used
 * for the greeting (44px) and each assistant message (30px).
 */
export function AskAvatar({
  size = 44,
  iconSize,
  className,
}: {
  size?: number;
  iconSize?: number;
  className?: string;
}) {
  return (
    <span
      className={clsx('grid place-items-center shrink-0 text-white rounded-[13px]', className)}
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(140deg, var(--accent-2), var(--accent-deep))',
        boxShadow: '0 10px 24px -8px rgba(37,99,235,0.55)',
      }}
      aria-hidden
    >
      <IconSparkle size={iconSize ?? Math.round(size * 0.52)} strokeWidth={1.9} />
    </span>
  );
}

/** Greeting header: avatar + time-of-day hello + readiness context line. */
export function AskGreeting({ readiness }: { readiness: ReadinessResult }) {
  return (
    <div className="flex items-center gap-3.5">
      <AskAvatar size={44} />
      <div className="min-w-0">
        <h1 className="font-display font-semibold text-[clamp(22px,3.4vw,26px)] tracking-tightest leading-tight">
          {greeting()}{USER_NAME ? `, ${USER_NAME}.` : '.'}
        </h1>
        <p className="mt-1 text-[13.5px] text-ink-dim leading-snug">
          {CONTEXT[readiness.state](readiness.score)}
        </p>
      </div>
    </div>
  );
}
