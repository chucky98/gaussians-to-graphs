<script lang="ts">
  import { ellipsePoints } from '../../lib/math/gaussian';
  import type { Mat } from '../../lib/math/matrix';
  import type { PlotContext } from './plot';
  import type { SemanticKind } from './semantic';

  interface Props {
    ctx: PlotContext;
    mean: [number, number];
    cov: Mat;
    /** Probability mass inside the drawn ellipse. Default 0.95 (DESIGN rule 8). */
    prob?: number;
    kind?: SemanticKind;
    fill?: boolean;
    thin?: boolean;
    clip?: boolean;
  }
  let { ctx, mean, cov, prob = 0.95, kind = 'post', fill = false, thin = false, clip = true }: Props = $props();

  const d = $derived.by(() => {
    const pts = ellipsePoints({ mean: Float64Array.from(mean), cov }, prob, 96);
    return 'M' + pts.map(([px, py]) => `${ctx.x(px).toFixed(2)},${ctx.y(py).toFixed(2)}`).join('L') + 'Z';
  });
</script>

<path class="ell {kind}" class:fill class:thin {d} clip-path={clip ? `url(#${ctx.uid}-clip)` : undefined} />

<style>
  .ell {
    fill: none;
    stroke-width: var(--stroke-base);
  }
  .post {
    stroke: var(--c-post);
    stroke-width: var(--stroke-thick);
  }
  .post.fill {
    fill: color-mix(in srgb, var(--c-post) 10%, transparent);
  }
  .prior {
    stroke: var(--c-prior);
    stroke-dasharray: var(--dash-prior);
  }
  .prior.fill {
    fill: color-mix(in srgb, var(--c-prior) 8%, transparent);
  }
  .meas {
    stroke: var(--c-meas);
    stroke-dasharray: var(--dash-meas);
  }
  .truth {
    stroke: var(--c-truth);
    stroke-width: var(--stroke-thin);
  }
  .bad {
    stroke: var(--c-bad);
    stroke-width: var(--stroke-thick);
  }
  .odom {
    stroke: var(--c-odom);
    stroke-dasharray: var(--dash-odom);
  }
  .sample {
    stroke: var(--c-sample);
  }
  .thin {
    stroke-width: var(--stroke-thin);
  }
</style>
