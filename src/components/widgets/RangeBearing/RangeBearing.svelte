<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import PointsCanvas from '../../primitives/PointsCanvas.svelte';
  import Robot2D from '../../primitives/Robot2D.svelte';
  import Landmark from '../../primitives/Landmark.svelte';
  import Handle from '../../primitives/Handle.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import Select from '../../primitives/Select.svelte';
  import Toggle from '../../primitives/Toggle.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import type { PlotContext } from '../../primitives/plot';
  import {
    LOBBY,
    SENSOR_DEFAULTS as D,
    SENSOR_LIMITS as L,
    deg,
    readingSamples,
    sightings,
    spread,
    wedge,
  } from '../../../lib/demos/range-bearing';
  import { vec } from '../../../lib/math/matrix';
  import { wrapAngle } from '../../../lib/geometry/so2';

  let rx = $state<number>(LOBBY.robot[0]);
  let ry = $state<number>(LOBBY.robot[1]);
  let th = $state<number>(LOBBY.robot[2]);
  let sigmaR = $state<number>(D.sigmaR);
  let sigmaPhiDeg = $state<number>(D.sigmaPhiDeg);
  let maxRange = $state<number>(D.maxRange);
  let showSamples = $state(true);
  let selected = $state<number>(2);

  const pose = $derived(vec([rx, ry, th]));
  const params = $derived({ sigmaR, sigmaPhiDeg, maxRange });
  const seen = $derived(sightings(pose, params));
  const pts = $derived(readingSamples(pose, seen, params));
  const sel = $derived(seen.find((s) => s.index === selected) ?? null);

  function reset() {
    rx = LOBBY.robot[0];
    ry = LOBBY.robot[1];
    th = LOBBY.robot[2];
    sigmaR = D.sigmaR;
    sigmaPhiDeg = D.sigmaPhiDeg;
    maxRange = D.maxRange;
    showSamples = true;
    selected = 2;
  }
  const A = LOBBY.area;
  const clampX = (x: number) => Math.min(A.x[1] - 0.2, Math.max(A.x[0] + 0.2, x));
  const clampY = (y: number) => Math.min(A.y[1] - 0.2, Math.max(A.y[0] + 0.2, y));
  const poly = (ctx: PlotContext, q: [number, number][]) =>
    'M' + q.map(([a, b]) => `${ctx.x(a).toFixed(1)},${ctx.y(b).toFixed(1)}`).join('L') + 'Z';
  const f2 = (v: number) => v.toFixed(2);
  const f3 = (v: number) => (Math.abs(v) < 5e-4 ? '0.000' : v.toFixed(3));
  const degText = (r: number) => `${(r / deg).toFixed(1)}°`;
  const live = $derived(
    `Robot at ${f2(rx)}, ${f2(ry)}, heading ${degText(th)}. Sees ${seen.length} markers: ` +
      seen.map((s) => `marker ${s.index + 1} at range ${f2(s.z[0]!)} m, bearing ${degText(s.z[1]!)}`).join('; ') +
      '.',
  );
</script>

<WidgetFrame
  name="RangeBearing"
  title="What a range–bearing sensor sees"
  description="A robot in a lobby with five reflective markers. For every marker within range, a ray shows the measured range and bearing, with its 95% noise region; dots show where repeated noisy readings would place the marker. Drag the robot or its heading handle."
  {live}
  onreset={reset}
>
  {#snippet figure()}
    <Plot2D
      xDomain={A.x}
      yDomain={A.y}
      equalAspect
      maxHeight={420}
      margin={{ top: 8, right: 12, bottom: 32, left: 36 }}
      label="Lobby floor plan with markers, sensor rays and noise regions"
    >
      {#snippet underlay(ctx)}
        {#if showSamples}<PointsCanvas {ctx} points={pts} radius={1.4} opacity={0.5} />{/if}
      {/snippet}
      {#snippet children(ctx)}
        <Axes {ctx} xTicks={6} yTicks={4} xLabel="x (m)" yLabel="y (m)" />
        <g clip-path="url(#{ctx.uid}-clip)">
          <circle class="range" cx={ctx.x(rx)} cy={ctx.y(ry)} r={Math.abs(ctx.x(rx + maxRange) - ctx.x(rx))} />
          {#each seen as s (s.index)}
            <line
              class="ray"
              class:sel={s.index === selected}
              x1={ctx.x(rx)}
              y1={ctx.y(ry)}
              x2={ctx.x(s.m[0]!)}
              y2={ctx.y(s.m[1]!)}
            />
            <path class="wedge" d={poly(ctx, wedge(pose, s.z, params))} />
          {/each}
        </g>
        {#each LOBBY.landmarks as [lx, ly], i (i)}
          <g class:far={!seen.some((s) => s.index === i)}>
            <Landmark {ctx} x={lx} y={ly} label={String(i + 1)} />
          </g>
        {/each}
        <Robot2D {ctx} x={rx} y={ry} theta={th} kind="truth" size={20} />
        <Handle
          cx={ctx.x(rx)}
          cy={ctx.y(ry)}
          label="Robot position (drag, or use the arrow keys)"
          valuetext={`x ${f2(rx)} metres, y ${f2(ry)} metres`}
          valuenow={+f2(rx)}
          valuemin={A.x[0]}
          valuemax={A.x[1]}
          onmove={(e) => {
            const [x, y] = ctx.toData(e);
            rx = clampX(x);
            ry = clampY(y);
          }}
          onkey={([dx, dy]) => {
            rx = clampX(rx + 0.1 * dx);
            ry = clampY(ry + 0.1 * dy);
          }}
        />
        <Handle
          cx={ctx.x(rx + Math.cos(th))}
          cy={ctx.y(ry + Math.sin(th))}
          kind="prior"
          label="Robot heading (drag around the robot, or use the arrow keys)"
          valuetext={`heading ${degText(th)}`}
          valuenow={+(th / deg).toFixed(0)}
          valuemin={-180}
          valuemax={180}
          onmove={(e) => {
            const [x, y] = ctx.toData(e);
            th = Math.atan2(y - ry, x - rx);
          }}
          onkey={([dx, dy]) => (th = wrapAngle(th + 5 * deg * (dx || dy)))}
        />
      {/snippet}
    </Plot2D>
    <Legend
      items={[
        { kind: 'meas', label: 'range–bearing ray and its 95% region' },
        { kind: 'sample', label: `where ${LOBBY.samplesPerLandmark} noisy readings put each marker` },
        { kind: 'truth', label: 'robot (drag it; outer handle sets the heading)' },
      ]}
    />
  {/snippet}

  {#snippet readouts()}
    <table class="tbl" data-readout="table">
      <caption class="visually-hidden">Range and bearing of each marker in range</caption>
      <thead>
        <tr>
          <th scope="col">Marker</th><th scope="col">r (m)</th><th scope="col">φ</th><th scope="col">± across</th>
        </tr>
      </thead>
      <tbody>
        {#each seen as s (s.index)}
          <tr class:sel={s.index === selected}>
            <th scope="row">{s.index + 1}</th>
            <td>{f2(s.z[0]!)}</td>
            <td>{degText(s.z[1]!)}</td>
            <td>{f2(spread(s.z, params).lateral)} m</td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if sel}
      <p class="hlabel">Jacobian ∂(r, φ)/∂(x, y, θ) for marker {sel.index + 1}</p>
      <div class="mat" data-readout="jacobian" role="table" aria-label="Jacobian with respect to the robot pose">
        {#each [0, 1] as i (i)}
          <div role="row" class="row">
            {#each [0, 1, 2] as j (j)}<span role="cell">{f3(sel.Hx.data[i * 3 + j]!)}</span>{/each}
          </div>
        {/each}
      </div>
    {:else}
      <p class="hlabel">Marker {selected + 1} is out of range.</p>
    {/if}
  {/snippet}

  {#snippet controls()}
    <Select
      label="Show the Jacobian for"
      value={String(selected)}
      options={LOBBY.landmarks.map((_, i) => ({ value: String(i), label: `Marker ${i + 1}` }))}
      onchange={(v) => (selected = Number(v))}
    />
    <Slider
      label="Range noise σr"
      min={L.sigmaR.min}
      max={L.sigmaR.max}
      step={L.sigmaR.step}
      bind:value={sigmaR}
      unit="m"
    />
    <Slider
      label="Bearing noise σφ"
      min={L.sigmaPhiDeg.min}
      max={L.sigmaPhiDeg.max}
      step={L.sigmaPhiDeg.step}
      bind:value={sigmaPhiDeg}
      format={(v) => `${v.toFixed(1)}°`}
    />
    <Slider
      label="Maximum range"
      min={L.maxRange.min}
      max={L.maxRange.max}
      step={L.maxRange.step}
      bind:value={maxRange}
      format={(v) => v.toFixed(1)}
      unit="m"
    />
    <Toggle label="Show sampled readings" bind:checked={showSamples} />
  {/snippet}

  {#snippet caption()}
    The robot's lidar reports the range r and bearing φ (measured from its heading) of each marker within the maximum
    range, with noise σr and σφ. Each shaded region is the 95% region of a reading (the 95% ellipse of (r, φ), drawn on
    the floor); the dots are where repeated noisy readings would place the marker. The table's last column is the
    half-width of the 95% interval across the ray, 1.96 r σφ. <strong>What to look for:</strong> range noise is the same at
    every distance, but bearing noise is an angle, so its effect grows with distance: far markers are smeared sideways into
    thin arcs.
  {/snippet}
</WidgetFrame>

<style>
  .range {
    fill: none;
    stroke: var(--c-muted);
    stroke-dasharray: 4 4;
  }
  .ray {
    stroke: var(--c-meas);
    stroke-width: 1.5;
    stroke-dasharray: 8 3 2 3;
  }
  .ray.sel {
    stroke-width: 2.5;
  }
  .wedge {
    fill: color-mix(in srgb, var(--c-meas) 25%, transparent);
    stroke: var(--c-meas);
    stroke-width: 1;
  }
  .far {
    opacity: 0.4;
  }
  .tbl {
    width: 100%;
    font-size: 0.82rem;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  .tbl th,
  .tbl td {
    padding: 0.15rem 0.3rem;
    text-align: right;
  }
  .tbl thead th {
    color: var(--c-muted);
    font-weight: 500;
  }
  .tbl tr.sel {
    background: var(--c-surface);
  }
  .hlabel {
    font-size: 0.8rem;
    color: var(--c-muted);
    margin: var(--space-2) 0 0.2rem;
  }
  .mat {
    display: grid;
    gap: 0.1rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    border-left: 2px solid var(--c-border);
    border-right: 2px solid var(--c-border);
    padding: 0.1rem 0.4rem;
  }
  .mat .row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.6rem;
    text-align: right;
  }
</style>
