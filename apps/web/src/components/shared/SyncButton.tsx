import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { apiGet, apiPost } from '../../lib/api.js';
import { useHealthStore } from '../../stores/healthStore.js';
import { useUiStore } from '../../stores/uiStore.js';
import { IconSync, IconCheck } from './icons.js';

type SyncStatus = { lastSyncAt: string | null; running: boolean };

type Phase = 'idle' | 'syncing' | 'done' | 'error';

/**
 * Header sync control: POST /api/sync, then poll /api/sync/status until the
 * run settles, spinning meanwhile. On success it shows a brief "Synced" and
 * refetches the dashboard data. Reflects an already-running backend sync too.
 */
export function SyncButton({ withLabel = false }: { withLabel?: boolean }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const range = useUiStore((s) => s.range);
  const fetchAll = useHealthStore((s) => s.fetchAll);
  const pollRef = useRef<number | null>(null);
  const doneTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      if (doneTimer.current) window.clearTimeout(doneTimer.current);
    };
  }, []);

  function startPolling() {
    if (pollRef.current) window.clearInterval(pollRef.current);
    let ticks = 0;
    pollRef.current = window.setInterval(async () => {
      ticks += 1;
      try {
        const s = await apiGet<SyncStatus>('/api/sync/status');
        if (!s.running) finish('done');
      } catch {
        finish('error');
      }
      if (ticks > 90) finish('done'); // safety: stop after ~3 min
    }, 2000);
  }

  function finish(result: 'done' | 'error') {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (result === 'done') void fetchAll(range);
    setPhase(result);
    doneTimer.current = window.setTimeout(() => setPhase('idle'), 2400);
  }

  async function onClick() {
    if (phase === 'syncing') return;
    setPhase('syncing');
    try {
      await apiPost<{ days?: number }, { triggered: boolean }>('/api/sync', {});
      startPolling();
    } catch (err) {
      // 409 = already running → just poll to completion.
      if (err instanceof Error && /CONFLICT|in progress|409/i.test(err.message)) {
        startPolling();
      } else {
        finish('error');
      }
    }
  }

  const syncing = phase === 'syncing';
  const label =
    phase === 'syncing' ? 'Syncing…' : phase === 'done' ? 'Synced' : phase === 'error' ? 'Retry' : 'Sync';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Sync now"
      title="Sync now"
      className={clsx(
        withLabel
          ? 'inline-flex items-center gap-2 h-10 px-3.5 rounded-pill font-medium text-[13px] shadow-[inset_0_0_0_1px_var(--hairline)] bg-bg-surface transition-colors'
          : 'icon-btn',
        phase === 'done' && 'text-good',
        phase === 'error' && 'text-alert',
        syncing && 'text-accent',
      )}
    >
      {phase === 'done' ? (
        <IconCheck size={18} />
      ) : (
        <IconSync size={18} className={clsx(syncing && 'animate-spin-slow')} />
      )}
      {withLabel && <span>{label}</span>}
    </button>
  );
}
