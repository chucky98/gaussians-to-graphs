import { test, expect } from '@playwright/test';

const post = 'posts/gaussians-and-covariance/';

test.describe('post 02 widgets', () => {
  test('Gaussian1D: keyboard on the sigma slider updates the peak; Reset restores it', async ({ page }) => {
    await page.goto(post);
    const w = page.locator('[data-widget="Gaussian1D"]');
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(w).toContainText('= 0.399');
    const sigma = w.getByRole('slider', { name: 'Standard deviation sigma' });
    for (let i = 0; i < 20; i++) await sigma.press('ArrowRight'); // 1.00 → 2.00 in steps of 0.05
    await expect(w).toContainText('= 0.199');
    await expect(w).toContainText('68.27%');
    await w.locator('[data-action="reset"]').click();
    await expect(w).toContainText('= 0.399');
  });

  test('CovarianceEllipse: defaults match the text; the inside count ignores the shape', async ({ page }) => {
    await page.goto(post);
    const w = page.locator('[data-widget="CovarianceEllipse"]').first();
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    const inside = w.locator('[data-readout="inside"]');
    await expect(inside).toContainText('945 of 1000');
    await expect(w).toContainText('4.42');
    const rho = w.getByRole('slider', { name: 'correlation rho' });
    await rho.focus();
    await rho.press('Home'); // ρ = −0.95
    await expect(inside).toContainText('945 of 1000');
    // Dragging the major-axis handle with the keyboard changes Σ but not the count.
    const major = w.getByRole('slider', { name: /Major axis end/ });
    await major.press('ArrowUp');
    await expect(inside).toContainText('945 of 1000');
    await w.locator('[data-action="reset"]').click();
    await expect(w).toContainText('4.42');
  });

  test('CovarianceEllipse: pointer drag on the major-axis handle changes the matrix', async ({ page }) => {
    await page.goto(post);
    const w = page.locator('[data-widget="CovarianceEllipse"]').first();
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    const before = await w.locator('.matrix').getAttribute('aria-label');
    const box = (await w.getByRole('slider', { name: /Major axis end/ }).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2 - 60, { steps: 5 });
    await page.mouse.up();
    expect(await w.locator('.matrix').getAttribute('aria-label')).not.toBe(before);
  });

  test('Mahalanobis preset shows A and B with the distances quoted in the text', async ({ page }) => {
    await page.goto(post);
    const w = page.locator('[data-widget="CovarianceEllipse"]').nth(1);
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    const rows = w.locator('table tbody tr');
    await expect(rows.nth(0)).toContainText('3.00');
    await expect(rows.nth(0)).toContainText('1.87');
    await expect(rows.nth(0)).toContainText('yes');
    await expect(rows.nth(1)).toContainText('3.75');
    await expect(rows.nth(1)).toContainText('no');
  });

  test('nothing autoplays under prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(post);
    const w = page.locator('[data-widget="CovarianceEllipse"]').first();
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await page.waitForTimeout(500);
    await expect(w.locator('[data-action="play"]')).not.toContainText('Pause');
    // Step still works.
    await w.locator('[data-action="play"]').click();
    await w.locator('[data-action="play"]').click(); // pause
    await w.locator('[data-action="step"]').click();
  });
});

test.describe('post 01 widgets', () => {
  const post01 = 'posts/where-am-i/';

  test('DriftFan: defaults match the text; zero noise gives zero error; scrubbing and Reset work', async ({ page }) => {
    await page.goto(post01);
    const w = page.locator('[data-widget="DriftFan"]');
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    const rms = w.locator('[data-readout="rms"]');
    await expect(rms).toHaveText('1.98 m');
    await expect(w).toContainText('69.7 m (lap 2)');

    const time = w.getByRole('slider', { name: 'Distance driven (time)' });
    await time.focus();
    await time.press('Home');
    await expect(rms).toHaveText('0.00 m');
    await expect(w).toContainText('0.0 m (lap 1)');
    await time.press('End');
    await expect(rms).toHaveText('1.98 m');

    const noise = w.getByRole('slider', { name: 'Odometry noise' });
    await noise.focus();
    await noise.press('Home');
    await expect(rms).toHaveText('0.00 m');

    await w.locator('[data-action="reset"]').click();
    await expect(rms).toHaveText('1.98 m');
  });

  test('DriftFan: Play animates from the start and Pause stops it', async ({ page }) => {
    await page.goto(post01);
    const w = page.locator('[data-widget="DriftFan"]');
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await w.locator('[data-action="play"]').click(); // Replay from 0
    await page.waitForTimeout(600);
    await w.locator('[data-action="play"]').click(); // Pause
    const text = await w.locator('[data-readout="rms"]').textContent();
    expect(text).not.toBe('1.98 m');
    await page.waitForTimeout(400);
    await expect(w.locator('[data-readout="rms"]')).toHaveText(text!);
  });

  test('post 01 embeds the syllabus map and post 02 now links back to post 01', async ({ page }) => {
    await page.goto(post01);
    await expect(page.locator('#series-map li[data-published]')).toHaveCount(32);
    await page.goto('posts/gaussians-and-covariance/');
    await expect(page.locator('.prereqs a[href$="/posts/where-am-i/"]')).toBeVisible();
  });
});
