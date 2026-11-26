/**
 * Pointer-drag handlers for SVG handles (mouse, touch and pen via Pointer Events).
 * Spread onto the element: `<g {...drag}>`. Pair with keyboard handlers for arrow keys.
 */
export function pointerDrag(onmove: (e: PointerEvent) => void, onstart?: (e: PointerEvent) => void) {
  let active: number | null = null;
  const end = (e: PointerEvent) => {
    if (e.pointerId === active) active = null;
  };
  return {
    onpointerdown(e: PointerEvent) {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      active = e.pointerId;
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      (e.currentTarget as SVGElement).focus?.({ preventScroll: true });
      e.preventDefault();
      onstart?.(e);
    },
    onpointermove(e: PointerEvent) {
      if (e.pointerId === active) onmove(e);
    },
    onpointerup: end,
    onpointercancel: end,
  };
}

/** Arrow-key deltas: returns [dx, dy] in steps, or null if the key is not an arrow. Shift = ×5. */
export function arrowDelta(e: KeyboardEvent): [number, number] | null {
  const m = e.shiftKey ? 5 : 1;
  switch (e.key) {
    case 'ArrowLeft':
      return [-m, 0];
    case 'ArrowRight':
      return [m, 0];
    case 'ArrowUp':
      return [0, m];
    case 'ArrowDown':
      return [0, -m];
    default:
      return null;
  }
}
