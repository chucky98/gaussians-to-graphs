<script lang="ts">
  import { renderTex } from './katex';
  let { tex, display = false }: { tex: string; display?: boolean } = $props();
  const html = $derived(renderTex(tex, display));
</script>

<span class="katex-inline">{@html html}</span>
