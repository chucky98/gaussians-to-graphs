<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import PlayControls from '../../primitives/PlayControls.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import { createAnimationLoop } from '../../primitives/animation.svelte';
  import type { PlotContext } from '../../primitives/plot';
  import { INCR, incrementalData, incrementalRun } from '../../../lib/demos/incremental';

  const d = incrementalData();
  const steps = incrementalRun(d);
  const N = steps.length;
  const firstClosure = steps.find((s) => s.closures.length > 0)!.t;
  let t = $state(N);

  const s = $derived(steps[t - 1]!);
  const affected = $derived(s.affected);
  const cum = $derived(
    steps.slice(0, t).reduce((a, x) => ({ inc: a.inc + x.incremental, bat: a.bat + x.batch }), { inc: 0, bat: 0 }),
  );
  const loop = createAnimationLoop(
    () => {
      t = Math.min(N, t + 1);
      return t < N;
    },
    { fps: 10 },
  );
  function togglePlay() {
    if (!loop.playing && t >= N) t = 1;
    loop.toggle();
  }
  function reset() {
    loop.pause();
    t = N;
  }
  const lg = (v: number) => Math.log10(Math.max(1, v));
  const series = (ctx: PlotContext, key: 'incremental' | 'batch') =>
    steps
      .slice(0, t)
      .map((x, i) => `${i ? 'L' : 'M'}${ctx.x(x.t).toFixed(1)},${ctx.y(lg(x[key])).toFixed(1)}`)
      .join('');
  const fmt = (v: number) => v.toLocaleString('en');
  const live = $derived(
    `Step ${t}: ${s.affected.length} of ${t + 1} poses re-eliminated; work ${fmt(s.incremental)} against ${fmt(s.batch)} for a full refactorization.`,
  );
  const W = 9;
</script>

<WidgetFrame
  name="IncrementalVsBatch"
  title="Incremental vs. batch: what a new measurement changes"
  description="A robot drives through the synthetic city, adding one pose per step. Highlighted poses are the ones whose part of the Cholesky factor must be recomputed after the new measurements: the variables they touch and everything above them in the elimination tree. The chart compares the work of recomputing only those with refactoring everything."
  {live}
  onreset={reset}
  attach={loop.observe}
>
  {#snippet figure()}
    <Plot2D
      xDomain={[-W, W]}
      yDomain={[-W, W]}
      equalAspect
      maxHeight={360}
      margin={{ top: 8, right: 12, bottom: 30, left: 36 }}
      label="Poses so far; the affected poses are highlighted"
    >
      {#snippet children(ctx)}
        <Axes {ctx} xTicks={6} yTicks={6} xLabel="x (m)" yLabel="y (m)" />
        <path
          class="route"
          d={d.truth
            .slice(0, t + 1)
            .map((p, i) => `${i ? 'L' : 'M'}${ctx.x(p.x).toFixed(1)},${ctx.y(p.y).toFixed(1)}`)
            .join('')}
        />
        {#each s.closures as j (j)}
          <line
            class="closure"
            x1={ctx.x(d.truth[j]!.x) + 6}
            y1={ctx.y(d.truth[j]!.y) - 6}
            x2={ctx.x(d.truth[t]!.x) + 6}
            y2={ctx.y(d.truth[t]!.y) - 6}
          />
        {/each}
        {#each d.truth.slice(0, t + 1) as p, i (i)}
          {#if affected.includes(i)}
            <circle class="aff" cx={ctx.x(p.x) + (i % 3) - 1} cy={ctx.y(p.y) + ((i * 7) % 3) - 1} r="3.2" />
          {/if}
        {/each}
        <circle class="now" cx={ctx.x(d.truth[t]!.x)} cy={ctx.y(d.truth[t]!.y)} r="6" />
      {/snippet}
    </Plot2D>
    <Legend
      items={[
        { kind: 'odom', label: 'route so far' },
        { kind: 'post', label: 'poses re-eliminated at this step (●)' },
        { kind: 'meas', label: 'loop closure arriving now' },
      ]}
    />
    <div class="chart">
      <Plot2D
        xDomain={[0, N]}
        yDomain={[0, 6]}
        aspect={0.25}
        maxHeight={150}
        margin={{ top: 8, right: 12, bottom: 30, left: 40 }}
        label="Work per step, logarithmic scale: full refactorization and incremental update"
      >
        {#snippet children(ctx)}
          <Axes {ctx} xTicks={6} yTicks={3} xLabel="step" yLabel="log₁₀ work" />
          <path class="batch" d={series(ctx, 'batch')} />
          <path class="inc" d={series(ctx, 'incremental')} />
          <line class="cursor" x1={ctx.x(t)} x2={ctx.x(t)} y1={ctx.inner.top} y2={ctx.inner.bottom} />
        {/snippet}
      </Plot2D>
      <Legend
        items={[
          { kind: 'odom', label: 'refactor everything (batch)' },
          { kind: 'post', label: 'refactor the affected part (incremental)' },
        ]}
      />
    </div>
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Step (poses)</dt>
      <dd data-readout="t">{t} ({t + 1})</dd>
      <dt>Poses re-eliminated now</dt>
      <dd data-readout="affected">{s.affected.length}</dd>
      <dt>Work now: incremental / batch</dt>
      <dd data-readout="work">{fmt(s.incremental)} / {fmt(s.batch)}</dd>
      <dt>Total so far: batch ÷ incremental</dt>
      <dd data-readout="ratio">{(cum.bat / cum.inc).toFixed(1)}×</dd>
    </dl>
  {/snippet}

  {#snippet controls()}
    <PlayControls playing={loop.playing} ontoggle={togglePlay} onstep={() => (t = t >= N ? 1 : t + 1)} what="steps" />
    <Slider
      label="Step"
      min={1}
      max={N}
      step={1}
      bind:value={t}
      format={(v) => String(v)}
      oninput={() => loop.pause()}
    />
    <button
      type="button"
      class="btn"
      data-action="closure"
      onclick={() => {
        loop.pause();
        t = firstClosure;
      }}
    >
      Go to the first loop closure
    </button>
  {/snippet}

  {#snippet caption()}
    The first {INCR.poses} poses of the city of Post 27, eliminated in the order they were created. Work is counted as Σ c²,
    the sum over the recomputed columns of the factor of the squared number of nonzero blocks in each (no timing). Simplified:
    no reordering and no relinearization, unlike iSAM2. <strong>What to look for:</strong> a plain step re-eliminates only
    the newest two poses, while batch work keeps growing; a loop closure to an old pose re-eliminates everything on the path
    back to it in the elimination tree, a spike that is still smaller than starting over.
  {/snippet}
</WidgetFrame>

<style>
  .route {
    fill: none;
    stroke: var(--c-odom);
    stroke-width: 1.25;
    stroke-dasharray: var(--dash-odom);
  }
  .aff {
    fill: var(--c-post);
  }
  .now {
    fill: none;
    stroke: var(--c-truth);
    stroke-width: 2;
  }
  .closure {
    stroke: var(--c-meas);
    stroke-width: 2;
    stroke-dasharray: var(--dash-meas);
  }
  .chart {
    margin-top: var(--space-2);
  }
  .batch {
    fill: none;
    stroke: var(--c-odom);
    stroke-width: 1.5;
    stroke-dasharray: var(--dash-odom);
  }
  .inc {
    fill: none;
    stroke: var(--c-post);
    stroke-width: 1.5;
  }
  .cursor {
    stroke: var(--c-axis);
    stroke-dasharray: 2 3;
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
