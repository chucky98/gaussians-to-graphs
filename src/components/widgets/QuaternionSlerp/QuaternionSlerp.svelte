<script lang="ts">
  import { T } from '@threlte/core';
  import {
    CatmullRomCurve3,
    InstancedMesh,
    Matrix4,
    MeshLambertMaterial,
    SphereGeometry,
    TubeGeometry,
    Vector3,
  } from 'three';
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import Select from '../../primitives/Select.svelte';
  import Toggle from '../../primitives/Toggle.svelte';
  import PlayControls from '../../primitives/PlayControls.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import Scene3D from '../../primitives/three/Scene3D.svelte';
  import { createAnimationLoop } from '../../primitives/animation.svelte';
  import { SLERP, interpPath, directAngle, type SlerpPreset, type Vec3 } from '../../../lib/demos/rotations';
  import type { Quat } from '../../../lib/geometry/quat';

  let preset = $state<SlerpPreset>('flip');
  let yaw = $state<number>(SLERP.presets.flip.b.yaw);
  let pitch = $state<number>(SLERP.presets.flip.b.pitch);
  let roll = $state<number>(SLERP.presets.flip.b.roll);
  let t = $state(0.5);
  let longWay = $state(false);
  let showSlerp = $state(true);
  let showEuler = $state(true);
  let azimuth = $state(-60);

  const a = $derived(SLERP.presets[preset].a);
  const b = $derived({ yaw, pitch, roll });
  const ps = $derived(interpPath('slerp', a, b, longWay));
  const pe = $derived(interpPath('euler', a, b));
  const n = SLERP.samples;
  const idx = $derived(Math.round(t * n));

  const loop = createAnimationLoop(
    (dt) => {
      t = Math.min(1, t + dt / 2500);
      return t < 1;
    },
    { fps: 60 },
  );
  function togglePlay() {
    if (!loop.playing && t >= 1) t = 0;
    loop.toggle();
  }
  function setPreset(p: SlerpPreset) {
    loop.pause();
    preset = p;
    ({ yaw, pitch, roll } = SLERP.presets[p].b);
    t = 0.5;
    longWay = false;
  }
  function reset() {
    setPreset('flip');
    showSlerp = true;
    showEuler = true;
    azimuth = -60;
  }

  // ------------------------------------------------------------- three.js geometry for the paths
  const v3 = (p: Vec3) => new Vector3(p[0], p[1], p[2]);
  function tube(points: Vec3[], radius: number) {
    return new TubeGeometry(new CatmullRomCurve3(points.map(v3)), 240, radius, 6, false);
  }
  const bead = new SphereGeometry(1, 8, 6);
  function beads(points: Vec3[], radius: number, color: string) {
    const every = 6;
    const count = Math.floor((points.length - 1) / every) + 1;
    const mesh = new InstancedMesh(bead, new MeshLambertMaterial({ color }), count);
    const m = new Matrix4();
    for (let i = 0; i < count; i++) {
      const p = points[i * every]!;
      m.makeScale(radius, radius, radius).setPosition(p[0], p[1], p[2]);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }
  const q3 = (q: Quat): [number, number, number, number] => [q[1], q[2], q[3], q[0]];
  const turned = (p: typeof ps) => {
    let s = 0;
    for (let i = 1; i <= idx; i++) s += angleStep(p.q[i - 1]!, p.q[i]!);
    return s;
  };
  function angleStep(p: Quat, q: Quat) {
    const d = Math.abs(p[0] * q[0] + p[1] * q[1] + p[2] * q[2] + p[3] * q[3]);
    return 2 * Math.acos(Math.min(1, d)) * (180 / Math.PI);
  }
  const deg = (v: number) => `${Math.round(v)}°`;
  const live = $derived(
    `t = ${t.toFixed(2)}. Total turning: slerp ${deg(ps.total)}, Euler-angle interpolation ${deg(pe.total)}.`,
  );
</script>

<WidgetFrame
  name="QuaternionSlerp"
  title="Slerp vs. interpolating Euler angles"
  description="A unit sphere with the paths traced by the nose and the top of an object as it turns from a start orientation to an end orientation, once by slerp (spherical linear interpolation of quaternions) and once by interpolating its three Euler angles. Small arrows show the object at the chosen moment."
  {live}
  onreset={reset}
  attach={loop.observe}
>
  {#snippet figure()}
    <Scene3D
      label="Paths of the nose and top on a unit sphere. Slerp turns {deg(
        ps.total,
      )} in all, Euler-angle interpolation {deg(pe.total)}."
      bind:azimuth
      elevation={25}
      distance={5.2}
      aspect={0.75}
      tokens={['--c-post', '--c-bad', '--c-truth', '--c-grid', '--c-axis', '--c-rot-x', '--c-rot-y', '--c-rot-z']}
    >
      {#snippet children(c)}
        <!-- The unit sphere, faint, with its equator and two meridians -->
        <T.Mesh>
          <T.SphereGeometry args={[1, 48, 32]} />
          <T.MeshBasicMaterial color={c['--c-grid']} transparent opacity={0.35} depthWrite={false} />
        </T.Mesh>
        {#each [[0, 0, 0], [Math.PI / 2, 0, 0], [0, Math.PI / 2, 0]] as r, i (i)}
          <T.Mesh rotation={r as [number, number, number]}>
            <T.TorusGeometry args={[1, 0.004, 4, 96]} />
            <T.MeshBasicMaterial color={c['--c-axis']} />
          </T.Mesh>
        {/each}
        <!-- World axes -->
        {#each [{ k: '--c-rot-x', r: [0, 0, -Math.PI / 2], p: [0.65, 0, 0] }, { k: '--c-rot-y', r: [0, 0, 0], p: [0, 0.65, 0] }, { k: '--c-rot-z', r: [Math.PI / 2, 0, 0], p: [0, 0, 0.65] }] as ax (ax.k)}
          <T.Mesh position={ax.p as [number, number, number]} rotation={ax.r as [number, number, number]}>
            <T.CylinderGeometry args={[0.008, 0.008, 1.3, 6]} />
            <T.MeshBasicMaterial color={c[ax.k]} />
          </T.Mesh>
        {/each}
        {#if showSlerp && c['--c-post']}
          <T.Mesh>
            <T is={tube(ps.nose, 0.022)} />
            <T.MeshLambertMaterial color={c['--c-post']} />
          </T.Mesh>
          <T.Mesh>
            <T is={tube(ps.top, 0.012)} />
            <T.MeshLambertMaterial color={c['--c-post']} />
          </T.Mesh>
          {@render glyph(ps.q[idx]!, c['--c-post'])}
        {/if}
        {#if showEuler && c['--c-bad']}
          <T is={beads(pe.nose, 0.03, c['--c-bad'])} />
          <T is={beads(pe.top, 0.02, c['--c-bad'])} />
          {@render glyph(pe.q[idx]!, c['--c-bad'])}
        {/if}
        <!-- Start and end: hollow markers at the nose and top tips -->
        {#each [ps.nose[0]!, ps.top[0]!, ps.nose[n]!, ps.top[n]!] as p, i (i)}
          <T.Mesh position={p}>
            <T.SphereGeometry args={[0.05, 16, 12]} />
            <T.MeshBasicMaterial color={c['--c-truth']} wireframe />
          </T.Mesh>
        {/each}
      {/snippet}
    </Scene3D>
    <Legend
      items={[
        { kind: 'post', label: 'slerp: tubes (nose thick, top thin)' },
        { kind: 'bad', label: 'Euler-angle interpolation: beads' },
        { kind: 'truth', label: 'start and end (wire balls)' },
      ]}
    />
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Direct turn, start to end</dt>
      <dd data-readout="direct">{deg(directAngle(a, b))}</dd>
      <dt>Total turning, slerp</dt>
      <dd data-readout="total-slerp">{deg(ps.total)}</dd>
      <dt>Total turning, Euler</dt>
      <dd data-readout="total-euler">{deg(pe.total)}</dd>
      <dt>So far, slerp / Euler (t = {t.toFixed(2)})</dt>
      <dd data-readout="sofar">{deg(turned(ps))} / {deg(turned(pe))}</dd>
      <dt>Turning rate, Euler</dt>
      <dd data-readout="rate-euler">
        {Math.abs(pe.rate[1] - pe.rate[0]) < 0.5 ? 'constant' : `${deg(pe.rate[0])} – ${deg(pe.rate[1])}`}
      </dd>
    </dl>
  {/snippet}

  {#snippet controls()}
    <PlayControls
      playing={loop.playing}
      ontoggle={togglePlay}
      onstep={() => (t = t >= 1 ? 0 : Math.min(1, Math.round(t * 20 + 1) / 20))}
      what="turn"
    />
    <Slider label="Progress t" min={0} max={1} step={0.01} bind:value={t} oninput={() => loop.pause()} />
    <Select
      label="Preset"
      value={preset}
      options={[
        { value: 'flip', label: 'Half turn: yaw and roll 180°' },
        { value: 'wrap', label: 'Yaw from 170° to −170°' },
        { value: 'small', label: 'A small turn' },
      ]}
      onchange={(v) => setPreset(v)}
    />
    <Slider label="End yaw ψ" min={-180} max={180} step={1} bind:value={yaw} format={deg} />
    <Slider label="End pitch θ" min={-90} max={90} step={1} bind:value={pitch} format={deg} />
    <Slider label="End roll φ" min={-180} max={180} step={1} bind:value={roll} format={deg} />
    <Toggle label="Slerp the long way (ignore the sign of q)" bind:checked={longWay} />
    <Toggle label="Show slerp" bind:checked={showSlerp} />
    <Toggle label="Show Euler-angle interpolation" bind:checked={showEuler} />
    <Slider label="View" min={-180} max={180} step={5} bind:value={azimuth} format={deg} />
  {/snippet}

  {#snippet caption()}
    An object turns from a start orientation to an end orientation. The tips of its nose (x axis) and top (z axis) move
    on the unit sphere; the tubes are the paths for slerp, the beads for interpolating yaw, pitch and roll one by one.
    In Euler angles (yaw, pitch, roll) the start is ({a.yaw}°, {a.pitch}°, {a.roll}°); the sliders set the end.
    <strong>What to look for:</strong> slerp always turns through exactly the direct angle, at a constant rate; Euler-angle
    interpolation reaches the same end by a longer, uneven route, and across the ±180° seam it can go almost all the way round.
  {/snippet}
</WidgetFrame>

{#snippet glyph(q: Quat, color: string)}
  <T.Group quaternion={q3(q)}>
    <T.Mesh position={[0.44, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
      <T.CylinderGeometry args={[0.025, 0.025, 0.88, 10]} />
      <T.MeshLambertMaterial {color} />
    </T.Mesh>
    <T.Mesh position={[0.92, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
      <T.ConeGeometry args={[0.06, 0.16, 16]} />
      <T.MeshLambertMaterial {color} />
    </T.Mesh>
    <T.Mesh position={[0, 0, 0.47]}>
      <T.BoxGeometry args={[0.05, 0.012, 0.94]} />
      <T.MeshLambertMaterial {color} />
    </T.Mesh>
  </T.Group>
{/snippet}

<style>
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
