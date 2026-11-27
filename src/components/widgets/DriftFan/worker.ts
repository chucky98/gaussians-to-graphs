/// <reference lib="webworker" />
/** Web Worker for DriftFan's "close the loop" switch: one pose-graph optimization per run (CLAUDE.md rule 5). */
import { closeLoops, type DriftParams } from '../../../lib/demos/drift-fan';

self.onmessage = (e: MessageEvent<{ id: number; params: DriftParams }>) => {
  const runs = closeLoops(e.data.params);
  (self as unknown as Worker).postMessage({ id: e.data.id, runs });
};
