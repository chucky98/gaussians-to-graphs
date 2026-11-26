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
    COMPARE,
    HALL,
    meanNees,
    neesCoverage,
    posErr,
    rmsErr,
    route,
    runCompare,
    type CompareScenario,
    type EkfRun,
  } from '../../../lib/demos/ekf-localization';
  import { getBlock, type Vec } from '../../../lib/math/matrix';

  interface Props {
    scenario?: CompareScenario;
  }
  let { scenario: initial = 'rough' }: Props = $props();
  const start = (): CompareScenario => initial;

  let scenario = $state<CompareScenario>(start());
  let seed = $state<number>(COMPARE.seed);
  let showTruth = $state(true);
  const N = route().length;
  let k = $state<number>(N);

  const res = $derived(runCompare(scenario, seed));
  const truth = $derived(k === 0 ? res.ekf.truth0 : res.ekf.steps[k - 1]!.truth);
  const st = (r: EkfRun) => (k === 0 ? r.init : r.steps[k - 1]!.post);

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
    scenario = start();
    seed = COMPARE.seed;
    showTruth = true;
    k = N;
  }
  const poly = (ctx: PlotContext, pts: readonly Vec[]) =>
    pts.map((q, i) => `${i ? 'L' : 'M'}${ctx.x(q[0]!).toFixed(1)},${ctx.y(q[1]!).toFixed(1)}`).join('');
  const path = (r: EkfRun) => [r.init.x, ...r.steps.slice(0, k).map((s) => s.post.x)];

  const EMAX = 3;
  function errPath(ctx: PlotContext, r: EkfRun) {
    const c = (v: number) => ctx.y(Math.min(EMAX, v)).toFixed(1);
    let d = `M${ctx.x(0)},${c(posErr(r.init.x, r.truth0))}`;
    for (let j = 1; j <= k; j++)
      d += `L${ctx.x(j * HALL.dt).toFixed(1)},${c(posErr(r.steps[j - 1]!.post.x, r.steps[j - 1]!.truth))}`;
    return d;
  }
  const f2 = (v: number) => v.toFixed(2);
  const live = $derived(
    `t = ${(k * HALL.dt).toFixed(1)} s. EKF error ${f2(posErr(st(res.ekf).x, truth))} m, UKF error ${f2(posErr(st(res.ukf).x, truth))} m. ` +
      `Over the run: mean NEES ${f2(meanNees(res.ekf))} for the EKF and ${f2(meanNees(res.ukf))} for the UKF, expected 3.`,
  );
</script>

<WidgetFrame
  name="UKFvsEKF"
  title="EKF and UKF on the same run"
  description="The robot of post 15 drives its loop; an extended and an unscented Kalman filter process exactly the same wheel commands and lidar readings. The map shows both estimates with their 95% ellipses; a chart shows their position errors."
  {live}
  onreset={reset}
  attach={loop.observe}
>
  {#snippet figure()}
    <Plot2D
      xDomain={HALL.area.x}
      yDomain={HALL.area.y}
      equalAspect
      maxHeight={360}
      margin={{ top: 8, right: 12, bottom: 32, left: 36 }}
      label="Hall map with the EKF and UKF estimates"
    >
      {#snippet children(ctx)}
        <Axes {ctx} xTicks={6} yTicks={4} xLabel="x (m)" yLabel="y (m)" />
        <g clip-path="url(#{ctx.uid}-clip)">
          {#if showTruth}
            <path class="truth" d={poly(ctx, [res.ekf.truth0, ...res.ekf.steps.slice(0, k).map((s) => s.truth)])} />
          {/if}
          <path class="ekf" d={poly(ctx, path(res.ekf))} />
          <path class="ukf" d={poly(ctx, path(res.ukf))} />
          <CovEllipse
            {ctx}
            mean={[st(res.ekf).x[0]!, st(res.ekf).x[1]!]}
            cov={getBlock(st(res.ekf).P, 0, 0, 2, 2)}
            kind="prior"
          />
          <CovEllipse
            {ctx}
            mean={[st(res.ukf).x[0]!, st(res.ukf).x[1]!]}
            cov={getBlock(st(res.ukf).P, 0, 0, 2, 2)}
            kind="post"
            fill
          />
        </g>
        {#each HALL.landmarks as [lx, ly], i (i)}<Landmark {ctx} x={lx} y={ly} />{/each}
        {#if showTruth}<Robot2D {ctx} x={truth[0]!} y={truth[1]!} theta={truth[2]!} kind="truth" size={16} />{/if}
      {/snippet}
    </Plot2D>
    <Legend
      items={[
        { kind: 'prior', label: 'EKF estimate and 95% ellipse (dashed)' },
        { kind: 'post', label: 'UKF estimate and 95% ellipse' },
        ...(showTruth ? [{ kind: 'truth' as const, label: 'true path' }] : []),
      ]}
    />
    <div class="chart">
      <Plot2D
        xDomain={[0, N * HALL.dt]}
        yDomain={[0, EMAX]}
        aspect={0.3}
        maxHeight={170}
        margin={{ top: 8, right: 12, bottom: 30, left: 36 }}
        label="Position error over time for the EKF and the UKF"
      >
        {#snippet children(ctx)}
          <Axes {ctx} xTicks={6} yTicks={3} xLabel="time (s)" yLabel="position error (m)" />
          <g clip-path="url(#{ctx.uid}-clip)">
            <path class="ekf" d={errPath(ctx, res.ekf)} />
            <path class="ukf" d={errPath(ctx, res.ukf)} />
          </g>
        {/snippet}
      </Plot2D>
    </div>
  {/snippet}

  {#snippet readouts()}
    <table class="ro">
      <caption class="visually-hidden">EKF against UKF over the whole run</caption>
      <thead><tr><th scope="col">Whole run</th><th scope="col">EKF</th><th scope="col">UKF</th></tr></thead>
      <tbody>
        <tr>
          <th scope="row">RMS error</th>
          <td data-readout="rms-ekf">{f2(rmsErr(res.ekf))} m</td>
          <td data-readout="rms-ukf">{f2(rmsErr(res.ukf))} m</td>
        </tr>
        <tr>
          <th scope="row">mean NEES (expect 3)</th>
          <td data-readout="nees-ekf">{f2(meanNees(res.ekf))}</td>
          <td data-readout="nees-ukf">{f2(meanNees(res.ukf))}</td>
        </tr>
        <tr>
          <th scope="row">NEES in 95% range</th>
          <td data-readout="cov-ekf">{Math.round(neesCoverage(res.ekf) * N)} / {N}</td>
          <td data-readout="cov-ukf">{Math.round(neesCoverage(res.ukf) * N)} / {N}</td>
        </tr>
      </tbody>
    </table>
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
    <Select
      label="Scenario"
      value={scenario}
      options={[
        { value: 'mild', label: 'Mild: good wheels, lidar range 5 m' },
        { value: 'rough', label: 'Rough: poor wheels, lidar range 3 m' },
      ]}
      onchange={(v) => (scenario = v)}
    />
    <Toggle label="Show the truth" bind:checked={showTruth} />
    <SeedControl bind:seed defaultSeed={COMPARE.seed} />
  {/snippet}

  {#snippet caption()}
    Both filters see exactly the same wheel commands and lidar readings. The EKF linearizes the models at its estimate
    (Post 15); the UKF pushes sigma points through them, with the wheel noise added to its state as extra dimensions.
    Ellipses are 95% regions of the estimated position; NEES compares each filter's error with its own covariance and
    averages 3 for an honest filter. <strong>What to look for:</strong> in the mild scenario the two estimates coincide; in
    the rough one their errors are similar, but the EKF's NEES runs high: its ellipses are too small more often than the UKF's.
  {/snippet}
</WidgetFrame>

<style>
  .truth {
    fill: none;
    stroke: var(--c-truth);
    stroke-width: var(--stroke-thin);
  }
  .ekf {
    fill: none;
    stroke: var(--c-prior);
    stroke-width: 2;
    stroke-dasharray: var(--dash-prior);
  }
  .ukf {
    fill: none;
    stroke: var(--c-post);
    stroke-width: 2;
  }
  .chart {
    margin-top: var(--space-3);
  }
  .ro {
    width: 100%;
    font-size: 0.85rem;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  .ro th,
  .ro td {
    padding: 0.2rem 0.35rem;
    text-align: right;
  }
  .ro th[scope='row'] {
    text-align: left;
    color: var(--c-muted);
    font-weight: 400;
  }
  .ro thead th {
    color: var(--c-muted);
    font-weight: 500;
  }
</style>
