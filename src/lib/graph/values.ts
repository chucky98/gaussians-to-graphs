/**
 * Typed variable store for factor graphs (DESIGN §5.1, Posts 26–32). Each variable is a planar or 3D pose
 * (a Lie group element) or a point (a vector). Updates are applied with retract, X ⊕ δ, on the manifold.
 * Values are immutable: retract returns a new store.
 */
import { oplus } from '../geometry/lie';
import * as se2 from '../geometry/se2';
import * as se3 from '../geometry/se3';
import type { Vec } from '../math/matrix';

export type Key = string;

export type Variable =
  | { kind: 'se2'; value: se2.Pose2 }
  | { kind: 'se3'; value: se3.Pose3 }
  | { kind: 'point2'; value: Vec }
  | { kind: 'point3'; value: Vec };

export type Values = ReadonlyMap<Key, Variable>;

export const dimOf = (v: Variable): number =>
  v.kind === 'se2' ? 3 : v.kind === 'se3' ? 6 : v.kind === 'point2' ? 2 : 3;

export function values(entries: readonly [Key, Variable][]): Values {
  return new Map(entries);
}

export const pose2 = (p: se2.Pose2): Variable => ({ kind: 'se2', value: p });
export const pose3 = (p: se3.Pose3): Variable => ({ kind: 'se3', value: p });
export const point2 = (x: number, y: number): Variable => ({ kind: 'point2', value: Float64Array.of(x, y) });
export const point3 = (x: number, y: number, z: number): Variable => ({
  kind: 'point3',
  value: Float64Array.of(x, y, z),
});

export function getPose2(v: Values, k: Key): se2.Pose2 {
  const x = v.get(k);
  if (!x || x.kind !== 'se2') throw new Error(`no SE(2) variable ${k}`);
  return x.value;
}
export function getPose3(v: Values, k: Key): se3.Pose3 {
  const x = v.get(k);
  if (!x || x.kind !== 'se3') throw new Error(`no SE(3) variable ${k}`);
  return x.value;
}
export function getPoint(v: Values, k: Key): Vec {
  const x = v.get(k);
  if (!x || (x.kind !== 'point2' && x.kind !== 'point3')) throw new Error(`no point variable ${k}`);
  return x.value;
}

/** X ⊕ δ for one variable. */
export function retractVar(x: Variable, d: Vec): Variable {
  switch (x.kind) {
    case 'se2':
      return { kind: 'se2', value: oplus(se2.SE2, x.value, d) };
    case 'se3':
      return { kind: 'se3', value: oplus(se3.SE3, x.value, d) };
    default:
      return { kind: x.kind, value: x.value.map((v, i) => v + d[i]!) } as Variable;
  }
}

/** An ordering of the variables with the offset of each in the stacked tangent vector. */
export interface Ordering {
  keys: Key[];
  index: Map<Key, number>;
  offset: number[];
  dims: number[];
  /** Total dimension. */
  dim: number;
}

export function ordering(v: Values, keys: readonly Key[] = [...v.keys()]): Ordering {
  const index = new Map<Key, number>();
  const offset: number[] = [];
  const dims: number[] = [];
  let o = 0;
  keys.forEach((k, i) => {
    index.set(k, i);
    offset.push(o);
    const d = dimOf(v.get(k)!);
    dims.push(d);
    o += d;
  });
  return { keys: [...keys], index, offset, dims, dim: o };
}

/** Apply a stacked tangent update δ (in the ordering's layout) to every variable. */
export function retract(v: Values, ord: Ordering, delta: Vec): Values {
  const out = new Map(v);
  ord.keys.forEach((k, i) =>
    out.set(k, retractVar(v.get(k)!, delta.subarray(ord.offset[i]!, ord.offset[i]! + ord.dims[i]!))),
  );
  return out;
}
