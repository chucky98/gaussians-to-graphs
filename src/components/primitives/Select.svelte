<script lang="ts" generics="T extends string | number">
  interface Props {
    label: string;
    value: T;
    options: { value: T; label: string }[];
    onchange?: (v: T) => void;
  }
  let { label, value = $bindable(), options, onchange }: Props = $props();
  const id = $props.id();
</script>

<div class="select">
  <label for={id}>{label}</label>
  <select {id} bind:value onchange={() => onchange?.(value)}>
    {#each options as o (o.value)}
      <option value={o.value}>{o.label}</option>
    {/each}
  </select>
</div>

<style>
  .select {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  label {
    font-size: 0.85rem;
  }
  select {
    width: 100%;
    min-width: 0;
    max-width: 100%;
    text-overflow: ellipsis;
    font: inherit;
    font-size: 0.85rem;
    color: var(--c-fg);
    background: var(--c-bg);
    border: 1px solid var(--c-border);
    border-radius: var(--radius);
    padding: 0.35rem 0.5rem;
    min-height: 34px;
  }
</style>
