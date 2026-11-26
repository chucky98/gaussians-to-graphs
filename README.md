# From Gaussians to Graphs

A free, static blog that teaches estimation theory, Kalman filtering, SLAM and pose-graph optimization through written explanations and interactive in-browser animations.

**Live site:** https://chucky98.github.io/gaussians-to-graphs/

## Running it

Development happens inside the dev container in `.devcontainer/` (the host only needs Docker, VS Code and the Dev Containers extension). In the container:

```bash
npm install
npm run dev        # http://localhost:4321/gaussians-to-graphs/
npm run verify     # lint, type checks, unit tests, build, content validation, e2e tests
```

See `CLAUDE.md` for all commands and working rules, `docs/DESIGN.md` for the specification, and `docs/PROGRESS.md` for the current state.

## How it is built

Astro + MDX for the pages, Svelte 5 for the interactive widgets, KaTeX for the mathematics and Pagefind for search. The algorithms live in `src/lib/` as pure, unit-tested TypeScript; widgets only render and handle input. The code and text are written with Claude Code under the owner's direction.

## License

Code: MIT (`LICENSE`). Prose and figures: CC BY 4.0 (`LICENSE-CONTENT`).
