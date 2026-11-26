import type { ScaleLinear } from 'd3-scale';

export interface PlotContext {
  x: ScaleLinear<number, number>;
  y: ScaleLinear<number, number>;
  /** Full SVG size in px. */
  width: number;
  height: number;
  /** Inner plotting rectangle in px. */
  inner: { left: number; top: number; right: number; bottom: number };
  /** Convert a pointer event to data coordinates. */
  toData: (e: { clientX: number; clientY: number }) => [number, number];
  /** Unique id prefix for defs (clip paths, markers). */
  uid: string;
}
