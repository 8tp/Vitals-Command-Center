import { useCallback, useEffect, useRef, useState } from 'react';
import { askStream } from '../lib/api.js';

export function useAsk() {
  const [answer, setAnswer] = useState('');
  // The backend returns the whole answer in one shot after a long wait, so
  // this is an honest "request in flight" flag, not token streaming.
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

  const ask = useCallback((question: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setAnswer('');
    setError(null);
    setElapsed(0);
    startRef.current = Date.now();
    setPending(true);
    askStream({ question }, (tok) => setAnswer((a) => a + tok), ctrl.signal)
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') setError((err as Error).message);
      })
      .finally(() => setPending(false));
  }, []);

  const stop = useCallback(() => abortRef.current?.abort(), []);
  return { answer, pending, elapsed, error, ask, stop };
}
