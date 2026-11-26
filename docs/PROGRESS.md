# Progress

## Current phase: 0 — Foundation (complete, pending first deploy check)

## Next task: Phase 1 — post 01 `where-am-i` (DriftFan widget; `geometry/se2` basics)

## Posts

| #     | Slug                             | Status    | Widgets                       | Notes                                                                                                  |
| ----- | -------------------------------- | --------- | ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| 01    | where-am-i                       | todo      | DriftFan                      | Phase 1. Post 02 lists it as a prerequisite; it renders as "coming soon" until published.              |
| 02    | gaussians-and-covariance         | published | Gaussian1D, CovarianceEllipse | Reference implementation of the post template. ~2,200 words. Claims pinned in `tests/unit/posts/02-…`. |
| 03–32 | (see `src/lib/site/syllabus.ts`) | todo      | —                             |                                                                                                        |

## Infrastructure checklist

- [x] Astro 7 + MDX + Svelte 5 + KaTeX (remark-math / rehype-katex), TypeScript strictest
- [x] MDX math risk check (§3): `\\`, `{}`, `aligned`, `bmatrix`, `\tag`, macros all render; `throwOnError` fails the build on bad TeX
- [x] ESLint (typescript-eslint, svelte, astro) + Prettier; Vitest; Playwright + axe
- [x] Tokens (light/dark, Okabe–Ito, line styles), self-hosted fonts, global styles
- [x] BaseLayout, PostLayout, Header (nav, Pagefind search, theme toggle), Footer, SyllabusMap, SeriesNav, TOC, Giscus (disabled)
- [x] Pages: home, notation (full table + style key), about, 404, RSS, sitemap, posts/[slug]
- [x] `syllabus.ts` (32 entries), content schema, `scripts/validate-content.ts`
- [x] MDX content components: Callout, Sidenote, Derivation, AlgorithmBox, TryThis, Figure
- [x] `lib/math`: matrix, rng, gaussian, stats (+ tests); `lib/site`: url, syllabus, reading time, config, notation
- [x] Primitives: Plot2D, Axes, CovEllipse, PointsCanvas, Handle, Slider, Toggle, Select, PlayControls, SeedControl, Legend, MatrixView, KaTeXInline, WidgetFrame; `createAnimationLoop`
- [x] CI (`ci.yml`: `npm run verify`, screenshots artifact) and deploy (`deploy.yml`: withastro/action → deploy-pages)
- [x] README, LICENSE (MIT), LICENSE-CONTENT (CC BY 4.0), this file
- [ ] First deployment verified live (done right after merge; see below)
- [ ] giscus comments: needs the owner to install the giscus GitHub App (see follow-ups)

## Decisions

- 2026-11-26 — **Astro 7 Markdown processor.** Astro 7 defaults to the Sätteri processor, which does not run remark/rehype plugins. Added `@astrojs/markdown-remark` and set `markdown.processor: unified({...})` with remark-math + rehype-katex. Needed for KaTeX at build time (§3).
- 2026-11-26 — **No `<Eq>`/`<M>` component.** Complex TeX renders correctly in MDX. Caveats recorded for authors: bare `{…}` in MDX _prose_ is a JS expression; in Svelte, TeX containing braces must be passed as a JS expression (`tex={X}`), never as a quoted attribute; avoid `<` in math (use `\lt`).
- 2026-11-26 — **npm `overrides` pins one KaTeX** (`katex: $katex`) so build-time and widget rendering match; also clears the low-severity advisories from older nested copies.
- 2026-11-26 — **`chi2Quantile` is computed, not tabulated.** Regularized incomplete gamma → χ² CDF → safeguarded Newton from a Wilson–Hilferty start (closed form for dof 2). More accurate than table + approximation; tests compare against standard table values and closed forms (dof 1, 2).
- 2026-11-26 — **`src/lib/demos/`** holds the pure model behind each widget (defaults, limits, derived numbers). Widgets render it; post claim tests import it. Keeps CLAUDE.md rules 1 and 13 enforceable.
- 2026-11-26 — **Validation runs after the build.** `npm run validate` checks sources _and_ every link/asset/anchor in `dist/` under the base path, so `verify` runs lint → check → test → build → validate → e2e.
- 2026-11-26 — **E2E serves `dist/` with `scripts/serve-dist.ts`** (tiny Node server under the base path) instead of `astro preview`, which can daemonize itself in Astro 7; the test runner must own the server's lifecycle.
- 2026-11-26 — **Content components are global.** `PostLayout` passes Callout/Sidenote/Derivation/AlgorithmBox/TryThis/Figure to MDX via `components`; widgets are imported explicitly in each MDX file (required for `client:visible`).
- 2026-11-26 — **Unpublished posts are never linked.** Prerequisites that are not yet published render as "coming soon" text; forward references in prose stay plain text ("Post 23") until that post ships. The validator rejects links to unpublished posts.
- 2026-11-26 — **Sticky TOC only from 1500 px.** Wide (960 px) widgets reach 140 px into each margin; below 1500 px an inline "Contents" box is used instead. Widgets `clear: both` so floated sidenotes never overlap them.
- 2026-11-26 — **Notation additions (post 02):** μ, σ; σx, σy, ρ; n; v₁, v₂; L (Cholesky factor); z (whitened vector); γ (contour level); χ²ₙ(p). Added to DESIGN §6.1 and `/notation`, with conflict notes (ρ vs ρ(·), z vs z_k).
- 2026-11-26 — **Dependencies added beyond DESIGN §3:** `@astrojs/markdown-remark` (see above), `tsx` (run TS scripts), `yaml` (validator parses frontmatter without Astro), `@astrojs/rss`. `d3-shape`/`d3-array` deferred until a widget needs them.
- 2026-11-26 — **giscus configured but disabled.** Discussions are enabled and IDs are stored in `src/lib/site/config.ts` (category: Announcements), but the giscus app is not installed on the repo, so `enabled: false`.
- 2026-11-26 — **No personal name on the site.** The site identifies the owner only through the GitHub repository; RSS/footer carry no author name.
- 2026-11-26 — **Default OG image** generated once by `scripts/make-og.ts` (per-part images are Phase 5).
- 2026-11-26 — **Gaussian1D σ range 0.4–2.5** (not 0.3) so the y-axis can stop at 1.05 and the plot stays readable at 320 px.
- 2026-11-26 — **New seeds are deterministic** (`nextSeed(seed)` in `rng.ts`), so even "New seed" sequences are reproducible.

## Follow-ups / known issues

- **Owner action:** install the giscus GitHub App on `chucky98/gaussians-to-graphs` (https://github.com/apps/giscus). Then set `giscus.enabled = true` in `src/lib/site/config.ts`.
- When posts 01, 04, 13, 23, 25 are published: link the references to them from post 02 (prerequisite box links automatically).
- Client-side KaTeX is ~75 KB gz of the 90 KB shared chunk. Consider rendering only the static parts with KaTeX and showing live numbers as plain text, or lazy-loading KaTeX.
- `Plot2D` pan/zoom is not implemented yet (no Phase 0 widget needs it). Primitives still to build when first needed: Robot2D, Landmark, Heatmap, Spy.
- Lighthouse has not been run (optional per §8.4).
- Post 01's DriftFan "close the loop" follow-up remains scheduled for Phase 4.

## Performance report

| Page / island              | JS (gzipped)                                                         | Notes                                                         |
| -------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| Post page before hydration | ~3.2 KB inline (theme, search loader, giscus loader, island runtime) | Budget 50 KB ✓. Pagefind UI loads only when search is opened. |
| Gaussian1D island          | 2.6 KB                                                               | Budget ~80 KB ✓ (excl. shared)                                |
| CovarianceEllipse island   | 8.5 KB                                                               | Budget ~80 KB ✓ (excl. shared)                                |
| Shared: Svelte runtime     | 22.8 KB                                                              |                                                               |
| Shared: KaTeX + primitives | 90.6 KB                                                              | See follow-up above                                           |
