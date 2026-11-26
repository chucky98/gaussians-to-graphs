<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import Toggle from '../../primitives/Toggle.svelte';
  import Select from '../../primitives/Select.svelte';
  import PlayControls from '../../primitives/PlayControls.svelte';
  import SeedControl from '../../primitives/SeedControl.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import { createAnimationLoop } from '../../primitives/animation.svelte';
  import type { PlotContext } from '../../primitives/plot';
  import {
    TRACK,
    TRACKER_DEFAULTS as D,
    TRACKER_LIMITS as L,
    T_MAX,
    beliefAt,
    initBelief,
    makeScenario,
    phaseOf,
    runTracker,
    steady,
    type TrackerPreset,
  } from '../../../lib/demos/tracker-1d';
  import { densityTop } from '../../../lib/demos/gaussian-product';
  import { pdf1 } from '../../../lib/math/gaussian';

  interface Props {
    preset?: TrackerPreset;
    /** Half-step shown when the widget opens (default: the end of the run). */
    start?: number;
  }
  let { preset: initialPreset = 'steady', start = T_MAX }: Props = $props();
  const startPreset = (): TrackerPreset => initialPreset;
  const startT = (): number => start;

  let preset = $state<TrackerPreset>(startPreset());
  let alpha = $state<number>(D.alpha);
  let sigmaZ = $state<number>(D.sigmaZ);
  let seed = $state<number>(TRACK.seed);
  let t = $state<number>(startT());
  let showTruth = $state(true);

  const params = $derived({ alpha, sigmaZ });
  const scen = $derived(makeScenario(preset, params, seed));
  const steps = $derived(runTracker(scen, params));
  const ss = $derived(steady(params));
  const ph = $derived(phaseOf(t));
  const bel = $derived(beliefAt(steps, t));
  const step = $derived(ph.k > 0 ? steps[ph.k - 1]! : null);
  /** The belief before the current half-step (dotted). */
  const before = $derived(t > 0 ? beliefAt(steps, t - 1) : null);
  const truthNow = $derived(scen.truth[ph.k]!);
  const reading = $derived(ph.stage === 'updated' && step ? step.z : null);

  const loop = createAnimationLoop(
    () => {
      t = Math.min(T_MAX, t + 1);
      return t < T_MAX;
    },
    { fps: 4 },
  );
  function togglePlay() {
    if (!loop.playing && t >= T_MAX) t = 0;
    loop.toggle();
  }
  function stepOnce() {
    if (t >= T_MAX) t = 0;
    else t += 1;
  }
  function reset() {
    loop.pause();
    preset = startPreset();
    alpha = D.alpha;
    sigmaZ = D.sigmaZ;
    seed = TRACK.seed;
    t = startT();
    showTruth = true;
  }

  // ------------------------------------------------------------ belief window
  const HALF = 2.5;
  const center = $derived(Math.round(bel.x * 4) / 4);
  const X = $derived<[number, number]>([center - HALF, center + HALF]);
  const sig = (P: number) => Math.sqrt(P);
  const top = $derived(
    densityTop(Math.min(sig(bel.P), before ? sig(before.P) : Infinity, reading !== null ? sigmaZ : Infinity, 0.2)),
  );
  function curve(ctx: PlotContext, mu: number, s: number): string {
    let d = '';
    for (let i = 0; i <= 200; i++) {
      const x = X[0] + ((X[1] - X[0]) * i) / 200;
      d += `${i === 0 ? 'M' : 'L'}${ctx.x(x).toFixed(1)},${ctx.y(Math.min(top, pdf1(x, mu, s))).toFixed(1)}`;
    }
    return d;
  }

  // ------------------------------------------------------------ sigma over time
  const SIG_TOP = 0.6;
  function sawtooth(ctx: PlotContext): string {
    const y = (v: number) => ctx.y(Math.min(SIG_TOP, v)).toFixed(1);
    let d = `M${ctx.x(0)},${y(sig(initBelief().P))}`;
    for (let k = 1; k <= ph.k; k++) {
      const s = steps[k - 1]!;
      d += `L${ctx.x(k)},${y(sig(s.prior.P))}`;
      if (k < ph.k || ph.stage === 'updated') d += `L${ctx.x(k)},${y(sig(s.post.P))}`;
    }
    return d;
  }
  // ------------------------------------------------------------ error with band
  const ERR = 1;
  function errBand(ctx: PlotContext): string {
    const up: string[] = [];
    const dn: string[] = [];
    const c = (v: number) => ctx.y(Math.max(-ERR, Math.min(ERR, v))).toFixed(1);
    for (let k = 0; k <= ph.k; k++) {
      const s = k === 0 ? initBelief() : steps[k - 1]!.post;
      const b = 1.96 * sig(s.P);
      up.push(`${ctx.x(k).toFixed(1)},${c(b)}`);
      dn.push(`${ctx.x(k).toFixed(1)},${c(-b)}`);
    }
    return `M${up.join('L')}L${dn.reverse().join('L')}Z`;
  }
  const outageBand = $derived<[number, number] | null>(
    preset === 'outage' ? [TRACK.outage.from - 0.5, TRACK.outage.to - 0.5] : null,
  );

  const f2 = (v: number) => v.toFixed(2);
  const f3 = (v: number) => v.toFixed(3);
  const stageText = $derived(
    ph.stage === 'start' ? 'start' : ph.stage === 'predicted' ? `step ${ph.k}: predicted` : `step ${ph.k}: updated`,
  );
  const live = $derived(
    `${stageText}. Estimate ${f2(bel.x)} plus or minus ${f2(1.96 * sig(bel.P))} metres` +
      (showTruth ? `, true position ${f2(truthNow)}` : '') +
      (ph.stage === 'updated' && step ? `. Gain ${f2(step.K)}.` : '.'),
  );
</script>

<WidgetFrame
  name="Tracker1D"
  title="Tracking a robot along a corridor"
  description="A one-dimensional Kalman filter tracks a robot that drives 1 metre per step and gets a noisy position fix after each move. The top chart shows the prediction, the reading and the updated belief at the current step; the lower charts show the standard deviation over time and the estimation error with its 95% band."
  {live}
  onreset={reset}
  attach={loop.observe}
>
  {#snippet figure()}
    <Plot2D
      xDomain={X}
      yDomain={[0, top]}
      aspect={0.42}
      maxHeight={260}
      margin={{ top: 10, right: 12, bottom: 32, left: 40 }}
      label="Belief over the robot's position at the current step"
    >
      {#snippet children(ctx)}
        <Axes {ctx} xTicks={6} yTicks={3} xLabel="position, x (m)" yLabel="density (1/m)" />
        <g clip-path="url(#{ctx.uid}-clip)">
          {#if ph.stage === 'predicted' && before}
            <path class="before" d={curve(ctx, before.x, sig(before.P))} />
            <path class="prior" d={curve(ctx, bel.x, sig(bel.P))} />
          {:else if ph.stage === 'updated' && step}
            <path class="prior" d={curve(ctx, step.prior.x, sig(step.prior.P))} />
            {#if reading !== null}
              <path class="meas" d={curve(ctx, reading, sigmaZ)} />
              <path class="z" d="M{ctx.x(reading) - 5},{ctx.y(0) - 11}l10,10m0,-10l-10,10" />
            {/if}
            <path class="post" d={curve(ctx, bel.x, sig(bel.P))} />
          {:else}
            <path class="prior" d={curve(ctx, bel.x, sig(bel.P))} />
          {/if}
          {#if showTruth}
            <line class="truth" x1={ctx.x(truthNow)} x2={ctx.x(truthNow)} y1={ctx.inner.top} y2={ctx.inner.bottom} />
            <circle class="truth-dot" cx={ctx.x(truthNow)} cy={ctx.inner.top + 6} r="4" />
          {/if}
        </g>
      {/snippet}
    </Plot2D>
    <Legend
      items={[
        { kind: 'odom', label: 'belief before the move' },
        { kind: 'prior', label: 'prediction' },
        { kind: 'meas', label: 'position fix (likelihood)' },
        { kind: 'post', label: 'updated belief' },
        ...(showTruth ? [{ kind: 'truth' as const, label: 'true position' }] : []),
      ]}
    />
    <div class="charts">
      <Plot2D
        xDomain={[0, TRACK.steps]}
        yDomain={[0, SIG_TOP]}
        aspect={0.3}
        maxHeight={170}
        margin={{ top: 8, right: 12, bottom: 30, left: 40 }}
        label="Standard deviation of the belief over time"
      >
        {#snippet children(ctx)}
          <Axes {ctx} xTicks={8} yTicks={3} xLabel="step k" yLabel="std. dev. (m)" />
          <g clip-path="url(#{ctx.uid}-clip)">
            {#if outageBand}
              <rect
                class="outage"
                x={ctx.x(outageBand[0])}
                width={ctx.x(outageBand[1]) - ctx.x(outageBand[0])}
                y={ctx.inner.top}
                height={ctx.inner.bottom - ctx.inner.top}
              />
            {/if}
            <line
              class="ss pred"
              x1={ctx.inner.left}
              x2={ctx.inner.right}
              y1={ctx.y(sig(ss.Ppred))}
              y2={ctx.y(sig(ss.Ppred))}
            />
            <line
              class="ss postl"
              x1={ctx.inner.left}
              x2={ctx.inner.right}
              y1={ctx.y(sig(ss.Ppost))}
              y2={ctx.y(sig(ss.Ppost))}
            />
            <path class="saw" d={sawtooth(ctx)} />
          </g>
        {/snippet}
      </Plot2D>
      <Plot2D
        xDomain={[0, TRACK.steps]}
        yDomain={[-ERR, ERR]}
        aspect={0.3}
        maxHeight={170}
        margin={{ top: 8, right: 12, bottom: 30, left: 40 }}
        label="Estimation error over time with its 95% band"
      >
        {#snippet children(ctx)}
          <Axes {ctx} xTicks={8} yTicks={4} xLabel="step k" yLabel="error x̂ − x (m)" />
          <g clip-path="url(#{ctx.uid}-clip)">
            {#if outageBand}
              <rect
                class="outage"
                x={ctx.x(outageBand[0])}
                width={ctx.x(outageBand[1]) - ctx.x(outageBand[0])}
                y={ctx.inner.top}
                height={ctx.inner.bottom - ctx.inner.top}
              />
            {/if}
            <path class="band" d={errBand(ctx)} />
            <line class="zero" x1={ctx.inner.left} x2={ctx.inner.right} y1={ctx.y(0)} y2={ctx.y(0)} />
            {#each { length: ph.k } as _, i (i)}
              {@const s = steps[i]!}
              {#if s.z !== null}
                <path
                  class="zdot"
                  d="M{ctx.x(i + 1) - 3},{ctx.y(Math.max(-ERR, Math.min(ERR, s.z - scen.truth[i + 1]!))) -
                    3}l6,6m0,-6l-6,6"
                />
              {/if}
              <circle
                class="edot"
                cx={ctx.x(i + 1)}
                cy={ctx.y(Math.max(-ERR, Math.min(ERR, s.post.x - scen.truth[i + 1]!)))}
                r="2.6"
              />
            {/each}
          </g>
        {/snippet}
      </Plot2D>
      <Legend
        items={[
          { kind: 'post', label: 'updated σ, error and 95% band' },
          { kind: 'meas', label: 'error of the raw fix' },
          { kind: 'odom', label: 'steady-state σ (predicted, updated)' },
        ]}
      />
    </div>
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Time</dt>
      <dd data-readout="time">{stageText}</dd>
      <dt>Estimate (95%)</dt>
      <dd data-readout="est">{f2(bel.x)} ± {f2(1.96 * sig(bel.P))} m</dd>
      <dt>True x</dt>
      <dd>{showTruth ? `${f2(truthNow)} m` : 'hidden'}</dd>
      <dt>Gain Kₖ</dt>
      <dd data-readout="gain">{ph.stage === 'updated' && step ? (step.z === null ? 'no fix' : f3(step.K)) : '—'}</dd>
      <dt>Steady state</dt>
      <dd data-readout="steady">K = {f3(ss.K)}, σ = {f3(sig(ss.Ppost))} m</dd>
    </dl>
  {/snippet}

  {#snippet controls()}
    <PlayControls playing={loop.playing} ontoggle={togglePlay} onstep={stepOnce} atEnd={false} what="filter" />
    <Slider
      label="Time (half-steps: predict, update)"
      min={0}
      max={T_MAX}
      step={1}
      bind:value={t}
      format={() => stageText}
      oninput={() => loop.pause()}
    />
    <Select
      label="Fixes"
      value={preset}
      options={[
        { value: 'steady', label: 'A fix after every move' },
        { value: 'outage', label: `No fixes for steps ${TRACK.outage.from}–${TRACK.outage.to - 1}` },
      ]}
      onchange={(v) => (preset = v)}
    />
    <Slider
      label="Motion noise α (per 1 m move)"
      min={L.alpha.min}
      max={L.alpha.max}
      step={L.alpha.step}
      bind:value={alpha}
      unit="m"
    />
    <Slider
      label="Fix noise √R"
      min={L.sigmaZ.min}
      max={L.sigmaZ.max}
      step={L.sigmaZ.step}
      bind:value={sigmaZ}
      unit="m"
    />
    <Toggle label="Show the true position" bind:checked={showTruth} />
    <SeedControl bind:seed defaultSeed={TRACK.seed} />
  {/snippet}

  {#snippet caption()}
    The robot drives 1 m per step on odometry (error standard deviation α per move) and then receives a position fix
    (standard deviation √R). The Kalman filter starts from 0 ± 1 m. The top chart follows the robot: after a prediction
    it shows the belief before and after the move; after an update, the prediction, the fix and the updated belief. The
    middle chart is the belief's standard deviation, a sawtooth that rises with each move and drops with each fix; the
    lower chart is the error of the estimate with its 95% band, and the error of each raw fix. <strong>
      What to look for:
    </strong> the gain starts near 1 and settles to a constant within a few steps, and the estimate's error is about half
    that of the fixes it is built from.
  {/snippet}
</WidgetFrame>

<style>
  .before,
  .prior,
  .meas,
  .post {
    fill: none;
  }
  .before {
    stroke: var(--c-odom);
    stroke-width: 1.5;
    stroke-dasharray: var(--dash-odom);
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
  .z,
  .zdot {
    fill: none;
    stroke: var(--c-meas);
    stroke-width: 2;
  }
  .zdot {
    stroke-width: 1.5;
  }
  .post {
    stroke: var(--c-post);
    stroke-width: var(--stroke-thick);
  }
  .truth {
    stroke: var(--c-truth);
    stroke-width: var(--stroke-thin);
  }
  .truth-dot {
    fill: var(--c-bg);
    stroke: var(--c-truth);
    stroke-width: 1.5;
  }
  .charts {
    margin-top: var(--space-3);
    display: grid;
    gap: var(--space-2);
  }
  .saw {
    fill: none;
    stroke: var(--c-post);
    stroke-width: 2;
  }
  .ss {
    stroke: var(--c-odom);
    stroke-dasharray: var(--dash-odom);
    stroke-width: 1.5;
  }
  .band {
    fill: color-mix(in srgb, var(--c-post) 16%, transparent);
  }
  .edot {
    fill: var(--c-post);
  }
  .zero {
    stroke: var(--c-axis);
  }
  .outage {
    fill: color-mix(in srgb, var(--c-muted) 14%, transparent);
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
