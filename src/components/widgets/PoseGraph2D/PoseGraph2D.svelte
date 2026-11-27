<script lang="ts">
  import { untrack } from 'svelte';
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import Select from '../../primitives/Select.svelte';
  import Toggle from '../../primitives/Toggle.svelte';
  import SeedControl from '../../primitives/SeedControl.svelte';
  import PlayControls from '../../primitives/PlayControls.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import { createAnimationLoop } from '../../primitives/animation.svelte';
  import type { PlotContext } from '../../primitives/plot';
  import {
    PG,
    type PgIteration,
    type PgPreset,
    type PgRequest,
    type PgSetup,
  } from '../../../lib/demos/pose-graph-demo';

  let preset = $state<PgPreset>('default');
  let poses = $state<number>(PG.base.poses);
  let sigmaTheta = $state<number>(PG.presets.default.sigmaTheta);
  let seed = $state<number>(PG.base.seed);
  let method = $state<'gn' | 'lm'>('lm');
  let useLoops = $state(true);
  const req = $derived<PgRequest>({ poses, sigmaTheta, seed, method, useLoops });

  // ------------------------------------------------------------ worker
  let setup = $state<PgSetup | null>(null);
  let iterations = $state<PgIteration[]>([]);
  let solving = $state(false);
  let k = $state(0);
  let worker: Worker | null = null;
  let latest = 0;
  function createWorker(): Worker {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<{ id: number; type: string; setup?: PgSetup; it?: PgIteration }>) => {
      if (e.data.id !== latest) return;
      if (e.data.type === 'setup') setup = e.data.setup!;
      else if (e.data.type === 'iteration') iterations = [...iterations, e.data.it!];
      else if (e.data.type === 'done') {
        solving = false;
        if (!loop.playing) k = iterations.length - 1;
      }
    };
    return w;
  }
  $effect(() => {
    worker = createWorker();
    untrack(send);
    return () => {
      worker?.terminate();
      worker = null;
    };
  });
  function send() {
    if (!worker) return;
    // A solve in progress is for old settings: drop it by replacing the worker.
    if (solving) {
      worker.terminate();
      worker = createWorker();
    }
    latest++;
    solving = true;
    setup = null;
    iterations = [];
    k = 0;
    worker.postMessage({ id: latest, req: $state.snapshot(req) });
  }
  let first = true;
  $effect(() => {
    void req;
    if (first) {
      first = false;
      return;
    }
    // Debounce slider drags: solve once the value has settled.
    const t = setTimeout(() => untrack(send), 250);
    return () => clearTimeout(t);
  });

  const last = $derived(Math.max(0, iterations.length - 1));
  const it = $derived(iterations[Math.min(k, last)]);
  const loop = createAnimationLoop(
    () => {
      if (k < last) k++;
      return solving || k < last;
    },
    { fps: 2 },
  );
  function togglePlay() {
    if (!loop.playing && k >= last) k = 0;
    loop.toggle();
  }
  function setPreset(p: PgPreset) {
    preset = p;
    sigmaTheta = PG.presets[p].sigmaTheta;
    poses = PG.base.poses;
    seed = PG.base.seed;
    method = 'lm';
    useLoops = true;
  }
  function reset() {
    loop.pause();
    setPreset('default');
  }

  /** A fixed view per run: the truth and the starting guess. */
  const domain = $derived.by(() => {
    const first = iterations[0];
    if (!setup || !first) return { x: [-10, 10] as [number, number], y: [-10, 10] as [number, number] };
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const a of [setup.truth, first.xy])
      for (let i = 0; i < a.length; i += 2) {
        x0 = Math.min(x0, a[i]!);
        x1 = Math.max(x1, a[i]!);
        y0 = Math.min(y0, a[i + 1]!);
        y1 = Math.max(y1, a[i + 1]!);
      }
    return {
      x: [Math.floor(x0 - 1), Math.ceil(x1 + 1)] as [number, number],
      y: [Math.floor(y0 - 1), Math.ceil(y1 + 1)] as [number, number],
    };
  });
  const path = (ctx: PlotContext, xy: Float64Array) => {
    let s = '';
    for (let i = 0; i < xy.length; i += 2)
      s += `${i ? 'L' : 'M'}${ctx.x(xy[i]!).toFixed(1)},${ctx.y(xy[i + 1]!).toFixed(1)}`;
    return s;
  };
  const loopPath = (ctx: PlotContext, xy: Float64Array, pairs: Int32Array) => {
    let s = '';
    for (let q = 0; q < pairs.length; q += 2) {
      const [a, b] = [pairs[q]!, pairs[q + 1]!];
      s += `M${ctx.x(xy[2 * a]!).toFixed(1)},${ctx.y(xy[2 * a + 1]!).toFixed(1)}L${ctx.x(xy[2 * b]!).toFixed(1)},${ctx.y(xy[2 * b + 1]!).toFixed(1)}`;
    }
    return s;
  };
  const sci = (v: number) => (v >= 1e4 ? v.toExponential(2).replace('e+', ' × 10^') : v.toFixed(v < 10 ? 2 : 0));
  const costPlot = $derived.by(() => {
    const c = iterations.map((i) => Math.log10(Math.max(i.cost, 1e-3)));
    return { c, lo: Math.floor(Math.min(...c, 2)), hi: Math.ceil(Math.max(...c, 3)) };
  });
  const pct = (a: number, b: number) => `${((100 * a) / b).toFixed(2)}%`;
  const live = $derived(
    it
      ? `Iteration ${Math.min(k, last)} of ${last}${solving ? ' (still solving)' : ''}. Cost ${sci(it.cost)}, position error ${it.rms.toFixed(2)} metres.`
      : 'Generating and solving the pose graph.',
  );
</script>

<WidgetFrame
  name="PoseGraph2D"
  title="Pose graph optimization: snapping a drifted trajectory into place"
  description="A robot drives a long route through a grid of streets. Its odometry drifts; loop closures say where it has been before. Gauss–Newton or Levenberg–Marquardt iterations move all poses at once; the chart below shows the cost after each iteration."
  {live}
  onreset={reset}
  attach={loop.observe}
>
  {#snippet figure()}
    <Plot2D
      xDomain={domain.x}
      yDomain={domain.y}
      equalAspect
      maxHeight={440}
      margin={{ top: 8, right: 12, bottom: 30, left: 36 }}
      label="True path, current estimate and loop closures"
    >
      {#snippet children(ctx)}
        <Axes {ctx} xTicks={6} yTicks={6} xLabel="x (m)" yLabel="y (m)" />
        <g clip-path="url(#{ctx.uid}-clip)">
          {#if setup}
            <path class="truth" d={path(ctx, setup.truth)} />
            {#if it}
              <path class="loops" d={loopPath(ctx, it.xy, setup.loops)} />
              <path class="est" d={path(ctx, it.xy)} />
            {/if}
          {/if}
        </g>
      {/snippet}
    </Plot2D>
    <Legend
      items={[
        { kind: 'truth', label: 'true route' },
        { kind: 'post', label: 'estimate at this iteration' },
        { kind: 'meas', label: 'loop closures' },
      ]}
    />
    <div class="chart">
      <Plot2D
        xDomain={[0, Math.max(6, last)]}
        yDomain={[costPlot.lo, costPlot.hi]}
        aspect={0.22}
        maxHeight={130}
        margin={{ top: 8, right: 12, bottom: 30, left: 44 }}
        label="Cost after each iteration, logarithmic scale"
      >
        {#snippet children(ctx)}
          <Axes {ctx} xTicks={6} yTicks={3} xLabel="iteration" yLabel="log₁₀ cost" />
          <path
            class="cost"
            d={costPlot.c.map((v, i) => `${i ? 'L' : 'M'}${ctx.x(i).toFixed(1)},${ctx.y(v).toFixed(1)}`).join('')}
          />
          {#each costPlot.c as v, i (i)}
            <circle
              class="pt"
              class:now={i === Math.min(k, last)}
              cx={ctx.x(i)}
              cy={ctx.y(v)}
              r={i === Math.min(k, last) ? 4.5 : 2.5}
            />
          {/each}
        {/snippet}
      </Plot2D>
    </div>
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Poses / odometry / loop closures</dt>
      <dd data-readout="size">{poses} / {setup?.odometry ?? '…'} / {setup ? setup.loops.length / 2 : '…'}</dd>
      <dt>Iteration</dt>
      <dd data-readout="it">{it ? Math.min(k, last) : '…'}{solving ? ' …' : ` of ${last}`}</dd>
      <dt>Cost</dt>
      <dd data-readout="cost">{it ? sci(it.cost) : '…'}</dd>
      <dt>Position error (RMS)</dt>
      <dd data-readout="rms">{it ? `${it.rms.toFixed(2)} m` : '…'}</dd>
      <dt>Time per iteration</dt>
      <dd data-readout="ms">{it && k > 0 ? `${Math.round(it.ms)} ms` : '—'}</dd>
      <dt>Nonzeros in Λ</dt>
      <dd data-readout="nnz">{setup ? pct(setup.lambdaNnz, setup.lambdaSize ** 2) : '…'}</dd>
      <dt>Cholesky fill: natural / min. degree</dt>
      <dd data-readout="fill">
        {setup ? `${setup.fillNatural.toLocaleString('en')} / ${setup.fillMinDegree.toLocaleString('en')}` : '…'}
      </dd>
    </dl>
  {/snippet}

  {#snippet controls()}
    <PlayControls
      playing={loop.playing}
      ontoggle={togglePlay}
      onstep={() => (k = k >= last ? 0 : k + 1)}
      what="iterations"
    />
    <Slider
      label="Iteration"
      min={0}
      max={Math.max(1, last)}
      step={1}
      bind:value={k}
      format={(v) => String(v)}
      oninput={() => loop.pause()}
    />
    <Select
      label="Preset"
      value={preset}
      options={[
        { value: 'default', label: 'Default: σθ = 0.02 rad per move' },
        { value: 'extreme', label: 'Extreme heading drift: σθ = 0.1 rad' },
      ]}
      onchange={(v) => setPreset(v)}
    />
    <Select
      label="Method"
      value={method}
      options={[
        { value: 'lm', label: 'Levenberg–Marquardt' },
        { value: 'gn', label: 'Gauss–Newton' },
      ]}
      onchange={(v) => (method = v)}
    />
    <Toggle label="Use loop closures" bind:checked={useLoops} />
    <Slider
      label="Heading noise per move σθ"
      min={0.005}
      max={0.1}
      step={0.005}
      bind:value={sigmaTheta}
      format={(v) => v.toFixed(3)}
      unit="rad"
    />
    <Select
      label="Poses"
      value={poses}
      options={PG.poseChoices.map((n) => ({ value: n, label: String(n) }))}
      onchange={(v) => (poses = v)}
    />
    <SeedControl bind:seed defaultSeed={PG.base.seed} />
  {/snippet}

  {#snippet caption()}
    A synthetic city: the robot drives 1 m per move along a grid of streets, its odometry noisy in position (5 cm) and
    heading, and recognizes many places it has been before (loop closures, dash-dot lines between the two poses). The
    estimate starts as dead reckoning; each iteration solves the sparse system of Post 26 in a background worker and
    moves every pose. <strong>What to look for:</strong> in a few iterations the twisted trajectory snaps onto the streets
    and the cost falls by three orders of magnitude; without loop closures nothing moves, and with extreme heading drift the
    solver can get stuck in a twisted local minimum.
  {/snippet}
</WidgetFrame>

<style>
  .truth {
    fill: none;
    stroke: var(--c-truth);
    stroke-width: 1;
    opacity: 0.35;
  }
  .est {
    fill: none;
    stroke: var(--c-post);
    stroke-width: 1.5;
  }
  .loops {
    fill: none;
    stroke: var(--c-meas);
    stroke-width: 0.8;
    stroke-dasharray: var(--dash-meas);
    opacity: 0.5;
  }
  .chart {
    margin-top: var(--space-2);
  }
  .cost {
    fill: none;
    stroke: var(--c-post);
    stroke-width: 1.5;
  }
  .pt {
    fill: var(--c-post);
  }
  .pt.now {
    fill: var(--c-bg);
    stroke: var(--c-post);
    stroke-width: 2;
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
