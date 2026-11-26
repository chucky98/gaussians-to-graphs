<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import CovEllipse from '../../primitives/CovEllipse.svelte';
  import PointsCanvas from '../../primitives/PointsCanvas.svelte';
  import TexSlider from '../../primitives/TexSlider.svelte';
  import Select from '../../primitives/Select.svelte';
  import SeedControl from '../../primitives/SeedControl.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import type { PlotContext } from '../../primitives/plot';
  import { pdf1 } from '../../../lib/math/gaussian';
  import {
    FN_ORDER,
    FUNCTIONS,
    PROP_DEFAULTS as D,
    SAMPLE_COUNTS,
    defaultParams,
    outputHistogram,
    propagate,
    standardDraws,
    type FnId,
    type Params,
  } from '../../../lib/demos/nonlinear-propagation';

  interface Props {
    /** Which function to start with. */
    fn?: FnId;
  }
  let { fn: initialFn = D.fn }: Props = $props();

  /** The preset is read once, at creation (and again by Reset). */
  const startFn = (): FnId => initialFn;
  let fnId = $state<FnId>(startFn());
  let params = $state<Params>(defaultParams(startFn()));
  let n = $state<number>(D.n);
  let seed = $state<number>(D.seed);

  const cfg = $derived(FUNCTIONS[fnId]);
  const z = $derived(standardDraws(seed, n, cfg.dim));
  const res = $derived(propagate(fnId, params, z));
  const hist = $derived(cfg.dim === 1 ? outputHistogram(fnId, res.outPts) : null);

  function changeFn(id: FnId) {
    fnId = id;
    params = defaultParams(id);
  }
  function reset() {
    fnId = startFn();
    params = defaultParams(startFn());
    n = D.n;
    seed = D.seed;
  }

  // 1D helpers
  const mu = $derived(res.input.mean[0]!);
  const fmu = $derived(cfg.fn.f(Float64Array.of(mu))[0]!);
  const slope = $derived(cfg.fn.jacobian(Float64Array.of(mu)).data[0]!);
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
    // Input density drawn along the bottom of the function plot, scaled to a quarter of its height.
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
    const sd = Math.sqrt(v);
    let s = '';
    for (let i = 0; i <= 300; i++) {
      const y = lo + ((hi - lo) * i) / 300;
      s += `${i === 0 ? 'M' : 'L'}${ctx.x(y).toFixed(1)},${ctx.y(Math.min(cfg.outY[1] * 1.2, pdf1(y, m, sd))).toFixed(1)}`;
    }
    return s;
  }

  const pct = (v: number) => `${(100 * v).toFixed(1)}%`;
  const f2 = (v: number) => v.toFixed(2);
  const f3 = (v: number) => v.toFixed(3);
  const linDegenerate = $derived(cfg.dim === 1 && res.lin.cov.data[0]! < 1e-6);
  const live = $derived(
    `${cfg.label}. Monte Carlo mean ${Array.from(res.mc.mean).map(f2).join(', ')}; linearized mean ${Array.from(res.lin.mean).map(f2).join(', ')}. ` +
      `${pct(res.insideLin)} of the samples fall inside the linearized 95% region.`,
  );
</script>

<WidgetFrame
  name="NonlinearPropagation"
  title="Pushing a Gaussian through a function"
  description="Samples from an input Gaussian are pushed through a chosen function. The output samples are compared with a Gaussian fitted to them and with the linearized (first-order) prediction."
  {live}
  onreset={reset}
>
  {#snippet figure()}
    <div class="pair">
      <div class="panel">
        <p class="ptitle">Input</p>
        {#if cfg.dim === 2}
          <Plot2D
            xDomain={cfg.inX}
            yDomain={cfg.inY}
            equalAspect={fnId === 'linear'}
            aspect={0.9}
            maxHeight={330}
            margin={{ top: 8, right: 8, bottom: 30, left: 34 }}
            label="Input samples and the input Gaussian's 95% ellipse"
          >
            {#snippet underlay(ctx)}<PointsCanvas {ctx} points={res.inPts} radius={1.4} opacity={0.35} />{/snippet}
            {#snippet children(ctx)}
              <Axes {ctx} xTicks={5} yTicks={5} xLabel={cfg.inLabels[0]} yLabel={cfg.inLabels[1]} />
              {#if fnId === 'polar'}
                {@const s = Math.PI / 180}
                <CovEllipse
                  {ctx}
                  mean={[res.input.mean[1]! / s, res.input.mean[0]!]}
                  cov={{
                    rows: 2,
                    cols: 2,
                    data: Float64Array.of(res.input.cov.data[3]! / (s * s), 0, 0, res.input.cov.data[0]!),
                  }}
                  kind="post"
                />
              {:else}
                <CovEllipse {ctx} mean={[res.input.mean[0]!, res.input.mean[1]!]} cov={res.input.cov} kind="post" />
              {/if}
            {/snippet}
          </Plot2D>
        {:else}
          <Plot2D
            xDomain={cfg.inX}
            yDomain={cfg.inY}
            aspect={0.9}
            maxHeight={330}
            margin={{ top: 8, right: 8, bottom: 30, left: 34 }}
            label="The function, its tangent line at the mean, and the input density"
          >
            {#snippet children(ctx)}
              <Axes {ctx} xTicks={6} yTicks={5} xLabel={cfg.inLabels[0]} yLabel={cfg.inLabels[1]} />
              <g clip-path="url(#{ctx.uid}-clip)">
                <path class="input-density" d={inputDensityPath(ctx)} />
                <path class="fn" d={fnPath(ctx)} />
                <line
                  class="tangent"
                  x1={ctx.x(cfg.inX[0])}
                  y1={ctx.y(fmu + slope * (cfg.inX[0] - mu))}
                  x2={ctx.x(cfg.inX[1])}
                  y2={ctx.y(fmu + slope * (cfg.inX[1] - mu))}
                />
                <circle class="mu" cx={ctx.x(mu)} cy={ctx.y(fmu)} r="4" />
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
            label="Output samples with the fitted and linearized 95% ellipses"
          >
            {#snippet underlay(ctx)}<PointsCanvas {ctx} points={res.outPts} radius={1.4} opacity={0.35} />{/snippet}
            {#snippet children(ctx)}
              <Axes {ctx} xTicks={5} yTicks={5} xLabel={cfg.outLabels[0]} yLabel={cfg.outLabels[1]} />
              <CovEllipse {ctx} mean={[res.mc.mean[0]!, res.mc.mean[1]!]} cov={res.mc.cov} kind="sample" />
              <CovEllipse {ctx} mean={[res.lin.mean[0]!, res.lin.mean[1]!]} cov={res.lin.cov} kind="prior" />
              <circle class="mc-mean" cx={ctx.x(res.mc.mean[0]!)} cy={ctx.y(res.mc.mean[1]!)} r="3.5" />
              <path
                class="lin-mean"
                d="M{ctx.x(res.lin.mean[0]!) - 5},{ctx.y(res.lin.mean[1]!) - 5}l10,10m0,-10l-10,10"
              />
            {/snippet}
          </Plot2D>
        {:else}
          <Plot2D
            xDomain={cfg.outX}
            yDomain={cfg.outY}
            aspect={0.9}
            maxHeight={330}
            margin={{ top: 8, right: 8, bottom: 30, left: 34 }}
            label="Histogram of the output with the fitted and linearized densities"
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
                <path class="mc-curve" d={gaussPath(ctx, res.mc.mean[0]!, res.mc.cov.data[0]!)} />
                {#if linDegenerate}
                  <line
                    class="lin-spike"
                    x1={ctx.x(res.lin.mean[0]!)}
                    x2={ctx.x(res.lin.mean[0]!)}
                    y1={ctx.y(0)}
                    y2={ctx.inner.top}
                  />
                  <text class="note" x={ctx.x(res.lin.mean[0]!) + 6} y={ctx.inner.top + 12}>
                    linearized variance ≈ 0
                  </text>
                {:else}
                  <path class="lin-curve" d={gaussPath(ctx, res.lin.mean[0]!, res.lin.cov.data[0]!)} />
                {/if}
              </g>
            {/snippet}
          </Plot2D>
        {/if}
      </div>
    </div>
    <Legend
      items={cfg.dim === 2
        ? [
            { kind: 'post', label: 'input 95% ellipse' },
            { kind: 'sample', label: 'samples, and the 95% ellipse fitted to them (●: mean)' },
            { kind: 'prior', label: 'linearized 95% ellipse (×: f(μ))' },
          ]
        : [
            { kind: 'truth', label: 'f(x)' },
            { kind: 'prior', label: 'tangent at μ, and the linearized output' },
            { kind: 'sample', label: 'output histogram and fitted Gaussian' },
          ]}
    />
  {/snippet}

  {#snippet readouts()}
    <table class="ro">
      <caption class="visually-hidden">Monte Carlo against linearization</caption>
      <thead><tr><th scope="col"></th><th scope="col">Monte Carlo</th><th scope="col">Linearized</th></tr></thead>
      <tbody>
        <tr>
          <th scope="row">mean</th>
          <td data-readout="mc-mean">{Array.from(res.mc.mean).map(f2).join(', ')}</td>
          <td data-readout="lin-mean">{Array.from(res.lin.mean).map(f2).join(', ')}</td>
        </tr>
        {#if cfg.dim === 1}
          <tr>
            <th scope="row">variance</th>
            <td data-readout="mc-var">{f3(res.mc.cov.data[0]!)}</td>
            <td data-readout="lin-var">{f3(res.lin.cov.data[0]!)}</td>
          </tr>
        {:else}
          <tr>
            <th scope="row">std. dev.</th>
            <td>{f2(Math.sqrt(res.mc.cov.data[0]!))}, {f2(Math.sqrt(res.mc.cov.data[3]!))}</td>
            <td>{f2(Math.sqrt(res.lin.cov.data[0]!))}, {f2(Math.sqrt(res.lin.cov.data[3]!))}</td>
          </tr>
        {/if}
        <tr>
          <th scope="row">inside 95%</th>
          <td data-readout="inside-mc">{pct(res.insideMc)}</td>
          <td data-readout="inside-lin">{pct(res.insideLin)}</td>
        </tr>
      </tbody>
    </table>
    {#if res.exactMean}
      <p class="exact">
        Exact mean: {res.exactMean.map(f2).join(', ')}{#if res.exactVar !== null}; exact variance {f3(
            res.exactVar,
          )}{/if}
      </p>
    {/if}
  {/snippet}

  {#snippet controls()}
    <Select
      label="Function"
      value={fnId}
      options={FN_ORDER.map((id) => ({ value: id, label: FUNCTIONS[id].label }))}
      onchange={(v) => changeFn(v)}
    />
    {#each cfg.sliders as s (fnId + s.key)}
      <TexSlider
        label={s.label}
        tex={s.tex}
        min={s.min}
        max={s.max}
        step={s.step}
        bind:value={params[s.key]!}
        format={(v) => (s.unit === '°' ? `${v.toFixed(0)}°` : v.toFixed(2) + (s.unit ? ` ${s.unit}` : ''))}
      />
    {/each}
    <Select
      label="Number of samples"
      bind:value={n}
      options={SAMPLE_COUNTS.map((v) => ({ value: v, label: String(v) }))}
    />
    <SeedControl bind:seed defaultSeed={D.seed} />
  {/snippet}

  {#snippet caption()}
    Samples of the input Gaussian are pushed through the chosen function. The output is summarized two ways: by the mean
    and covariance of the samples themselves (Monte Carlo), and by the first-order prediction from the Jacobian at the
    mean (linearized). Ellipses and the "inside 95%" row refer to 95% regions. <strong>What to look for:</strong> when the
    input is narrow compared with how quickly the function bends, the two summaries agree; when it is wide, the samples bend
    away from the linearized ellipse and its "95%" region holds far fewer than 95% of them.
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
  .tangent,
  .lin-curve,
  .lin-spike {
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
  .mu {
    fill: var(--c-prior);
  }
  .bar {
    fill: var(--c-sample);
    opacity: 0.45;
  }
  .mc-curve {
    fill: none;
    stroke: var(--c-sample);
    stroke-width: var(--stroke-base);
  }
  .mc-mean {
    fill: var(--c-sample);
    stroke: var(--c-bg);
    stroke-width: 1;
  }
  .lin-mean {
    stroke: var(--c-prior);
    stroke-width: 2.5;
  }
  .note {
    font-size: 11px;
    fill: var(--c-prior-text);
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
</style>
