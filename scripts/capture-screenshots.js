/**
 * Captures side panel screenshots with fictional demo data, for the README
 * and the landing page. Usage: node scripts/capture-screenshots.js
 *
 * Output (PNG, 2x): docs/images/panel.png (EN) and docs/images/site/*.png
 * Then run: python3 scripts/optimize-images.py
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PANEL = path.join(ROOT, 'extension', 'sidepanel', 'sidepanel.html');

const DEMO = {
  en: {
    keyword: 'Video Editor',
    location: 'Lisbon, Portugal',
    job: { title: 'Senior Video Editor', company: 'Northlight Studio' },
    questions: [
      ['text:years', 'How many years of experience do you have with Adobe Premiere Pro?', 'number', 'text', [], '7'],
      ['choice:english', 'What is your level of proficiency in English?', 'radio', 'choice', ['Conversational', 'Professional', 'Native or bilingual'], ''],
      ['checkbox:relocate', 'Are you willing to relocate?', 'checkbox', 'checkbox', [], ''],
    ],
    history: [
      ['Motion Designer', 'Atlas Media', 'applied'],
      ['Video Producer', 'Harbor & Co.', 'applied'],
      ['Photographer', 'Lumen Retail', 'skipped'],
    ],
  },
  pt: {
    keyword: 'Editor de Vídeo',
    location: 'São Paulo, Brasil',
    job: { title: 'Editor de Vídeo Sênior', company: 'Estúdio Aurora' },
    questions: [
      ['text:anos', 'Quantos anos de experiência você tem com Adobe Premiere Pro?', 'number', 'text', [], '7'],
      ['choice:ingles', 'Qual é o seu nível de inglês?', 'radio', 'choice', ['Intermediário', 'Avançado', 'Fluente'], ''],
      ['checkbox:mudanca', 'Você tem disponibilidade para mudança?', 'checkbox', 'checkbox', [], ''],
    ],
    history: [
      ['Motion Designer', 'Agência Norte', 'applied'],
      ['Produtor de Vídeo', 'Casa Lume', 'applied'],
      ['Fotógrafo de Produto', 'Loja Sul', 'skipped'],
    ],
  },
};

function seed(lang) {
  const d = DEMO[lang];
  const now = Date.now();
  return {
    settings: { language: lang, keyword: d.keyword, location: d.location, maxApplications: 25, minDelaySec: 15, maxDelaySec: 40, datePosted: 'week' },
    control: { state: 'running' },
    run: {
      phase: 'waiting_user',
      startedAt: now - 23 * 60000,
      message: { key: 'applyingTo', params: { title: d.job.title } },
      current: { jobId: '1', ...d.job, url: 'https://www.linkedin.com/jobs/view/1/' },
      stats: { applied: 14, skipped: 4, failed: 1 },
    },
    pending: {
      id: 'demo',
      kind: 'questions',
      job: d.job,
      questions: d.questions.map(([key, label, type, family, options, suggestion]) => ({ key, label, type, family, options, required: true, error: '', suggestion })),
    },
    answers: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`text:demo ${i}`, { label: `Demo ${i}`, family: 'text', value: 'x', updatedAt: now }])),
    history: d.history.map(([title, company, status], i) => ({
      jobId: String(i),
      title,
      company,
      status,
      reason: status === 'applied' ? { key: 'applied' } : { key: 'alreadyApplied' },
      at: now - (i + 1) * 420000,
    })),
    log: [],
  };
}

async function shoot(browser, lang, out, { scheme = 'light', height = 980 } = {}) {
  const page = await browser.newPage({ viewport: { width: 400, height }, deviceScaleFactor: 2, colorScheme: scheme });
  await page.addInitScript((data) => {
    const listeners = new Set();
    window.chrome = {
      runtime: { id: 'demo', sendMessage: async () => ({ ok: true }) },
      storage: {
        onChanged: { addListener: (l) => listeners.add(l), removeListener: (l) => listeners.delete(l) },
        local: {
          async get(keys) {
            const out = {};
            (Array.isArray(keys) ? keys : [keys]).forEach((k) => {
              if (k in data) out[k] = data[k];
            });
            return out;
          },
          async set(obj) {
            Object.assign(data, obj);
          },
        },
      },
    };
    try {
      localStorage.setItem('laa.tab', 'history');
    } catch (_) {}
  }, seed(lang));
  await page.goto(`file://${PANEL}`);
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    if (document.activeElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(300);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 400, height } });
  await page.close();
  console.log('wrote', path.relative(ROOT, out));
}

(async () => {
  const browser = await chromium.launch();
  await shoot(browser, 'en', path.join(ROOT, 'docs', 'images', 'panel.png'), { height: 1040 });
  await shoot(browser, 'pt', path.join(ROOT, 'docs', 'images', 'site', 'painel.png'), { height: 1040 });
  await shoot(browser, 'pt', path.join(ROOT, 'docs', 'images', 'site', 'painel-dark.png'), { scheme: 'dark', height: 1040 });
  await browser.close();
})();
