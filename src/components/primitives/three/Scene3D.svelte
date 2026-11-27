<script lang="ts">
  /**
   * A 3D view for Part 3 widgets (DESIGN §3: Three.js via Threlte, loaded only by islands that use it).
   * Renders on demand (only when something changes), with a z-up world and a camera that orbits the
   * origin. Drag horizontally to turn the view (on touch screens vertical drags still scroll the page);
   * the widget offers a "View" slider bound to `azimuth` for keyboard users. Without WebGL it shows a
   * short notice instead, and the widget's readouts keep working.
   */
  import type { Snippet } from 'svelte';
  import { Canvas } from '@threlte/core';
  import { NoToneMapping } from 'three';
  import Stage from './Stage.svelte';
  import { readToken, watchTheme } from '../theme.svelte';

  interface Props {
    /** Accessible description of the scene. */
    label: string;
    /** Camera azimuth around the vertical axis, degrees. */
    azimuth?: number;
    /** Camera elevation above the horizontal plane, degrees. */
    elevation?: number;
    /** Camera distance from the origin. */
    distance?: number;
    /** Height / width. */
    aspect?: number;
    maxHeight?: number;
    /** CSS custom properties to resolve into concrete colours for three.js. */
    tokens: readonly string[];
    children: Snippet<[Record<string, string>]>;
  }
  let {
    label,
    azimuth = $bindable(35),
    elevation = $bindable(22),
    distance = 6,
    aspect = 0.8,
    maxHeight = 420,
    tokens,
    children,
  }: Props = $props();

  let webgl = $state<boolean | null>(null);
  let colors = $state<Record<string, string>>({});

  function attach(el: HTMLElement) {
    const c = document.createElement('canvas');
    try {
      webgl = !!(c.getContext('webgl2') ?? c.getContext('webgl'));
    } catch {
      webgl = false;
    }
    const read = () => {
      const out: Record<string, string> = {};
      for (const t of tokens) out[t] = readToken(el, t);
      colors = out;
    };
    read();
    return watchTheme(read)();
  }

  let drag: { id: number; x: number; y: number; touch: boolean } | null = null;
  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    azimuth = ((((azimuth - dx * 0.5 + 540) % 360) + 360) % 360) - 180;
    if (!drag.touch) elevation = Math.max(-20, Math.min(80, elevation + dy * 0.4));
  }
  function up(e: PointerEvent) {
    if (drag?.id === e.pointerId) drag = null;
  }
</script>

<div class="scene" style:--aspect={aspect} style:--max-h="{maxHeight}px" {@attach attach}>
  {#if webgl}
    <div
      class="gl"
      role="img"
      aria-label={label}
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
    >
      <Canvas toneMapping={NoToneMapping} renderMode="on-demand" dpr={[1, 2]}>
        <Stage {azimuth} {elevation} {distance}>
          {@render children(colors)}
        </Stage>
      </Canvas>
    </div>
  {:else if webgl === false}
    <p class="nogl" role="note">
      This 3D view needs WebGL, which this browser has turned off. The numbers beside it still update.
    </p>
  {/if}
</div>

<style>
  .scene {
    position: relative;
    width: 100%;
    aspect-ratio: calc(1 / var(--aspect));
    max-height: var(--max-h);
    margin-inline: auto;
  }
  .gl {
    width: 100%;
    height: 100%;
    touch-action: pan-y;
    cursor: grab;
  }
  .gl:active {
    cursor: grabbing;
  }
  .nogl {
    display: grid;
    place-items: center;
    height: 100%;
    margin: 0;
    padding: var(--space-3);
    border: 1px dashed var(--c-border);
    color: var(--c-muted);
    text-align: center;
  }
</style>
