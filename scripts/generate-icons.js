/**
 * Renders the extension icons (PNG) from an inline SVG using Playwright.
 * Usage: node scripts/generate-icons.js
 */
const path = require('path');
const { chromium } = require('playwright');

const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#1e7a5c"/>
  <path d="M9 22 16 9l7 13" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M12 18h8" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/>
</svg>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const size of [16, 32, 48, 128]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${SVG.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`
    );
    const out = path.join(__dirname, '..', 'extension', 'icons', `icon${size}.png`);
    await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    console.log('wrote', out);
  }
  await browser.close();
})();
