<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import TexSlider from '../../primitives/TexSlider.svelte';
  import Handle from '../../primitives/Handle.svelte';
  import KaTeXInline from '../../primitives/KaTeXInline.svelte';
  import type { PlotContext } from '../../primitives/plot';
  import {
    GAUSSIAN_1D_DEFAULTS as D,
    GAUSSIAN_1D_LIMITS as L,
    areaPolygon,
    bands,
    curve,
    muFromHandle,
    peak,
    sigmaFromHandle,
  } from '../../../lib/demos/gaussian-1d';
  import { pdf1 } from '../../../lib/math/gaussian';

  let mu = $state<number>(D.mu);
  let sigma = $state<number>(D.sigma);

  const bs = $derived(bands(mu, sigma));
  const pk = $derived(peak(sigma));

  function reset() {
    mu = D.mu;
    sigma = D.sigma;
  }

  function path(ctx: PlotContext, pts: [number, number][], close = false): string {
    return 'M' + pts.map(([x, y]) => `${ctx.x(x).toFixed(2)},${ctx.y(y).toFixed(2)}`).join('L') + (close ? 'Z' : '');
  }

  const fmtPct = (p: number) => `${(100 * p).toFixed(2)}%`;
  const live = $derived(
    `Mean ${mu.toFixed(1)}, standard deviation ${sigma.toFixed(2)}, peak density ${pk.toFixed(2)}. ` +
      bs.map((b) => `Within ${b.k} sigma: ${fmtPct(b.prob)}`).join('. '),
  );
  const shades = ['s1', 's2', 's3'];
  const bandTex = (k: number) => String.raw`\mu \pm ` + (k === 1 ? '' : String(k)) + String.raw`\sigma`;
  const peakTex = $derived(String.raw`\tfrac{1}{\sigma\sqrt{2\pi}} = ` + pk.toFixed(3));
</script>

<WidgetFrame
  name="Gaussian1D"
  title="The 1D Gaussian"
  description="A bell curve with adjustable mean and standard deviation. The regions within one, two and three standard deviations of the mean are shaded, and their probabilities are listed."
  {live}
  onreset={reset}
>
  {#snippet figure()}
    <Plot2D
      xDomain={L.xDomain}
      yDomain={L.yDomain}
      aspect={0.55}
      maxHeight={380}
      label="Gaussian density curve with shaded sigma bands"
    >
      {#snippet children(ctx)}
        <Axes {ctx} xLabel="x" yLabel="p(x)" xTicks={8} yTicks={4} />
        <g clip-path="url(#{ctx.uid}-clip)">
          {#each [...bs].reverse() as b (b.k)}
            <path class="band {shades[b.k - 1]}" d={path(ctx, areaPolygon(mu, sigma, b.lo, b.hi), true)} />
          {/each}
          {#each bs as b (b.k)}
            {#each [b.lo, b.hi] as xb (xb)}
              <line class="edge" x1={ctx.x(xb)} x2={ctx.x(xb)} y1={ctx.y(0)} y2={ctx.y(pdf1(xb, mu, sigma))} />
            {/each}
            {#if ctx.x(b.hi) - ctx.x(b.lo) > 28 * b.k}
              <text class="blabel" x={ctx.x(b.hi) - 3} y={ctx.y(0) - 5 - 13 * (b.k - 1)} text-anchor="end">{b.k}σ</text>
            {/if}
          {/each}
          <line class="mu" x1={ctx.x(mu)} x2={ctx.x(mu)} y1={ctx.y(0)} y2={ctx.y(pk)} />
          <path class="curve" d={path(ctx, curve(mu, sigma, L.xDomain[0], L.xDomain[1]))} />
        </g>
        <Handle
          cx={ctx.x(mu)}
          cy={ctx.y(pk)}
          label="Mean (drag sideways)"
          valuetext={`mean ${mu.toFixed(1)}`}
          valuenow={+mu.toFixed(1)}
          valuemin={L.mu.min}
          valuemax={L.mu.max}
          tag="μ"
          onmove={(e) => (mu = Math.round(muFromHandle(ctx.toData(e)[0]) * 10) / 10)}
          onkey={([dx, dy]) => (mu = Math.round(muFromHandle(mu + 0.1 * (dx || dy)) * 10) / 10)}
        />
        <Handle
          cx={ctx.x(mu + sigma)}
          cy={ctx.y(pdf1(mu + sigma, mu, sigma))}
          label="Standard deviation (drag sideways; this point is the inflection point at mean plus sigma)"
          valuetext={`sigma ${sigma.toFixed(2)}`}
          valuenow={+sigma.toFixed(2)}
          valuemin={L.sigma.min}
          valuemax={L.sigma.max}
          tag="μ+σ"
          onmove={(e) => (sigma = Math.round(sigmaFromHandle(ctx.toData(e)[0], mu) * 20) / 20)}
          onkey={([dx, dy]) => (sigma = Math.round(sigmaFromHandle(mu + sigma + 0.05 * (dx || dy), mu) * 20) / 20)}
        />
      {/snippet}
    </Plot2D>
  {/snippet}

  {#snippet readouts()}
    <table class="probs">
      <caption class="visually-hidden">Probability within k standard deviations</caption>
      <thead><tr><th scope="col">Region</th><th scope="col">Probability</th></tr></thead>
      <tbody>
        {#each bs as b (b.k)}
          <tr>
            <th scope="row">
              <span class="sw {shades[b.k - 1]}" aria-hidden="true"></span><KaTeXInline tex={bandTex(b.k)} />
            </th>
            <td>{fmtPct(b.prob)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="peak">Peak height <KaTeXInline tex={peakTex} /></p>
  {/snippet}

  {#snippet controls()}
    <TexSlider
      label="Mean mu"
      tex="\mu"
      min={L.mu.min}
      max={L.mu.max}
      step={L.mu.step}
      bind:value={mu}
      format={(v) => v.toFixed(1)}
    />
    <TexSlider
      label="Standard deviation sigma"
      tex="\sigma"
      min={L.sigma.min}
      max={L.sigma.max}
      step={L.sigma.step}
      bind:value={sigma}
    />
  {/snippet}

  {#snippet caption()}
    The density <KaTeXInline tex="p(x) = \N(x;\,\mu, \sigma^2)" /> with the regions within one, two and three standard deviations
    of the mean shaded. Drag the handles or use the sliders; the handle on the right sits at <KaTeXInline
      tex="x = \mu + \sigma"
    />.
    <strong>What to look for:</strong> the curve moves and stretches, but the three percentages never change.
  {/snippet}
</WidgetFrame>

<style>
  .band {
    fill: var(--c-post);
    stroke: none;
  }
  .band.s1 {
    fill-opacity: 0.34;
  }
  .band.s2 {
    fill-opacity: 0.2;
  }
  .band.s3 {
    fill-opacity: 0.1;
  }
  .curve {
    fill: none;
    stroke: var(--c-post);
    stroke-width: var(--stroke-thick);
  }
  .edge {
    stroke: var(--c-post);
    stroke-width: 1;
    stroke-opacity: 0.6;
  }
  .mu {
    stroke: var(--c-axis);
    stroke-dasharray: 3 3;
  }
  .blabel {
    font-size: 11px;
    fill: var(--c-fg);
  }
  .probs {
    font-size: 0.85rem;
    width: 100%;
  }
  .probs th,
  .probs td {
    padding: 0.25rem 0.4rem;
  }
  .probs td {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .probs thead th {
    font-weight: 500;
    color: var(--c-muted);
    font-size: 0.78rem;
  }
  .sw {
    display: inline-block;
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 2px;
    margin-right: 0.4rem;
    vertical-align: -0.1rem;
    background: var(--c-post);
    border: 1px solid var(--c-post);
  }
  .sw.s1 {
    opacity: 0.75;
  }
  .sw.s2 {
    opacity: 0.45;
  }
  .sw.s3 {
    opacity: 0.22;
  }
  .peak {
    font-size: 0.85rem;
    margin: var(--space-2) 0 0;
  }
</style>
