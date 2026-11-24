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

const LOGO = (size, radius = 6) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="${radius}" fill="#1e7a5c"/>
  <path d="M9 22 16 9l7 13" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M12 18h8" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/>
</svg>`;

const FONT_CSS = `
@font-face { font-family: 'Schibsted Grotesk'; src: url('${dataUrl(path.join(FONTS, 'schibsted-grotesk.woff2'), 'font/woff2')}'); font-weight: 500 700; }
@font-face { font-family: 'Public Sans'; src: url('${dataUrl(path.join(FONTS, 'public-sans.woff2'), 'font/woff2')}'); font-weight: 400 600; }
`;

/** "Relatório Anual" cover: petrol field, visible column grid, headline + Gráfico 1. */
function card({ width, height, title, foot, figLabel, figTitle, values, xLabels, note }) {
  const max = Math.max(...values);
  const cols = Array.from({ length: 12 }, () => '<span></span>').join('');
  const bars = values
    .map((v, i) => {
      const current = i === values.length - 1;
      const h = Math.max(3, (v / max) * 100);
      return `<div class="col${current ? ' cur' : ''}"><b>${v}</b><i style="height:${h}%"></i><small>${xLabels[i]}</small></div>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  ${FONT_CSS}
  * { box-sizing: border-box; margin: 0; }
  body { width: ${width}px; height: ${height}px; overflow: hidden; background: #0f2a4a; color: #fff; font-family: 'Public Sans', sans-serif; position: relative; }
  .grid { position: absolute; inset: 0 64px; display: grid; grid-template-columns: repeat(12, 1fr); gap: 20px; }
  .grid span { border-left: 1px solid rgba(255,255,255,.09); }
  .grid span:last-child { border-right: 1px solid rgba(255,255,255,.09); }
  .brand { position: absolute; left: 64px; top: 52px; display: flex; align-items: center; gap: 12px; font-family: 'Schibsted Grotesk'; font-weight: 650; font-size: 26px; letter-spacing: -.02em; }
  h1 { position: absolute; left: 64px; top: 150px; width: ${Math.round(width * 0.5)}px; font-family: 'Schibsted Grotesk'; font-weight: 650; font-size: 70px; line-height: .98; letter-spacing: -.04em; }
  .foot { position: absolute; left: 64px; bottom: 56px; display: flex; gap: 28px; font-size: 20px; color: #c4cfdc; }
  .foot span + span::before { content: ''; display: inline-block; width: 4px; height: 4px; border-radius: 50%; background: #c4cfdc; margin: 0 14px 4px -16px; }
  .fig { position: absolute; right: 64px; top: 150px; width: ${Math.round(width * 0.36)}px; }
  .lab { display: flex; gap: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,.5); font-family: 'Schibsted Grotesk'; font-size: 18px; }
  .lab b { font-weight: 700; } .lab span { font-weight: 500; }
  .chart { display: grid; grid-template-columns: repeat(${values.length}, 1fr); gap: 12px; height: 250px; margin-top: 30px; padding-bottom: 28px; border-bottom: 1px solid rgba(255,255,255,.45); position: relative; }
  .col { position: relative; display: flex; flex-direction: column; justify-content: flex-end; align-items: stretch; }
  .col i { display: block; background: rgba(255,255,255,.3); }
  .col b { text-align: center; font-family: 'Schibsted Grotesk'; font-size: 18px; margin-bottom: 6px; }
  .col small { position: absolute; bottom: -28px; left: 0; right: 0; text-align: center; font-family: 'Schibsted Grotesk'; font-size: 14px; color: #c4cfdc; }
  .col.cur i { background: #52c79c; } .col.cur b, .col.cur small { color: #52c79c; }
  .note { margin-top: 40px; font-size: 15px; color: #c4cfdc; }
  </style></head><body>
  <div class="grid">${cols}</div>
  <div class="brand">${LOGO(40)} ApplyPilot</div>
  <h1>${title}</h1>
  <div class="foot">${foot.map((f) => `<span>${f}</span>`).join('')}</div>
  <div class="fig"><div class="lab"><b>${figLabel}</b><span>${figTitle}</span></div><div class="chart">${bars}</div><p class="note">${note}</p></div>
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
  const bg = maskable ? '#1e7a5c' : 'transparent';
  await page.setContent(
    `<html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${bg}">${LOGO(inner, maskable ? 0 : 6)}</body></html>`
  );
  await page.screenshot({ path: out, omitBackground: !maskable });
  await page.close();
  console.log('wrote', path.relative(ROOT, out));
}

(async () => {
  const browser = await chromium.launch();
    
  await render(
    browser,
    card({
      width: 1200,
      height: 630,
      title: 'Cada candidatura pergunta menos que a anterior.',
      foot: ['Gratuita e open source', '100% local', 'PT · EN · ES'],
      figLabel: 'Gráfico 1',
      figTitle: 'Perguntas feitas a você, por candidatura',
      values: [8, 5, 3, 2, 1, 1, 0, 0],
      xLabels: ['1ª', '2ª', '3ª', '4ª', '5ª', '6ª', '7ª', '8ª'],
      note: 'Exemplo ilustrativo.',
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
      title: 'Every application asks less than the last.',
      foot: ['Free and open source', '100% local', 'EN · PT · ES'],
      figLabel: 'Figure 1',
      figTitle: 'Questions asked to you, per application',
      values: [8, 5, 3, 2, 1, 1, 0, 0],
      xLabels: ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'],
      note: 'Illustrative example.',
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
