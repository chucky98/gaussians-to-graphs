import { test as base, expect } from '@playwright/test';

/**
 * Every e2e test runs with third-party analytics intercepted: tests must not depend on (or add views
 * to) the real GoatCounter site. Counter requests get a fixed answer so the About page renders numbers.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('https://gc.zgo.at/**', (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.route(/^https:\/\/[a-z0-9-]+\.goatcounter\.com\//, (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ count: r.request().url().includes('TOTAL') ? '1,234' : '56' }),
      }),
    );
    await use(page);
  },
});

export { expect };
