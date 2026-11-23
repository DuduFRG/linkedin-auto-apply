/**
 * Renders raster assets for the landing page and the GitHub repo:
 *   site/og-image.png            1200x630  (Open Graph / Twitter, Portuguese)
 *   docs/images/social-preview.png 1280x640 (GitHub social preview, English)
 *   site/favicon.ico, apple-touch-icon.png, icon-192/512.png, icon-maskable-512.png
 *
 * Usage: node scripts/build-site-assets.js   (after capture-screenshots.js)
 * The .ico is assembled with Python Pillow (python3 must be available).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const FONTS = path.join(SITE, 'assets', 'fonts');
// Inline everything as data URIs: pages built with setContent cannot read file:// URLs.
const dataUrl = (p, type) => `data:${type};base64,${fs.readFileSync(p).toString('base64')}`;

const LOGO = (size, radius = 8) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="${radius}" fill="#0f1b2d"/>
  <path d="M9 22 16 9l7 13" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M12 18h8" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/>
</svg>`;

const FONT_CSS = `
@font-face { font-family: 'Newsreader'; src: url('${dataUrl(path.join(FONTS, 'newsreader-display.woff2'), 'font/woff2')}'); font-weight: 380 540; }
@font-face { font-family: 'Newsreader'; src: url('${dataUrl(path.join(FONTS, 'newsreader-display-italic.woff2'), 'font/woff2')}'); font-weight: 380 540; font-style: italic; }
@font-face { font-family: 'Hanken Grotesk'; src: url('${dataUrl(path.join(FONTS, 'hanken-grotesk.woff2'), 'font/woff2')}'); font-weight: 100 900; }
`;

function card({ width, height, eyebrow, title, accent, foot, shot }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  ${FONT_CSS}
  * { box-sizing: border-box; margin: 0; }
  body { width: ${width}px; height: ${height}px; overflow: hidden; background: #faf8f4; font-family: 'Hanken Grotesk', sans-serif; color: #0f1b2d; position: relative; }
  .grid { position: absolute; inset: 0; background-image: linear-gradient(#e5dfd3 1px, transparent 1px), linear-gradient(90deg, #e5dfd3 1px, transparent 1px); background-size: 64px 64px; opacity: .5;
          -webkit-mask-image: radial-gradient(ellipse 60% 80% at 78% 40%, #000 15%, transparent 75%); }
  .copy { position: absolute; left: 80px; top: 0; bottom: 0; width: ${Math.round(width * 0.53)}px; display: flex; flex-direction: column; justify-content: center; gap: 26px; }
  .brand { display: flex; align-items: center; gap: 14px; font-weight: 700; font-size: 28px; letter-spacing: -.01em; }
  .eyebrow { display: flex; align-items: center; gap: 12px; font-size: 17px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: #9a7442; }
  .eyebrow::before { content: ''; width: 34px; height: 1px; background: currentColor; }
  h1 { font-family: 'Newsreader', serif; font-weight: 420; font-size: 62px; line-height: 1.03; letter-spacing: -.02em; }
  h1 em { font-style: italic; font-weight: 400; color: #1f4bc4; }
  .foot { display: flex; gap: 22px; font-size: 20px; color: #46546a; font-weight: 500; }
  .foot span { display: inline-flex; align-items: center; gap: 8px; }
  .foot span::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: #1a7f4b; }
  .device { position: absolute; right: 72px; top: 64px; width: 392px; padding: 10px; border-radius: 26px; background: linear-gradient(#fff, #f4f1ea);
            border: 1px solid #e5dfd3; box-shadow: 0 40px 80px -24px rgba(15,27,45,.35); }
  .device img { display: block; width: 100%; border-radius: 16px; border: 1px solid #e5dfd3; }
  .rule { position: absolute; left: 80px; bottom: 56px; width: 120px; height: 1px; background: #d6cebf; }
  </style></head><body>
  <div class="grid"></div>
  <div class="copy">
    <div class="brand">${LOGO(44, 9)} ApplyPilot</div>
    <div class="eyebrow">${eyebrow}</div>
    <h1>${title} <em>${accent}</em></h1>
    <div class="foot">${foot.map((f) => `<span>${f}</span>`).join('')}</div>
  </div>
  <div class="rule"></div>
  <div class="device"><img src="${dataUrl(shot, 'image/png')}"></div>
  </body></html>`;
}

async function render(browser, html, out, width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out });
  await page.close();
  console.log('wrote', path.relative(ROOT, out));
}

async function icon(browser, size, out, { maskable = false } = {}) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const inner = maskable ? Math.round(size * 0.72) : size;
  const bg = maskable ? '#0f1b2d' : 'transparent';
  await page.setContent(
    `<html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${bg}">${LOGO(inner, maskable ? 0 : 7)}</body></html>`
  );
  await page.screenshot({ path: out, omitBackground: !maskable });
  await page.close();
  console.log('wrote', path.relative(ROOT, out));
}

(async () => {
  const browser = await chromium.launch();
  const ptShot = path.join(ROOT, 'docs', 'images', 'site', 'painel.png');
  const enShot = path.join(ROOT, 'docs', 'images', 'panel.png');

  await render(
    browser,
    card({
      width: 1200,
      height: 630,
      eyebrow: 'Extensão gratuita para Chrome',
      title: 'Você responde uma vez.',
      accent: 'Ele cuida das próximas candidaturas.',
      foot: ['Open source', '100% local', 'PT · EN · ES'],
      shot: ptShot,
    }),
    path.join(SITE, 'og-image.png'),
    1200,
    630
  );

  await render(
    browser,
    card({
      width: 1280,
      height: 640,
      eyebrow: 'Open-source Chrome extension',
      title: 'Answer once.',
      accent: 'It handles every Easy Apply after that.',
      foot: ['MIT licensed', '100% local', 'EN · PT · ES'],
      shot: enShot,
    }),
    path.join(ROOT, 'docs', 'images', 'social-preview.png'),
    1280,
    640
  );

  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ap-icons-'));
  for (const s of [16, 32, 48]) await icon(browser, s, path.join(tmp, `${s}.png`));
  await icon(browser, 180, path.join(SITE, 'apple-touch-icon.png'), { maskable: true });
  await icon(browser, 192, path.join(SITE, 'icon-192.png'));
  await icon(browser, 512, path.join(SITE, 'icon-512.png'));
  await icon(browser, 512, path.join(SITE, 'icon-maskable-512.png'), { maskable: true });
  await browser.close();

  execFileSync('python3', [
    '-c',
    'import sys;from PIL import Image;ims=[Image.open(p) for p in sys.argv[2:]];ims[-1].save(sys.argv[1],sizes=[i.size for i in ims],append_images=ims[:-1])',
    path.join(SITE, 'favicon.ico'),
    path.join(tmp, '16.png'),
    path.join(tmp, '32.png'),
    path.join(tmp, '48.png'),
  ]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('wrote site/favicon.ico');
})();
