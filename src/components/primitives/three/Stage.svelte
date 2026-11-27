<script lang="ts">
  /** Camera and lights for Scene3D (must live inside Threlte's Canvas). z is up. */
  import type { Snippet } from 'svelte';
  import { T, useThrelte } from '@threlte/core';
  import type { PerspectiveCamera } from 'three';

  interface Props {
    azimuth: number;
    elevation: number;
    distance: number;
    children: Snippet;
  }
  let { azimuth, elevation, distance, children }: Props = $props();
  const { invalidate } = useThrelte();
  let camera = $state.raw<PerspectiveCamera>();

  const RAD = Math.PI / 180;
  const pos = $derived.by((): [number, number, number] => {
    const a = azimuth * RAD;
    const e = elevation * RAD;
    return [distance * Math.cos(e) * Math.cos(a), distance * Math.cos(e) * Math.sin(a), distance * Math.sin(e)];
  });
  $effect(() => {
    if (!camera) return;
    camera.position.set(...pos);
    camera.lookAt(0, 0, 0);
    invalidate();
  });
</script>

<T.PerspectiveCamera makeDefault fov={32} up={[0, 0, 1]} near={0.1} far={100} bind:ref={camera} />
<T.AmbientLight intensity={1.6} />
<T.DirectionalLight position={[pos[0] + 2, pos[1] - 3, pos[2] + 6]} intensity={1.8} />
{@render children()}
