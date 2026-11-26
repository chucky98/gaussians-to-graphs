<script lang="ts">
  import type { PlotContext } from './plot';
  import { readToken, watchTheme } from './theme.svelte';

  interface Props {
    ctx: PlotContext;
    /** One interleaved [x0, y0, x1, y1, …] array per polyline, in data coordinates. */
    paths: Float64Array[];
    /** Draw only the first `count` points of each path (default: all). */
    count?: number;
    colorToken?: string;
    /** CSS custom property holding a dash pattern such as '2 4' (or 'none'). */
    dashToken?: string;
    width?: number;
    opacity?: number;
    /** Radius of a dot drawn at each path's last drawn point (0 = none). */
    endRadius?: number;
  }
  let {
    ctx,
    paths,
    count,
    colorToken = '--c-odom',
    dashToken,
    width = 1.25,
    opacity = 0.7,
    endRadius = 0,
  }: Props = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  let themeTick = $state(0);

  $effect(() => {
    const c = canvas;
    if (!c) return;
    void themeTick;
    const dpr = window.devicePixelRatio || 1;
    const { width: W, height: H, inner, x, y } = ctx;
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.save();
    g.beginPath();
    g.rect(inner.left, inner.top, inner.right - inner.left, inner.bottom - inner.top);
    g.clip();
    const color = readToken(c, colorToken);
    const dashRaw = dashToken ? readToken(c, dashToken) : 'none';
    const dash =
      dashRaw === 'none' || dashRaw === ''
        ? []
        : dashRaw
            .split(/[\s,]+/)
            .map(Number)
            .filter((v) => v >= 0);
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = width;
    g.lineJoin = 'round';
    g.globalAlpha = opacity;
    g.setLineDash(dash);
    for (const p of paths) {
      const n = Math.min(count ?? p.length / 2, p.length / 2);
      if (n < 1) continue;
      g.beginPath();
      g.moveTo(x(p[0]!), y(p[1]!));
      for (let i = 1; i < n; i++) g.lineTo(x(p[2 * i]!), y(p[2 * i + 1]!));
      g.stroke();
    }
    if (endRadius > 0) {
      g.setLineDash([]);
      g.globalAlpha = Math.min(1, opacity + 0.2);
      g.beginPath();
      for (const p of paths) {
        const n = Math.min(count ?? p.length / 2, p.length / 2);
        if (n < 1) continue;
        const px = x(p[2 * (n - 1)]!);
        const py = y(p[2 * (n - 1) + 1]!);
        g.moveTo(px + endRadius, py);
        g.arc(px, py, endRadius, 0, 2 * Math.PI);
      }
      g.fill();
    }
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
