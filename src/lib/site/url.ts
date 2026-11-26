/**
 * Base-path-aware URLs (CLAUDE.md rule 4). The site is served under `/<repo>/`,
 * so never hardcode a leading `/`; always go through `url()`.
 */

/** Join a base path and a site-relative path. Pure; exported for tests. */
export function joinUrl(base: string, path = ''): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//') || path.startsWith('#')) return path;
  const b = base.endsWith('/') ? base : `${base}/`;
  const p = path.replace(/^\/+/, '');
  return `${b}${p}`;
}

/** Site URL for a path such as `posts/gaussians-and-covariance/` or `notation/`. */
export function url(path = ''): string {
  return joinUrl(import.meta.env.BASE_URL ?? '/', path);
}

/** Canonical URL of a post (trailing slash, as configured). */
export function postPath(slug: string): string {
  return `posts/${slug}/`;
}
