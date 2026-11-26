<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import Toggle from '../../primitives/Toggle.svelte';
  import PlayControls from '../../primitives/PlayControls.svelte';
  import SeedControl from '../../primitives/SeedControl.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import { createAnimationLoop } from '../../primitives/animation.svelte';
  import type { PlotContext } from '../../primitives/plot';
  import { FVS, estimates, rmsErr, scenario, type Track } from '../../../lib/demos/filter-vs-smoother';
  import { TRACK } from '../../../lib/demos/tracker-1d';

  let t = $state<number>(FVS.steps);
  let L = $state<number>(FVS.lagDefault);
  let showLag = $state(false);
  let showBatch = $state(true);
  let seed = $state<number>(FVS.seed);

  const data = $derived(scenario(seed));
  const est = $derived(estimates(data, t, L));

  const loop = createAnimationLoop(
    () => {
      t = Math.min(FVS.steps, t + 1);
      return t < FVS.steps;
    },
    { fps: 4 },
  );
  function togglePlay() {
    if (!loop.playing && t >= FVS.steps) t = 0;
    loop.toggle();
  }
  function reset() {
    loop.pause();
    t = FVS.steps;
    L = FVS.lagDefault;
    showLag = false;
    showBatch = true;
    seed = FVS.seed;
  }

  const E = 1.2;
  const c = (ctx: PlotContext, v: number) => ctx.y(Math.max(-E, Math.min(E, v))).toFixed(1);
  function line(ctx: PlotContext, tr: Track) {
    return tr.mean.map((m, k) => `${k ? 'L' : 'M'}${ctx.x(k).toFixed(1)},${c(ctx, m - data.truth[k]!)}`).join('');
  }
  function band(ctx: PlotContext, tr: Track) {
    const up = tr.mean.map((m, k) => `${ctx.x(k).toFixed(1)},${c(ctx, m - data.truth[k]! + 1.96 * tr.sd[k]!)}`);
    const dn = tr.mean
      .map((m, k) => `${ctx.x(k).toFixed(1)},${c(ctx, m - data.truth[k]! - 1.96 * tr.sd[k]!)}`)
      .reverse();
    return `M${up.join('L')}L${dn.join('L')}Z`;
  }
  const SD = 0.6;
  const sdLine = (ctx: PlotContext, tr: Track) =>
    tr.sd.map((s, k) => `${k ? 'L' : 'M'}${ctx.x(k).toFixed(1)},${ctx.y(Math.min(SD, s)).toFixed(1)}`).join('');
  const out = [TRACK.outage.from - 0.5, TRACK.outage.to - 0.5];
  const maxDiff = $derived(Math.max(...est.smooth.mean.map((m, k) => Math.abs(m - est.batch.mean[k]!))));
  const f3 = (v: number) => v.toFixed(3);
  const live = $derived(
    `Data up to step ${t}. RMS error: filter ${f3(rmsErr(est.filter, data.truth))} metres, ` +
      `smoother ${f3(rmsErr(est.smooth, data.truth))} metres.`,
  );
</script>

<WidgetFrame
  name="FilterVsSmoother"
  title="Filtering, smoothing and the batch solution"
  description="Post 11's robot run with a ten-step gap in the position fixes. For the data available up to the chosen time, the chart shows each step's estimation error with its 95% band from the Kalman filter and from the RTS smoother, the batch solution, and optionally a fixed-lag smoother."
  {live}
  onreset={reset}
  attach={loop.observe}
>
  {#snippet figure()}
    <Plot2D
      xDomain={[0, FVS.steps]}
      yDomain={[-E, E]}
      aspect={0.45}
      maxHeight={300}
      margin={{ top: 8, right: 12, bottom: 30, left: 40 }}
      label="Estimation error of each step with 95% bands"
    >
      {#snippet children(ctx)}
        <Axes {ctx} xTicks={8} yTicks={4} xLabel="step k" yLabel="error x̂ − x (m)" />
        <g clip-path="url(#{ctx.uid}-clip)">
          <rect
            class="outage"
            x={ctx.x(out[0]!)}
            width={ctx.x(out[1]!) - ctx.x(out[0]!)}
            y={ctx.inner.top}
            height={ctx.inner.bottom - ctx.inner.top}
          />
          <rect
            class="future"
            x={ctx.x(t)}
            width={Math.max(0, ctx.inner.right - ctx.x(t))}
            y={ctx.inner.top}
            height={ctx.inner.bottom - ctx.inner.top}
          />
          <path class="fband" d={band(ctx, est.filter)} />
          <path class="sband" d={band(ctx, est.smooth)} />
          <line class="zero" x1={ctx.inner.left} x2={ctx.inner.right} y1={ctx.y(0)} y2={ctx.y(0)} />
          {#each data.zs.slice(0, t) as z, i (i)}
            {#if z !== null}
              {@const e = z - data.truth[i + 1]!}
              <path class="z" d="M{ctx.x(i + 1) - 3},{+c(ctx, e) - 3}l6,6m0,-6l-6,6" />
            {/if}
          {/each}
          <path class="filter" d={line(ctx, est.filter)} />
          {#if showLag}<path class="lag" d={line(ctx, est.lag)} />{/if}
          <path class="smooth" d={line(ctx, est.smooth)} />
          {#if showBatch}
            {#each est.batch.mean as m, k (k)}
              <circle class="batch" cx={ctx.x(k)} cy={c(ctx, m - data.truth[k]!)} r="3.2" />
            {/each}
          {/if}
        </g>
      {/snippet}
    </Plot2D>
    <Legend
      items={[
        { kind: 'prior', label: 'filter x̂ₖ|ₖ and its 95% band' },
        { kind: 'post', label: 'smoother x̂ₖ|ₜ and its 95% band' },
        ...(showBatch ? [{ kind: 'truth' as const, label: 'batch solution (○)' }] : []),
        ...(showLag ? [{ kind: 'sample' as const, label: `fixed lag, L = ${L}` }] : []),
        { kind: 'meas', label: 'error of each position fix' },
      ]}
    />
    <div class="chart">
      <Plot2D
        xDomain={[0, FVS.steps]}
        yDomain={[0, SD]}
        aspect={0.25}
        maxHeight={140}
        margin={{ top: 8, right: 12, bottom: 30, left: 40 }}
        label="Standard deviation of each step's estimate: filter and smoother"
      >
        {#snippet children(ctx)}
          <Axes {ctx} xTicks={8} yTicks={3} xLabel="step k" yLabel="std. dev. (m)" />
          <g clip-path="url(#{ctx.uid}-clip)">
            <rect
              class="outage"
              x={ctx.x(out[0]!)}
              width={ctx.x(out[1]!) - ctx.x(out[0]!)}
              y={ctx.inner.top}
              height={ctx.inner.bottom - ctx.inner.top}
            />
            <path class="filter" d={sdLine(ctx, est.filter)} />
            <path class="smooth" d={sdLine(ctx, est.smooth)} />
          </g>
        {/snippet}
      </Plot2D>
      <p class="note">Shaded: no position fixes (steps 16–25). Lightly shaded: the future, after step {t}.</p>
    </div>
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Data up to step</dt>
      <dd data-readout="t">{t}</dd>
      <dt>RMS error, filter</dt>
      <dd data-readout="rms-f">{f3(rmsErr(est.filter, data.truth))} m</dd>
      <dt>RMS error, fixed lag L = {L}</dt>
      <dd data-readout="rms-l">{f3(rmsErr(est.lag, data.truth))} m</dd>
      <dt>RMS error, smoother</dt>
      <dd data-readout="rms-s">{f3(rmsErr(est.smooth, data.truth))} m</dd>
      <dt>Smoother − batch (max)</dt>
      <dd data-readout="diff">{maxDiff < 1e-9 ? 'identical (< 10⁻⁹ m)' : `${maxDiff.toExponential(1)} m`}</dd>
    </dl>
  {/snippet}

  {#snippet controls()}
    <PlayControls
      playing={loop.playing}
      ontoggle={togglePlay}
      onstep={() => (t = t >= FVS.steps ? 0 : t + 1)}
      what="data"
    />
    <Slider
      label="Data available up to step"
      min={0}
      max={FVS.steps}
      step={1}
      bind:value={t}
      format={(v) => String(v)}
      oninput={() => loop.pause()}
    />
    <Toggle label="Show a fixed-lag smoother" bind:checked={showLag} />
    <Slider label="Lag L (steps)" min={1} max={FVS.lagMax} step={1} bind:value={L} format={(v) => String(v)} />
    <Toggle label="Show the batch solution" bind:checked={showBatch} />
    <SeedControl bind:seed defaultSeed={FVS.seed} />
  {/snippet}

  {#snippet caption()}
    The corridor robot of Post 11 drives 40 steps of 1 m with a position fix after each, except during steps 16–25. Each
    curve shows, for every step k, how far an estimate of the robot's position at step k is from the truth, using only
    the data up to step t. The filter estimates each step from the data up to that step; the smoother revisits every
    step with all the data up to t; the batch solution solves for the whole trajectory at once. Bands are 95% intervals. <strong>
      What to look for:
    </strong> the smoother's curve lies exactly on the batch circles; it is tighter than the filter everywhere except at the
    last step, and inside the gap its band bulges in the middle, where the gap is farthest from data on either side.
  {/snippet}
</WidgetFrame>

<style>
  .outage {
    fill: color-mix(in srgb, var(--c-muted) 14%, transparent);
  }
  .future {
    fill: color-mix(in srgb, var(--c-muted) 8%, transparent);
  }
  .fband {
    fill: color-mix(in srgb, var(--c-prior) 12%, transparent);
  }
  .sband {
    fill: color-mix(in srgb, var(--c-post) 22%, transparent);
  }
  .filter {
    fill: none;
    stroke: var(--c-prior);
    stroke-width: 2;
    stroke-dasharray: var(--dash-prior);
  }
  .smooth {
    fill: none;
    stroke: var(--c-post);
    stroke-width: var(--stroke-thick);
  }
  .lag {
    fill: none;
    stroke: var(--c-sample);
    stroke-width: 2;
  }
  .batch {
    fill: var(--c-bg);
    stroke: var(--c-truth);
    stroke-width: 1.25;
  }
  .z {
    fill: none;
    stroke: var(--c-meas);
    stroke-width: 1.5;
  }
  .zero {
    stroke: var(--c-axis);
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
