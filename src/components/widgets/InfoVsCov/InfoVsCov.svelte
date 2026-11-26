<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Heatmap from '../../primitives/Heatmap.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import Select from '../../primitives/Select.svelte';
  import PlayControls from '../../primitives/PlayControls.svelte';
  import { createAnimationLoop } from '../../primitives/animation.svelte';
  import { INFO, logMagnitude, matricesAt, type InfoScenario } from '../../../lib/demos/info-vs-cov';

  let scenario = $state<InfoScenario>('corridor');
  const maxK = $derived(INFO.maxSteps[scenario]);
  let k = $state<number>(INFO.maxSteps.corridor);

  const m = $derived(matricesAt(scenario, Math.min(k, maxK)));
  const omegaVals = $derived(logMagnitude(m.Omega));
  const pVals = $derived(logMagnitude(m.P));

  const loop = createAnimationLoop(
    () => {
      k = Math.min(maxK, k + 1);
      return k < maxK;
    },
    { fps: 4 },
  );
  function togglePlay() {
    if (!loop.playing && k >= maxK) k = 1;
    loop.toggle();
  }
  function setScenario(s: InfoScenario) {
    loop.pause();
    scenario = s;
    k = INFO.maxSteps[s];
  }
  function reset() {
    setScenario('corridor');
  }
  const pct = (a: number, b: number) => `${Math.round((100 * a) / b)}%`;
  const live = $derived(
    `${k} steps, ${m.size} unknowns. Information matrix: ${m.nnzOmega} of ${m.size * m.size} entries nonzero. ` +
      `Covariance matrix: ${m.nnzP} of ${m.size * m.size} nonzero.`,
  );
</script>

<WidgetFrame
  name="InfoVsCov"
  title="Information is sparse, covariance is dense"
  description="Two heat maps of the same trajectory estimate as steps are added: the information matrix, which is banded and mostly zero, and its inverse, the covariance matrix, in which every entry is nonzero. Colour shows the size of each entry on a logarithmic scale; exact zeros are blank."
  {live}
  onreset={reset}
  attach={loop.observe}
>
  {#snippet figure()}
    <div class="pair">
      {#each [{ key: 'omega', title: 'Information matrix Ω', vals: omegaVals, nnz: m.nnzOmega }, { key: 'p', title: 'Covariance P = Ω⁻¹', vals: pVals, nnz: m.nnzP }] as h (h.key)}
        <div class="panel">
          <p class="ptitle">{h.title}</p>
          <Plot2D
            xDomain={[0, m.size]}
            yDomain={[0, m.size]}
            equalAspect
            maxHeight={320}
            margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
            label={`${h.title}: ${h.nnz} of ${m.size * m.size} entries nonzero`}
          >
            {#snippet underlay(ctx)}
              <Heatmap {ctx} values={h.vals} nx={m.size} ny={m.size} vmax={1} crisp />
            {/snippet}
            {#snippet children(ctx)}
              <rect
                class="frame"
                x={ctx.inner.left}
                y={ctx.inner.top}
                width={ctx.inner.right - ctx.inner.left}
                height={ctx.inner.bottom - ctx.inner.top}
              />
            {/snippet}
          </Plot2D>
          <p class="count" data-readout={h.key}>{h.nnz} of {m.size * m.size} nonzero ({pct(h.nnz, m.size * m.size)})</p>
        </div>
      {/each}
    </div>
    <div class="scale" aria-hidden="true">
      <span>blank = exactly 0</span>
      <span class="bar"></span>
      <span>10⁻¹² … 1 × the largest entry (log scale)</span>
    </div>
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Steps of data</dt>
      <dd data-readout="k">{k}</dd>
      <dt>Unknowns</dt>
      <dd data-readout="size">{m.size} ({m.n} per step × {k + 1} steps)</dd>
      <dt>Storage, Ω</dt>
      <dd>{m.nnzOmega} numbers</dd>
      <dt>Storage, P</dt>
      <dd>{m.nnzP} numbers</dd>
    </dl>
  {/snippet}

  {#snippet controls()}
    <PlayControls
      playing={loop.playing}
      ontoggle={togglePlay}
      onstep={() => (k = k >= maxK ? 1 : k + 1)}
      what="steps"
    />
    <Slider
      label="Steps of data"
      min={1}
      max={maxK}
      step={1}
      bind:value={k}
      format={(v) => String(v)}
      oninput={() => loop.pause()}
    />
    <Select
      label="Problem"
      value={scenario}
      options={[
        { value: 'corridor', label: 'Corridor robot (position only, Post 11)' },
        { value: 'aisle', label: 'Forklift in an aisle (position and velocity)' },
      ]}
      onchange={(v) => setScenario(v)}
    />
  {/snippet}

  {#snippet caption()}
    Instead of only the current state, we estimate every state of the trajectory so far, x₀ … xₖ, as one Gaussian. Each
    heat map shows one of its matrices, row by row and column by column in time order; colour is the size of an entry
    relative to the largest, on a logarithmic scale, and exact zeros are blank. <strong>What to look for:</strong> the information
    matrix stays a narrow band along the diagonal, growing by a fixed amount per step, while the covariance fills its whole
    square, its far-off entries small but never zero.
  {/snippet}
</WidgetFrame>

<style>
  .pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--space-3);
  }
  @container (max-width: 520px) {
    .pair {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .panel {
    min-width: 0;
  }
  .ptitle {
    margin: 0 0 0.25rem;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .count {
    margin: 0.25rem 0 0;
    font-size: 0.8rem;
    color: var(--c-muted);
    font-variant-numeric: tabular-nums;
  }
  .frame {
    fill: none;
    stroke: var(--c-axis);
  }
  .scale {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    font-size: 0.78rem;
    color: var(--c-muted);
    margin-top: var(--space-2);
  }
  .bar {
    display: inline-block;
    width: 6rem;
    height: 0.7rem;
    border: 1px solid var(--c-border);
    background: linear-gradient(to right, var(--c-seq-lo), var(--c-seq-hi));
  }
  .ro {
    display: grid;
    grid-template-columns: auto auto;
    gap: 0.25rem 0.75rem;
    margin: 0;
    font-size: 0.85rem;
  }
  .ro dt {
    color: var(--c-muted);
  }
  .ro dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
