# CLAUDE.md

## What this project is

**From Gaussians to Graphs**: a free, static blog that teaches estimation theory, Kalman filtering, SLAM and pose-graph optimization through written explanations and **interactive in-browser animations**. It is hosted on GitHub Pages.

**You (Claude Code) write all of the code and all of the prose.** The owner reviews the live site but does not edit files by hand. Each post and each widget must therefore be finished, correct and verified before you merge it.

- Full specification: `docs/DESIGN.md` (architecture, notation, style guide, syllabus, roadmap)
- Current state and decisions: `docs/PROGRESS.md`

**At the start of every session:** read `docs/PROGRESS.md`, then the sections of `docs/DESIGN.md` that are relevant to the next task.

## Environment

You run **inside a dev container** (`.devcontainer/`, Debian + Node 22). The owner wants nothing installed on the host machine.
- Install everything (npm packages, Playwright browsers with `npx playwright install --with-deps chromium`, apt packages via `sudo`) **inside the container only**.
- Never tell the owner to install tools on the host. If the toolchain needs something permanently, add it to `.devcontainer/` (feature, Dockerfile or `post-create.sh`) so a rebuild reproduces it, and mention that a rebuild is needed.
- `node_modules` is a Docker volume mounted into the workspace. Don't delete the directory itself (only its contents, if needed).
- The dev server must listen on port 4321; VS Code forwards it to the host browser.

## Commands

```bash
npm install
npm run dev          # local dev server
npm run build        # production build (includes Pagefind index)
npm run preview      # serve the production build
npm run check        # astro check + svelte-check (types)
npm run lint         # eslint + prettier --check
npm run format       # prettier --write
npm test             # vitest unit tests (src/lib)
npm run test:e2e     # playwright smoke tests against the production build
npm run validate     # content validation (frontmatter, prerequisites, links, notation)
npm run verify       # ALL of the above, in order; must pass before every merge
```

(Create these scripts in Phase 0 if they do not exist yet.)

## Repository map (short)

```
src/lib/          pure TypeScript math & algorithms, NO DOM, NO Svelte
src/components/   primitives/ (reusable drawing + controls), widgets/ (one per demo), content/ (MDX helpers), layout/
src/content/posts/NN-slug/index.mdx   one folder per post
src/pages/        home, notation, about, posts/[slug], rss, 404
src/styles/       tokens.css (colors, spacing, fonts), global.css
tests/            unit/ (vitest), e2e/ (playwright)
scripts/          validate-content.ts and other tooling
docs/             DESIGN.md, PROGRESS.md
```

## Non-negotiable rules

### Architecture
1. **All algorithms live in `src/lib/`** as pure, typed, side-effect-free TypeScript. Widgets import them and only render and handle input. Never reimplement math inside a component.
2. **Every exported `lib` function has unit tests.** Use the invariant tests listed in DESIGN §8 (e.g. KF == batch least squares, analytic Jacobians == finite differences).
3. **All randomness goes through `src/lib/math/rng.ts` with an explicit seed.** Never use `Math.random()`.
4. **The site is served under a base path** (`/<repo-name>/`). Build internal links and asset paths with the `url()` helper in `src/lib/site/url.ts`. Never hardcode a leading `/`.
5. Computation that takes more than ~16 ms per frame (pose-graph solves, big particle sets) runs in a Web Worker.

### Notation and visual language
6. Use the symbols in the DESIGN §6 notation table **exactly**. If you need a new symbol, add it to the table and to the `/notation` page in the same commit.
7. Colors come only from the semantic CSS variables in `src/styles/tokens.css` (`--c-prior`, `--c-meas`, `--c-post`, `--c-truth`, …). Never hardcode hex values in components. The same meaning gets the same color and line style everywhere.
8. Covariance ellipses show the **95% region** by default, and every caption says so.

### Widgets
9. Hydrate with `client:visible`. Pause animation loops when the widget is off-screen or the tab is hidden. When `prefers-reduced-motion` is set, nothing autoplays (step controls still work).
10. Every widget works from 320 px wide up to desktop, with mouse, touch and keyboard. It has a Reset button, a fixed default seed, and a caption that includes **"What to look for"**.
11. Every widget's root element has `data-widget="<Name>"` (the e2e tests rely on it).

### Writing
12. Follow the style guide in DESIGN §7: intuition, then math, then interaction, then pitfalls. Define every symbol at first use.
13. **Every concrete claim the text makes about a widget** (a number, "the ellipse shrinks", "it diverges after ~20 steps") **must be true for that widget's default seed and parameters.** Check it by running code (a test or script), not by reasoning about it.
14. **Mathematical correctness comes first.** Derive the result before you write about it, and back the key identities in each post with a numerical test.
15. Cite only real sources you are confident exist. Prefer the core reference list in DESIGN §7.6, and give chapter or section numbers.

### Process
16. Do one task at a time: one post, or one infrastructure item. Use a branch named `post/NN-slug` or `infra/<topic>`, open a PR with `gh`, and merge it yourself once `npm run verify` passes locally **and** CI is green.
17. At the end of every task, update `docs/PROGRESS.md`: status, what changed, follow-ups.
18. If DESIGN.md is ambiguous or wrong, make the most reasonable choice, record it under "Decisions" in PROGRESS.md, and carry on. Stop and ask the owner only for things that are irreversible or need their accounts or settings.
19. Add a dependency only if it clearly earns its place, and record why in PROGRESS.md under "Decisions".
20. Use Conventional Commits (`feat:`, `fix:`, `docs(post-12):`, `test:`, `chore:`).

## Definition of done: a post

- [ ] Frontmatter complete and valid (`npm run validate`)
- [ ] Follows the post template in DESIGN §7.2; 1,500–4,000 words
- [ ] Every widget specified for this post in DESIGN §11 is implemented, with its "What to look for" caption and 2–4 "Try this" prompts in the text
- [ ] The `lib` code behind it has unit tests, including the invariants for this topic
- [ ] Every claim about a widget's behavior has been checked against its default parameters
- [ ] Notation matches DESIGN §6; any new symbol has been added to the table and the `/notation` page
- [ ] Prerequisites are linked; the post appears in the syllabus on the home page as published
- [ ] Checked at 375 px and 1280 px in light and dark mode (Playwright screenshots); no console errors
- [ ] `npm run verify` passes; CI is green; PROGRESS.md is updated
