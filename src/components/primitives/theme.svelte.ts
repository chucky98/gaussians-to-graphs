/**
 * Theme awareness for canvas drawing: canvas needs concrete colors, so read the
 * semantic CSS variables at draw time and redraw when the theme changes.
 */

/** Resolve a CSS custom property (e.g. '--c-sample') on an element. */
export function readToken(el: Element, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

/**
 * Svelte attachment factory: calls `onChange` whenever the effective theme may have changed
 * (data-theme attribute on <html> or the OS color-scheme preference).
 */
export function watchTheme(onChange: () => void) {
  return () => {
    const mo = new MutationObserver(onChange);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', onChange);
    return () => {
      mo.disconnect();
      mq.removeEventListener('change', onChange);
    };
  };
}
