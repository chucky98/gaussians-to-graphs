<script lang="ts">
  import { nextSeed } from '../../lib/math/rng';

  interface Props {
    seed: number;
    defaultSeed: number;
    onchange?: (seed: number) => void;
  }
  let { seed = $bindable(), defaultSeed, onchange }: Props = $props();

  function set(s: number) {
    seed = s;
    onchange?.(s);
  }
</script>

<div class="seed" role="group" aria-label="Random seed">
  <span class="label">Seed <span class="val">{seed}</span></span>
  <button type="button" class="btn" data-action="new-seed" onclick={() => set(nextSeed(seed))}>New seed</button>
  <button
    type="button"
    class="btn"
    data-action="default-seed"
    onclick={() => set(defaultSeed)}
    disabled={seed === defaultSeed}
  >
    Default
  </button>
</div>

<style>
  .seed {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .label {
    font-size: 0.85rem;
    margin-right: auto;
  }
  .val {
    font-variant-numeric: tabular-nums;
    color: var(--c-muted);
  }
</style>
