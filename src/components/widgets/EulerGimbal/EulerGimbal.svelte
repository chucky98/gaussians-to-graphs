<script lang="ts">
  import { T } from '@threlte/core';
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import Select from '../../primitives/Select.svelte';
  import Scene3D from '../../primitives/three/Scene3D.svelte';
  import { GIMBAL, eulerChangeForTurn, gimbal, type Euler, type GimbalPreset } from '../../../lib/demos/rotations';
  import type { Quat } from '../../../lib/geometry/quat';

  interface Props {
    preset?: GimbalPreset;
  }
  let { preset: initial = 'default' }: Props = $props();

  // svelte-ignore state_referenced_locally
  let preset = $state<GimbalPreset>(initial);
  // svelte-ignore state_referenced_locally
  let yaw = $state<number>(GIMBAL.presets[initial].yaw);
  // svelte-ignore state_referenced_locally
  let pitch = $state<number>(GIMBAL.presets[initial].pitch);
  // svelte-ignore state_referenced_locally
  let roll = $state<number>(GIMBAL.presets[initial].roll);
  let azimuth = $state(35);

  const e = $derived<Euler>({ yaw, pitch, roll });
  const g = $derived(gimbal(e));
  const turns = $derived((['x', 'y', 'z'] as const).map((axis) => ({ axis, d: eulerChangeForTurn(e, axis) })));
  const locked = $derived(g.yawRollGap < 0.5);

  function setPreset(p: GimbalPreset) {
    preset = p;
    ({ yaw, pitch, roll } = GIMBAL.presets[p]);
  }
  function reset() {
    setPreset(initial);
    azimuth = 35;
  }

  /** three.js stores quaternions as (x, y, z, w). */
  const q3 = (q: Quat): [number, number, number, number] => [q[1], q[2], q[3], q[0]];
  const deg = (v: number) => `${Math.round(v)}°`;
  const sgn = (v: number) => {
    const r = Math.round(v);
    return r === 0 ? '0°' : `${r > 0 ? '+' : '−'}${Math.abs(r)}°`;
  };
  const names = { x: 'nose (x)', y: 'wing (y)', z: 'top (z)' } as const;
  const live = $derived(
    `Yaw ${deg(yaw)}, pitch ${deg(pitch)}, roll ${deg(roll)}. Angle between the yaw and roll axes ${deg(g.yawRollGap)}.` +
      (locked ? ' Gimbal lock: yaw and roll turn the body about the same axis.' : ''),
  );

  const R_OUT = 1.6;
  const R_MID = 1.33;
  const R_IN = 1.08;
  const TUBE = 0.05;
</script>

<WidgetFrame
  name="EulerGimbal"
  title="Three gimbal rings: yaw, pitch, roll"
  description="A 3D model of a gimbal. The outer ring turns about the vertical axis (yaw), the middle ring about the outer ring's horizontal axis (pitch), and the inner ring, which carries a small aircraft, about the middle ring's axis (roll). Sliders set the three angles."
  {live}
  onreset={reset}
>
  {#snippet figure()}
    <Scene3D
      label="Gimbal with yaw {deg(yaw)}, pitch {deg(pitch)}, roll {deg(
        roll,
      )}. The angle between the yaw axis and the roll axis is {deg(g.yawRollGap)}."
      bind:azimuth
      distance={7.6}
      tokens={['--c-rot-x', '--c-rot-y', '--c-rot-z', '--c-muted', '--c-fg', '--c-surface']}
    >
      {#snippet children(c)}
        <!-- Fixed stand and the vertical yaw shaft -->
        <T.Mesh position={[0, 0, -1.95]} rotation={[Math.PI / 2, 0, 0]}>
          <T.CylinderGeometry args={[0.035, 0.035, 0.7, 12]} />
          <T.MeshLambertMaterial color={c['--c-rot-z']} />
        </T.Mesh>
        <T.Mesh position={[0, 0, -2.3]} rotation={[Math.PI / 2, 0, 0]}>
          <T.CylinderGeometry args={[0.5, 0.55, 0.08, 32]} />
          <T.MeshLambertMaterial color={c['--c-muted']} />
        </T.Mesh>
        <!-- Outer ring: yaw about world z; the ring lies in its y–z plane and carries the pitch pins on ±y -->
        <T.Group quaternion={q3(g.rings.yaw)}>
          <T.Mesh rotation={[0, Math.PI / 2, 0]}>
            <T.TorusGeometry args={[R_OUT, TUBE, 12, 96]} />
            <T.MeshLambertMaterial color={c['--c-rot-z']} />
          </T.Mesh>
          {#each [1, -1] as s (s)}
            <T.Mesh position={[0, (s * (R_OUT + R_MID)) / 2, 0]}>
              <T.CylinderGeometry args={[0.03, 0.03, R_OUT - R_MID, 10]} />
              <T.MeshLambertMaterial color={c['--c-rot-y']} />
            </T.Mesh>
          {/each}
        </T.Group>
        <!-- Middle ring: pitch about the outer ring's y; lies in its x–y plane, carries the roll pins on ±x -->
        <T.Group quaternion={q3(g.rings.pitch)}>
          <T.Mesh>
            <T.TorusGeometry args={[R_MID, TUBE, 12, 96]} />
            <T.MeshLambertMaterial color={c['--c-rot-y']} />
          </T.Mesh>
          {#each [1, -1] as s (s)}
            <T.Mesh position={[(s * (R_MID + R_IN)) / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <T.CylinderGeometry args={[0.03, 0.03, R_MID - R_IN, 10]} />
              <T.MeshLambertMaterial color={c['--c-rot-x']} />
            </T.Mesh>
          {/each}
        </T.Group>
        <!-- Inner ring: roll about the middle ring's x; lies in its x–z plane and carries the aircraft -->
        <T.Group quaternion={q3(g.rings.roll)}>
          <T.Mesh rotation={[Math.PI / 2, 0, 0]}>
            <T.TorusGeometry args={[R_IN, TUBE, 12, 96]} />
            <T.MeshLambertMaterial color={c['--c-rot-x']} />
          </T.Mesh>
          <!-- Aircraft: nose along +x, left wing along +y, fin along +z -->
          <T.Mesh>
            <T.BoxGeometry args={[1.2, 0.16, 0.16]} />
            <T.MeshLambertMaterial color={c['--c-fg']} />
          </T.Mesh>
          <T.Mesh position={[0.72, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <T.ConeGeometry args={[0.11, 0.26, 20]} />
            <T.MeshLambertMaterial color={c['--c-rot-x']} />
          </T.Mesh>
          <T.Mesh position={[0.05, 0, 0]}>
            <T.BoxGeometry args={[0.26, 1.5, 0.03]} />
            <T.MeshLambertMaterial color={c['--c-surface']} />
          </T.Mesh>
          <T.Mesh position={[0.05, 0.62, 0.035]}>
            <T.BoxGeometry args={[0.2, 0.18, 0.02]} />
            <T.MeshLambertMaterial color={c['--c-rot-y']} />
          </T.Mesh>
          <T.Mesh position={[-0.5, 0, 0.2]}>
            <T.BoxGeometry args={[0.22, 0.03, 0.34]} />
            <T.MeshLambertMaterial color={c['--c-rot-z']} />
          </T.Mesh>
        </T.Group>
      {/snippet}
    </Scene3D>
    <ul class="key" aria-label="Rings">
      <li><span class="sw z"></span>outer ring: yaw, about the vertical</li>
      <li><span class="sw y"></span>middle ring: pitch</li>
      <li><span class="sw x"></span>inner ring: roll, about the nose</li>
    </ul>
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Yaw axis to roll axis</dt>
      <dd data-readout="gap">{g.yawRollGap.toFixed(0)}°</dd>
      <dt>Weakest direction (1 = full)</dt>
      <dd data-readout="sigma">{g.singular[2].toFixed(2)}</dd>
    </dl>
    <p class="status" class:lock={locked} data-readout="status">
      {locked ? 'Gimbal lock: yaw and roll do the same thing' : 'Three independent ways to turn'}
    </p>
    <table class="turns">
      <caption>Angle changes for a {GIMBAL.nudge}° turn about the aircraft's own axis</caption>
      <thead>
        <tr><th scope="col">axis</th><th scope="col">yaw</th><th scope="col">pitch</th><th scope="col">roll</th></tr>
      </thead>
      <tbody>
        {#each turns as t (t.axis)}
          <tr data-readout="turn-{t.axis}">
            <th scope="row">{names[t.axis]}</th>
            <td>{sgn(t.d.yaw)}</td>
            <td>{sgn(t.d.pitch)}</td>
            <td>{sgn(t.d.roll)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/snippet}

  {#snippet controls()}
    <Select
      label="Preset"
      value={preset}
      options={[
        { value: 'default', label: 'Pitch 30°' },
        { value: 'near', label: 'Pitch 80° (close to lock)' },
        { value: 'lock', label: 'Pitch 90° (gimbal lock)' },
      ]}
      onchange={(v) => setPreset(v)}
    />
    <Slider label="Yaw ψ" min={-180} max={180} step={1} bind:value={yaw} format={deg} />
    <Slider label="Pitch θ" min={-90} max={90} step={1} bind:value={pitch} format={deg} />
    <Slider label="Roll φ" min={-180} max={180} step={1} bind:value={roll} format={deg} />
    <Slider label="View" min={-180} max={180} step={5} bind:value={azimuth} format={deg} />
  {/snippet}

  {#snippet caption()}
    Each ring turns inside the previous one: yaw about the vertical, then pitch about the outer ring's axis, then roll
    about the nose. The table shows how much each angle must change for the aircraft to turn 5° about one of its own
    axes. Drag the picture, or use the View slider, to look from another side. <strong>What to look for:</strong> as pitch
    approaches ±90°, the outer and middle rings move into one plane, the yaw and roll axes line up, and small turns of the
    aircraft need large swings of yaw and roll.
  {/snippet}
</WidgetFrame>

<style>
  .key {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    list-style: none;
    margin: var(--space-2) 0 0;
    padding: 0;
    font-size: 0.8rem;
    color: var(--c-muted);
  }
  .key li {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .sw {
    display: inline-block;
    border-radius: 50%;
    border: 3px solid;
  }
  .sw.z {
    width: 14px;
    height: 14px;
    border-color: var(--c-rot-z);
  }
  .sw.y {
    width: 11px;
    height: 11px;
    border-color: var(--c-rot-y);
  }
  .sw.x {
    width: 8px;
    height: 8px;
    border-color: var(--c-rot-x);
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
    margin: var(--space-2) 0;
    font-size: 0.82rem;
    font-weight: 600;
  }
  .status.lock {
    color: var(--c-bad-text);
  }
  .status.lock::before {
    content: '⚠ ';
  }
  .turns {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
  }
  .turns caption {
    text-align: left;
    color: var(--c-muted);
    padding-bottom: 0.25rem;
  }
  .turns th,
  .turns td {
    padding: 0.15rem 0.3rem;
    text-align: right;
    border-bottom: 1px solid var(--c-grid);
  }
  .turns th[scope='row'],
  .turns thead th:first-child {
    text-align: left;
    font-weight: 400;
    color: var(--c-muted);
  }
</style>
