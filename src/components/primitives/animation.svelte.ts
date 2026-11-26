/**
 * requestAnimationFrame loop for widgets (DESIGN §5.2).
 * - Pauses while the observed element is off-screen or the tab is hidden.
 * - Never autoplays under `prefers-reduced-motion` (manual play and stepping still work).
 *
 * Usage:
 *   const loop = createAnimationLoop((dt) => { ...; return keepGoing; }, { fps: 30 });
 *   <div {@attach loop.observe}> ... </div>
 */
export interface AnimationLoopOptions {
  /** Target frame rate; frames are skipped to approximate it. Default 60. */
  fps?: number;
  /** Start playing when first visible (ignored under reduced motion). Default false. */
  autoplay?: boolean;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export function createAnimationLoop(step: (dtMs: number) => boolean | void, opts: AnimationLoopOptions = {}) {
  const minInterval = 1000 / (opts.fps ?? 60);
  let playing = $state(false);
  let onScreen = false;
  let pageVisible = typeof document === 'undefined' ? true : !document.hidden;
  let raf = 0;
  let last = 0;
  let autoplayPending = opts.autoplay === true;

  const shouldRun = () => playing && onScreen && pageVisible;

  function frame(t: number) {
    raf = 0;
    if (!shouldRun()) return;
    const dt = last === 0 ? minInterval : t - last;
    if (dt >= minInterval - 1) {
      last = t;
      if (step(Math.min(dt, 100)) === false) {
        playing = false;
        last = 0;
        return;
      }
    }
    raf = requestAnimationFrame(frame);
  }

  function sync() {
    if (shouldRun() && raf === 0) {
      last = 0;
      raf = requestAnimationFrame(frame);
    } else if (!shouldRun() && raf !== 0) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  return {
    get playing() {
      return playing;
    },
    play() {
      playing = true;
      sync();
    },
    pause() {
      playing = false;
      sync();
    },
    toggle() {
      playing = !playing;
      sync();
    },
    /** Svelte attachment: observe visibility of the widget root. */
    observe: (el: HTMLElement) => {
      const io = new IntersectionObserver((entries) => {
        onScreen = entries.some((e) => e.isIntersecting);
        if (onScreen && autoplayPending) {
          autoplayPending = false;
          if (!prefersReducedMotion()) playing = true;
        }
        sync();
      });
      io.observe(el);
      const onVis = () => {
        pageVisible = !document.hidden;
        sync();
      };
      document.addEventListener('visibilitychange', onVis);
      return () => {
        io.disconnect();
        document.removeEventListener('visibilitychange', onVis);
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      };
    },
  };
}
