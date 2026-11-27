/// <reference lib="webworker" />
/** Web Worker for DriveYourOwnSLAM: the whole SLAM pipeline runs off the main thread (CLAUDE.md rule 5). */
import { createPipeline, snapshot, type Pipeline, type SlamConfig } from '../../../lib/demos/mini-slam';
import type { VelocityControl } from '../../../lib/models/unicycle';

let pipe: Pipeline | null = null;
self.onmessage = (
  e: MessageEvent<{ id: number; cfg?: SlamConfig; replay?: VelocityControl[]; step?: VelocityControl }>,
) => {
  const { id, cfg, replay, step } = e.data;
  if (cfg) {
    pipe = createPipeline(cfg);
    for (const u of replay ?? []) pipe.step(u);
  }
  if (step && pipe) pipe.step(step);
  if (pipe) (self as unknown as Worker).postMessage({ id, snap: snapshot(pipe.state) });
};
