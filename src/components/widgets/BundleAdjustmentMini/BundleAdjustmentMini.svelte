<script lang="ts">
  import { T } from '@threlte/core';
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import Select from '../../primitives/Select.svelte';
  import PlayControls from '../../primitives/PlayControls.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import Scene3D from '../../primitives/three/Scene3D.svelte';
  import { createAnimationLoop } from '../../primitives/animation.svelte';
  import { BA, reprojections, runBundle, sizes, trueCameras } from '../../../lib/demos/bundle';
  import { fromMatrix } from '../../../lib/geometry/quat';
  import type * as se3 from '../../../lib/geometry/se3';

  const run = runBundle();
  const N = run.iterations.length - 1;
  const truthCams = trueCameras();
  const sz = sizes();
  let k = $state(0);
  let cam = $state(1);
  let azimuth = $state(-30);

  const it = $derived(run.iterations[k]!);
  const proj = $derived(reprojections(run.values[k]!, run.problem.observations));
  const obs = $derived(run.problem.observations.map((o, i) => ({ ...o, uv: proj[i]! })).filter((o) => o.cam === cam));

  const loop = createAnimationLoop(
    () => {
      k = Math.min(N, k + 1);
      return k < N;
    },
    { fps: 1.5 },
  );
  function togglePlay() {
    if (!loop.playing && k >= N) k = 0;
    loop.toggle();
  }
  function reset() {
    loop.pause();
    k = 0;
    cam = 1;
    azimuth = -30;
  }
  const q3 = (P: se3.Pose3): [number, number, number, number] => {
    const q = fromMatrix(P.C);
    return [q[1], q[2], q[3], q[0]];
  };
  const pos = (P: se3.Pose3): [number, number, number] => [P.t[0]!, P.t[1]!, P.t[2]!];
  const live = $derived(
    `Iteration ${k} of ${N}. Reprojection error ${it.rmsPixels.toFixed(2)} pixels; points ${it.rmsPoints.toFixed(3)} metres from the truth.`,
  );
</script>

<WidgetFrame
  name="BundleAdjustmentMini"
  title="Bundle adjustment: cameras and points together"
  description="Four cameras look at ten points of a small house. Left: the cameras and points in 3D, true and estimated. Right: the image of one camera, with each observed pixel and where the current estimate projects that point; the line between them is the reprojection error. Step through the Levenberg–Marquardt iterations."
  {live}
  onreset={reset}
  attach={loop.observe}
>
  {#snippet figure()}
    <div class="pair">
      <Scene3D
        label="Cameras and points; the estimate at iteration {k}"
        bind:azimuth
        elevation={28}
        distance={12}
        aspect={0.85}
        maxHeight={360}
        tokens={['--c-post', '--c-truth', '--c-grid', '--c-meas', '--c-axis']}
      >
        {#snippet children(c)}
          <T.Mesh position={[0, 0, -0.01]}>
            <T.PlaneGeometry args={[9, 9]} />
            <T.MeshBasicMaterial color={c['--c-grid']} />
          </T.Mesh>
          {#each BA.points as p, j (j)}
            <T.Mesh position={p}>
              <T.SphereGeometry args={[0.09, 12, 8]} />
              <T.MeshBasicMaterial color={c['--c-truth']} wireframe />
            </T.Mesh>
          {/each}
          {#each it.points as p, j (j)}
            <T.Mesh position={[p[0]!, p[1]!, p[2]!]}>
              <T.SphereGeometry args={[0.07, 14, 10]} />
              <T.MeshLambertMaterial color={c['--c-post']} />
            </T.Mesh>
          {/each}
          {#each truthCams as P, i (i)}
            <T.Group position={pos(P)} quaternion={q3(P)}>
              <T.Mesh position={[0, 0, 0.25]} rotation={[-Math.PI / 2, 0, 0]}>
                <T.ConeGeometry args={[0.22, 0.5, 4, 1, true]} />
                <T.MeshBasicMaterial color={c['--c-truth']} wireframe />
              </T.Mesh>
            </T.Group>
          {/each}
          {#each it.cameras as P, i (i)}
            <T.Group position={pos(P)} quaternion={q3(P)}>
              <T.Mesh position={[0, 0, 0.25]} rotation={[-Math.PI / 2, 0, 0]}>
                <T.ConeGeometry args={[0.2, 0.5, 4]} />
                <T.MeshLambertMaterial color={i === cam ? c['--c-meas'] : c['--c-post']} />
              </T.Mesh>
            </T.Group>
          {/each}
        {/snippet}
      </Scene3D>
      <div>
        <p class="ptitle">Image of camera {cam}</p>
        <Plot2D
          xDomain={[0, BA.width]}
          yDomain={[0, BA.height]}
          equalAspect
          maxHeight={260}
          margin={{ top: 8, right: 8, bottom: 30, left: 40 }}
          label="Observed pixels and reprojections in camera {cam}"
        >
          {#snippet children(ctx)}
            <Axes {ctx} xTicks={4} yTicks={3} xLabel="u" yLabel="v" yFormat={(t) => String(BA.height - t)} />
            <rect
              class="frame"
              x={ctx.x(0)}
              y={ctx.y(BA.height)}
              width={ctx.x(BA.width) - ctx.x(0)}
              height={ctx.y(0) - ctx.y(BA.height)}
            />
            <g clip-path="url(#{ctx.uid}-clip)">
              {#each obs as o (o.point)}
                <line
                  class="res"
                  x1={ctx.x(o.z[0]!)}
                  y1={ctx.y(BA.height - o.z[1]!)}
                  x2={ctx.x(o.uv[0]!)}
                  y2={ctx.y(BA.height - o.uv[1]!)}
                />
                <path class="z" d="M{ctx.x(o.z[0]!) - 4},{ctx.y(BA.height - o.z[1]!) - 4}l8,8m0,-8l-8,8" />
                <circle class="proj" cx={ctx.x(o.uv[0]!)} cy={ctx.y(BA.height - o.uv[1]!)} r="3.5" />
              {/each}
            </g>
          {/snippet}
        </Plot2D>
      </div>
    </div>
    <Legend
      items={[
        { kind: 'truth', label: 'true cameras and points (wire)' },
        { kind: 'post', label: 'estimate; projected points (●)' },
        { kind: 'meas', label: 'observed pixels (×); camera shown in the image' },
        { kind: 'bad', label: 'reprojection error' },
      ]}
    />
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Iteration</dt>
      <dd data-readout="k">{k} of {N}</dd>
      <dt>Reprojection error (RMS)</dt>
      <dd data-readout="px">{it.rmsPixels.toFixed(2)} px</dd>
      <dt>Points from the truth (RMS)</dt>
      <dd data-readout="pts">{it.rmsPoints.toFixed(3)} m</dd>
      <dt>Unknowns / after eliminating points</dt>
      <dd data-readout="sizes">{sz.unknowns} / {sz.reduced}</dd>
    </dl>
  {/snippet}

  {#snippet controls()}
    <PlayControls
      playing={loop.playing}
      ontoggle={togglePlay}
      onstep={() => (k = k >= N ? 0 : k + 1)}
      what="iterations"
    />
    <Slider
      label="Iteration"
      min={0}
      max={N}
      step={1}
      bind:value={k}
      format={(v) => String(v)}
      oninput={() => loop.pause()}
    />
    <Select
      label="Image of camera"
      value={cam}
      options={BA.cameraAngles.map((_, i) => ({
        value: i,
        label: `camera ${i}${i === 0 ? ' (fixed)' : i === 1 ? ' (position fixed)' : ''}`,
      }))}
      onchange={(v) => (cam = v)}
    />
    <Slider label="View" min={-180} max={180} step={5} bind:value={azimuth} format={(v) => `${v}°`} />
  {/snippet}

  {#snippet caption()}
    Ten points, four cameras, forty observations with 1-pixel noise. The estimate starts with every camera (except the
    first) off by about 0.3 m and 3°, and every point off by about 0.3 m. Camera 0 and the position of camera 1 are held
    fixed to remove the gauge (position, orientation and scale). <strong>What to look for:</strong> in the image, the lines
    between observed and projected pixels collapse to the size of the pixel noise within three iterations, while the cameras
    and points in 3D move onto their true positions together.
  {/snippet}
</WidgetFrame>

<style>
  .pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--space-3);
    align-items: start;
  }
  @container (max-width: 560px) {
    .pair {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .ptitle {
    margin: 0 0 0.25rem;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .frame {
    fill: var(--c-surface);
    stroke: var(--c-axis);
  }
  .res {
    stroke: var(--c-bad);
    stroke-width: 1.5;
  }
  .z {
    stroke: var(--c-meas);
    stroke-width: 1.5;
    fill: none;
  }
  .proj {
    fill: var(--c-post);
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
