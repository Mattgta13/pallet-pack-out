/// <reference lib="webworker" />
import { solvePackOut, type PackOutInput } from '@packout/engine';

self.onmessage = (e: MessageEvent<{ id: number; input: PackOutInput }>) => {
  const { id, input } = e.data;
  try {
    const t = performance.now();
    const results = solvePackOut(input);
    self.postMessage({ id, results, ms: performance.now() - t });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
