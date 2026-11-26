/**
 * Dev helper: screenshot a page of the running preview server and report console errors.
 *   npx tsx scripts/screenshot.ts <path> <out.png> [width=1280] [light|dark] [full=1]
 */
import { chromium } from '@playwright/test';

const [path = '', out = 'shot.png', w = '1280', theme = 'light', full = '1'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: Number(w), height: 900 },
  colorScheme: theme as 'light' | 'dark',
});
const errors: string[] = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:4321/gaussians-to-graphs/${path}`, { waitUntil: 'networkidle' });
for (const el of await page.$$('[data-widget]')) {
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
}
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);
await page.screenshot({ path: out, fullPage: full === '1' });
console.log('console errors:', JSON.stringify(errors));
await browser.close();
