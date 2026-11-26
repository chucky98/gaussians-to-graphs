<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import Select from '../../primitives/Select.svelte';
  import SeedControl from '../../primitives/SeedControl.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import type { PlotContext } from '../../primitives/plot';
  import {
    LAB,
    LAB_LIMITS as L,
    LAB_PRESETS,
    runLab,
    type LabParams,
    type LabPreset,
  } from '../../../lib/demos/tuning-lab';

  interface Props {
    preset?: LabPreset;
  }
  let { preset: initialPreset = 'tuned' }: Props = $props();
  const startPreset = (): LabPreset => initialPreset;
  const p0 = (): LabParams => LAB_PRESETS[startPreset()];

  let preset = $state<LabPreset | 'custom'>(startPreset());
  let logTrueQ = $state<number>(Math.log10(p0().trueQ));
  let trueSigma = $state<number>(p0().trueSigma);
  let logQf = $state<number>(Math.log10(p0().qFactor));
  let logSf = $state<number>(Math.log10(p0().sigmaFactor));
  let seed = $state<number>(LAB.seed);

  const sig2 = (v: number) => +v.toPrecision(2);
  // Presets use their exact values; the sliders round to two significant digits.
  const params = $derived<LabParams>(
    preset !== 'custom'
      ? LAB_PRESETS[preset]
      : {
          trueQ: sig2(10 ** logTrueQ),
          trueSigma,
          qFactor: sig2(10 ** logQf),
          sigmaFactor: sig2(10 ** logSf),
        },
  );
  const res = $derived(runLab(params, seed));

  function load(p: LabPreset) {
    const v = LAB_PRESETS[p];
    preset = p;
    logTrueQ = Math.log10(v.trueQ);
    trueSigma = v.trueSigma;
    logQf = Math.log10(v.qFactor);
    logSf = Math.log10(v.sigmaFactor);
  }
  function reset() {
    load(startPreset());
    seed = LAB.seed;
  }
  const custom = () => (preset = 'custom');

  // ------------------------------------------------------------ log-scale statistic charts
  const Y: [number, number] = [-1, 3.5];
  const lg = (v: number) => Math.max(Y[0], Math.min(Y[1], Math.log10(Math.max(v, 1e-6))));
  const ticks = [-1, 0, 1, 2, 3];
  const fmtPow = (v: number) => (v === -1 ? '0.1' : String(10 ** v));
  function line(ctx: PlotContext, vals: readonly number[]): string {
    return vals.map((v, i) => `${i ? 'L' : 'M'}${ctx.x(i + 1).toFixed(1)},${ctx.y(lg(v)).toFixed(1)}`).join('');
  }
  function bandRect(ctx: PlotContext, b: { lo: number; hi: number }) {
    return { y: ctx.y(lg(b.hi)), h: ctx.y(lg(b.lo)) - ctx.y(lg(b.hi)) };
  }

  // ------------------------------------------------------------ one run: x error and its band
  const E = 2;
  function errPaths(ctx: PlotContext) {
    const r = res.runs[0]!;
    const c = (v: number) => ctx.y(Math.max(-E, Math.min(E, v))).toFixed(1);
    const up: string[] = [];
    const dn: string[] = [];
    let err = '';
    r.post.forEach((s, i) => {
      const b = 1.96 * Math.sqrt(s.P.data[0]!);
      const x = ctx.x(i + 1).toFixed(1);
      up.push(`${x},${c(b)}`);
      dn.push(`${x},${c(-b)}`);
      err += `${i ? 'L' : 'M'}${x},${c(s.x[0]! - r.truth[i + 1]![0]!)}`;
    });
    return { band: `M${up.join('L')}L${dn.reverse().join('L')}Z`, err };
  }

  const mean = (v: readonly number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  const tail = (v: readonly number[]) => v.slice(LAB.skip);
  const f2 = (v: number) => (v >= 100 ? v.toFixed(0) : v.toFixed(2));
  const verdictText = {
    consistent: 'Consistent',
    overconfident: 'Overconfident',
    underconfident: 'Underconfident',
  } as const;
  const live = $derived(
    `Verdict from NEES: ${res.verdict}. From NIS: ${res.nisVerdict}. Average NEES ${f2(mean(tail(res.avgNees)))}, ` +
      `expected about ${LAB.nx}. Average NIS ${f2(mean(tail(res.avgNis)))}, expected about ${LAB.nz}.`,
  );
</script>

<WidgetFrame
  name="TuningLab"
  title="Is the filter telling the truth?"
  description="The forklift tracker of post 12, run fifty times. Sliders set the true motion and camera noise and, separately, what the filter assumes. Charts show the run-averaged NEES and NIS against their 95% chi-square bands, and one run's position error against the filter's own 95% band."
  {live}
  onreset={reset}
>
  {#snippet figure()}
    <p class="verdict {res.verdict}" data-readout="verdict" aria-hidden="true">
      {#if res.verdict === 'overconfident'}<span class="warn">⚠</span>{/if}
      {verdictText[res.verdict]}
      <span class="sub">(from NEES; NIS says {res.nisVerdict})</span>
    </p>
    {#each [{ key: 'nees', title: `NEES, averaged over ${LAB.runs} runs (needs the truth)`, vals: res.avgNees, b: res.neesBounds, n: LAB.nx }, { key: 'nis', title: `NIS, averaged over ${LAB.runs} runs (needs only the innovations)`, vals: res.avgNis, b: res.nisBounds, n: LAB.nz }] as c (c.key)}
      <Plot2D
        xDomain={[0, LAB.steps]}
        yDomain={Y}
        aspect={0.3}
        maxHeight={170}
        margin={{ top: 18, right: 12, bottom: 30, left: 40 }}
        label={c.title}
      >
        {#snippet children(ctx)}
          {@const br = bandRect(ctx, c.b)}
          <Axes {ctx} xTicks={8} yTickValues={ticks} yFormat={fmtPow} xLabel="time step k" />
          <text class="ctitle" x={ctx.inner.left} y={ctx.inner.top - 6}>{c.title}</text>
          <g clip-path="url(#{ctx.uid}-clip)">
            <rect class="band" x={ctx.inner.left} width={ctx.inner.right - ctx.inner.left} y={br.y} height={br.h} />
            <line class="expect" x1={ctx.inner.left} x2={ctx.inner.right} y1={ctx.y(lg(c.n))} y2={ctx.y(lg(c.n))} />
            <path class="stat" d={line(ctx, c.vals)} />
          </g>
        {/snippet}
      </Plot2D>
    {/each}
    <Plot2D
      xDomain={[0, LAB.steps]}
      yDomain={[-E, E]}
      aspect={0.3}
      maxHeight={170}
      margin={{ top: 18, right: 12, bottom: 30, left: 40 }}
      label="One run: x-position error and the filter's 95% band"
    >
      {#snippet children(ctx)}
        {@const ep = errPaths(ctx)}
        <Axes {ctx} xTicks={8} yTicks={4} xLabel="time step k" yLabel="error (m)" />
        <text class="ctitle" x={ctx.inner.left} y={ctx.inner.top - 6}>
          One run: x-position error and the filter's 95% band
        </text>
        <g clip-path="url(#{ctx.uid}-clip)">
          <path class="eband" d={ep.band} />
          <line class="zero" x1={ctx.inner.left} x2={ctx.inner.right} y1={ctx.y(0)} y2={ctx.y(0)} />
          <path class="err" d={ep.err} />
        </g>
      {/snippet}
    </Plot2D>
    <Legend
      items={[
        { kind: 'post', label: 'statistic / error' },
        { kind: 'odom', label: 'expected value (n_x = 4 for NEES, n_z = 2 for NIS)' },
      ]}
    />
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>NEES (steps {LAB.skip + 1}–{LAB.steps})</dt>
      <dd data-readout="nees">
        {f2(mean(tail(res.avgNees)))} <span class="b">[{f2(res.neesBounds.lo)}, {f2(res.neesBounds.hi)}]</span>
      </dd>
      <dt>NIS (steps {LAB.skip + 1}–{LAB.steps})</dt>
      <dd data-readout="nis">
        {f2(mean(tail(res.avgNis)))} <span class="b">[{f2(res.nisBounds.lo)}, {f2(res.nisBounds.hi)}]</span>
      </dd>
      <dt>NIS of one run</dt>
      <dd data-readout="nis1">
        {f2(res.oneRunNis)} <span class="b">[{f2(res.oneRunNisBounds.lo)}, {f2(res.oneRunNisBounds.hi)}]</span>
      </dd>
    </dl>
  {/snippet}

  {#snippet controls()}
    <Select
      label="Preset"
      value={preset}
      options={[
        { value: 'tuned', label: 'Well tuned' },
        { value: 'overconfident', label: 'Assumes cameras 3× better' },
        { value: 'underconfident', label: 'Assumes cameras 3× worse' },
        { value: 'divergent', label: 'Assumes q 1000× too small' },
        ...(preset === 'custom' ? [{ value: 'custom' as const, label: 'Custom' }] : []),
      ]}
      onchange={(v) => v !== 'custom' && load(v)}
    />
    <fieldset>
      <legend>The real forklift and cameras</legend>
      <Slider
        label="True acceleration q"
        min={Math.log10(L.trueQ.min)}
        max={Math.log10(L.trueQ.max)}
        step={0.1}
        bind:value={logTrueQ}
        format={() => `${params.trueQ} m²/s³`}
        oninput={custom}
      />
      <Slider
        label="True camera noise σ"
        min={L.trueSigma.min}
        max={L.trueSigma.max}
        step={L.trueSigma.step}
        bind:value={trueSigma}
        unit="m"
        oninput={custom}
      />
    </fieldset>
    <fieldset>
      <legend>What the filter assumes</legend>
      <Slider
        label="Assumed q (times the true q)"
        min={L.logFactor.min}
        max={L.logFactor.max}
        step={L.logFactor.step}
        bind:value={logQf}
        format={() => `× ${params.qFactor}`}
        oninput={custom}
      />
      <Slider
        label="Assumed σ (times the true σ)"
        min={-1}
        max={1}
        step={0.05}
        bind:value={logSf}
        format={() => `× ${params.sigmaFactor}`}
        oninput={custom}
      />
    </fieldset>
    <SeedControl bind:seed defaultSeed={LAB.seed} />
  {/snippet}

  {#snippet caption()}
    Fifty simulated runs of the forklift tracker from post 12, each 40 steps. The truth follows the true noise levels;
    the filter uses its assumed ones. The shaded bands are the 95% chi-square ranges that the run-averaged NEES and NIS
    fall in when the filter's assumptions are right; the y-axes are logarithmic. Steps 1–5 are left out of the verdict
    while the prior still dominates. <strong>What to look for:</strong> when the filter assumes too little noise, NEES and
    NIS rise above their bands and the one-run error escapes its band; when it assumes too much, they fall below. NIS needs
    no truth, so a real filter can run this check on itself.
  {/snippet}
</WidgetFrame>

<style>
  .verdict {
    margin: 0 0 var(--space-2);
    font-weight: 600;
    font-size: 0.95rem;
  }
  .verdict.consistent {
    color: var(--c-post-text);
  }
  .verdict.overconfident {
    color: var(--c-bad-text);
  }
  .verdict.underconfident {
    color: var(--c-prior-text);
  }
  .verdict .sub {
    font-weight: 400;
    color: var(--c-muted);
    font-size: 0.85rem;
  }
  .ctitle {
    font-size: 11px;
    fill: var(--c-fg);
  }
  .band {
    fill: color-mix(in srgb, var(--c-post) 14%, transparent);
  }
  .expect {
    stroke: var(--c-odom);
    stroke-dasharray: var(--dash-odom);
    stroke-width: 1.5;
  }
  .stat,
  .err {
    fill: none;
    stroke: var(--c-post);
    stroke-width: 2;
  }
  .eband {
    fill: color-mix(in srgb, var(--c-post) 14%, transparent);
  }
  .zero {
    stroke: var(--c-axis);
  }
  fieldset {
    border: 1px solid var(--c-border);
    border-radius: var(--radius);
    padding: var(--space-2) var(--space-3);
    margin: 0;
    display: grid;
    gap: var(--space-2);
  }
  legend {
    font-size: 0.8rem;
    color: var(--c-muted);
    padding: 0 0.3rem;
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
  .ro .b {
    color: var(--c-muted);
    font-size: 0.8rem;
  }
</style>
