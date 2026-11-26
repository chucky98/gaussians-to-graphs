<script lang="ts">
  import type { PlotContext } from './plot';

  interface Props {
    ctx: PlotContext;
    x: number;
    y: number;
    label?: string;
    size?: number;
  }
  let { ctx, x, y, label, size = 11 }: Props = $props();
  const h = $derived(size / 2);
</script>

<g class="landmark" transform="translate({ctx.x(x)},{ctx.y(y)})" aria-hidden="true">
  <path d="M{-h},{-h}h{size}v{size}h{-size}z" />
  <path class="x" d="M{-h * 0.55},{-h * 0.55}l{h * 1.1},{h * 1.1}m0,{-h * 1.1}l{-h * 1.1},{h * 1.1}" />
  {#if label}<text x={h + 3} y={-h - 2}>{label}</text>{/if}
</g>

<style>
  path {
    fill: var(--c-bg);
    stroke: var(--c-fg);
    stroke-width: 1.5;
  }
  .x {
    fill: none;
    stroke-width: 1.25;
  }
  text {
    font-size: 11px;
    font-weight: 600;
    fill: var(--c-fg);
    paint-order: stroke;
    stroke: var(--c-bg);
    stroke-width: 3px;
  }
</style>
