/**
 * Text utilities: label cleanup, question keys and fuzzy option matching.
 * Pure functions, no DOM or chrome APIs, fully unit tested.
 */
(function (root) {
  'use strict';

  const LAA = (root.LAA = root.LAA || {});

  const YES = ['yes', 'sim', 'si', 'oui', 'ja', 'y', 's', 'true'];
  const NO = ['no', 'nao', 'non', 'nein', 'n', 'false'];

  const PLACEHOLDERS = [
    'select an option',
    'select',
    'choose',
    'choose an option',
    'selecione uma opcao',
    'selecione',
    'escolha uma opcao',
    'seleccione una opcion',
    'selecciona una opcion',
    'selectionnez une option',
    'option auswahlen',
  ];

  const STOPWORDS = new Set([
    'a', 'an', 'the', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'do', 'you', 'your', 'have', 'are', 'is',
    'o', 'os', 'as', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'e', 'ou', 'voce', 'seu', 'sua', 'tem', 'possui',
    'el', 'la', 'los', 'las', 'del', 'y', 'tu', 'usted',
  ]);

  function stripAccents(value) {
    return String(value == null ? '' : value)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  }

  /** Lowercase, accent-free, punctuation-free, single-spaced. */
  function normalize(value) {
    return stripAccents(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  /**
   * Cleans a label scraped from the DOM. LinkedIn often renders the same text
   * twice (visible + screen-reader copy) and appends "Required" markers.
   */
  function cleanLabel(raw) {
    const lines = String(raw == null ? '' : raw)
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    let text = Array.from(new Set(lines)).join(' ');

    const half = text.length / 2;
    if (Number.isInteger(half) && half > 0 && text.slice(0, half) === text.slice(half)) {
      text = text.slice(0, half);
    }
    const words = text.split(' ');
    if (words.length % 2 === 0) {
      const mid = words.length / 2;
      if (words.slice(0, mid).join(' ') === words.slice(mid).join(' ')) text = words.slice(0, mid).join(' ');
    }

    return text
      .replace(/\s*\*\s*/g, ' ')
      .replace(/\s*\((required|obrigat[oó]rio|obligatorio)\)\s*$/i, '')
      .replace(/\s+(required|obrigat[oó]rio|obligatorio)\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Field families share answers across input types. A yes/no question asked as
   * a <select> in one job and as radio buttons in another maps to the same key.
   */
  function familyOf(type) {
    switch (type) {
      case 'select':
      case 'radio':
        return 'choice';
      case 'checkboxes':
        return 'multi';
      case 'checkbox':
        return 'checkbox';
      default:
        return 'text';
    }
  }

  function questionKey(type, label) {
    return `${familyOf(type)}:${normalize(label)}`;
  }

  function isPlaceholderOption(text, value) {
    if (value === '') return true;
    return PLACEHOLDERS.includes(normalize(text));
  }

  /** true / false for yes-no answers, null when the value is not boolean-ish. */
  function boolish(value) {
    if (typeof value === 'boolean') return value;
    const n = normalize(value);
    if (YES.includes(n)) return true;
    if (NO.includes(n)) return false;
    return null;
  }

  function toNumber(value) {
    const n = normalize(value).replace(/\s+/g, '');
    return /^\d+$/.test(n) ? Number(n) : null;
  }

  /**
   * Finds the option that best matches a stored answer.
   * Returns the option index or -1.
   */
  function matchOption(options, value) {
    if (value == null || !Array.isArray(options) || options.length === 0) return -1;
    const v = normalize(Array.isArray(value) ? value[0] : value);
    if (!v) return -1;
    const opts = options.map(normalize);

    let i = opts.indexOf(v);
    if (i >= 0) return i;

    const b = boolish(v);
    if (b !== null) {
      i = opts.findIndex((o) => boolish(o) === b);
      if (i >= 0) return i;
    }

    const num = toNumber(v);
    if (num !== null) {
      i = opts.findIndex((o) => toNumber(o) === num);
      if (i >= 0) return i;
    }

    // Whole-word match, e.g. "+55" -> "Brasil (+55)".
    i = opts.findIndex((o) => ` ${o} `.includes(` ${v} `));
    if (i >= 0) return i;

    if (v.length >= 2) {
      i = opts.findIndex((o) => o.startsWith(v));
      if (i >= 0) return i;
    }
    if (v.length >= 3) {
      i = opts.findIndex((o) => o.includes(v));
      if (i >= 0) return i;
    }
    i = opts.findIndex((o) => o.length >= 4 && v.includes(o));
    return i;
  }

  function tokens(value) {
    return normalize(value)
      .split(' ')
      .filter((t) => t && !STOPWORDS.has(t));
  }

  /** Jaccard similarity of meaningful tokens, 0..1. */
  function similarity(a, b) {
    const ta = new Set(tokens(a));
    const tb = new Set(tokens(b));
    if (!ta.size || !tb.size) return 0;
    let inter = 0;
    ta.forEach((t) => {
      if (tb.has(t)) inter += 1;
    });
    return inter / (ta.size + tb.size - inter);
  }

  /**
   * Suggests a previously saved answer for a new question with a similar label.
   * Used only as a pre-filled suggestion, never applied automatically.
   */
  function findSimilar(answers, family, label, threshold = 0.6) {
    let best = null;
    Object.entries(answers || {}).forEach(([key, entry]) => {
      if (!key.startsWith(`${family}:`) || !entry) return;
      const score = similarity(entry.label || key.slice(family.length + 1), label);
      if (score >= threshold && (!best || score > best.score)) best = { key, entry, score };
    });
    return best;
  }

  /** Case- and accent-insensitive "contains any of" check. */
  function includesAny(text, needles) {
    const n = normalize(text);
    if (!n) return false;
    return needles.some((needle) => {
      const x = normalize(needle);
      return x && (` ${n} `).includes(` ${x} `);
    });
  }

  function splitList(value) {
    return String(value || '')
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /**
   * Parses pasted "Question = Answer" lines. Accepts a tab (two columns copied
   * from a spreadsheet), "=" or "|" as the separator. Returns [{ label, value }].
   */
  function parseAnswerLines(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map((line) => {
        const sep = line.includes('\t') ? '\t' : line.includes('=') ? '=' : line.includes('|') ? '|' : null;
        if (!sep) return null;
        const at = line.indexOf(sep);
        const label = cleanLabel(line.slice(0, at));
        const value = line.slice(at + 1).trim();
        return label && value ? { label, value } : null;
      })
      .filter(Boolean);
  }

  /** Answer-bank entry for a question typed by the user (yes/no answers are stored as choices). */
  function manualAnswerEntry(label, value) {
    const type = boolish(value) !== null ? 'radio' : 'text';
    return { key: questionKey(type, label), entry: { label: cleanLabel(label), type, family: familyOf(type), value: String(value).trim(), manual: true } };
  }

  /** Saved answer for a field, falling back to the same question stored under another field family. */
  function findSavedAnswer(answers, key, label) {
    const has = (e) => e && e.value != null && e.value !== '' && !(Array.isArray(e.value) && !e.value.length);
    if (has(answers[key])) return { key, entry: answers[key] };
    const n = normalize(label);
    for (const family of ['text', 'choice', 'checkbox', 'multi']) {
      const k = `${family}:${n}`;
      if (k !== key && has(answers[k])) return { key: k, entry: answers[k] };
    }
    return null;
  }

  LAA.T = Object.freeze({
    parseAnswerLines,
    manualAnswerEntry,
    findSavedAnswer,
    stripAccents,
    normalize,
    cleanLabel,
    familyOf,
    questionKey,
    isPlaceholderOption,
    boolish,
    matchOption,
    similarity,
    findSimilar,
    includesAny,
    splitList,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = globalThis.LAA.T;
