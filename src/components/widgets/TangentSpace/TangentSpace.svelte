<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Handle from '../../primitives/Handle.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import Toggle from '../../primitives/Toggle.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import type { PlotContext } from '../../primitives/plot';
  import { TANGENT, arcPoints, tangentState, type P2 } from '../../../lib/demos/lie-groups';

  let xDeg = $state<number>(TANGENT.defaults.xDeg);
  let tau = $state<number>(TANGENT.defaults.tau);
  let showProj = $state(true);

  const s = $derived(tangentState(xDeg, tau));
  const a = $derived((xDeg * Math.PI) / 180);
  const wrapped = $derived(Math.abs(s.back - tau) > 1e-9);

  function reset() {
    xDeg = TANGENT.defaults.xDeg;
    tau = TANGENT.defaults.tau;
    showProj = true;
  }
  const clampTau = (v: number) => Math.max(TANGENT.tauRange[0], Math.min(TANGENT.tauRange[1], v));
  const round2 = (v: number) => Math.round(v * 100) / 100;
  const R = 2;
  const inView = (p: P2) => Math.abs(p[0]) <= R && Math.abs(p[1]) <= R;

  const path = (ctx: PlotContext, pts: P2[]) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${ctx.x(p[0]).toFixed(1)},${ctx.y(p[1]).toFixed(1)}`).join('');
  const DEG = 180 / Math.PI;
  const f2 = (v: number) => v.toFixed(2).replace('-', '−');
  const dg = (v: number) => `${(v * DEG).toFixed(1)}°`.replace('-', '−');
  const live = $derived(
    `Tangent vector ${f2(tau)} radians at ${Math.round(xDeg)} degrees. X plus tau lies at ${dg(s.exactAngle)}. ` +
      `Going back with minus gives ${f2(s.back)}.`,
  );
</script>

<WidgetFrame
  name="TangentSpace"
  title="The tangent line and the exponential map on the circle"
  description="The unit circle is the group of planar rotations. At a point X on it, the tangent line holds the tangent vectors. A tangent vector τ is wrapped onto the circle by the exponential map: X ⊕ τ lies an arc of length τ from X. For comparison, stepping along the tangent line and pulling the tip back onto the circle turns less."
  {live}
  onreset={reset}
>
  {#snippet figure()}
    <Plot2D
      xDomain={[-R, R]}
      yDomain={[-R, R]}
      equalAspect
      maxHeight={420}
      margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
      label="Unit circle with a tangent vector at X and its image under the exponential map"
    >
      {#snippet children(ctx)}
        <g clip-path="url(#{ctx.uid}-clip)">
          <circle class="circle" cx={ctx.x(0)} cy={ctx.y(0)} r={ctx.x(1) - ctx.x(0)} />
          <line class="axis" x1={ctx.x(-R)} x2={ctx.x(R)} y1={ctx.y(0)} y2={ctx.y(0)} />
          <line class="axis" x1={ctx.x(0)} x2={ctx.x(0)} y1={ctx.y(-R)} y2={ctx.y(R)} />
          <!-- tangent line at X -->
          <line
            class="tline"
            x1={ctx.x(s.x[0] - 6 * s.dir[0])}
            y1={ctx.y(s.x[1] - 6 * s.dir[1])}
            x2={ctx.x(s.x[0] + 6 * s.dir[0])}
            y2={ctx.y(s.x[1] + 6 * s.dir[1])}
          />
          {#if showProj}
            <line class="ray" x1={ctx.x(0)} y1={ctx.y(0)} x2={ctx.x(s.tip[0])} y2={ctx.y(s.tip[1])} />
          {/if}
          <!-- Exp: the arc of length τ -->
          <path class="exparc" d={path(ctx, arcPoints(a, tau))} />
          {#if wrapped}
            <path class="logarc" d={path(ctx, arcPoints(a, s.back))} />
          {/if}
          <!-- the tangent vector -->
          <line class="tvec" x1={ctx.x(s.x[0])} y1={ctx.y(s.x[1])} x2={ctx.x(s.tip[0])} y2={ctx.y(s.tip[1])} />
          {#if showProj}
            <path class="proj" d="M{ctx.x(s.projected[0]) - 5},{ctx.y(s.projected[1]) - 5}l10,10m0,-10l-10,10" />
          {/if}
          <circle class="exact" cx={ctx.x(s.exact[0])} cy={ctx.y(s.exact[1])} r="6" />
          <text class="lbl" x={ctx.x(s.x[0] * 0.82)} y={ctx.y(s.x[1] * 0.82)} dy="0.35em">X</text>
        </g>
        <Handle
          cx={ctx.x(s.x[0])}
          cy={ctx.y(s.x[1])}
          kind="prior"
          label="Point X on the circle (drag around the circle, or use the arrow keys)"
          valuetext={`X at ${Math.round(xDeg)} degrees`}
          valuenow={Math.round(xDeg)}
          valuemin={-180}
          valuemax={180}
          onmove={(e) => {
            const [px, py] = ctx.toData(e);
            xDeg = Math.round(Math.atan2(py, px) * DEG);
          }}
          onkey={([dx, dy]) => (xDeg = ((((xDeg + 5 * (dy || dx) + 180) % 360) + 360) % 360) - 180)}
        />
        {#if inView(s.tip)}
          <Handle
            cx={ctx.x(s.tip[0])}
            cy={ctx.y(s.tip[1])}
            kind="meas"
            label="Tangent vector tau (drag along the tangent line, or use the arrow keys)"
            valuetext={`tau ${f2(tau)} radians`}
            valuenow={round2(tau)}
            valuemin={TANGENT.tauRange[0]}
            valuemax={TANGENT.tauRange[1]}
            onmove={(e) => {
              const [px, py] = ctx.toData(e);
              tau = clampTau(round2((px - s.x[0]) * s.dir[0] + (py - s.x[1]) * s.dir[1]));
            }}
            onkey={([dx, dy]) => (tau = clampTau(round2(tau + 0.05 * (dx || dy))))}
          />
        {/if}
      {/snippet}
    </Plot2D>
    <Legend
      items={[
        { kind: 'meas', label: 'tangent vector τ at X' },
        { kind: 'post', label: 'Exp: arc of length τ, ending at X ⊕ τ (●)' },
        ...(wrapped ? [{ kind: 'prior' as const, label: '(X ⊕ τ) ⊖ X: the shorter way back' }] : []),
        ...(showProj ? [{ kind: 'bad' as const, label: 'tangent tip pulled back to the circle (×)' }] : []),
      ]}
    />
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Tangent vector τ</dt>
      <dd data-readout="tau">{f2(tau)} rad ({dg(tau)})</dd>
      <dt>X ⊕ τ lies at</dt>
      <dd data-readout="exact">{dg(s.exactAngle)}</dd>
      <dt>(X ⊕ τ) ⊖ X</dt>
      <dd data-readout="back">{f2(s.back)} rad {wrapped ? '(wrapped)' : '(= τ)'}</dd>
      <dt>Pulled-back tip turns</dt>
      <dd data-readout="proj">{dg(s.projectedTurn)}</dd>
      <dt>Tangent tip off the circle</dt>
      <dd data-readout="off">{f2(s.offCircle)}</dd>
    </dl>
  {/snippet}

  {#snippet controls()}
    <Slider label="Tangent vector τ (rad)" min={-6} max={6} step={0.01} bind:value={tau} format={f2} />
    <Slider label="Point X (degrees)" min={-180} max={180} step={1} bind:value={xDeg} format={(v) => `${v}°`} />
    <Toggle label="Show the tangent tip pulled back to the circle" bind:checked={showProj} />
  {/snippet}

  {#snippet caption()}
    The unit circle is SO(2), the group of planar rotations: each point is a rotation angle. The dashed line is the
    tangent line at X, where tangent vectors (angular increments) live. Exp wraps a tangent vector onto the circle
    without stretching it, so X ⊕ τ is an arc of length |τ| from X. <strong>What to look for:</strong> for small τ the tangent
    line and the circle agree; for larger τ the pulled-back tip lags behind; and once |τ| passes π, going back with ⊖ returns
    the shorter angle, not τ.
  {/snippet}
</WidgetFrame>

<style>
  .circle {
    fill: none;
    stroke: var(--c-truth);
    stroke-width: 1.5;
  }
  .axis {
    stroke: var(--c-grid);
  }
  .tline {
    stroke: var(--c-axis);
    stroke-dasharray: 4 4;
  }
  .ray {
    stroke: var(--c-odom);
    stroke-dasharray: var(--dash-odom);
  }
  .exparc {
    fill: none;
    stroke: var(--c-post);
    stroke-width: var(--stroke-thick);
  }
  .logarc {
    fill: none;
    stroke: var(--c-prior);
    stroke-width: 2;
    stroke-dasharray: var(--dash-prior);
  }
  .tvec {
    stroke: var(--c-meas);
    stroke-width: 2.5;
    stroke-dasharray: var(--dash-meas);
  }
  .exact {
    fill: var(--c-post);
  }
  .proj {
    stroke: var(--c-bad);
    stroke-width: 2.5;
    fill: none;
  }
  .lbl {
    font-size: 13px;
    font-style: italic;
    fill: var(--c-fg);
    text-anchor: middle;
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
