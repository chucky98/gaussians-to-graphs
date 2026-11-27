<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import Handle from '../../primitives/Handle.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import Select from '../../primitives/Select.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import Robot2D from '../../primitives/Robot2D.svelte';
  import type { PlotContext } from '../../primitives/plot';
  import {
    SE2EXP,
    arcRadius,
    expArc,
    expEnd,
    naiveSum,
    poseDistance,
    startPose,
    steps,
    twistTo,
  } from '../../../lib/demos/lie-groups';
  import type { Pose2 } from '../../../lib/geometry/se2';

  const D = SE2EXP.defaults;
  let rho1 = $state<number>(D.rho1);
  let rho2 = $state<number>(D.rho2);
  let theta = $state<number>(D.theta);
  let headingDeg = $state<number>(D.headingDeg);
  let N = $state<number>(D.steps);

  const tw = $derived({ rho1, rho2, theta });
  const X = $derived(startPose(headingDeg));
  const end = $derived(expEnd(X, tw));
  const arc = $derived(expArc(X, tw));
  const poly = $derived(steps(X, tw, N));
  const naive = $derived(naiveSum(X, tw));

  function reset() {
    ({ rho1, rho2, theta, headingDeg, steps: N } = D);
  }
  const W = 3.2;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const r2 = (v: number) => Math.round(v * 100) / 100;
  function dragEnd(p: [number, number]) {
    const t = twistTo(X, [clamp(p[0], -W, W), clamp(p[1], -W, W)], theta);
    rho1 = r2(clamp(t.rho1, -6, 6));
    rho2 = r2(clamp(t.rho2, -6, 6));
  }
  const line = (ctx: PlotContext, ps: Pose2[]) =>
    ps.map((p, i) => `${i ? 'L' : 'M'}${ctx.x(p.x).toFixed(1)},${ctx.y(p.y).toFixed(1)}`).join('');
  const f2 = (v: number) => v.toFixed(2).replace('-', '−');
  const pose = (p: Pose2) => `(${f2(p.x)}, ${f2(p.y)}, ${Math.round((p.theta * 180) / Math.PI)}°)`.replace(/-/g, '−');
  const radius = $derived(arcRadius(tw));
  const live = $derived(
    `Twist ${f2(rho1)}, ${f2(rho2)}, ${f2(theta)}. Exp ends at ${pose(end)}; the naive sum at ${pose(naive)}, ` +
      `${f2(poseDistance(end, naive))} metres away.`,
  );
</script>

<WidgetFrame
  name="SE2Exp"
  title="Exp on SE(2): driving with a constant twist"
  description="A robot starts at the origin and drives for one unit of time with a constant twist: forward and sideways velocity and a turn rate. The exponential map gives the circular arc it follows and where it ends. Also shown: the same motion split into N straight-then-turn steps, and the naive answer that adds the three numbers to the pose."
  {live}
  onreset={reset}
>
  {#snippet figure()}
    <Plot2D
      xDomain={[-W, W]}
      yDomain={[-W, W]}
      equalAspect
      maxHeight={440}
      margin={{ top: 8, right: 12, bottom: 30, left: 36 }}
      label="Start pose, the constant-twist arc and its end pose, the N-step path, and the naive sum"
    >
      {#snippet children(ctx)}
        <Axes {ctx} xTicks={8} yTicks={8} xLabel="x (m)" yLabel="y (m)" />
        <g clip-path="url(#{ctx.uid}-clip)">
          <path class="poly" d={line(ctx, poly)} />
          {#each poly.slice(1, -1) as p, i (i)}
            <circle class="vtx" cx={ctx.x(p.x)} cy={ctx.y(p.y)} r="2.5" />
          {/each}
          <path class="arc" d={line(ctx, arc)} />
          <Robot2D {ctx} x={X.x} y={X.y} theta={X.theta} kind="truth" size={20} />
          <Robot2D {ctx} x={naive.x} y={naive.y} theta={naive.theta} kind="bad" size={18} />
          <Robot2D {ctx} x={poly[N]!.x} y={poly[N]!.y} theta={poly[N]!.theta} kind="odom" size={16} />
          <Robot2D {ctx} x={end.x} y={end.y} theta={end.theta} kind="post" size={20} />
        </g>
        <Handle
          cx={ctx.x(end.x)}
          cy={ctx.y(end.y)}
          label="End position of the arc (drag, or use the arrow keys); sets the velocity part of the twist"
          valuetext={`ends at x ${f2(end.x)}, y ${f2(end.y)} metres`}
          valuenow={r2(end.x)}
          valuemin={-W}
          valuemax={W}
          onmove={(e) => dragEnd(ctx.toData(e))}
          onkey={([dx, dy]) => dragEnd([end.x + 0.1 * dx, end.y + 0.1 * dy])}
        />
      {/snippet}
    </Plot2D>
    <Legend
      items={[
        { kind: 'truth', label: 'start pose X' },
        { kind: 'post', label: 'X ⊕ τ: the constant-twist arc and its end' },
        { kind: 'odom', label: `${N} straight-then-turn step${N === 1 ? '' : 's'}` },
        { kind: 'bad', label: 'naive sum (x + ρ₁, y + ρ₂, θ + θ_τ)' },
      ]}
    />
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>X ⊕ τ (x, y, θ)</dt>
      <dd data-readout="exp">{pose(end)}</dd>
      <dt>Naive sum</dt>
      <dd data-readout="naive">{pose(naive)}</dd>
      <dt>Naive sum is off by</dt>
      <dd data-readout="gap">{f2(poseDistance(end, naive))} m</dd>
      <dt>{N} step{N === 1 ? '' : 's'} end off by</dt>
      <dd data-readout="steps">{f2(poseDistance(end, poly[N]!))} m</dd>
      <dt>Arc radius |ρ| / |θ|</dt>
      <dd data-readout="radius">{Number.isFinite(radius) ? `${f2(radius)} m` : 'straight'}</dd>
    </dl>
  {/snippet}

  {#snippet controls()}
    <Slider label="Forward velocity ρ₁" min={-3} max={3} step={0.05} bind:value={rho1} format={f2} unit="m" />
    <Slider label="Sideways velocity ρ₂" min={-3} max={3} step={0.05} bind:value={rho2} format={f2} unit="m" />
    <Slider label="Turn θ" min={-3} max={3} step={0.05} bind:value={theta} format={f2} unit="rad" />
    <Slider
      label="Start heading"
      min={-180}
      max={180}
      step={5}
      bind:value={headingDeg}
      format={(v) => `${v}°`.replace('-', '−')}
    />
    <Select
      label="Straight-then-turn steps N"
      value={N}
      options={SE2EXP.stepChoices.map((n) => ({ value: n, label: String(n) }))}
      onchange={(v) => (N = v)}
    />
  {/snippet}

  {#snippet caption()}
    A twist τ = (ρ₁, ρ₂, θ) is a velocity in the robot's own frame: ρ₁ forward, ρ₂ to the left, and a turn θ, all per
    unit time. Driving with it for one unit of time from X gives X ⊕ τ = X Exp(τ), at the end of a circular arc. Drag
    the end point to see the twist that reaches it (the Log). <strong>What to look for:</strong> N straight-then-turn steps
    close in on the arc as N grows, halving the gap each time N doubles; adding the numbers instead ignores both the turning
    during the motion and, once the start heading is not zero, the robot's own frame.
  {/snippet}
</WidgetFrame>

<style>
  .arc {
    fill: none;
    stroke: var(--c-post);
    stroke-width: var(--stroke-thick);
  }
  .poly {
    fill: none;
    stroke: var(--c-odom);
    stroke-width: 2;
    stroke-dasharray: var(--dash-odom);
  }
  .vtx {
    fill: var(--c-odom);
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
