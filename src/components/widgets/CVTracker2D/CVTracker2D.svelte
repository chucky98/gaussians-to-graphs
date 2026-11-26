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
    CV,
    CV_DEFAULTS as D,
    CV_LIMITS as L,
    T_MAX,
    makeScenario,
    priorState,
    runCv,
    sdOf,
    stateAt,
    viewBox,
    type CvPreset,
  } from '../../../lib/demos/cv-tracker';
  import { ellipsePoints } from '../../../lib/math/gaussian';
  import { getBlock, type Mat, type Vec } from '../../../lib/math/matrix';

  interface Props {
    preset?: CvPreset;
  }
  let { preset: initialPreset = 'wander' }: Props = $props();
  const startPreset = (): CvPreset => initialPreset;

  let preset = $state<CvPreset>(startPreset());
  /** log10 of q, so the slider covers 0.001 … 1 evenly. */
  let logQ = $state<number>(Math.log10(D.q));
  let sigma = $state<number>(D.sigma);
  let seed = $state<number>(CV.seed);
  let t = $state<number>(T_MAX);
  let showTruth = $state(true);

  const q = $derived(+(10 ** logQ).toPrecision(2));
  const params = $derived({ q, sigma });
  const scen = $derived(makeScenario(preset, params, seed));
  const steps = $derived(runCv(scen, params));
  const k = $derived(Math.ceil(t / 2));
  const stage = $derived(t === 0 ? 'start' : t % 2 === 1 ? 'predicted' : 'updated');
  const st = $derived(stateAt(steps, t));
  const box = $derived(viewBox(scen));

  const loop = createAnimationLoop(
    () => {
      t = Math.min(T_MAX, t + 1);
      return t < T_MAX;
    },
    { fps: 5 },
  );
  function togglePlay() {
    if (!loop.playing && t >= T_MAX) t = 0;
    loop.toggle();
  }
  function stepOnce() {
    t = t >= T_MAX ? 0 : t + 1;
  }
  function reset() {
    loop.pause();
    preset = startPreset();
    logQ = Math.log10(D.q);
    sigma = D.sigma;
    seed = CV.seed;
    t = T_MAX;
    showTruth = true;
  }

  const posGauss = (x: Vec, P: Mat) => ({ mean: x.slice(0, 2), cov: getBlock(P, 0, 0, 2, 2) });
  function ellipse(ctx: PlotContext, x: Vec, P: Mat): string {
    const pts = ellipsePoints(posGauss(x, P), 0.95, 72);
    return 'M' + pts.map(([a, b]) => `${ctx.x(a).toFixed(1)},${ctx.y(b).toFixed(1)}`).join('L') + 'Z';
  }
  function poly(ctx: PlotContext, pts: Vec[]): string {
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${ctx.x(p[0]!).toFixed(1)},${ctx.y(p[1]!).toFixed(1)}`).join('');
  }
  const estPath = $derived([
    priorState().x,
    ...steps.slice(0, Math.max(0, stage === 'updated' ? k : k - 1)).map((s) => s.post.x),
  ]);

  // Velocity charts: updated estimates with 95% band, up to the current step.
  const VMAX = 4;
  function vBand(ctx: PlotContext, comp: number): { line: string; area: string; truth: string } {
    const pts: [number, number, number][] = [[0, priorState().x[comp]!, sdOf(priorState(), comp)]];
    const upto = stage === 'updated' ? k : k - 1;
    for (let j = 1; j <= upto; j++) pts.push([j, steps[j - 1]!.post.x[comp]!, sdOf(steps[j - 1]!.post, comp)]);
    const c = (v: number) => ctx.y(Math.max(-VMAX, Math.min(VMAX, v))).toFixed(1);
    const line = pts.map(([j, v], i) => `${i ? 'L' : 'M'}${ctx.x(j).toFixed(1)},${c(v)}`).join('');
    const top = pts.map(([j, v, s]) => `${ctx.x(j).toFixed(1)},${c(v + 1.96 * s)}`);
    const bot = pts.map(([j, v, s]) => `${ctx.x(j).toFixed(1)},${c(v - 1.96 * s)}`).reverse();
    const tr = scen.truth
      .slice(0, upto + 1)
      .map((x, j) => `${j ? 'L' : 'M'}${ctx.x(j).toFixed(1)},${c(x[comp]!)}`)
      .join('');
    return { line, area: `M${top.join('L')}L${bot.join('L')}Z`, truth: tr };
  }

  const f2 = (v: number) => v.toFixed(2);
  const truthNow = $derived(scen.truth[k]!);
  const timeText = $derived(stage === 'start' ? 't = 0 s (prior)' : `t = ${k} s, ${stage}`);
  const live = $derived(
    `${timeText}. Velocity estimate ${f2(st.x[2]!)}, ${f2(st.x[3]!)} metres per second, plus or minus ${f2(1.96 * sdOf(st, 2))}.` +
      (showTruth ? ` True velocity ${f2(truthNow[2]!)}, ${f2(truthNow[3]!)}.` : ''),
  );
</script>

<WidgetFrame
  name="CVTracker2D"
  title="Tracking a forklift from position fixes"
  description="A constant-velocity Kalman filter tracks a forklift from noisy camera positions. The map shows the fixes, the estimated path and the predicted and updated 95% ellipses; two charts show the estimated velocity components, which are never measured, with their 95% bands."
  {live}
  onreset={reset}
  attach={loop.observe}
>
  {#snippet figure()}
    <Plot2D
      xDomain={box.x}
      yDomain={box.y}
      equalAspect
      maxHeight={380}
      margin={{ top: 8, right: 12, bottom: 32, left: 36 }}
      label="Warehouse floor: camera fixes, estimated path and uncertainty ellipses"
    >
      {#snippet children(ctx)}
        <Axes {ctx} xTicks={8} yTicks={5} xLabel="x (m)" yLabel="y (m)" />
        <g clip-path="url(#{ctx.uid}-clip)">
          {#if showTruth}<path class="truth" d={poly(ctx, scen.truth.slice(0, k + 1))} />{/if}
          {#each scen.zs.slice(0, stage === 'updated' ? k : k - 1) as z, i (i)}
            <path class="z" d="M{ctx.x(z[0]!) - 3},{ctx.y(z[1]!) - 3}l6,6m0,-6l-6,6" />
          {/each}
          <path class="est" d={poly(ctx, estPath)} />
          {#if stage === 'updated'}
            {@const s = steps[k - 1]!}
            <path class="ell-prior" d={ellipse(ctx, s.prior.x, s.prior.P)} />
            <path
              class="z now"
              d="M{ctx.x(scen.zs[k - 1]![0]!) - 5},{ctx.y(scen.zs[k - 1]![1]!) - 5}l10,10m0,-10l-10,10"
            />
            <path class="ell-post" d={ellipse(ctx, s.post.x, s.post.P)} />
          {:else}
            <path class="ell-prior" d={ellipse(ctx, st.x, st.P)} />
          {/if}
          <line
            class="vel"
            x1={ctx.x(st.x[0]!)}
            y1={ctx.y(st.x[1]!)}
            x2={ctx.x(st.x[0]! + 3 * st.x[2]!)}
            y2={ctx.y(st.x[1]! + 3 * st.x[3]!)}
          />
          {#if showTruth}
            <circle class="truth-dot" cx={ctx.x(truthNow[0]!)} cy={ctx.y(truthNow[1]!)} r="4" />
          {/if}
        </g>
      {/snippet}
    </Plot2D>
    <Legend
      items={[
        { kind: 'meas', label: 'camera fixes' },
        { kind: 'prior', label: 'predicted 95% ellipse' },
        { kind: 'post', label: 'estimate, updated 95% ellipse, velocity × 3 s' },
        ...(showTruth ? [{ kind: 'truth' as const, label: 'true path' }] : []),
      ]}
    />
    <div class="vcharts">
      {#each [2, 3] as comp (comp)}
        <Plot2D
          xDomain={[0, CV.steps]}
          yDomain={[-VMAX, VMAX]}
          aspect={0.32}
          maxHeight={150}
          margin={{ top: 8, right: 12, bottom: 30, left: 36 }}
          label={comp === 2 ? 'Estimated x-velocity over time' : 'Estimated y-velocity over time'}
        >
          {#snippet children(ctx)}
            {@const b = vBand(ctx, comp)}
            <Axes {ctx} xTicks={8} yTicks={4} xLabel="time (s)" yLabel={comp === 2 ? 'vx (m/s)' : 'vy (m/s)'} />
            <g clip-path="url(#{ctx.uid}-clip)">
              <path class="vband" d={b.area} />
              {#if showTruth}<path class="truth" d={b.truth} />{/if}
              <path class="est" d={b.line} />
            </g>
          {/snippet}
        </Plot2D>
      {/each}
    </div>
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Time</dt>
      <dd data-readout="time">{timeText}</dd>
      <dt>Velocity (95%)</dt>
      <dd data-readout="vel">({f2(st.x[2]!)}, {f2(st.x[3]!)}) ± {f2(1.96 * sdOf(st, 2))} m/s</dd>
      <dt>True velocity</dt>
      <dd>{showTruth ? `(${f2(truthNow[2]!)}, ${f2(truthNow[3]!)}) m/s` : 'hidden'}</dd>
      <dt>Position σ (x)</dt>
      <dd data-readout="psd">{f2(sdOf(st, 0))} m</dd>
    </dl>
  {/snippet}

  {#snippet controls()}
    <PlayControls playing={loop.playing} ontoggle={togglePlay} onstep={stepOnce} what="filter" />
    <Slider
      label="Time (half-steps: predict, update)"
      min={0}
      max={T_MAX}
      step={1}
      bind:value={t}
      format={() => timeText}
      oninput={() => loop.pause()}
    />
    <Select
      label="Forklift"
      value={preset}
      options={[
        { value: 'wander', label: 'Drives as the model assumes' },
        { value: 'turn', label: 'Sharp left turn at t = 20 s' },
      ]}
      onchange={(v) => (preset = v)}
    />
    <Slider
      label="Process noise q (log scale)"
      min={-3}
      max={0}
      step={0.1}
      bind:value={logQ}
      format={() => `${q} m²/s³`}
    />
    <Slider
      label="Camera noise σ"
      min={L.sigma.min}
      max={L.sigma.max}
      step={L.sigma.step}
      bind:value={sigma}
      unit="m"
    />
    <Toggle label="Show the truth" bind:checked={showTruth} />
    <SeedControl bind:seed defaultSeed={CV.seed} />
  {/snippet}

  {#snippet caption()}
    Ceiling cameras report a forklift's position once per second, with noise σ in each axis. A constant-velocity Kalman
    filter estimates its position and velocity; it starts knowing the position to ± 2 m and nothing useful about the
    velocity (0 ± 2 m/s). Ellipses are 95% regions of the position; the charts show each velocity component with its 95%
    band. The process noise q sets how much the filter expects the velocity to change. <strong>
      What to look for:
    </strong> the velocity is never measured, yet its band narrows from ± 4 m/s to about ± 0.3 m/s; and when the forklift
    turns and q is small, the estimate lags behind.
  {/snippet}
</WidgetFrame>

<style>
  .truth {
    fill: none;
    stroke: var(--c-truth);
    stroke-width: var(--stroke-thin);
  }
  .truth-dot {
    fill: var(--c-bg);
    stroke: var(--c-truth);
    stroke-width: 1.5;
  }
  .z {
    fill: none;
    stroke: var(--c-meas);
    stroke-width: 1.5;
    opacity: 0.8;
  }
  .z.now {
    stroke-width: 2.5;
    opacity: 1;
  }
  .est {
    fill: none;
    stroke: var(--c-post);
    stroke-width: 2;
  }
  .ell-prior {
    fill: none;
    stroke: var(--c-prior);
    stroke-width: 2;
    stroke-dasharray: var(--dash-prior);
  }
  .ell-post {
    fill: color-mix(in srgb, var(--c-post) 14%, transparent);
    stroke: var(--c-post);
    stroke-width: var(--stroke-thick);
  }
  .vel {
    stroke: var(--c-post);
    stroke-width: 2.5;
    stroke-linecap: round;
  }
  .vband {
    fill: color-mix(in srgb, var(--c-post) 16%, transparent);
  }
  .vcharts {
    margin-top: var(--space-3);
    display: grid;
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
