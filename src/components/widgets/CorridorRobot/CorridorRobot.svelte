<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import Robot2D from '../../primitives/Robot2D.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import Toggle from '../../primitives/Toggle.svelte';
  import PlayControls from '../../primitives/PlayControls.svelte';
  import SeedControl from '../../primitives/SeedControl.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import { createAnimationLoop } from '../../primitives/animation.svelte';
  import type { PlotContext } from '../../primitives/plot';
  import {
    CORRIDOR,
    CORRIDOR_DEFAULTS as D,
    CORRIDOR_LIMITS as L,
    N_CELLS,
    cellCenter,
    modes,
    nextAuto,
    presetActions,
    run,
    summarize,
    type Action,
    type CorridorPreset,
  } from '../../../lib/demos/corridor-robot';

  interface Props {
    preset?: CorridorPreset;
  }
  let { preset = 'fresh' }: Props = $props();
  const startPreset = (): CorridorPreset => preset;

  let actions = $state<Action[]>(presetActions(startPreset()));
  let alpha = $state<number>(D.alpha);
  let hit = $state<number>(D.hit);
  let falseAlarm = $state<number>(D.falseAlarm);
  let allowKidnap = $state<boolean>(D.allowKidnap);
  let seed = $state<number>(CORRIDOR.seed);
  let showTruth = $state(true);
  let speed = $state(1);

  const frames = $derived(run(actions, { alpha, hit, falseAlarm, allowKidnap }, seed));
  const f = $derived(frames[frames.length - 1]!);
  const s = $derived(summarize(f));
  const hyps = $derived(modes(f.belief).length);
  /** Colour of the current belief: a prediction (after a move, or the initial prior) or a posterior. */
  const phase = $derived.by((): 'prior' | 'post' => {
    for (let i = actions.length - 1; i >= 0; i--) {
      if (actions[i] === 'sense') return 'post';
      if (actions[i] === 'move') return 'prior';
    }
    return 'prior';
  });
  const last = $derived(actions[actions.length - 1] ?? null);
  const full = $derived(actions.length >= CORRIDOR.maxActions);

  function act(a: Action) {
    if (actions.length >= CORRIDOR.maxActions) return;
    actions = [...actions, a];
  }
  function manual(a: Action) {
    loop.pause();
    act(a);
  }
  function undo() {
    loop.pause();
    actions = actions.slice(0, -1);
  }

  let acc = 0;
  const loop = createAnimationLoop(
    (dt) => {
      acc += dt;
      if (acc < 420 / speed) return true;
      acc = 0;
      if (actions.length >= CORRIDOR.maxActions) return false;
      act(nextAuto(actions));
      return true;
    },
    { fps: 30 },
  );
  function reset() {
    loop.pause();
    actions = presetActions(startPreset());
    alpha = D.alpha;
    hit = D.hit;
    falseAlarm = D.falseAlarm;
    allowKidnap = D.allowKidnap;
    seed = CORRIDOR.seed;
    showTruth = true;
  }

  // ---------------------------------------------------------------- drawing helpers
  const X: [number, number] = [0, CORRIDOR.length];
  const MARGIN = { left: 40, right: 12 };
  const LEVELS = [0.02, 0.03, 0.05, 0.08, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1];
  const yMax = $derived.by(() => {
    let m = 0;
    for (let i = 0; i < N_CELLS; i++) m = Math.max(m, f.belief[i]!, f.before[i]!);
    return LEVELS.find((l) => l >= 1.05 * m) ?? 1;
  });

  /** Step outline of a per-cell vector; closed to the baseline when `area`. */
  function steps(ctx: PlotContext, v: ArrayLike<number>, top: number, area: boolean): string {
    const y = (p: number) => ctx.y(Math.min(top, p)).toFixed(1);
    let d = `M${ctx.x(0).toFixed(1)},${area ? ctx.y(0).toFixed(1) : y(v[0]!)}`;
    for (let i = 0; i < v.length; i++) {
      d += `V${y(v[i]!)}H${ctx.x((i + 1) * CORRIDOR.cell).toFixed(1)}`;
    }
    if (area) d += `V${ctx.y(0).toFixed(1)}Z`;
    return d;
  }

  /** Wall segments on the door side, between the door openings. */
  const wallSegments: [number, number][] = (() => {
    const segs: [number, number][] = [];
    let x = 0;
    for (const [a, b] of CORRIDOR.doors) {
      segs.push([x, a]);
      x = b;
    }
    segs.push([x, CORRIDOR.length]);
    return segs;
  })();

  const m1 = (v: number) => `${v.toFixed(1)} m`;
  const pct = (v: number) => `${Math.round(100 * v)}%`;
  const readingText = $derived(f.reading === null ? '—' : f.reading ? 'door' : 'wall');
  const live = $derived(
    `${f.moves} moves and ${f.senses} readings. Last reading: ${readingText}. ` +
      `Most likely position ${m1(cellCenter(s.best))}. ` +
      (showTruth ? `True position ${m1(cellCenter(f.truth))}. ` : '') +
      `Probability within 1 metre of the true position: ${pct(s.nearTruth)}.`,
  );
</script>

<WidgetFrame
  name="CorridorRobot"
  title="Where on the loop is the robot?"
  description="A robot on a loop corridor with doors on one side. Its belief about its position is a histogram over 25-centimetre cells. Moving shifts and blurs the belief; a door-detector reading multiplies it by the likelihood and renormalizes."
  {live}
  onreset={reset}
  attach={loop.observe}
>
  {#snippet figure()}
    <Plot2D
      xDomain={X}
      yDomain={[0, 1]}
      aspect={0.16}
      maxHeight={96}
      margin={{ top: 4, right: MARGIN.right, bottom: 4, left: MARGIN.left }}
      label="The corridor: walls, doors and the robot"
    >
      {#snippet children(ctx)}
        <text class="side" x={ctx.inner.left - 6} y={ctx.y(0.85) + 4} text-anchor="end">doors</text>
        <line class="wall" x1={ctx.x(0)} x2={ctx.x(X[1])} y1={ctx.y(0.12)} y2={ctx.y(0.12)} />
        {#each wallSegments as [a, b] (a)}
          <line class="wall" x1={ctx.x(a)} x2={ctx.x(b)} y1={ctx.y(0.85)} y2={ctx.y(0.85)} />
        {/each}
        {#each CORRIDOR.doors as [a, b] (a)}
          <rect class="door" x={ctx.x(a)} y={ctx.y(1)} width={ctx.x(b) - ctx.x(a)} height={ctx.y(0.85) - ctx.y(1)} />
        {/each}
        <line class="loopend" x1={ctx.x(0)} x2={ctx.x(0)} y1={ctx.y(0.12)} y2={ctx.y(0.85)} />
        <line class="loopend" x1={ctx.x(X[1])} x2={ctx.x(X[1])} y1={ctx.y(0.12)} y2={ctx.y(0.85)} />
        {#if showTruth}
          {@const rx = cellCenter(f.truth)}
          {#if last === 'sense'}
            <line class="ray" x1={ctx.x(rx)} x2={ctx.x(rx)} y1={ctx.y(0.55)} y2={ctx.y(0.83)} />
            <text class="ray-t" x={ctx.x(rx) + 6} y={ctx.y(0.62)}>{readingText}</text>
          {/if}
          <Robot2D {ctx} x={rx} y={0.42} theta={0} kind="truth" size={14} />
        {/if}
      {/snippet}
    </Plot2D>
    <Plot2D
      xDomain={X}
      yDomain={[0, 1]}
      aspect={0.07}
      maxHeight={52}
      margin={{ top: 6, right: MARGIN.right, bottom: 2, left: MARGIN.left }}
      label="Likelihood of the last reading at each position"
    >
      {#snippet children(ctx)}
        <line class="base" x1={ctx.inner.left} x2={ctx.inner.right} y1={ctx.y(0)} y2={ctx.y(0)} />
        <text class="side" x={ctx.inner.left - 6} y={ctx.y(0.4)} text-anchor="end">p(z|x)</text>
        {#if f.lik}
          <path class="lik-area" d={steps(ctx, f.lik, 1, true)} />
          <path class="lik" d={steps(ctx, f.lik, 1, false)} />
        {:else}
          <text class="none" x={(ctx.inner.left + ctx.inner.right) / 2} y={ctx.y(0.35)} text-anchor="middle">
            {last === 'move'
              ? 'moved 1 m: no reading at this step'
              : last === 'kidnap'
                ? 'kidnapped!'
                : 'no reading yet'}
          </text>
        {/if}
      {/snippet}
    </Plot2D>
    <Plot2D
      xDomain={X}
      yDomain={[0, yMax]}
      aspect={0.32}
      maxHeight={230}
      margin={{ top: 8, right: MARGIN.right, bottom: 32, left: MARGIN.left }}
      label="Belief: probability of each 25-centimetre cell"
    >
      {#snippet children(ctx)}
        <Axes
          {ctx}
          xTicks={6}
          yTicks={4}
          yFormat={(v) => String(+v.toFixed(3))}
          xLabel="position along the loop, x (m)"
          yLabel="probability per cell"
        />
        <g clip-path="url(#{ctx.uid}-clip)">
          <path class="bel-area {phase}" d={steps(ctx, f.belief, yMax, true)} />
          <path class="bel {phase}" d={steps(ctx, f.belief, yMax, false)} />
          {#if last !== null && last !== 'kidnap'}
            <path class="before" d={steps(ctx, f.before, yMax, false)} />
          {/if}
          {#if showTruth}
            {@const tx = ctx.x(cellCenter(f.truth))}
            <line class="truth" x1={tx} x2={tx} y1={ctx.inner.top} y2={ctx.inner.bottom} />
          {/if}
        </g>
      {/snippet}
    </Plot2D>
    <Legend
      items={[
        { kind: 'prior', label: 'belief after a move (prediction)' },
        { kind: 'post', label: 'belief after a reading' },
        { kind: 'odom', label: 'belief before this step' },
        { kind: 'meas', label: 'likelihood of the reading' },
        ...(showTruth ? [{ kind: 'truth' as const, label: 'true position' }] : []),
      ]}
    />
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Moves / readings</dt>
      <dd data-readout="steps">{f.moves} / {f.senses}</dd>
      <dt>Last reading</dt>
      <dd data-readout="reading">{readingText}</dd>
      <dt>Most likely x</dt>
      <dd data-readout="best">{m1(cellCenter(s.best))}</dd>
      <dt>True x</dt>
      <dd data-readout="truth">{showTruth ? m1(cellCenter(f.truth)) : 'hidden'}</dd>
      <dt>Within ±1 m of truth</dt>
      <dd data-readout="near">{pct(s.nearTruth)}</dd>
      <dt>Hypotheses</dt>
      <dd data-readout="hyps">{hyps === 0 ? 'none (spread out)' : hyps}</dd>
    </dl>
  {/snippet}

  {#snippet controls()}
    <div class="acts" role="group" aria-label="Robot actions">
      <button type="button" class="btn" data-action="sense" onclick={() => manual('sense')} disabled={full}>
        Sense
      </button>
      <button type="button" class="btn" data-action="move" onclick={() => manual('move')} disabled={full}>
        Move 1 m
      </button>
      <button type="button" class="btn" data-action="kidnap" onclick={() => manual('kidnap')} disabled={full}>
        Kidnap the robot
      </button>
      <button type="button" class="btn" data-action="undo" onclick={undo} disabled={actions.length === 0}>
        Undo
      </button>
    </div>
    <PlayControls
      playing={loop.playing}
      ontoggle={() => loop.toggle()}
      atEnd={full}
      bind:speed
      speeds={[1, 2, 4]}
      what="sense and move"
    />
    <Slider
      label="Motion noise α (per 1 m move)"
      min={L.alpha.min}
      max={L.alpha.max}
      step={L.alpha.step}
      bind:value={alpha}
      format={(v) => `${v.toFixed(2)} m`}
    />
    <Slider label="Hit rate p(door | at a door)" min={L.hit.min} max={L.hit.max} step={L.hit.step} bind:value={hit} />
    <Slider
      label="False-alarm rate p(door | at a wall)"
      min={L.falseAlarm.min}
      max={L.falseAlarm.max}
      step={L.falseAlarm.step}
      bind:value={falseAlarm}
    />
    <Toggle label="Allow for kidnapping (ε = 0.001 per move)" bind:checked={allowKidnap} />
    <Toggle label="Show the true position" bind:checked={showTruth} />
    <SeedControl bind:seed defaultSeed={CORRIDOR.seed} />
  {/snippet}

  {#snippet caption()}
    A delivery robot drives along a 30 m loop corridor (leaving at 30 m it re-enters at 0 m). It knows where the doors
    are, but not where it is. A sideways sensor reports "door" or "wall"; it misses a door with probability 1 − hit rate
    and sees a door in a plain wall with the false-alarm rate. The lower chart is the robot's belief: the probability
    that it is in each 25 cm cell. Changing a slider or the seed replays the same actions. <strong>
      What to look for:
    </strong>
    a move shifts the belief 1 m to the right and blurs it; a reading multiplies it by the likelihood, so cells that agree
    with the reading grow and the rest shrink. After two doors 3 m apart, exactly two hypotheses survive.
  {/snippet}
</WidgetFrame>

<style>
  .wall {
    stroke: var(--c-fg);
    stroke-width: 3;
    stroke-linecap: butt;
  }
  .door {
    fill: color-mix(in srgb, var(--c-muted) 25%, transparent);
    stroke: var(--c-muted);
    stroke-width: 1;
  }
  .loopend {
    stroke: var(--c-muted);
    stroke-dasharray: 3 3;
  }
  .side,
  .none,
  .ray-t {
    font-size: 11px;
    fill: var(--c-muted);
  }
  .ray-t {
    fill: var(--c-meas);
    font-weight: 600;
  }
  .ray {
    stroke: var(--c-meas);
    stroke-width: 2;
    stroke-dasharray: 5 2 1 2;
  }
  .base {
    stroke: var(--c-axis);
  }
  .lik {
    fill: none;
    stroke: var(--c-meas);
    stroke-width: 1.5;
  }
  .lik-area {
    fill: color-mix(in srgb, var(--c-meas) 22%, transparent);
  }
  .bel-area.prior {
    fill: color-mix(in srgb, var(--c-prior) 18%, transparent);
  }
  .bel-area.post {
    fill: color-mix(in srgb, var(--c-post) 22%, transparent);
  }
  .bel {
    fill: none;
  }
  .bel.prior {
    stroke: var(--c-prior);
    stroke-width: 2;
    stroke-dasharray: var(--dash-prior);
  }
  .bel.post {
    stroke: var(--c-post);
    stroke-width: var(--stroke-thick);
  }
  .before {
    fill: none;
    stroke: var(--c-odom);
    stroke-width: 1.5;
    stroke-dasharray: var(--dash-odom);
  }
  .truth {
    stroke: var(--c-truth);
    stroke-width: var(--stroke-thin);
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
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
