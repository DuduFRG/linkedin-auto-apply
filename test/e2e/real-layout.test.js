/**
 * Extração e preenchimento contra trechos colados do LinkedIn real
 * (classes e ids gerados, opção em <p>, pergunta no aria-label, select com placeholder).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..', 'extension');
const SCRIPTS = ['shared/constants.js', 'shared/i18n.js', 'shared/text.js', 'content/selectors.js', 'content/dom.js', 'content/fields.js'];

test('layout real do LinkedIn', { timeout: 60000 }, async (t) => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.chrome = { runtime: { id: 'test' }, storage: { local: { get: async () => ({}), set: async () => {} }, onChanged: { addListener() {} } } };
  });
  await page.goto(`file://${path.join(__dirname, 'fixtures', 'real-layout.html')}`);
  for (const file of SCRIPTS) await page.addScriptTag({ path: path.join(ROOT, file) });

  const fields = await page.evaluate(() =>
    LAA.Fields.extractFields(document.querySelector('[data-real-modal]')).map((f) => ({
      type: f.type, label: f.label, options: f.options, required: f.required, hasValue: f.hasValue, kind: f.kind || null,
    }))
  );
  const find = (re) => fields.find((f) => re.test(f.label));

  await t.test('radio: opções vêm do <p>, pergunta do aria-label compartilhado', () => {
    const f = find(/usdt/i);
    assert.ok(f, JSON.stringify(fields));
    assert.equal(f.type, 'radio');
    assert.equal(f.label, 'Are you ready to receive your salary in USDT?');
    assert.deepEqual(f.options, ['Yes', 'No']);
    assert.equal(f.required, true);
    assert.equal(f.hasValue, false);
  });

  await t.test('select: pergunta no <p> anterior, placeholder "Selecionar opção" ignorado', () => {
    const f = fields.find((x) => x.type === 'select');
    assert.ok(f, JSON.stringify(fields));
    assert.equal(f.label, 'Languages fluently speaking');
    assert.deepEqual(f.options, ['None', 'Conversational', 'Professional', 'Native or bilingual']);
    assert.equal(f.required, true);
    assert.equal(f.hasValue, false);
  });

  await t.test('texto: pergunta obrigatória sem valor', () => {
    const f = find(/salary expectations/i);
    assert.ok(f, JSON.stringify(fields));
    assert.equal(f.type, 'text');
    assert.equal(f.required, true);
  });

  await t.test('cover letter: campo de arquivo reconhecido como carta', () => {
    const f = fields.find((x) => x.type === 'file');
    assert.ok(f, JSON.stringify(fields));
    assert.equal(f.kind, 'coverLetter');
    assert.equal(f.required, true);
  });

  await t.test('"Seguir empresa" nunca vira pergunta e é encontrado pelo texto', async () => {
    assert.ok(!fields.some((f) => /seguir/i.test(f.label)), JSON.stringify(fields));
    const id = await page.evaluate(() => (LAA.Fields.findFollowCompany ? (LAA.Fields.findFollowCompany(document) || {}).id : null));
    assert.equal(id, '_r_f1_');
  });

  await t.test('preenchimento: radio, select e texto aceitam as respostas', async () => {
    const out = await page.evaluate(async () => {
      const all = LAA.Fields.extractFields(document.querySelector('[data-real-modal]'));
      const by = (fn) => all.find(fn);
      const r1 = await LAA.Fields.fillField(by((f) => f.type === 'radio'), 'No');
      const r2 = await LAA.Fields.fillField(by((f) => f.type === 'select'), 'professional');
      const r3 = await LAA.Fields.fillField(by((f) => f.type === 'text'), '45000');
      return {
        ok: [r1.ok, r2.ok, r3.ok],
        radio: (document.querySelector('input[name="radio-group-_r_2u_"]:checked') || {}).id,
        select: document.getElementById('_r_2o_').value,
        text: document.getElementById('_r_t1_').value,
      };
    });
    assert.deepEqual(out, { ok: [true, true, true], radio: '_r_32_', select: 'Professional', text: '45000' });
  });

  await browser.close();
});
