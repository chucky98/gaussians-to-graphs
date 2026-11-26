<script lang="ts">
  import type { SemanticKind } from './semantic';
  interface Props {
    items: { kind: SemanticKind; label: string }[];
  }
  let { items }: Props = $props();
</script>

<ul class="legend" aria-label="Legend">
  {#each items as it (it.kind + it.label)}
    <li>
      <svg width="30" height="12" viewBox="0 0 30 12" aria-hidden="true" class="sw {it.kind}">
        {#if it.kind === 'sample'}
          <circle cx="6" cy="7" r="2" /><circle cx="14" cy="4" r="2" /><circle cx="22" cy="8" r="2" />
        {:else if it.kind === 'meas'}
          <line x1="1" y1="6" x2="29" y2="6" /><path class="x" d="M11 2l8 8M19 2l-8 8" />
        {:else if it.kind === 'truth'}
          <line x1="1" y1="6" x2="29" y2="6" /><circle class="hollow" cx="15" cy="6" r="3.2" />
        {:else}
          <line x1="1" y1="6" x2="29" y2="6" />
        {/if}
      </svg>
      {#if it.kind === 'bad'}<span class="warn" aria-hidden="true">⚠</span>{/if}
      <span>{it.label}</span>
    </li>
  {/each}
</ul>

<style>
  .legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 0.9rem;
    font-size: 0.8rem;
  }
  li {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  line,
  path {
    fill: none;
    stroke-width: 2;
  }
  .truth line,
  .truth circle {
    stroke: var(--c-truth);
    stroke-width: 1.25;
  }
  .hollow {
    fill: var(--c-bg);
  }
  .prior line {
    stroke: var(--c-prior);
    stroke-dasharray: var(--dash-prior);
  }
  .meas line {
    stroke: var(--c-meas);
    stroke-dasharray: var(--dash-meas);
  }
  .meas .x {
    stroke: var(--c-meas);
  }
  .post line {
    stroke: var(--c-post);
    stroke-width: 3;
  }
  .bad line {
    stroke: var(--c-bad);
    stroke-width: 3;
  }
  .odom line {
    stroke: var(--c-odom);
    stroke-dasharray: var(--dash-odom);
  }
  .sample circle {
    fill: var(--c-sample);
  }
  .warn {
    color: var(--c-bad-text);
  }
</style>
