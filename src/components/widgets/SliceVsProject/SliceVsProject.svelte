<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import CovEllipse from '../../primitives/CovEllipse.svelte';
  import Heatmap from '../../primitives/Heatmap.svelte';
  import Handle from '../../primitives/Handle.svelte';
  import TexSlider from '../../primitives/TexSlider.svelte';
  import Toggle from '../../primitives/Toggle.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import MatrixView from '../../primitives/MatrixView.svelte';
  import KaTeXInline from '../../primitives/KaTeXInline.svelte';
  import type { PlotContext } from '../../primitives/plot';
  import { pdf1 } from '../../../lib/math/gaussian';
  import {
    SLICE_DEFAULTS as D,
    SLICE_LIMITS as L,
    clamp,
    conditionalY,
    densityGrid,
    information,
    joint,
    marginalY,
    meanLine,
  } from '../../../lib/demos/slice-vs-project';

  const NX = 100;
  const NY = 70;

  let rho = $state<number>(D.rho);
  let a = $state<number>(D.a);
  let showMarginal = $state<boolean>(D.showMarginal);
  let showMeanLine = $state<boolean>(D.showMeanLine);

  const g = $derived(joint(rho));
  const grid = $derived(densityGrid(rho, NX, NY));
  const cond = $derived(conditionalY(rho, a));
  const marg = $derived(marginalY(rho));
  const omega = $derived(information(rho));

  function reset() {
    rho = D.rho;
    a = D.a;
    showMarginal = D.showMarginal;
    showMeanLine = D.showMeanLine;
  }
  const snap = (v: number) => Math.round(clamp(v, L.a.min, L.a.max) * 20) / 20;

  function curve(ctx: PlotContext, mean: number, sd: number): string {
    const [lo, hi] = L.yDomain;
    let s = '';
    for (let i = 0; i <= 200; i++) {
      const y = lo + ((hi - lo) * i) / 200;
      s += `${i === 0 ? 'M' : 'L'}${ctx.x(y).toFixed(1)},${ctx.y(Math.min(L.densityMax, pdf1(y, mean, sd))).toFixed(1)}`;
    }
    return s;
  }

  const f2 = (v: number) => v.toFixed(2);
  const sign = (v: number) => (v < 0 ? `- ${f2(-v)}` : `+ ${f2(v)}`);
  const SIGMA = String.raw`\boldsymbol{\Sigma}`;
  const OMEGA = String.raw`\boldsymbol{\Omega}`;
  const condMeanTex = $derived(
    String.raw`\mu_{y\mid x=a} = \mu_y + \rho\,\tfrac{\sigma_y}{\sigma_x}(a - \mu_x) = 0 ` +
      sign(((rho * D.sy) / D.sx) * (a - D.mean[0])) +
      ' = ' +
      f2(cond.mean),
  );
  const condVarTex = $derived(
    String.raw`\sigma^2_{y\mid x} = \sigma_y^2(1-\rho^2) = ` + f2(cond.sd * cond.sd) + String.raw` = 1/\Omega_{yy}`,
  );
  const margTex = $derived(String.raw`p(y) = \N(` + f2(marg.mean) + ',\\ ' + f2(marg.sd * marg.sd) + ')');

  const live = $derived(
    `Correlation ${f2(rho)}, slice at x = ${f2(a)}. Conditional mean ${f2(cond.mean)}, conditional variance ${f2(cond.sd ** 2)}. Marginal variance ${f2(marg.sd ** 2)}.`,
  );
</script>

<WidgetFrame
  name="SliceVsProject"
  title="Slicing and squashing a 2D Gaussian"
  description="A two-dimensional Gaussian shown as a heat map, with a movable vertical line at x equals a. A second plot shows the conditional density of y given x equals a, and optionally the marginal density of y."
  {live}
  onreset={reset}
>
  {#snippet figure()}
    <Plot2D
      xDomain={L.xDomain}
      yDomain={L.yDomain}
      equalAspect
      maxHeight={380}
      margin={{ top: 10, right: 10, bottom: 28, left: 30 }}
      label="Joint density of x and y with a slice at x = a"
    >
      {#snippet underlay(ctx)}
        <Heatmap {ctx} values={grid} nx={NX} ny={NY} />
      {/snippet}
      {#snippet children(ctx)}
        <Axes {ctx} xTicks={10} yTicks={7} xLabel="x" yLabel="y" grid={false} />
        <g clip-path="url(#{ctx.uid}-clip)">
          <CovEllipse {ctx} mean={D.mean} cov={g.cov} kind="post" thin />
          {#if showMeanLine}
            <line
              class="meanline"
              x1={ctx.x(L.xDomain[0])}
              y1={ctx.y(meanLine(rho, L.xDomain[0]))}
              x2={ctx.x(L.xDomain[1])}
              y2={ctx.y(meanLine(rho, L.xDomain[1]))}
            />
          {/if}
          <line class="slice" x1={ctx.x(a)} x2={ctx.x(a)} y1={ctx.inner.top} y2={ctx.inner.bottom} />
          <line
            class="interval"
            x1={ctx.x(a)}
            x2={ctx.x(a)}
            y1={ctx.y(cond.mean - 1.96 * cond.sd)}
            y2={ctx.y(cond.mean + 1.96 * cond.sd)}
          />
        </g>
        <Handle
          cx={ctx.x(a)}
          cy={ctx.y(cond.mean)}
          kind="meas"
          tag="x = a"
          label="Slice position a: drag sideways or use the arrow keys"
          valuetext={`a = ${f2(a)}`}
          valuenow={+a.toFixed(2)}
          valuemin={L.a.min}
          valuemax={L.a.max}
          onmove={(e) => (a = snap(ctx.toData(e)[0]))}
          onkey={([dx, dy]) => (a = snap(a + 0.05 * (dx || dy)))}
        />
      {/snippet}
    </Plot2D>
    <Legend
      items={[
        { kind: 'post', label: '95% ellipse of p(x, y)' },
        { kind: 'meas', label: 'slice x = a' },
      ]}
    />
    <div class="side-plot">
      <Plot2D
        xDomain={L.yDomain}
        yDomain={[0, L.densityMax]}
        aspect={0.42}
        maxHeight={220}
        margin={{ top: 10, right: 12, bottom: 30, left: 36 }}
        label="Conditional density of y given x = a, and the marginal density of y"
      >
        {#snippet children(ctx)}
          <Axes {ctx} xTicks={7} yTicks={3} xLabel="y" yLabel="density" />
          <g clip-path="url(#{ctx.uid}-clip)">
            {#if showMarginal}<path class="marg" d={curve(ctx, marg.mean, marg.sd)} />{/if}
            <path class="cond" d={curve(ctx, cond.mean, cond.sd)} />
          </g>
        {/snippet}
      </Plot2D>
      <Legend
        items={[
          { kind: 'post', label: 'p(y | x = a): slice, renormalized' },
          ...(showMarginal ? [{ kind: 'prior' as const, label: 'p(y): squashed onto the y-axis' }] : []),
        ]}
      />
    </div>
  {/snippet}

  {#snippet readouts()}
    <div class="formulas">
      <p data-readout="cond-mean"><KaTeXInline tex={condMeanTex} /></p>
      <p data-readout="cond-var"><KaTeXInline tex={condVarTex} /></p>
      {#if showMarginal}<p data-readout="marg"><KaTeXInline tex={margTex} /></p>{/if}
    </div>
    <MatrixView
      labelTex={SIGMA}
      label="Sigma"
      values={[
        [g.cov.data[0]!, g.cov.data[1]!],
        [g.cov.data[2]!, g.cov.data[3]!],
      ]}
    />
    <MatrixView
      labelTex={OMEGA}
      label="Omega, the inverse of Sigma"
      values={[
        [omega.data[0]!, omega.data[1]!],
        [omega.data[2]!, omega.data[3]!],
      ]}
    />
  {/snippet}

  {#snippet controls()}
    <TexSlider label="correlation rho" tex="\rho" min={L.rho.min} max={L.rho.max} step={L.rho.step} bind:value={rho} />
    <TexSlider label="slice position a" tex="a" min={L.a.min} max={L.a.max} step={L.a.step} bind:value={a} />
    <Toggle label="Show the marginal p(y)" bind:checked={showMarginal} />
    <Toggle label="Show the line of conditional means" bind:checked={showMeanLine} />
  {/snippet}

  {#snippet caption()}
    The heat map is the joint density of a Gaussian with <KaTeXInline tex="\sigma_x = 1.5" />, <KaTeXInline
      tex="\sigma_y = 1"
    /> and mean zero; the solid ellipse is its 95% region. Drag the slice. The thick segment on it is the 95% interval of
    <KaTeXInline tex="y" /> given <KaTeXInline tex="x = a" />, which the lower plot shows as a curve.
    <strong>What to look for:</strong>
    the conditional curve slides as you move the slice but never changes width, and it is always narrower than the marginal
    unless
    <KaTeXInline tex="\rho = 0" />.
  {/snippet}
</WidgetFrame>

<style>
  .slice {
    stroke: var(--c-meas);
    stroke-width: var(--stroke-base);
    stroke-dasharray: var(--dash-meas);
  }
  .interval {
    stroke: var(--c-post);
    stroke-width: 5;
    stroke-linecap: round;
  }
  .meanline {
    stroke: var(--c-fg);
    stroke-width: 1.25;
    stroke-dasharray: 2 3;
    opacity: 0.8;
  }
  .cond {
    fill: none;
    stroke: var(--c-post);
    stroke-width: var(--stroke-thick);
  }
  .marg {
    fill: none;
    stroke: var(--c-prior);
    stroke-width: var(--stroke-base);
    stroke-dasharray: var(--dash-prior);
  }
  .side-plot {
    margin-top: var(--space-3);
  }
  .formulas p {
    margin: 0 0 0.4rem;
    font-size: 0.85rem;
    overflow-x: auto;
  }
</style>
