<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import Handle from '../../primitives/Handle.svelte';
  import TexSlider from '../../primitives/TexSlider.svelte';
  import Toggle from '../../primitives/Toggle.svelte';
  import Select from '../../primitives/Select.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import type { PlotContext } from '../../primitives/plot';
  import {
    BAYES_DEFAULTS as D,
    BAYES_LIMITS as L,
    GRID,
    clampShift,
    farDoorwayProbability,
    infer,
    priorSpec,
    readingSequence,
    type PriorKind,
  } from '../../../lib/demos/bayes-grid';

  interface Props {
    prior?: PriorKind;
    /** Number of readings already taken when the widget starts. */
    readings?: number;
  }
  let { prior: initialPrior = D.prior, readings: initialCount = D.initialReadings }: Props = $props();
  const start = (): PriorKind => initialPrior;
  const startCount = (): number => initialCount;

  let kind = $state<PriorKind>(start());
  let shift = $state(0);
  let kappa = $state<number>(D.kappa);
  let readings = $state<number[]>(readingSequence(start()).slice(0, startCount()));
  let nextSim = $state<number>(startCount());
  let showTruth = $state(false);

  const spec = $derived(priorSpec(kind, shift));
  const inf = $derived(infer(kind, shift, readings, kappa));
  const yMax = $derived(Math.max(3, 1.15 * Math.max(...inf.post, ...inf.prior, ...(inf.likelihood ?? [0]))));

  function load(k: PriorKind) {
    kind = k;
    shift = 0;
    readings = readingSequence(k).slice(0, startCount());
    nextSim = startCount();
  }
  function reset() {
    load(start());
    kappa = D.kappa;
    showTruth = false;
  }
  function takeReading() {
    if (readings.length >= D.maxReadings) return;
    const seq = readingSequence(kind);
    readings = [...readings, seq[nextSim % seq.length]!];
    nextSim += 1;
  }
  function addAt(d: number) {
    if (readings.length >= D.maxReadings) return;
    readings = [...readings, Math.round(Math.min(GRID.hi, Math.max(GRID.lo, d)) * 100) / 100];
  }

  function curve(ctx: PlotContext, v: Float64Array): string {
    let s = '';
    for (let i = 0; i < GRID.n; i += 2) {
      s += `${i === 0 ? 'M' : 'L'}${ctx.x(GRID.x[i]!).toFixed(1)},${ctx.y(Math.min(yMax, v[i]!)).toFixed(1)}`;
    }
    return s;
  }
  const f2 = (v: number) => v.toFixed(2);
  const mapText = $derived(
    inf.map !== null
      ? `${f2(inf.map)} m`
      : inf.mapCandidates.length > 1
        ? `tie: ${inf.mapCandidates.map(f2).join(' or ')} m`
        : 'none (flat)',
  );
  const live = $derived(
    `${readings.length} readings. Most likely distance from the readings alone: ${inf.mle === null ? 'none' : f2(inf.mle) + ' metres'}. ` +
      `Most likely distance after combining with the prior: ${mapText}. Posterior standard deviation ${f2(inf.postStd)} metres.`,
  );
</script>

<WidgetFrame
  name="BayesGrid1D"
  title="How far is the wall?"
  description="A robot's prior belief about its distance to a wall, the likelihood of its ultrasonic readings, and the posterior that combines them, with markers for the maximum-likelihood and maximum-a-posteriori estimates."
  {live}
  onreset={reset}
>
  {#snippet figure()}
    <Plot2D
      xDomain={[GRID.lo, GRID.hi]}
      yDomain={[0, yMax]}
      aspect={0.5}
      maxHeight={360}
      margin={{ top: 22, right: 12, bottom: 32, left: 36 }}
      label="Prior, likelihood and posterior over the distance to the wall"
    >
      {#snippet children(ctx)}
        <Axes {ctx} xTicks={10} yTicks={4} xLabel="distance to the wall, d (m)" yLabel="density" />
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <rect
          class="catch"
          x={ctx.inner.left}
          y={ctx.inner.top}
          width={ctx.inner.right - ctx.inner.left}
          height={ctx.inner.bottom - ctx.inner.top}
          onclick={(e) => addAt(ctx.toData(e)[0])}
        />
        <g clip-path="url(#{ctx.uid}-clip)" pointer-events="none">
          <path class="prior" d={curve(ctx, inf.prior)} />
          {#if inf.likelihood}<path class="lik" d={curve(ctx, inf.likelihood)} />{/if}
          <path class="post" d={curve(ctx, inf.post)} />
          {#if showTruth}
            <line
              class="truth"
              x1={ctx.x(spec.truth)}
              x2={ctx.x(spec.truth)}
              y1={ctx.inner.top}
              y2={ctx.inner.bottom}
            />
          {/if}
          {#if inf.mle !== null}
            <line class="mle" x1={ctx.x(inf.mle)} x2={ctx.x(inf.mle)} y1={ctx.inner.bottom} y2={ctx.inner.top + 14} />
          {/if}
          {#each inf.mapCandidates as c (c)}
            <line class="map" x1={ctx.x(c)} x2={ctx.x(c)} y1={ctx.inner.bottom} y2={ctx.inner.top + 14} />
          {/each}
          {#each readings as z, i (i)}
            <path class="z" d="M{ctx.x(z) - 4},{ctx.y(0) - 9}l8,8m0,-8l-8,8" />
          {/each}
        </g>
        {#if inf.mle !== null}
          <text class="tag mle-t" x={ctx.x(inf.mle)} y={ctx.inner.top + 10} text-anchor="middle">MLE</text>
        {/if}
        {#each inf.mapCandidates as c (c)}
          <text class="tag map-t" x={ctx.x(c)} y={ctx.inner.top - 4} text-anchor="middle">MAP</text>
        {/each}
        <Handle
          cx={ctx.x(spec.anchor)}
          cy={ctx.y(
            Math.min(
              yMax,
              inf.prior[Math.min(GRID.n - 1, Math.max(0, Math.floor((spec.anchor - GRID.lo) / GRID.dx)))]!,
            ),
          )}
          kind="prior"
          label="Prior: drag sideways or use the arrow keys to move it"
          valuetext={`prior shifted by ${f2(shift)} m`}
          valuenow={+shift.toFixed(2)}
          valuemin={L.shift.min}
          valuemax={L.shift.max}
          onmove={(e) => (shift = clampShift(ctx.toData(e)[0] - priorSpec(kind, 0).anchor))}
          onkey={([dx, dy]) => (shift = clampShift(shift + 0.05 * (dx || dy)))}
        />
      {/snippet}
    </Plot2D>
    <Legend
      items={[
        { kind: 'prior', label: 'prior' },
        { kind: 'meas', label: 'likelihood of the readings (×: readings)' },
        { kind: 'post', label: 'posterior' },
        ...(showTruth ? [{ kind: 'truth' as const, label: 'true distance' }] : []),
      ]}
    />
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Readings</dt>
      <dd data-readout="n">{readings.length}</dd>
      <dt>MLE (readings only)</dt>
      <dd data-readout="mle">{inf.mle === null ? '—' : `${f2(inf.mle)} m`}</dd>
      <dt>MAP (with prior)</dt>
      <dd data-readout="map">{mapText}</dd>
      <dt>Posterior</dt>
      <dd data-readout="post">{f2(inf.postMean)} ± {f2(inf.postStd)} m</dd>
      {#if kind === 'doorways'}
        <dt>P(far doorway)</dt>
        <dd data-readout="far">{(100 * farDoorwayProbability(inf.post, shift)).toFixed(1)}%</dd>
      {/if}
    </dl>
  {/snippet}

  {#snippet controls()}
    <Select
      label="What the robot believes before measuring"
      value={kind}
      options={(['odometry', 'none', 'doorways'] as const).map((k) => ({ value: k, label: priorSpec(k).label }))}
      onchange={(v) => load(v)}
    />
    <div class="buttons">
      <button
        type="button"
        class="btn"
        data-action="reading"
        onclick={takeReading}
        disabled={readings.length >= D.maxReadings}
      >
        Take a reading
      </button>
      <button
        type="button"
        class="btn"
        onclick={() => (readings = readings.slice(0, -1))}
        disabled={readings.length === 0}
      >
        Remove last
      </button>
      <button type="button" class="btn" onclick={() => (readings = [])} disabled={readings.length === 0}>Clear</button>
    </div>
    <TexSlider
      label="prior weight kappa"
      tex="\kappa"
      min={L.kappa.min}
      max={L.kappa.max}
      step={L.kappa.step}
      bind:value={kappa}
    />
    <Toggle label="Show the true distance" bind:checked={showTruth} />
  {/snippet}

  {#snippet caption()}
    A robot estimates its distance to a wall. The dashed curve is its belief before measuring; each × is an ultrasonic
    reading with about 20 cm of noise, and the dash-dot curve is the likelihood of all readings so far (scaled to unit
    area). The solid curve is the posterior. Click on the plot to add a reading where you click, or let the robot take
    its next one. The prior weight κ multiplies the prior's influence; at κ = 0 it is ignored.
    <strong>What to look for:</strong> the posterior always sits between the prior and the readings, and the more readings
    there are, the less the prior matters.
  {/snippet}
</WidgetFrame>

<style>
  .catch {
    fill: transparent;
    cursor: crosshair;
  }
  .prior {
    fill: none;
    stroke: var(--c-prior);
    stroke-width: var(--stroke-base);
    stroke-dasharray: var(--dash-prior);
  }
  .lik {
    fill: none;
    stroke: var(--c-meas);
    stroke-width: var(--stroke-base);
    stroke-dasharray: var(--dash-meas);
  }
  .post {
    fill: color-mix(in srgb, var(--c-post) 12%, transparent);
    stroke: var(--c-post);
    stroke-width: var(--stroke-thick);
  }
  .truth {
    stroke: var(--c-truth);
    stroke-width: var(--stroke-thin);
  }
  .mle {
    stroke: var(--c-meas);
    stroke-width: 1.5;
    stroke-dasharray: 3 3;
  }
  .map {
    stroke: var(--c-post);
    stroke-width: 1.5;
    stroke-dasharray: 3 3;
  }
  .z {
    stroke: var(--c-meas);
    stroke-width: 2;
  }
  .tag {
    font-size: 11px;
    font-weight: 600;
  }
  .mle-t {
    fill: var(--c-meas-text);
  }
  .map-t {
    fill: var(--c-post-text);
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
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
