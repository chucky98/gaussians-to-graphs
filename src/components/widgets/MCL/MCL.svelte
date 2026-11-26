<script lang="ts">
  import { untrack } from 'svelte';
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import PointsCanvas from '../../primitives/PointsCanvas.svelte';
  import Robot2D from '../../primitives/Robot2D.svelte';
  import Landmark from '../../primitives/Landmark.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import Select from '../../primitives/Select.svelte';
  import Toggle from '../../primitives/Toggle.svelte';
  import PlayControls from '../../primitives/PlayControls.svelte';
  import SeedControl from '../../primitives/SeedControl.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import { createAnimationLoop } from '../../primitives/animation.svelte';
  import type { PlotContext } from '../../primitives/plot';
  import { HALL, route } from '../../../lib/demos/ekf-localization';
  import { MCL, MCL_DEFAULTS as D, simulateTruth, type MclParams, type StepSummary } from '../../../lib/demos/mcl';
  import type { ResamplingScheme } from '../../../lib/filters/pf';

  interface Props {
    /** Step at which the widget opens. */
    start?: number;
    /** Open with the robot already kidnapped after this step. */
    kidnap?: number | null;
  }
  let { start = 0, kidnap: kidnapProp = null }: Props = $props();
  const startK = (): number => start;
  const startKidnap = (): number | null => kidnapProp;

  const N = route().length;
  let np = $state<number>(D.np);
  let scheme = $state<ResamplingScheme>(D.scheme);
  let inject = $state<boolean>(D.inject);
  let kidnapAt = $state<number | null>(startKidnap());
  let seed = $state<number>(MCL.seed);
  let showTruth = $state(true);
  let k = $state<number>(startK());

  const params = $derived<MclParams>({ np, scheme, inject, kidnapAt });
  const truth = $derived(simulateTruth(kidnapAt, seed));

  // ------------------------------------------------------------ worker
  let xy = $state<Float64Array>(new Float64Array(0));
  let summaries = $state<StepSummary[]>([]);
  let shownStep = $state(-1);
  let busy = $state(false);
  let worker: Worker | null = null;
  let reqId = 0;
  let latest = 0;
  $effect(() => {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<{ id: number; step: number; xy: Float64Array; summaries: StepSummary[] }>) => {
      if (e.data.id !== latest) return; // a newer request is on its way
      xy = e.data.xy;
      summaries = e.data.summaries;
      shownStep = e.data.step;
      busy = false;
    };
    worker = w;
    untrack(send);
    return () => {
      w.terminate();
      worker = null;
    };
  });
  function send() {
    if (!worker) return;
    latest = ++reqId;
    busy = true;
    worker.postMessage({ id: latest, params: $state.snapshot(params), seed, upto: k });
  }
  $effect(() => {
    // Re-request whenever the step or any setting changes.
    void k;
    void params;
    void seed;
    send();
  });

  const loop = createAnimationLoop(
    () => {
      if (busy) return true; // wait for the worker before advancing
      if (k >= N) return false;
      k += 1;
      return k < N;
    },
    { fps: 10 },
  );
  function togglePlay() {
    if (!loop.playing && k >= N) k = 0;
    loop.toggle();
  }
  function kidnap() {
    if (k >= 1 && kidnapAt === null) kidnapAt = k;
  }
  function reset() {
    loop.pause();
    np = D.np;
    scheme = D.scheme;
    inject = D.inject;
    kidnapAt = startKidnap();
    seed = MCL.seed;
    showTruth = true;
    k = startK();
  }

  const cur = $derived(shownStep > 0 ? summaries[shownStep - 1]! : null);
  const truePose = $derived(shownStep > 0 ? truth.truths[shownStep - 1]! : Float64Array.from(HALL.start));
  const poly = (ctx: PlotContext, n: number) =>
    [Float64Array.from(HALL.start), ...truth.truths.slice(0, n)]
      // Break the line at a kidnapping: the robot was carried, not driven.
      .map((q, i) => `${i && i !== kidnapAt ? 'L' : 'M'}${ctx.x(q[0]!).toFixed(1)},${ctx.y(q[1]!).toFixed(1)}`)
      .join('');
  function essPath(ctx: PlotContext, key: 'ess' | 'near') {
    let d = `M${ctx.x(0)},${ctx.y(key === 'ess' ? 1 : 0)}`;
    summaries.forEach((s, i) => {
      const v = key === 'ess' ? s.ess / np : s.near;
      d += `L${ctx.x((i + 1) * HALL.dt).toFixed(1)},${ctx.y(v).toFixed(1)}`;
    });
    return d;
  }
  const W = MCL.walls;
  const pct = (v: number) => `${Math.round(100 * v)}%`;
  const live = $derived(
    `t = ${(shownStep * HALL.dt).toFixed(1)} s, ${np} particles. ` +
      (cur
        ? `Effective sample size ${Math.round(cur.ess)}. ${pct(cur.near)} of the weight within 1 metre of the robot.`
        : 'Particles spread uniformly over the hall.'),
  );
</script>

<WidgetFrame
  name="MCL"
  title="Monte Carlo localization"
  description="A robot that does not know where it is drives a loop through a hall with eight identical reflective markers. A particle filter represents its belief by thousands of sampled poses; a chart shows the effective sample size and the weight near the true position over time."
  {live}
  onreset={reset}
  attach={loop.observe}
>
  {#snippet figure()}
    <Plot2D
      xDomain={[W.x[0] - 1, W.x[1] + 1]}
      yDomain={[W.y[0] - 1, W.y[1] + 1]}
      equalAspect
      maxHeight={380}
      margin={{ top: 8, right: 12, bottom: 32, left: 36 }}
      label="Hall with markers, particles and the robot"
    >
      {#snippet underlay(ctx)}<PointsCanvas {ctx} points={xy} radius={1.3} opacity={0.5} />{/snippet}
      {#snippet children(ctx)}
        <Axes {ctx} xTicks={6} yTicks={4} xLabel="x (m)" yLabel="y (m)" />
        <rect
          class="walls"
          x={ctx.x(W.x[0])}
          y={ctx.y(W.y[1])}
          width={ctx.x(W.x[1]) - ctx.x(W.x[0])}
          height={ctx.y(W.y[0]) - ctx.y(W.y[1])}
        />
        <g clip-path="url(#{ctx.uid}-clip)">
          {#if showTruth}
            <path class="truth" d={poly(ctx, shownStep)} />
          {/if}
          {#if cur}
            <circle class="est" cx={ctx.x(cur.mean[0])} cy={ctx.y(cur.mean[1])} r="5" />
          {/if}
        </g>
        {#each HALL.landmarks as [lx, ly], i (i)}<Landmark {ctx} x={lx} y={ly} />{/each}
        {#if showTruth}<Robot2D
            {ctx}
            x={truePose[0]!}
            y={truePose[1]!}
            theta={truePose[2]!}
            kind="truth"
            size={18}
          />{/if}
      {/snippet}
    </Plot2D>
    <Legend
      items={[
        { kind: 'sample', label: `${np} particles` },
        { kind: 'post', label: 'weighted mean of the particles' },
        ...(showTruth ? [{ kind: 'truth' as const, label: 'robot and its true path' }] : []),
      ]}
    />
    <div class="chart">
      <Plot2D
        xDomain={[0, N * HALL.dt]}
        yDomain={[0, 1]}
        aspect={0.28}
        maxHeight={160}
        margin={{ top: 8, right: 12, bottom: 30, left: 36 }}
        label="Effective sample size as a fraction of the particles, and the weight within 1 metre of the robot"
      >
        {#snippet children(ctx)}
          <Axes {ctx} xTicks={6} yTicks={2} xLabel="time (s)" />
          <g clip-path="url(#{ctx.uid}-clip)">
            {#if kidnapAt !== null}
              <line
                class="kid"
                x1={ctx.x(kidnapAt * HALL.dt)}
                x2={ctx.x(kidnapAt * HALL.dt)}
                y1={ctx.inner.top}
                y2={ctx.inner.bottom}
              />
            {/if}
            <path class="ess" d={essPath(ctx, 'ess')} />
            {#if showTruth}<path class="near" d={essPath(ctx, 'near')} />{/if}
          </g>
        {/snippet}
      </Plot2D>
      <p class="note">
        Solid: N<sub>eff</sub> / N<sub>p</sub>.{showTruth
          ? ' Thin: share of the weight within 1 m of the robot.'
          : ''}{kidnapAt !== null ? ' Dashed: the kidnapping.' : ''}
      </p>
    </div>
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Time</dt>
      <dd data-readout="time">{(shownStep * HALL.dt).toFixed(1)} s{busy ? ' …' : ''}</dd>
      <dt>Effective sample size</dt>
      <dd data-readout="ess">{cur ? Math.round(cur.ess) : np} of {np}</dd>
      <dt>Weight within 1 m</dt>
      <dd data-readout="near">{showTruth ? (cur ? pct(cur.near) : '—') : 'hidden'}</dd>
      <dt>Mean − truth</dt>
      <dd data-readout="err">{showTruth && cur ? `${cur.err.toFixed(2)} m` : '—'}</dd>
      <dt>Random particles added</dt>
      <dd data-readout="injected">{cur ? cur.injected : 0}</dd>
    </dl>
  {/snippet}

  {#snippet controls()}
    <PlayControls playing={loop.playing} ontoggle={togglePlay} onstep={() => (k = k >= N ? 0 : k + 1)} what="robot" />
    <Slider
      label="Time"
      min={0}
      max={N}
      step={1}
      bind:value={k}
      format={(v) => `${(v * HALL.dt).toFixed(1)} s`}
      oninput={() => loop.pause()}
    />
    <button type="button" class="btn" data-action="kidnap" onclick={kidnap} disabled={k < 1 || kidnapAt !== null}>
      {kidnapAt === null ? 'Kidnap the robot now' : `Kidnapped at ${(kidnapAt * HALL.dt).toFixed(1)} s`}
    </button>
    <Select
      label="Particles"
      value={np}
      options={MCL.npOptions.map((v) => ({ value: v, label: String(v) }))}
      onchange={(v) => (np = Number(v))}
    />
    <Select
      label="Resampling"
      value={scheme}
      options={[
        { value: 'systematic', label: 'Systematic' },
        { value: 'stratified', label: 'Stratified' },
        { value: 'multinomial', label: 'Multinomial' },
      ]}
      onchange={(v) => (scheme = v)}
    />
    <Toggle label="Add random particles when readings stop fitting (augmented MCL)" bind:checked={inject} />
    <Toggle label="Show the truth" bind:checked={showTruth} />
    <SeedControl bind:seed defaultSeed={MCL.seed} />
  {/snippet}

  {#snippet caption()}
    The robot starts at the lower left with no idea where it is: the particles are spread uniformly over the hall with
    random headings. Each step every particle is moved by the noisy motion model and weighted by how well it explains
    the lidar readings; since the markers are identical, a reading counts as explained by any marker in the right place.
    When the effective sample size falls below half the particles, they are resampled. The run is computed in a
    background worker. <strong>What to look for:</strong> the cloud splits into a few clusters that match the readings, then
    collapses onto the robot within seconds; after a kidnapping, a plain particle filter has no particles left near the robot
    and cannot recover, unless random particles are added.
  {/snippet}
</WidgetFrame>

<style>
  .walls {
    fill: none;
    stroke: var(--c-fg);
    stroke-width: 3;
  }
  .truth {
    fill: none;
    stroke: var(--c-truth);
    stroke-width: var(--stroke-thin);
  }
  .est {
    fill: var(--c-post);
    stroke: var(--c-bg);
    stroke-width: 1.5;
  }
  .ess {
    fill: none;
    stroke: var(--c-post);
    stroke-width: 2;
  }
  .near {
    fill: none;
    stroke: var(--c-truth);
    stroke-width: 1.25;
  }
  .kid {
    stroke: var(--c-bad);
    stroke-dasharray: 4 3;
    stroke-width: 1.5;
  }
  .chart {
    margin-top: var(--space-3);
  }
  .note {
    margin: 0.2rem 0 0;
    font-size: 0.78rem;
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
