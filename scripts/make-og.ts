/**
 * Renders the default Open Graph image (1200×630) to public/og-default.png.
 * Run manually when the design changes: `npx tsx scripts/make-og.ts`.
 * Colors mirror the light-theme tokens in src/styles/tokens.css.
 */
import { chromium } from '@playwright/test';

const html = `<!doctype html><html><head><style>
body{margin:0;width:1200px;height:630px;background:#fdfdfb;font-family:Georgia,serif;color:#1d1d1b;display:flex;align-items:center}
.t{padding:0 80px;max-width:640px}
h1{font-size:72px;line-height:1.05;margin:0 0 24px;font-weight:600}
p{font-family:system-ui,sans-serif;font-size:28px;color:#5c5c58;margin:0}
svg{position:absolute;right:60px;top:65px}
</style></head><body><div class="t"><h1>From Gaussians to Graphs</h1>
<p>Estimation, Kalman filtering and SLAM, explained with interactive animations.</p></div>
<svg width="480" height="500" viewBox="-240 -250 480 500">
<g fill="#cc79a7" opacity=".5">${Array.from({ length: 160 }, (_, i) => {
  const a = i * 2.39996,
    r = 150 * Math.sqrt(((i * 0.618) % 1) * 0.9);
  const x = r * Math.cos(a) * 1.4,
    y = r * Math.sin(a) * 0.55;
  const c = Math.cos(-0.6),
    s = Math.sin(-0.6);
  return `<circle cx="${(c * x - s * y).toFixed(1)}" cy="${(s * x + c * y).toFixed(1)}" r="4"/>`;
}).join('')}</g>
<ellipse rx="215" ry="85" transform="rotate(-34)" fill="rgba(0,158,115,.08)" stroke="#009e73" stroke-width="7"/>
<ellipse rx="120" ry="60" transform="rotate(-20) translate(-20 10)" fill="none" stroke="#0072b2" stroke-width="5" stroke-dasharray="18 12"/>
<circle r="8" fill="#1d1d1b"/></svg></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.screenshot({ path: 'public/og-default.png' });
await browser.close();
console.log('wrote public/og-default.png');
