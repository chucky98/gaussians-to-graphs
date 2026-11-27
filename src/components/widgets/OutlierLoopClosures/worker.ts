/// <reference lib="webworker" />
/** Web Worker for OutlierLoopClosures: robust optimization off the main thread (CLAUDE.md rule 5). */
import { runRobust, type RobustRequest } from '../../../lib/demos/robust-demo';

self.onmessage = (e: MessageEvent<{ id: number; req: RobustRequest }>) => {
  const { id, req } = e.data;
  const post = (msg: unknown) => (self as unknown as Worker).postMessage(msg);
  const res = runRobust(req, (it, k) => post({ id, type: 'iteration', k, it }));
  post({ id, type: 'done', res: { ...res, iterations: [] } });
};
