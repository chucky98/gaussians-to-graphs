/// <reference lib="webworker" />
/** Web Worker for PoseGraph2D: generates and optimizes the pose graph off the main thread (CLAUDE.md rule 5). */
import { runPoseGraph, type PgRequest } from '../../../lib/demos/pose-graph-demo';

self.onmessage = (e: MessageEvent<{ id: number; req: PgRequest }>) => {
  const { id, req } = e.data;
  const post = (msg: unknown) => (self as unknown as Worker).postMessage(msg);
  runPoseGraph(
    req,
    (setup) => post({ id, type: 'setup', setup }),
    (it, k) => post({ id, type: 'iteration', k, it }),
  );
  post({ id, type: 'done' });
};
