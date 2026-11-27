<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import {
    FGB,
    candidates,
    cost,
    initialGuess,
    rmsError,
    solve,
    structure,
    type Candidate,
  } from '../../../lib/demos/factor-graph-builder';
  import { getPoint, getPose2, type Values } from '../../../lib/graph/values';

  const all = candidates();
  const init = initialGuess();
  const defaultOn = all.map((c) => c.id);
  let on = $state<string[]>([...defaultOn]);
  let current = $state<Values>(init);
  let iterations = $state(0);

  const active = $derived(all.filter((c) => on.includes(c.id)));
  const factors = $derived(active.map((c) => c.factor));
  const st = $derived(structure(factors, current));
  const c0 = $derived(cost(factors, current));

  function toggle(c: Candidate) {
    on = on.includes(c.id) ? on.filter((id) => id !== c.id) : [...on, c.id];
    current = init;
    iterations = 0;
  }
  function doSolve() {
    const sol = solve(factors, init);
    current = sol.iterations.at(-1)!.values;
    iterations = sol.iterations.length - 1;
  }
  function reset() {
    on = [...defaultOn];
    current = init;
    iterations = 0;
  }

  const pos = (v: Values, k: string): [number, number] =>
    k.startsWith('x') ? [getPose2(v, k).x, getPose2(v, k).y] : [getPoint(v, k)[0]!, getPoint(v, k)[1]!];
  /** Where to draw a factor node: the mean of its variables (a prior sits just behind its pose). */
  function factorPos(c: Candidate): [number, number] {
    const ps = c.factor.keys.map((k) => pos(current, k));
    if (ps.length === 1) return [ps[0]![0] - 0.55, ps[0]![1] - 0.35];
    return [(ps[0]![0] + ps[1]![0]) / 2, (ps[0]![1] + ps[1]![1]) / 2];
  }
  const kindClass = (c: Candidate) => (c.kind === 'prior' ? 'prior' : c.kind === 'odometry' ? 'odom' : 'meas');
  const f2 = (v: number) => v.toFixed(2);
  const fmt = (v: number) => (v >= 100 ? v.toFixed(0) : v.toFixed(2));
  const live = $derived(
    `${active.length} factors. Jacobian ${st.rows} by ${st.cols} with ${st.jNonzeros.length} nonzeros; ` +
      (st.freeDirections ? `${st.freeDirections} directions unconstrained.` : `cost ${fmt(c0)}.`),
  );
  /** Cell size for the matrix plots. */
  const CELL = 7;
  const lmax = $derived(Math.max(...st.lambda.data.map(Math.abs)));
  const shade = (x: number) => (x === 0 ? 0 : Math.max(0.12, (Math.log10(Math.abs(x) / lmax) + 8) / 8));
</script>

<WidgetFrame
  name="FactorGraphBuilder"
  title="Build a factor graph"
  description="A small planar SLAM problem with five poses and three landmarks. Each square is a factor: a prior, an odometry measurement or a landmark reading; click one to switch it on or off. Beside the graph: the pattern of the stacked Jacobian J (one row per residual entry, one column per unknown) and the information matrix Λ = Jᵀ Ω J."
  {live}
  onreset={reset}
>
  {#snippet figure()}
    <div class="layout">
      <div class="graph">
        <Plot2D
          xDomain={[-1.2, 7]}
          yDomain={[-2.6, 4.6]}
          equalAspect
          maxHeight={360}
          margin={{ top: 8, right: 8, bottom: 30, left: 30 }}
          label="Factor graph drawn over the current estimate: variables as circles, factors as squares"
        >
          {#snippet children(ctx)}
            <Axes {ctx} xTicks={6} yTicks={5} xLabel="x (m)" yLabel="y (m)" />
            {#each FGB.landmarks as m, j (j)}
              <rect class="truthlm" x={ctx.x(m[0]) - 4} y={ctx.y(m[1]) - 4} width="8" height="8" />
            {/each}
            {#each FGB.poses as p, i (i)}
              <circle class="truthpose" cx={ctx.x(p[0])} cy={ctx.y(p[1])} r="4" />
            {/each}
            {#each all as c (c.id)}
              {@const fp = factorPos(c)}
              {#each c.factor.keys as k (k)}
                {@const vp = pos(current, k)}
                <line
                  class="edge {kindClass(c)}"
                  class:off={!on.includes(c.id)}
                  x1={ctx.x(fp[0])}
                  y1={ctx.y(fp[1])}
                  x2={ctx.x(vp[0])}
                  y2={ctx.y(vp[1])}
                />
              {/each}
            {/each}
            {#each FGB.poses as _, i (i)}
              {@const p = pos(current, `x${i}`)}
              <circle class="var" cx={ctx.x(p[0])} cy={ctx.y(p[1])} r="11" />
              <text class="vlbl" x={ctx.x(p[0])} y={ctx.y(p[1])}>x{i}</text>
            {/each}
            {#each FGB.landmarks as _, j (j)}
              {@const p = pos(current, `l${j}`)}
              <circle class="var lm" cx={ctx.x(p[0])} cy={ctx.y(p[1])} r="11" />
              <text class="vlbl" x={ctx.x(p[0])} y={ctx.y(p[1])}>l{j}</text>
            {/each}
            {#each all as c (c.id)}
              {@const fp = factorPos(c)}
              <rect
                class="fac {kindClass(c)}"
                class:off={!on.includes(c.id)}
                x={ctx.x(fp[0]) - 6}
                y={ctx.y(fp[1]) - 6}
                width="12"
                height="12"
                role="switch"
                aria-checked={on.includes(c.id)}
                aria-label={c.label}
                tabindex="0"
                data-factor={c.id}
                onclick={() => toggle(c)}
                onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(c))}
              />
            {/each}
          {/snippet}
        </Plot2D>
      </div>
      <div class="mats">
        <div>
          <p class="ptitle">J: {st.rows} × {st.cols}</p>
          <svg
            width={st.cols * CELL + 2}
            height={Math.max(1, st.rows) * CELL + 2}
            role="img"
            aria-label="Sparsity pattern of the Jacobian: {st.jNonzeros.length} nonzeros of {st.rows * st.cols}"
          >
            <rect class="mframe" x="0.5" y="0.5" width={st.cols * CELL + 1} height={st.rows * CELL + 1} />
            {#each st.jNonzeros as [r, c] (r * 1000 + c)}
              <rect class="nz" x={1 + c * CELL} y={1 + r * CELL} width={CELL - 1} height={CELL - 1} />
            {/each}
          </svg>
        </div>
        <div>
          <p class="ptitle">Λ = Jᵀ Ω J: {st.cols} × {st.cols}</p>
          <svg
            width={st.cols * CELL + 2}
            height={st.cols * CELL + 2}
            role="img"
            aria-label="Information matrix: {st.lambdaNonzeros} nonzeros of {st.cols * st.cols}"
          >
            <rect class="mframe" x="0.5" y="0.5" width={st.cols * CELL + 1} height={st.cols * CELL + 1} />
            {#each Array.from(st.lambda.data) as x, i (i)}
              {#if Math.abs(x) > 1e-12}
                <rect
                  class="nz"
                  x={1 + (i % st.cols) * CELL}
                  y={1 + Math.floor(i / st.cols) * CELL}
                  width={CELL - 1}
                  height={CELL - 1}
                  opacity={shade(x)}
                />
              {/if}
            {/each}
          </svg>
        </div>
      </div>
    </div>
    <Legend
      items={[
        { kind: 'truth', label: 'true poses (○) and landmarks (□)' },
        { kind: 'prior', label: 'prior factor' },
        { kind: 'odom', label: 'odometry factors' },
        { kind: 'meas', label: 'landmark readings' },
      ]}
    />
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Factors switched on</dt>
      <dd data-readout="factors">{active.length} of {all.length}</dd>
      <dt>Nonzeros in J</dt>
      <dd data-readout="nnzJ">{st.jNonzeros.length} of {st.rows * st.cols}</dd>
      <dt>Nonzeros in Λ</dt>
      <dd data-readout="nnzL">{st.lambdaNonzeros} of {st.cols * st.cols}</dd>
      <dt>Unconstrained directions</dt>
      <dd data-readout="free">{st.freeDirections}</dd>
      <dt>Cost c(x)</dt>
      <dd data-readout="cost">{fmt(c0)}</dd>
      <dt>RMS error of the estimate</dt>
      <dd data-readout="err">{f2(rmsError(current))} m</dd>
    </dl>
    <p class="status" class:warn={st.freeDirections > 0} data-readout="status">
      {st.freeDirections > 0
        ? `Λ is singular: ${st.freeDirections} direction${st.freeDirections > 1 ? 's are' : ' is'} not pinned down`
        : iterations
          ? `Solved: ${iterations} Gauss–Newton iterations`
          : 'Ready to solve'}
    </p>
  {/snippet}

  {#snippet controls()}
    <button type="button" class="btn primary" data-action="solve" disabled={st.freeDirections > 0} onclick={doSolve}>
      Solve (Gauss–Newton)
    </button>
    <button type="button" class="btn" data-action="initial" onclick={() => ((current = init), (iterations = 0))}>
      Back to the initial guess
    </button>
    <fieldset class="list">
      <legend>Factors (or click the squares)</legend>
      {#each all as c (c.id)}
        <label class="chip {kindClass(c)}">
          <input type="checkbox" checked={on.includes(c.id)} onchange={() => toggle(c)} />
          {c.label}
        </label>
      {/each}
    </fieldset>
  {/snippet}

  {#snippet caption()}
    Circles are unknowns (poses x, landmarks l), drawn at their current estimate; faint markers are the truth. Squares
    are factors: each one is a measurement and touches only the unknowns it involves. Every factor adds a band of rows
    to J, nonzero only in its unknowns' columns, and a block pattern to Λ. <strong>What to look for:</strong> J is mostly
    zeros, and Λ has a nonzero block only where two unknowns share a factor; remove the prior and three directions (where
    the whole map is) become free, so Λ is singular and nothing can be solved.
  {/snippet}
</WidgetFrame>

<style>
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    gap: var(--space-3);
    align-items: start;
  }
  @container (max-width: 560px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .mats {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  .ptitle {
    margin: 0 0 0.25rem;
    font-size: 0.8rem;
    font-weight: 600;
  }
  .mframe {
    fill: none;
    stroke: var(--c-axis);
  }
  .nz {
    fill: var(--c-seq-hi);
  }
  .truthpose,
  .truthlm {
    fill: none;
    stroke: var(--c-truth);
    stroke-width: 1;
    opacity: 0.5;
  }
  .var {
    fill: var(--c-bg);
    stroke: var(--c-post);
    stroke-width: 2;
  }
  .var.lm {
    stroke-dasharray: 3 2;
  }
  .vlbl {
    font-size: 10px;
    font-style: italic;
    text-anchor: middle;
    dominant-baseline: central;
    fill: var(--c-fg);
    pointer-events: none;
  }
  .edge {
    stroke-width: 1.5;
  }
  .edge.off {
    opacity: 0.18;
  }
  .edge.prior {
    stroke: var(--c-prior);
  }
  .edge.odom {
    stroke: var(--c-odom);
  }
  .edge.meas {
    stroke: var(--c-meas);
  }
  .fac {
    stroke-width: 1.5;
    cursor: pointer;
  }
  .fac:focus-visible {
    outline: 2px solid var(--c-focus);
  }
  .fac.prior {
    fill: var(--c-prior);
    stroke: var(--c-prior);
  }
  .fac.odom {
    fill: var(--c-odom);
    stroke: var(--c-odom);
  }
  .fac.meas {
    fill: var(--c-meas);
    stroke: var(--c-meas);
  }
  .fac.off {
    fill: var(--c-bg);
    stroke-dasharray: 2 2;
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
  .status {
    margin: var(--space-2) 0 0;
    font-size: 0.82rem;
    font-weight: 600;
  }
  .status.warn {
    color: var(--c-bad-text);
  }
  .list {
    border: 1px solid var(--c-border);
    border-radius: var(--radius);
    padding: 0.4rem 0.6rem;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.6rem;
    font-size: 0.78rem;
  }
  .list legend {
    font-size: 0.8rem;
    color: var(--c-muted);
  }
  .chip {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
</style>
