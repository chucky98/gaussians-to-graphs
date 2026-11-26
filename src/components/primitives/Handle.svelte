<script lang="ts">
  import { pointerDrag, arrowDelta } from './drag';

  interface Props {
    /** Pixel position. */
    cx: number;
    cy: number;
    label: string;
    valuetext: string;
    valuenow: number;
    valuemin: number;
    valuemax: number;
    onmove: (e: PointerEvent) => void;
    onstart?: (e: PointerEvent) => void;
    /** Arrow keys: [dx, dy] in steps (Shift = ×5). */
    onkey: (d: [number, number]) => void;
    kind?: 'post' | 'meas' | 'prior';
    tag?: string;
  }
  let {
    cx,
    cy,
    label,
    valuetext,
    valuenow,
    valuemin,
    valuemax,
    onmove,
    onstart,
    onkey,
    kind = 'post',
    tag,
  }: Props = $props();
  const drag = pointerDrag(
    (e) => onmove(e),
    (e) => onstart?.(e),
  );
  function keydown(e: KeyboardEvent) {
    const d = arrowDelta(e);
    if (!d) return;
    e.preventDefault();
    onkey(d);
  }
</script>

<g
  class="handle {kind}"
  role="slider"
  tabindex="0"
  aria-label={label}
  aria-valuetext={valuetext}
  aria-valuenow={valuenow}
  aria-valuemin={valuemin}
  aria-valuemax={valuemax}
  transform="translate({cx},{cy})"
  onkeydown={keydown}
  {...drag}
>
  <circle class="hit" r="18" />
  <circle class="ring" r="8" />
  <circle class="dot" r="3" />
  {#if tag}<text x="11" y="-10">{tag}</text>{/if}
</g>

<style>
  .handle {
    cursor: grab;
    touch-action: none;
    outline: none;
  }
  .handle:active {
    cursor: grabbing;
  }
  .hit {
    fill: transparent;
  }
  .ring {
    fill: var(--c-bg);
    stroke-width: 2;
  }
  .post .ring {
    stroke: var(--c-post);
  }
  .post .dot {
    fill: var(--c-post);
  }
  .meas .ring {
    stroke: var(--c-meas);
    stroke-dasharray: 3 2;
  }
  .meas .dot {
    fill: var(--c-meas);
  }
  .prior .ring {
    stroke: var(--c-prior);
  }
  .prior .dot {
    fill: var(--c-prior);
  }
  .handle:hover .ring {
    stroke-width: 3;
  }
  .handle:focus-visible .ring {
    stroke: var(--c-focus);
    stroke-width: 3.5;
  }
  .handle:focus-visible .hit {
    fill: color-mix(in srgb, var(--c-focus) 15%, transparent);
  }
  text {
    font-size: 12px;
    font-weight: 600;
    fill: var(--c-fg);
    paint-order: stroke;
    stroke: var(--c-bg);
    stroke-width: 3px;
  }
</style>
