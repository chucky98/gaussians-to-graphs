<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import Heatmap from '../../primitives/Heatmap.svelte';
  import Handle from '../../primitives/Handle.svelte';
  import Landmark from '../../primitives/Landmark.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import TexSlider from '../../primitives/TexSlider.svelte';
  import Select from '../../primitives/Select.svelte';
  import Toggle from '../../primitives/Toggle.svelte';
  import PlayControls from '../../primitives/PlayControls.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import { createAnimationLoop } from '../../primitives/animation.svelte';
  import type { PlotContext } from '../../primitives/plot';
  import type { Iterate } from '../../../lib/graph/solver';
  import {
    LANDSCAPE as L,
    PRESETS,
    ROOM,
    TAG,
    landscape,
    path,
    ranges,
    runBoth,
    type LandscapePreset,
  } from '../../../lib/demos/cost-landscape';

  interface Props {
    preset?: LandscapePreset;
  }
  let { preset: initialPreset = 'corners' }: Props = $props();
  const startPreset = (): LandscapePreset => initialPreset;

  let preset = $state<LandscapePreset>(startPreset());
  let start = $state<[number, number]>([...PRESETS[startPreset()].start]);
  let logLambda = $state<number>(L.logLambda.default);
  /** Iterations shown (0 … maxIterations). Starts at the end. */
  let shown = $state<number>(L.maxIterations);
  let showCircles = $state(false);

  const spec = $derived(PRESETS[preset]);
  const land = $derived(landscape(preset));
  const runs = $derived(runBoth(preset, start, logLambda));
  const z = $derived(ranges(spec.anchors));
  const gnShown = $derived(runs.gn.slice(0, shown + 1));
  const lmShown = $derived(runs.lm.slice(0, shown + 1));
  const gnNow = $derived(gnShown.at(-1)!);
  const lmNow = $derived(lmShown.at(-1)!);

  const loop = createAnimationLoop(
    () => {
      shown = Math.min(L.maxIterations, shown + 1);
      return shown < L.maxIterations;
    },
    { fps: 2 },
  );
  function togglePlay() {
    if (!loop.playing && shown >= L.maxIterations) shown = 0;
    loop.toggle();
  }
  function step() {
    if (shown >= L.maxIterations) shown = 0;
    shown = Math.min(L.maxIterations, shown + 1);
  }
  function load(p: LandscapePreset) {
    loop.pause();
    preset = p;
    start = [...PRESETS[p].start];
    shown = L.maxIterations;
  }
  function reset() {
    load(startPreset());
    logLambda = L.logLambda.default;
    showCircles = false;
  }
  const clampStart = (x: number, y: number): [number, number] => [
    Math.round(Math.min(L.xDomain[1] - 0.5, Math.max(L.xDomain[0] + 0.5, x)) * 10) / 10,
    Math.round(Math.min(L.yDomain[1] - 0.5, Math.max(L.yDomain[0] + 0.5, y)) * 10) / 10,
  ];
  function setStart(x: number, y: number) {
    start = clampStart(x, y);
    shown = L.maxIterations;
  }

  function contourPath(ctx: PlotContext, segs: [number, number, number, number][]): string {
    let s = '';
    for (const [ax, ay, bx, by] of segs)
      s += `M${ctx.x(ax).toFixed(1)},${ctx.y(ay).toFixed(1)}L${ctx.x(bx).toFixed(1)},${ctx.y(by).toFixed(1)}`;
    return s;
  }
  // Paths are drawn in data space but clamped far outside the view so wild steps still show their direction.
  const far = 1e4;
  const clampPt = (v: number) => Math.max(-far, Math.min(far, v));
  function iterPath(ctx: PlotContext, its: Iterate[]): string {
    return path(its)
      .map(
        (it, i) =>
          `${i === 0 ? 'M' : 'L'}${ctx.x(clampPt(it.x[0]!)).toFixed(1)},${ctx.y(clampPt(it.x[1]!)).toFixed(1)}`,
      )
      .join('');
  }
  const inView = (it: Iterate) =>
    it.x[0]! >= L.xDomain[0] && it.x[0]! <= L.xDomain[1] && it.x[1]! >= L.yDomain[0] && it.x[1]! <= L.yDomain[1];

  const SUP: Record<string, string> = {
    '-': '⁻',
    '.': '·',
    '0': '⁰',
    '1': '¹',
    '2': '²',
    '3': '³',
    '4': '⁴',
    '5': '⁵',
    '6': '⁶',
    '7': '⁷',
    '8': '⁸',
    '9': '⁹',
  };
  const sup = (v: number) =>
    String(v)
      .split('')
      .map((c) => SUP[c] ?? c)
      .join('');
  const fmtCost = (c: number) =>
    !Number.isFinite(c) ? '∞' : c >= 1e4 ? c.toExponential(1) : c.toFixed(c < 10 ? 2 : 0);
  const fmtPos = (it: Iterate) => (inView(it) ? `(${it.x[0]!.toFixed(2)}, ${it.x[1]!.toFixed(2)})` : 'off the map');
  const live = $derived(
    `Iteration ${shown}. Gauss–Newton at ${fmtPos(gnNow)}, cost ${fmtCost(gnNow.cost)}. Levenberg–Marquardt at ${fmtPos(lmNow)}, cost ${fmtCost(lmNow.cost)}.`,
  );
</script>

<WidgetFrame
  name="CostLandscape"
  title="Finding a UWB tag from its ranges"
  description="The cost of each possible tag position in a room, as a heat map with contour lines, with the anchors, the true tag position and the paths of the Gauss–Newton and Levenberg–Marquardt solvers from a chosen start."
  {live}
  onreset={reset}
  attach={loop.observe}
>
  {#snippet figure()}
    <Plot2D
      xDomain={L.xDomain}
      yDomain={L.yDomain}
      equalAspect
      maxHeight={460}
      margin={{ top: 10, right: 10, bottom: 30, left: 32 }}
      label="Cost landscape of the tag position with solver paths"
    >
      {#snippet underlay(ctx)}
        <Heatmap {ctx} values={land.heat} nx={land.nx} ny={land.ny} />
      {/snippet}
      {#snippet children(ctx)}
        <Axes {ctx} xTicks={11} yTicks={9} xLabel="east (m)" yLabel="north (m)" grid={false} />
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <rect
          class="catch"
          x={ctx.inner.left}
          y={ctx.inner.top}
          width={ctx.inner.right - ctx.inner.left}
          height={ctx.inner.bottom - ctx.inner.top}
          onclick={(e) => {
            const [x, y] = ctx.toData(e);
            setStart(x, y);
          }}
        />
        <g clip-path="url(#{ctx.uid}-clip)" pointer-events="none">
          {#each land.contours as c (c.level)}
            <path class="contour" d={contourPath(ctx, c.segments)} />
          {/each}
          <rect
            class="room"
            x={ctx.x(0)}
            y={ctx.y(ROOM.h)}
            width={ctx.x(ROOM.w) - ctx.x(0)}
            height={ctx.y(0) - ctx.y(ROOM.h)}
          />
          {#if showCircles}
            {#each spec.anchors as [ax, ay], i (i)}
              <circle class="range" cx={ctx.x(ax)} cy={ctx.y(ay)} r={ctx.x(ax + z[i]!) - ctx.x(ax)} />
            {/each}
          {/if}
          <path class="gn" d={iterPath(ctx, gnShown)} />
          <path class="lm" d={iterPath(ctx, lmShown)} />
          {#each path(gnShown) as it, i (i)}
            {#if inView(it)}<rect
                class="gn-mk"
                x={ctx.x(it.x[0]!) - 3.5}
                y={ctx.y(it.x[1]!) - 3.5}
                width="7"
                height="7"
              />{/if}
          {/each}
          {#each path(lmShown) as it, i (i)}
            {#if inView(it)}<circle class="lm-mk" cx={ctx.x(it.x[0]!)} cy={ctx.y(it.x[1]!)} r="3.5" />{/if}
          {/each}
          <circle class="tag" cx={ctx.x(TAG[0])} cy={ctx.y(TAG[1])} r="6" />
        </g>
        {#each spec.anchors as [ax, ay], i (i)}
          <Landmark {ctx} x={ax} y={ay} label={`A${i + 1}`} />
        {/each}
        <Handle
          cx={ctx.x(start[0])}
          cy={ctx.y(start[1])}
          kind="prior"
          tag="start"
          label="Starting guess: drag, click on the map, or use the arrow keys"
          valuetext={`start at east ${start[0].toFixed(1)} m, north ${start[1].toFixed(1)} m`}
          valuenow={start[0]}
          valuemin={L.xDomain[0]}
          valuemax={L.xDomain[1]}
          onmove={(e) => {
            const [x, y] = ctx.toData(e);
            setStart(x, y);
          }}
          onkey={([dx, dy]) => setStart(start[0] + 0.5 * dx, start[1] + 0.5 * dy)}
        />
      {/snippet}
    </Plot2D>
    <Legend
      items={[
        { kind: 'prior', label: 'Gauss–Newton (■)' },
        { kind: 'post', label: 'Levenberg–Marquardt (●)' },
        { kind: 'truth', label: 'true tag position' },
        ...(showCircles ? [{ kind: 'meas' as const, label: 'measured ranges' }] : []),
      ]}
    />
  {/snippet}

  {#snippet readouts()}
    <table class="ro">
      <caption class="visually-hidden">Solver state at the shown iteration</caption>
      <thead><tr><th scope="col"></th><th scope="col">Gauss–Newton</th><th scope="col">Lev.–Marq.</th></tr></thead>
      <tbody>
        <tr>
          <th scope="row">position</th><td data-readout="gn-pos">{fmtPos(gnNow)}</td><td data-readout="lm-pos">
            {fmtPos(lmNow)}
          </td>
        </tr>
        <tr>
          <th scope="row">cost</th><td data-readout="gn-cost">{fmtCost(gnNow.cost)}</td><td data-readout="lm-cost">
            {fmtCost(lmNow.cost)}
          </td>
        </tr>
        <tr>
          <th scope="row">λ</th><td>—</td><td>{lmNow.lambda !== undefined ? lmNow.lambda.toExponential(0) : '—'}</td>
        </tr>
      </tbody>
    </table>
  {/snippet}

  {#snippet controls()}
    <Select
      label="Anchors"
      value={preset}
      options={(Object.keys(PRESETS) as LandscapePreset[]).map((k) => ({ value: k, label: PRESETS[k].label }))}
      onchange={(v) => load(v)}
    />
    <PlayControls
      playing={loop.playing}
      ontoggle={togglePlay}
      onstep={step}
      atEnd={shown >= L.maxIterations}
      what="iterations"
    />
    <Slider
      label="Iterations shown"
      min={0}
      max={L.maxIterations}
      step={1}
      bind:value={shown}
      format={(v) => String(v)}
      oninput={() => loop.pause()}
    />
    <TexSlider
      label="initial damping lambda zero (log scale)"
      tex="\lambda_0"
      min={L.logLambda.min}
      max={L.logLambda.max}
      step={L.logLambda.step}
      bind:value={logLambda}
      format={(v) => `10${sup(v)}`}
    />
    <Toggle label="Show the measured range circles" bind:checked={showCircles} />
  {/snippet}

  {#snippet caption()}
    A UWB tag in a 10 m × 8 m room (outlined) measures its distance to each anchor with about 10 cm of noise. The heat
    map and contour lines show the cost of every candidate position: the stronger the colour, the lower the cost. Click
    anywhere, or drag the start handle, to choose where the solvers begin, then step through their iterations. <strong>
      What to look for:
    </strong> with good anchors both solvers find the tag in two steps; with all anchors on one wall, a mirror-image valley
    appears behind the wall, and a start in line with the anchors sends Gauss–Newton off the map while Levenberg–Marquardt
    recovers.
  {/snippet}
</WidgetFrame>

<style>
  .catch {
    fill: transparent;
    cursor: crosshair;
  }
  .contour {
    fill: none;
    stroke: var(--c-fg);
    stroke-width: 0.6;
    opacity: 0.35;
  }
  .room {
    fill: none;
    stroke: var(--c-fg);
    stroke-width: 2;
  }
  .range {
    fill: none;
    stroke: var(--c-meas);
    stroke-width: 1.25;
    stroke-dasharray: var(--dash-meas);
  }
  .gn {
    fill: none;
    stroke: var(--c-prior);
    stroke-width: 2;
    stroke-dasharray: var(--dash-prior);
  }
  .lm {
    fill: none;
    stroke: var(--c-post);
    stroke-width: var(--stroke-thick);
  }
  .gn-mk {
    fill: var(--c-bg);
    stroke: var(--c-prior);
    stroke-width: 1.5;
  }
  .lm-mk {
    fill: var(--c-post);
    stroke: var(--c-bg);
    stroke-width: 1;
  }
  .tag {
    fill: none;
    stroke: var(--c-truth);
    stroke-width: 2;
  }
  .ro {
    font-size: 0.8rem;
    width: 100%;
  }
  .ro th,
  .ro td {
    padding: 0.2rem 0.3rem;
  }
  .ro td {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .ro thead th {
    font-weight: 500;
    color: var(--c-muted);
    font-size: 0.75rem;
    text-align: right;
  }
  .ro tbody th {
    text-align: left;
    font-weight: 500;
  }
</style>
