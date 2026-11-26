import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { builtPages, postPages } from './pages';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

async function visitWidgets(page: Page) {
  const widgets = page.locator('[data-widget]');
  const n = await widgets.count();
  for (let i = 0; i < n; i++) {
    const w = widgets.nth(i);
    await w.scrollIntoViewIfNeeded();
    // client:visible islands drop their `ssr` attribute once hydrated.
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr', { timeout: 10_000 });
  }
  return n;
}

for (const path of builtPages()) {
  test(`page /${path} loads without console errors`, async ({ page }) => {
    const errors = collectErrors(page);
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.locator('main')).toBeVisible();
    await visitWidgets(page);
    expect(errors).toEqual([]);
  });
}

test('unknown URL serves the 404 page', async ({ page }) => {
  const res = await page.goto('no-such-page/');
  expect(res?.status()).toBe(404);
  await expect(page.locator('h1')).toHaveText('Page not found');
});

test('home shows the syllabus with published and coming-soon posts', async ({ page }) => {
  await page.goto('');
  const items = page.locator('#syllabus li[data-published]');
  await expect(items).toHaveCount(32);
  const published = await page.locator('#syllabus li[data-published="true"]').count();
  await expect(page.locator('#syllabus li[data-published="false"]')).toHaveCount(32 - published);
  expect(published).toBe(postPages().length);
  for (const a of await page.locator('#syllabus li[data-published="true"] a').all()) {
    expect(await a.getAttribute('href')).toMatch(/^\/gaussians-to-graphs\/posts\/[a-z0-9-]+\/$/);
  }
});

for (const path of postPages()) {
  test(`widgets on /${path} mount, reset and play`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(path);
    const n = await visitWidgets(page);
    for (let i = 0; i < n; i++) {
      const w = page.locator('[data-widget]').nth(i);
      const play = w.locator('[data-action="play"]');
      if ((await play.count()) > 0 && (await play.isVisible())) {
        await play.click();
        await page.waitForTimeout(200);
        await play.click();
      }
      await w.locator('[data-action="reset"]').click();
    }
    expect(errors).toEqual([]);
  });

  test(`/${path} has no serious or critical accessibility violations`, async ({ page }) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(path);
      await visitWidgets(page);
      const result = await new AxeBuilder({ page }).analyze();
      const bad = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${scheme}: ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    }
  });
}

test('home page has no serious or critical accessibility violations', async ({ page }) => {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('');
    const result = await new AxeBuilder({ page }).analyze();
    const bad = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(bad.map((v) => `${scheme}: ${v.id}`)).toEqual([]);
  }
});

test('theme toggle cycles system → light → dark and persists', async ({ page }) => {
  await page.goto('');
  const btn = page.locator('[data-theme-toggle]');
  await expect(btn).toContainText('System');
  await btn.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await btn.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('[data-theme-toggle]').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
});

test('search dialog loads the Pagefind index and finds the covariance post', async ({ page }) => {
  await page.goto('');
  await page.locator('[data-search-open]').click();
  const input = page.locator('#pagefind-search input');
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill('Mahalanobis');
  await expect(page.locator('#pagefind-search a[href*="gaussians-and-covariance"]').first()).toBeVisible({
    timeout: 10_000,
  });
});

for (const path of builtPages()) {
  test(`/${path} has no horizontal overflow at 320 and 375 px`, async ({ page }) => {
    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(path);
      await visitWidgets(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `scrollWidth exceeds ${width}px`).toBeLessThanOrEqual(0);
    }
  });
}

test.describe('post table of contents', () => {
  const post = 'posts/gaussians-and-covariance/';

  test('wide screens: sticky rail with scroll-spy and progress; no inline card', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(post);
    const rail = page.locator('nav.toc.rail');
    await expect(rail).toBeVisible();
    await expect(page.locator('nav.toc.inline')).toBeHidden();
    await page.evaluate(() => document.getElementById('algorithm')!.scrollIntoView({ block: 'start' }));
    await expect(rail.locator('a[aria-current="location"]')).toHaveText('Algorithm');
    await expect(rail).toBeInViewport(); // sticky
    const t = await page
      .locator('[data-toc-progress]')
      .first()
      .evaluate((e) => getComputedStyle(e).transform);
    expect(t).not.toBe('matrix(0, 0, 0, 1, 0, 0)');
    // The rail never overlaps a widget.
    const r = (await rail.boundingBox())!;
    for (const w of await page.locator('[data-widget]').all()) {
      expect((await w.boundingBox())!.x).toBeGreaterThan(r.x + r.width);
    }
  });

  test('narrow screens: collapsible card that closes after choosing a section', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(post);
    await expect(page.locator('nav.toc.rail')).toBeHidden();
    const card = page.locator('nav.toc.inline');
    await expect(card.locator('summary')).toContainText('6 sections');
    await card.locator('summary').click();
    await card.getByRole('link', { name: /When it breaks/ }).click();
    await expect(card.locator('details')).not.toHaveAttribute('open');
    await expect(page.locator('#when-it-breaks')).toBeInViewport();
  });
});
