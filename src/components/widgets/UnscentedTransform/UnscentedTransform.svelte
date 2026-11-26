<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import CovEllipse from '../../primitives/CovEllipse.svelte';
  import PointsCanvas from '../../primitives/PointsCanvas.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import Select from '../../primitives/Select.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import type { PlotContext } from '../../primitives/plot';
  import { pdf1 } from '../../../lib/math/gaussian';
  import {
    FN_ORDER,
    FUNCTIONS,
    PROP_DEFAULTS as D,
    defaultParams,
    outputHistogram,
    standardDraws,
    type FnId,
    type Params,
  } from '../../../lib/demos/nonlinear-propagation';
  import { UT_LIMITS as UL, compare, utDefaults } from '../../../lib/demos/unscented-transform';

  let fnId = $state<FnId>(D.fn);
  let params = $state<Params>(defaultParams(D.fn));
  let alpha = $state<number>(utDefaults(2).alpha);
  let beta = $state<number>(utDefaults(2).beta);
  let kappa = $state<number>(utDefaults(2).kappa);

  const cfg = $derived(FUNCTIONS[fnId]);
  const z = $derived(standardDraws(D.seed, D.n, cfg.dim));
  const res = $derived(compare(fnId, params, z, { alpha, beta, kappa }));
  const hist = $derived(cfg.dim === 1 ? outputHistogram(fnId, res.outPts) : null);

  function setUt(dim: number) {
    const u = utDefaults(dim);
    alpha = u.alpha;
    beta = u.beta;
    kappa = u.kappa;
  }
  function changeFn(id: FnId) {
    fnId = id;
    params = defaultParams(id);
    setUt(FUNCTIONS[id].dim);
  }
  function reset() {
    changeFn(D.fn);
  }

  // 1D helpers
  const mu = $derived(res.input.mean[0]!);
  function fnPath(ctx: PlotContext): string {
    const [lo, hi] = cfg.inX;
    let s = '';
    for (let i = 0; i <= 200; i++) {
      const x = lo + ((hi - lo) * i) / 200;
      s += `${i === 0 ? 'M' : 'L'}${ctx.x(x).toFixed(1)},${ctx.y(cfg.fn.f(Float64Array.of(x))[0]!).toFixed(1)}`;
    }
    return s;
  }
  function inputDensityPath(ctx: PlotContext): string {
    const [lo, hi] = cfg.inX;
    const sd = Math.sqrt(res.input.cov.data[0]!);
    const peak = pdf1(mu, mu, sd);
    const base = cfg.inY[0];
    const h = 0.25 * (cfg.inY[1] - cfg.inY[0]);
    let s = '';
    for (let i = 0; i <= 200; i++) {
      const x = lo + ((hi - lo) * i) / 200;
      s += `${i === 0 ? 'M' : 'L'}${ctx.x(x).toFixed(1)},${ctx.y(base + (h * pdf1(x, mu, sd)) / peak).toFixed(1)}`;
    }
    return s;
  }
  function gaussPath(ctx: PlotContext, m: number, v: number): string {
    const [lo, hi] = cfg.outX;
    const sd = Math.sqrt(Math.max(v, 1e-12));
    let s = '';
    for (let i = 0; i <= 300; i++) {
      const y = lo + ((hi - lo) * i) / 300;
      s += `${i === 0 ? 'M' : 'L'}${ctx.x(y).toFixed(1)},${ctx.y(Math.min(cfg.outY[1] * 1.2, pdf1(y, m, sd))).toFixed(1)}`;
    }
    return s;
  }
  const S = Math.PI / 180;
  const polarCov = $derived({
    rows: 2,
    cols: 2,
    data: Float64Array.of(res.input.cov.data[3]! / (S * S), 0, 0, res.input.cov.data[0]!),
  });

  const pct = (v: number) => `${(100 * v).toFixed(1)}%`;
  const f2 = (v: number) => v.toFixed(2);
  const f3 = (v: number) => v.toFixed(3);
  const errText = (v: number) => (v < 0.0005 ? '< 0.001' : f3(v));
  const live = $derived(
    `${cfg.label}. Inside the 95% region: linearized ${pct(res.insideLin)}, unscented ${pct(res.insideUt)}, ` +
      `fitted to the samples ${pct(res.insideMc)}. Mean error: linearized ${errText(res.meanErrLin)}, unscented ${errText(res.meanErrUt)}.`,
  );
</script>

<WidgetFrame
  name="UnscentedTransform"
  title="Linearization against the unscented transform"
  description="A Gaussian is pushed through a chosen function. The output samples are compared with the first-order (linearized) prediction and with the unscented transform, which pushes a handful of sigma points through the exact function."
  {live}
  onreset={reset}
>
  {#snippet figure()}
    <div class="pair">
      <div class="panel">
        <p class="ptitle">Input, with sigma points</p>
        {#if cfg.dim === 2}
          <Plot2D
            xDomain={cfg.inX}
            yDomain={cfg.inY}
            equalAspect={fnId === 'linear'}
            aspect={0.9}
            maxHeight={330}
            margin={{ top: 8, right: 8, bottom: 30, left: 34 }}
            label="Input samples, the input Gaussian's 95% ellipse and the sigma points"
          >
            {#snippet underlay(ctx)}<PointsCanvas {ctx} points={res.inPts} radius={1.4} opacity={0.3} />{/snippet}
            {#snippet children(ctx)}
              <Axes {ctx} xTicks={5} yTicks={5} xLabel={cfg.inLabels[0]} yLabel={cfg.inLabels[1]} />
              {#if fnId === 'polar'}
                <CovEllipse
                  {ctx}
                  mean={[res.input.mean[1]! / S, res.input.mean[0]!]}
                  cov={polarCov}
                  kind="truth"
                  thin
                />
              {:else}
                <CovEllipse
                  {ctx}
                  mean={[res.input.mean[0]!, res.input.mean[1]!]}
                  cov={res.input.cov}
                  kind="truth"
                  thin
                />
              {/if}
              {#each res.sigmaIn as [a, b], i (i)}
                <circle class="sigma" cx={ctx.x(a)} cy={ctx.y(b)} r={i === 0 ? 6 : 5} />
              {/each}
            {/snippet}
          </Plot2D>
        {:else}
          <Plot2D
            xDomain={cfg.inX}
            yDomain={cfg.inY}
            aspect={0.9}
            maxHeight={330}
            margin={{ top: 8, right: 8, bottom: 30, left: 34 }}
            label="The function, the input density and the sigma points with their images"
          >
            {#snippet children(ctx)}
              <Axes {ctx} xTicks={6} yTicks={5} xLabel={cfg.inLabels[0]} yLabel={cfg.inLabels[1]} />
              <g clip-path="url(#{ctx.uid}-clip)">
                <path class="input-density" d={inputDensityPath(ctx)} />
                <path class="fn" d={fnPath(ctx)} />
                {#each res.sigmaIn as [a], i (i)}
                  {@const y = res.sigmaOut[i]![0]!}
                  <line class="drop" x1={ctx.x(a)} x2={ctx.x(a)} y1={ctx.y(cfg.inY[0])} y2={ctx.y(y)} />
                  <circle class="sigma" cx={ctx.x(a)} cy={ctx.y(y)} r="5" />
                {/each}
              </g>
            {/snippet}
          </Plot2D>
        {/if}
      </div>
      <div class="panel">
        <p class="ptitle">Output</p>
        {#if cfg.dim === 2}
          <Plot2D
            xDomain={cfg.outX}
            yDomain={cfg.outY}
            equalAspect
            maxHeight={330}
            margin={{ top: 8, right: 8, bottom: 30, left: 34 }}
            label="Output samples with the fitted, linearized and unscented 95% ellipses"
          >
            {#snippet underlay(ctx)}<PointsCanvas {ctx} points={res.outPts} radius={1.4} opacity={0.3} />{/snippet}
            {#snippet children(ctx)}
              <Axes {ctx} xTicks={5} yTicks={5} xLabel={cfg.outLabels[0]} yLabel={cfg.outLabels[1]} />
              <CovEllipse {ctx} mean={[res.mc.mean[0]!, res.mc.mean[1]!]} cov={res.mc.cov} kind="sample" thin />
              <CovEllipse {ctx} mean={[res.lin.mean[0]!, res.lin.mean[1]!]} cov={res.lin.cov} kind="prior" />
              <CovEllipse {ctx} mean={[res.ut.mean[0]!, res.ut.mean[1]!]} cov={res.ut.cov} kind="post" />
              {#each res.sigmaOut as y, i (i)}
                <circle class="sigma" cx={ctx.x(y[0]!)} cy={ctx.y(y[1]!)} r="5" />
              {/each}
            {/snippet}
          </Plot2D>
        {:else}
          <Plot2D
            xDomain={cfg.outX}
            yDomain={cfg.outY}
            aspect={0.9}
            maxHeight={330}
            margin={{ top: 8, right: 8, bottom: 30, left: 34 }}
            label="Histogram of the output with the linearized and unscented densities"
          >
            {#snippet children(ctx)}
              <Axes {ctx} xTicks={6} yTicks={4} xLabel={cfg.outLabels[0]} yLabel={cfg.outLabels[1]} />
              <g clip-path="url(#{ctx.uid}-clip)">
                {#if hist}
                  {#each hist.density as d, i (i)}
                    {#if d > 0}
                      <rect
                        class="bar"
                        x={ctx.x(hist.edges[i]!)}
                        y={ctx.y(Math.min(d, cfg.outY[1]))}
                        width={Math.max(0, ctx.x(hist.edges[i + 1]!) - ctx.x(hist.edges[i]!) - 1)}
                        height={ctx.y(0) - ctx.y(Math.min(d, cfg.outY[1]))}
                      />
                    {/if}
                  {/each}
                {/if}
                {#if res.lin.cov.data[0]! > 1e-6}
                  <path class="lin-curve" d={gaussPath(ctx, res.lin.mean[0]!, res.lin.cov.data[0]!)} />
                {/if}
                <path class="ut-curve" d={gaussPath(ctx, res.ut.mean[0]!, res.ut.cov.data[0]!)} />
                {#each res.sigmaOut as y, i (i)}
                  <circle class="sigma" cx={ctx.x(y[0]!)} cy={ctx.y(0) - 6} r="5" />
                {/each}
              </g>
            {/snippet}
          </Plot2D>
        {/if}
      </div>
    </div>
    <Legend
      items={[
        { kind: 'sample', label: 'Monte Carlo samples (and their fitted 95% ellipse)' },
        { kind: 'prior', label: 'linearized (first order)' },
        { kind: 'post', label: `unscented transform, from ${res.sigmaIn.length} sigma points (○)` },
      ]}
    />
  {/snippet}

  {#snippet readouts()}
    <table class="ro">
      <caption class="visually-hidden">Linearization against the unscented transform</caption>
      <thead><tr><th scope="col"></th><th scope="col">Linearized</th><th scope="col">Unscented</th></tr></thead>
      <tbody>
        <tr>
          <th scope="row">inside 95%</th>
          <td data-readout="inside-lin">{pct(res.insideLin)}</td>
          <td data-readout="inside-ut">{pct(res.insideUt)}</td>
        </tr>
        <tr>
          <th scope="row">mean error</th>
          <td data-readout="err-lin">{errText(res.meanErrLin)}</td>
          <td data-readout="err-ut">{errText(res.meanErrUt)}</td>
        </tr>
        {#if cfg.dim === 1}
          <tr>
            <th scope="row">variance</th>
            <td data-readout="var-lin">{f3(res.lin.cov.data[0]!)}</td>
            <td data-readout="var-ut">{f3(res.ut.cov.data[0]!)}</td>
          </tr>
        {/if}
      </tbody>
    </table>
    <p class="exact">
      Samples: {pct(res.insideMc)} inside their own fitted 95% region.
      {#if res.exactVar !== null}Exact variance {f3(res.exactVar)}.{/if}
      Mean error is the distance from the exact mean{fnId === 'linear' ? '' : ` (${res.exactMean.map(f2).join(', ')})`}.
    </p>
  {/snippet}

  {#snippet controls()}
    <Select
      label="Function"
      value={fnId}
      options={FN_ORDER.map((id) => ({ value: id, label: FUNCTIONS[id].label }))}
      onchange={(v) => changeFn(v)}
    />
    {#each cfg.sliders as s (fnId + s.key)}
      <Slider
        label={s.label.charAt(0).toUpperCase() + s.label.slice(1)}
        min={s.min}
        max={s.max}
        step={s.step}
        bind:value={params[s.key]!}
        format={(v) => (s.unit === '°' ? `${v.toFixed(0)}°` : v.toFixed(2) + (s.unit ? ` ${s.unit}` : ''))}
      />
    {/each}
    <Slider label="Spread α" min={UL.alpha.min} max={UL.alpha.max} step={UL.alpha.step} bind:value={alpha} />
    <Slider
      label="β (distribution)"
      min={UL.beta.min}
      max={UL.beta.max}
      step={UL.beta.step}
      bind:value={beta}
      format={(v) => v.toFixed(1)}
    />
    <Slider
      label="κ (secondary scaling)"
      min={UL.kappa.min}
      max={UL.kappa.max}
      step={UL.kappa.step}
      bind:value={kappa}
      format={(v) => v.toFixed(1)}
    />
  {/snippet}

  {#snippet caption()}
    The input Gaussian (left) is pushed through the chosen function in three ways: {D.n} random samples (Monte Carlo), the
    tangent at the mean (linearized), and the unscented transform, which pushes 2n + 1 sigma points through the exact function
    and takes their weighted mean and covariance. Ellipses and the "inside 95%" row refer to 95% regions; "mean error" is
    the distance from the exact mean. <strong>What to look for:</strong> on the polar banana, five sigma points find the
    mean more accurately than {D.n} samples and enclose about 95% of them, while the linearized ellipse is displaced and holds
    only 70%.
  {/snippet}
</WidgetFrame>

<style>
  .pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--space-3);
  }
  @container (max-width: 520px) {
    .pair {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .panel {
    min-width: 0;
  }
  .ptitle {
    margin: 0 0 0.25rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--c-muted);
  }
  .fn {
    fill: none;
    stroke: var(--c-truth);
    stroke-width: var(--stroke-thin);
  }
  .lin-curve {
    fill: none;
    stroke: var(--c-prior);
    stroke-width: var(--stroke-base);
    stroke-dasharray: var(--dash-prior);
  }
  .input-density {
    fill: color-mix(in srgb, var(--c-post) 15%, transparent);
    stroke: var(--c-post);
    stroke-width: var(--stroke-base);
  }
  .bar {
    fill: var(--c-sample);
    opacity: 0.45;
  }
  .ro {
    font-size: 0.82rem;
    width: 100%;
  }
  .ro th,
  .ro td {
    padding: 0.2rem 0.3rem;
  }
  .ro td {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .ro thead th {
    font-weight: 500;
    color: var(--c-muted);
    font-size: 0.75rem;
    text-align: right;
  }
  .exact {
    font-size: 0.8rem;
    color: var(--c-muted);
    margin: var(--space-2) 0 0;
  }
  .sigma {
    fill: var(--c-bg);
    stroke: var(--c-post);
    stroke-width: 2.5;
  }
  .drop {
    stroke: var(--c-post);
    stroke-dasharray: 2 3;
  }
  .ut-curve {
    fill: none;
    stroke: var(--c-post);
    stroke-width: var(--stroke-thick);
  }
</style>
