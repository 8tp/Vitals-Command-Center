import { useCallback, useEffect, useRef, useState } from 'react';
import { askStream } from '../lib/api.js';

export function useAsk() {
  // `full` is everything received from the backend (which today returns the
  // answer in one shot); `displayed` is the typewriter-revealed slice so the
  // assistant appears to type its reply back rather than snapping in whole.
  const [full, setFull] = useState('');
  const [displayed, setDisplayed] = useState('');
  const [pending, setPending] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startRef = useRef<number>(0);

  // Drive the elapsed-seconds readout while a request is in flight.
  useEffect(() => {
    if (!pending) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [pending]);

  // Typewriter: advance `displayed` toward `full` at a roughly constant pace
  // (~1.5s total regardless of length) so long and short replies feel similar.
  useEffect(() => {
    if (displayed.length >= full.length) return;
    const id = setTimeout(() => {
      const inc = Math.max(2, Math.ceil(full.length / 90));
      setDisplayed(full.slice(0, Math.min(full.length, displayed.length + inc)));
    }, 16);
    return () => clearTimeout(id);
  }, [full, displayed]);

  const ask = useCallback(
    (
      question: string,
      opts: {
        conversationId?: string;
        anchorBriefDate?: string;
        onConversationId?: (id: string) => void;
      } = {},
    ) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setFull('');
      setDisplayed('');
      setError(null);
      setElapsed(0);
      startRef.current = Date.now();
      setPending(true);
      askStream(
        { question, conversationId: opts.conversationId, anchorBriefDate: opts.anchorBriefDate },
        (tok) => setFull((a) => a + tok),
        ctrl.signal,
        (meta) => {
          if (meta.conversationId) opts.onConversationId?.(meta.conversationId);
        },
      )
        .catch((err) => {
          if ((err as Error).name !== 'AbortError') setError((err as Error).message);
        })
        .finally(() => setPending(false));
    },
    [],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    // Snap the reveal to whatever arrived so a stopped answer doesn't hang mid-type.
    setDisplayed(full);
  }, [full]);

  // True while there's still buffered text to reveal.
  const typing = displayed.length < full.length;
  return { answer: displayed, typing, pending, elapsed, error, ask, stop };
}
