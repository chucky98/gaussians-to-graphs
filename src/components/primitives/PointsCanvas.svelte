<script lang="ts">
  import type { PlotContext } from './plot';
  import { readToken, watchTheme } from './theme.svelte';

  interface Props {
    ctx: PlotContext;
    /** Interleaved data coordinates [x0, y0, x1, y1, ...]. */
    points: Float64Array;
    /** Draw only the first `count` points. */
    count?: number;
    /** CSS custom property holding the color. */
    colorToken?: string;
    radius?: number;
    opacity?: number;
  }
  let { ctx, points, count, colorToken = '--c-sample', radius = 1.8, opacity = 0.55 }: Props = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  let themeTick = $state(0);

  $effect(() => {
    const c = canvas;
    if (!c) return;
    void themeTick;
    const dpr = window.devicePixelRatio || 1;
    const { width, height, inner, x, y } = ctx;
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    g.save();
    g.beginPath();
    g.rect(inner.left, inner.top, inner.right - inner.left, inner.bottom - inner.top);
    g.clip();
    g.fillStyle = readToken(c, colorToken);
    g.globalAlpha = opacity;
    const n = Math.min(count ?? points.length / 2, points.length / 2);
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const px = x(points[2 * i]!);
      const py = y(points[2 * i + 1]!);
      g.moveTo(px + radius, py);
      g.arc(px, py, radius, 0, 2 * Math.PI);
    }
    g.fill();
    g.restore();
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
