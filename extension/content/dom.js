/**
 * Small DOM toolkit for the content script: visibility checks, waits,
 * human-like pauses and value setters that framework-managed inputs accept.
 */
(function (root) {
  'use strict';

  const LAA = (root.LAA = root.LAA || {});
  const T = LAA.T;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
  const jitter = (min, max) => Math.round(min + Math.random() * Math.max(0, max - min));

  /** Random pause so actions never fire at machine speed. */
  const pause = (min = 450, max = 1100) => sleep(jitter(min, max));

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (el.getClientRects().length === 0) return false;
    const style = root.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) !== 0;
  }

  function text(el) {
    if (!el) return '';
    return String(el.innerText || el.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function toList(selectors) {
    return Array.isArray(selectors) ? selectors : [selectors];
  }

  /** All matches for a list of selectors, de-duplicated, in selector priority order. */
  function all(selectors, scope = document, { visible = true } = {}) {
    const seen = new Set();
    const out = [];
    toList(selectors).forEach((sel) => {
      let nodes = [];
      try {
        nodes = scope.querySelectorAll(sel);
      } catch (_) {
        nodes = [];
      }
      nodes.forEach((n) => {
        if (seen.has(n)) return;
        if (visible && !isVisible(n)) return;
        seen.add(n);
        out.push(n);
      });
    });
    return out;
  }

  function first(selectors, scope = document, opts) {
    return all(selectors, scope, opts)[0] || null;
  }

  /** Visible elements matching `selector` whose text / aria-label contains any of `needles`. */
  function byText(scope, selector, needles) {
    return all(selector, scope).filter((el) => {
      const label = `${text(el)} ${el.getAttribute('aria-label') || ''}`;
      return T.includesAny(label, needles);
    });
  }

  /** Polls `fn` until it returns a truthy value or the timeout expires (returns null). */
  async function waitFor(fn, { timeout = 10000, interval = 250 } = {}) {
    const end = Date.now() + timeout;
    for (;;) {
      let value = null;
      try {
        value = fn();
      } catch (_) {
        value = null;
      }
      if (value) return value;
      if (Date.now() >= end) return null;
      await sleep(interval);
    }
  }

  function nativeSetter(el) {
    let proto = root.HTMLInputElement.prototype;
    if (el instanceof root.HTMLTextAreaElement) proto = root.HTMLTextAreaElement.prototype;
    else if (el instanceof root.HTMLSelectElement) proto = root.HTMLSelectElement.prototype;
    return Object.getOwnPropertyDescriptor(proto, 'value').set;
  }

  function fire(el, type) {
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }

  /** Sets a value the way a real keystroke would, so Ember/React state updates. */
  function setValue(el, value) {
    el.focus();
    nativeSetter(el).call(el, value);
    fire(el, 'input');
    fire(el, 'change');
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Unidentified' }));
    fire(el, 'blur');
  }

  /** Types character by character (used for typeahead fields that react to keystrokes). */
  async function typeSlowly(el, value) {
    el.focus();
    const setter = nativeSetter(el);
    setter.call(el, '');
    fire(el, 'input');
    let current = '';
    for (const ch of String(value)) {
      current += ch;
      setter.call(el, current);
      el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ch }));
      fire(el, 'input');
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ch }));
      await sleep(jitter(45, 110));
    }
    fire(el, 'change');
  }

  function setSelect(el, optionValue) {
    el.focus();
    nativeSetter(el).call(el, optionValue);
    fire(el, 'input');
    fire(el, 'change');
    fire(el, 'blur');
  }

  function click(el) {
    if (!el) return false;
    try {
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
    } catch (_) {
      /* ignore */
    }
    el.click();
    return true;
  }

  function isDisabled(el) {
    return !!el && (el.disabled || el.getAttribute('aria-disabled') === 'true');
  }

  /** Nearest scrollable ancestor, or null. */
  function scrollParent(el) {
    let node = el && el.parentElement;
    while (node && node !== document.body) {
      const style = root.getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 10) return node;
      node = node.parentElement;
    }
    return null;
  }

  LAA.D = Object.freeze({
    sleep,
    jitter,
    pause,
    isVisible,
    text,
    all,
    first,
    byText,
    waitFor,
    setValue,
    typeSlowly,
    setSelect,
    click,
    isDisabled,
    scrollParent,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
