const test = require('node:test');
const assert = require('node:assert/strict');

require('../../extension/shared/constants.js');
const T = require('../../extension/shared/text.js');
const Profile = require('../../extension/shared/profile.js');
const Urls = require('../../extension/shared/search-url.js');

test('normalize removes accents, case and punctuation', () => {
  assert.equal(T.normalize('  Você tem CNH?  '), 'voce tem cnh');
  assert.equal(T.normalize('Anos de experiência (Premiere Pro)*'), 'anos de experiencia premiere pro');
});

test('cleanLabel de-duplicates screen-reader copies and required markers', () => {
  assert.equal(T.cleanLabel('Phone country code\nPhone country code'), 'Phone country code');
  assert.equal(T.cleanLabel('Email addressEmail address'), 'Email address');
  assert.equal(T.cleanLabel('How many years of experience? *'), 'How many years of experience?');
  assert.equal(T.cleanLabel('Cidade Required'), 'Cidade');
  assert.equal(T.cleanLabel('Do you have a car? Do you have a car?'), 'Do you have a car?');
});

test('questionKey shares answers between select and radio', () => {
  assert.equal(T.questionKey('select', 'Do you have a car?'), T.questionKey('radio', 'Do you have a car?'));
  assert.notEqual(T.questionKey('text', 'Do you have a car?'), T.questionKey('radio', 'Do you have a car?'));
  assert.equal(T.questionKey('number', 'Years?'), 'text:years');
});

test('matchOption handles yes/no across languages, numbers and partial text', () => {
  assert.equal(T.matchOption(['Sim', 'Não'], 'yes'), 0);
  assert.equal(T.matchOption(['Yes', 'No'], 'não'), 1);
  assert.equal(T.matchOption(['1', '2', '10'], '10'), 2);
  assert.equal(T.matchOption(['Native or bilingual', 'Professional', 'Limited'], 'professional'), 1);
  assert.equal(T.matchOption(['Brasil (+55)', 'Portugal (+351)'], '+55'), 0);
  assert.equal(T.matchOption(['Brazil (+55)', 'Portugal (+351)'], 'Brazil'), 0);
  assert.equal(T.matchOption(['A', 'B'], 'zzz'), -1);
  assert.equal(T.matchOption(['A', 'B'], ''), -1);
});

test('isPlaceholderOption detects LinkedIn placeholders', () => {
  assert.equal(T.isPlaceholderOption('Select an option', 'Select an option'), true);
  assert.equal(T.isPlaceholderOption('Selecione uma opção', 'x'), true);
  assert.equal(T.isPlaceholderOption('Yes', 'Yes'), false);
});

test('findSimilar suggests answers for near-identical questions', () => {
  const answers = {
    'text:how many years of experience do you have with adobe premiere': {
      label: 'How many years of experience do you have with Adobe Premiere?',
      value: '5',
    },
  };
  const hit = T.findSimilar(answers, 'text', 'How many years of experience with Adobe Premiere Pro?');
  assert.ok(hit);
  assert.equal(hit.entry.value, '5');
  assert.equal(T.findSimilar(answers, 'text', 'Expected salary?'), null);
  assert.equal(T.findSimilar(answers, 'choice', 'How many years of experience do you have with Adobe Premiere?'), null);
});

test('profile matcher maps common labels in EN / PT / ES', () => {
  const cases = {
    'Email address': 'email',
    'Endereço de e-mail': 'email',
    'Mobile phone number': 'phone',
    'Número de celular': 'phone',
    'Phone country code': 'phoneCountry',
    'Código do país': 'phoneCountry',
    'First name': 'firstName',
    'Sobrenome': 'lastName',
    'Nome completo': 'fullName',
    'City': 'city',
    'Cidade': 'city',
    'LinkedIn Profile': 'linkedinUrl',
    'Portfolio': 'website',
    'How many years of experience do you have?': null,
    'Nome da empresa atual': null,
  };
  Object.entries(cases).forEach(([label, field]) => {
    assert.equal(Profile.matchProfileField(label), field, label);
  });
  assert.equal(Profile.profileValue({ firstName: 'Ana', lastName: 'Lima' }, 'fullName'), 'Ana Lima');
});

test('search URL enforces Easy Apply and paginates', () => {
  const url = new URL(Urls.buildSearchUrl({ keyword: 'Editor de Vídeo', location: 'São Paulo', datePosted: 'week' }, 2));
  assert.equal(url.pathname, '/jobs/search/');
  assert.equal(url.searchParams.get('keywords'), 'Editor de Vídeo');
  assert.equal(url.searchParams.get('location'), 'São Paulo');
  assert.equal(url.searchParams.get('f_AL'), 'true');
  assert.equal(url.searchParams.get('f_TPR'), 'r604800');
  assert.equal(url.searchParams.get('start'), '50');
  assert.equal(Urls.jobIdFromUrl('https://www.linkedin.com/jobs/view/4012345678/?refId=x'), '4012345678');
  assert.equal(Urls.jobIdFromUrl('https://www.linkedin.com/jobs/search/?currentJobId=123&f_AL=true'), '123');
  assert.equal(Urls.jobIdFromUrl('https://www.linkedin.com/jobs/search-results/?currentJobId=4300000001'), '4300000001');
  assert.equal(Urls.jobIdFromUrl('urn:li:fsd_jobPosting:4300000002'), '4300000002');
});
