/**
 * Public page-view counters via GoatCounter (cookieless, no personal data). Pure helpers;
 * the About page fetches the numbers in the browser. Counting is off until a site code is set.
 */

/** Base URL of a GoatCounter site, e.g. https://example.goatcounter.com. */
export function goatcounterBase(code: string): string {
  if (!/^[a-z0-9-]+$/i.test(code)) throw new RangeError('invalid GoatCounter site code');
  return `https://${code}.goatcounter.com`;
}

/**
 * JSON counter URL for a page path as GoatCounter records it (the browser's location.pathname,
 * base path included), or the special path TOTAL for the whole site.
 */
export function counterUrl(code: string, path: string | 'TOTAL'): string {
  const p = path === 'TOTAL' ? 'TOTAL' : encodeURIComponent(path);
  return `${goatcounterBase(code)}/counter/${p}.json`;
}

/** GoatCounter returns counts as formatted strings ("1,234"); turn them into numbers. */
export function parseCount(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/[^0-9]/g, '');
  return digits === '' ? null : Number(digits);
}
