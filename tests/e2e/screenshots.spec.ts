import { test } from '@playwright/test';
import { builtPages } from './pages';

/** Screenshots for review (CI artifacts). No pixel-diff assertions (DESIGN §8.3). */
const viewports = [
  { name: '375', width: 375, height: 800 },
  { name: '1280', width: 1280, height: 900 },
];

for (const path of builtPages()) {
  for (const vp of viewports) {
    for (const scheme of ['light', 'dark'] as const) {
      test(`screenshot /${path} @${vp.name} ${scheme}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
        await page.goto(path);
        for (const w of await page.locator('[data-widget]').all()) {
          await w.scrollIntoViewIfNeeded();
          await page.waitForTimeout(150);
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        const name = (path.replace(/\/$/, '').replace(/\//g, '_') || 'home') + `-${vp.name}-${scheme}.png`;
        await page.screenshot({ path: `test-results/screenshots/${name}`, fullPage: true });
      });
    }
  }
}
