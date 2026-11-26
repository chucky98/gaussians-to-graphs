<script lang="ts">
  import { renderTex } from './katex';

  interface Props {
    /** TeX for the left-hand side, e.g. '\\boldsymbol{\\Sigma}'. */
    labelTex: string;
    /** Plain-text name for screen readers. */
    label: string;
    values: number[][];
    format?: (v: number) => string;
    /** Shade cells by signed value (diverging scale). */
    highlight?: boolean;
  }
  let { labelTex, label, values, format = (v: number) => v.toFixed(2), highlight = true }: Props = $props();

  const maxAbs = $derived(Math.max(1e-12, ...values.flat().map(Math.abs)));
  function bg(v: number): string {
    if (!highlight) return 'transparent';
    const pct = Math.round((Math.abs(v) / maxAbs) * 45);
    const tok = v >= 0 ? 'var(--c-div-pos)' : 'var(--c-div-neg)';
    return `color-mix(in srgb, ${tok} ${pct}%, var(--c-div-mid))`;
  }
  const summary = $derived(`${label} = [${values.map((r) => r.map(format).join(', ')).join('; ')}]`);
</script>

<div class="matrix" role="img" aria-label={summary}>
  <span class="lhs" aria-hidden="true">{@html renderTex(labelTex + ' =')}</span>
  <div class="bracket" aria-hidden="true" style:grid-template-columns="repeat({values[0]?.length ?? 1}, auto)">
    {#each values as row, i (i)}
      {#each row as v, j (j)}
        <span class="cell" style:background={bg(v)}>{format(v)}</span>
      {/each}
    {/each}
  </div>
</div>

<style>
  .matrix {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  .bracket {
    display: grid;
    gap: 2px;
    padding: 2px 5px;
    border-left: 1.5px solid var(--c-fg);
    border-right: 1.5px solid var(--c-fg);
    border-radius: 4px;
    position: relative;
  }
  .cell {
    font-variant-numeric: tabular-nums;
    font-size: 0.85rem;
    padding: 0.15rem 0.45rem;
    text-align: right;
    border-radius: 3px;
    color: var(--c-fg);
  }
</style>
