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
  assert.equal(await page.textContent('#btnPrimaryLabel'), 'Iniciar');

  // Settings typed in the panel are persisted locally.
  await page.fill('[data-setting="keyword"]', 'Videomaker');
  await page.waitForTimeout(700);
  const stored = await page.evaluate(() => chrome.storage.local.get('settings'));
  assert.equal(stored.settings.keyword, 'Videomaker');

  // Round trip to the service worker (PAUSE is harmless with no active run).
  const reply = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'PAUSE' }));
  assert.deepEqual(reply, { ok: true });
  assert.deepEqual(errors, []);
});
