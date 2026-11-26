# From Gaussians to Graphs: Design Document

> Audience for this document: **Claude Code**, which implements the whole project (code and prose).
> The owner does not edit files by hand. Read `CLAUDE.md` for the working rules; this file is the specification.

---

## 1. Summary

**From Gaussians to Graphs** is a free, static website: a structured series of posts that takes a reader from Gaussian random variables to modern SLAM back-ends (factor graphs, pose-graph optimization, sparse solvers). Every post pairs a careful written explanation with **interactive animations that run in the browser**. Readers drag covariances, tune noise parameters, drive robots and watch optimizers converge.

### 1.1 Goals
- A clear, **correct** syllabus of 32 posts, ordered so that each depends only on the ones before it.
- The interactive widgets are the core of the site. Each post has at least one widget that makes its key idea visible.
- One consistent notation and one consistent visual language across the whole series.
- Free hosting on GitHub Pages, no server, fast pages, readable on a phone.
- Built entirely by Claude Code, with strong automated checks to make up for the lack of manual editing.

### 1.2 Non-goals
- No videos and no pre-rendered animations. Everything animated is live and interactive.
- No server-side code, accounts, paywall or tracking cookies.
- Not a code library for production use. `src/lib` exists to power the explanations and must be correct, but it is not a published package.
- No exhaustive coverage of every filter variant. Depth and intuition matter more than breadth.

### 1.3 Audience
Engineering students, robotics and autonomy engineers, and self-learners. Assumed background: undergraduate calculus, basic linear algebra (matrix multiply, inverse, eigenvalues), and basic probability. Everything beyond that is introduced in the series.

---

## 2. Owner setup (manual, one time)

These are the only steps the owner does. If any of them is missing, Claude Code asks for it rather than working around it.

All development happens **inside a dev container** (`.devcontainer/`). The host machine needs only **Docker Desktop**, **VS Code** and the VS Code **Dev Containers** extension. Node, npm packages, Playwright browsers, `gh` and Claude Code are all installed in the container.

1. Create an empty **public** GitHub repository named `gaussians-to-graphs`.
2. Clone it locally. Put `CLAUDE.md` in the root, this file at `docs/DESIGN.md`, and the `.devcontainer/` folder in the root. Commit and push.
3. Open the folder in VS Code and choose **Dev Containers: Reopen in Container**. Wait for the first build.
4. In the container terminal: `gh auth login` (choose HTTPS, and let it configure git), then `claude` to sign in and start.
5. In the repo on GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
6. *(Optional, for comments)* Enable **Discussions** on the repo and install the **giscus** GitHub App on it. Claude Code then fetches the repo and category IDs with `gh api graphql` and configures them.

Logins for Claude Code and `gh`, plus `node_modules`, are kept in named Docker volumes, so they survive container rebuilds and nothing is installed into the project folder on the host.

The site will be at `https://<username>.github.io/gaussians-to-graphs/`. Claude Code reads `<username>` from `git remote get-url origin`.

---

## 3. Tech stack

Use the latest stable version of each tool at scaffold time, and pin exact versions in `package-lock.json`.

| Concern | Choice | Notes |
|---|---|---|
| Static site generator | **Astro** | Islands architecture: JavaScript is shipped only for widgets. Use content collections (`src/content.config.ts`, glob loader). |
| Content format | **MDX** (`@astrojs/mdx`) | Widgets are embedded directly in the prose. |
| Interactive UI | **Svelte 5** (runes) via `@astrojs/svelte` | All widgets and primitives. |
| 2D drawing | SVG for scenes with fewer than ~500 elements; **Canvas 2D** for particles, heatmaps and big point clouds | Use `d3-scale`, `d3-shape` and `d3-array` only as helpers. No full D3 DOM manipulation. |
| 3D (Part 3 and post 31 only) | **Three.js** via **Threlte** | Load lazily, only on posts that need it. |
| Math rendering | **KaTeX** at build time via `remark-math` + `rehype-katex` | Global macros, §6.3. In-widget formulas are rendered with `katex.renderToString`. |
| Code highlighting | Astro's built-in Shiki | Light and dark themes. |
| Search | **Pagefind** | Runs after the build; adds a search UI to the header. |
| Comments | **giscus** (optional) | Controlled by config; turned off if the IDs are missing. |
| Fonts | Self-hosted via `@fontsource`: **Source Serif 4** (body), **Inter** (UI, widgets), **JetBrains Mono** (code) | |
| Unit tests | **Vitest** | |
| E2E smoke tests | **Playwright** (Chromium only) | |
| Lint and format | ESLint (typescript-eslint, eslint-plugin-svelte, eslint-plugin-astro) + Prettier | |
| Type checking | `astro check` + `svelte-check`, `strict: true` | |
| Deployment | GitHub Actions → GitHub Pages (`withastro/action` + `actions/deploy-pages`) | |
| Package manager | npm | |

**Early risk to check in Phase 0:** make sure complex LaTeX containing `{}` and `\\` renders correctly inside MDX with `remark-math`, both inline and in display mode. If it doesn't, add an `<Eq>` / `<M>` component that takes the TeX as a string prop, use it everywhere, and record the decision.

---

## 4. Repository structure

```
gaussians-to-graphs/
├─ .devcontainer/                 # devcontainer.json + post-create.sh (the only dev environment)
├─ CLAUDE.md
├─ README.md                      # short: what the site is, link, how to run, license
├─ LICENSE                        # MIT (code)
├─ LICENSE-CONTENT                # CC BY 4.0 (prose and figures)
├─ astro.config.mjs               # site, base, integrations, remark/rehype plugins
├─ package.json
├─ tsconfig.json
├─ playwright.config.ts
├─ vitest.config.ts
├─ .github/workflows/
│  ├─ ci.yml                      # PRs: lint, check, test, validate, build, e2e
│  └─ deploy.yml                  # push to main: build + deploy to Pages
├─ docs/
│  ├─ DESIGN.md
│  └─ PROGRESS.md
├─ scripts/
│  ├─ validate-content.ts         # frontmatter, prerequisites, internal links, notation symbols
│  └─ katex-macros.ts             # single source of the KaTeX macros (§6.3)
├─ public/
│  ├─ favicon.svg
│  └─ data/                       # small datasets (.g2o, .json)
├─ src/
│  ├─ content.config.ts           # posts collection schema (§5.3)
│  ├─ content/posts/
│  │  └─ 02-gaussians-and-covariance/
│  │     └─ index.mdx
│  ├─ lib/                        # pure TS, no DOM (§5.1)
│  │  ├─ math/  filters/  models/  geometry/  graph/  sim/  site/
│  ├─ components/
│  │  ├─ primitives/              # Plot2D, Axes, CovEllipse, Robot2D, Landmark, Heatmap, MatrixView, Slider, Toggle, Select, PlayControls, SeedControl, KaTeXInline, Legend
│  │  ├─ widgets/                 # one folder per widget: Name/Name.svelte (+ worker.ts if needed)
│  │  ├─ content/                 # Callout, Sidenote, Derivation, Objectives, Prereqs, AlgorithmBox, TryThis, Figure, References
│  │  └─ layout/                  # Header, Footer, ThemeToggle, SeriesNav, SyllabusMap, TOC
│  ├─ layouts/
│  │  ├─ BaseLayout.astro
│  │  └─ PostLayout.astro
│  ├─ pages/
│  │  ├─ index.astro              # home: intro + syllabus map
│  │  ├─ notation.astro
│  │  ├─ about.astro
│  │  ├─ posts/[...slug].astro
│  │  ├─ rss.xml.ts
│  │  └─ 404.astro
│  └─ styles/
│     ├─ tokens.css
│     └─ global.css
└─ tests/
   ├─ unit/                       # mirrors src/lib
   └─ e2e/
```

The syllabus (all 32 posts, including unwritten ones) is defined once in `src/lib/site/syllabus.ts`: number, slug, title, part, one-line description, prerequisites. The home page, the series navigation and the validation script all read from it. A post's MDX frontmatter must agree with its syllabus entry, and the validator enforces this.

---

## 5. Architecture

### 5.1 `src/lib`: math and algorithms

Everything here is pure TypeScript with explicit types, no DOM access, and no global state. Numbers are `number` (float64). Matrices use a small in-house type for full control and easy testing:

```ts
// math/matrix.ts (sketch; refine as needed)
export interface Mat { rows: number; cols: number; data: Float64Array } // row-major
export type Vec = Float64Array
```

| Module | Contents |
|---|---|
| `math/matrix.ts` | create, identity, zeros, from arrays, add, sub, scale, mul, transpose, block get/set, `symmetrize`, `cholesky`, `solveCholesky`, `luSolve`, `inverse` (SPD via Cholesky, general via LU), `det`, `eigSym2` (closed form), `eigSym` (Jacobi, small n), `isSymmetricPSD` |
| `math/rng.ts` | `createRng(seed)` (mulberry32 or sfc32): `uniform()`, `normal()` (Box–Muller), `mvnormal(mean, chol)`, `choice`, `shuffle` |
| `math/gaussian.ts` | `Gaussian = {mean, cov}`: `pdf`, `logpdf`, `sample`, `linearTransform`, `marginalize(idx)`, `condition(idx, value)`, `product` (1D and nD), `toInformation` / `fromInformation`, `ellipsePoints(g, prob=0.95, n=64)`, `mahalanobis` |
| `math/stats.ts` | `chi2Quantile(p, dof)` (table for dof 1–6 at common p, plus Wilson–Hilferty approximation otherwise), `mean`, `variance`, `sampleCov`, `histogram`, `ess(weights)` |
| `math/autodiff.ts` | `numericJacobian(f, x, h)` (central differences). Used in tests and as a fallback only. |
| `filters/kf.ts` | `predict(state, model)`, `update(state, z, model, {joseph: true})`. Returns the new state **plus diagnostics**: innovation ν, S, K, NIS |
| `filters/ekf.ts` | Same interface. The model supplies `f, F(x,u), h, H(x)` |
| `filters/ukf.ts` | `sigmaPoints(g, {alpha, beta, kappa})`, `unscentedTransform`, `predict`, `update` |
| `filters/pf.ts` | Particles plus weights; `predict`, `weight`, `resample` (multinomial, systematic, stratified), `ess`, `estimate` |
| `filters/histogram.ts` | Discrete 1D Bayes filter (move by convolution, sense, normalize) |
| `filters/rts.ts` | RTS smoother over stored KF results |
| `filters/info.ts` | Information filter predict/update |
| `filters/consistency.ts` | NEES, NIS, chi² bounds for single and averaged runs |
| `models/` | `constantVelocity(dim, dt, q)`, `unicycle` (odometry motion model), `rangeBearing`, `positionSensor`, and nonlinear test functions (`polarToCartesian`, `square`, `sine`) with Jacobians |
| `geometry/so2.ts, se2.ts, so3.ts, se3.ts, quat.ts` | `compose`, `inverse`, `act` (transform a point), `Exp`, `Log`, `hat`, `vee`, `adjoint`, `oplus`, `ominus`, right and left Jacobians (and their inverses where needed), `interpolate` (slerp for SO(3)) |
| `graph/factors.ts` | `Factor` interface: `{keys, dim, residual(values), jacobians(values), information}`; implementations: `PriorFactor`, `BetweenFactorSE2`, `RangeBearingFactor`, `PointPriorFactor`, `BetweenFactorSE3`, `ReprojectionFactor` |
| `graph/values.ts` | Typed variable store (key → scalar, vector, SE2, SE3, point); retract and local operations |
| `graph/sparse.ts` | Triplet → CSC, sparse mat-vec, symbolic analysis, **approximate minimum degree** ordering, sparse Cholesky (left-looking or up-looking), `spyPattern` for visualization, `nnz` |
| `graph/solver.ts` | `gaussNewton`, `levenbergMarquardt` on manifolds. Options: max iterations, tolerances, ordering, `onIteration` callback (for animation). Dense fallback for problems with fewer than ~150 variables |
| `graph/robust.ts` | L2, Huber, Cauchy, Geman–McClure kernels (`rho`, `weight`); IRLS integration; **GNC** schedule |
| `graph/marginalize.ts` | Schur complement marginalization of a variable set, returning the induced dense factor |
| `graph/io.ts` | g2o reader and writer (SE2 vertices and edges; SE3 optional) |
| `sim/` | Seeded scenario generators: corridors, landmark fields, a **synthetic Manhattan-world pose graph** generator, figure-eight and loop trajectories, noisy odometry and sensors, outlier injection |
| `site/` | `url()` base-path helper, `syllabus.ts`, reading-time utility |

**Numerical rules:** use the Joseph form for KF covariance updates; symmetrize covariances after every update; wrap angles to (−π, π] everywhere angles are subtracted; never invert when you can solve.

**Datasets:** use synthetic data from `sim/` by default. Real public datasets (e.g. Intel Research Lab, M3500) may be added only after checking their license or redistribution terms. If added, credit them in the caption and in References. Record the decision in PROGRESS.md.

### 5.2 Widgets

**Layers:**
1. **Primitives** (`components/primitives/`): reusable, presentational, no domain logic. Examples: `Plot2D` (sets up scales and a coordinate frame, and supports pan/zoom if enabled), `Axes`, `CovEllipse` (takes a mean and covariance), `Robot2D` (pose → triangle glyph), `Landmark`, `Heatmap` (canvas), `MatrixView` (renders a small matrix with KaTeX, cells highlighted by value), `Spy` (sparsity pattern), `Slider` (label can contain KaTeX, shows its value and units, keyboard step), `Toggle`, `Select`, `PlayControls` (play/pause/step/reset, speed), `SeedControl` ("new random seed" plus a "back to default" button), `Legend` (driven by the semantic tokens).
2. **Widgets** (`components/widgets/<Name>/`): one per demo listed in §11. A widget owns its state as Svelte 5 `$state`, calls `lib` functions, and composes primitives.

**Shared widget behavior:**
- A `useAnimationLoop(step, {fps})` helper based on `requestAnimationFrame` that pauses when the widget is off-screen (IntersectionObserver) or the tab is hidden, and never autoplays under `prefers-reduced-motion`.
- Simulation is a pure function of (parameters, seed, step index), so Reset and step-backward are always possible. Cache trajectories rather than re-simulating every frame.
- Heavy computation (pose-graph solves, more than ~2,000 particles) runs in a worker. The widget shows a small "solving…" state and stays responsive.
- Layout: the widget frame has a title bar, the canvas or SVG area, a controls area (stacked below on narrow screens, to the side on wide ones), and a caption with **"What to look for"**.
- Sizing: fill the container width, set height by aspect ratio, and handle resizes with ResizeObserver. Widgets may use the `wide` column (§6.5).
- Accessibility: every control is reachable and usable by keyboard; draggable handles also respond to arrow keys; each widget has an `aria-label` description, and a visually hidden live region summarizes key numbers when they change (e.g. "Kalman gain 0.62").
- Root element: `data-widget="<Name>"`.
- Embedded in MDX as `<WidgetName client:visible />`, with optional props for presets (e.g. `preset="diverging"`) so one widget can serve several points in a post.

### 5.3 Content model

`src/content.config.ts` defines the `posts` collection with a Zod schema:

```ts
{
  number: number,                  // 1..32, must match syllabus.ts
  title: string,
  description: string,             // ≤ 160 chars, used for meta and RSS
  part: 0 | 1 | 2 | 3 | 4 | 5,
  status: 'draft' | 'published',   // drafts are excluded from production builds
  date: Date,                      // first publication
  updated?: Date,
  prerequisites: string[],         // slugs; must exist in syllabus.ts
  objectives: string[],            // 3–5 "After this post you can…" items
  references: { key: string, text: string, url?: string }[],
  widgets: string[],               // names used in the post (checked by validator)
  needs3d?: boolean
}
```

The slug comes from the folder name (`NN-slug`, URL `/posts/slug/`; the number is dropped from the URL).

### 5.4 Pages and navigation

- **Home (`/`)**: site title, a two-sentence pitch, and the `SyllabusMap`: all parts and posts, each marked **published** (linked) or **coming soon** (greyed out), with its one-line description. A short "How to read this series" note.
- **Post (`/posts/<slug>/`)**: part label and number, title, date, reading time; **Prerequisites** box (linked); **Objectives** box; the content; **Summary**; **References**; previous/next navigation in syllabus order (skipping unpublished posts); giscus comments (when configured); "Report an issue" link (prefilled GitHub issue URL). A sticky table of contents on wide screens.
- **Notation (`/notation/`)**: the full table from §6.1, rendered with KaTeX and grouped by part.
- **About (`/about/`)**: purpose, audience, how the site is built (mentioning that the code and text are written with Claude Code, under the owner's direction), licenses, a link to the repo.
- **RSS (`/rss.xml`)**, **404**, sitemap (`@astrojs/sitemap`), Open Graph and Twitter meta. OG images: a static default image per part is fine.
- Header: site name, Syllabus, Notation, About, search (Pagefind), theme toggle (light/dark/system, remembered in localStorage with try/catch).

### 5.5 MDX content components

| Component | Purpose |
|---|---|
| `<Callout type="intuition | warning | note | key">` | Boxed asides. **key** marks the one idea to remember |
| `<Sidenote>` | Tufte-style margin note on wide screens, inline expandable on narrow ones |
| `<Derivation title="…">` | Collapsible full derivation (closed by default) |
| `<AlgorithmBox title="…">` | Numbered pseudocode with KaTeX |
| `<TryThis>` | List of 2–4 concrete things to do with the widget above it |
| `<Figure caption="…">` | Static SVG diagrams (written inline as SVG or Svelte without hydration) |

`<Objectives>`, `<Prereqs>` and `<References>` are rendered automatically by `PostLayout` from frontmatter.

---

## 6. Notation and visual language

### 6.1 Notation table (canonical)

Typography: scalars are italic ($x$), vectors are bold lowercase ($\mathbf{x}$), matrices are bold uppercase ($\mathbf{P}$). Time index $k$. Hats are estimates, tildes are measured quantities.

| Symbol | Meaning |
|---|---|
| $\mathbf{x}_k$ | state at time $k$ (in SLAM: may include poses and landmarks) |
| $\hat{\mathbf{x}}_{k\mid k-1}$, $\mathbf{P}_{k\mid k-1}$ | predicted mean and covariance |
| $\hat{\mathbf{x}}_{k\mid k}$, $\mathbf{P}_{k\mid k}$ | updated (posterior) mean and covariance |
| $\mathbf{u}_k$ | control input / odometry |
| $x_k, y_k, \theta_k$ | components of a planar pose: position and heading (italic; the bold $\mathbf{x}_k$ is the whole state) |
| $d_k, \Delta\theta_k$ | odometry reading: distance driven, then turn ("move, then turn" model) |
| $\alpha$ | odometry noise level, error standard deviation per $\sqrt{\text{m}}$ (Part 0; the UKF's $\alpha$ is a different parameter) |
| $\ell$ | total distance driven |
| $\mathbf{z}_k$ | measurement |
| $\mathbf{F}_k$, $f(\cdot)$ | linear state transition / nonlinear motion model |
| $\mathbf{B}_k$ | control-input matrix |
| $\mathbf{H}_k$, $h(\cdot)$ | linear measurement matrix / nonlinear measurement model |
| $\mathbf{w}_k \sim \mathcal{N}(\mathbf{0},\mathbf{Q}_k)$ | process noise and its covariance |
| $\mathbf{v}_k \sim \mathcal{N}(\mathbf{0},\mathbf{R}_k)$ | measurement noise and its covariance |
| $\boldsymbol{\nu}_k$, $\mathbf{S}_k$ | innovation and innovation covariance |
| $\mathbf{K}_k$ | Kalman gain |
| $\boldsymbol{\Omega} = \mathbf{P}^{-1}$, $\boldsymbol{\xi} = \boldsymbol{\Omega}\hat{\mathbf{x}}$ | information matrix and information vector |
| $\mathcal{N}(\boldsymbol{\mu}, \boldsymbol{\Sigma})$ | Gaussian (generic mean and covariance, used in Part 0) |
| $\mu, \sigma$; $\sigma_x, \sigma_y$; $\rho$ | scalar mean and standard deviation; per-axis standard deviations and correlation coefficient of a 2D Gaussian (Part 0) |
| $n$ | dimension of a generic random vector (Part 0; filters use $n_x, n_z$) |
| $\mathbf{v}_1, \mathbf{v}_2$ | unit eigenvectors of a covariance, matching $\lambda_1 \ge \lambda_2$ |
| $\mathbf{L}$ | lower-triangular Cholesky factor, $\boldsymbol{\Sigma} = \mathbf{L}\mathbf{L}^\top$ |
| $\mathbf{z}$ | standard-normal (whitened) vector, $\mathbf{z} \sim \mathcal{N}(\mathbf{0}, \mathbf{I})$ (Part 0; $\mathbf{z}_k$ with a time index is a measurement) |
| $\gamma$ | level of a quadratic-form contour, $d_M^2 = \gamma$ |
| $\chi^2_n(p)$ | $p$-quantile of the chi-square distribution with $n$ degrees of freedom |
| $\mathbf{x}_1, \mathbf{x}_2$; $\boldsymbol{\Sigma}_{11}, \boldsymbol{\Sigma}_{12}, \ldots$; $\boldsymbol{\Omega}_{11}, \boldsymbol{\xi}_1, \ldots$ | blocks of a partitioned Gaussian, its covariance and its information form (Part 0) |
| $a$ | an observed value being conditioned on, as in $x = a$ (Part 0) |
| $\mathbf{A}, \mathbf{b}$ | matrix and offset of a generic linear map $\mathbf{y} = \mathbf{A}\mathbf{x} + \mathbf{b}$ (Part 0) |
| $\mathbf{J}$ (Part 0–2) | Jacobian $\partial f/\partial\mathbf{x}$ of a single function at the linearization point (Part 4's stacked $\mathbf{J}$ is the same idea for all residuals) |
| $r, \theta$ | range and bearing of a polar reading |
| $m$ | number of measurements (Part 1) |
| $t_i, y_i$ | data point $i$ in a curve fit: input and measured value (Part 1) |
| $\mathbf{y}$ | stacked measurements in a fit (Part 1); output of a function (Part 0) |
| $\mathbf{r} = \mathbf{y} - \mathbf{A}\mathbf{x}$ | residual vector of a linear fit (Part 1) |
| $\mathbf{W} = \diag(w_1, \ldots, w_m)$ | measurement weights, usually $w_i = 1/\sigma_i^2$ (Part 1) |
| $\mathcal{L}(\cdot)$ | likelihood: $p(\text{data} \mid \text{parameter})$ read as a function of the parameter |
| $\mu_0, \sigma_0$ | mean and standard deviation of a Gaussian prior (Part 1) |
| $\kappa$ | prior weight in MAP; 1 is ordinary Bayes, 0 ignores the prior (post 6) |
| $\bar{z}$ | average of the measurements (post 7) |
| $\mathcal{I}$ | Fisher information of one measurement (post 7) |
| $p(\cdot)$, $\mathrm{bel}(\mathbf{x}_k)$ | density; belief |
| $n_x, n_z$ | state and measurement dimensions |
| $\mathcal{X}^{[i]}$, $W^{[i]}_m, W^{[i]}_c$ | sigma points and their mean/covariance weights |
| $\mathbf{x}^{[i]}$, $w^{[i]}$ | particle $i$ and its (scalar) weight; $N_p$ particles; $N_{\text{eff}}$ effective sample size |
| $\epsilon_k$, $\epsilon_{\nu,k}$ | NEES and NIS |
| $d_M$ | Mahalanobis distance |
| $\mathbf{C} \in SO(n)$ | **rotation matrix** (Barfoot convention; $\mathbf{R}$ is reserved for measurement noise) |
| $\mathbf{T} \in SE(n)$ | pose / rigid transform; $\mathbf{T}_{ij}$ relative pose of $j$ in frame $i$ |
| $\mathbf{t}$ | translation |
| $\boldsymbol{\tau}$ | tangent-space (Lie algebra) vector |
| $(\cdot)^\wedge$, $(\cdot)^\vee$ | hat and vee |
| $\operatorname{Exp}$, $\operatorname{Log}$ | maps between $\mathbb{R}^n$ and the group (capitalized, Solà et al.) |
| $\oplus$, $\ominus$ | right-plus and right-minus on manifolds |
| $\mathbf{Ad}_{\mathbf{T}}$, $\mathbf{J}_r$, $\mathbf{J}_l$ | adjoint; right and left Jacobians |
| $\mathbf{m}_j$ | landmark $j$ |
| $\phi_i$ | factor $i$ |
| $\mathbf{r}_i$, $\boldsymbol{\Omega}_i$ | residual of factor $i$ and its information matrix |
| $c(\mathbf{x}) = \tfrac12\sum_i \lVert \mathbf{r}_i \rVert^2_{\boldsymbol{\Omega}_i}$ | total cost |
| $\mathbf{J}$ | stacked Jacobian of the residuals |
| $\boldsymbol{\Lambda} = \mathbf{J}^\top\boldsymbol{\Omega}\mathbf{J}$, $\boldsymbol{\eta} = -\mathbf{J}^\top\boldsymbol{\Omega}\mathbf{r}$ | Gauss–Newton system $\boldsymbol{\Lambda}\boldsymbol{\delta} = \boldsymbol{\eta}$ |
| $\boldsymbol{\delta}$ | update step; $\lambda$ the Levenberg–Marquardt damping |
| $\rho(\cdot)$ | robust kernel |
| $\mathbb{E}$, $\operatorname{Cov}$, $(\cdot)^\top$, $\mathbf{I}$ | expectation, covariance, transpose, identity |

Conflict notes, to be explained on the `/notation` page: $w^{[i]}$ (particle weight, scalar, superscript) vs $\mathbf{w}_k$ (process noise, bold); $\lambda$ for LM damping vs eigenvalues; $\rho$ (correlation, Part 0) vs $\rho(\cdot)$ (robust kernel); $\mathbf{z}$ (whitened vector, Part 0) vs $\mathbf{z}_k$ (measurement). Eigenvalues are written $\lambda_1, \lambda_2$ and appear only in Part 0, so context makes the meaning clear.

### 6.2 Colors and line styles (semantic tokens)

The palette is based on the colorblind-safe Okabe–Ito set. Define the tokens in `tokens.css` for both themes; dark-mode values may be lighter for contrast. **Meaning is never carried by color alone**: line style or marker shape always matches.

| Token | Meaning | Light | Dark | Style |
|---|---|---|---|---|
| `--c-truth` | ground truth | `#1a1a1a` | `#e8e8e8` | thin solid line, hollow markers |
| `--c-prior` | prior / prediction | `#0072B2` | `#56B4E9` | dashed line, dashed ellipse |
| `--c-meas` | measurement / likelihood / loop closure | `#E69F00` | `#F5B83D` | dots or crosses; dashed-dotted edges |
| `--c-post` | posterior / estimate | `#009E73` | `#2EC4A0` | thick solid line, solid ellipse |
| `--c-sample` | Monte Carlo samples / particles | `#CC79A7` | `#E09BC4` | small dots, low opacity |
| `--c-bad` | error, outlier, divergence | `#D55E00` | `#FF7F3F` | thick, with a warning icon in the legend |
| `--c-odom` | dead reckoning / odometry-only | `#8a8a8a` | `#9e9e9e` | dotted line |
| `--c-grid`, `--c-axis`, `--c-bg`, `--c-fg`, `--c-muted` | chrome | | | |

Heatmaps (covariance, information, sparsity) use a diverging scale for signed values (blue–white–vermillion) and a sequential scale for magnitudes, defined as tokens.

### 6.3 KaTeX macros (in `scripts/katex-macros.ts`, used both at build time and in widgets)

`\T` → `^{\top}`, `\E` → `\mathbb{E}`, `\Cov` → `\operatorname{Cov}`, `\N` → `\mathcal{N}`, `\R` → `\mathbb{R}`, `\Exp` → `\operatorname{Exp}`, `\Log` → `\operatorname{Log}`, `\SO` → `SO`, `\SE` → `SE`, `\so` → `\mathfrak{so}`, `\se` → `\mathfrak{se}`, `\bel` → `\mathrm{bel}`, `\diag` → `\operatorname{diag}`, `\tr` → `\operatorname{tr}`.

### 6.4 Typography
- Body: Source Serif 4, 19–20 px on desktop, 17–18 px on mobile, line height 1.6.
- UI and widgets: Inter. Code: JetBrains Mono.
- Display math may scroll horizontally on small screens; it never overflows the page.

### 6.5 Layout
- Text column: about 680 px. **Wide** column for widgets: up to about 960 px. Sidenote margin from 1200 px up.
- Light and dark themes, both first-class. Every widget is checked in both.
- Calm and academic in style, with a lot of white space. No decorative gradients; the animations supply the visual interest.

---

## 7. Writing style guide

### 7.1 Voice
- Write the way a clear, patient lecturer explains at a whiteboard: precise, friendly, never padded. Use "we" for derivations and "you" for instructions to the reader.
- Give the intuition before the formalism. Introduce each concept by the problem it solves.
- Be honest about simplifications ("we assume a single landmark for now; §… removes this").
- Avoid these filler patterns: "In this post we will explore", "Let's dive in", "It's important to note that", "delve", "In conclusion", "crucial/robust/seamless" used as filler, emoji, bold-heavy paragraphs, rhetorical "But here's the thing".

### 7.2 Post template (order of sections)
1. **Hook**: a concrete problem or question, often with the first widget in its simplest preset.
2. *(Rendered automatically)* Prerequisites and Objectives boxes.
3. **Intuition**: the idea in words and pictures, with no heavy math yet.
4. **The math**: define every symbol at first use. Follow each displayed equation with one plain-language sentence saying what it means. Put long derivations in `<Derivation>`.
5. **Play with it**: the main widget, followed by `<TryThis>` with 2–4 specific prompts that each tie to an insight ("Set ρ to 0.95. Notice that knowing x now almost fixes y.").
6. **Algorithm**: `<AlgorithmBox>` pseudocode where relevant, plus a link to the actual `src/lib` source file on GitHub.
7. **When it breaks / pitfalls**: failure modes, often shown with a widget preset.
8. **Summary**: 3–5 bullets.
9. *(Rendered automatically)* References, and next post.

Length: 1,500–4,000 words. If a post grows past that, split it and update the syllabus (record the decision).

### 7.3 Math conventions
- Number only equations that are referenced later, using `\tag{n}`.
- Show dimensions when introducing a matrix ($\mathbf{K}_k \in \mathbb{R}^{n_x\times n_z}$).
- Link back to earlier posts when reusing a result ("the conditioning formula from [Post 3](…)").

### 7.4 Correctness protocol (mandatory for every post)
1. Before writing, derive the key results and check them against at least one reference from §7.6.
2. Write a unit test that checks each key identity numerically (§8).
3. For every statement about widget behavior, run the widget's simulation with its default parameters in a test or script and confirm it.
4. Reread the finished post once with a single question in mind: "Is every symbol defined, and is every sentence true?"

### 7.5 Figures and widget captions
Every widget or figure caption says what is shown, what the ellipses mean (95% unless stated otherwise), and gives **"What to look for:"** in one or two sentences.

### 7.6 Core references (cite with chapter or section)
- Thrun, Burgard, Fox. *Probabilistic Robotics.* MIT Press, 2005.
- Barfoot. *State Estimation for Robotics*, 2nd ed. Cambridge University Press, 2024.
- Dellaert, Kaess. "Factor Graphs for Robot Perception." *Foundations and Trends in Robotics*, 2017.
- Solà, Deray, Atchuthan. "A micro Lie theory for state estimation in robotics." arXiv:1812.01537, 2018.
- Simon. *Optimal State Estimation.* Wiley, 2006.
- Bar-Shalom, Li, Kirubarajan. *Estimation with Applications to Tracking and Navigation.* Wiley, 2001.
- Kay. *Fundamentals of Statistical Signal Processing, Vol. I: Estimation Theory.* Prentice Hall, 1993.
- Kalman. "A New Approach to Linear Filtering and Prediction Problems." 1960.
- Rauch, Tung, Striebel. "Maximum likelihood estimates of linear dynamic systems." *AIAA Journal*, 1965.
- Julier, Uhlmann. "Unscented filtering and nonlinear estimation." *Proc. IEEE*, 2004.
- Arulampalam, Maskell, Gordon, Clapp. "A tutorial on particle filters for online nonlinear/non-Gaussian Bayesian tracking." *IEEE TSP*, 2002.
- Durrant-Whyte, Bailey. "Simultaneous localization and mapping: part I." *IEEE RAM*, 2006.
- Neira, Tardós. "Data association in stochastic mapping using the joint compatibility test." *IEEE TRA*, 2001.
- Grisetti, Kümmerle, Stachniss, Burgard. "A tutorial on graph-based SLAM." *IEEE ITS Magazine*, 2010.
- Olson, Leonard, Teller. "Fast iterative alignment of pose graphs with poor initial estimates." ICRA 2006.
- Kaess et al. "iSAM2: Incremental smoothing and mapping using the Bayes tree." *IJRR*, 2012.
- Sünderhauf, Protzel. "Switchable constraints for robust pose graph SLAM." IROS 2012.
- Yang, Antonante, Tzoumas, Carlone. "Graduated non-convexity for robust spatial perception." *IEEE RA-L*, 2020.
- Triggs, McLauchlan, Hartley, Fitzgibbon. "Bundle adjustment: a modern synthesis." 2000.

---

## 8. Testing and quality

### 8.1 Unit tests (Vitest), mandatory invariants

| Area | Invariant |
|---|---|
| matrix | $\mathbf{L}\mathbf{L}^\top = \mathbf{A}$ for random SPD $\mathbf{A}$; solve residual < 1e-10; inverse × A ≈ I; `eigSym` reconstructs A |
| rng | Same seed gives the same sequence; sample mean and variance of `normal()` within tolerance for n = 1e5 |
| gaussian | Sample covariance → cov (seeded, with tolerance); `condition` and `marginalize` match closed form on a hand-computed 2D case; the fraction of samples inside the 95% ellipse ≈ 0.95; `product` matches closed form |
| stats | `chi2Quantile` matches table values |
| kf | **Last KF estimate equals the batch MAP / weighted least-squares solution** on a linear-Gaussian problem; P symmetric PSD after every step; Joseph and standard forms agree |
| rts | **RTS smoother equals the batch solution for all states** |
| ekf, ukf | On a *linear* model, EKF and UKF match the KF to within 1e-9 |
| consistency | For a correctly tuned filter over 200 seeded Monte Carlo runs, the average NEES lies inside its 95% chi² bounds |
| pf | On a 1D linear-Gaussian problem with $N_p$ = 5,000, the PF mean is within tolerance of the KF; weights sum to 1; systematic resampling preserves the expected counts |
| histogram | Belief sums to 1; moving with no noise is an exact shift |
| info | The information filter matches the KF |
| geometry | `Exp(Log(T)) = T`; `Log(Exp(τ)) = τ` for ‖θ‖ < π; **every analytic Jacobian matches central finite differences** (rel. error < 1e-6); compose is associative; T∘T⁻¹ = I; quaternion ↔ rotation-matrix round trip |
| sparse | Sparse Cholesky equals dense Cholesky on random sparse SPD matrices; the AMD ordering is a valid permutation and does not increase fill-in compared with natural ordering on grid-like test graphs |
| solver | Gauss–Newton solves a linear problem in one iteration; a noise-free synthetic pose graph reaches cost ≈ 0 and recovers truth up to gauge; LM decreases the cost monotonically |
| robust | Kernels' $\rho$, weights and derivatives match their definitions; with injected outliers, GNC recovers the inlier solution on a seeded scenario |
| marginalize | The Schur-complement marginal equals the covariance-form marginal |
| io | g2o read, write, read round trip |

### 8.2 Content validation (`npm run validate`)
- Frontmatter matches the schema and its `syllabus.ts` entry.
- Prerequisites exist and have lower numbers than the post.
- Each name in `widgets` is used in the MDX, and each widget used is listed.
- Internal links resolve (including the base path).
- No hex colors in `src/components/**` (grep check).
- No `Math.random` in `src/**`.

### 8.3 E2E smoke tests (Playwright, against `npm run preview`)
- Visit every page: HTTP 200, **no console errors**.
- On each post: scroll every `[data-widget]` into view, check that it mounts, and click its Reset and Play controls when they exist.
- Take screenshots at 375×800 and 1280×900, light and dark, and save them as CI artifacts (no pixel-diff assertions).
- Accessibility: run `@axe-core/playwright` on the home page and on every post, and fail on serious or critical violations.

### 8.4 Performance budgets (targets; report them in PROGRESS.md)
- Post page with no widget hydrated: under 50 KB JavaScript.
- Each widget island under ~80 KB gzipped, not counting shared chunks. Three.js loads only on posts with `needs3d: true`.
- Animations hold 60 fps on a mid-range laptop; nothing heavier than a single frame's work runs on the main thread.
- Lighthouse (manual or CI, optional): Performance ≥ 90, Accessibility ≥ 95.

---

## 9. Build, CI and deployment

- `astro.config.mjs`: `site: 'https://<username>.github.io'`, `base: '/gaussians-to-graphs'`, `trailingSlash: 'always'`, integrations for MDX, Svelte and sitemap, remark-math and rehype-katex with the shared macros.
- **`ci.yml`** (pull requests): checkout, set up Node (LTS) with npm cache, `npm ci`, install Playwright Chromium, `npm run verify`, upload screenshots as artifacts.
- **`deploy.yml`** (push to `main` plus manual trigger): build with `withastro/action`, then deploy with `actions/deploy-pages`. Permissions: `pages: write`, `id-token: write`. Use a concurrency group so only one deploy runs at a time.
- Production builds exclude `status: 'draft'` posts.
- Branching: Claude Code works on `post/NN-slug` or `infra/<topic>` branches, opens a PR with `gh pr create`, waits for CI (`gh pr checks --watch`), then merges (`gh pr merge --squash --delete-branch`).

---

## 10. `docs/PROGRESS.md` format

Claude Code creates this file in Phase 0 and keeps it current.

```markdown
# Progress
## Current phase: <n> — <name>
## Next task: <one line>
## Posts
| # | Slug | Status (todo/in-progress/published) | Widgets | Notes |
## Infrastructure checklist
## Decisions (dated, one line each, with reason)
## Follow-ups / known issues
## Performance report (per post: JS size, notes)
```

---

## 11. Syllabus and per-post specifications

Format: **NN · `slug` · Title**. *Prereqs.* Objectives. Widgets (main ones in bold). The objectives listed are the minimum; posts may add to them.

### Part 0: Foundations

**01 · `where-am-i` · Where Am I? Why Estimation Matters.** *Prereqs: none.*
Objectives: why every sensor and motion model is uncertain; estimation as "best guess plus honest uncertainty"; a map of the series.
Widgets: **`DriftFan`**: a robot drives a fixed loop; N seeded odometry-only runs fan out and the spread grows over time. Sliders: odometry noise, N. Toggle to show ground truth. *Follow-up in Phase 4:* add a "close the loop" toggle that shows the pose-graph-corrected estimate snapping back. The `SyllabusMap` is embedded at the end.

**02 · `gaussians-and-covariance` · Gaussians and Covariance.** *Prereqs: 01.*
Objectives: the 1D and nD Gaussian; what covariance and correlation mean geometrically; eigenvectors and eigenvalues as the ellipse's axes; Mahalanobis distance; confidence regions and the chi² quantile.
Widgets: **`Gaussian1D`**: μ and σ sliders, with ±1/2/3σ areas shaded and their probabilities shown. **`CovarianceEllipse`**: sliders for σx, σy and ρ, or drag the ellipse handles; the matrix updates live in KaTeX; eigenvectors drawn; toggle a sample scatter with a live count of "% inside the 95% ellipse".

**03 · `conditioning-and-marginalizing` · Slicing and Squashing: Conditioning vs. Marginalizing.** *Prereqs: 02.*
Objectives: joint, marginal and conditional Gaussians; the closed-form formulas; the Schur complement; the duality that covariance form makes marginalizing easy while information form makes conditioning easy (used again in posts 19 and 28).
Widgets: **`SliceVsProject`**: a 2D Gaussian heatmap; drag a vertical line at x = a to show $p(y\mid x=a)$ in a side plot; toggle to show the marginal $p(y)$; ρ slider; formulas shown with live numbers.

**04 · `propagating-uncertainty` · Pushing Gaussians Through Functions.** *Prereqs: 03.*
Objectives: linear transformation ($\mathbf{A}\boldsymbol\mu$, $\mathbf{A}\boldsymbol\Sigma\mathbf{A}^\top$); nonlinear functions handled by Monte Carlo vs. first-order linearization; Jacobians; when linearization fails.
Widgets: **`NonlinearPropagation`**: choose a function (polar→Cartesian, $x^2$, $\sin$); input Gaussian sliders; output shows MC samples, the sample-covariance ellipse and the linearized ellipse together. The polar case produces the "banana".

### Part 1: Estimation theory

**05 · `least-squares` · Least Squares, Seen as Squares.** *Prereqs: 02.*
Objectives: problem setup, normal equations, the projection view, weighted least squares, residual analysis.
Widgets: **`LineFit`**: drag data points; each residual drawn as an actual square whose area is its squared error; total area shown; per-point weight sliders (WLS); toggle "least absolute deviations" to compare outlier behavior. A static `<Figure>` illustrates the projection onto the column space.

**06 · `mle-and-map` · Likelihood, Priors, and the Posterior.** *Prereqs: 05.*
Objectives: likelihood vs. probability; MLE; Gaussian noise ⇒ MLE = least squares; prior ⇒ MAP = regularized least squares; Bayes' rule.
Widgets: **`BayesGrid1D`**: a draggable prior (Gaussian, uniform or bimodal preset); click to add measurements; likelihood and posterior update live; MLE and MAP markers; a "prior strength" slider.

**07 · `estimator-quality` · What Makes a Good Estimator?** *Prereqs: 06.*
Objectives: bias, variance, MSE, consistency, efficiency, Fisher information, the Cramér–Rao lower bound.
Widgets: **`EstimatorShootout`**: repeat a seeded experiment M times; histograms of the estimates from the sample mean, median and a shrinkage estimator; CRLB line; sample-size slider showing variance falling as 1/n; switch the noise to heavy-tailed to see the median win.

**08 · `recursive-least-squares` · Learning One Measurement at a Time.** *Prereqs: 05, 06.*
Objectives: batch → recursive form; gain; covariance update; forgetting factor. This is the conceptual bridge to the Kalman filter.
Widgets: **`RLSStream`**: points stream in; the line estimate updates with an uncertainty band; a "batch solution" overlay coincides exactly; a forgetting-factor slider plus a mid-stream parameter jump preset.

**09 · `nonlinear-least-squares` · Nonlinear Least Squares: Gauss–Newton and Levenberg–Marquardt.** *Prereqs: 04, 05.*
Objectives: linearize and iterate; Gauss–Newton steps; LM damping; local minima; initialization matters.
Widgets: **`CostLandscape`**: 2D trilateration (find a point from noisy ranges to anchors); contour plot of the cost; click to choose the start; step through the GN and LM paths side by side; λ slider; presets that show GN diverging while LM succeeds.

### Part 2: Bayes filters and the Kalman family

**10 · `bayes-filter` · The Bayes Filter: Predict, Update, Repeat.** *Prereqs: 06.*
Objectives: belief; the Markov assumption; prediction as convolution, update as multiplication, normalization; the histogram filter.
Widgets: **`CorridorRobot`**: a 1D corridor with doors; belief histogram; Move and Sense buttons plus autoplay; sensor hit/false-alarm and motion-noise sliders; a "kidnap the robot" button.

**11 · `kalman-filter-1d` · The Kalman Filter in One Dimension.** *Prereqs: 10, 03.*
Objectives: Gaussian beliefs; prediction adds variance; the update as a product of Gaussians; the gain as a trust ratio.
Widgets: **`GaussianProduct`**: drag two Gaussians and see their normalized product, with a live readout of the gain. **`Tracker1D`**: step through time; prediction, measurement and posterior curves shown each step; variance-over-time plot converging to steady state.

**12 · `kalman-filter` · The Kalman Filter.** *Prereqs: 11.*
Objectives: state-space models; the full multivariate equations with dimensions; constant-velocity model; estimating hidden states (velocity) that are never measured.
Widgets: **`CVTracker2D`**: a target moves; position-only measurements; predicted and updated ellipses at each step; side plot of the velocity estimate and its ±2σ band converging; play/step.

**13 · `tuning-and-consistency` · Tuning Q and R, and Knowing When a Filter Lies.** *Prereqs: 12, 07.*
Objectives: the effects of Q and R; innovations; NIS and NEES with chi² bounds; overconfident vs. underconfident filters; divergence; the Joseph form and numerical hygiene.
Widgets: **`TuningLab`**: separate controls for the *true* noise and the filter's *assumed* Q and R; live NEES and NIS plots with 95% bounds; an automatic label ("consistent / overconfident / underconfident"); presets.

**14 · `robot-models-2d` · Robots in the Plane: Motion and Sensor Models.** *Prereqs: 04.*
Objectives: unicycle and odometry motion models; noise in control space vs. state space; range–bearing sensors; their Jacobians.
Widgets: **`MotionModelSampler`**: choose controls and sample the motion model (the banana again); noise sliders. **`RangeBearing`**: a robot and landmarks; measurement rays with noise wedges; drag the robot.

**15 · `extended-kalman-filter` · The Extended Kalman Filter.** *Prereqs: 12, 14.*
Objectives: linearizing around the estimate; EKF localization with known landmarks; failure modes (large uncertainty, strong nonlinearity, poor linearization point).
Widgets: **`EKFLocalization`**: the robot drives a path among landmarks; truth, odometry and EKF estimate with ellipses; sensing-range slider; noise sliders; a "break it" preset with a large initial error.

**16 · `unscented-kalman-filter` · The Unscented Kalman Filter.** *Prereqs: 15.*
Objectives: sigma points and weights; the unscented transform; comparison with the EKF; the α, β, κ parameters.
Widgets: **`UnscentedTransform`**: the same function choices as post 04, overlaying the MC, linearized and UT results. **`UKFvsEKF`**: both filters run side by side on the same seeded scenario, with an error plot.

**17 · `particle-filter` · Particle Filters and Monte Carlo Localization.** *Prereqs: 10, 14.*
Objectives: sampling, importance weighting, resampling; ESS; degeneracy and impoverishment; global localization.
Widgets: **`MCL`**: a 2D map with walls and landmarks; particles (canvas); start from uniform for global localization; a kidnapping button; $N_p$ slider; resampling-scheme selector; ESS-over-time plot. Run in a worker when $N_p$ > 2,000.

**18 · `smoothing` · Looking Back: Filtering vs. Smoothing vs. Batch.** *Prereqs: 12.*
Objectives: the difference between filtering and smoothing; the RTS smoother; smoothing = batch MAP for linear-Gaussian problems; fixed-lag smoothing.
Widgets: **`FilterVsSmoother`**: a 1D or 2D trajectory; filtered and smoothed estimates with bands; a time scrubber; an overlay showing smoothed = batch.

**19 · `information-filter` · The Information Form and the Shape of Sparsity.** *Prereqs: 18, 03.*
Objectives: the information filter; cheap updates vs. expensive predictions; when estimating the full trajectory, Ω is sparse while P is dense. This foreshadows SLAM.
Widgets: **`InfoVsCov`**: two heatmaps of P and Ω as states are added over time (full-trajectory estimation); the band structure of Ω vs. the dense P; nonzero counts shown.

### Part 3: Geometry for robotics

**20 · `rotations` · Rotations Without Tears.** *Prereqs: 02.* *needs3d*
Objectives: 2D rotation; rotation matrices in 3D; Euler angles and gimbal lock; axis–angle; unit quaternions; slerp vs. naive interpolation.
Widgets: **`EulerGimbal`** (Threlte): gimbal rings with yaw, pitch and roll sliders; lock visibly appears at ±90° pitch. **`QuaternionSlerp`**: interpolate between two orientations; compare the paths traced on a sphere by slerp and by naive Euler-angle interpolation.

**21 · `lie-groups-for-robotics` · A Gentle Lie Theory for Robotics.** *Prereqs: 20, 04.*
Objectives: groups and manifolds; the tangent space; Exp and Log; ⊕ and ⊖; adjoint; Jacobians; SE(2) in depth, SE(3) in summary.
Widgets: **`TangentSpace`**: the SO(2) unit circle with its tangent line; drag a tangent vector and watch Exp wrap it onto the circle. **`SE2Exp`**: twist sliders (v, ω) → the constant-velocity arc, compared with naive "vector addition" of the pose.

**22 · `uncertainty-on-poses` · Uncertainty on Poses: Where Bananas Come From.** *Prereqs: 21.*
Objectives: Gaussians defined in the tangent space; compounding uncertain poses; propagation with the adjoint; why Cartesian ellipses misrepresent pose uncertainty.
Widgets: **`PoseCompounding`**: a chain of noisy relative poses; MC samples of the final pose vs. a Cartesian Gaussian ellipse (poor fit) vs. a tangent-space Gaussian pushed through Exp (good fit); heading-noise slider.

### Part 4: SLAM

**23 · `the-slam-problem` · The SLAM Problem.** *Prereqs: 15, 22.*
Objectives: full vs. online SLAM; why robot and landmark estimates become correlated; the graphical model; gauge freedom.
Widgets: **`CorrelationsEmerge`**: a robot observes landmarks; links drawn between robot and landmarks, and between landmarks, with thickness showing correlation strength; re-observing one landmark shrinks the uncertainty of all of them.

**24 · `ekf-slam` · EKF-SLAM.** *Prereqs: 23.*
Objectives: state augmentation; landmark initialization; O(n²) cost; inconsistency issues.
Widgets: **`EKFSLAM`**: the robot explores; landmark ellipses; a live covariance heatmap growing and filling in; a loop-closure moment where every ellipse shrinks.

**25 · `data-association` · Data Association: Which Landmark Is That?** *Prereqs: 24.*
Objectives: nearest neighbor; Mahalanobis gating; ambiguity; joint compatibility (JCBB); what a wrong association does.
Widgets: **`AssociationGating`**: predicted landmark ellipses and incoming measurements; gate-threshold slider; NN vs. JCBB association lines; a clutter slider; a "force a wrong association" button that shows the filter diverging.

**26 · `factor-graphs` · Factor Graphs: SLAM as Optimization.** *Prereqs: 09, 18, 23.*
Objectives: Bayes nets → factor graphs; MAP inference as nonlinear least squares; factors as weighted residuals; linearization gives a sparse system; the link to smoothing (post 18).
Widgets: **`FactorGraphBuilder`**: a small 2D problem; add prior, odometry and landmark factors by clicking; the graph, the Jacobian sparsity pattern and Λ update live; Solve button.

**27 · `pose-graph-optimization` · Pose Graph Optimization.** *Prereqs: 26, 22.* (Showpiece post)
Objectives: pose-only graphs; relative-pose factors on SE(2); loop closures; fixing the gauge with a prior; Gauss–Newton on the manifold.
Widgets: **`PoseGraph2D`**: a synthetic Manhattan-world dataset; animated GN/LM iterations snapping a drifted trajectory into place; toggle loop closures on and off; noise sliders; cost-per-iteration plot; solver runs in a worker. Optionally loads a real dataset (license check required, §5.1).

**28 · `sparsity-and-solvers` · Sparsity, Ordering, and Marginalization.** *Prereqs: 27, 19.*
Objectives: the structure of Λ; variable ordering (natural vs. AMD); fill-in; sparse Cholesky; marginalization as a Schur complement and the fill-in it creates; sliding-window estimation.
Widgets: **`SparsityExplorer`**: spy plots of Λ and its Cholesky factor L under different orderings, with nonzero counts and solve times. **`MarginalizationFill`**: click a pose to marginalize it and watch the dense block it leaves among its neighbors.

**29 · `robust-optimization` · When Loop Closures Lie: Robust Optimization.** *Prereqs: 27.*
Objectives: outlier loop closures; M-estimators and IRLS; kernel shapes; graduated non-convexity; an overview of switchable constraints.
Widgets: **`OutlierLoopClosures`**: inject k false loop closures into the post-27 dataset; choose a kernel (L2, Huber, Cauchy, Geman–McClure, GNC); a kernel-shape plot; watch the map break and then recover; inlier/outlier edge coloring.

**30 · `incremental-smoothing` · Incremental Smoothing: The Idea Behind iSAM.** *Prereqs: 28.*
Objectives: why re-solving from scratch at every step is wasteful; incremental factorization; the iSAM and iSAM2 ideas (Bayes tree, fluid relinearization) at an intuitive level.
Widgets: **`IncrementalVsBatch`**: an online run where, at each new step, the variables that need updating (the affected subtree of the elimination tree) are highlighted; a work-per-step timeline comparing full batch with incremental updates. *Scope note:* a full iSAM2 implementation is **not** required. The widget may compute the affected set from the elimination tree and use a partial re-solve. The text must say clearly what is simplified.

**31 · `toward-3d-and-vision` · Toward 3D and Vision: Bundle Adjustment.** *Prereqs: 28, 21.* *needs3d*
Objectives: SE(3) pose graphs; the pinhole camera; reprojection error; bundle adjustment; the Schur-complement trick for landmarks; a brief map of modern visual SLAM systems.
Widgets: **`PinholeProjection`**: a 3D point projected onto an image plane, with draggable camera parameters. **`BundleAdjustmentMini`** (Threlte): a few cameras and points; reprojection residuals drawn; step through the optimization.

**32 · `capstone-mini-slam` · Capstone: Build-Your-Own 2D SLAM.** *Prereqs: 25, 27, 29.*
Objectives: assemble a full pipeline (front-end: data association and loop-closure detection by proximity plus gating; back-end: pose/landmark graph with a robust kernel, in a worker) and see what each component contributes.
Widgets: **`DriveYourOwnSLAM`**: drive with the keyboard or on-screen touch controls; simulated range–bearing sensing; the live graph and map; toggles to disable loop closure or the robust kernel and watch it fail. Also complete the post-01 follow-up.

### Part 5: Extensions (future, not scheduled)
ICP and scan matching; IMU preintegration; visual–inertial odometry; observability and consistency in SLAM; multi-robot SLAM; an interactive prerequisite-graph page. Add these to `syllabus.ts` only when the owner asks.

---

## 12. Roadmap

Each phase ends with its acceptance criteria met and PROGRESS.md updated.

### Phase 0: Foundation
- Scaffold Astro + MDX + Svelte + KaTeX (including the MDX math risk check, §3), TypeScript strict, ESLint/Prettier, Vitest, Playwright, axe.
- Tokens and themes, fonts, `BaseLayout` and `PostLayout`, header and footer, theme toggle, `SyllabusMap`, Home, Notation (full table), About, 404, RSS, sitemap, Pagefind.
- `syllabus.ts` with all 32 entries; content schema; `validate-content.ts`.
- MDX content components (§5.5).
- `lib/math` (matrix, rng, gaussian, stats) with tests; `lib/site`.
- Primitives: Plot2D, Axes, CovEllipse, Slider, Toggle, Select, PlayControls, SeedControl, Legend, MatrixView, KaTeXInline, plus the `useAnimationLoop` helper.
- CI and deploy workflows; the first deployment.
- **Post 02 published end to end** as the reference implementation of the post template.
- Create PROGRESS.md and README.md; add licenses.

**Acceptance:** the live site works under the base path; `verify` is green; post 02 meets the full definition of done; home shows 1 published post and 31 marked coming soon.

### Phase 1: Parts 0 and 1
Posts 01, 03–09 (post 01 without its Phase 4 follow-up). Lib: `models/` nonlinear test functions, the basic `geometry/se2` needed by `DriftFan`, nonlinear least squares in `graph/solver` (dense).
**Acceptance:** 9 posts published; all invariants for these modules pass.

### Phase 2: Part 2
Posts 10–19. Lib: `filters/*`, `models/*`, consistency tools, workers for the PF.
**Acceptance:** 19 posts published; the KF==batch, RTS==batch, EKF/UKF==KF-on-linear and NEES-consistency tests pass.

### Phase 3: Part 3
Posts 20–22. Lib: full `geometry/*` with Jacobian tests; Threlte set up with lazy loading.
**Acceptance:** 22 posts; Three.js is absent from bundles of posts without `needs3d`.

### Phase 4: Part 4
Posts 23–32. Lib: `graph/*` (sparse, AMD, solver on manifolds, robust kernels, GNC, marginalization, g2o I/O), `sim/` Manhattan generator, solver workers. Post 01 follow-up.
**Acceptance:** 32 posts published; the pose-graph solver handles the default synthetic dataset (≥ 1,000 poses) quickly enough to animate iterations smoothly; all invariants pass.

### Phase 5: Polish
A full-series consistency pass (notation, cross-links, voice), a performance pass, an accessibility pass, Open Graph images, and a final cleanup of the README and About pages. Then consider Part 5 if the owner asks.

---

## 13. Licensing
- Code: MIT (`LICENSE`).
- Prose and figures: CC BY 4.0 (`LICENSE-CONTENT`), noted in the footer.
- Third-party datasets: only if redistribution is allowed, with attribution.
