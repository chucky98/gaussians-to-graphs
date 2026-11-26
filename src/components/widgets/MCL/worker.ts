/// <reference lib="webworker" />
/** Web Worker for the MCL widget: runs the particle filter off the main thread (CLAUDE.md rule 5). */
import { createMclRunner, type MclParams } from '../../../lib/demos/mcl';

export interface MclRequest {
  id: number;
  params: MclParams;
  seed: number;
  upto: number;
}

const runner = createMclRunner();
self.onmessage = (e: MessageEvent<MclRequest>) => {
  const { id, params, seed, upto } = e.data;
  const snap = runner.run(params, seed, upto);
  (self as unknown as Worker).postMessage({ id, ...snap }, [snap.xy.buffer]);
};
