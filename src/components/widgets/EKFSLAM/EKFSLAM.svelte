<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import CovEllipse from '../../primitives/CovEllipse.svelte';
  import Robot2D from '../../primitives/Robot2D.svelte';
  import Landmark from '../../primitives/Landmark.svelte';
  import Heatmap from '../../primitives/Heatmap.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import Select from '../../primitives/Select.svelte';
  import SeedControl from '../../primitives/SeedControl.svelte';
  import PlayControls from '../../primitives/PlayControls.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import { createAnimationLoop } from '../../primitives/animation.svelte';
  import {
    SLAM24,
    closureStep24,
    correlationMagnitudes,
    meanLandmarkSd,
    robotSd,
    run24,
    strongShare,
    type HeadingNoise,
  } from '../../../lib/demos/ekf-slam-run';
  import { block } from '../../../lib/filters/ekf-slam';
  import type { PlotContext } from '../../primitives/plot';

  let noise = $state<HeadingNoise>('default');
  let seed = $state<number>(SLAM24.seed);
  const r = $derived(run24(noise, seed));
  const kc = $derived(closureStep24(r));
  const N = SLAM24.base.steps;
  const SIZE = 3 + 2 * SLAM24.base.landmarks.length;
  let k = $state(90);

  const s = $derived(r.steps[k]!.state);
  const truth = $derived(k === 0 ? r.run.start : r.run.truths[k - 1]!);
  const dim = $derived(s.x.length);
  /** |correlation| of the current state, padded to the final size so the matrix visibly grows. */
  const heat = $derived.by(() => {
    const c = correlationMagnitudes(s);
    const out = new Float64Array(SIZE * SIZE);
    for (let i = 0; i < dim; i++) for (let j = 0; j < dim; j++) out[i * SIZE + j] = c[i * dim + j]!;
    return out;
  });
  const est = $derived(r.steps.slice(1, k + 1).map((t) => [t.state.x[0]!, t.state.x[1]!] as [number, number]));
  const tru = $derived(r.run.truths.slice(0, k).map((t) => [t[0]!, t[1]!] as [number, number]));

  const loop = createAnimationLoop(
    () => {
      k = Math.min(N, k + 1);
      return k < N;
    },
    { fps: 10 },
  );
  function togglePlay() {
    if (!loop.playing && k >= N) k = 0;
    loop.toggle();
  }
  function reset() {
    loop.pause();
    noise = 'default';
    seed = SLAM24.seed;
    k = 90;
  }
  const line = (ctx: PlotContext, pts: [number, number][]) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${ctx.x(p[0]).toFixed(1)},${ctx.y(p[1]).toFixed(1)}`).join('');
  const f2 = (v: number) => v.toFixed(2);
  const pct = (v: number) => `${Math.round(100 * v)}%`;
  const live = $derived(
    `Step ${k}. ${s.ids.length} landmarks; state of ${dim} numbers, covariance of ${dim * dim} entries. ` +
      `Robot position uncertainty ${f2(robotSd(s))} metres.`,
  );
  const W = 10;
</script>

<WidgetFrame
  name="EKFSLAM"
  title="EKF-SLAM: the map and its covariance"
  description="A robot maps 16 landmarks with EKF-SLAM while driving laps of a circle. Left: true and estimated landmarks and robot with 95% ellipses. Right: a heat map of the size of every correlation in the filter's covariance matrix, which grows by two rows and columns per new landmark and fills in as the robot drives."
  {live}
  onreset={reset}
  attach={loop.observe}
>
  {#snippet figure()}
    <div class="pair">
      <div class="panel">
        <Plot2D
          xDomain={[-W, W]}
          yDomain={[-W, W]}
          equalAspect
          maxHeight={380}
          margin={{ top: 8, right: 8, bottom: 30, left: 36 }}
          label="Map: landmarks and robot, true and estimated, with 95% ellipses"
        >
          {#snippet children(ctx)}
            <Axes {ctx} xTicks={5} yTicks={5} xLabel="x (m)" yLabel="y (m)" />
            <g clip-path="url(#{ctx.uid}-clip)">
              <path class="tpath" d={line(ctx, tru)} />
              <path class="epath" d={line(ctx, est)} />
              {#each SLAM24.base.landmarks as m, i (i)}
                <Landmark {ctx} x={m[0]} y={m[1]} size={9} />
              {/each}
              {#each s.ids as id, j (id)}
                <CovEllipse {ctx} mean={[s.x[3 + 2 * j]!, s.x[4 + 2 * j]!]} cov={block(s, j)} kind="post" thin />
              {/each}
              <CovEllipse {ctx} mean={[s.x[0]!, s.x[1]!]} cov={block(s, -1)} kind="post" />
              <Robot2D {ctx} x={truth[0]!} y={truth[1]!} theta={truth[2]!} kind="truth" size={14} />
              <Robot2D {ctx} x={s.x[0]!} y={s.x[1]!} theta={s.x[2]!} kind="post" size={14} />
            </g>
          {/snippet}
        </Plot2D>
      </div>
      <div class="panel">
        <p class="ptitle">Covariance: |correlation| of every pair</p>
        <Plot2D
          xDomain={[0, SIZE]}
          yDomain={[0, SIZE]}
          equalAspect
          maxHeight={330}
          margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
          label="Heat map of the absolute correlations in the covariance matrix: {dim} by {dim} of {SIZE} by {SIZE}"
        >
          {#snippet underlay(ctx)}
            <Heatmap {ctx} values={heat} nx={SIZE} ny={SIZE} vmax={1} crisp />
          {/snippet}
          {#snippet children(ctx)}
            <rect
              class="frame"
              x={ctx.inner.left}
              y={ctx.inner.top}
              width={ctx.inner.right - ctx.inner.left}
              height={ctx.inner.bottom - ctx.inner.top}
            />
            <rect
              class="used"
              x={ctx.inner.left}
              y={ctx.inner.top}
              width={((ctx.inner.right - ctx.inner.left) * dim) / SIZE}
              height={((ctx.inner.bottom - ctx.inner.top) * dim) / SIZE}
            />
          {/snippet}
        </Plot2D>
        <div class="scale" aria-hidden="true"><span>0</span><span class="bar"></span><span>1</span></div>
        <p class="note">Rows and columns: robot (x, y, θ), then each landmark's (x, y) in the order first seen.</p>
      </div>
    </div>
    <Legend
      items={[
        { kind: 'truth', label: 'true path, robot and landmarks (□)' },
        { kind: 'post', label: 'EKF-SLAM estimate, 95% ellipses' },
      ]}
    />
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Step</dt>
      <dd data-readout="k">{k}</dd>
      <dt>Landmarks mapped</dt>
      <dd data-readout="n">{s.ids.length}</dd>
      <dt>Covariance entries</dt>
      <dd data-readout="entries">{dim} × {dim} = {dim * dim}</dd>
      <dt>Landmark pairs with |ρ| ≥ {SLAM24.strong}</dt>
      <dd data-readout="strong">{pct(strongShare(s))}</dd>
      <dt>Robot position (√(σx² + σy²))</dt>
      <dd data-readout="robot">{f2(robotSd(s))} m</dd>
      <dt>Landmarks, average</dt>
      <dd data-readout="map">{s.ids.length ? `${f2(meanLandmarkSd(s))} m` : '—'}</dd>
    </dl>
  {/snippet}

  {#snippet controls()}
    <PlayControls playing={loop.playing} ontoggle={togglePlay} onstep={() => (k = k >= N ? 0 : k + 1)} what="steps" />
    <Slider
      label="Step"
      min={0}
      max={N}
      step={1}
      bind:value={k}
      format={(v) => String(v)}
      oninput={() => loop.pause()}
    />
    <button
      type="button"
      class="btn"
      data-action="closure"
      onclick={() => {
        loop.pause();
        k = kc - 1;
      }}
    >
      Go to just before the loop closure
    </button>
    <Select
      label="Heading noise of the odometry"
      value={noise}
      options={[
        { value: 'default', label: 'σω = 0.05 rad/s' },
        { value: 'high', label: 'σω = 0.10 rad/s (more heading noise)' },
      ]}
      onchange={(v) => (noise = v)}
    />
    <SeedControl bind:seed defaultSeed={SLAM24.seed} />
  {/snippet}

  {#snippet caption()}
    The robot (dark outline: true; green: estimate) drives counter-clockwise around a 6 m circle, starting at the
    bottom, and reads landmarks within 3.5 m. All ellipses are 95% regions. The heat map has one row and one column per
    number in the state; dark cells are pairs of numbers whose errors are strongly correlated, and the outlined square
    is the part in use. <strong>What to look for:</strong> the matrix grows by two rows and columns for each new
    landmark, and fills in as the robot drives; at the loop closure (step {kc}) every ellipse shrinks at once.
  {/snippet}
</WidgetFrame>

<style>
  .pair {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
    gap: var(--space-3);
    align-items: start;
  }
  @container (max-width: 560px) {
    .pair {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .panel {
    min-width: 0;
  }
  .ptitle {
    margin: 0 0 0.25rem;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .tpath {
    fill: none;
    stroke: var(--c-truth);
    stroke-width: var(--stroke-thin);
  }
  .epath {
    fill: none;
    stroke: var(--c-post);
    stroke-width: 1.5;
  }
  .frame {
    fill: none;
    stroke: var(--c-axis);
  }
  .used {
    fill: none;
    stroke: var(--c-fg);
    stroke-width: 1.5;
    stroke-dasharray: 3 3;
  }
  .scale {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.78rem;
    color: var(--c-muted);
    margin-top: 0.25rem;
  }
  .bar {
    display: inline-block;
    width: 6rem;
    height: 0.7rem;
    border: 1px solid var(--c-border);
    background: linear-gradient(to right, var(--c-seq-lo), var(--c-seq-hi));
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
