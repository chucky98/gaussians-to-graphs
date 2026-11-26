<script lang="ts">
  import type { PlotContext } from './plot';
  import type { SemanticKind } from './semantic';

  interface Props {
    ctx: PlotContext;
    x: number;
    y: number;
    /** Heading in radians (world frame, counter-clockwise from +x). */
    theta: number;
    kind?: SemanticKind;
    /** Glyph length in pixels. */
    size?: number;
  }
  let { ctx, x, y, theta, kind = 'post', size = 16 }: Props = $props();
  // Screen y points down, so a world heading θ is a screen rotation of −θ.
  const deg = $derived((-theta * 180) / Math.PI);
  const h = $derived(size / 2);
</script>

<g class="robot {kind}" transform="translate({ctx.x(x)},{ctx.y(y)}) rotate({deg})" aria-hidden="true">
  <path d="M{h},0 L{-h},{-h * 0.75} L{-h * 0.5},0 L{-h},{h * 0.75} Z" />
</g>

<style>
  path {
    stroke-width: 1.5;
    stroke-linejoin: round;
  }
  .truth path {
    fill: var(--c-bg);
    stroke: var(--c-truth);
  }
  .post path {
    fill: var(--c-post);
    stroke: var(--c-post);
  }
  .prior path {
    fill: none;
    stroke: var(--c-prior);
    stroke-dasharray: 3 2;
  }
  .odom path {
    fill: var(--c-odom);
    stroke: var(--c-odom);
  }
  .bad path {
    fill: var(--c-bad);
    stroke: var(--c-bad);
  }
  .meas path,
  .sample path {
    fill: none;
    stroke: var(--c-meas);
  }
</style>
