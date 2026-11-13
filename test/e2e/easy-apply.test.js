/**
 * End-to-end test of the content-script engine against a mock Easy Apply page.
 * Runs in real Chromium (Playwright) with an in-memory chrome.storage stub.
 *
 * Covers: profile autofill, resume selection learned from the user, unknown
 * questions -> ask -> remember, validation error -> re-ask, answer reuse,
 * follow-company opt-out, submission, skip -> discard, and search collection.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..', 'extension');
const SCRIPTS = [
  'shared/constants.js',
  'shared/text.js',
  'shared/storage.js',
  'shared/profile.js',
  'shared/search-url.js',
  'content/selectors.js',
  'content/dom.js',
  'content/control.js',
  'content/fields.js',
  'content/resume.js',
  'content/easy-apply.js',
  'content/search.js',
  'content/runner.js',
];

const CHROME_STUB = () => {
  window.__LAA_NO_AUTOBOOT__ = true;
  Math.random = () => 0; // shortest human-like pauses
  const data = {};
  const listeners = new Set();
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  window.__data = data;
  window.__asked = [];
  window.chrome = {
    runtime: { id: 'test', sendMessage: async () => ({ tabId: 1 }) },
    storage: {
      onChanged: { addListener: (l) => listeners.add(l), removeListener: (l) => listeners.delete(l) },
      local: {
        async get(keys) {
          const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(data);
          const out = {};
          list.forEach((k) => {
            if (k in data) out[k] = clone(data[k]);
          });
          return out;
        },
        async set(obj) {
          const changes = {};
          Object.entries(obj).forEach(([k, v]) => {
            changes[k] = { oldValue: clone(data[k]), newValue: clone(v) };
            data[k] = clone(v);
            if (k === 'pending' && v) window.__asked.push(clone(v));
          });
          setTimeout(() => listeners.forEach((l) => l(changes, 'local')), 0);
        },
      },
    },
  };
};

async function openPage(browser, fixture, seed) {
  const page = await browser.newPage();
  await page.addInitScript(CHROME_STUB);
  await page.goto(`file://${path.join(__dirname, 'fixtures', fixture)}`);
  for (const file of SCRIPTS) await page.addScriptTag({ path: path.join(ROOT, file) });
  await page.evaluate(async (s) => {
    for (const [k, v] of Object.entries(s)) await window.chrome.storage.local.set({ [k]: v });
  }, seed);
  return page;
}

/** Answers pending questions using `responder(question, attempt)` until `done` resolves. */
function autoResponder(page, responder) {
  let stopped = false;
  const attempts = {};
  const loop = (async () => {
    while (!stopped) {
      const pending = await page.evaluate(() => window.__data.pending).catch(() => null);
      if (pending) {
        const answers = {};
        let action = 'answer';
        for (const q of pending.questions || []) {
          attempts[q.key] = (attempts[q.key] || 0) + 1;
          const value = responder(q, attempts[q.key], pending);
          if (value === '__skip__') action = 'skip';
          answers[q.key] = value;
        }
        if (pending.kind === 'confirm') action = responder({ key: '__confirm__' }, 1, pending);
        await page.evaluate(([id, a, act]) => window.chrome.storage.local.set({ pendingAnswer: { id, action: act, answers: a } }), [
          pending.id,
          answers,
          action,
        ]);
        await page.waitForFunction((id) => !window.__data.pending || window.__data.pending.id !== id, pending.id);
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  })();
  return { stop: () => { stopped = true; return loop; }, attempts };
}

const BASE_SEED = {
  control: { state: 'running' },
  run: { phase: 'applying' },
  settings: {
    keyword: 'Videomaker',
    resumeName: '',
    confirmBeforeSubmit: false,
    askOptionalFields: false,
    followCompanies: false,
    maxApplications: 25,
  },
  profile: { firstName: 'Ana', lastName: 'Lima', email: 'ana@example.com', phoneCountry: '+55', phone: '11999998888' },
  answers: {
    "choice:do you have a valid driver s license": { label: "Do you have a valid driver's license?", family: 'choice', type: 'radio', value: 'Sim' },
  },
};

async function runJob(page) {
  return page.evaluate(async () => {
    const LAA = window.LAA;
    const data = await LAA.Store.getMany(['settings', 'profile', 'answers']);
    const job = { jobId: '1', ...LAA.EasyApply.jobInfo() };
    return LAA.EasyApply.run({ job, settings: data.settings, profile: data.profile, answers: data.answers });
  });
}

test('Easy Apply engine', { timeout: 180000 }, async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());

  await t.test('first run: autofills known data, asks unknown questions, learns and submits', async () => {
    const page = await openPage(browser, 'job.html', BASE_SEED);
    const responder = autoResponder(page, (q, attempt) => {
      if (q.key === '__resume__') return 'CV_Videomaker.pdf';
      if (/premiere/i.test(q.label)) return attempt === 1 ? 'cinco' : '5';
      if (/english/i.test(q.label)) return 'professional';
      return '__unexpected__';
    });

    const result = await runJob(page);
    await responder.stop();

    assert.equal(result.status, 'applied', result.reason);
    const mock = await page.evaluate(() => window.__mock);
    assert.equal(mock.submitted.email, 'ana@example.com', 'email select filled from profile');
    assert.equal(mock.submitted.cc, 'br', 'country code matched "+55" -> Brazil (+55)');
    assert.equal(mock.submitted.phone, '11999998888', 'phone filled from profile');
    assert.equal(mock.submitted.resume, 'r2', 'chosen resume selected');
    assert.equal(mock.submitted['numeric-years'], '5', 'validation error triggered a re-ask');
    assert.equal(mock.submitted.lic, 'lic-y', 'saved "Sim" answer reused for Yes/No radio');
    assert.equal(mock.submitted.english, 'Professional');
    assert.equal(mock.submitted.site, '', 'optional unknown field left empty');
    assert.equal(mock.submitted['follow-company-checkbox'], false, 'follow company unchecked');

    const asked = await page.evaluate(() => window.__asked);
    const labels = asked.flatMap((p) => p.questions.map((q) => q.label));
    assert.ok(!labels.some((l) => /driver|email|phone/i.test(l)), `asked only unknowns, got: ${labels.join(' | ')}`);
    const retry = asked.flatMap((p) => p.questions).find((q) => /premiere/i.test(q.label) && q.error);
    assert.ok(retry, 'second ask carried the validation error');
    assert.equal(retry.suggestion, 'cinco', 'second ask pre-filled with the rejected answer');

    const store = await page.evaluate(() => window.__data);
    assert.equal(store.settings.resumeName, 'CV_Videomaker.pdf');
    assert.equal(store.answers['text:how many years of experience do you have with adobe premiere'].value, '5');
    assert.equal(store.answers['choice:what is your level of proficiency in english'].value, 'professional');
    assert.equal(store.answers['choice:do you have a valid driver s license'].uses, 1);
    assert.equal(store.pending, null);
    await page.close();

    // ---- Second run with what was learned: zero questions ----
    const page2 = await openPage(browser, 'job.html', {
      ...BASE_SEED,
      settings: store.settings,
      answers: store.answers,
    });
    const result2 = await runJob(page2);
    assert.equal(result2.status, 'applied', result2.reason);
    assert.equal((await page2.evaluate(() => window.__asked)).length, 0, 'no questions on second run');
    await page2.close();
  });

  await t.test('skip from the panel discards the application', async () => {
    const page = await openPage(browser, 'job.html', { ...BASE_SEED, settings: { ...BASE_SEED.settings, resumeName: 'CV_Geral' } });
    const responder = autoResponder(page, () => '__skip__');
    const result = await runJob(page);
    await responder.stop();
    assert.equal(result.status, 'skipped');
    const mock = await page.evaluate(() => window.__mock);
    assert.equal(mock.discarded, true);
    assert.equal(mock.submitted, null);
    assert.equal(await page.evaluate(() => !!document.querySelector('.jobs-easy-apply-modal')), false);
    await page.close();
  });

  await t.test('stop signal aborts and discards', async () => {
    const page = await openPage(browser, 'job.html', BASE_SEED);
    const pending = page.evaluate(async () => {
      const LAA = window.LAA;
      const data = await LAA.Store.getMany(['settings', 'profile', 'answers']);
      try {
        await LAA.EasyApply.run({ job: { jobId: '1' }, settings: data.settings, profile: data.profile, answers: data.answers });
        return 'finished';
      } catch (err) {
        return err.name;
      }
    });
    await page.waitForFunction(() => !!window.__data.pending);
    await page.evaluate(() => window.chrome.storage.local.set({ control: { state: 'idle' } }));
    assert.equal(await pending, 'StopSignal');
    assert.equal(await page.evaluate(() => window.__mock.discarded), true);
    await page.close();
  });

  await t.test('search page: collects unique ids and ignores applied cards', async () => {
    const page = await openPage(browser, 'search.html', BASE_SEED);
    const res = await page.evaluate(() => window.LAA.Search.collect());
    assert.deepEqual(res.ids, ['1001', '1003', '1004']);
    assert.equal(res.appliedOnPage, 1);
    await page.close();
  });
});
