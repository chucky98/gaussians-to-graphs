<script lang="ts">
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Heatmap from '../../primitives/Heatmap.svelte';
  import Select from '../../primitives/Select.svelte';
  import { SPARSE, blockPattern, orderingView, type OrderingKind } from '../../../lib/demos/sparsity';

  const a = blockPattern();
  const N = a.n;
  let kind = $state<OrderingKind>('natural');
  const view = $derived(orderingView(a, kind));
  const grid = (cells: [number, number][]) => {
    const v = new Float64Array(N * N);
    for (const [i, j] of cells) v[i * N + j] = 1;
    return v;
  };
  const lam = $derived(grid(view.lambda));
  const fac = $derived(grid(view.factor));
  const names: Record<OrderingKind, string> = {
    natural: 'Natural (the order the poses were created)',
    random: 'Random',
    rcm: 'Reverse Cuthill–McKee (small bandwidth)',
    mindegree: 'Minimum degree',
  };
  const live = $derived(
    `${names[kind]} ordering. Factor has ${view.factorBlocks} nonzero blocks, ${view.fill} of them fill-in.`,
  );
  function reset() {
    kind = 'natural';
  }
  const lowerLambda = $derived((view.lambdaBlocks + N) / 2);
</script>

<WidgetFrame
  name="SparsityExplorer"
  title="Ordering and fill-in"
  description="The information matrix of a 120-pose pose graph, one cell per pair of poses, and the pattern of its Cholesky factor, under different orderings of the poses. Dark cells are nonzero blocks."
  {live}
  onreset={reset}
>
  {#snippet figure()}
    <div class="pair">
      {#each [{ key: 'lambda', title: 'Λ, reordered', vals: lam, n: view.lambdaBlocks }, { key: 'factor', title: 'Cholesky factor L', vals: fac, n: view.factorBlocks }] as h (h.key)}
        <div class="panel">
          <p class="ptitle">{h.title}</p>
          <Plot2D
            xDomain={[0, N]}
            yDomain={[0, N]}
            equalAspect
            maxHeight={320}
            margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
            label={`${h.title}: ${h.n} nonzero blocks of ${N * N}`}
          >
            {#snippet underlay(ctx)}
              <Heatmap {ctx} values={h.vals} nx={N} ny={N} vmax={1} crisp />
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
        </div>
      {/each}
    </div>
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Nonzero blocks in Λ (lower triangle)</dt>
      <dd data-readout="lambda">{lowerLambda}</dd>
      <dt>Nonzero blocks in L</dt>
      <dd data-readout="factor">{view.factorBlocks}</dd>
      <dt>Fill-in (new blocks)</dt>
      <dd data-readout="fill">{view.fill}</dd>
      <dt>A dense L would have</dt>
      <dd>{((N * (N + 1)) / 2).toLocaleString('en')}</dd>
    </dl>
  {/snippet}

  {#snippet controls()}
    <Select
      label="Ordering of the poses"
      value={kind}
      options={(['natural', 'random', 'rcm', 'mindegree'] as const).map((k) => ({ value: k, label: names[k] }))}
      onchange={(v) => (kind = v)}
    />
  {/snippet}

  {#snippet caption()}
    A synthetic city of {SPARSE.poses} poses (the generator of Post 27). Each cell stands for a 3 × 3 block: the pair of poses
    in that row and column. Left: Λ, nonzero where two poses share a constraint. Right: its Cholesky factor, which also has
    nonzeros where Λ had none (fill-in). <strong>What to look for:</strong> the ordering does not change Λ's nonzeros, only
    where they sit; but it changes the factor a lot: minimum degree leaves less than a quarter of the fill that the natural
    order creates.
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
  .frame {
    fill: none;
    stroke: var(--c-axis);
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
