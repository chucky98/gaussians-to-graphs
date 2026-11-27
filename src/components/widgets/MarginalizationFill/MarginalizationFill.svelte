<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import { MARG, margEdges, marginalizeView } from '../../../lib/demos/sparsity';

  let removed = $state<number[]>([]);
  const view = $derived(marginalizeView(removed));
  const edges = margEdges();
  const isLoop = (a: number, b: number) => MARG.loops.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const alive = (a: number, b: number) => !removed.includes(a) && !removed.includes(b);
  const isInduced = (a: number, b: number) => view.induced.some(([x, y]) => x === a && y === b);

  function toggle(i: number) {
    removed = removed.includes(i) ? removed.filter((r) => r !== i) : [...removed, i].sort((a, b) => a - b);
  }
  function slideWindow() {
    const oldest = view.kept[0];
    if (oldest !== undefined && view.kept.length > 1) removed = [...removed, oldest].sort((a, b) => a - b);
  }
  function reset() {
    removed = [];
  }
  const k = $derived(view.kept.length);
  const live = $derived(
    `${removed.length} poses marginalized. ${view.pairs.length} pairs of the remaining poses are linked, ${view.induced.length} of them by marginalization.`,
  );
</script>

<WidgetFrame
  name="MarginalizationFill"
  title="Marginalization fills in"
  description="A loop of twelve poses with three loop closures. Click a pose to marginalize it out: the poses it was linked to become linked to each other by a new, dense factor."
  {live}
  onreset={reset}
>
  {#snippet figure()}
    <Plot2D
      xDomain={[-0.6, 4.6]}
      yDomain={[-0.6, 2.6]}
      equalAspect
      maxHeight={300}
      margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
      label="The pose graph: kept poses, marginalized poses, original factors and induced links"
    >
      {#snippet children(ctx)}
        {#each edges as [a, b] (a + '-' + b)}
          {@const p = MARG.poses[a]!}
          {@const q = MARG.poses[b]!}
          <line
            class={isLoop(a, b) ? 'e loop' : 'e odo'}
            class:gone={!alive(a, b)}
            x1={ctx.x(p[0])}
            y1={ctx.y(p[1])}
            x2={ctx.x(q[0])}
            y2={ctx.y(q[1])}
          />
        {/each}
        {#each view.pairs as [a, b] (a + '/' + b)}
          {#if isInduced(a, b)}
            {@const p = MARG.poses[a]!}
            {@const q = MARG.poses[b]!}
            <path
              class="e induced"
              d="M{ctx.x(p[0])},{ctx.y(p[1])} Q{ctx.x((p[0] + q[0]) / 2 + (q[1] - p[1]) * 0.18)},{ctx.y(
                (p[1] + q[1]) / 2 - (q[0] - p[0]) * 0.18,
              )} {ctx.x(q[0])},{ctx.y(q[1])}"
            />
          {/if}
        {/each}
        {#each MARG.poses as p, i (i)}
          <g
            class="node"
            class:removed={removed.includes(i)}
            role="switch"
            aria-checked={removed.includes(i)}
            aria-label="Marginalize pose {i}"
            tabindex="0"
            data-pose={i}
            onclick={() => toggle(i)}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(i))}
          >
            <circle cx={ctx.x(p[0])} cy={ctx.y(p[1])} r="14" />
            <text x={ctx.x(p[0])} y={ctx.y(p[1])}>{i}</text>
          </g>
        {/each}
      {/snippet}
    </Plot2D>
    <Legend
      items={[
        { kind: 'odom', label: 'odometry factors' },
        { kind: 'meas', label: 'loop closures' },
        { kind: 'prior', label: 'new links from marginalization' },
      ]}
    />
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Poses kept</dt>
      <dd data-readout="kept">{k} of {MARG.poses.length}</dd>
      <dt>Linked pairs among them</dt>
      <dd data-readout="pairs">{view.pairs.length}</dd>
      <dt>…created by marginalization</dt>
      <dd data-readout="induced">{view.induced.length}</dd>
      <dt>Nonzero blocks of Λ</dt>
      <dd data-readout="blocks">{view.blocks} of {k * k}</dd>
    </dl>
  {/snippet}

  {#snippet controls()}
    <button type="button" class="btn" data-action="slide" onclick={slideWindow} disabled={k <= 1}>
      Marginalize the oldest pose
    </button>
    <p class="hint">Or click any pose to marginalize it, and click it again to bring it back.</p>
  {/snippet}

  {#snippet caption()}
    Twelve poses around a block, linked by odometry and three loop closures (0–11, 2–9, 4–7). Marginalizing a pose
    removes it from the estimate but keeps what it said about the others: the Schur complement turns its factors into
    one new factor on all of its neighbours, drawn as dashed curves. <strong>What to look for:</strong> each marginalized
    pose links all its neighbours to each other; keep marginalizing the oldest pose, as a sliding-window estimator does, and
    the remaining poses become ever more densely linked, until almost every pair is.
  {/snippet}
</WidgetFrame>

<style>
  .e {
    stroke-width: 2;
    fill: none;
  }
  .e.odo {
    stroke: var(--c-odom);
    stroke-dasharray: var(--dash-odom);
  }
  .e.loop {
    stroke: var(--c-meas);
    stroke-dasharray: var(--dash-meas);
  }
  .e.gone {
    opacity: 0.15;
  }
  .e.induced {
    stroke: var(--c-prior);
    stroke-dasharray: var(--dash-prior);
  }
  .node {
    cursor: pointer;
  }
  .node circle {
    fill: var(--c-bg);
    stroke: var(--c-post);
    stroke-width: 2;
  }
  .node.removed circle {
    stroke: var(--c-muted);
    stroke-dasharray: 3 3;
    fill: var(--c-surface);
  }
  .node:focus-visible circle {
    stroke: var(--c-focus);
    stroke-width: 3;
  }
  .node text {
    font-size: 12px;
    text-anchor: middle;
    dominant-baseline: central;
    fill: var(--c-fg);
    pointer-events: none;
  }
  .node.removed text {
    fill: var(--c-muted);
  }
  .hint {
    margin: 0;
    font-size: 0.8rem;
    color: var(--c-muted);
  }
  .ro {
    display: grid;
    grid-template-columns: auto auto;
    gap: 0.25rem 0.75rem;
    margin: 0;
    font-size: 0.85rem;
  }
  .ro dt {
    color: var(--c-muted);
  }
  .ro dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
