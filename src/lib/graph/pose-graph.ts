/** Building a planar pose graph (Posts 27–30) from simulated or loaded data: keys, factors, initial values. */
import * as se2 from '../geometry/se2';
import { diag, type Mat } from '../math/matrix';
import type { Edge } from '../sim/manhattan';
import { betweenFactorSE2, priorFactorSE2, type Factor } from './factors';
import { pose2, values, type Values } from './values';

export const poseKey = (i: number) => `x${i}`;

export interface PoseGraph {
  factors: Factor[];
  initial: Values;
  /** Number of odometry and loop-closure factors. */
  odometry: number;
  loops: number;
}

/**
 * Factors: a tight prior on the first pose (it fixes the gauge, Post 23), one between factor per odometry
 * edge and, optionally, one per loop closure. Initial values: the given poses (e.g. dead reckoning).
 */
export function buildPoseGraph(
  initial: readonly se2.Pose2[],
  odometry: readonly Edge[],
  loops: readonly Edge[],
  information: Mat,
  opts: { useLoops?: boolean; priorInfo?: Mat } = {},
): PoseGraph {
  const useLoops = opts.useLoops ?? true;
  const factors: Factor[] = [priorFactorSE2(poseKey(0), initial[0]!, opts.priorInfo ?? diag([1e8, 1e8, 1e8]))];
  for (const e of odometry) factors.push(betweenFactorSE2(poseKey(e.i), poseKey(e.j), e.z, information, 'odometry'));
  if (useLoops)
    for (const e of loops) factors.push(betweenFactorSE2(poseKey(e.i), poseKey(e.j), e.z, information, 'loop'));
  return {
    factors,
    initial: values(initial.map((p, i) => [poseKey(i), pose2(p)])),
    odometry: odometry.length,
    loops: useLoops ? loops.length : 0,
  };
}

export const posesOf = (v: Values, n: number): se2.Pose2[] =>
  Array.from({ length: n }, (_, i) => {
    const x = v.get(poseKey(i))!;
    return (x as { value: se2.Pose2 }).value;
  });
