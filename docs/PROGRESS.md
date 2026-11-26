# Progress

## Current phase: 1 — Parts 0 and 1 (Part 0 complete; Part 1 in progress: posts 05–06 published)

## Next task: post 07 `estimator-quality` (EstimatorShootout: stationary GPS receiver, mean vs median vs shrinkage)

## Posts

| #     | Slug                             | Status    | Widgets                       | Notes                                                                                                                       |
| ----- | -------------------------------- | --------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 01    | where-am-i                       | published | DriftFan                      | ~2,100 words. Embeds the SyllabusMap. Claims pinned in `tests/unit/posts/01-…`. Phase 4 follow-up: "close the loop" toggle. |
| 02    | gaussians-and-covariance         | published | Gaussian1D, CovarianceEllipse | Reference implementation of the post template. ~2,200 words. Claims pinned in `tests/unit/posts/02-…`.                      |
| 03    | conditioning-and-marginalizing   | published | SliceVsProject                | ~1,600 words. Covariance/information duality; claims pinned in `tests/unit/posts/03-…`.                                     |
| 04    | propagating-uncertainty          | published | NonlinearPropagation          | ~1,600 words. Polar banana, x², sin, linear; claims pinned in `tests/unit/posts/04-…`.                                      |
| 05    | least-squares                    | published | LineFit                       | ~2,300 words. Road from phone GPS fixes; multipath outlier; weights from reported accuracy. Projection figure.              |
| 06    | mle-and-map                      | published | BayesGrid1D                   | ~2,100 words. Distance to a wall: odometry prior + ultrasonic readings; two-doorway bimodal prior.                          |
| 07–32 | (see `src/lib/site/syllabus.ts`) | todo      | —                             |                                                                                                                             |

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
- [x] First deployment verified live (2026-11-26): https://chucky98.github.io/gaussians-to-graphs/ — all pages 200 under the base path, 404 page served, 3 widgets hydrate, search works, no console errors
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
- 2026-11-26 — **Contents redesigned (owner feedback: too small).** From 1240 px a sticky left rail ("On this page": numbered sections, scroll-spy highlight, reading-progress bar, back-to-top); below that a full-size collapsible card that closes after a section is chosen. Wide widgets are capped at `min(960px, 100vw − 2·(rail + 3rem))` from 1240 px so they never slide under the rail (784 px at 1280, full 960 px from ~1456). Widgets `clear: both` so floated sidenotes never overlap them.
- 2026-11-26 — **Notation additions (post 02):** μ, σ; σx, σy, ρ; n; v₁, v₂; L (Cholesky factor); z (whitened vector); γ (contour level); χ²ₙ(p). Added to DESIGN §6.1 and `/notation`, with conflict notes (ρ vs ρ(·), z vs z_k).
- 2026-11-26 — **Dependencies added beyond DESIGN §3:** `@astrojs/markdown-remark` (see above), `tsx` (run TS scripts), `yaml` (validator parses frontmatter without Astro), `@astrojs/rss`. `d3-shape`/`d3-array` deferred until a widget needs them.
- 2026-11-26 — **giscus configured but disabled.** Discussions are enabled and IDs are stored in `src/lib/site/config.ts` (category: Announcements), but the giscus app is not installed on the repo, so `enabled: false`.
- 2026-11-26 — **No personal name on the site.** The site identifies the owner only through the GitHub repository; RSS/footer carry no author name.
- 2026-11-26 — **Default OG image** generated once by `scripts/make-og.ts` (per-part images are Phase 5).
- 2026-11-26 — **Gaussian1D σ range 0.4–2.5** (not 0.3) so the y-axis can stop at 1.05 and the plot stays readable at 320 px.
- 2026-11-26 — **New seeds are deterministic** (`nextSeed(seed)` in `rng.ts`), so even "New seed" sequences are reproducible.
- 2026-11-26 — **Phase 0 complete; Phase 1 started** with post 01.
- 2026-11-26 — **`geometry/so2` + `geometry/se2` Phase 1 subset:** `wrapAngle`, `angleDiff`, `rotate`; `compose`, `inverse`, `act`, `between`. Exp/Log, ⊕/⊖ and Jacobians are deferred to Phase 3 (post 21), where they are first needed and fully tested.
- 2026-11-26 — **Odometry model ("move, then turn") with random-walk noise scaling.** Each reading (d, Δθ) gets independent noise with std α·√d, so "after 1 m the error std is α" holds for any step size. Implemented in `src/lib/sim/odometry.ts`; the stadium loop is in `src/lib/sim/trajectories.ts`.
- 2026-11-26 — **Common random numbers in DriftFan.** Run r always uses the same standard-normal draws (seeded per run), so changing the noise slider or the number of runs moves the fan smoothly instead of reshuffling it.
- 2026-11-26 — **Notation additions (post 01):** x_k, y_k, θ_k (pose components), d_k, Δθ_k (odometry reading), α (odometry noise level), ℓ (distance driven); conflict notes for x_k vs bold x_k and α (odometry) vs α (UKF).
- 2026-11-26 — **`Slider` no longer imports KaTeX;** TeX labels use the new `TexSlider`. This keeps the 77 KB (gz) KaTeX chunk out of widgets without TeX: DriftFan dropped from ~125 KB to ~45 KB total.
- 2026-11-26 — **New primitives:** `PathsCanvas` (many polylines on canvas, dash patterns read from tokens) and `Robot2D` (pose glyph).
- 2026-11-26 — **Information-form duals in `lib/math/gaussian`:** `conditionInformation` and `marginalizeInformation`, plus `schurComplement` in `matrix.ts` shared by covariance-form conditioning and information-form marginalization. Tests check both forms agree and that the inverse of a Schur complement is the matching block of the inverse (the §8.1 "marginalize" invariant, ahead of `graph/marginalize` in Phase 4).
- 2026-11-26 — **New primitive `Heatmap`** (canvas; renders an nx×ny grid to an offscreen bitmap and scales it smoothly; colors interpolate between `--c-seq-lo` and `--c-seq-hi`).
- 2026-11-26 — **Wide display equations are stacked with `aligned`** so they fit at 375 px instead of scrolling (applied in post 03; worth keeping as a writing rule).
- 2026-11-26 — **Notation additions (post 03):** partition blocks x₁, x₂, Σ₁₁, Σ₁₂, Ω₁₁, ξ₁, and a (conditioned-on value).
- 2026-11-26 — **Part 0 (Foundations) complete:** posts 01–04 published.
- 2026-11-26 — **`math/autodiff` (`numericJacobian`), `models/nonlinear` (polarToCartesian, square, sine, linearMap with analytic Jacobians and exact moments) and `math/propagate` (`linearize`, `monteCarlo`).** `propagate.ts` is not in DESIGN §5.1; it holds the two propagation methods shared by post 04 and, later, the EKF/UKF posts.
- 2026-11-26 — **NonlinearPropagation adds a "Linear" option** beyond the three functions in DESIGN §11, to show that linearization is exact for linear maps.
- 2026-11-26 — **Widget grid tracks use `minmax(0, 1fr)`** and selects shrink to their container: a long `<select>` option had pushed post 04 wider than 320 px (caught by the overflow e2e test).
- 2026-11-26 — **Notation additions (post 04):** A, b (linear map), J (Jacobian of one function), r, θ (range and bearing).
- 2026-11-26 — **Right margin (owner request): "Symbols in this post" card + margin notes.** Posts list key symbols in frontmatter (`symbols: [{tex, meaning, match?}]`); the card is KaTeX-rendered at build time, sticky in the right margin from 1240 px, and highlights the symbols whose TeX occurs in the section being read (client script scans KaTeX annotations). Below 1240 px it is a collapsible card under Contents. The validator requires each symbol's TeX to be in the notation table and each match fragment to occur in the post's math.
- 2026-11-26 — **Margin notes moved to the symbols column** (from 1240 px, right edge on the page gutter); the card fades while a note overlaps it. Posts 01–04 each got three notes (etymology, attributions, back-references), all facts checked to well-established sources.
- 2026-11-26 — **Part 1 uses real-world scenarios (owner request):** 05 GPS fixes along a road, 06 ultrasonic ranging to a wall with a map prior, 07 a stationary GPS receiver (multipath = heavy tails), 08 online motor calibration with a battery-sag jump, 09 UWB indoor positioning (trilateration).
- 2026-11-26 — **`math/leastsquares.ts`** (`lstsq` via normal equations + Cholesky with a relative rank check, `fitLine`, exact `fitLineLAD` by searching lines through pairs of points). Not in DESIGN §5.1; it is the linear core reused by RLS (08) and Gauss–Newton (09).
- 2026-11-26 — **Seeds for demo data are chosen to be typical, not lucky or unlucky.** LineFit's seed 11 gives a clean fit 0.17 standard errors from the true slope (seed 5 was 2.4 SE off). Outlier effects come from explicit presets, never from an unusual seed.
- 2026-11-26 — **Validator reports invalid YAML** instead of crashing (reference titles with ": " must be quoted).
- 2026-11-26 — **Notation additions (post 05):** m, tᵢ/yᵢ, bold y, r = y − Ax, W; new "Part 1" group on /notation.
- 2026-11-26 — **`math/bayes1d.ts`** (grid posterior in log space, prior weight κ, closed-form Gaussian posterior). BayesGrid1D reports no MAP for a flat posterior and lists both candidates for tied peaks, rather than an arbitrary argmax.
- 2026-11-26 — **BayesGrid1D "prior strength" is a prior exponent κ** (posterior ∝ prior^κ × likelihood). For a Gaussian prior this equals shrinking σ₀ by √κ; κ = 0 gives MLE. Notation: 𝓛, μ₀, σ₀, κ.

## Follow-ups / known issues

- **Owner action:** install the giscus GitHub App on `chucky98/gaussians-to-graphs` (https://github.com/apps/giscus). Then set `giscus.enabled = true` in `src/lib/site/config.ts`.
- When posts 06, 09, 11, 12, 13, 15, 16, 19, 22, 23, 25, 27, 28, 29 are published: link the plain-text references to them from earlier posts.
- Client-side KaTeX (77 KB gz) still loads for widgets with TeX labels or MatrixView. Consider rendering static TeX at build time and showing live numbers as plain text.
- `Plot2D` pan/zoom is not implemented yet (no Phase 0 widget needs it). Primitives still to build when first needed: Landmark, Heatmap, Spy.
- Lighthouse has not been run (optional per §8.4).
- Post 01's DriftFan "close the loop" follow-up remains scheduled for Phase 4.

## Performance report

| Page / island               | JS (gzipped)                                                         | Notes                                                         |
| --------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| Post page before hydration  | ~3.2 KB inline (theme, search loader, giscus loader, island runtime) | Budget 50 KB ✓. Pagefind UI loads only when search is opened. |
| Gaussian1D island           | 2.6 KB                                                               | Budget ~80 KB ✓ (excl. shared)                                |
| CovarianceEllipse island    | 6.0 KB                                                               | Budget ~80 KB ✓ (excl. shared)                                |
| Shared: Svelte runtime      | 22.8 KB                                                              |                                                               |
| DriftFan island             | 4.8 KB (+ 13.6 KB shared primitives, 3.3 KB animation, 23 KB Svelte) | Post 01 total ≈ 45 KB; no KaTeX                               |
| SliceVsProject island       | 4.0 KB (+ KaTeX chunk)                                               | Live formulas use KaTeX                                       |
| NonlinearPropagation island | 5.8 KB (+ KaTeX chunk)                                               | Two instances on post 04                                      |
| Shared: KaTeX chunk         | 77 KB                                                                | Loaded only by Gaussian1D / CovarianceEllipse (post 02)       |
