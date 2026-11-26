/** Site-wide constants. The GitHub owner comes from `git remote get-url origin` (DESIGN §2). */
export const siteConfig = {
  title: 'From Gaussians to Graphs',
  shortTitle: 'Gaussians to Graphs',
  tagline: 'Estimation, Kalman filtering and SLAM, explained with interactive animations',
  pitch:
    'A free, interactive course that starts with a single bell curve and ends with the sparse optimization behind modern SLAM. Every idea comes with an animation you can drag, tune and break.',
  owner: 'chucky98',
  repo: 'gaussians-to-graphs',
  lang: 'en',
  /**
   * giscus comments (DESIGN §2 step 6). IDs fetched with `gh api graphql`.
   * Disabled until the giscus GitHub App is installed on the repository.
   */
  giscus: {
    enabled: false,
    repoId: 'R_kgDOV8056A',
    category: 'Announcements',
    categoryId: 'DIC_kwDOV8056M4DMBGc',
  },
  /**
   * Public page-view counters (owner request): GoatCounter site code, e.g. 'gaussians-to-graphs' for
   * https://gaussians-to-graphs.goatcounter.com. Empty = counting off and no statistics section.
   * In GoatCounter's settings, "Allow adding visitor counts on your website" must be enabled.
   */
  stats: {
    goatcounterCode: 'chucky98' as string,
  },
} as const;

export const repoUrl = `https://github.com/${siteConfig.owner}/${siteConfig.repo}`;
export const siteOrigin = `https://${siteConfig.owner.toLowerCase()}.github.io`;
export const basePath = `/${siteConfig.repo}`;

/** Link to a source file on GitHub (main branch), e.g. `src/lib/math/gaussian.ts`. */
export function sourceUrl(path: string): string {
  return `${repoUrl}/blob/main/${path.replace(/^\/+/, '')}`;
}

/** Prefilled "Report an issue" URL for a page. */
export function issueUrl(pageTitle: string, pageUrl: string): string {
  const title = encodeURIComponent(`[${pageTitle}] `);
  const body = encodeURIComponent(`Page: ${pageUrl}\n\nWhat is wrong or unclear?\n\n`);
  return `${repoUrl}/issues/new?title=${title}&body=${body}`;
}

export function giscusEnabled(): boolean {
  const g = siteConfig.giscus;
  return g.enabled && Boolean(g.repoId && g.categoryId);
}

export function statsEnabled(): boolean {
  return siteConfig.stats.goatcounterCode.length > 0;
}
