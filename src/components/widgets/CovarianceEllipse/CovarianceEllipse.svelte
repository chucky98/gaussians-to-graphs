<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import CovEllipse from '../../primitives/CovEllipse.svelte';
  import PointsCanvas from '../../primitives/PointsCanvas.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import Toggle from '../../primitives/Toggle.svelte';
  import Select from '../../primitives/Select.svelte';
  import PlayControls from '../../primitives/PlayControls.svelte';
  import SeedControl from '../../primitives/SeedControl.svelte';
  import MatrixView from '../../primitives/MatrixView.svelte';
  import Handle from '../../primitives/Handle.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import KaTeXInline from '../../primitives/KaTeXInline.svelte';
  import { createAnimationLoop } from '../../primitives/animation.svelte';
  import {
    COV_DEFAULTS as D,
    COV_LIMITS as L,
    LEVEL_OPTIONS,
    SAMPLE_COUNT_OPTIONS,
    axesOf,
    clampParams,
    clampProbe,
    levelShort,
    countInside,
    covOf,
    massWithin,
    paramsFromAxes,
    probeInfo,
    standardSamples,
    transformSamples,
  } from '../../../lib/demos/covariance-ellipse';

  interface Props {
    /** 'default': samples on, probes off. 'mahalanobis': probes A and B on, samples off. */
    preset?: 'default' | 'mahalanobis';
  }
  let { preset = 'default' }: Props = $props();
  const SIGMA_TEX = String.raw`\boldsymbol{\Sigma}`;

  const initial = () => ({
    sx: D.params.sx,
    sy: D.params.sy,
    rho: D.params.rho,
    level: D.level,
    showSamples: preset !== 'mahalanobis',
    showProbes: preset === 'mahalanobis',
    n: D.n as number,
    seed: D.seed as number,
    probes: D.probes.map((p) => [p[0], p[1]] as [number, number]),
  });
  const init = initial();

  let sx = $state(init.sx);
  let sy = $state(init.sy);
  let rho = $state(init.rho);
  let level = $state(init.level);
  let showSamples = $state(init.showSamples);
  let showProbes = $state(init.showProbes);
  let n = $state(init.n);
  let seed = $state(init.seed);
  let probes = $state(init.probes);
  /** Number of samples currently drawn (animated by Play). */
  let shown = $state(init.n);

  const params = $derived({ sx, sy, rho });
  const cov = $derived(covOf(params));
  const ax = $derived(axesOf(params, level));
  const z = $derived(standardSamples(seed, n));
  const pts = $derived(transformSamples(z, params));
  const inside = $derived(countInside(z, shown, level));
  const probeInfos = $derived(probes.map((p) => probeInfo(p, params, level)));

  function setParams(p: { sx: number; sy: number; rho: number }) {
    const c = clampParams(p);
    sx = c.sx;
    sy = c.sy;
    rho = c.rho;
  }

  function reset() {
    loop.pause();
    const i = initial();
    sx = i.sx;
    sy = i.sy;
    rho = i.rho;
    level = i.level;
    showSamples = i.showSamples;
    showProbes = i.showProbes;
    n = i.n;
    seed = i.seed;
    probes = i.probes;
    shown = i.n;
  }

  // ---- sample animation: draw the cloud progressively over ~3 s
  const loop = createAnimationLoop((dt) => {
    shown = Math.min(n, shown + Math.max(1, Math.round((n * dt) / 3000)));
    return shown < n;
  });
  function togglePlay() {
    if (!loop.playing && shown >= n) shown = 0;
    loop.toggle();
  }
  function step() {
    if (shown >= n) shown = 0;
    shown = Math.min(n, shown + Math.round(n / 20));
  }

  // ---- ellipse handles. Geometry is captured at drag start so the dragged axis stays the same.
  let dragStart = { theta: 0, a: 1, b: 1, v2: [0, 1] as [number, number] };
  function startDrag() {
    dragStart = { theta: ax.theta, a: ax.a, b: ax.b, v2: ax.v2 };
  }
  const minAxis = 0.3;
  function moveMajor(p: [number, number]) {
    const a = Math.max(minAxis, Math.hypot(p[0], p[1]));
    setParams(paramsFromAxes(Math.atan2(p[1], p[0]), a, dragStart.b, level));
  }
  function moveMinor(p: [number, number]) {
    const b = Math.max(minAxis, Math.abs(p[0] * dragStart.v2[0] + p[1] * dragStart.v2[1]));
    setParams(paramsFromAxes(dragStart.theta, dragStart.a, b, level));
  }
  function keyMajor([dx, dy]: [number, number]) {
    const theta = ax.theta - (dx * 3 * Math.PI) / 180;
    const a = Math.max(minAxis, ax.a + 0.1 * dy);
    setParams(paramsFromAxes(theta, a, ax.b, level));
  }
  function keyMinor([dx, dy]: [number, number]) {
    const b = Math.max(minAxis, ax.b + 0.1 * (dy || dx));
    setParams(paramsFromAxes(ax.theta, ax.a, b, level));
  }
  function moveProbe(i: number, p: [number, number]) {
    probes[i] = clampProbe(p);
  }

  const f2 = (v: number) => v.toFixed(2);
  const pctLevel = $derived(levelShort(level));
  const eigTex = $derived(String.raw`\lambda_1 = ` + f2(ax.l1) + String.raw`,\quad \lambda_2 = ` + f2(ax.l2));
  const deg = (r: number) => `${Math.round((r * 180) / Math.PI)}°`;

  const live = $derived(
    `sigma x ${f2(sx)}, sigma y ${f2(sy)}, rho ${f2(rho)}. Eigenvalues ${f2(ax.l1)} and ${f2(ax.l2)}. ` +
      (showSamples ? `Samples inside the ${pctLevel} ellipse: ${inside} of ${shown}. ` : '') +
      (showProbes
        ? probeInfos.map((pi, i) => `Point ${'AB'[i]}: distance ${f2(pi.euclid)}, Mahalanobis ${f2(pi.dM)}`).join('. ')
        : ''),
  );
</script>

<WidgetFrame
  name="CovarianceEllipse"
  title={preset === 'mahalanobis' ? 'Mahalanobis distance' : 'The covariance ellipse'}
  description="A two-dimensional Gaussian drawn as its confidence ellipse, with its covariance matrix, eigenvectors, optional random samples and optional probe points."
  {live}
  onreset={reset}
  attach={loop.observe}
>
  {#snippet figure()}
    <Plot2D
      xDomain={L.domain}
      yDomain={L.domain}
      equalAspect
      maxHeight={520}
      margin={{ top: 10, right: 10, bottom: 28, left: 30 }}
      label="Covariance ellipse plot"
    >
      {#snippet underlay(ctx)}
        {#if showSamples}<PointsCanvas {ctx} points={pts} count={shown} />{/if}
      {/snippet}
      {#snippet children(ctx)}
        <Axes {ctx} xTicks={8} yTicks={8} xLabel="x" yLabel="y" />
        <g clip-path="url(#{ctx.uid}-clip)">
          <CovEllipse {ctx} mean={[0, 0]} {cov} prob={level} kind="post" fill />
          <!-- eigenvector axes, scaled to the ellipse's semi-axes -->
          <line
            class="eig"
            x1={ctx.x(-ax.a * ax.v1[0])}
            y1={ctx.y(-ax.a * ax.v1[1])}
            x2={ctx.x(ax.a * ax.v1[0])}
            y2={ctx.y(ax.a * ax.v1[1])}
          />
          <line
            class="eig"
            x1={ctx.x(-ax.b * ax.v2[0])}
            y1={ctx.y(-ax.b * ax.v2[1])}
            x2={ctx.x(ax.b * ax.v2[0])}
            y2={ctx.y(ax.b * ax.v2[1])}
          />
          {#if showProbes}
            {#each probeInfos as pi, i (i)}
              <CovEllipse
                {ctx}
                mean={[0, 0]}
                {cov}
                prob={Math.min(0.999999, Math.max(1e-6, massWithin(pi.dM)))}
                kind="meas"
                thin
              />
            {/each}
          {/if}
        </g>
        <circle class="center" cx={ctx.x(0)} cy={ctx.y(0)} r="3" />
        <Handle
          cx={ctx.x(ax.a * ax.v1[0])}
          cy={ctx.y(ax.a * ax.v1[1])}
          label="Major axis end: drag to stretch and rotate. Arrow keys: left and right rotate, up and down stretch."
          valuetext={`major semi-axis ${f2(ax.a)}, angle ${deg(ax.theta)}`}
          valuenow={+ax.a.toFixed(2)}
          valuemin={0}
          valuemax={12}
          tag="v₁"
          onstart={startDrag}
          onmove={(e) => moveMajor(ctx.toData(e))}
          onkey={keyMajor}
        />
        <Handle
          cx={ctx.x(ax.b * ax.v2[0])}
          cy={ctx.y(ax.b * ax.v2[1])}
          label="Minor axis end: drag to stretch. Arrow keys change its length."
          valuetext={`minor semi-axis ${f2(ax.b)}`}
          valuenow={+ax.b.toFixed(2)}
          valuemin={0}
          valuemax={12}
          tag="v₂"
          onstart={startDrag}
          onmove={(e) => moveMinor(ctx.toData(e))}
          onkey={keyMinor}
        />
        {#if showProbes}
          {#each probes as p, i (i)}
            <Handle
              cx={ctx.x(p[0])}
              cy={ctx.y(p[1])}
              kind="meas"
              tag={'AB'[i]}
              label={`Point ${'AB'[i]}: drag or use arrow keys to move it`}
              valuetext={`point ${'AB'[i]} at (${f2(p[0])}, ${f2(p[1])}), Mahalanobis distance ${f2(probeInfos[i]!.dM)}`}
              valuenow={+probeInfos[i]!.dM.toFixed(2)}
              valuemin={0}
              valuemax={20}
              onmove={(e) => moveProbe(i, ctx.toData(e))}
              onkey={([dx, dy]) => moveProbe(i, [p[0] + 0.1 * dx, p[1] + 0.1 * dy])}
            />
          {/each}
        {/if}
      {/snippet}
    </Plot2D>
    <Legend
      items={[
        { kind: 'post', label: `${pctLevel} ellipse of N(0, Σ)` },
        ...(showSamples ? [{ kind: 'sample' as const, label: 'samples' }] : []),
        ...(showProbes ? [{ kind: 'meas' as const, label: 'ellipse through A / B' }] : []),
      ]}
    />
  {/snippet}

  {#snippet readouts()}
    <MatrixView
      labelTex={SIGMA_TEX}
      label="Sigma"
      values={[
        [sx * sx, rho * sx * sy],
        [rho * sx * sy, sy * sy],
      ]}
    />
    <p class="ro">
      <KaTeXInline tex={eigTex} />
    </p>
    {#if showSamples}
      <p class="ro" data-readout="inside">
        Inside the {pctLevel} ellipse: <strong>{inside}</strong> of {shown}
        ({shown > 0 ? ((100 * inside) / shown).toFixed(1) : '0.0'}%)
      </p>
    {/if}
    {#if showProbes}
      <table class="probes">
        <caption class="visually-hidden">Distances of the probe points from the mean</caption>
        <thead>
          <tr>
            <th scope="col">Point</th><th scope="col">Euclidean</th><th scope="col"><KaTeXInline tex="d_M" /></th><th
              scope="col"
            >
              In {pctLevel}?
            </th>
          </tr>
        </thead>
        <tbody>
          {#each probeInfos as pi, i (i)}
            <tr>
              <th scope="row">{'AB'[i]}</th>
              <td>{f2(pi.euclid)}</td>
              <td>{f2(pi.dM)}</td>
              <td>{pi.inside ? 'yes' : 'no'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/snippet}

  {#snippet controls()}
    <Slider label="sigma x" tex="\sigma_x" min={L.sigma.min} max={L.sigma.max} step={L.sigma.step} bind:value={sx} />
    <Slider label="sigma y" tex="\sigma_y" min={L.sigma.min} max={L.sigma.max} step={L.sigma.step} bind:value={sy} />
    <Slider label="correlation rho" tex="\rho" min={L.rho.min} max={L.rho.max} step={L.rho.step} bind:value={rho} />
    <Select label="Probability inside the ellipse" bind:value={level} options={LEVEL_OPTIONS} />
    <Toggle label="Show samples" bind:checked={showSamples} />
    {#if showSamples}
      <Select
        label="Number of samples"
        bind:value={n}
        options={SAMPLE_COUNT_OPTIONS.map((v) => ({ value: v, label: String(v) }))}
        onchange={() => {
          loop.pause();
          shown = n;
        }}
      />
      <PlayControls playing={loop.playing} ontoggle={togglePlay} onstep={step} atEnd={shown >= n} what="sampling" />
      <SeedControl bind:seed defaultSeed={D.seed} />
    {/if}
    <Toggle label="Show points A and B" bind:checked={showProbes} />
  {/snippet}

  {#snippet caption()}
    {#if preset === 'mahalanobis'}
      Two points at the same Euclidean distance from the mean. The solid ellipse is the {pctLevel} region; each dash-dot ellipse
      passes through one point and has the same shape. <strong>What to look for:</strong> A and B are equally far from the
      centre, but B is much less likely, because it lies across the narrow direction of the ellipse.
    {:else}
      A zero-mean 2D Gaussian with covariance <KaTeXInline tex={SIGMA_TEX} />. The solid ellipse contains {pctLevel} of the
      probability (95% by default); the lines through the centre are the eigenvectors, scaled to the ellipse's semi-axes.
      Drag the handles or use the sliders. <strong>What to look for:</strong> the off-diagonal entry tilts the ellipse, and
      the share of samples inside stays close to the stated probability whatever shape you choose.
    {/if}
  {/snippet}
</WidgetFrame>

<style>
  .eig {
    stroke: var(--c-fg);
    stroke-opacity: 0.55;
    stroke-width: 1.25;
  }
  .center {
    fill: var(--c-fg);
  }
  .ro {
    margin: var(--space-2) 0 0;
    font-size: 0.85rem;
  }
  .probes {
    font-size: 0.82rem;
    margin-top: var(--space-2);
  }
  .probes th,
  .probes td {
    padding: 0.2rem 0.35rem;
  }
  .probes td {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .probes thead th {
    font-weight: 500;
    color: var(--c-muted);
    font-size: 0.75rem;
  }
</style>
