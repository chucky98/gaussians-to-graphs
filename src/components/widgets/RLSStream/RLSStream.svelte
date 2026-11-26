<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import TexSlider from '../../primitives/TexSlider.svelte';
  import Toggle from '../../primitives/Toggle.svelte';
  import Select from '../../primitives/Select.svelte';
  import PlayControls from '../../primitives/PlayControls.svelte';
  import SeedControl from '../../primitives/SeedControl.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import { createAnimationLoop } from '../../primitives/animation.svelte';
  import type { PlotContext } from '../../primitives/plot';
  import {
    MOTOR,
    batchAt,
    lineStd,
    makeStream,
    priorState,
    runRls,
    type MotorPreset,
  } from '../../../lib/demos/rls-stream';

  interface Props {
    preset?: MotorPreset;
  }
  let { preset: initialPreset = 'steady' }: Props = $props();
  const startPreset = (): MotorPreset => initialPreset;

  let preset = $state<MotorPreset>(startPreset());
  let beta = $state<number>(MOTOR.betaDefault);
  let seed = $state<number>(MOTOR.seed);
  /** Measurements processed so far (0 … steps). Starts at the end so the result is visible. */
  let k = $state<number>(MOTOR.steps);
  let showTruth = $state(true);

  const stream = $derived(makeStream(preset, seed));
  const steps = $derived(runRls(stream, beta));
  const st = $derived(k === 0 ? priorState() : steps[k - 1]!);
  const batch = $derived(batchAt(stream, k, beta));
  const diff = $derived(Math.max(Math.abs(batch.x[0]! - st.x[0]!), Math.abs(batch.x[1]! - st.x[1]!)));
  const trueGainNow = $derived(k === 0 ? stream.trueGain[0]! : stream.trueGain[k - 1]!);

  const loop = createAnimationLoop(
    () => {
      k = Math.min(MOTOR.steps, k + 1);
      return k < MOTOR.steps;
    },
    { fps: 15 },
  );
  function togglePlay() {
    if (!loop.playing && k >= MOTOR.steps) k = 0;
    loop.toggle();
  }
  function step() {
    if (k >= MOTOR.steps) k = 0;
    k = Math.min(MOTOR.steps, k + 1);
  }
  function reset() {
    loop.pause();
    preset = startPreset();
    beta = MOTOR.betaDefault;
    seed = MOTOR.seed;
    k = MOTOR.steps;
    showTruth = true;
  }

  const U: [number, number] = [0, 105];
  const W: [number, number] = [-3, 27];
  function band(ctx: PlotContext): string {
    const top: string[] = [];
    const bot: string[] = [];
    for (let i = 0; i <= 40; i++) {
      const u = U[0] + ((U[1] - U[0]) * i) / 40;
      const m = st.x[0]! + st.x[1]! * u;
      const s = 1.96 * lineStd(st, u);
      top.push(`${ctx.x(u).toFixed(1)},${ctx.y(m + s).toFixed(1)}`);
      bot.push(`${ctx.x(u).toFixed(1)},${ctx.y(m - s).toFixed(1)}`);
    }
    return `M${top.join('L')}L${bot.reverse().join('L')}Z`;
  }
  const line = (ctx: PlotContext, x0: number, x1: number) =>
    `M${ctx.x(U[0])},${ctx.y(x0 + x1 * U[0])}L${ctx.x(U[1])},${ctx.y(x0 + x1 * U[1])}`;

  // gain trace
  const G: [number, number] = [0.1, 0.35];
  function gainTrace(ctx: PlotContext, upto: number): { mid: string; area: string } {
    const pts: [number, number, number][] = [[0, priorState().x[1]!, Math.sqrt(priorState().P.data[3]!)]];
    for (let j = 0; j < upto; j++) pts.push([j + 1, steps[j]!.x[1]!, Math.sqrt(steps[j]!.P.data[3]!)]);
    const clampY = (v: number) => ctx.y(Math.min(G[1], Math.max(G[0], v)));
    const mid = pts.map(([t, g], i) => `${i === 0 ? 'M' : 'L'}${ctx.x(t).toFixed(1)},${clampY(g).toFixed(1)}`).join('');
    const top = pts.map(([t, g, s]) => `${ctx.x(t).toFixed(1)},${clampY(g + 1.96 * s).toFixed(1)}`);
    const bot = pts.map(([t, g, s]) => `${ctx.x(t).toFixed(1)},${clampY(g - 1.96 * s).toFixed(1)}`).reverse();
    return { mid, area: `M${top.join('L')}L${bot.join('L')}Z` };
  }
  const trace = $derived.by(() => (ctx: PlotContext) => gainTrace(ctx, k));

  const memory = (b: number) => (b >= 1 ? 'remembers everything' : `memory ≈ ${Math.round(1 / (1 - b))} samples`);
  const f3 = (v: number) => v.toFixed(3);
  const live = $derived(
    `After ${k} measurements, gain ${f3(st.x[1]!)} plus or minus ${f3(1.96 * Math.sqrt(st.P.data[3]!))}; true gain ${f3(trueGainNow)}.`,
  );
</script>

<WidgetFrame
  name="RLSStream"
  title="Calibrating a motor while driving"
  description="Encoder measurements of wheel speed against motor duty cycle stream in. Recursive least squares updates the fitted line after each one; a second chart shows the estimated gain over time."
  {live}
  onreset={reset}
  attach={loop.observe}
>
  {#snippet figure()}
    <Plot2D
      xDomain={U}
      yDomain={W}
      aspect={0.55}
      maxHeight={340}
      margin={{ top: 10, right: 12, bottom: 32, left: 36 }}
      label="Wheel speed against duty cycle, with the fitted line and its uncertainty band"
    >
      {#snippet children(ctx)}
        <Axes {ctx} xTicks={10} yTicks={6} xLabel="motor duty cycle u (%)" yLabel="wheel speed (rad/s)" />
        <g clip-path="url(#{ctx.uid}-clip)">
          <path class="band" d={band(ctx)} />
          {#each { length: k } as _, i (i)}
            {@const w = beta ** (k - 1 - i)}
            <circle
              class="pt"
              class:last={i === k - 1}
              cx={ctx.x(stream.duty[i]!)}
              cy={ctx.y(stream.speed[i]!)}
              r={i === k - 1 ? 4.5 : 2.6}
              opacity={Math.max(0.08, w)}
            />
          {/each}
          {#if showTruth}<path class="truth" d={line(ctx, MOTOR.offset, trueGainNow)} />{/if}
          <path class="fit" d={line(ctx, st.x[0]!, st.x[1]!)} />
          <path class="batch" d={line(ctx, batch.x[0]!, batch.x[1]!)} />
        </g>
      {/snippet}
    </Plot2D>
    <Legend
      items={[
        { kind: 'meas', label: 'encoder measurements (faded = forgotten)' },
        { kind: 'post', label: 'RLS line, with 95% band' },
        { kind: 'odom', label: 'batch solution of the same data' },
        ...(showTruth ? [{ kind: 'truth' as const, label: 'true motor line' }] : []),
      ]}
    />
    <div class="trace">
      <Plot2D
        xDomain={[0, MOTOR.steps]}
        yDomain={G}
        aspect={0.3}
        maxHeight={180}
        margin={{ top: 8, right: 12, bottom: 30, left: 40 }}
        label="Estimated gain against the number of measurements"
      >
        {#snippet children(ctx)}
          {@const tr = trace(ctx)}
          <Axes {ctx} xTicks={6} yTicks={5} xLabel="measurements so far" yLabel="gain (rad/s per %)" />
          <g clip-path="url(#{ctx.uid}-clip)">
            <path class="gband" d={tr.area} />
            {#if showTruth}
              <path
                class="truth"
                d={`M${ctx.x(0)},${ctx.y(MOTOR.gain)}` +
                  (preset === 'sag'
                    ? `L${ctx.x(MOTOR.sagAt)},${ctx.y(MOTOR.gain)}L${ctx.x(MOTOR.sagAt)},${ctx.y(MOTOR.sagGain)}L${ctx.x(MOTOR.steps)},${ctx.y(MOTOR.sagGain)}`
                    : `L${ctx.x(MOTOR.steps)},${ctx.y(MOTOR.gain)}`)}
              />
            {/if}
            <path class="fit" d={tr.mid} />
            <line class="now" x1={ctx.x(k)} x2={ctx.x(k)} y1={ctx.inner.top} y2={ctx.inner.bottom} />
          </g>
        {/snippet}
      </Plot2D>
    </div>
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Measurements</dt>
      <dd data-readout="k">{k}</dd>
      <dt>Gain x̂₂</dt>
      <dd data-readout="gain">{f3(st.x[1]!)} ± {f3(1.96 * Math.sqrt(st.P.data[3]!))}</dd>
      <dt>True gain</dt>
      <dd>{f3(trueGainNow)}</dd>
      <dt>Offset x̂₁</dt>
      <dd>{st.x[0]!.toFixed(2)} rad/s</dd>
      <dt>RLS − batch</dt>
      <dd data-readout="diff">{diff < 1e-9 ? 'identical (< 10⁻⁹)' : diff.toExponential(1)}</dd>
    </dl>
  {/snippet}

  {#snippet controls()}
    <PlayControls
      playing={loop.playing}
      ontoggle={togglePlay}
      onstep={step}
      atEnd={k >= MOTOR.steps}
      what="measurement stream"
    />
    <Slider
      label="Measurements processed"
      min={0}
      max={MOTOR.steps}
      step={1}
      bind:value={k}
      format={(v) => String(v)}
      oninput={() => loop.pause()}
    />
    <Select
      label="Battery"
      value={preset}
      options={[
        { value: 'steady', label: 'Steady battery' },
        { value: 'sag', label: 'Battery sags at measurement 60 (gain −20%)' },
      ]}
      onchange={(v) => (preset = v)}
    />
    <TexSlider
      label="forgetting factor beta"
      tex="\beta"
      min={MOTOR.betaLimits.min}
      max={MOTOR.betaLimits.max}
      step={MOTOR.betaLimits.step}
      bind:value={beta}
      format={(v) => `${v.toFixed(2)} (${memory(v)})`}
    />
    <Toggle label="Show the true motor line" bind:checked={showTruth} />
    <SeedControl bind:seed defaultSeed={MOTOR.seed} />
  {/snippet}

  {#snippet caption()}
    A robot drives at varying motor commands, and its wheel encoder reports the speed each time (with about 0.8 rad/s of
    noise). Recursive least squares refines the speed-versus-duty line after every measurement, starting from a
    datasheet guess. The shaded bands are 95% intervals. The dotted line is the batch least-squares fit of the same
    data, weighted the same way. <strong>What to look for:</strong> the recursive and batch lines coincide exactly at every
    step; and when the battery sags, β = 1 keeps believing the old gain, while forgetting lets the estimate follow.
  {/snippet}
</WidgetFrame>

<style>
  .band,
  .gband {
    fill: color-mix(in srgb, var(--c-post) 16%, transparent);
    stroke: none;
  }
  .pt {
    fill: var(--c-meas);
  }
  .pt.last {
    stroke: var(--c-fg);
    stroke-width: 1.5;
  }
  .fit {
    fill: none;
    stroke: var(--c-post);
    stroke-width: var(--stroke-thick);
  }
  .batch {
    fill: none;
    stroke: var(--c-odom);
    stroke-width: 1.5;
    stroke-dasharray: var(--dash-odom);
  }
  .truth {
    fill: none;
    stroke: var(--c-truth);
    stroke-width: var(--stroke-thin);
  }
  .now {
    stroke: var(--c-axis);
    stroke-dasharray: 2 3;
  }
  .trace {
    margin-top: var(--space-3);
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
