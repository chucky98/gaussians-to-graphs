<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import CovEllipse from '../../primitives/CovEllipse.svelte';
  import PathsCanvas from '../../primitives/PathsCanvas.svelte';
  import Robot2D from '../../primitives/Robot2D.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import Toggle from '../../primitives/Toggle.svelte';
  import PlayControls from '../../primitives/PlayControls.svelte';
  import SeedControl from '../../primitives/SeedControl.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import { createAnimationLoop } from '../../primitives/animation.svelte';
  import type { Pose2 } from '../../../lib/geometry/se2';
  import type { PlotContext } from '../../primitives/plot';
  import {
    DRIFT_DEFAULTS as D,
    DRIFT_LIMITS as L,
    DRIFT_STEPS,
    rmsCurve,
    rmsHeadingError,
    simulate,
    spreadAt,
    toXY,
  } from '../../../lib/demos/drift-fan';

  let noisePct = $state<number>(D.noisePct);
  let runs = $state<number>(D.runs);
  let seed = $state<number>(D.seed);
  let showTruth = $state<boolean>(D.showTruth);

  const sim = $derived(simulate({ noisePct, runs, seed }));
  /** Current step: 0 … sim.steps. Starts at the end so the full fan is visible without playing. */
  let k = $state<number>(DRIFT_STEPS);
  let speed = $state(1);

  // ------------------------------------------------------------ closing the loop (Part 4), in a worker
  let closeLoop = $state(false);
  let closed = $state<{ key: string; runs: Pose2[][] } | null>(null);
  let closing = $state(false);
  const key = $derived(`${noisePct}|${runs}|${seed}`);
  let worker: Worker | null = null;
  let reqId = 0;
  $effect(() => {
    if (!closeLoop) return;
    const want = key;
    if (closed?.key === want) return;
    worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const id = ++reqId;
    closing = true;
    worker.onmessage = (e: MessageEvent<{ id: number; runs: Pose2[][] }>) => {
      if (e.data.id !== reqId) return;
      closed = { key: want, runs: e.data.runs };
      closing = false;
    };
    worker.postMessage({ id, params: { noisePct, runs, seed } });
  });
  $effect(() => () => worker?.terminate());
  /** What is drawn: dead reckoning, or the loop-closed runs once they are ready. */
  const view = $derived(closeLoop && closed?.key === key ? { ...sim, runs: closed.runs } : sim);
  const runXY = $derived(view.runs.map(toXY));
  const truthXY = $derived(toXY(sim.truth));
  const curve = $derived(rmsCurve(view));
  const curveMax = $derived(Math.max(0.5, ...curve));
  const spread = $derived(spreadAt(view, k));
  const rms = $derived(curve[k] ?? 0);
  const headingDeg = $derived((rmsHeadingError(view, k) * 180) / Math.PI);
  const dist = $derived(sim.distance[k] ?? 0);
  const lap = $derived(k <= sim.lapEnds[0]! ? 1 : 2);

  const loop = createAnimationLoop(
    () => {
      k = Math.min(sim.steps, k + speed);
      return k < sim.steps;
    },
    { fps: 30 },
  );
  function togglePlay() {
    if (!loop.playing && k >= sim.steps) k = 0;
    loop.toggle();
  }
  function step() {
    if (k >= sim.steps) k = 0;
    k = Math.min(sim.steps, k + 10);
  }
  function reset() {
    loop.pause();
    noisePct = D.noisePct;
    runs = D.runs;
    seed = D.seed;
    showTruth = D.showTruth;
    closeLoop = false;
    speed = 1;
    k = DRIFT_STEPS;
  }

  function linePath(ctx: PlotContext, xs: Float64Array, ys: Float64Array, n: number): string {
    let s = '';
    for (let i = 0; i < n; i++) s += `${i === 0 ? 'M' : 'L'}${ctx.x(xs[i]!).toFixed(1)},${ctx.y(ys[i]!).toFixed(1)}`;
    return s;
  }
  function polyline(ctx: PlotContext, xy: Float64Array, n: number): string {
    let s = '';
    for (let i = 0; i < n; i++)
      s += `${i === 0 ? 'M' : 'L'}${ctx.x(xy[2 * i]!).toFixed(1)},${ctx.y(xy[2 * i + 1]!).toFixed(1)}`;
    return s;
  }

  const f2 = (v: number) => v.toFixed(2);
  const live = $derived(
    `After ${dist.toFixed(1)} metres (lap ${lap}), ${runs} odometry-only runs have a root-mean-square position error of ${f2(rms)} metres and a heading error of ${headingDeg.toFixed(1)} degrees.`,
  );
</script>

<WidgetFrame
  name="DriftFan"
  title="Dead reckoning drifts"
  description="A robot drives two laps of a loop. Each grey line is one possible odometry-only estimate of its path; together they fan out as the robot drives. A second plot shows the root-mean-square position error against distance driven."
  {live}
  onreset={reset}
  attach={loop.observe}
>
  {#snippet figure()}
    <Plot2D
      xDomain={L.xDomain}
      yDomain={L.yDomain}
      equalAspect
      maxHeight={440}
      margin={{ top: 10, right: 10, bottom: 28, left: 30 }}
      label="Map of the loop with odometry-only trajectories"
    >
      {#snippet underlay(ctx)}
        <PathsCanvas {ctx} paths={runXY} count={k + 1} colorToken="--c-odom" dashToken="--dash-odom" endRadius={2.4} />
      {/snippet}
      {#snippet children(ctx)}
        <Axes {ctx} xTicks={10} yTicks={7} xLabel="x (m)" yLabel="y (m)" />
        <g clip-path="url(#{ctx.uid}-clip)">
          {#if showTruth}
            <path class="truth" d={polyline(ctx, truthXY, k + 1)} />
          {/if}
          {#if spread}
            <CovEllipse {ctx} mean={spread.mean} cov={spread.cov} kind="prior" />
          {/if}
        </g>
        {#if showTruth}
          <Robot2D {ctx} x={sim.truth[k]!.x} y={sim.truth[k]!.y} theta={sim.truth[k]!.theta} kind="truth" />
        {/if}
      {/snippet}
    </Plot2D>
    <Legend
      items={[
        ...(showTruth ? [{ kind: 'truth' as const, label: 'true path' }] : []),
        {
          kind: 'odom',
          label: `${runs} ${view === sim ? 'odometry-only' : 'loop-closed'} run${runs === 1 ? '' : 's'}`,
        },
        ...(spread ? [{ kind: 'prior' as const, label: '95% ellipse of the runs' }] : []),
      ]}
    />
    <div class="err-plot">
      <Plot2D
        xDomain={[0, sim.distance[sim.steps]!]}
        yDomain={[0, curveMax * 1.1]}
        aspect={0.32}
        maxHeight={200}
        margin={{ top: 10, right: 12, bottom: 30, left: 38 }}
        label="Root-mean-square position error against distance driven"
      >
        {#snippet children(ctx)}
          <Axes {ctx} xTicks={7} yTicks={4} xLabel="distance driven (m)" yLabel="RMS error (m)" />
          {#each sim.lapEnds as e, i (i)}
            <line
              class="lap"
              x1={ctx.x(sim.distance[e]!)}
              x2={ctx.x(sim.distance[e]!)}
              y1={ctx.inner.top}
              y2={ctx.inner.bottom}
            />
            <text class="lapt" x={ctx.x(sim.distance[e]!) - 4} y={ctx.inner.top + 12} text-anchor="end">
              lap {i + 1}
            </text>
          {/each}
          <path class="rms" d={linePath(ctx, sim.distance, curve, k + 1)} />
          <circle class="now" cx={ctx.x(dist)} cy={ctx.y(rms)} r="3.5" />
        {/snippet}
      </Plot2D>
    </div>
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Distance driven</dt>
      <dd>{dist.toFixed(1)} m (lap {lap})</dd>
      <dt>RMS position error</dt>
      <dd data-readout="rms">{f2(rms)} m</dd>
      <dt>RMS heading error</dt>
      <dd>{headingDeg.toFixed(1)}°</dd>
    </dl>
  {/snippet}

  {#snippet controls()}
    <PlayControls
      playing={loop.playing}
      ontoggle={togglePlay}
      onstep={step}
      atEnd={k >= sim.steps}
      what="drive"
      bind:speed
      speeds={[1, 2, 4]}
    />
    <Slider
      label="Distance driven (time)"
      min={0}
      max={sim.steps}
      step={1}
      bind:value={k}
      format={(v) => `${(sim.distance[v] ?? 0).toFixed(1)} m`}
      oninput={() => loop.pause()}
    />
    <Slider
      label="Odometry noise"
      min={L.noisePct.min}
      max={L.noisePct.max}
      step={L.noisePct.step}
      bind:value={noisePct}
      format={(v) => `${v.toFixed(1)}%`}
    />
    <Slider
      label="Number of runs"
      min={L.runs.min}
      max={L.runs.max}
      step={L.runs.step}
      bind:value={runs}
      format={(v) => String(v)}
    />
    <Toggle label="Show the true path" bind:checked={showTruth} />
    <Toggle label="Close the loop (recognize the start after each lap)" bind:checked={closeLoop} />
    {#if closeLoop}<p class="closing" data-readout="closing">
        {closing ? 'Closing the loop…' : 'Loop closed: every run optimized as a pose graph'}
      </p>{/if}
    <SeedControl bind:seed defaultSeed={D.seed} />
  {/snippet}

  {#snippet caption()}
    The thin solid line is the path the robot really drives: two laps of a 34.8 m loop, starting at the bottom left.
    Each dotted line is what the robot would believe using wheel odometry alone, in one run with its own random odometry
    errors; the dashed ellipse holds 95% of a Gaussian fitted to the runs' current positions. Odometry noise sets the
    size of the errors: at 3%, after 1 m of driving the distance error has a standard deviation of 3 cm and the heading
    error 0.03 rad.
    <strong>What to look for:</strong> the runs fan out as the robot drives, and coming back past the starting point
    does not shrink the fan: after two laps it is wider than after one. Switch on <em>Close the loop</em> to let each run
    recognize its starting point after every lap, as in Part 4: the whole path is then re-estimated, and the fan pinches shut
    where the loop closes.
  {/snippet}
</WidgetFrame>

<style>
  .closing {
    margin: 0;
    font-size: 0.8rem;
    color: var(--c-muted);
  }
  .truth {
    fill: none;
    stroke: var(--c-truth);
    stroke-width: var(--stroke-thin);
  }
  .err-plot {
    margin-top: var(--space-3);
  }
  .rms {
    fill: none;
    stroke: var(--c-bad);
    stroke-width: var(--stroke-base);
  }
  .now {
    fill: var(--c-bad);
  }
  .lap {
    stroke: var(--c-axis);
    stroke-dasharray: 3 3;
  }
  .lapt {
    font-size: 11px;
    fill: var(--c-muted);
  }
  .ro {
    display: grid;
    grid-template-columns: auto auto;
    gap: 0.2rem 0.75rem;
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
