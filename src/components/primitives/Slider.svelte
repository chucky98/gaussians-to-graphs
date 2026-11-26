<script lang="ts">
  import { renderTex } from './katex';

  interface Props {
    /** Plain-text label (accessible name). */
    label: string;
    /** Optional TeX shown instead of the plain label. */
    tex?: string;
    min: number;
    max: number;
    step: number;
    value: number;
    unit?: string;
    format?: (v: number) => string;
    oninput?: (v: number) => void;
  }
  let {
    label,
    tex,
    min,
    max,
    step,
    value = $bindable(),
    unit = '',
    format = (v: number) => v.toFixed(2),
    oninput,
  }: Props = $props();
  const id = $props.id();
  const shown = $derived(`${format(value)}${unit ? ` ${unit}` : ''}`);
</script>

<div class="slider">
  <label for={id}>
    {#if tex}<span aria-hidden="true">{@html renderTex(tex)}</span>{:else}{label}{/if}
  </label>
  <output for={id} aria-hidden="true">{shown}</output>
  <input
    {id}
    type="range"
    {min}
    {max}
    {step}
    bind:value
    aria-label={label}
    aria-valuetext={shown}
    oninput={() => oninput?.(value)}
  />
</div>

<style>
  .slider {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: baseline;
    row-gap: 0.15rem;
  }
  label {
    font-size: 0.85rem;
  }
  output {
    font-variant-numeric: tabular-nums;
    font-size: 0.82rem;
    color: var(--c-muted);
  }
  input {
    grid-column: 1 / -1;
    width: 100%;
    margin: 0;
    min-height: 28px;
    accent-color: var(--c-link);
    cursor: pointer;
  }
</style>
