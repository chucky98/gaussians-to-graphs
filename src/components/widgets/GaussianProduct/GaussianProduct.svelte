<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import Handle from '../../primitives/Handle.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import type { PlotContext } from '../../primitives/plot';
  import {
    PRODUCT_DEFAULTS as D,
    PRODUCT_LIMITS as L,
    clampTo,
    combine,
    yTop,
  } from '../../../lib/demos/gaussian-product';
  import { pdf1 } from '../../../lib/math/gaussian';

  let mu1 = $state<number>(D.mu1);
  let s1 = $state<number>(D.s1);
  let mu2 = $state<number>(D.mu2);
  let s2 = $state<number>(D.s2);

  const r = $derived(combine({ mu1, s1, mu2, s2 }));
  const top = $derived(yTop({ mu1, s1, mu2, s2 }));

  function reset() {
    mu1 = D.mu1;
    s1 = D.s1;
    mu2 = D.mu2;
    s2 = D.s2;
  }

  function curve(ctx: PlotContext, mu: number, sigma: number): string {
    const [a, b] = L.xDomain;
    let d = '';
    for (let i = 0; i <= 300; i++) {
      const x = a + ((b - a) * i) / 300;
      d += `${i === 0 ? 'M' : 'L'}${ctx.x(x).toFixed(1)},${ctx.y(Math.min(top, pdf1(x, mu, sigma))).toFixed(1)}`;
    }
    return d;
  }
  const muLim = L.mu;
  const sgLim = L.sigma;
  const setMu = (v: number) => clampTo(v, muLim);
  const setSigma = (v: number) => clampTo(v, sgLim);

  const f2 = (v: number) => v.toFixed(2);
  const live = $derived(
    `Prediction ${f2(mu1)} plus or minus ${f2(s1)} metres; reading ${f2(mu2)} plus or minus ${f2(s2)}. ` +
      `Gain ${f2(r.K)}. Combined estimate ${f2(r.mean)} plus or minus ${f2(r.sigma)} metres.`,
  );
</script>

<WidgetFrame
  name="GaussianProduct"
  title="Combining a prediction with a reading"
  description="Two Gaussian curves over the robot's position: the prediction from odometry and the likelihood of a position fix. Their normalized product, the updated belief, is drawn on top, with the Kalman gain."
  {live}
  onreset={reset}
>
  {#snippet figure()}
    <Plot2D
      xDomain={L.xDomain}
      yDomain={[0, top]}
      aspect={0.52}
      maxHeight={360}
      margin={{ top: 26, right: 12, bottom: 32, left: 36 }}
      label="Prediction, reading likelihood and their product"
    >
      {#snippet children(ctx)}
        <Axes {ctx} xTicks={10} yTicks={4} xLabel="position along the corridor, x (m)" yLabel="density (1/m)" />
        <g clip-path="url(#{ctx.uid}-clip)">
          <path
            class="post-area"
            d={curve(ctx, r.mean, r.sigma) + `L${ctx.x(L.xDomain[1])},${ctx.y(0)}L${ctx.x(L.xDomain[0])},${ctx.y(0)}Z`}
          />
          <path class="prior" d={curve(ctx, mu1, s1)} />
          <path class="meas" d={curve(ctx, mu2, s2)} />
          <path class="post" d={curve(ctx, r.mean, r.sigma)} />
        </g>
        <!-- The gain as a fraction of the way from the prediction to the reading. -->
        <g class="gainbar" aria-hidden="true">
          <line x1={ctx.x(mu1)} x2={ctx.x(mu2)} y1={ctx.inner.top - 12} y2={ctx.inner.top - 12} />
          <line class="tick" x1={ctx.x(mu1)} x2={ctx.x(mu1)} y1={ctx.inner.top - 17} y2={ctx.inner.top - 7} />
          <line class="tick" x1={ctx.x(mu2)} x2={ctx.x(mu2)} y1={ctx.inner.top - 17} y2={ctx.inner.top - 7} />
          <circle cx={ctx.x(r.mean)} cy={ctx.inner.top - 12} r="4" />
          <text
            x={ctx.x(r.mean)}
            y={ctx.inner.top - 18}
            text-anchor={r.mean > (L.xDomain[0] + L.xDomain[1]) / 2 ? 'end' : 'start'}
            dx={r.mean > (L.xDomain[0] + L.xDomain[1]) / 2 ? -6 : 6}
          >
            K = {f2(r.K)} of the way
          </text>
        </g>
        <Handle
          cx={ctx.x(mu1)}
          cy={ctx.y(Math.min(top, pdf1(mu1, mu1, s1)))}
          kind="prior"
          label="Prediction mean (drag sideways)"
          valuetext={`prediction ${f2(mu1)} metres`}
          valuenow={+f2(mu1)}
          valuemin={muLim.min}
          valuemax={muLim.max}
          onmove={(e) => (mu1 = setMu(ctx.toData(e)[0]))}
          onkey={([dx, dy]) => (mu1 = setMu(mu1 + muLim.step * (dx || dy)))}
        />
        <Handle
          cx={ctx.x(mu1 - s1)}
          cy={ctx.y(Math.min(top, pdf1(mu1 - s1, mu1, s1)))}
          kind="prior"
          label="Prediction standard deviation (drag sideways; the point sits at the mean minus sigma)"
          valuetext={`prediction sigma ${f2(s1)} metres`}
          valuenow={+f2(s1)}
          valuemin={sgLim.min}
          valuemax={sgLim.max}
          onmove={(e) => (s1 = setSigma(mu1 - ctx.toData(e)[0]))}
          onkey={([dx, dy]) => (s1 = setSigma(s1 - sgLim.step * (dx || dy)))}
        />
        <Handle
          cx={ctx.x(mu2)}
          cy={ctx.y(Math.min(top, pdf1(mu2, mu2, s2)))}
          kind="meas"
          label="Reading (drag sideways)"
          valuetext={`reading ${f2(mu2)} metres`}
          valuenow={+f2(mu2)}
          valuemin={muLim.min}
          valuemax={muLim.max}
          onmove={(e) => (mu2 = setMu(ctx.toData(e)[0]))}
          onkey={([dx, dy]) => (mu2 = setMu(mu2 + muLim.step * (dx || dy)))}
        />
        <Handle
          cx={ctx.x(mu2 + s2)}
          cy={ctx.y(Math.min(top, pdf1(mu2 + s2, mu2, s2)))}
          kind="meas"
          label="Reading standard deviation (drag sideways; the point sits at the reading plus sigma)"
          valuetext={`reading sigma ${f2(s2)} metres`}
          valuenow={+f2(s2)}
          valuemin={sgLim.min}
          valuemax={sgLim.max}
          onmove={(e) => (s2 = setSigma(ctx.toData(e)[0] - mu2))}
          onkey={([dx, dy]) => (s2 = setSigma(s2 + sgLim.step * (dx || dy)))}
        />
      {/snippet}
    </Plot2D>
    <Legend
      items={[
        { kind: 'prior', label: 'prediction (odometry)' },
        { kind: 'meas', label: 'likelihood of the reading' },
        { kind: 'post', label: 'updated belief (normalized product)' },
      ]}
    />
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Gain K = σ₁² / (σ₁² + σ₂²)</dt>
      <dd data-readout="gain">{f2(r.K)}</dd>
      <dt>Updated mean</dt>
      <dd data-readout="mean">{f2(r.mean)} m</dd>
      <dt>Updated σ</dt>
      <dd data-readout="sigma">{f2(r.sigma)} m</dd>
    </dl>
  {/snippet}

  {#snippet controls()}
    <Slider label="Prediction mean" min={muLim.min} max={muLim.max} step={muLim.step} bind:value={mu1} unit="m" />
    <Slider label="Prediction σ₁" min={sgLim.min} max={sgLim.max} step={sgLim.step} bind:value={s1} unit="m" />
    <Slider label="Reading z" min={muLim.min} max={muLim.max} step={muLim.step} bind:value={mu2} unit="m" />
    <Slider label="Reading σ₂" min={sgLim.min} max={sgLim.max} step={sgLim.step} bind:value={s2} unit="m" />
  {/snippet}

  {#snippet caption()}
    The robot's prediction of its position (from odometry) and a position fix, each a Gaussian; the reading is drawn as
    its likelihood, a Gaussian of width σ₂ centred on z. The shaded curve is their product, rescaled to area 1: the
    updated belief. Drag the peaks to move the means and the side handles to change the widths. <strong>
      What to look for:
    </strong> the updated belief is always narrower than both inputs, and its mean sits a fraction K of the way from the prediction
    to the reading, closer to whichever is more certain.
  {/snippet}
</WidgetFrame>

<style>
  .prior,
  .meas,
  .post {
    fill: none;
  }
  .prior {
    stroke: var(--c-prior);
    stroke-width: 2;
    stroke-dasharray: var(--dash-prior);
  }
  .meas {
    stroke: var(--c-meas);
    stroke-width: 2;
    stroke-dasharray: 8 3 2 3;
  }
  .post {
    stroke: var(--c-post);
    stroke-width: var(--stroke-thick);
  }
  .post-area {
    fill: color-mix(in srgb, var(--c-post) 16%, transparent);
  }
  .gainbar line {
    stroke: var(--c-muted);
    stroke-width: 1.5;
  }
  .gainbar circle {
    fill: var(--c-post);
  }
  .gainbar text {
    font-size: 11px;
    fill: var(--c-fg);
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
