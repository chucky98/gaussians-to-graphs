<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import Robot2D from '../../primitives/Robot2D.svelte';
  import Landmark from '../../primitives/Landmark.svelte';
  import CovEllipse from '../../primitives/CovEllipse.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import Select from '../../primitives/Select.svelte';
  import Toggle from '../../primitives/Toggle.svelte';
  import PlayControls from '../../primitives/PlayControls.svelte';
  import SeedControl from '../../primitives/SeedControl.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import { createAnimationLoop } from '../../primitives/animation.svelte';
  import type { PlotContext } from '../../primitives/plot';
  import {
    EKF_LIMITS as L,
    EKF_PRESETS,
    HALL,
    neesCoverage,
    posErr,
    poseError,
    route,
    runEkf,
    type EkfParams,
    type EkfPreset,
  } from '../../../lib/demos/ekf-localization';
  import { eigSym2, getBlock, type Vec } from '../../../lib/math/matrix';

  interface Props {
    preset?: EkfPreset;
  }
  let { preset: initialPreset = 'default' }: Props = $props();
  const startPreset = (): EkfPreset => initialPreset;
  const p0 = (): EkfParams => EKF_PRESETS[startPreset()];

  let preset = $state<EkfPreset | 'custom'>(startPreset());
  let sigmaW = $state<number>(p0().sigmaW);
  let sigmaPhiDeg = $state<number>(p0().sigmaPhiDeg);
  let range = $state<number>(p0().range);
  let seed = $state<number>(HALL.seed);
  let showTruth = $state(true);

  const params = $derived<EkfParams>(
    preset !== 'custom' ? EKF_PRESETS[preset] : { ...EKF_PRESETS.default, sigmaW, sigmaPhiDeg, range },
  );
  const run = $derived(runEkf(params, seed));
  const N = $derived(run.steps.length);
  /** Start at the end of the run so the whole picture is visible. */
  let k = $state<number>(route().length);

  const cur = $derived(k === 0 ? null : run.steps[k - 1]!);
  const est = $derived(cur ? cur.post : run.init);
  const truth = $derived(cur ? cur.truth : run.truth0);
  const odom = $derived(cur ? cur.odom : run.init.x);

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
  function stepOnce() {
    k = k >= N ? 0 : k + 1;
  }
  function load(p: EkfPreset) {
    const q = EKF_PRESETS[p];
    preset = p;
    sigmaW = q.sigmaW;
    sigmaPhiDeg = q.sigmaPhiDeg;
    range = q.range;
  }
  function reset() {
    loop.pause();
    load(startPreset());
    seed = HALL.seed;
    showTruth = true;
    k = N;
  }
  const custom = () => (preset = 'custom');

  const poly = (ctx: PlotContext, pts: readonly Vec[]) =>
    pts.map((q, i) => `${i ? 'L' : 'M'}${ctx.x(q[0]!).toFixed(1)},${ctx.y(q[1]!).toFixed(1)}`).join('');
  const r95 = (P: (typeof run.steps)[number]['post']['P']) =>
    Math.sqrt(5.991 * Math.max(...eigSym2(getBlock(P, 0, 0, 2, 2)).values));

  // Error chart.
  const EMAX = 3;
  function errLines(ctx: PlotContext) {
    const c = (v: number) => ctx.y(Math.min(EMAX, v)).toFixed(1);
    let e = `M${ctx.x(0)},${c(posErr(run.init.x, run.truth0))}`;
    let o = e;
    let b = `M${ctx.x(0)},${c(r95(run.init.P))}`;
    for (let j = 1; j <= k; j++) {
      const s = run.steps[j - 1]!;
      const x = ctx.x(j * HALL.dt).toFixed(1);
      e += `L${x},${c(posErr(s.post.x, s.truth))}`;
      o += `L${x},${c(posErr(s.odom, s.truth))}`;
      b += `L${x},${c(r95(s.post.P))}`;
    }
    return { e, o, b };
  }

  const f2 = (v: number) => v.toFixed(2);
  const headErr = $derived((Math.abs(poseError(est.x, truth)[2]!) * 180) / Math.PI);
  const live = $derived(
    `t = ${(k * HALL.dt).toFixed(1)} s. EKF position error ${f2(posErr(est.x, truth))} m, odometry error ${f2(posErr(odom, truth))} m. ` +
      `${cur ? cur.seen.length : 0} markers in view.`,
  );
</script>

<WidgetFrame
  name="EKFLocalization"
  title="Localizing with an extended Kalman filter"
  description="A robot drives a loop through a hall with eight mapped markers. Its true path, its odometry-only path and the EKF estimate with a 95% ellipse are drawn on the map; a chart shows the position errors over time."
  {live}
  onreset={reset}
  attach={loop.observe}
>
  {#snippet figure()}
    <Plot2D
      xDomain={HALL.area.x}
      yDomain={HALL.area.y}
      equalAspect
      maxHeight={380}
      margin={{ top: 8, right: 12, bottom: 32, left: 36 }}
      label="Hall map with markers, paths and the EKF's uncertainty ellipse"
    >
      {#snippet children(ctx)}
        <Axes {ctx} xTicks={6} yTicks={4} xLabel="x (m)" yLabel="y (m)" />
        <g clip-path="url(#{ctx.uid}-clip)">
          {#if showTruth}
            <circle
              class="range"
              cx={ctx.x(truth[0]!)}
              cy={ctx.y(truth[1]!)}
              r={Math.abs(ctx.x(params.range) - ctx.x(0))}
            />
            <path class="truth" d={poly(ctx, [run.truth0, ...run.steps.slice(0, k).map((s) => s.truth)])} />
          {/if}
          <path class="odom" d={poly(ctx, [run.init.x, ...run.steps.slice(0, k).map((s) => s.odom)])} />
          <path class="est" d={poly(ctx, [run.init.x, ...run.steps.slice(0, k).map((s) => s.post.x)])} />
          {#if cur}
            {#each cur.seen as s (s.index)}
              {@const m = HALL.landmarks[s.index]!}
              <line class="ray" x1={ctx.x(est.x[0]!)} y1={ctx.y(est.x[1]!)} x2={ctx.x(m[0])} y2={ctx.y(m[1])} />
            {/each}
          {/if}
          <CovEllipse {ctx} mean={[est.x[0]!, est.x[1]!]} cov={getBlock(est.P, 0, 0, 2, 2)} kind="post" fill />
        </g>
        {#each HALL.landmarks as [lx, ly], i (i)}
          <Landmark {ctx} x={lx} y={ly} />
        {/each}
        <Robot2D {ctx} x={odom[0]!} y={odom[1]!} theta={odom[2]!} kind="odom" size={14} />
        {#if showTruth}<Robot2D {ctx} x={truth[0]!} y={truth[1]!} theta={truth[2]!} kind="truth" size={16} />{/if}
        <Robot2D {ctx} x={est.x[0]!} y={est.x[1]!} theta={est.x[2]!} kind="post" size={16} />
      {/snippet}
    </Plot2D>
    <Legend
      items={[
        { kind: 'post', label: 'EKF estimate and its 95% ellipse' },
        { kind: 'odom', label: 'odometry only (dead reckoning)' },
        { kind: 'meas', label: 'markers measured at this step' },
        ...(showTruth ? [{ kind: 'truth' as const, label: 'true path; dashed circle: sensing range' }] : []),
      ]}
    />
    <div class="chart">
      <Plot2D
        xDomain={[0, N * HALL.dt]}
        yDomain={[0, EMAX]}
        aspect={0.3}
        maxHeight={170}
        margin={{ top: 8, right: 12, bottom: 30, left: 36 }}
        label="Position error over time: EKF, odometry, and the EKF's 95% radius"
      >
        {#snippet children(ctx)}
          {@const l = errLines(ctx)}
          <Axes {ctx} xTicks={6} yTicks={3} xLabel="time (s)" yLabel="position error (m)" />
          <g clip-path="url(#{ctx.uid}-clip)">
            <path class="odom" d={l.o} />
            <path class="bound" d={l.b} />
            <path class="est" d={l.e} />
          </g>
        {/snippet}
      </Plot2D>
      <p class="note">Solid: EKF error. Dashed: the EKF's own 95% radius. Dotted: odometry error.</p>
    </div>
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Time</dt>
      <dd data-readout="time">{(k * HALL.dt).toFixed(1)} s</dd>
      <dt>EKF error</dt>
      <dd data-readout="ekf">{f2(posErr(est.x, truth))} m, {headErr.toFixed(1)}°</dd>
      <dt>EKF 95% radius</dt>
      <dd data-readout="r95">{f2(r95(est.P))} m</dd>
      <dt>Odometry error</dt>
      <dd data-readout="odom">{f2(posErr(odom, truth))} m</dd>
      <dt>Markers in view</dt>
      <dd>{cur ? cur.seen.length : 0}</dd>
      <dt>NEES in its 95% range</dt>
      <dd data-readout="nees">{Math.round(neesCoverage(run) * N)} of {N} steps</dd>
    </dl>
  {/snippet}

  {#snippet controls()}
    <PlayControls playing={loop.playing} ontoggle={togglePlay} onstep={stepOnce} what="robot" />
    <Slider
      label="Time"
      min={0}
      max={N}
      step={1}
      bind:value={k}
      format={(v) => `${(v * HALL.dt).toFixed(1)} s`}
      oninput={() => loop.pause()}
    />
    <Select
      label="Scenario"
      value={preset}
      options={[
        { value: 'default', label: 'Known start, lidar range 5 m' },
        { value: 'blind', label: 'No markers in reach' },
        { value: 'lost', label: 'Break it: start 4.5 m and 150° off' },
        ...(preset === 'custom' ? [{ value: 'custom' as const, label: 'Custom' }] : []),
      ]}
      onchange={(v) => v !== 'custom' && load(v)}
    />
    <Slider
      label="Sensing range"
      min={L.range.min}
      max={L.range.max}
      step={L.range.step}
      bind:value={range}
      format={(v) => v.toFixed(1)}
      unit="m"
      oninput={custom}
    />
    <Slider
      label="Wheel turn-rate noise σω"
      min={L.sigmaW.min}
      max={L.sigmaW.max}
      step={L.sigmaW.step}
      bind:value={sigmaW}
      format={(v) => v.toFixed(3)}
      unit="rad/s"
      oninput={custom}
    />
    <Slider
      label="Bearing noise σφ"
      min={L.sigmaPhiDeg.min}
      max={L.sigmaPhiDeg.max}
      step={L.sigmaPhiDeg.step}
      bind:value={sigmaPhiDeg}
      format={(v) => `${v.toFixed(1)}°`}
      oninput={custom}
    />
    <Toggle label="Show the truth" bind:checked={showTruth} />
    <SeedControl bind:seed defaultSeed={HALL.seed} />
  {/snippet}

  {#snippet caption()}
    The robot is commanded to drive a loop at 1 m/s; its wheels add noise (σv = 0.1 m/s and σω). Every 0.5 s its lidar
    measures the range and bearing of each mapped marker within the sensing range (σr = 0.1 m and σφ). The EKF
    linearizes the motion and sensor models of Post 14 at its current estimate. The ellipse is the 95% region of the
    estimated position. <strong>What to look for:</strong> odometry alone drifts, while the EKF stays within decimetres and
    its ellipse shrinks every time it sees a marker; started far from the truth, it recovers here, but for a while its ellipse
    confidently excludes the robot.
  {/snippet}
</WidgetFrame>

<style>
  .range {
    fill: none;
    stroke: var(--c-muted);
    stroke-dasharray: 4 4;
  }
  .truth {
    fill: none;
    stroke: var(--c-truth);
    stroke-width: var(--stroke-thin);
  }
  .odom {
    fill: none;
    stroke: var(--c-odom);
    stroke-width: 2;
    stroke-dasharray: var(--dash-odom);
  }
  .est {
    fill: none;
    stroke: var(--c-post);
    stroke-width: 2;
  }
  .bound {
    fill: none;
    stroke: var(--c-post);
    stroke-width: 1.5;
    stroke-dasharray: 6 4;
  }
  .ray {
    stroke: var(--c-meas);
    stroke-width: 1.5;
    stroke-dasharray: 8 3 2 3;
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
