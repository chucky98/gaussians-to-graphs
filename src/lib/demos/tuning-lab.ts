/**
 * Pure model behind the TuningLab widget (post 13): the forklift tracker of post 12, run many times.
 * The true motion and camera noise can differ from what the filter assumes; NEES and NIS, averaged over
 * the runs, show whether the filter's covariance tells the truth.
 */
import { kfRun } from '../filters/kf';
import { averageBounds, nees, verdict, type Verdict } from '../filters/consistency';
import type { KfState } from '../filters/kf';
import { cholesky, diag, dot, solveCholesky, vec, type Mat, type Vec } from '../math/matrix';
import { createRng } from '../math/rng';
import { constantVelocity, cvModel } from '../models/linear';

export const LAB = {
  steps: 40,
  dt: 1,
  /** Monte Carlo runs averaged in the plots. */
  runs: 50,
  /** Prior (also the distribution the true initial state is drawn from, so the start is consistent). */
  prior: { x: [5, 15, 1.5, 0], sd: [2, 2, 0.5, 0.5] },
  seed: 13,
  nx: 4,
  nz: 2,
  /** The label ignores the first steps, while the prior still dominates. */
  skip: 5,
};

export interface LabParams {
  /** True acceleration density q and camera noise σ. */
  trueQ: number;
  trueSigma: number;
  /** What the filter assumes, as multiples of the truth. */
  qFactor: number;
  sigmaFactor: number;
}

export type LabPreset = 'tuned' | 'overconfident' | 'underconfident' | 'divergent';

export const LAB_PRESETS: Record<LabPreset, LabParams> = {
  tuned: { trueQ: 0.01, trueSigma: 0.5, qFactor: 1, sigmaFactor: 1 },
  /** Thinks the cameras are three times better than they are. */
  overconfident: { trueQ: 0.01, trueSigma: 0.5, qFactor: 1, sigmaFactor: 1 / 3 },
  /** Thinks the cameras are three times worse than they are. */
  underconfident: { trueQ: 0.01, trueSigma: 0.5, qFactor: 1, sigmaFactor: 3 },
  /** Thinks the forklift almost never changes speed (q 1000 times too small). */
  divergent: { trueQ: 0.01, trueSigma: 0.5, qFactor: 0.001, sigmaFactor: 1 },
};

export const LAB_LIMITS = {
  trueQ: { min: 0.001, max: 0.3 },
  trueSigma: { min: 0.1, max: 2, step: 0.05 },
  /** log10 of the factors. */
  logFactor: { min: -3, max: 2, step: 0.1 },
};

export interface Run {
  truth: Vec[];
  zs: Vec[];
  /** Updated belief at steps 1 … n. */
  post: KfState[];
  nees: number[];
  nis: number[];
}

export function priorState() {
  return { x: vec(LAB.prior.x), P: diag(LAB.prior.sd.map((s) => s * s)) };
}

/** Truth and camera fixes of one run, from the true model (initial state drawn from the prior). */
export function simulate(p: LabParams, seed: number): { truth: Vec[]; zs: Vec[] } {
  const rng = createRng(seed);
  const { F, Q } = constantVelocity(2, LAB.dt, p.trueQ);
  const LQ = cholesky(Q);
  let x = rng.mvnormal(priorState().x, cholesky(priorState().P));
  const truth = [x];
  const zs: Vec[] = [];
  for (let k = 1; k <= LAB.steps; k++) {
    const w = rng.mvnormal(new Float64Array(4), LQ);
    const fx = new Float64Array(4);
    for (let i = 0; i < 4; i++) {
      let s = 0;
      for (let j = 0; j < 4; j++) s += F.data[i * 4 + j]! * x[j]!;
      fx[i] = s + w[i]!;
    }
    x = fx;
    truth.push(x);
    zs.push(vec([x[0]! + p.trueSigma * rng.normal(), x[1]! + p.trueSigma * rng.normal()]));
  }
  return { truth, zs };
}

export const filterModel = (p: LabParams) => cvModel(2, LAB.dt, p.trueQ * p.qFactor, p.trueSigma * p.sigmaFactor);

/** One run through the full Kalman filter (reference implementation for the fast path below). */
export function oneRun(p: LabParams, seed: number): Run {
  const { truth, zs } = simulate(p, seed);
  const steps = kfRun(priorState(), filterModel(p), zs);
  return {
    truth,
    zs,
    nees: steps.map((s, i) => nees(s.post.x, s.post.P, truth[i + 1]!)),
    nis: steps.map((s) => s.update!.nis),
    post: steps.map((s) => s.post),
  };
}

/**
 * Fast path for many runs: the covariances and gains of a Kalman filter do not depend on the data, so
 * they are computed once (one full run) and each further run only propagates its mean.
 */
function fastRuns(p: LabParams, seeds: readonly number[]): Run[] {
  const model = filterModel(p);
  const first = simulate(p, seeds[0]!);
  const ref = kfRun(priorState(), model, first.zs);
  const LP: Mat[] = ref.map((s) => cholesky(s.post.P));
  const LS: Mat[] = ref.map((s) => cholesky(s.update!.S));
  const K = ref.map((s) => s.update!.K.data);
  const F = model.F.data;
  return seeds.map((seed) => {
    const { truth, zs } = seed === seeds[0] ? first : simulate(p, seed);
    let x = priorState().x;
    const neesV: number[] = [];
    const nisV: number[] = [];
    const post: KfState[] = [];
    for (let k = 0; k < LAB.steps; k++) {
      const px = new Float64Array(4);
      for (let i = 0; i < 4; i++) {
        let s = 0;
        for (let j = 0; j < 4; j++) s += F[i * 4 + j]! * x[j]!;
        px[i] = s;
      }
      const nu = vec([zs[k]![0]! - px[0]!, zs[k]![1]! - px[1]!]);
      const Kk = K[k]!;
      const nx = new Float64Array(4);
      for (let i = 0; i < 4; i++) nx[i] = px[i]! + Kk[i * 2]! * nu[0]! + Kk[i * 2 + 1]! * nu[1]!;
      x = nx;
      const e = vec([
        x[0]! - truth[k + 1]![0]!,
        x[1]! - truth[k + 1]![1]!,
        x[2]! - truth[k + 1]![2]!,
        x[3]! - truth[k + 1]![3]!,
      ]);
      neesV.push(dot(e, solveCholesky(LP[k]!, e)));
      nisV.push(dot(nu, solveCholesky(LS[k]!, nu)));
      post.push({ x, P: ref[k]!.post.P });
    }
    return { truth, zs, nees: neesV, nis: nisV, post };
  });
}

export interface LabResult {
  runs: Run[];
  /** Per-step averages over the runs. */
  avgNees: number[];
  avgNis: number[];
  neesBounds: { lo: number; hi: number };
  nisBounds: { lo: number; hi: number };
  /** Time-averaged NIS of run 0 alone, and its bounds: the check a real filter can do. */
  oneRunNis: number;
  oneRunNisBounds: { lo: number; hi: number };
  verdict: Verdict;
  nisVerdict: Verdict;
}

export function runLab(p: LabParams, seed = LAB.seed, runs = LAB.runs): LabResult {
  const rs = fastRuns(
    p,
    Array.from({ length: runs }, (_, r) => seed * 1000 + r),
  );
  const avg = (key: 'nees' | 'nis') =>
    Array.from({ length: LAB.steps }, (_, k) => rs.reduce((a, r) => a + r[key][k]!, 0) / runs);
  const avgNees = avg('nees');
  const avgNis = avg('nis');
  const neesBounds = averageBounds(LAB.nx, runs);
  const nisBounds = averageBounds(LAB.nz, runs);
  const tail = (v: number[]) => v.slice(LAB.skip);
  const r0 = rs[0]!.nis.slice(LAB.skip);
  return {
    runs: rs,
    avgNees,
    avgNis,
    neesBounds,
    nisBounds,
    oneRunNis: r0.reduce((a, b) => a + b, 0) / r0.length,
    oneRunNisBounds: averageBounds(LAB.nz, r0.length),
    verdict: verdict(tail(avgNees), neesBounds),
    nisVerdict: verdict(tail(avgNis), nisBounds),
  };
}
