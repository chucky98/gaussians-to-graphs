<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import TexSlider from '../../primitives/TexSlider.svelte';
  import Select from '../../primitives/Select.svelte';
  import SeedControl from '../../primitives/SeedControl.svelte';
  import type { PlotContext } from '../../primitives/plot';
  import { pdf1 } from '../../../lib/math/gaussian';
  import {
    NOISE,
    SHOOTOUT as S,
    crlbStd,
    estimateHistogram,
    estimatesAt,
    makeDraws,
    precompute,
    rmseCurveFrom,
    summarize,
    type EstimatorId,
    type NoiseKind,
  } from '../../../lib/demos/estimator-shootout';

  interface Props {
    noise?: NoiseKind;
  }
  let { noise: initialNoise = 'open' }: Props = $props();
  const startNoise = (): NoiseKind => initialNoise;
  const nIndexDefault = S.nValues.indexOf(S.nDefault as (typeof S.nValues)[number]);

  let noise = $state<NoiseKind>(startNoise());
  let nIndex = $state(nIndexDefault);
  let k = $state<number>(S.kDefault);
  let seed = $state<number>(S.seed);

  const draws = $derived(makeDraws(seed));
  const pc = $derived(precompute(noise, draws));
  const n = $derived(S.nValues[nIndex]!);
  const est = $derived(estimatesAt(pc, nIndex, k));
  const sums = $derived({ mean: summarize(est.mean), median: summarize(est.median), shrink: summarize(est.shrink) });
  const curve = $derived(rmseCurveFrom(pc, k));
  const bound = $derived(crlbStd(noise, n));

  function reset() {
    noise = startNoise();
    nIndex = nIndexDefault;
    k = S.kDefault;
    seed = S.seed;
  }

  const ROWS: { id: EstimatorId; title: string; dash: string; marker: string }[] = [
    { id: 'mean', title: 'Average of the fixes', dash: 'none', marker: 'circle' },
    { id: 'median', title: 'Median of the fixes', dash: '7 4', marker: 'square' },
    { id: 'shrink', title: "Average, pulled towards yesterday's estimate (2 m)", dash: '2 3', marker: 'triangle' },
  ];

  const yMaxHist = $derived(Math.max(0.6, 1.15 / (bound * Math.sqrt(2 * Math.PI))));
  function crlbPath(ctx: PlotContext): string {
    const [lo, hi] = S.xDomain;
    let s = '';
    for (let i = 0; i <= 200; i++) {
      const x = lo + ((hi - lo) * i) / 200;
      s += `${i === 0 ? 'M' : 'L'}${ctx.x(x).toFixed(1)},${ctx.y(Math.min(yMaxHist, pdf1(x, S.truth, bound))).toFixed(1)}`;
    }
    return s;
  }

  // log–log RMSE plot
  const lg = Math.log10;
  const curveYMin = $derived(lg(0.2));
  const curveYMax = $derived(lg(Math.max(12, ...curve.map((p) => Math.max(p.mean, p.median, p.shrink)))));
  function series(ctx: PlotContext, key: 'mean' | 'median' | 'shrink' | 'crlb'): string {
    return curve
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${ctx.x(lg(p.n)).toFixed(1)},${ctx.y(lg(p[key])).toFixed(1)}`)
      .join('');
  }
  function markerPath(kind: string, x: number, y: number): string {
    if (kind === 'square') return `M${x - 3.5},${y - 3.5}h7v7h-7z`;
    if (kind === 'triangle') return `M${x},${y - 4.5}l4.5,7.5h-9z`;
    return `M${x - 3.5},${y}a3.5,3.5 0 1,0 7,0a3.5,3.5 0 1,0 -7,0`;
  }

  const f2 = (v: number) => v.toFixed(2);
  const live = $derived(
    `${n} fixes per experiment, ${NOISE[noise].label}. Root-mean-square error: average ${f2(sums.mean.rmse)} m, median ${f2(sums.median.rmse)} m, shrinkage ${f2(sums.shrink.rmse)} m. Cramér–Rao bound ${f2(bound)} m.`,
  );
</script>

<WidgetFrame
  name="EstimatorShootout"
  title="Three ways to average GPS fixes"
  description="A GPS receiver sits on a surveyed benchmark whose true position is known. The same experiment, averaging n fixes, is repeated 2000 times with three estimators; histograms show where their answers land, and a second chart shows their error against the number of fixes."
  {live}
  onreset={reset}
>
  {#snippet figure()}
    <div class="hists">
      {#each ROWS as row (row.id)}
        {@const h = estimateHistogram(est[row.id])}
        <div class="hist">
          <p class="htitle">{row.title}</p>
          <Plot2D
            xDomain={S.xDomain}
            yDomain={[0, yMaxHist]}
            aspect={0.2}
            maxHeight={130}
            margin={{ top: 4, right: 10, bottom: row.id === 'shrink' ? 30 : 12, left: 10 }}
            label={`Histogram of the ${row.id} estimates`}
          >
            {#snippet children(ctx)}
              <Axes
                {ctx}
                xTicks={8}
                showY={false}
                grid={false}
                xLabel={row.id === 'shrink' ? 'estimated east offset (m)' : undefined}
              />
              <g clip-path="url(#{ctx.uid}-clip)">
                {#each h.density as dd, i (i)}
                  {#if dd > 0}
                    <rect
                      class="bar"
                      x={ctx.x(h.edges[i]!)}
                      y={ctx.y(Math.min(dd, yMaxHist))}
                      width={Math.max(0, ctx.x(h.edges[i + 1]!) - ctx.x(h.edges[i]!) - 0.5)}
                      height={ctx.y(0) - ctx.y(Math.min(dd, yMaxHist))}
                    />
                  {/if}
                {/each}
                <path class="crlb" d={crlbPath(ctx)} />
                <line class="truth" x1={ctx.x(S.truth)} x2={ctx.x(S.truth)} y1={ctx.inner.top} y2={ctx.inner.bottom} />
                {#if row.id === 'shrink'}
                  <line
                    class="guess"
                    x1={ctx.x(S.guess)}
                    x2={ctx.x(S.guess)}
                    y1={ctx.inner.top}
                    y2={ctx.inner.bottom}
                  />
                {/if}
              </g>
            {/snippet}
          </Plot2D>
        </div>
      {/each}
    </div>
    <ul class="key">
      <li><span class="sw bar-sw"></span>2000 experiments</li>
      <li><span class="sw truth-sw"></span>true position</li>
      <li><span class="sw crlb-sw"></span>best possible spread (Cramér–Rao)</li>
    </ul>
    <div class="curve">
      <p class="htitle">Root-mean-square error against the number of fixes (log–log)</p>
      <Plot2D
        xDomain={[0, 2]}
        yDomain={[curveYMin, curveYMax]}
        aspect={0.45}
        maxHeight={240}
        margin={{ top: 8, right: 12, bottom: 30, left: 40 }}
        label="RMSE of each estimator and the Cramér–Rao bound against sample size"
      >
        {#snippet children(ctx)}
          <Axes
            {ctx}
            xTickValues={[0, lg(2), lg(5), 1, lg(20), lg(50), 2]}
            yTickValues={[lg(0.3), lg(1), lg(3), lg(10)].filter((v) => v <= curveYMax)}
            format={(v) => String(Math.round(10 ** v))}
            yFormat={(v) => String(+(10 ** v).toFixed(1))}
            xLabel="fixes per experiment, m"
            yLabel="RMSE (m)"
          />
          <line class="now" x1={ctx.x(lg(n))} x2={ctx.x(lg(n))} y1={ctx.inner.top} y2={ctx.inner.bottom} />
          <path class="crlb" d={series(ctx, 'crlb')} />
          {#each ROWS as row (row.id)}
            <path class="est" style:stroke-dasharray={row.dash} d={series(ctx, row.id)} />
            {#each curve as p (p.n)}
              <path class="mk" d={markerPath(row.marker, ctx.x(lg(p.n)), ctx.y(lg(p[row.id])))} />
            {/each}
          {/each}
        {/snippet}
      </Plot2D>
      <ul class="key">
        {#each ROWS as row (row.id)}
          <li>
            <svg width="34" height="12" viewBox="0 0 34 12" aria-hidden="true">
              <line class="est" x1="1" y1="6" x2="33" y2="6" style:stroke-dasharray={row.dash} />
              <path class="mk" d={markerPath(row.marker, 17, 6)} />
            </svg>
            {row.id === 'shrink' ? 'shrinkage' : row.id === 'mean' ? 'average' : 'median'}
          </li>
        {/each}
        <li><span class="sw crlb-sw"></span>Cramér–Rao bound</li>
      </ul>
    </div>
  {/snippet}

  {#snippet readouts()}
    <table class="ro">
      <caption class="visually-hidden">Bias, spread and error of each estimator</caption>
      <thead>
        <tr><th scope="col"></th><th scope="col">bias</th><th scope="col">spread</th><th scope="col">RMSE</th></tr>
      </thead>
      <tbody>
        {#each ROWS as row (row.id)}
          <tr>
            <th scope="row">{row.id === 'shrink' ? 'shrinkage' : row.id === 'mean' ? 'average' : 'median'}</th>
            <td>{f2(sums[row.id].bias)}</td>
            <td>{f2(sums[row.id].std)}</td>
            <td data-readout={`rmse-${row.id}`}>{f2(sums[row.id].rmse)}</td>
          </tr>
        {/each}
        <tr class="bound">
          <th scope="row">Cramér–Rao</th>
          <td>0</td>
          <td data-readout="crlb">{f2(bound)}</td>
          <td>{f2(bound)}</td>
        </tr>
      </tbody>
    </table>
    <p class="unit">All in metres, over 2000 repeated experiments.</p>
  {/snippet}

  {#snippet controls()}
    <Slider
      label="Fixes per experiment"
      min={0}
      max={S.nValues.length - 1}
      step={1}
      bind:value={nIndex}
      format={(i) => String(S.nValues[i])}
    />
    <Select
      label="Where the receiver is"
      value={noise}
      options={(['open', 'urban'] as const).map((v) => ({ value: v, label: NOISE[v].label }))}
      onchange={(v) => (noise = v)}
    />
    <TexSlider
      label="Prior weight kappa: yesterday's estimate counts as kappa fixes"
      tex="\kappa"
      min={S.kLimits.min}
      max={S.kLimits.max}
      step={S.kLimits.step}
      bind:value={k}
      format={(v) => `${v} fixes`}
    />
    <SeedControl bind:seed defaultSeed={S.seed} />
  {/snippet}

  {#snippet caption()}
    A GPS receiver sits on a surveyed benchmark, so its true position (east offset 0 m) is known exactly. Each
    experiment takes m fixes and estimates the position three ways; repeating it 2000 times shows how each estimator's
    answers scatter. The dashed curve is the narrowest scatter any unbiased estimator can achieve with m fixes (the
    Cramér–Rao bound). <strong>What to look for:</strong> under open sky the average sits right on the bound; near buildings,
    where a few fixes are wildly off, the median wins by a wide margin.
  {/snippet}
</WidgetFrame>

<style>
  .hists {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .htitle {
    margin: 0.2rem 0 0;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--c-muted);
  }
  .bar {
    fill: var(--c-sample);
    opacity: 0.55;
  }
  .crlb {
    fill: none;
    stroke: var(--c-fg);
    stroke-width: 1.25;
    stroke-dasharray: 4 3;
    opacity: 0.85;
  }
  .truth {
    stroke: var(--c-truth);
    stroke-width: var(--stroke-thin);
  }
  .guess {
    stroke: var(--c-prior);
    stroke-width: 1.5;
    stroke-dasharray: var(--dash-prior);
  }
  .curve {
    margin-top: var(--space-3);
  }
  .est {
    fill: none;
    stroke: var(--c-post);
    stroke-width: 2;
  }
  .mk {
    fill: var(--c-bg);
    stroke: var(--c-post);
    stroke-width: 1.5;
  }
  .now {
    stroke: var(--c-axis);
    stroke-dasharray: 2 3;
  }
  .key {
    list-style: none;
    padding: 0;
    margin: 0.3rem 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.9rem;
    font-size: 0.78rem;
  }
  .key li {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .sw {
    display: inline-block;
    width: 22px;
    height: 0;
  }
  .bar-sw {
    height: 10px;
    background: var(--c-sample);
    opacity: 0.55;
  }
  .truth-sw {
    border-top: 1.25px solid var(--c-truth);
  }
  .crlb-sw {
    border-top: 1.5px dashed var(--c-fg);
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
  .ro tbody th {
    text-align: left;
    font-weight: 500;
  }
  .bound {
    color: var(--c-muted);
  }
  .unit {
    font-size: 0.75rem;
    color: var(--c-muted);
    margin: 0.3rem 0 0;
  }
</style>
