/**
 * Pure model behind the FilterVsSmoother widget (post 18): post 11's corridor run with the outage
 * (no position fixes for steps 16–25), estimated three ways from the data available at time t:
 * filtering, fixed-lag smoothing, and full smoothing (RTS), with the batch solution for comparison.
 */
import { batchLinearGaussian, kfRun, type KfState, type LinearModel } from '../filters/kf';
import { fixedLagSmooth, rtsSmooth } from '../filters/rts';
import { fromArrays, vec } from '../math/matrix';
import { TRACK, TRACKER_DEFAULTS, initBelief, makeScenario, Qof, Rof } from './tracker-1d';

export const FVS = { seed: TRACK.seed, steps: TRACK.steps, lagDefault: 3, lagMax: 10 };
export type FvsMode = 'filter' | 'lag' | 'smooth';

const p = TRACKER_DEFAULTS;
export const model: LinearModel = {
  F: fromArrays([[1]]),
  B: fromArrays([[1]]),
  Q: fromArrays([[Qof(p)]]),
  H: fromArrays([[1]]),
  R: fromArrays([[Rof(p)]]),
};
const init = (): KfState => ({ x: vec([initBelief().x]), P: fromArrays([[initBelief().P]]) });

export interface FvsData {
  truth: number[];
  zs: (number | null)[];
}
export function scenario(seed = FVS.seed): FvsData {
  const s = makeScenario('outage', p, seed);
  return { truth: s.truth, zs: s.zs };
}

export interface Track {
  mean: number[];
  sd: number[];
}
const toTrack = (st: KfState[]): Track => ({
  mean: st.map((s) => s.x[0]!),
  sd: st.map((s) => Math.sqrt(s.P.data[0]!)),
});

/**
 * Estimates of times 0 … t using the data up to time t.
 * filter: x̂_{k|k}; lag: x̂_{k|min(k+L, t)}; smooth: x̂_{k|t}; batch: the batch MAP solution with data up to t.
 */
export function estimates(d: FvsData, t: number, L: number) {
  const zs = d.zs.slice(0, t).map((z) => (z === null ? null : vec([z])));
  const us = zs.map(() => vec([TRACK.move]));
  const steps = kfRun(init(), model, zs, us);
  const filter = toTrack([init(), ...steps.map((s) => s.post)]);
  const smooth = toTrack(rtsSmooth(init(), steps, model.F));
  const lag = toTrack(fixedLagSmooth(init(), model, zs, L, us));
  const b = batchLinearGaussian(init(), model, zs, us);
  const batch = toTrack(b.x.map((x, k) => ({ x, P: b.P[k]! })));
  return { filter, smooth, lag, batch };
}

export const rmsErr = (tr: Track, truth: readonly number[], from = 1) => {
  let s = 0;
  for (let k = from; k < tr.mean.length; k++) s += (tr.mean[k]! - truth[k]!) ** 2;
  return Math.sqrt(s / (tr.mean.length - from));
};
