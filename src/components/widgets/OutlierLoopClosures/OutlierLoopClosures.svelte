<script lang="ts">
  import { untrack } from 'svelte';
  import WidgetFrame from '../../primitives/WidgetFrame.svelte';
  import Plot2D from '../../primitives/Plot2D.svelte';
  import Axes from '../../primitives/Axes.svelte';
  import Slider from '../../primitives/Slider.svelte';
  import Select from '../../primitives/Select.svelte';
  import PlayControls from '../../primitives/PlayControls.svelte';
  import Legend from '../../primitives/Legend.svelte';
  import { createAnimationLoop } from '../../primitives/animation.svelte';
  import type { PlotContext } from '../../primitives/plot';
  import {
    ROBUST,
    type Method,
    type RobustIteration,
    type RobustRequest,
    type RobustResult,
  } from '../../../lib/demos/robust-demo';
  import { kernel } from '../../../lib/graph/robust';

  const D = ROBUST.defaults;
  let outliers = $state<number>(D.outliers);
  let method = $state<Method>(D.method);
  let k = $state<number>(D.k);
  const req = $derived<RobustRequest>({ outliers, method, k });

  let iterations = $state<RobustIteration[]>([]);
  let result = $state<Omit<RobustResult, 'iterations'> | null>(null);
  let solving = $state(false);
  let it = $state(0);
  let worker: Worker | null = null;
  let latest = 0;
  function createWorker(): Worker {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<{ id: number; type: string; it?: RobustIteration; res?: RobustResult }>) => {
      if (e.data.id !== latest) return;
      if (e.data.type === 'iteration') iterations = [...iterations, e.data.it!];
      else {
        result = e.data.res!;
        solving = false;
        if (!loop.playing) it = iterations.length - 1;
      }
    };
    return w;
  }
  $effect(() => {
    worker = createWorker();
    untrack(send);
    return () => {
      worker?.terminate();
      worker = null;
    };
  });
  function send() {
    if (!worker) return;
    if (solving) {
      worker.terminate();
      worker = createWorker();
    }
    latest++;
    solving = true;
    result = null;
    iterations = [];
    it = 0;
    worker.postMessage({ id: latest, req: $state.snapshot(req) });
  }
  let first = true;
  $effect(() => {
    void req;
    if (first) {
      first = false;
      return;
    }
    const t = setTimeout(() => untrack(send), 250);
    return () => clearTimeout(t);
  });

  const last = $derived(Math.max(0, iterations.length - 1));
  const cur = $derived(iterations[Math.min(it, last)]);
  const loop = createAnimationLoop(
    () => {
      if (it < last) it++;
      return solving || it < last;
    },
    { fps: 6 },
  );
  function togglePlay() {
    if (!loop.playing && it >= last) it = 0;
    loop.toggle();
  }
  function reset() {
    loop.pause();
    outliers = D.outliers;
    method = D.method;
    k = D.k;
  }

  const W = 9;
  const path = (ctx: PlotContext, xy: Float64Array) => {
    let s = '';
    for (let i = 0; i < xy.length; i += 2)
      s += `${i ? 'L' : 'M'}${ctx.x(xy[i]!).toFixed(1)},${ctx.y(xy[i + 1]!).toFixed(1)}`;
    return s;
  };
  /** Loop-closure segments in the current estimate, split into true/false and kept/rejected (once known). */
  function segments(ctx: PlotContext, xy: Float64Array, which: 'true' | 'false', kept: boolean | null): string {
    if (!result) return '';
    let s = '';
    const n = result.loops.length / 2;
    for (let q = 0; q < n; q++) {
      const isFalse = q >= result.trueLoops;
      if ((which === 'false') !== isFalse) continue;
      if (kept !== null && result.weights[q]! >= ROBUST.rejectBelow !== kept) continue;
      const [a, b] = [result.loops[2 * q]!, result.loops[2 * q + 1]!];
      s += `M${ctx.x(xy[2 * a]!).toFixed(1)},${ctx.y(xy[2 * a + 1]!).toFixed(1)}L${ctx.x(xy[2 * b]!).toFixed(1)},${ctx.y(xy[2 * b + 1]!).toFixed(1)}`;
    }
    return s;
  }
  const ker = $derived(kernel(method === 'gnc' ? 'gm' : method, k));
  const l2 = kernel('l2', 1);
  const E = 8;
  const curve = (ctx: PlotContext, f: (s: number) => number, ymax: number) =>
    Array.from({ length: 81 }, (_, i) => {
      const e = (E * i) / 80;
      return `${i ? 'L' : 'M'}${ctx.x(e).toFixed(1)},${ctx.y(Math.min(ymax, f(e * e))).toFixed(1)}`;
    }).join('');
  const names: Record<Method, string> = {
    l2: 'Squared error (L2)',
    huber: 'Huber',
    cauchy: 'Cauchy',
    gm: 'Geman–McClure',
    gnc: 'GNC (Geman–McClure)',
  };
  const live = $derived(
    cur
      ? `${names[method]}, ${outliers} false loop closures. Position error ${cur.rms.toFixed(2)} metres.` +
          (result ? ` ${result.falseRejected} of ${outliers} false closures rejected.` : '')
      : 'Solving.',
  );
</script>

<WidgetFrame
  name="OutlierLoopClosures"
  title="When loop closures lie: robust kernels"
  description="The synthetic city of Post 27 (500 poses) with false loop closures added: claims that two distant places are the same. A robust kernel limits how hard any single closure can pull. The map shows the estimate after each iteration; the plots show the chosen kernel's cost and weight against the size of a residual."
  {live}
  onreset={reset}
  attach={loop.observe}
>
  {#snippet figure()}
    <Plot2D
      xDomain={[-W, W]}
      yDomain={[-W, W]}
      equalAspect
      maxHeight={400}
      margin={{ top: 8, right: 12, bottom: 30, left: 36 }}
      label="Estimated route with true and false loop closures"
    >
      {#snippet children(ctx)}
        <Axes {ctx} xTicks={6} yTicks={6} xLabel="x (m)" yLabel="y (m)" />
        <g clip-path="url(#{ctx.uid}-clip)">
          {#if result}
            <path class="truth" d={path(ctx, result.truth)} />
          {/if}
          {#if cur}
            <path class="est" d={path(ctx, cur.xy)} />
            {#if result}
              <path class="lp true" d={segments(ctx, cur.xy, 'true', null)} />
              <path class="lp false kept" d={segments(ctx, cur.xy, 'false', true)} />
              <path class="lp false rejected" d={segments(ctx, cur.xy, 'false', false)} />
            {/if}
          {/if}
        </g>
      {/snippet}
    </Plot2D>
    <Legend
      items={[
        { kind: 'truth', label: 'true route' },
        { kind: 'post', label: 'estimate' },
        { kind: 'meas', label: 'true loop closures' },
        { kind: 'bad', label: 'false closures (faint once rejected)' },
      ]}
    />
    <div class="kplots">
      {#each [{ key: 'cost', title: 'Cost of one closure, ½ρ', f: (s: number) => 0.5 * ker.rho(s), ref: (s: number) => 0.5 * l2.rho(s), ymax: 12 }, { key: 'weight', title: 'Weight w = ρ′', f: ker.weight, ref: l2.weight, ymax: 1.1 }] as p (p.key)}
        <div>
          <p class="ptitle">{p.title}</p>
          <Plot2D
            xDomain={[0, E]}
            yDomain={[0, p.ymax]}
            aspect={0.6}
            maxHeight={140}
            margin={{ top: 6, right: 8, bottom: 28, left: 32 }}
            label="{p.title} against the error √s"
          >
            {#snippet children(ctx)}
              <Axes {ctx} xTicks={4} yTicks={3} xLabel="error √s" />
              <g clip-path="url(#{ctx.uid}-clip)">
                <path class="kref" d={curve(ctx, p.ref, p.ymax)} />
                <path class="kcur" d={curve(ctx, p.f, p.ymax)} />
              </g>
            {/snippet}
          </Plot2D>
        </div>
      {/each}
    </div>
  {/snippet}

  {#snippet readouts()}
    <dl class="ro">
      <dt>Loop closures: true / false</dt>
      <dd data-readout="loops">{result ? `${result.trueLoops} / ${outliers}` : '…'}</dd>
      <dt>Iteration</dt>
      <dd data-readout="it">{cur ? Math.min(it, last) : '…'}{solving ? ' …' : ` of ${last}`}</dd>
      <dt>Position error (RMS)</dt>
      <dd data-readout="rms">{cur ? `${cur.rms.toFixed(2)} m` : '…'}</dd>
      <dt>False closures rejected</dt>
      <dd data-readout="false-rej">{result ? `${result.falseRejected} of ${outliers}` : '…'}</dd>
      <dt>True closures rejected</dt>
      <dd data-readout="true-rej">{result ? `${result.trueRejected} of ${result.trueLoops}` : '…'}</dd>
    </dl>
  {/snippet}

  {#snippet controls()}
    <PlayControls
      playing={loop.playing}
      ontoggle={togglePlay}
      onstep={() => (it = it >= last ? 0 : it + 1)}
      what="iterations"
    />
    <Slider
      label="Iteration"
      min={0}
      max={Math.max(1, last)}
      step={1}
      bind:value={it}
      format={(v) => String(v)}
      oninput={() => loop.pause()}
    />
    <Select
      label="Kernel"
      value={method}
      options={(['l2', 'huber', 'cauchy', 'gm', 'gnc'] as const).map((m) => ({ value: m, label: names[m] }))}
      onchange={(v) => (method = v)}
    />
    <Slider label="Kernel scale kρ" min={1} max={5} step={0.5} bind:value={k} format={(v) => v.toFixed(1)} />
    <Slider
      label="False loop closures"
      min={0}
      max={ROBUST.maxOutliers}
      step={5}
      bind:value={outliers}
      format={(v) => String(v)}
    />
  {/snippet}

  {#snippet caption()}
    The route starts as dead reckoning; each iteration reweights the loop closures by the kernel and solves again (the
    solver runs in a background worker). A closure counts as rejected when its final weight is below 0.1. In the small
    plots, the grey curve is the squared error for reference and the scale kρ is measured in units of the error √s.
    <strong>What to look for:</strong> with squared errors a handful of false closures fold the map; a kernel whose cost levels
    off ignores them and recovers the true route; and a strongly non-convex kernel started from a poor guess can reject good
    closures too, which GNC avoids by starting almost convex.
  {/snippet}
</WidgetFrame>

<style>
  .truth {
    fill: none;
    stroke: var(--c-truth);
    stroke-width: 1;
    opacity: 0.35;
  }
  .est {
    fill: none;
    stroke: var(--c-post);
    stroke-width: 1.5;
  }
  .lp {
    fill: none;
    stroke-width: 1;
  }
  .lp.true {
    stroke: var(--c-meas);
    stroke-dasharray: var(--dash-meas);
    opacity: 0.45;
  }
  .lp.false.kept {
    stroke: var(--c-bad);
    stroke-width: 2;
  }
  .lp.false.rejected {
    stroke: var(--c-bad);
    stroke-dasharray: 3 3;
    opacity: 0.35;
  }
  .kplots {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--space-3);
    margin-top: var(--space-2);
  }
  .ptitle {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 600;
  }
  .kref {
    fill: none;
    stroke: var(--c-odom);
    stroke-dasharray: var(--dash-odom);
  }
  .kcur {
    fill: none;
    stroke: var(--c-post);
    stroke-width: 2;
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
