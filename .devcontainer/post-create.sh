#!/usr/bin/env bash
# Runs once each time the container is created or rebuilt.
set -euo pipefail

# Docker creates named volumes owned by root; hand them to the "node" user.
sudo chown -R node:node node_modules /home/node/.claude /home/node/.config/gh 2>/dev/null || true

# On a fresh, empty repo there is nothing to install yet (Claude Code scaffolds in Phase 0).
if [ -f package-lock.json ]; then
  npm ci
fi

# Playwright's Chromium + its system libraries, only once the project depends on Playwright.
if [ -f package.json ] && grep -q '"@playwright/test"' package.json; then
  npx playwright install --with-deps chromium
fi

echo "Dev container ready. Run 'claude' in the terminal to start."
