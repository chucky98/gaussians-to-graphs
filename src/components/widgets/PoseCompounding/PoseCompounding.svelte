<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import PointsCanvas from '../../primitives/PointsCanvas.svelte';
  import CovEllipse from '../../primitives/CovEllipse.svelte';
  import Robot2D from '../../primitives/Robot2D.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import Toggle from '../../primitives/Toggle.svelte';
  import SeedControl from '../../primitives/SeedControl.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import {
    POSES,
    boxAround,
    cartesianPropagation,
    coverage,
    headingSpreadDeg,
    nominalPath,
    sampleFinalPoses,
    standardDraws,
    tangentPropagation,
    tangentRegion95,
    type ChainParams,
  } from '../../../lib/demos/pose-compounding';
  import { fromArrays } from '../../../lib/math/matrix';

  const D = POSES.defaults;
  let sigmaThetaDeg = $state<number>(D.sigmaThetaDeg);
  let steps = $state<number>(D.steps);
  let turnDeg = $state<number>(D.turnDeg);
  let seed = $state<number>(POSES.seed);
  let showCart = $state(true);
  let showTan = $state(true);

  const params = $derived<ChainParams>({ ...D, sigmaThetaDeg, steps, turnDeg });
  const z = $derived(standardDraws(seed));
  const poses = $derived(sampleFinalPoses(params, z));
  const path = $derived(nominalPath(params));
  const tan = $derived(tangentPropagation(params));
  const cart = $derived(cartesianPropagation(params));
  const box = $derived(boxAround(poses));
  const region = $derived(tangentRegion95(tan.mean, tan.P, box));
  const cov = $derived(coverage(poses, cart, tan, region.level));
  // Display frame: the robot drives "up" the screen. A rotation by 90° (shapes and areas unchanged) puts
  // the sideways spread along the wide axis of the plot: shown (x, y) = (−y, x) of the model's frame.
  const rot = (x: number, y: number): [number, number] => [-y, x];
  const pts = $derived(Float64Array.from(poses.flatMap((p) => rot(p.x, p.y))));
  const shownPath = $derived(path.map((p) => rot(p.x, p.y)));
  const cxy = $derived(
    // R P Rᵀ with R = [0 −1; 1 0]
    fromArrays([
      [cart.P.data[4]!, -cart.P.data[3]!],
      [-cart.P.data[1]!, cart.P.data[0]!],
    ]),
  );
  const end = $derived(rot(tan.mean.x, tan.mean.y));

  /** Plot domain: the whole path and the samples, padded and rounded to whole metres so it does not jitter. */
  const domain = $derived.by(() => {
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (let i = 0; i < pts.length; i += 2) {
      x0 = Math.min(x0, pts[i]!);
      x1 = Math.max(x1, pts[i]!);
      y0 = Math.min(y0, pts[i + 1]!);
      y1 = Math.max(y1, pts[i + 1]!);
    }
    for (const p of shownPath) {
      x0 = Math.min(x0, p[0]);
      x1 = Math.max(x1, p[0]);
      y0 = Math.min(y0, p[1]);
      y1 = Math.max(y1, p[1]);
    }
    return {
      x: [Math.floor(x0 - 0.5), Math.ceil(x1 + 0.5)] as [number, number],
      y: [Math.floor(y0 - 0.5), Math.ceil(y1 + 0.5)] as [number, number],
    };
  });

  function reset() {
    sigmaThetaDeg = D.sigmaThetaDeg;
    steps = D.steps;
    turnDeg = D.turnDeg;
    seed = POSES.seed;
    showCart = true;
    showTan = true;
  }
  const pct = (v: number) => `${Math.round(100 * v)}%`;
  const live = $derived(
    `${steps} steps, heading noise ${sigmaThetaDeg} degrees per step. Inside the Cartesian 95% ellipse: ${pct(cov.cartesian)}. ` +
      `Inside the tangent-space 95% region: ${pct(cov.tangent)}.`,
  );
</script>

<WidgetFrame
  name="PoseCompounding"
  title="Compounding uncertain poses: ellipse or banana?"
  description="A robot drives a chain of 1-metre moves, each with a little heading and position noise. Dots are the final positions of 2000 simulated runs. A dashed ellipse is the 95% region of a Gaussian over the numbers x, y and heading; a solid outline is the 95% region of a Gaussian defined in the tangent space and mapped onto the plane by the exponential map."
  {live}
  onreset={reset}
>
  {#snippet figure()}
    <Plot2D
      xDomain={domain.x}
      yDomain={domain.y}
      equalAspect
      maxHeight={420}
      margin={{ top: 8, right: 12, bottom: 30, left: 36 }}
      label="Planned path, final positions of the simulated runs, and two 95% regions"
    >
      {#snippet underlay(ctx)}
        <PointsCanvas {ctx} points={pts} radius={1.6} opacity={0.4} />
      {/snippet}
      {#snippet children(ctx)}
        <Axes {ctx} xTicks={8} yTicks={6} xLabel="x (m)" yLabel="y (m)" />
        <g clip-path="url(#{ctx.uid}-clip)">
          <path
            class="path"
            d={shownPath.map((p, i) => `${i ? 'L' : 'M'}${ctx.x(p[0]).toFixed(1)},${ctx.y(p[1]).toFixed(1)}`).join('')}
          />
          {#each shownPath.slice(1, -1) as p, i (i)}
            <circle class="node" cx={ctx.x(p[0])} cy={ctx.y(p[1])} r="2.5" />
          {/each}
          {#if showCart}
            <CovEllipse {ctx} mean={end} cov={cxy} kind="prior" />
          {/if}
          {#if showTan}
            <path
              class="region"
              d={region.segments
                .map(
                  (s) =>
                    `M${ctx.x(-s[1]).toFixed(1)},${ctx.y(s[0]).toFixed(1)}L${ctx.x(-s[3]).toFixed(1)},${ctx.y(s[2]).toFixed(1)}`,
                )
                .join('')}
            />
          {/if}
          <Robot2D {ctx} x={0} y={0} theta={Math.PI / 2} kind="truth" size={16} />
          <Robot2D {ctx} x={end[0]} y={end[1]} theta={tan.mean.theta + Math.PI / 2} kind="post" size={16} />
        </g>
      {/snippet}
    </Plot2D>
    <Legend
      items={[
        { kind: 'truth', label: 'planned path' },
        { kind: 'sample', label: `final positions of ${POSES.samples} runs` },
        ...(showCart ? [{ kind: 'prior' as const, label: 'Gaussian over (x, y, θ): 95% ellipse' }] : []),
        ...(showTan ? [{ kind: 'post' as const, label: 'Gaussian in the tangent space: 95% region' }] : []),
      ]}
    />
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Inside the dashed ellipse</dt>
      <dd data-readout="cart">{pct(cov.cartesian)}</dd>
      <dt>Inside the solid region</dt>
      <dd data-readout="tan">{pct(cov.tangent)}</dd>
      <dt>Final heading spread (1σ)</dt>
      <dd data-readout="heading">{headingSpreadDeg(tan.P).toFixed(1)}°</dd>
    </dl>
  {/snippet}

  {#snippet controls()}
    <Slider
      label="Heading noise per step"
      min={0.5}
      max={12}
      step={0.5}
      bind:value={sigmaThetaDeg}
      format={(v) => `${v}°`}
    />
    <Slider label="Steps" min={1} max={POSES.maxSteps} step={1} bind:value={steps} format={(v) => String(v)} />
    <Slider
      label="Turn per step"
      min={-20}
      max={20}
      step={1}
      bind:value={turnDeg}
      format={(v) => `${v}°`.replace('-', '−')}
    />
    <Toggle label="Show the (x, y, θ) ellipse" bind:checked={showCart} />
    <Toggle label="Show the tangent-space region" bind:checked={showTan} />
    <SeedControl bind:seed defaultSeed={POSES.seed} />
  {/snippet}

  {#snippet caption()}
    Each run drives the same chain of 1 m moves, starting at the origin and heading up the page; every move has its own
    small random error in heading (and 3 cm in position). Both Gaussians have the same mean, the planned end pose, and
    come from the same first-order propagation; they differ only in the coordinates they are written in. Both outlines
    are 95% regions of the final position.
    <strong>What to look for:</strong> as the heading noise grows, the runs spread along an arc around the start; the tangent-space
    region bends with them and keeps about 95%, while the ellipse covers empty space and misses the tips.
  {/snippet}
</WidgetFrame>

<style>
  .path {
    fill: none;
    stroke: var(--c-truth);
    stroke-width: var(--stroke-thin);
  }
  .node {
    fill: var(--c-bg);
    stroke: var(--c-truth);
  }
  .region {
    fill: none;
    stroke: var(--c-post);
    stroke-width: var(--stroke-thick);
    stroke-linecap: round;
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
