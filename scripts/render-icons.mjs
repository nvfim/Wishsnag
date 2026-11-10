// Renders the WishSnag SVG masters to PNG extension icons and store assets using the
// locally installed Chromium (Playwright). Usage: npm run icons
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const big = readFileSync(`${root}assets/brand/wishsnag-icon.svg`, 'utf8');
const small = readFileSync(`${root}assets/brand/wishsnag-icon-small.svg`, 'utf8');
mkdirSync(`${root}public/icons`, { recursive: true });
mkdirSync(`${root}assets/store`, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function render(svg, size, out) {
  const sized = svg.replace(/width="128" height="128"/, `width="${size}" height="${size}"`);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`);
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log('wrote', out.replace(root, ''));
}
for (const size of [16, 32]) await render(small, size, `${root}public/icons/icon-${size}.png`);
for (const size of [48, 128]) await render(big, size, `${root}public/icons/icon-${size}.png`);
for (const size of [256, 512]) await render(big, size, `${root}assets/store/icon-${size}.png`);

// Chrome Web Store small promo tile (440x280).
await page.setViewportSize({ width: 440, height: 280 });
await page.setContent(`<html><body style="margin:0">
  <div style="width:440px;height:280px;display:flex;align-items:center;gap:22px;padding:0 34px;box-sizing:border-box;
    background:linear-gradient(135deg,#7c5cff,#6a45f0 55%,#e8336c);font-family:system-ui,sans-serif;color:white">
    ${big.replace(/width="128" height="128"/, 'width="112" height="112"')}
    <div><div style="font-size:44px;font-weight:800;letter-spacing:-1px">WishSnag</div>
    <div style="font-size:17px;font-weight:600;opacity:.92;margin-top:6px">Wishlist it. Wait for it.<br/>Snag it.</div></div>
  </div></body></html>`);
await page.screenshot({ path: `${root}assets/store/promo-440x280.png` });
console.log('wrote assets/store/promo-440x280.png');
await browser.close();
