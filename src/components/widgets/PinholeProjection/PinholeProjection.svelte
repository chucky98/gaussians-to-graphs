<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import Handle from '../../primitives/Handle.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import Toggle from '../../primitives/Toggle.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import { BA } from '../../../lib/demos/bundle';
  import { projectCamera } from '../../../lib/models/pinhole';

  const D = { f: 400, X: 0.8, Y: -0.5, Z: 4 };
  let f = $state(D.f);
  let X = $state(D.X);
  let Y = $state(D.Y);
  let Z = $state(D.Z);
  let showRay = $state(true);

  const K = $derived({ fx: f, fy: f, cx: BA.K.cx, cy: BA.K.cy });
  const uv = $derived(projectCamera(K, Float64Array.of(X, Y, Z)));
  const inImage = $derived(uv[0]! >= 0 && uv[0]! <= BA.width && uv[1]! >= 0 && uv[1]! <= BA.height);
  /** The image plane drawn at depth f / 100 m in the top view (a scaled picture of the focal length). */
  const zImg = $derived(f / 200);
  function reset() {
    ({ f, X, Y, Z } = D);
    showRay = true;
  }
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const px = (v: number) => v.toFixed(1);
  const live = $derived(
    `Point at x ${X.toFixed(2)}, y ${Y.toFixed(2)}, depth ${Z.toFixed(2)} metres projects to pixel u ${px(uv[0]!)}, v ${px(uv[1]!)}.`,
  );
</script>

<WidgetFrame
  name="PinholeProjection"
  title="The pinhole camera"
  description="Left: a top view of a camera at the origin looking along z, its image plane and a 3D point; the ray from the point to the camera centre crosses the image plane where the point appears. Right: the camera's 640 by 480 pixel image with the projected point."
  {live}
  onreset={reset}
>
  {#snippet figure()}
    <div class="pair">
      <div>
        <p class="ptitle">Top view (x right, z forward)</p>
        <Plot2D
          xDomain={[-3, 3]}
          yDomain={[-0.5, 9]}
          equalAspect
          maxHeight={330}
          margin={{ top: 8, right: 8, bottom: 30, left: 32 }}
          label="Top view of the camera, its image plane and the point"
        >
          {#snippet children(ctx)}
            <Axes {ctx} xTicks={6} yTicks={5} xLabel="x (m)" yLabel="z (m)" />
            <g clip-path="url(#{ctx.uid}-clip)">
              <!-- field of view -->
              <path
                class="fov"
                d="M{ctx.x(0)},{ctx.y(0)}L{ctx.x((-BA.K.cx / f) * 9)},{ctx.y(9)}M{ctx.x(0)},{ctx.y(0)}L{ctx.x(
                  ((BA.width - BA.K.cx) / f) * 9,
                )},{ctx.y(9)}"
              />
              <line
                class="plane"
                x1={ctx.x((-BA.K.cx / f) * zImg)}
                x2={ctx.x(((BA.width - BA.K.cx) / f) * zImg)}
                y1={ctx.y(zImg)}
                y2={ctx.y(zImg)}
              />
              {#if showRay}
                <line class="ray" x1={ctx.x(0)} y1={ctx.y(0)} x2={ctx.x((X / Z) * 9)} y2={ctx.y(9)} />
                {#each [0.5, 2] as s (s)}
                  <circle class="ghost" cx={ctx.x(X * s)} cy={ctx.y(Z * s)} r="4" />
                {/each}
              {/if}
              <circle class="hit" cx={ctx.x((X / Z) * zImg)} cy={ctx.y(zImg)} r="3.5" />
              <path
                class="cam"
                d="M{ctx.x(0) - 8},{ctx.y(0) + 6}L{ctx.x(0) + 8},{ctx.y(0) + 6}L{ctx.x(0)},{ctx.y(0) - 6}Z"
              />
            </g>
            <Handle
              cx={ctx.x(X)}
              cy={ctx.y(Z)}
              label="3D point (drag, or use the arrow keys): x sideways, z depth"
              valuetext={`x ${X.toFixed(2)} metres, depth ${Z.toFixed(2)} metres`}
              valuenow={r2(Z)}
              valuemin={1}
              valuemax={9}
              onmove={(e) => {
                const [x, z] = ctx.toData(e);
                X = r2(clamp(x, -3, 3));
                Z = r2(clamp(z, 1, 9));
              }}
              onkey={([dx, dy]) => {
                X = r2(clamp(X + 0.1 * dx, -3, 3));
                Z = r2(clamp(Z + 0.1 * dy, 1, 9));
              }}
            />
          {/snippet}
        </Plot2D>
      </div>
      <div>
        <p class="ptitle">Image (pixels)</p>
        <Plot2D
          xDomain={[0, BA.width]}
          yDomain={[0, BA.height]}
          equalAspect
          maxHeight={240}
          margin={{ top: 8, right: 8, bottom: 30, left: 40 }}
          label="The image with the projected point at u {px(uv[0]!)}, v {px(uv[1]!)}"
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
            <path
              class="pp"
              d="M{ctx.x(BA.K.cx) - 5},{ctx.y(BA.height - BA.K.cy)}h10M{ctx.x(BA.K.cx)},{ctx.y(BA.height - BA.K.cy) -
                5}v10"
            />
            {#if inImage}
              <circle class="hit" cx={ctx.x(uv[0]!)} cy={ctx.y(BA.height - uv[1]!)} r="5" />
            {/if}
          {/snippet}
        </Plot2D>
        <p class="note">{inImage ? '' : 'The point is outside the image.'}</p>
      </div>
    </div>
    <Legend
      items={[
        { kind: 'truth', label: 'camera and field of view' },
        { kind: 'post', label: 'the point and its image (●)' },
        { kind: 'prior', label: 'image plane (top view), principal point (+)' },
        ...(showRay ? [{ kind: 'sample' as const, label: 'same ray: half and twice as far (○)' }] : []),
      ]}
    />
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Camera coordinates (x, y, z)</dt>
      <dd data-readout="pc">({X.toFixed(2)}, {Y.toFixed(2)}, {Z.toFixed(2)}) m</dd>
      <dt>Pixel (u, v)</dt>
      <dd data-readout="uv">({px(uv[0]!)}, {px(uv[1]!)})</dd>
      <dt>Offset from the centre</dt>
      <dd data-readout="offset">{px(uv[0]! - BA.K.cx)} px = f·x/z</dd>
    </dl>
  {/snippet}

  {#snippet controls()}
    <Slider label="Focal length f" min={200} max={800} step={10} bind:value={f} format={(v) => String(v)} unit="px" />
    <Slider label="Point depth z" min={1} max={9} step={0.05} bind:value={Z} format={(v) => v.toFixed(2)} unit="m" />
    <Slider label="Point x (right)" min={-3} max={3} step={0.05} bind:value={X} format={(v) => v.toFixed(2)} unit="m" />
    <Slider label="Point y (down)" min={-2} max={2} step={0.05} bind:value={Y} format={(v) => v.toFixed(2)} unit="m" />
    <Toggle label="Show the ray through the point" bind:checked={showRay} />
  {/snippet}

  {#snippet caption()}
    The camera sits at the origin and looks along z; the image is 640 × 480 pixels with its principal point at the
    centre (+). In the top view the image plane is drawn at a depth proportional to f. <strong>
      What to look for:
    </strong> the pixel depends only on the direction of the point, x/z and y/z: points at half or twice the distance along
    the same ray land on the same pixel, so one image cannot tell how far away anything is, and a longer focal length spreads
    the same directions over more pixels.
  {/snippet}
</WidgetFrame>

<style>
  .pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
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
  .fov {
    stroke: var(--c-truth);
    stroke-width: 1;
    fill: none;
    opacity: 0.5;
  }
  .plane {
    stroke: var(--c-prior);
    stroke-width: 2.5;
    stroke-dasharray: var(--dash-prior);
  }
  .ray {
    stroke: var(--c-sample);
    stroke-width: 1.25;
    stroke-dasharray: 4 3;
  }
  .ghost {
    fill: var(--c-bg);
    stroke: var(--c-sample);
    stroke-width: 1.5;
  }
  .hit {
    fill: var(--c-post);
  }
  .cam {
    fill: var(--c-truth);
  }
  .frame {
    fill: var(--c-surface);
    stroke: var(--c-axis);
  }
  .pp {
    stroke: var(--c-prior);
    stroke-width: 1.5;
  }
  .note {
    margin: 0.2rem 0 0;
    min-height: 1em;
    font-size: 0.78rem;
    color: var(--c-muted);
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
