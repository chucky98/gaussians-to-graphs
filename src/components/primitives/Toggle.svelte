<script lang="ts">
  interface Props {
    label: string;
    checked: boolean;
    onchange?: (v: boolean) => void;
  }
  let { label, checked = $bindable(), onchange }: Props = $props();
  const id = $props.id();
</script>

<div class="toggle">
  <input {id} type="checkbox" role="switch" bind:checked onchange={() => onchange?.(checked)} />
  <label for={id}>{label}</label>
</div>

<style>
  .toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 28px;
  }
  input {
    appearance: none;
    -webkit-appearance: none;
    width: 2.1rem;
    height: 1.2rem;
    border-radius: 999px;
    border: 1px solid var(--c-axis);
    background: var(--c-surface);
    position: relative;
    margin: 0;
    flex: none;
    cursor: pointer;
  }
  input::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: calc(1.2rem - 6px);
    height: calc(1.2rem - 6px);
    border-radius: 50%;
    background: var(--c-axis);
    transition: transform 0.15s;
  }
  input:checked {
    background: var(--c-link);
    border-color: var(--c-link);
  }
  input:checked::after {
    transform: translateX(0.9rem);
    background: var(--c-bg);
  }
  label {
    font-size: 0.85rem;
    cursor: pointer;
  }
</style>
