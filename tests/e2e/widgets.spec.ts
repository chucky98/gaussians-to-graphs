import { test, expect } from './fixtures';

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

test.describe('post 03 widgets', () => {
  test('SliceVsProject: live formulas match the text; ρ = 0 removes the shrinkage; the slice handle moves', async ({
    page,
  }) => {
    await page.goto('posts/conditioning-and-marginalizing/');
    const w = page.locator('[data-widget="SliceVsProject"]');
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(w.locator('[data-readout="cond-mean"]')).toContainText('0.70');
    await expect(w.locator('[data-readout="cond-var"]')).toContainText('0.51');

    // Arrow keys on the slice handle move a; the variance must not change.
    const handle = w.getByRole('slider', { name: /Slice position a/ });
    for (let i = 0; i < 10; i++) await handle.press('ArrowRight');
    await expect(handle).toHaveAttribute('aria-valuetext', 'a = 2.00');
    await expect(w.locator('[data-readout="cond-var"]')).toContainText('0.51');

    await w.getByRole('slider', { name: 'correlation rho' }).fill('0');
    await expect(w.locator('[data-readout="cond-var"]')).toContainText('1.00');

    await w.locator('[data-action="reset"]').click();
    await expect(w.locator('[data-readout="cond-mean"]')).toContainText('0.70');
  });
});

test.describe('post 04 widgets', () => {
  test('NonlinearPropagation: polar defaults match the text; σθ = 5° fixes linearization; switching functions works', async ({
    page,
  }) => {
    await page.goto('posts/propagating-uncertainty/');
    const w = page.locator('[data-widget="NonlinearPropagation"]').first();
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(w.locator('[data-readout="inside-lin"]')).toHaveText('70.0%');
    await expect(w.locator('[data-readout="inside-mc"]')).toHaveText('93.4%');
    await expect(w.locator('[data-readout="lin-mean"]')).toHaveText('0.00, 2.00');

    await w.getByRole('slider', { name: 'bearing standard deviation' }).fill('5');
    await expect(w.locator('[data-readout="inside-lin"]')).toHaveText('94.6%');

    await w.getByLabel('Function').selectOption('square');
    await expect(w.locator('[data-readout="lin-var"]')).toHaveText('0.250');
    await expect(w.locator('[data-readout="inside-lin"]')).toHaveText('88.9%');

    await w.locator('[data-action="reset"]').click();
    await expect(w.locator('[data-readout="inside-lin"]')).toHaveText('70.0%');
  });

  test('second instance starts on x²', async ({ page }) => {
    await page.goto('posts/propagating-uncertainty/');
    const w = page.locator('[data-widget="NonlinearPropagation"]').nth(1);
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(w.locator('[data-readout="lin-var"]')).toHaveText('0.250');
    await w.getByRole('slider', { name: 'mean' }).fill('0');
    await expect(w.locator('[data-readout="lin-var"]')).toHaveText('0.000');
    await expect(w).toContainText('linearized variance ≈ 0');
  });
});

test.describe('post 05 widgets', () => {
  test('LineFit: defaults; the bounced fix dominates; down-weighting it fixes the line; dragging works', async ({
    page,
  }) => {
    await page.goto('posts/least-squares/');
    const w = page.locator('[data-widget="LineFit"]');
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(w.locator('[data-readout="ls"]')).toHaveText('y = 19.49 + 0.155 t');
    await expect(w.locator('[data-readout="cost"]')).toHaveText('81.9 m²');

    await w.getByLabel('Data').selectOption('multipath');
    await expect(w.locator('[data-readout="share"]')).toHaveText('73%');
    await expect(w.locator('[data-readout="cost"]')).toHaveText('510.4 m²');
    await w.getByRole('slider', { name: 'Reported accuracy of fix 7' }).fill('10');
    await expect(w.locator('[data-readout="cost"]')).not.toHaveText('510.4 m²');

    const before = await w.locator('[data-readout="ls"]').textContent();
    const fix = w.getByRole('slider', { name: /GPS fix 2:/ });
    for (let i = 0; i < 10; i++) await fix.press('ArrowUp');
    await expect(w.locator('[data-readout="ls"]')).not.toHaveText(before!);
    await w.locator('[data-action="reset"]').click();
    await expect(w.locator('[data-readout="ls"]')).toHaveText('y = 19.49 + 0.155 t');
  });
});

test.describe('post 06 widgets', () => {
  test('BayesGrid1D: defaults; κ = 0 makes MAP = MLE; taking readings; doorways tie and resolution', async ({
    page,
  }) => {
    await page.goto('posts/mle-and-map/');
    const w = page.locator('[data-widget="BayesGrid1D"]').first();
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(w.locator('[data-readout="mle"]')).toHaveText('2.67 m');
    await expect(w.locator('[data-readout="map"]')).toHaveText('2.55 m');
    await w.getByRole('slider', { name: 'prior weight kappa' }).fill('0');
    await expect(w.locator('[data-readout="map"]')).toHaveText('2.67 m');
    await w.locator('[data-action="reset"]').click();
    for (let i = 0; i < 8; i++) await w.locator('[data-action="reading"]').click();
    await expect(w.locator('[data-readout="n"]')).toHaveText('10');
    await expect(w.locator('[data-readout="map"]')).toHaveText('2.69 m');

    const d = page.locator('[data-widget="BayesGrid1D"]').nth(1);
    await d.scrollIntoViewIfNeeded();
    await expect(d.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(d.locator('[data-readout="map"]')).toHaveText('tie: 1.20 or 3.00 m');
    await expect(d.locator('[data-readout="far"]')).toHaveText('50.0%');
    await d.locator('[data-action="reading"]').click();
    await expect(d.locator('[data-readout="far"]')).toHaveText('100.0%');
  });
});

test.describe('post 07 widgets', () => {
  test('EstimatorShootout: defaults; more fixes; near buildings the median wins', async ({ page }) => {
    await page.goto('posts/estimator-quality/');
    const w = page.locator('[data-widget="EstimatorShootout"]').first();
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(w.locator('[data-readout="rmse-mean"]')).toHaveText('0.95');
    await expect(w.locator('[data-readout="rmse-shrink"]')).toHaveText('0.93');
    const nSlider = w.getByRole('slider', { name: 'Fixes per experiment' });
    await nSlider.focus();
    await nSlider.press('End');
    await expect(w.locator('[data-readout="rmse-mean"]')).toHaveText('0.30');

    const u = page.locator('[data-widget="EstimatorShootout"]').nth(1);
    await u.scrollIntoViewIfNeeded();
    await expect(u.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(u.locator('[data-readout="rmse-mean"]')).toHaveText('3.16');
    await expect(u.locator('[data-readout="rmse-median"]')).toHaveText('1.27');
    await expect(u.locator('[data-readout="crlb"]')).toHaveText('1.04');
  });
});

test.describe('post 08 widgets', () => {
  test('RLSStream: RLS equals batch; the sag preset is overconfident at β = 1 and tracks at β = 0.95', async ({
    page,
  }) => {
    await page.goto('posts/recursive-least-squares/');
    const w = page.locator('[data-widget="RLSStream"]').first();
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(w.locator('[data-readout="gain"]')).toHaveText('0.248 ± 0.006');
    await expect(w.locator('[data-readout="diff"]')).toHaveText('identical (< 10⁻⁹)');
    const k = w.getByRole('slider', { name: 'Measurements processed' });
    await k.focus();
    await k.press('Home');
    await k.press('ArrowRight');
    await expect(w.locator('[data-readout="gain"]')).toHaveText('0.228 ± 0.098');
    await expect(w.locator('[data-readout="diff"]')).toHaveText('identical (< 10⁻⁹)');

    const s = page.locator('[data-widget="RLSStream"]').nth(1);
    await s.scrollIntoViewIfNeeded();
    await expect(s.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(s.locator('[data-readout="gain"]')).toHaveText('0.223 ± 0.006');
    await s.getByRole('slider', { name: 'forgetting factor beta' }).fill('0.95');
    await expect(s.locator('[data-readout="gain"]')).toHaveText('0.189 ± 0.017');
  });
});

test.describe('post 09 widgets', () => {
  test('CostLandscape: corners converge; damping; the wall preset diverges for GN only', async ({ page }) => {
    await page.goto('posts/nonlinear-least-squares/');
    const w = page.locator('[data-widget="CostLandscape"]').first();
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(w.locator('[data-readout="gn-pos"]')).toHaveText('(6.45, 2.92)');
    await expect(w.locator('[data-readout="lm-pos"]')).toHaveText('(6.45, 2.92)');
    await w.getByLabel('Anchors').selectOption('wall');
    await expect(w.locator('[data-readout="lm-pos"]')).toHaveText('(6.39, -3.09)');
    const handle = w.getByRole('slider', { name: /Starting guess/ });
    for (let i = 0; i < 14; i++) await handle.press('ArrowUp'); // start moves to (3, 5), inside the room
    await expect(w.locator('[data-readout="lm-pos"]')).toHaveText('(6.39, 3.09)');

    const d = page.locator('[data-widget="CostLandscape"]').nth(1);
    await d.scrollIntoViewIfNeeded();
    await expect(d.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(d.locator('[data-readout="gn-pos"]')).toHaveText('off the map');
    await expect(d.locator('[data-readout="lm-pos"]')).toHaveText('(6.39, 3.09)');
  });
});

test.describe('post 10 widgets', () => {
  test('CorridorRobot: two hypotheses after two doors; missed door; uniform with a useless sensor; kidnapping', async ({
    page,
  }) => {
    await page.goto('posts/bayes-filter/');
    const w = page.locator('[data-widget="CorridorRobot"]').first();
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(w.locator('[data-readout="hyps"]')).toHaveText('none (spread out)');
    const sense = w.locator('[data-action="sense"]');
    const move = w.locator('[data-action="move"]');
    await sense.click();
    for (let i = 0; i < 4; i++) {
      await move.click();
      await sense.click();
    }
    await expect(w.locator('[data-readout="hyps"]')).toHaveText('2');
    await expect(w.locator('[data-readout="near"]')).toHaveText('40%');
    for (let i = 0; i < 6; i++) {
      await move.click();
      await sense.click();
    }
    await expect(w.locator('[data-readout="steps"]')).toHaveText('10 / 11');
    await expect(w.locator('[data-readout="best"]')).toHaveText('19.4 m');
    await expect(w.locator('[data-readout="truth"]')).toHaveText('10.1 m');
    await expect(w.locator('[data-readout="near"]')).toHaveText('17%');
    await w.locator('[data-action="undo"]').click();
    await expect(w.locator('[data-readout="steps"]')).toHaveText('10 / 10');
    await w.getByRole('slider', { name: 'Hit rate p(door | at a door)' }).fill('0.5');
    await w.getByRole('slider', { name: 'False-alarm rate p(door | at a wall)' }).fill('0.5');
    await expect(w.locator('[data-readout="near"]')).toHaveText('8%');
    await expect(w.locator('[data-readout="hyps"]')).toHaveText('none (spread out)');

    const t = page.locator('[data-widget="CorridorRobot"]').nth(1);
    await t.scrollIntoViewIfNeeded();
    await expect(t.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(t.locator('[data-readout="near"]')).toHaveText('100%');
    await t.locator('[data-action="kidnap"]').click();
    await expect(t.locator('[data-readout="truth"]')).toHaveText('20.6 m');
    await expect(t.locator('[data-readout="near"]')).toHaveText('0%');
    await t.getByRole('switch', { name: /Allow for kidnapping/ }).check();
    await expect(t.locator('[data-readout="truth"]')).toHaveText('20.6 m');
  });
});

test.describe('post 11 widgets', () => {
  test('GaussianProduct and Tracker1D: gain, steady state, outage', async ({ page }) => {
    await page.goto('posts/kalman-filter-1d/');
    const g = page.locator('[data-widget="GaussianProduct"]');
    await g.scrollIntoViewIfNeeded();
    await expect(g.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(g.locator('[data-readout="gain"]')).toHaveText('0.74');
    await expect(g.locator('[data-readout="mean"]')).toHaveText('12.59 m');
    await g.getByRole('slider', { name: 'Reading σ₂' }).fill('2');
    await expect(g.locator('[data-readout="gain"]')).toHaveText('0.06');
    await expect(g.locator('[data-readout="mean"]')).toHaveText('12.05 m');
    const handle = g.getByRole('slider', { name: 'Reading (drag sideways)' });
    await handle.focus();
    await handle.press('ArrowRight');
    await expect(g.getByRole('slider', { name: 'Reading z' })).toHaveValue('12.85');

    const t = page.locator('[data-widget="Tracker1D"]').first();
    await t.scrollIntoViewIfNeeded();
    await expect(t.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(t.locator('[data-readout="steady"]')).toHaveText('K = 0.282, σ = 0.159 m');
    const time = t.getByRole('slider', { name: /Time/ });
    await time.focus();
    await time.press('Home');
    await t.locator('[data-action="step"]').click();
    await t.locator('[data-action="step"]').click();
    await expect(t.locator('[data-readout="time"]')).toHaveText('step 1: updated');
    await expect(t.locator('[data-readout="gain"]')).toHaveText('0.918');

    const o = page.locator('[data-widget="Tracker1D"]').nth(1);
    await o.scrollIntoViewIfNeeded();
    await expect(o.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    const ot = o.getByRole('slider', { name: /Time/ });
    await ot.fill('52');
    await expect(o.locator('[data-readout="time"]')).toHaveText('step 26: updated');
    await expect(o.locator('[data-readout="gain"]')).toHaveText('0.601');
    await ot.fill('50');
    await expect(o.locator('[data-readout="gain"]')).toHaveText('no fix');
  });
});

test.describe('post 12 widgets', () => {
  test('CVTracker2D: velocity learned from positions; the turn preset', async ({ page }) => {
    await page.goto('posts/kalman-filter/');
    const w = page.locator('[data-widget="CVTracker2D"]').first();
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(w.locator('[data-readout="vel"]')).toContainText('± 0.32 m/s');
    const time = w.getByRole('slider', { name: /Time/ });
    await time.fill('2');
    await expect(w.locator('[data-readout="time"]')).toHaveText('t = 1 s, updated');
    await expect(w.locator('[data-readout="vel"]')).toContainText('(0.33,');
    await expect(w.locator('[data-readout="vel"]')).toContainText('± 2.82 m/s');
    await w.locator('[data-action="step"]').click();
    await w.locator('[data-action="step"]').click();
    await expect(w.locator('[data-readout="vel"]')).toContainText('(1.85,');

    const t = page.locator('[data-widget="CVTracker2D"]').nth(1);
    await t.scrollIntoViewIfNeeded();
    await expect(t.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await t.getByRole('slider', { name: /Time/ }).fill('50');
    await expect(t.locator('[data-readout="vel"]')).toContainText(', 1.11)');
    await t.getByRole('slider', { name: /Process noise/ }).fill('-1');
    await expect(t.getByRole('slider', { name: /Process noise/ })).toHaveAttribute('aria-valuetext', /0\.1 m²/);
  });
});

test.describe('post 13 widgets', () => {
  test('TuningLab: verdicts for the presets and the NIS blind spot', async ({ page }) => {
    await page.goto('posts/tuning-and-consistency/');
    const w = page.locator('[data-widget="TuningLab"]');
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(w.locator('[data-readout="verdict"]')).toContainText('Consistent');
    await expect(w.locator('[data-readout="nees"]')).toContainText('3.94');
    await w.getByLabel('Preset').selectOption('overconfident');
    await expect(w.locator('[data-readout="verdict"]')).toContainText('Overconfident');
    await expect(w.locator('[data-readout="nis1"]')).toContainText('14.66');
    await w.getByLabel('Preset').selectOption('tuned');
    await w.getByRole('slider', { name: 'Assumed q (times the true q)' }).fill('-1');
    await w.getByRole('slider', { name: 'Assumed σ (times the true σ)' }).fill('0.15');
    await expect(w.locator('[data-readout="nis"]')).toContainText('2.23');
    await expect(w.locator('[data-readout="nees"]')).toContainText('18.51');
  });
});

test.describe('post 14 widgets', () => {
  test('MotionModelSampler and RangeBearing: defaults, banana, dragging the robot', async ({ page }) => {
    await page.goto('posts/robot-models-2d/');
    const m = page.locator('[data-widget="MotionModelSampler"]');
    await m.scrollIntoViewIfNeeded();
    await expect(m.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(m.locator('[data-readout="inside"]')).toHaveText('89.8%');
    await expect(m.locator('[data-readout="heading"]')).toHaveText('14°');
    await m.getByLabel('Preset').selectOption('banana');
    await expect(m.locator('[data-readout="inside"]')).toHaveText('75.8%');
    await expect(m.locator('[data-readout="shift"]')).toHaveText('1.34 m');

    const r = page.locator('[data-widget="RangeBearing"]');
    await r.scrollIntoViewIfNeeded();
    await expect(r.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(r.locator('[data-readout="table"] tbody tr')).toHaveCount(5);
    await expect(r.locator('[data-readout="jacobian"]')).toContainText('-0.151');
    await r.getByRole('slider', { name: 'Maximum range' }).fill('6');
    await expect(r.locator('[data-readout="table"] tbody tr')).toHaveCount(3);
    const robot = r.getByRole('slider', { name: /Robot position/ });
    await robot.focus();
    await robot.press('ArrowRight');
    await expect(robot).toHaveAttribute('aria-valuetext', /x 4\.10 metres/);
  });
});

test.describe('post 15 widgets', () => {
  test('EKFLocalization: default run, no markers, and the bad start', async ({ page }) => {
    await page.goto('posts/extended-kalman-filter/');
    const w = page.locator('[data-widget="EKFLocalization"]').first();
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(w.locator('[data-readout="time"]')).toHaveText('60.0 s');
    await expect(w.locator('[data-readout="odom"]')).toHaveText('1.92 m');
    await expect(w.locator('[data-readout="nees"]')).toHaveText('118 of 120 steps');
    await w.getByLabel('Scenario').selectOption('blind');
    await expect(w.locator('[data-readout="r95"]')).toHaveText('5.60 m');
    await w.getByLabel('Scenario').selectOption('default');
    await w.getByRole('slider', { name: 'Time' }).fill('0');
    await expect(w.locator('[data-readout="time"]')).toHaveText('0.0 s');
    await w.locator('[data-action="step"]').click();
    await expect(w.locator('[data-readout="time"]')).toHaveText('0.5 s');

    const b = page.locator('[data-widget="EKFLocalization"]').nth(1);
    await b.scrollIntoViewIfNeeded();
    await expect(b.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(b.locator('[data-readout="nees"]')).toHaveText('86 of 120 steps');
    await b.getByRole('slider', { name: 'Sensing range' }).fill('3');
    await expect(b.locator('[data-readout="ekf"]')).toContainText('1.12 m');
  });
});

test.describe('post 16 widgets', () => {
  test('UnscentedTransform and UKFvsEKF: defaults, x², the mild scenario', async ({ page }) => {
    await page.goto('posts/unscented-kalman-filter/');
    const u = page.locator('[data-widget="UnscentedTransform"]');
    await u.scrollIntoViewIfNeeded();
    await expect(u.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(u.locator('[data-readout="inside-lin"]')).toHaveText('70.0%');
    await expect(u.locator('[data-readout="inside-ut"]')).toHaveText('93.6%');
    await u.getByLabel('Function').selectOption('square');
    await expect(u.locator('[data-readout="var-ut"]')).toHaveText('0.375');
    await expect(u.locator('[data-readout="var-lin"]')).toHaveText('0.250');

    const c = page.locator('[data-widget="UKFvsEKF"]');
    await c.scrollIntoViewIfNeeded();
    await expect(c.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(c.locator('[data-readout="nees-ekf"]')).toHaveText('4.66');
    await expect(c.locator('[data-readout="nees-ukf"]')).toHaveText('3.54');
    await c.getByLabel('Scenario').selectOption('mild');
    await expect(c.locator('[data-readout="rms-ekf"]')).toHaveText('0.07 m');
    await expect(c.locator('[data-readout="rms-ukf"]')).toHaveText('0.07 m');
  });
});

test.describe('post 17 widgets', () => {
  test('MCL: the worker runs the filter; global localization; the kidnapped copy', async ({ page }) => {
    await page.goto('posts/particle-filter/');
    const w = page.locator('[data-widget="MCL"]').first();
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(w.locator('[data-readout="ess"]')).toHaveText('2000 of 2000');
    for (let i = 0; i < 3; i++) await w.locator('[data-action="step"]').click();
    await expect(w.locator('[data-readout="time"]')).toHaveText('1.5 s');
    await expect(w.locator('[data-readout="near"]')).toHaveText('98%');
    await w.getByRole('combobox', { name: 'Particles', exact: true }).selectOption('500');
    await w.getByRole('slider', { name: 'Time' }).fill('120');
    await expect(w.locator('[data-readout="time"]')).toHaveText('60.0 s', { timeout: 15_000 });
    await expect(w.locator('[data-readout="err"]')).toHaveText('11.24 m');

    const k = page.locator('[data-widget="MCL"]').nth(1);
    await k.scrollIntoViewIfNeeded();
    await expect(k.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(k.locator('[data-action="kidnap"]')).toHaveText('Kidnapped at 30.0 s');
    await expect(k.locator('[data-action="kidnap"]')).toBeDisabled();
    await k.getByRole('switch', { name: /Add random particles/ }).check();
    await k.getByRole('slider', { name: 'Time' }).fill('110');
    await expect(k.locator('[data-readout="time"]')).toHaveText('55.0 s', { timeout: 15_000 });
    await expect(k.locator('[data-readout="near"]')).not.toHaveText('0%');
  });
});

test.describe('post 18 widgets', () => {
  test('FilterVsSmoother: errors, smoother = batch, data arriving after the gap', async ({ page }) => {
    await page.goto('posts/smoothing/');
    const w = page.locator('[data-widget="FilterVsSmoother"]');
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(w.locator('[data-readout="rms-f"]')).toHaveText('0.250 m');
    await expect(w.locator('[data-readout="rms-s"]')).toHaveText('0.111 m');
    await expect(w.locator('[data-readout="diff"]')).toHaveText('identical (< 10⁻⁹ m)');
    await w.getByRole('slider', { name: 'Lag L (steps)' }).fill('10');
    await expect(w.locator('[data-readout="rms-l"]')).toHaveText('0.121 m');
    const t = w.getByRole('slider', { name: 'Data available up to step' });
    await t.fill('25');
    await expect(w.locator('[data-readout="t"]')).toHaveText('25');
    await w.locator('[data-action="step"]').click();
    await expect(w.locator('[data-readout="t"]')).toHaveText('26');
  });
});

test.describe('post 19 widgets', () => {
  test('InfoVsCov: sparse Ω, dense P, growth per step, the aisle problem', async ({ page }) => {
    await page.goto('posts/information-filter/');
    const w = page.locator('[data-widget="InfoVsCov"]');
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(w.locator('[data-readout="omega"]')).toHaveText('121 of 1681 nonzero (7%)');
    await expect(w.locator('[data-readout="p"]')).toHaveText('1681 of 1681 nonzero (100%)');
    await w.getByRole('slider', { name: 'Steps of data' }).fill('10');
    await expect(w.locator('[data-readout="omega"]')).toHaveText('31 of 121 nonzero (26%)');
    await w.getByLabel('Problem').selectOption('aisle');
    await expect(w.locator('[data-readout="omega"]')).toHaveText('304 of 2704 nonzero (11%)');
  });
});

test.describe('post 20 widgets', () => {
  test('EulerGimbal: default angles, close to lock, gimbal lock', async ({ page }) => {
    await page.goto('posts/rotations/');
    const w = page.locator('[data-widget="EulerGimbal"]');
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(w.locator('canvas')).toBeVisible();
    await expect(w.locator('[data-readout="gap"]')).toHaveText('60°');
    await expect(w.locator('[data-readout="sigma"]')).toHaveText('0.71');
    await expect(w.locator('[data-readout="turn-x"]')).toHaveText(/nose \(x\)\s*0°\s*0°\s*\+5°/);
    await w.getByLabel('Preset').selectOption('near');
    await expect(w.locator('[data-readout="sigma"]')).toHaveText('0.12');
    await expect(w.locator('[data-readout="turn-y"]')).toHaveText(/\+18°\s*\+4°\s*\+18°/);
    await w.getByLabel('Preset').selectOption('lock');
    await expect(w.locator('[data-readout="gap"]')).toHaveText('0°');
    await expect(w.locator('[data-readout="status"]')).toHaveText(/Gimbal lock/);
    await expect(w.locator('[data-readout="turn-y"]')).toHaveText(/\+160°\s*−5°\s*\+160°/);
    await w.getByRole('slider', { name: 'Pitch θ' }).fill('45');
    await expect(w.locator('[data-readout="gap"]')).toHaveText('45°');
    await w.locator('[data-action="reset"]').click();
    await expect(w.locator('[data-readout="gap"]')).toHaveText('60°');
  });
  test('QuaternionSlerp: half turn, the ±180° seam, the long way', async ({ page }) => {
    await page.goto('posts/rotations/');
    const w = page.locator('[data-widget="QuaternionSlerp"]');
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(w.locator('[data-readout="total-slerp"]')).toHaveText('180°');
    await expect(w.locator('[data-readout="total-euler"]')).toHaveText('255°');
    await w.getByLabel('Preset').selectOption('wrap');
    await expect(w.locator('[data-readout="direct"]')).toHaveText('20°');
    await expect(w.locator('[data-readout="total-euler"]')).toHaveText('340°');
    await w.getByRole('switch', { name: /long way/ }).check();
    await expect(w.locator('[data-readout="total-slerp"]')).toHaveText('340°');
    await w.getByLabel('Preset').selectOption('small');
    await expect(w.locator('[data-readout="rate-euler"]')).toHaveText('35° – 37°');
    await w.getByRole('slider', { name: 'Progress t' }).fill('1');
    await expect(w.locator('[data-readout="sofar"]')).toHaveText('36° / 36°');
  });
});

test.describe('post 21 widgets', () => {
  test('TangentSpace: defaults, small τ, wrapping past π', async ({ page }) => {
    await page.goto('posts/lie-groups-for-robotics/');
    const w = page.locator('[data-widget="TangentSpace"]');
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(w.locator('[data-readout="exact"]')).toHaveText('98.8°');
    await expect(w.locator('[data-readout="proj"]')).toHaveText('50.2°');
    await expect(w.locator('[data-readout="off"]')).toHaveText('0.56');
    const tau = w.getByRole('slider', { name: 'Tangent vector τ (rad)' });
    await tau.fill('0.2');
    await expect(w.locator('[data-readout="proj"]')).toHaveText('11.3°');
    await expect(w.locator('[data-readout="tau"]')).toHaveText('0.20 rad (11.5°)');
    await tau.fill('4');
    await expect(w.locator('[data-readout="exact"]')).toHaveText('−100.8°');
    await expect(w.locator('[data-readout="back"]')).toHaveText('−2.28 rad (wrapped)');
  });
  test('SE2Exp: the arc, N steps, the start heading', async ({ page }) => {
    await page.goto('posts/lie-groups-for-robotics/');
    const w = page.locator('[data-widget="SE2Exp"]');
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(w.locator('[data-readout="exp"]')).toHaveText('(1.33, 1.24, 86°)');
    await expect(w.locator('[data-readout="gap"]')).toHaveText('1.41 m');
    await expect(w.locator('[data-readout="steps"]')).toHaveText('0.34 m');
    await w.getByLabel('Straight-then-turn steps N').selectOption('64');
    await expect(w.locator('[data-readout="steps"]')).toHaveText('0.02 m');
    await w.getByRole('slider', { name: 'Start heading' }).fill('90');
    await expect(w.locator('[data-readout="exp"]')).toHaveText('(−1.24, 1.33, 176°)');
    await expect(w.locator('[data-readout="gap"]')).toHaveText('3.50 m');
    await w.locator('[data-action="reset"]').click();
    await expect(w.locator('[data-readout="gap"]')).toHaveText('1.41 m');
  });
});

test.describe('post 22 widgets', () => {
  test('PoseCompounding: ellipse vs tangent region, heading noise, steps', async ({ page }) => {
    await page.goto('posts/uncertainty-on-poses/');
    const w = page.locator('[data-widget="PoseCompounding"]');
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(w.locator('[data-readout="cart"]')).toHaveText('69%');
    await expect(w.locator('[data-readout="tan"]')).toHaveText('97%');
    await expect(w.locator('[data-readout="heading"]')).toHaveText('15.8°');
    const noise = w.getByRole('slider', { name: 'Heading noise per step' });
    await noise.fill('1');
    await expect(w.locator('[data-readout="cart"]')).toHaveText('95%');
    await expect(w.locator('[data-readout="tan"]')).toHaveText('95%');
    await noise.fill('10');
    await expect(w.locator('[data-readout="cart"]')).toHaveText('30%');
    await expect(w.locator('[data-readout="heading"]')).toHaveText('31.6°');
    await w.locator('[data-action="reset"]').click();
    await w.getByRole('slider', { name: 'Steps' }).fill('20');
    await expect(w.locator('[data-readout="cart"]')).toHaveText('39%');
    await expect(w.locator('[data-readout="tan"]')).toHaveText('96%');
  });
});

test.describe('post 23 widgets', () => {
  test('CorrelationsEmerge: step 60, the loop closure, links', async ({ page }) => {
    await page.goto('posts/the-slam-problem/');
    const w = page.locator('[data-widget="CorrelationsEmerge"]');
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(w.locator('[data-readout="k"]')).toHaveText('60');
    await expect(w.locator('[data-readout="robot"]')).toHaveText('0.72 m');
    await expect(w.locator('[data-readout="count"]')).toHaveText('4');
    await w.locator('[data-action="closure"]').click();
    await expect(w.locator('[data-readout="robot"]')).toHaveText('0.82 m');
    await w.locator('[data-action="step"]').click();
    await expect(w.locator('[data-readout="k"]')).toHaveText('99');
    await expect(w.locator('[data-readout="robot"]')).toHaveText('0.18 m');
    await expect(w.locator('line.link').first()).toBeVisible();
    await w.getByRole('switch', { name: 'Show landmark–landmark links' }).uncheck();
    await w.getByRole('switch', { name: 'Show robot–landmark links' }).uncheck();
    await expect(w.locator('line.link')).toHaveCount(0);
  });
});

test.describe('post 24 widgets', () => {
  test('EKFSLAM: growing covariance, the loop closure, more heading noise', async ({ page }) => {
    await page.goto('posts/ekf-slam/');
    const w = page.locator('[data-widget="EKFSLAM"]');
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(w.locator('[data-readout="entries"]')).toHaveText('27 × 27 = 729');
    await expect(w.locator('[data-readout="strong"]')).toHaveText('73%');
    await w.locator('[data-action="closure"]').click();
    await expect(w.locator('[data-readout="robot"]')).toHaveText('0.53 m');
    await w.locator('[data-action="step"]').click();
    await expect(w.locator('[data-readout="robot"]')).toHaveText('0.25 m');
    await expect(w.locator('[data-readout="strong"]')).toHaveText('74%');
    await w.getByLabel('Heading noise of the odometry').selectOption('high');
    await w.getByRole('slider', { name: 'Step' }).fill('240');
    await expect(w.locator('[data-readout="robot"]')).toHaveText('0.50 m');
  });
});

test.describe('post 25 widgets', () => {
  test('AssociationGating scene: JCBB vs nearest neighbour, the gate', async ({ page }) => {
    await page.goto('posts/data-association/');
    const w = page.locator('[data-widget="AssociationGating"]').first();
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(w.locator('[data-readout="correct"]')).toHaveText('6');
    await expect(w.locator('[data-readout="error"]')).toHaveText('0.60 → 0.01 m');
    await w.getByLabel('Association').selectOption('nn');
    await expect(w.locator('[data-readout="wrong"]')).toHaveText('4');
    await expect(w.locator('[data-readout="error"]')).toHaveText('0.60 → 0.51 m');
    await w.getByLabel('Association').selectOption('jcbb');
    await w.getByRole('slider', { name: 'Robot position error (sideways)' }).fill('1.5');
    await expect(w.locator('[data-readout="correct"]')).toHaveText('5');
    await w.getByLabel('Gate probability').selectOption('0.9');
    await expect(w.locator('[data-readout="wrong"]')).toHaveText('4');
  });
  test('AssociationGating run: honest pairings, then one forced mistake', async ({ page }) => {
    await page.goto('posts/data-association/');
    const w = page.locator('[data-widget="AssociationGating"]').nth(1);
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(w.locator('[data-readout="pairs"]')).toHaveText('581 / 0');
    await expect(w.locator('[data-readout="n"]')).toHaveText('16');
    await w.getByRole('switch', { name: /Force one wrong pairing/ }).check();
    await expect(w.locator('[data-readout="dups"]')).toHaveText('13');
    await expect(w.locator('[data-readout="err"]')).toHaveText('4.12 m');
  });
});

test.describe('post 26 widgets', () => {
  test('FactorGraphBuilder: structure, solve, gauge', async ({ page }) => {
    await page.goto('posts/factor-graphs/');
    const w = page.locator('[data-widget="FactorGraphBuilder"]');
    await w.scrollIntoViewIfNeeded();
    await expect(w.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr');
    await expect(w.locator('[data-readout="nnzJ"]')).toHaveText('135 of 651');
    await w.locator('[data-action="solve"]').click();
    await expect(w.locator('[data-readout="cost"]')).toHaveText('5.64');
    await expect(w.locator('[data-readout="err"]')).toHaveText('0.09 m');
    await w.locator('[data-factor="prior"]').click();
    await expect(w.locator('[data-readout="free"]')).toHaveText('3');
    await expect(w.locator('[data-action="solve"]')).toBeDisabled();
    await w.locator('[data-action="reset"]').click();
    await expect(w.locator('[data-readout="free"]')).toHaveText('0');
  });
});
