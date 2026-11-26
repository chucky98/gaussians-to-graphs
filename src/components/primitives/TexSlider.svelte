<script lang="ts">
  import Slider from './Slider.svelte';
  import KaTeXInline from './KaTeXInline.svelte';

  /** Slider whose visible label is TeX (e.g. '\\sigma_x'); `label` stays the accessible name. */
  interface Props {
    label: string;
    tex: string;
    min: number;
    max: number;
    step: number;
    value: number;
    unit?: string;
    format?: (v: number) => string;
    oninput?: (v: number) => void;
  }
  let { tex, value = $bindable(), ...rest }: Props = $props();
</script>

<Slider {...rest} bind:value>
  {#snippet labelContent()}<KaTeXInline {tex} />{/snippet}
</Slider>
