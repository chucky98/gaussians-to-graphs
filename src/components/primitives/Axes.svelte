<script lang="ts">
  import type { PlotContext } from './plot';

  interface Props {
    ctx: PlotContext;
    xLabel?: string;
    yLabel?: string;
    xTicks?: number;
    yTicks?: number;
    grid?: boolean;
    showY?: boolean;
    format?: (v: number) => string;
  }
  let {
    ctx,
    xLabel,
    yLabel,
    xTicks = 8,
    yTicks = 6,
    grid = true,
    showY = true,
    format = (v) => String(+v.toFixed(2)),
  }: Props = $props();
  const xt = $derived(ctx.x.ticks(xTicks));
  const yt = $derived(ctx.y.ticks(yTicks));
</script>

<g class="axes" aria-hidden="true">
  {#if grid}
    {#each xt as t (t)}
      <line class="grid" x1={ctx.x(t)} x2={ctx.x(t)} y1={ctx.inner.top} y2={ctx.inner.bottom} />
    {/each}
    {#if showY}
      {#each yt as t (t)}
        <line class="grid" x1={ctx.inner.left} x2={ctx.inner.right} y1={ctx.y(t)} y2={ctx.y(t)} />
      {/each}
    {/if}
  {/if}
  <line class="axis" x1={ctx.inner.left} x2={ctx.inner.right} y1={ctx.inner.bottom} y2={ctx.inner.bottom} />
  {#each xt as t (t)}
    <text class="tick" x={ctx.x(t)} y={ctx.inner.bottom + 14} text-anchor="middle">{format(t)}</text>
  {/each}
  {#if showY}
    <line class="axis" x1={ctx.inner.left} x2={ctx.inner.left} y1={ctx.inner.top} y2={ctx.inner.bottom} />
    {#each yt as t (t)}
      <text class="tick" x={ctx.inner.left - 6} y={ctx.y(t) + 3.5} text-anchor="end">{format(t)}</text>
    {/each}
  {/if}
  {#if xLabel}
    <text class="label" x={ctx.inner.right} y={ctx.inner.bottom + 28} text-anchor="end">{xLabel}</text>
  {/if}
  {#if yLabel && showY}
    <text class="label" x={ctx.inner.left + 4} y={ctx.inner.top + 10} text-anchor="start">{yLabel}</text>
  {/if}
</g>

<style>
  .grid {
    stroke: var(--c-grid);
    stroke-width: 1;
  }
  .axis {
    stroke: var(--c-axis);
    stroke-width: 1;
  }
  .tick {
    fill: var(--c-muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .label {
    fill: var(--c-muted);
    font-size: 12px;
    font-style: italic;
  }
</style>
