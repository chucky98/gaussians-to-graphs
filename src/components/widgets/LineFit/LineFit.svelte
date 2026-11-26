<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import Handle from '../../primitives/Handle.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import Toggle from '../../primitives/Toggle.svelte';
  import Select from '../../primitives/Select.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import type { PlotContext } from '../../primitives/plot';
  import {
    LINEFIT_DEFAULTS as D,
    LINEFIT_LIMITS as L,
    ROAD,
    clampFix,
    fitAll,
    initialFixes,
    lineAt,
    residualSquare,
    type Fix,
    type Preset,
  } from '../../../lib/demos/line-fit';

  interface Props {
    preset?: Preset;
  }
  let { preset: initialPreset = D.preset }: Props = $props();
  const start = (): Preset => initialPreset;

  let preset = $state<Preset>(start());
  let fixes = $state<Fix[]>(initialFixes(start()));
  let selected = $state<number>(start() === 'multipath' ? D.outlierIndex : 0);
  let showSquares = $state(true);
  let showLAD = $state(false);
  let showRoad = $state(false);

  const fit = $derived(fitAll(fixes));
  const shares = $derived(fit.weights.map((w, i) => (w * fit.ls.residuals[i]! ** 2) / Math.max(1e-12, fit.ls.cost)));

  function load(p: Preset) {
    preset = p;
    fixes = initialFixes(p);
    selected = p === 'multipath' ? D.outlierIndex : 0;
  }
  function reset() {
    load(start());
    showSquares = true;
    showLAD = false;
    showRoad = false;
  }
  function moveFix(i: number, x: number, y: number) {
    fixes[i] = clampFix({ ...fixes[i]!, x, y });
  }

  function linePath(ctx: PlotContext, l: { intercept: number; slope: number }) {
    const [x0, x1] = L.xDomain;
    return `M${ctx.x(x0)},${ctx.y(lineAt(l, x0))}L${ctx.x(x1)},${ctx.y(lineAt(l, x1))}`;
  }

  const f1 = (v: number) => v.toFixed(1);
  const f2 = (v: number) => v.toFixed(2);
  const f3 = (v: number) => v.toFixed(3);
  const eq = (l: { intercept: number; slope: number }) => `y = ${f2(l.intercept)} + ${f3(l.slope)} t`;
  const sel = $derived(fixes[selected]!);
  const live = $derived(
    `Least-squares line ${eq(fit.ls)}, total squared error ${f1(fit.ls.cost)} square metres. ` +
      `Fix ${selected + 1} contributes ${(100 * shares[selected]!).toFixed(0)} percent.`,
  );
</script>

<WidgetFrame
  name="LineFit"
  title="Fitting a road to GPS fixes"
  description="Ten GPS fixes along a straight road and the least-squares line through them. Each fix's squared error is drawn as a square; the total area is the cost being minimized."
  {live}
  onreset={reset}
>
  {#snippet figure()}
    <Plot2D
      xDomain={L.xDomain}
      yDomain={L.yDomain}
      equalAspect
      maxHeight={420}
      margin={{ top: 10, right: 10, bottom: 30, left: 34 }}
      label="GPS fixes, residual squares and fitted lines"
    >
      {#snippet children(ctx)}
        <Axes {ctx} xTicks={10} yTicks={6} xLabel="east (m)" yLabel="north (m)" />
        <g clip-path="url(#{ctx.uid}-clip)">
          {#if showSquares}
            {#each fixes as f, i (i)}
              {@const s = residualSquare(f, fit.ls.residuals[i]!, fit.weights[i]!)}
              <rect
                class="sq"
                class:sel={i === selected}
                x={ctx.x(s.x)}
                y={ctx.y(s.y + s.side)}
                width={ctx.x(s.x + s.side) - ctx.x(s.x)}
                height={ctx.y(s.y) - ctx.y(s.y + s.side)}
              />
            {/each}
          {/if}
          {#each fixes as f, i (i)}
            <line class="res" x1={ctx.x(f.x)} x2={ctx.x(f.x)} y1={ctx.y(f.y)} y2={ctx.y(lineAt(fit.ls, f.x))} />
          {/each}
          {#if showRoad}<path class="road" d={linePath(ctx, ROAD)} />{/if}
          {#if showLAD}<path class="lad" d={linePath(ctx, fit.lad)} />{/if}
          <path class="ls" d={linePath(ctx, fit.ls)} />
        </g>
        {#each fixes as f, i (i)}
          <Handle
            cx={ctx.x(f.x)}
            cy={ctx.y(f.y)}
            kind={i === selected ? 'prior' : 'meas'}
            tag={i === selected ? `${i + 1}` : undefined}
            label={`GPS fix ${i + 1}: drag, or use the arrow keys`}
            valuetext={`fix ${i + 1} at east ${f1(f.x)} m, north ${f1(f.y)} m, residual ${f2(fit.ls.residuals[i]!)} m`}
            valuenow={+f.y.toFixed(1)}
            valuemin={L.yDomain[0]}
            valuemax={L.yDomain[1]}
            onstart={() => (selected = i)}
            onmove={(e) => {
              const [x, y] = ctx.toData(e);
              moveFix(i, x, y);
            }}
            onkey={([dx, dy]) => {
              selected = i;
              moveFix(i, f.x + 0.5 * dx, f.y + 0.5 * dy);
            }}
          />
        {/each}
      {/snippet}
    </Plot2D>
    <Legend
      items={[
        { kind: 'meas', label: 'GPS fixes (drag them)' },
        { kind: 'post', label: 'least-squares line' },
        ...(showLAD ? [{ kind: 'prior' as const, label: 'least absolute deviations' }] : []),
        ...(showRoad ? [{ kind: 'truth' as const, label: 'the real road' }] : []),
        ...(showSquares ? [{ kind: 'bad' as const, label: 'squared errors (area)' }] : []),
      ]}
    />
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Fit</dt>
      <dd data-readout="ls">{eq(fit.ls)}</dd>
      <dt>Total area Σ wr²</dt>
      <dd data-readout="cost">{f1(fit.ls.cost)} m²</dd>
      {#if showLAD}
        <dt>Abs. dev. fit</dt>
        <dd data-readout="lad">{eq(fit.lad)}</dd>
      {/if}
      <dt>Fix {selected + 1}: share of area</dt>
      <dd data-readout="share">{(100 * shares[selected]!).toFixed(0)}%</dd>
    </dl>
  {/snippet}

  {#snippet controls()}
    <Select
      label="Data"
      value={preset}
      options={[
        { value: 'clean', label: 'Ten fixes on a clear day' },
        { value: 'multipath', label: 'One fix bounced off a building' },
      ]}
      onchange={(v) => load(v)}
    />
    <Slider
      label={`Reported accuracy of fix ${selected + 1}`}
      min={L.sigma.min}
      max={L.sigma.max}
      step={L.sigma.step}
      value={sel.sigma}
      oninput={(v) => (fixes[selected] = { ...sel, sigma: v })}
      format={(v) => `±${v.toFixed(1)} m (weight ${((D.sigma / v) ** 2).toFixed(2)})`}
    />
    <Toggle label="Show the squares" bind:checked={showSquares} />
    <Toggle label="Show least absolute deviations" bind:checked={showLAD} />
    <Toggle label="Show the real road" bind:checked={showRoad} />
  {/snippet}

  {#snippet caption()}
    Ten fixes from a phone walking along a straight road, one every 10 m, each with about 3 m of error. The solid line
    is the least-squares fit. Each square's area is that fix's weighted squared error, and the fit is the line that
    makes the total area as small as possible. Click a fix to select it; its slider sets the accuracy the phone reported
    for it, and the weight is (3 m / accuracy)². <strong>What to look for:</strong> one fix far from the rest owns a huge
    square, and the line tilts towards it to shrink that square.
  {/snippet}
</WidgetFrame>

<style>
  .sq {
    fill: color-mix(in srgb, var(--c-bad) 14%, transparent);
    stroke: var(--c-bad);
    stroke-width: 1;
  }
  .sq.sel {
    fill: color-mix(in srgb, var(--c-bad) 28%, transparent);
    stroke-width: 2;
  }
  .res {
    stroke: var(--c-meas);
    stroke-width: 1.25;
    stroke-dasharray: 2 2;
  }
  .ls {
    fill: none;
    stroke: var(--c-post);
    stroke-width: var(--stroke-thick);
  }
  .lad {
    fill: none;
    stroke: var(--c-prior);
    stroke-width: var(--stroke-base);
    stroke-dasharray: var(--dash-prior);
  }
  .road {
    fill: none;
    stroke: var(--c-truth);
    stroke-width: var(--stroke-thin);
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
