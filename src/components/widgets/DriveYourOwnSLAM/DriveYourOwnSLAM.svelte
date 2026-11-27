<script lang="ts">
  import { untrack } from 'svelte';
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import Robot2D from '../../primitives/Robot2D.svelte';
  import Landmark from '../../primitives/Landmark.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import Toggle from '../../primitives/Toggle.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import { createAnimationLoop } from '../../primitives/animation.svelte';
  import type { PlotContext } from '../../primitives/plot';
  import { MANUAL, MINI, autopilot, landmarks, type SlamConfig, type Snapshot } from '../../../lib/demos/mini-slam';
  import type { VelocityControl } from '../../../lib/models/unicycle';

  const L = landmarks();
  const route = autopilot();
  let loopClosure = $state<boolean>(MINI.defaults.loopClosure);
  let robust = $state<boolean>(MINI.defaults.robust);
  let ghosts = $state<number>(MINI.defaults.clutter);
  const cfg = $derived<SlamConfig>({ loopClosure, robust, clutter: ghosts, seed: MINI.defaults.seed });

  /** Every command driven so far (autopilot or manual): changing a setting replays them. */
  let driven = $state<VelocityControl[]>([]);
  let snap = $state<Snapshot | null>(null);
  let busy = $state(false);
  let worker: Worker | null = null;
  let latest = 0;
  const queue: VelocityControl[] = [];

  function post(msg: object) {
    if (!worker) return;
    latest++;
    busy = true;
    worker.postMessage({ id: latest, ...msg });
  }
  function restart() {
    queue.length = 0;
    post({ cfg: $state.snapshot(cfg), replay: $state.snapshot(driven) });
  }
  $effect(() => {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<{ id: number; snap: Snapshot }>) => {
      if (e.data.id !== latest) return;
      snap = e.data.snap;
      busy = false;
      const next = queue.shift();
      if (next) post({ step: next });
    };
    worker = w;
    untrack(restart);
    return () => {
      w.terminate();
      worker = null;
    };
  });
  let first = true;
  $effect(() => {
    void cfg;
    if (first) {
      first = false;
      return;
    }
    untrack(restart);
  });

  function drive(u: VelocityControl) {
    driven = [...driven, u];
    if (busy) queue.push(u);
    else post({ step: u });
  }
  const loop = createAnimationLoop(
    () => {
      if (busy) return true;
      const k = driven.length;
      if (k >= route.length) return false;
      drive(route[k]!);
      return k + 1 < route.length;
    },
    { fps: 8 },
  );
  function reset() {
    loop.pause();
    loopClosure = MINI.defaults.loopClosure;
    robust = MINI.defaults.robust;
    ghosts = MINI.defaults.clutter;
    driven = [];
    restart();
  }
  function onkey(e: KeyboardEvent) {
    const m: Record<string, VelocityControl | undefined> = {
      ArrowUp: MANUAL.forward,
      ArrowLeft: MANUAL.left,
      ArrowRight: MANUAL.right,
    };
    const u = m[e.key];
    if (!u) return;
    e.preventDefault();
    loop.pause();
    drive(u);
  }
  const W = [-15, 15] as [number, number];
  const H = [-11, 11] as [number, number];
  const path = (ctx: PlotContext, xy: Float64Array) => {
    let s = '';
    for (let i = 0; i < xy.length; i += 2)
      s += `${i ? 'L' : 'M'}${ctx.x(xy[i]!).toFixed(1)},${ctx.y(xy[i + 1]!).toFixed(1)}`;
    return s;
  };
  const dupCount = $derived(snap ? snap.map.filter((m) => m.duplicate).length : 0);
  const live = $derived(
    snap
      ? `Step ${snap.step}. Position error ${snap.latestError.toFixed(2)} metres now, ${snap.rms.toFixed(2)} on average. ${snap.map.length} landmarks mapped for ${L.length} real ones; ${snap.closures} loop closures.`
      : 'Starting.',
  );
</script>

<WidgetFrame
  name="DriveYourOwnSLAM"
  title="Drive your own SLAM"
  description="A complete small SLAM system. Drive the robot with the arrow keys or the buttons, or press Autopilot. It reads landmarks within 5 metres; the front end pairs each reading with a mapped landmark or starts a new one, and the back end re-optimizes the factor graph after every step. Switches turn off loop closure or the robust kernel."
  {live}
  onreset={reset}
  attach={loop.observe}
>
  {#snippet figure()}
    <!-- The map is a keyboard-driven control surface (arrow keys steer), so it is focusable and handles keys. -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="drive"
      role="application"
      aria-label="Driving area: arrow keys drive the robot"
      tabindex="0"
      onkeydown={onkey}
    >
      <Plot2D
        xDomain={W}
        yDomain={H}
        equalAspect
        maxHeight={440}
        margin={{ top: 8, right: 12, bottom: 30, left: 36 }}
        label="True and estimated paths and landmarks"
      >
        {#snippet children(ctx)}
          <Axes {ctx} xTicks={6} yTicks={5} xLabel="x (m)" yLabel="y (m)" />
          <g clip-path="url(#{ctx.uid}-clip)">
            {#each L as m, i (i)}
              <Landmark {ctx} x={m[0]} y={m[1]} size={8} />
            {/each}
            {#if snap}
              <path class="tpath" d={path(ctx, snap.truth)} />
              <path class="epath" d={path(ctx, snap.estimate)} />
              {#each snap.map as m, i (i)}
                <circle
                  class={m.duplicate ? 'lm dup' : 'lm'}
                  cx={ctx.x(m.x)}
                  cy={ctx.y(m.y)}
                  r={m.duplicate ? 4 : 3.2}
                />
              {/each}
              {#each snap.latest as r, i (i)}
                <line
                  class={r.ghost ? 'rd ghost' : r.closure ? 'rd closure' : 'rd'}
                  x1={ctx.x(snap.robotEst[0])}
                  y1={ctx.y(snap.robotEst[1])}
                  x2={ctx.x(r.to[0])}
                  y2={ctx.y(r.to[1])}
                />
              {/each}
              <Robot2D
                {ctx}
                x={snap.robotTrue[0]}
                y={snap.robotTrue[1]}
                theta={snap.robotTrue[2]}
                kind="truth"
                size={16}
              />
              <Robot2D {ctx} x={snap.robotEst[0]} y={snap.robotEst[1]} theta={snap.robotEst[2]} kind="post" size={16} />
            {/if}
          </g>
        {/snippet}
      </Plot2D>
    </div>
    <Legend
      items={[
        { kind: 'truth', label: 'true path, robot and landmarks (□)' },
        { kind: 'post', label: 'estimated path, robot and map (●)' },
        { kind: 'meas', label: 'readings paired now (thicker: loop closure)' },
        { kind: 'bad', label: 'ghost reading paired; duplicate landmark' },
      ]}
    />
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Steps driven</dt>
      <dd data-readout="step">{snap?.step ?? 0}{busy ? ' …' : ''}</dd>
      <dt>Position error now / average</dt>
      <dd data-readout="err">{snap ? `${snap.latestError.toFixed(2)} / ${snap.rms.toFixed(2)} m` : '…'}</dd>
      <dt>Landmarks mapped ({L.length} real)</dt>
      <dd data-readout="map">{snap?.map.length ?? 0}</dd>
      <dt>…of which duplicates</dt>
      <dd data-readout="dups">{dupCount}</dd>
      <dt>Loop closures</dt>
      <dd data-readout="closures">{snap?.closures ?? 0}</dd>
      <dt>Wrong pairings (ghosts included)</dt>
      <dd data-readout="wrong">{snap?.wrongPairings ?? 0}</dd>
    </dl>
  {/snippet}

  {#snippet controls()}
    <div class="pad" role="group" aria-label="Drive">
      <button type="button" class="btn" data-action="left" onclick={() => (loop.pause(), drive(MANUAL.left))}>
        ↰ Left
      </button>
      <button type="button" class="btn" data-action="forward" onclick={() => (loop.pause(), drive(MANUAL.forward))}>
        ↑ Forward
      </button>
      <button type="button" class="btn" data-action="right" onclick={() => (loop.pause(), drive(MANUAL.right))}>
        ↱ Right
      </button>
    </div>
    <button type="button" class="btn primary" data-action="autopilot" onclick={() => loop.toggle()}>
      {loop.playing ? 'Pause autopilot' : driven.length >= route.length ? 'Autopilot finished' : 'Autopilot (two laps)'}
    </button>
    <button
      type="button"
      class="btn"
      data-action="full"
      onclick={() => {
        loop.pause();
        driven = [...route];
        restart();
      }}
    >
      Drive the whole route now
    </button>
    <Toggle label="Recognize old landmarks (loop closure)" bind:checked={loopClosure} />
    <Toggle label="Robust kernel (Cauchy) on readings" bind:checked={robust} />
    <Slider
      label="Ghost readings per step"
      min={0}
      max={1}
      step={0.1}
      bind:value={ghosts}
      format={(v) => v.toFixed(1)}
    />
  {/snippet}

  {#snippet caption()}
    Click the map (or tab to it) and drive with ↑, ← and →, or let the autopilot drive two laps of a block. The robot
    sees the landmarks (□) within 5 m; ghost readings are reflections that appear up to a metre from a real landmark.
    Changing a switch replays the same drive with the new setting. <strong>What to look for:</strong> with everything on,
    the estimate stays on the true path and each landmark is mapped once; without loop closure the second lap maps the landmarks
    again beside the first copies and the error grows; without the robust kernel, ghost readings pull the map out of shape.
  {/snippet}
</WidgetFrame>

<style>
  .drive {
    border-radius: var(--radius);
  }
  .drive:focus-visible {
    outline: 2px solid var(--c-focus);
    outline-offset: 2px;
  }
  .tpath {
    fill: none;
    stroke: var(--c-truth);
    stroke-width: var(--stroke-thin);
  }
  .epath {
    fill: none;
    stroke: var(--c-post);
    stroke-width: 2;
  }
  .lm {
    fill: var(--c-post);
  }
  .lm.dup {
    fill: var(--c-bad);
  }
  .rd {
    stroke: var(--c-meas);
    stroke-width: 1.25;
    stroke-dasharray: var(--dash-meas);
  }
  .rd.closure {
    stroke-width: 2.5;
  }
  .rd.ghost {
    stroke: var(--c-bad);
  }
  .pad {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
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
