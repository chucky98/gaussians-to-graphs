<script lang="ts">
  import type { PlotContext } from './plot';
  import { readToken, watchTheme } from './theme.svelte';
  import { parseColor } from './color';

  interface Props {
    ctx: PlotContext;
    /** Row-major values, row 0 at the top of the plot's inner rectangle. */
    values: Float64Array;
    nx: number;
    ny: number;
    /** Value mapped to the high color (default: the maximum). Values ≤ 0 map to the low color. */
    vmax?: number;
    loToken?: string;
    hiToken?: string;
  }
  let { ctx, values, nx, ny, vmax, loToken = '--c-seq-lo', hiToken = '--c-seq-hi' }: Props = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  let themeTick = $state(0);

  $effect(() => {
    const c = canvas;
    if (!c) return;
    void themeTick;
    const dpr = window.devicePixelRatio || 1;
    const { width, height, inner } = ctx;
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    const g = c.getContext('2d');
    if (!g) return;
    const lo = parseColor(readToken(c, loToken));
    const hi = parseColor(readToken(c, hiToken));
    let max = vmax ?? 0;
    if (vmax === undefined) for (let i = 0; i < values.length; i++) max = Math.max(max, values[i]!);
    const off = document.createElement('canvas');
    off.width = nx;
    off.height = ny;
    const og = off.getContext('2d')!;
    const img = og.createImageData(nx, ny);
    for (let i = 0; i < nx * ny; i++) {
      const t = max > 0 ? Math.min(1, Math.max(0, values[i]! / max)) : 0;
      img.data[4 * i] = lo[0] + t * (hi[0] - lo[0]);
      img.data[4 * i + 1] = lo[1] + t * (hi[1] - lo[1]);
      img.data[4 * i + 2] = lo[2] + t * (hi[2] - lo[2]);
      img.data[4 * i + 3] = 255;
    }
    og.putImageData(img, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    g.imageSmoothingEnabled = true;
    g.drawImage(off, inner.left, inner.top, inner.right - inner.left, inner.bottom - inner.top);
  });
</script>

<canvas
  bind:this={canvas}
  style:width="{ctx.width}px"
  style:height="{ctx.height}px"
  aria-hidden="true"
  {@attach watchTheme(() => themeTick++)}
></canvas>

<style>
  canvas {
    position: absolute;
    inset: 0;
    display: block;
    pointer-events: none;
  }
</style>
