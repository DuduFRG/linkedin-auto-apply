/**
 * Smoke test: the unpacked extension loads in Chromium, the service worker
 * boots without errors and the side panel page renders and talks to it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const EXT = path.join(__dirname, '..', '..', 'extension');

test('extension loads and the service worker answers messages', { timeout: 60000 }, async (t) => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laa-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  t.after(async () => {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  const extensionId = new URL(worker.url()).host;
  assert.match(extensionId, /^[a-p]{32}$/);

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`);
  await page.waitForSelector('#btnPrimary');
  // "auto" follows the browser language (English in this headless browser).
  await page.waitForFunction(() => document.querySelector('#btnPrimaryLabel').textContent !== '');
  assert.equal(await page.textContent('#btnPrimaryLabel'), 'Start');

  // Switching language re-renders the whole panel instantly.
  await page.selectOption('#languageSelect', 'pt');
  await page.waitForFunction(() => document.querySelector('#btnPrimaryLabel').textContent === 'Iniciar');
  assert.equal(await page.textContent('[data-tab="history"]'), 'Histórico');
  await page.selectOption('#languageSelect', 'es');
  await page.waitForFunction(() => document.querySelector('[data-tab="run"]').textContent === 'Búsqueda');
  assert.equal(await page.getAttribute('html', 'lang'), 'es-ES');

  // Settings typed in the panel are persisted locally.
  await page.fill('[data-setting="keyword"]', 'Videomaker');
  await page.waitForTimeout(700);
  const stored = await page.evaluate(() => chrome.storage.local.get('settings'));
  assert.equal(stored.settings.keyword, 'Videomaker');

  // Starting is refused until the terms of use are accepted.
  const refused = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'START' }));
  assert.equal(refused.ok, false);
  assert.equal(refused.error.key, 'termsRequired');
  assert.equal(await page.isVisible('#termsCard'), true);
  await page.check('#termsCheck');
  await page.click('#btnAcceptTerms');
  await page.waitForFunction(() => document.querySelector('#termsCard').hidden);
  const accepted = await page.evaluate(() => chrome.storage.local.get('settings'));
  assert.ok(accepted.settings.termsAcceptedAt > 0);

  // Round trip to the service worker (PAUSE is harmless with no active run).
  const reply = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'PAUSE' }));
  assert.deepEqual(reply, { ok: true });
  assert.deepEqual(errors, []);
});
