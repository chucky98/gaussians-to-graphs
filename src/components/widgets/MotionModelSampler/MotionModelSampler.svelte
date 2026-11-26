<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import PointsCanvas from '../../primitives/PointsCanvas.svelte';
  import CovEllipse from '../../primitives/CovEllipse.svelte';
  import Robot2D from '../../primitives/Robot2D.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import Select from '../../primitives/Select.svelte';
  import SeedControl from '../../primitives/SeedControl.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import type { PlotContext } from '../../primitives/plot';
  import {
    SAMPLER,
    SAMPLER_LIMITS as L,
    SAMPLER_PRESETS,
    nominalPath,
    sampleMotion,
    samplerStats,
    type SamplerParams,
    type SamplerPreset,
  } from '../../../lib/demos/motion-sampler';
  import type { Vec } from '../../../lib/math/matrix';

  interface Props {
    preset?: SamplerPreset;
  }
  let { preset: initialPreset = 'gentle' }: Props = $props();
  const startPreset = (): SamplerPreset => initialPreset;
  const p0 = (): SamplerParams => SAMPLER_PRESETS[startPreset()];

  let preset = $state<SamplerPreset | 'custom'>(startPreset());
  let v = $state<number>(p0().v);
  let w = $state<number>(p0().w);
  let duration = $state<number>(p0().duration);
  let sigmaV = $state<number>(p0().sigmaV);
  let sigmaW = $state<number>(p0().sigmaW);
  let seed = $state<number>(SAMPLER.seed);

  const params = $derived<SamplerParams>({ v, w, duration, sigmaV, sigmaW });
  const samples = $derived(sampleMotion(params, seed));
  const st = $derived(samplerStats(params, samples));
  const nominal = $derived(nominalPath(params));

  /** View: fit the samples, the nominal path and the start, with equal axes. */
  const box = $derived.by(() => {
    let x0 = 0;
    let x1 = 0;
    let y0 = 0;
    let y1 = 0;
    const e = samples.ends;
    for (let i = 0; i < e.length; i += 2) {
      x0 = Math.min(x0, e[i]!);
      x1 = Math.max(x1, e[i]!);
      y0 = Math.min(y0, e[i + 1]!);
      y1 = Math.max(y1, e[i + 1]!);
    }
    for (const q of nominal) {
      x0 = Math.min(x0, q[0]!);
      x1 = Math.max(x1, q[0]!);
      y0 = Math.min(y0, q[1]!);
      y1 = Math.max(y1, q[1]!);
    }
    const pad = 1;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const hx = Math.max((x1 - x0) / 2 + pad, 3);
    const hy = Math.max((y1 - y0) / 2 + pad, 2);
    return { x: [cx - hx, cx + hx] as [number, number], y: [cy - hy, cy + hy] as [number, number] };
  });

  function load(p: SamplerPreset) {
    const q = SAMPLER_PRESETS[p];
    preset = p;
    v = q.v;
    w = q.w;
    duration = q.duration;
    sigmaV = q.sigmaV;
    sigmaW = q.sigmaW;
  }
  function reset() {
    load(startPreset());
    seed = SAMPLER.seed;
  }
  const custom = () => (preset = 'custom');
  const poly = (ctx: PlotContext, pts: readonly Vec[]) =>
    pts.map((q, i) => `${i ? 'L' : 'M'}${ctx.x(q[0]!).toFixed(1)},${ctx.y(q[1]!).toFixed(1)}`).join('');

  const pct = (x: number) => (Number.isNaN(x) ? '—' : `${(100 * x).toFixed(1)}%`);
  const live = $derived(
    `${pct(st.insideLin)} of ${SAMPLER.samples} sampled end positions fall inside the linearized 95% ellipse. ` +
      `Heading spread ${((st.headingSd * 180) / Math.PI).toFixed(0)} degrees.`,
  );
</script>

<WidgetFrame
  name="MotionModelSampler"
  title="Where does a noisy command take the robot?"
  description="A robot is commanded to drive at speed v while turning at rate omega. Hundreds of samples of the noisy motion model show where it may end up, compared with the 95% ellipse of a first-order (linearized) propagation and of the samples themselves."
  {live}
  onreset={reset}
>
  {#snippet figure()}
    <Plot2D
      xDomain={box.x}
      yDomain={box.y}
      equalAspect
      maxHeight={400}
      margin={{ top: 8, right: 12, bottom: 32, left: 36 }}
      label="Sampled end positions of the robot with uncertainty ellipses"
    >
      {#snippet underlay(ctx)}<PointsCanvas {ctx} points={samples.ends} radius={1.6} opacity={0.45} />{/snippet}
      {#snippet children(ctx)}
        <Axes {ctx} xTicks={6} yTicks={6} xLabel="x (m)" yLabel="y (m)" />
        <g clip-path="url(#{ctx.uid}-clip)">
          {#each samples.paths as path, i (i)}
            <path class="spath" d={poly(ctx, path)} />
          {/each}
          <path class="nominal" d={poly(ctx, nominal)} />
          <CovEllipse {ctx} mean={st.mcMean} cov={st.mcCov} kind="sample" />
          {#if !Number.isNaN(st.insideLin)}
            <CovEllipse {ctx} mean={st.linMean} cov={st.linCov} kind="prior" />
          {/if}
        </g>
        <Robot2D {ctx} x={0} y={0} theta={0} kind="truth" size={16} />
      {/snippet}
    </Plot2D>
    <Legend
      items={[
        {
          kind: 'sample',
          label: `${SAMPLER.samples} sampled end positions (and ${SAMPLER.paths} paths), their 95% ellipse`,
        },
        { kind: 'prior', label: 'linearized 95% ellipse (as an EKF predicts)' },
        { kind: 'odom', label: 'commanded path' },
      ]}
    />
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Samples inside the linearized 95% ellipse</dt>
      <dd data-readout="inside">{pct(st.insideLin)}</dd>
      <dt>Heading spread (1σ)</dt>
      <dd data-readout="heading">{((st.headingSd * 180) / Math.PI).toFixed(0)}°</dd>
      <dt>Linearized mean − sample mean</dt>
      <dd data-readout="shift">
        {Math.hypot(st.linMean[0] - st.mcMean[0], st.linMean[1] - st.mcMean[1]).toFixed(2)} m
      </dd>
    </dl>
  {/snippet}

  {#snippet controls()}
    <Select
      label="Preset"
      value={preset}
      options={[
        { value: 'gentle', label: 'Gentle curve, modest noise' },
        { value: 'banana', label: 'Long drive, poor heading control' },
        ...(preset === 'custom' ? [{ value: 'custom' as const, label: 'Custom' }] : []),
      ]}
      onchange={(x) => x !== 'custom' && load(x)}
    />
    <Slider label="Speed v" min={L.v.min} max={L.v.max} step={L.v.step} bind:value={v} unit="m/s" oninput={custom} />
    <Slider
      label="Turn rate ω"
      min={L.w.min}
      max={L.w.max}
      step={L.w.step}
      bind:value={w}
      unit="rad/s"
      oninput={custom}
    />
    <Slider
      label="Duration"
      min={L.duration.min}
      max={L.duration.max}
      step={L.duration.step}
      bind:value={duration}
      format={(x) => x.toFixed(1)}
      unit="s"
      oninput={custom}
    />
    <Slider
      label="Speed noise σv"
      min={L.sigmaV.min}
      max={L.sigmaV.max}
      step={L.sigmaV.step}
      bind:value={sigmaV}
      unit="m/s"
      oninput={custom}
    />
    <Slider
      label="Turn-rate noise σω"
      min={L.sigmaW.min}
      max={L.sigmaW.max}
      step={L.sigmaW.step}
      bind:value={sigmaW}
      unit="rad/s"
      oninput={custom}
    />
    <SeedControl bind:seed defaultSeed={SAMPLER.seed} />
  {/snippet}

  {#snippet caption()}
    The robot starts at the origin facing along x and is commanded to drive at speed v while turning at rate ω. Every
    {SAMPLER.dt} s its actual speed and turn rate differ from the command by Gaussian noise of standard deviation σv and σω.
    Each dot is where one simulated drive ends. The dashed ellipse is the 95% region predicted by first-order propagation,
    P ← F P Fᵀ + V M Vᵀ; the pink one is the 95% ellipse of the samples. <strong>What to look for:</strong> noise in the turn
    rate bends the cloud into a banana around the start, which no ellipse describes well; the linearized ellipse then misses
    many samples and its centre sits too far out.
  {/snippet}
</WidgetFrame>

<style>
  .spath {
    fill: none;
    stroke: var(--c-sample);
    stroke-width: 1;
    opacity: 0.45;
  }
  .nominal {
    fill: none;
    stroke: var(--c-odom);
    stroke-width: 2;
    stroke-dasharray: var(--dash-odom);
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
