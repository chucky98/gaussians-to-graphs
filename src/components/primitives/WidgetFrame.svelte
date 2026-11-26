<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** Component name; becomes data-widget (e2e tests rely on it). */
    name: string;
    title: string;
    /** Accessible description of what the widget shows. */
    description: string;
    /** Key numbers, announced politely to screen readers (debounced). */
    live?: string;
    onreset: () => void;
    /** Optional wrapper hooks, e.g. an animation-loop visibility observer. */
    attach?: (el: HTMLElement) => void | (() => void);
    figure: Snippet;
    controls?: Snippet;
    readouts?: Snippet;
    caption: Snippet;
  }

  let { name, title, description, live = '', onreset, attach, figure, controls, readouts, caption }: Props = $props();
  const uid = $props.id();

  let announced = $state('');
  $effect(() => {
    const text = live;
    const t = setTimeout(() => (announced = text), 600);
    return () => clearTimeout(t);
  });

  const noop = () => {};
</script>

<figure
  class="widget ui wide"
  data-widget={name}
  aria-labelledby="{uid}-title"
  aria-describedby="{uid}-desc"
  {@attach attach ?? noop}
>
  <div class="bar">
    <span class="title" id="{uid}-title">{title}</span>
    <button type="button" class="btn" data-action="reset" onclick={onreset}>Reset</button>
  </div>
  <p class="visually-hidden" id="{uid}-desc">{description}</p>
  <div class="body">
    <div class="viz">{@render figure()}</div>
    {#if controls || readouts}
      <div class="side">
        {#if readouts}<div class="readouts">{@render readouts()}</div>{/if}
        {#if controls}<div class="controls">{@render controls()}</div>{/if}
      </div>
    {/if}
  </div>
  <p class="visually-hidden" aria-live="polite" aria-atomic="true">{announced}</p>
  <figcaption class="caption">{@render caption()}</figcaption>
</figure>

<style>
  .widget {
    margin: var(--space-6) 0;
    border: 1px solid var(--c-border);
    border-radius: var(--radius);
    background: var(--c-bg);
    font-size: var(--fs-ui);
    line-height: 1.4;
    container-type: inline-size;
    clear: both;
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--c-border);
    background: var(--c-surface);
    border-radius: var(--radius) var(--radius) 0 0;
  }
  .title {
    font-weight: 600;
    font-size: 0.9rem;
  }
  .body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
    padding: var(--space-3);
  }
  @container (min-width: 700px) {
    .body {
      grid-template-columns: minmax(0, 1fr) 260px;
      align-items: start;
    }
  }
  .viz {
    min-width: 0;
  }
  .side {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .controls {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .caption {
    padding: var(--space-3);
    border-top: 1px solid var(--c-border);
    color: var(--c-muted);
    font-size: 0.82rem;
    line-height: 1.5;
  }
  .caption :global(strong) {
    color: var(--c-fg);
  }
  :global(.widget .btn) {
    font: inherit;
    font-size: 0.82rem;
    color: var(--c-fg);
    background: var(--c-bg);
    border: 1px solid var(--c-border);
    border-radius: var(--radius);
    padding: 0.35rem 0.7rem;
    min-height: 34px;
    cursor: pointer;
  }
  :global(.widget .btn:hover) {
    border-color: var(--c-axis);
  }
  :global(.widget .btn:disabled) {
    opacity: 0.5;
    cursor: default;
  }
</style>
