<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import CovEllipse from '../../primitives/CovEllipse.svelte';
  import Robot2D from '../../primitives/Robot2D.svelte';
  import Landmark from '../../primitives/Landmark.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import Select from '../../primitives/Select.svelte';
  import Toggle from '../../primitives/Toggle.svelte';
  import PlayControls from '../../primitives/PlayControls.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import { createAnimationLoop } from '../../primitives/animation.svelte';
  import type { PlotContext } from '../../primitives/plot';
  import {
    RUN25,
    SCENE,
    applyHypothesis,
    associate,
    makeScene,
    positionError,
    runUnlabelled,
    sceneR,
    tally,
    type Method,
  } from '../../../lib/demos/association';
  import { SLAM24 } from '../../../lib/demos/ekf-slam-run';
  import { block, slamInnovation } from '../../../lib/filters/ekf-slam';
  import { inverseRangeBearing, rangeBearingJacobians } from '../../../lib/models/range-bearing';
  import { inverse, mul, transpose, vec, type Mat } from '../../../lib/math/matrix';

  interface Props {
    mode?: 'scene' | 'run';
  }
  let { mode = 'scene' }: Props = $props();

  // ------------------------------------------------------------ scene
  const D = SCENE.defaults;
  let offset = $state<number>(D.offset);
  let clutter = $state<number>(D.clutter);
  let gateProb = $state<number>(D.gateProb);
  let method = $state<Method>('jcbb');

  const sc = $derived(makeScene({ offset, clutter, gateProb }));
  const h = $derived(associate(sc, method, gateProb));
  const t = $derived(tally(sc, h));
  const after = $derived(applyHypothesis(sc, h));
  const est = $derived(sc.state.x.subarray(0, 3));
  /** Each landmark's gate drawn in the plane: the innovation covariance mapped back through the sensor model. */
  const gates = $derived(
    SCENE.landmarks.map((m, j) => {
      const z = vec([1, 0]); // any reading: S does not depend on it
      const { S } = slamInnovation(sc.state, z, j, sceneR());
      const { Hm } = rangeBearingJacobians(est, vec(m));
      const Hi = inverse(Hm);
      return { mean: m, cov: mul(mul(Hi, S), transpose(Hi)) as Mat };
    }),
  );
  const ends = $derived(sc.readings.map((z) => inverseRangeBearing(est, z)));

  // ------------------------------------------------------------ run
  let runMethod = $state<Method>('jcbb');
  let force = $state(false);
  const N = SLAM24.base.steps;
  let k = $state(N);
  const ref = $derived(runUnlabelled(runMethod, null));
  const r = $derived(force ? runUnlabelled(runMethod, RUN25.forced) : ref);
  const rs = $derived(r.steps[k]!);
  const totals = $derived(
    r.steps
      .slice(0, k + 1)
      .reduce((a, s) => ({ c: a.c + s.correct, w: a.w + s.wrong, d: a.d + s.duplicates }), { c: 0, w: 0, d: 0 }),
  );
  const loop = createAnimationLoop(
    () => {
      k = Math.min(N, k + 1);
      return k < N;
    },
    { fps: 12 },
  );
  function togglePlay() {
    if (!loop.playing && k >= N) k = 0;
    loop.toggle();
  }

  function reset() {
    loop.pause();
    offset = D.offset;
    clutter = D.clutter;
    gateProb = D.gateProb;
    method = 'jcbb';
    runMethod = 'jcbb';
    force = false;
    k = N;
  }

  const f2 = (v: number) => v.toFixed(2);
  const path = (ctx: PlotContext, pts: ArrayLike<number>[]) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${ctx.x(p[0]!).toFixed(1)},${ctx.y(p[1]!).toFixed(1)}`).join('');
  const series = (ctx: PlotContext, v: number[]) =>
    v.map((e, i) => `${i ? 'L' : 'M'}${ctx.x(i).toFixed(1)},${ctx.y(Math.min(6, e)).toFixed(1)}`).join('');
  const live = $derived(
    mode === 'scene'
      ? `${method === 'nn' ? 'Nearest neighbour' : 'JCBB'}: ${t.correct} correct, ${t.wrong} wrong, ${t.clutterAccepted} clutter accepted, ${t.missed} missed. Robot error after the update ${f2(positionError(after, sc.truth))} metres.`
      : `Step ${k}. ${totals.c} correct and ${totals.w} wrong pairings so far; robot error ${f2(rs.robotError)} metres.`,
  );
</script>

<WidgetFrame
  name="AssociationGating"
  title={mode === 'scene'
    ? 'Which landmark is that? Gating, nearest neighbour and JCBB'
    : 'SLAM without labels, and one wrong pairing'}
  description={mode === 'scene'
    ? 'A robot whose position estimate is off sideways reads a row of landmarks 1 metre apart. Dashed ellipses are the gates of the landmarks; crosses are where each reading puts a landmark, seen from the estimated pose. Lines show the pairing chosen by nearest neighbour or by joint compatibility (JCBB).'
    : 'EKF-SLAM on the world of Post 24 with unlabelled readings, associated by JCBB or nearest neighbour. One wrong pairing can be forced at the loop closure; the chart shows the robot position error over time.'}
  {live}
  onreset={reset}
  attach={loop.observe}
>
  {#snippet figure()}
    {#if mode === 'scene'}
      <Plot2D
        xDomain={[-1, 6]}
        yDomain={[-3.5, 4.5]}
        equalAspect
        maxHeight={400}
        margin={{ top: 8, right: 12, bottom: 30, left: 36 }}
        label="Gates of the landmarks, the readings seen from the estimated pose, and the chosen pairings"
      >
        {#snippet children(ctx)}
          <Axes {ctx} xTicks={7} yTicks={7} xLabel="x (m)" yLabel="y (m)" />
          <g clip-path="url(#{ctx.uid}-clip)">
            {#each gates as g, j (j)}
              <CovEllipse {ctx} mean={g.mean} cov={g.cov} prob={gateProb} kind="prior" />
            {/each}
            {#each h as j, i (i)}
              {#if j >= 0}
                {@const ok = sc.source[i] === j}
                <line
                  class={ok ? 'pair ok' : 'pair bad'}
                  x1={ctx.x(ends[i]![0]!)}
                  y1={ctx.y(ends[i]![1]!)}
                  x2={ctx.x(SCENE.landmarks[j]![0])}
                  y2={ctx.y(SCENE.landmarks[j]![1])}
                />
              {/if}
            {/each}
            {#each SCENE.landmarks as m, j (j)}
              <Landmark {ctx} x={m[0]} y={m[1]} label={String(j)} size={10} />
            {/each}
            {#each ends as e, i (i)}
              <path
                class={sc.source[i]! < 0 ? 'z clutter' : 'z'}
                d="M{ctx.x(e[0]!) - 4},{ctx.y(e[1]!) - 4}l8,8m0,-8l-8,8"
              />
            {/each}
            <CovEllipse {ctx} mean={[est[0]!, est[1]!]} cov={block(sc.state, -1)} kind="post" />
            <Robot2D {ctx} x={0} y={0} theta={0} kind="truth" size={16} />
            <Robot2D {ctx} x={est[0]!} y={est[1]!} theta={est[2]!} kind="prior" size={16} />
            <Robot2D {ctx} x={after.x[0]!} y={after.x[1]!} theta={after.x[2]!} kind="post" size={16} />
          </g>
        {/snippet}
      </Plot2D>
      <Legend
        items={[
          { kind: 'truth', label: 'true robot pose' },
          { kind: 'prior', label: 'estimate before the update; landmark gates' },
          { kind: 'meas', label: 'readings (× ; grey: clutter)' },
          { kind: 'post', label: 'correct pairing; estimate after the update' },
          { kind: 'bad', label: 'wrong pairing' },
        ]}
      />
    {:else}
      <Plot2D
        xDomain={[-10, 10]}
        yDomain={[-10, 10]}
        equalAspect
        maxHeight={360}
        margin={{ top: 8, right: 12, bottom: 30, left: 36 }}
        label="Map built without labels: true and estimated landmarks and paths"
      >
        {#snippet children(ctx)}
          <Axes {ctx} xTicks={5} yTicks={5} xLabel="x (m)" yLabel="y (m)" />
          <g clip-path="url(#{ctx.uid}-clip)">
            <path class="tpath" d={path(ctx, r.run.truths.slice(0, k))} />
            <path
              class="epath"
              d={path(
                ctx,
                r.steps.slice(1, k + 1).map((s) => s.state.x),
              )}
            />
            {#each SLAM24.base.landmarks as m, i (i)}
              <Landmark {ctx} x={m[0]} y={m[1]} size={9} />
            {/each}
            {#each rs.state.ids as id, j (j)}
              {@const dup = rs.state.ids.indexOf(id) !== j}
              <CovEllipse
                {ctx}
                mean={[rs.state.x[3 + 2 * j]!, rs.state.x[4 + 2 * j]!]}
                cov={block(rs.state, j)}
                kind={dup ? 'bad' : 'post'}
                thin
              />
            {/each}
            {#if k > 0}
              <Robot2D
                {ctx}
                x={r.run.truths[k - 1]![0]!}
                y={r.run.truths[k - 1]![1]!}
                theta={r.run.truths[k - 1]![2]!}
                kind="truth"
                size={14}
              />
            {/if}
            <Robot2D {ctx} x={rs.state.x[0]!} y={rs.state.x[1]!} theta={rs.state.x[2]!} kind="post" size={14} />
          </g>
        {/snippet}
      </Plot2D>
      <div class="chart">
        <Plot2D
          xDomain={[0, N]}
          yDomain={[0, 6]}
          aspect={0.25}
          maxHeight={140}
          margin={{ top: 8, right: 12, bottom: 30, left: 36 }}
          label="Robot position error over time"
        >
          {#snippet children(ctx)}
            <Axes {ctx} xTicks={6} yTicks={3} xLabel="step" yLabel="error (m)" />
            <g clip-path="url(#{ctx.uid}-clip)">
              {#if force}<path
                  class="refline"
                  d={series(
                    ctx,
                    ref.steps.map((s) => s.robotError),
                  )}
                />{/if}
              <path
                class="errline"
                class:bad={force}
                d={series(
                  ctx,
                  r.steps.map((s) => s.robotError),
                )}
              />
              <line class="now" x1={ctx.x(k)} x2={ctx.x(k)} y1={ctx.inner.top} y2={ctx.inner.bottom} />
            </g>
          {/snippet}
        </Plot2D>
      </div>
      <Legend
        items={[
          { kind: 'truth', label: 'true path and landmarks (□)' },
          { kind: 'post', label: 'estimate and mapped landmarks (95%)' },
          ...(force
            ? [
                { kind: 'bad' as const, label: 'duplicate landmarks; error with the wrong pairing' },
                { kind: 'odom' as const, label: 'error without it' },
              ]
            : []),
        ]}
      />
    {/if}
  {/snippet}

  {#snippet readouts()}
    {#if mode === 'scene'}
      <dl class="ro">
        <dt>Correct pairings</dt>
        <dd data-readout="correct">{t.correct}</dd>
        <dt>Wrong pairings</dt>
        <dd data-readout="wrong">{t.wrong}</dd>
        <dt>Clutter accepted</dt>
        <dd data-readout="clutter">{t.clutterAccepted}</dd>
        <dt>Readings left unpaired</dt>
        <dd data-readout="missed">{t.missed}</dd>
        <dt>Robot error: before → after</dt>
        <dd data-readout="error">{f2(positionError(sc.state, sc.truth))} → {f2(positionError(after, sc.truth))} m</dd>
      </dl>
    {:else}
      <dl class="ro">
        <dt>Step</dt>
        <dd data-readout="k">{k}</dd>
        <dt>Pairings so far: correct / wrong</dt>
        <dd data-readout="pairs">{totals.c} / {totals.w}</dd>
        <dt>Landmarks in the map (16 real)</dt>
        <dd data-readout="n">{rs.state.ids.length}</dd>
        <dt>Duplicates started</dt>
        <dd data-readout="dups">{totals.d}</dd>
        <dt>Robot position error</dt>
        <dd data-readout="err">{f2(rs.robotError)} m</dd>
      </dl>
    {/if}
  {/snippet}

  {#snippet controls()}
    {#if mode === 'scene'}
      <Select
        label="Association"
        value={method}
        options={[
          { value: 'jcbb', label: 'Joint compatibility (JCBB)' },
          { value: 'nn', label: 'Nearest neighbour' },
        ]}
        onchange={(v) => (method = v)}
      />
      <Slider
        label="Robot position error (sideways)"
        min={0}
        max={2}
        step={0.05}
        bind:value={offset}
        format={f2}
        unit="m"
      />
      <Slider label="Clutter readings" min={0} max={8} step={1} bind:value={clutter} format={(v) => String(v)} />
      <Select
        label="Gate probability"
        value={gateProb}
        options={[0.9, 0.95, 0.99, 0.999].map((p) => ({ value: p, label: `${p} (d² ≤ χ²₂(${p}))` }))}
        onchange={(v) => (gateProb = v)}
      />
    {:else}
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
      <Select
        label="Association"
        value={runMethod}
        options={[
          { value: 'jcbb', label: 'Joint compatibility (JCBB)' },
          { value: 'nn', label: 'Nearest neighbour' },
        ]}
        onchange={(v) => (runMethod = v)}
      />
      <Toggle label="Force one wrong pairing at the loop closure (step {RUN25.forced.step})" bind:checked={force} />
    {/if}
  {/snippet}

  {#snippet caption()}
    {#if mode === 'scene'}
      The robot (dark outline) is really at the origin, but its estimate (blue, dashed) is off sideways, and its 95%
      ellipse says it might be. Each dashed ellipse is a landmark's gate: a reading whose cross falls inside is
      individually compatible with it at the chosen probability. <strong>What to look for:</strong> once the error is more
      than half the spacing, every reading sits closest to the wrong neighbour; nearest neighbour takes those pairs one by
      one, JCBB finds the pairing that is consistent as a whole.
    {:else}
      The robot drives the loop of Post 24 without knowing which landmark is which. Each step's readings are paired by
      the chosen method; readings far from every landmark start new ones. All ellipses are 95% regions.
      <strong>What to look for:</strong> with honest pairings every reading finds its landmark; one forced wrong pairing at
      the loop closure bends the estimate, later readings no longer fit, and the map fills with duplicates.
    {/if}
  {/snippet}
</WidgetFrame>

<style>
  .pair {
    stroke-width: 2.25;
  }
  .pair.ok {
    stroke: var(--c-post);
  }
  .pair.bad {
    stroke: var(--c-bad);
    stroke-dasharray: 6 3;
  }
  .z {
    fill: none;
    stroke: var(--c-meas);
    stroke-width: 2;
  }
  .z.clutter {
    stroke: var(--c-muted);
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
  .chart {
    margin-top: var(--space-2);
  }
  .errline {
    fill: none;
    stroke: var(--c-post);
    stroke-width: 2;
  }
  .errline.bad {
    stroke: var(--c-bad);
  }
  .refline {
    fill: none;
    stroke: var(--c-odom);
    stroke-width: 1.5;
    stroke-dasharray: var(--dash-odom);
  }
  .now {
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
