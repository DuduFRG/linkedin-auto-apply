const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

require('../../extension/shared/constants.js');
const I18n = require('../../extension/shared/i18n.js');

const EXT = path.join(__dirname, '..', '..', 'extension');

test('every language defines exactly the same keys', () => {
  const base = Object.keys(I18n.STRINGS.en).sort();
  for (const lang of I18n.SUPPORTED) {
    assert.deepEqual(Object.keys(I18n.STRINGS[lang]).sort(), base, `keys differ for ${lang}`);
  }
});

test('placeholders are consistent across languages', () => {
  const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
  for (const key of Object.keys(I18n.STRINGS.en)) {
    for (const lang of I18n.SUPPORTED) {
      assert.equal(vars(I18n.STRINGS[lang][key]), vars(I18n.STRINGS.en[key]), `${lang}.${key}`);
    }
  }
});

test('render handles nested messages, plurals and plain text', () => {
  const m = I18n.msg('jobResult', { job: 'Editor', reason: I18n.msg('applied') });
  assert.equal(I18n.render('pt', m), 'Editor: Candidatura enviada.');
  assert.equal(I18n.render('en', m), 'Editor: Application sent.');
  assert.equal(I18n.render('es', m), 'Editor: Postulación enviada.');
  assert.equal(I18n.t('en', 'goalReached', { count: 1 }), 'Goal reached: 1 application sent.');
  assert.equal(I18n.t('en', 'goalReached', { count: 3 }), 'Goal reached: 3 applications sent.');
  assert.equal(I18n.render('en', 'LinkedIn error text'), 'LinkedIn error text');
});

test('resolve falls back to the browser language, then English', () => {
  assert.equal(I18n.resolve('es', 'pt-BR'), 'es');
  assert.equal(I18n.resolve('auto', 'pt-BR'), 'pt');
  assert.equal(I18n.resolve('auto', 'es-MX'), 'es');
  assert.equal(I18n.resolve('auto', 'de-DE'), 'en');
});

test('side panel only references existing translation keys', () => {
  const html = fs.readFileSync(path.join(EXT, 'sidepanel', 'sidepanel.html'), 'utf8');
  const js = fs.readFileSync(path.join(EXT, 'sidepanel', 'sidepanel.js'), 'utf8');
  const keys = new Set();
  for (const m of html.matchAll(/data-i18n(?:-ph|-title|-aria)?="(\w+)"/g)) keys.add(m[1]);
  for (const m of js.matchAll(/\bt\('(\w+)'/g)) keys.add(m[1]);
  for (const m of js.matchAll(/key: '(\w+)'/g)) keys.add(m[1]);
  for (const key of keys) assert.ok(key in I18n.STRINGS.en, `missing key: ${key}`);
});

test('content scripts and service worker only reference existing keys', () => {
  const files = ['content/control.js', 'content/fields.js', 'content/resume.js', 'content/easy-apply.js', 'content/runner.js', 'background/service-worker.js'];
  for (const f of files) {
    const src = fs.readFileSync(path.join(EXT, f), 'utf8');
    for (const m of src.matchAll(/\bM\('(\w+)'/g)) assert.ok(m[1] in I18n.STRINGS.en, `${f}: missing key ${m[1]}`);
  }
});

test('Chrome _locales exist for en, pt_BR and es', () => {
  for (const loc of ['en', 'pt_BR', 'es']) {
    const data = JSON.parse(fs.readFileSync(path.join(EXT, '_locales', loc, 'messages.json'), 'utf8'));
    assert.ok(data.appName.message && data.appDescription.message);
  }
});
