<script lang="ts">
  import type { Snippet } from 'svelte';
  import { scaleLinear } from 'd3-scale';
  import type { PlotContext } from './plot';

  interface Props {
    xDomain: [number, number];
    yDomain: [number, number];
    /** Same pixel size for one unit on both axes (needed for honest ellipses). */
    equalAspect?: boolean;
    /** Height/width ratio when not equalAspect. */
    aspect?: number;
    maxHeight?: number;
    margin?: { top: number; right: number; bottom: number; left: number };
    /** Accessible label for the SVG. */
    label: string;
    /** Drawn on a canvas layer behind the SVG (e.g. many samples). */
    underlay?: Snippet<[PlotContext]>;
    children: Snippet<[PlotContext]>;
  }

  let {
    xDomain,
    yDomain,
    equalAspect = false,
    aspect = 0.6,
    maxHeight = 560,
    margin = { top: 12, right: 12, bottom: 32, left: 40 },
    label,
    underlay,
    children,
  }: Props = $props();

  const uid = $props.id();
  let clientWidth = $state(0);
  let svgEl: SVGSVGElement | undefined = $state();

  const ctx: PlotContext = $derived.by(() => {
    const width = clientWidth > 0 ? clientWidth : 560;
    const xs = xDomain[1] - xDomain[0];
    const ys = yDomain[1] - yDomain[0];
    let iw = width - margin.left - margin.right;
    let ih = equalAspect ? (iw * ys) / xs : iw * aspect;
    if (ih + margin.top + margin.bottom > maxHeight) {
      ih = maxHeight - margin.top - margin.bottom;
      if (equalAspect) iw = (ih * xs) / ys;
    }
    const left = margin.left + (width - margin.left - margin.right - iw) / 2;
    const top = margin.top;
    const height = ih + margin.top + margin.bottom;
    const x = scaleLinear()
      .domain(xDomain)
      .range([left, left + iw]);
    const y = scaleLinear()
      .domain(yDomain)
      .range([top + ih, top]);
    return {
      x,
      y,
      width,
      height,
      inner: { left, top, right: left + iw, bottom: top + ih },
      uid,
      toData: (e) => {
        const r = svgEl?.getBoundingClientRect();
        if (!r || r.width === 0) return [x.invert(0), y.invert(0)];
        const px = ((e.clientX - r.left) * width) / r.width;
        const py = ((e.clientY - r.top) * height) / r.height;
        return [x.invert(px), y.invert(py)];
      },
    };
  });
</script>

<div class="plot" bind:clientWidth style:height="{ctx.height}px">
  {#if underlay}{@render underlay(ctx)}{/if}
  <svg
    bind:this={svgEl}
    width={ctx.width}
    height={ctx.height}
    viewBox="0 0 {ctx.width} {ctx.height}"
    role="group"
    aria-label={label}
  >
    <defs>
      <clipPath id="{uid}-clip">
        <rect
          x={ctx.inner.left}
          y={ctx.inner.top}
          width={ctx.inner.right - ctx.inner.left}
          height={ctx.inner.bottom - ctx.inner.top}
        />
      </clipPath>
    </defs>
    {@render children(ctx)}
  </svg>
</div>

<style>
  .plot {
    position: relative;
    width: 100%;
    touch-action: pan-y;
    user-select: none;
    -webkit-user-select: none;
  }
  svg {
    position: absolute;
    inset: 0;
    display: block;
    overflow: visible;
  }
  svg :global(text) {
    font-family: var(--font-ui);
  }
</style>
