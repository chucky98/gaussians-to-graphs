<script lang="ts">
  interface Props {
    playing: boolean;
    ontoggle: () => void;
    onstep?: () => void;
    /** Disable play/step (e.g. at the end of a run). */
    atEnd?: boolean;
    speed?: number;
    speeds?: number[];
    /** Name of what is being played, for accessible labels. */
    what?: string;
  }
  let { playing, ontoggle, onstep, atEnd = false, speed = $bindable(1), speeds, what = 'animation' }: Props = $props();
  const id = $props.id();
</script>

<div class="play" role="group" aria-label="Playback">
  <button type="button" class="btn primary" data-action="play" onclick={ontoggle}>
    {#if playing}
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <rect x="3" y="2" width="3.5" height="12" /><rect x="9.5" y="2" width="3.5" height="12" />
      </svg>
      Pause<span class="visually-hidden">&nbsp;{what}</span>
    {:else}
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 2 14 8 4 14z" /></svg>
      {atEnd ? 'Replay' : 'Play'}<span class="visually-hidden">&nbsp;{what}</span>
    {/if}
  </button>
  {#if onstep}
    <button type="button" class="btn" data-action="step" onclick={onstep} disabled={playing || atEnd}>
      Step<span class="visually-hidden">&nbsp;{what}</span>
    </button>
  {/if}
  {#if speeds}
    <label class="speed" for={id}>Speed</label>
    <select {id} bind:value={speed}>
      {#each speeds as s (s)}<option value={s}>{s}×</option>{/each}
    </select>
  {/if}
</div>

<style>
  .play {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  svg {
    fill: currentColor;
  }
  .speed {
    font-size: 0.82rem;
    margin-left: var(--space-2);
  }
  select {
    font: inherit;
    font-size: 0.82rem;
    color: var(--c-fg);
    background: var(--c-bg);
    border: 1px solid var(--c-border);
    border-radius: var(--radius);
    min-height: 34px;
  }
</style>
