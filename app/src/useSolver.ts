import { useEffect, useRef, useState } from 'react';
import type { PackOutInput, PackOutResult } from '@packout/engine';

interface SolveState {
  results: PackOutResult[];
  error: string | null;
  busy: boolean;
  ms: number | null;
}

/** Runs the engine in a Web Worker, re-solving (debounced) whenever the input changes. */
export function useSolver(input: PackOutInput | string): SolveState {
  const [state, setState] = useState<SolveState>({ results: [], error: null, busy: false, ms: null });
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);
  const key = typeof input === 'string' ? input : JSON.stringify(input);

  useEffect(() => {
    const w = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      if (e.data.id !== seq.current) return; // stale answer
      if (e.data.error) setState({ results: [], error: e.data.error, busy: false, ms: null });
      else setState({ results: e.data.results, error: null, busy: false, ms: e.data.ms });
    };
    worker.current = w;
    return () => w.terminate();
  }, []);

  useEffect(() => {
    if (typeof input === 'string') {
      seq.current++;
      setState({ results: [], error: input, busy: false, ms: null });
      return;
    }
    setState((s) => ({ ...s, busy: true }));
    const t = setTimeout(() => {
      const id = ++seq.current;
      worker.current?.postMessage({ id, input });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
