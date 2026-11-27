<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import CovEllipse from '../../primitives/CovEllipse.svelte';
  import Robot2D from '../../primitives/Robot2D.svelte';
  import Landmark from '../../primitives/Landmark.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import Toggle from '../../primitives/Toggle.svelte';
  import PlayControls from '../../primitives/PlayControls.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import { createAnimationLoop } from '../../primitives/animation.svelte';
  import { CORR, closureStep, corrRun, snapshot } from '../../../lib/demos/correlations';

  const r = corrRun();
  const kc = closureStep(r);
  const N = CORR.world.steps;
  let k = $state(60);
  let robotLinks = $state(true);
  let mapLinks = $state(true);

  const s = $derived(snapshot(r, k));
  const pos = (slot: number): [number, number] =>
    slot < 0 ? [s.state.x[0]!, s.state.x[1]!] : [s.state.x[3 + 2 * slot]!, s.state.x[4 + 2 * slot]!];
  const truth = $derived(k === 0 ? r.run.start : r.run.truths[k - 1]!);
  const seen = $derived(r.steps[k]!.seen);
  const strongest = $derived(
    s.links
      .filter((l) => l.a >= 0)
      .reduce<{ a: number; b: number; rho: number } | null>((m, l) => (!m || l.rho > m.rho ? l : m), null),
  );

  const loop = createAnimationLoop(
    () => {
      k = Math.min(N, k + 1);
      return k < N;
    },
    { fps: 8 },
  );
  function togglePlay() {
    if (!loop.playing && k >= N) k = 0;
    loop.toggle();
  }
  function reset() {
    loop.pause();
    k = 60;
    robotLinks = true;
    mapLinks = true;
  }
  const f2 = (v: number) => v.toFixed(2);
  const live = $derived(
    `Step ${k}. Robot position uncertainty ${f2(s.robotSd)} metres; ${s.landmarks.length} landmarks mapped, ` +
      `average uncertainty ${f2(s.meanLandmarkSd)} metres.`,
  );
  const W = 7;
</script>

<WidgetFrame
  name="CorrelationsEmerge"
  title="Correlations emerge: one Gaussian over robot and map"
  description="A robot drives laps of a circle and maps six landmarks with EKF-SLAM. Its estimate of itself and of every landmark is drawn with a 95% ellipse; grey lines join pairs of estimates whose errors are correlated, thicker for stronger correlation."
  {live}
  onreset={reset}
  attach={loop.observe}
>
  {#snippet figure()}
    <Plot2D
      xDomain={[-W, W]}
      yDomain={[-W, W]}
      equalAspect
      maxHeight={440}
      margin={{ top: 8, right: 12, bottom: 30, left: 36 }}
      label="Robot and landmark estimates with 95% ellipses and correlation links"
    >
      {#snippet children(ctx)}
        <Axes {ctx} xTicks={7} yTicks={7} xLabel="x (m)" yLabel="y (m)" />
        <g clip-path="url(#{ctx.uid}-clip)">
          <circle class="plan" cx={ctx.x(0)} cy={ctx.y(0)} r={ctx.x(CORR.world.radius) - ctx.x(0)} />
          {#each s.links as l (l.a + ',' + l.b)}
            {#if l.rho >= CORR.minLink && ((l.a < 0 && robotLinks) || (l.a >= 0 && mapLinks))}
              {@const p = pos(l.a)}
              {@const q = pos(l.b)}
              <line
                class="link"
                x1={ctx.x(p[0])}
                y1={ctx.y(p[1])}
                x2={ctx.x(q[0])}
                y2={ctx.y(q[1])}
                stroke-width={0.5 + 5 * l.rho * l.rho}
                stroke-opacity={0.25 + 0.6 * l.rho}
              />
            {/if}
          {/each}
          {#each seen as id (id)}
            {@const m = CORR.world.landmarks[id]!}
            <line class="ray" x1={ctx.x(truth[0]!)} y1={ctx.y(truth[1]!)} x2={ctx.x(m[0])} y2={ctx.y(m[1])} />
          {/each}
          {#each CORR.world.landmarks as m, i (i)}
            <Landmark {ctx} x={m[0]} y={m[1]} label={String(i)} />
          {/each}
          {#each s.landmarks as l (l.id)}
            <CovEllipse {ctx} mean={l.mean} cov={l.cov} kind="post" />
            <circle class="est" cx={ctx.x(l.mean[0])} cy={ctx.y(l.mean[1])} r="3" />
          {/each}
          <CovEllipse {ctx} mean={pos(-1)} cov={s.robotCov} kind="post" />
          <Robot2D {ctx} x={truth[0]!} y={truth[1]!} theta={truth[2]!} kind="truth" size={16} />
          <Robot2D {ctx} x={s.state.x[0]!} y={s.state.x[1]!} theta={s.state.x[2]!} kind="post" size={16} />
        </g>
      {/snippet}
    </Plot2D>
    <Legend
      items={[
        { kind: 'truth', label: 'true robot and landmarks (□)' },
        { kind: 'post', label: 'EKF-SLAM estimates, 95% ellipses' },
        { kind: 'meas', label: 'readings at this step' },
      ]}
    />
    <p class="key"><span class="sw"></span> grey lines: correlated errors; thicker means stronger</p>
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Step</dt>
      <dd data-readout="k">{k}</dd>
      <dt>Robot position (√(σx² + σy²))</dt>
      <dd data-readout="robot">{f2(s.robotSd)} m</dd>
      <dt>Landmarks mapped</dt>
      <dd data-readout="count">{s.landmarks.length}</dd>
      <dt>Landmarks, average</dt>
      <dd data-readout="map">{s.landmarks.length ? `${f2(s.meanLandmarkSd)} m` : '—'}</dd>
      <dt>Strongest landmark link</dt>
      <dd data-readout="strongest">
        {strongest ? `${s.state.ids[strongest.a]} – ${s.state.ids[strongest.b]}: ${f2(strongest.rho)}` : '—'}
      </dd>
    </dl>
  {/snippet}

  {#snippet controls()}
    <PlayControls playing={loop.playing} ontoggle={togglePlay} onstep={() => (k = k >= N ? 0 : k + 1)} what="steps" />
    <Slider
      label="Step"
      min={0}
      max={N}
      step={1}
      bind:value={k}
      format={(v) => String(v)}
      oninput={() => loop.pause()}
    />
    <button
      type="button"
      class="btn"
      data-action="closure"
      onclick={() => {
        loop.pause();
        k = kc - 1;
      }}
    >
      Go to just before the loop closure
    </button>
    <Toggle label="Show robot–landmark links" bind:checked={robotLinks} />
    <Toggle label="Show landmark–landmark links" bind:checked={mapLinks} />
  {/snippet}

  {#snippet caption()}
    The robot (dark outline: true pose; green: estimate) starts at a known pose and drives counter-clockwise around the
    dashed circle, reading landmarks within 2.5 m. All ellipses are 95% regions. A grey line joins two estimates whose
    errors are correlated (largest canonical correlation above {CORR.minLink}). <strong>What to look for:</strong> each
    new landmark is born strongly correlated with the robot, so landmarks seen from nearby poses end up correlated with
    each other; when the robot sees landmark 0 again (step {kc}), its own ellipse collapses and, through the links,
    every landmark's ellipse shrinks with it.
  {/snippet}
</WidgetFrame>

<style>
  .plan {
    fill: none;
    stroke: var(--c-grid);
    stroke-width: 1.5;
    stroke-dasharray: 5 5;
  }
  .link {
    stroke: var(--c-muted);
    stroke-linecap: round;
  }
  .ray {
    stroke: var(--c-meas);
    stroke-width: 1.25;
    stroke-dasharray: var(--dash-meas);
  }
  .est {
    fill: var(--c-post);
  }
  .key {
    margin: 0.25rem 0 0;
    font-size: 0.8rem;
    color: var(--c-muted);
  }
  .sw {
    display: inline-block;
    width: 24px;
    height: 4px;
    vertical-align: middle;
    background: var(--c-muted);
    border-radius: 2px;
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
