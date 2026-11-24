/**
 * Small DOM toolkit for the content script: visibility checks, waits,
 * human-like pauses and value setters that framework-managed inputs accept.
 *
 * LinkedIn renders parts of the job page (notably the Easy Apply dialog)
 * inside shadow roots and same-origin iframes, which document.querySelectorAll
 * cannot see. Every query here walks the document, every shadow root (open,
 * or closed through chrome.dom) and every same-origin iframe document, in any
 * nesting. Elements from another frame are handled with that frame's own
 * constructors and computed styles.
 */
(function (root) {
  'use strict';

  const LAA = (root.LAA = root.LAA || {});
  const T = LAA.T;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
  const jitter = (min, max) => Math.round(min + Math.random() * Math.max(0, max - min));

  /** Random pause so actions never fire at machine speed. */
  const pause = (min = 450, max = 1100) => sleep(jitter(min, max));

  /** The window an element belongs to (differs for elements inside iframes). */
  function viewOf(el) {
    return (el && el.ownerDocument && el.ownerDocument.defaultView) || root;
  }

  function isVisible(el) {
    if (!el || !el.isConnected || typeof el.getClientRects !== 'function') return false;
    if (el.getClientRects().length === 0) return false;
    const style = viewOf(el).getComputedStyle(el);
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

  // ---------- Shadow roots and frames ----------

  function shadowRootOf(el, includeClosed) {
    try {
      if (el.shadowRoot) return el.shadowRoot;
      if (!includeClosed) return null;
      const api = root.chrome && root.chrome.dom;
      if (api && typeof api.openOrClosedShadowRoot === 'function') return api.openOrClosedShadowRoot(el) || null;
    } catch (_) {
      /* not a host */
    }
    return null;
  }

  /** Document of a same-origin iframe, or null for cross-origin / not loaded. */
  function frameDocument(el) {
    try {
      const doc = el.contentDocument;
      return doc && doc.documentElement ? doc : null;
    } catch (_) {
      return null;
    }
  }

  // Closed shadow roots can only be found by asking chrome.dom about each
  // element, so that check is limited to likely hosts: custom elements, known
  // LinkedIn outlets and leaf containers (a host's light DOM is usually empty).
  function likelyClosedHost(el) {
    const tag = el.tagName;
    if (tag.includes('-')) return true;
    if (el.id && /outlet|shadow|interop|modal|apply/i.test(el.id)) return true;
    if (el.hasAttribute('data-testid')) return true;
    return el.childElementCount === 0 && (tag === 'DIV' || tag === 'SECTION' || tag === 'SPAN');
  }

  function collectRoots(start, list) {
    const visit = (r) => {
      if (list.includes(r)) return;
      list.push(r);
      let els = [];
      try {
        els = r.querySelectorAll('*');
      } catch (_) {
        els = [];
      }
      for (const el of els) {
        if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') {
          const doc = frameDocument(el);
          if (doc) visit(doc);
          continue;
        }
        const sr = shadowRootOf(el, likelyClosedHost(el));
        if (sr) visit(sr);
      }
    };
    visit(start);
  }

  /**
   * Follows what is painted at a screen point through shadow roots and iframes,
   * returning every root crossed. Finds hosts that the cheap scan skips.
   */
  function probePoint(x, y) {
    const found = [];
    let doc = document;
    let px = x;
    let py = y;
    let el = doc.elementFromPoint(px, py);
    for (let depth = 0; el && depth < 12; depth += 1) {
      if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') {
        const inner = frameDocument(el);
        if (!inner) break;
        const rect = el.getBoundingClientRect();
        px -= rect.left;
        py -= rect.top;
        doc = inner;
        found.push(inner);
        el = inner.elementFromPoint(px, py);
        continue;
      }
      const sr = shadowRootOf(el, true);
      if (!sr || typeof sr.elementFromPoint !== 'function') break;
      const next = sr.elementFromPoint(px, py);
      found.push(sr);
      if (!next || next === el) break;
      el = next;
    }
    return found;
  }

  // Short-lived cache per scope: waits poll every 250ms and should not rescan the page each time.
  const rootsCache = new Map();

  function roots(scope = document) {
    const now = Date.now();
    const cached = rootsCache.get(scope);
    if (cached && now - cached.at < 400) return cached.list;
    if (rootsCache.size > 50) rootsCache.clear();
    const list = [];
    collectRoots(scope, list);
    if (scope === document) {
      const w = root.innerWidth || 0;
      const h = root.innerHeight || 0;
      [
        [w / 2, h / 2],
        [w / 2, h / 3],
        [w / 2, (h * 2) / 3],
      ].forEach(([x, y]) => probePoint(x, y).forEach((r) => collectRoots(r, list)));
    }
    rootsCache.set(scope, { at: now, list });
    return list;
  }

  /** All matches for a list of selectors, de-duplicated, in selector priority order. */
  function all(selectors, scope = document, { visible = true } = {}) {
    const seen = new Set();
    const out = [];
    const searchRoots = roots(scope);
    toList(selectors).forEach((sel) => {
      searchRoots.forEach((r) => {
        let nodes = [];
        try {
          nodes = r.querySelectorAll(sel);
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

  /** Short description of what is painted at the centre of the screen, for diagnostics. */
  function describeCenter() {
    const x = (root.innerWidth || 0) / 2;
    const y = (root.innerHeight || 0) / 2;
    const el = document.elementFromPoint(x, y);
    if (!el) return 'nada';
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    const src = el.tagName === 'IFRAME' ? ` src=${String(el.getAttribute('src') || '').slice(0, 60)}` : '';
    const shadow = shadowRootOf(el, true) ? ' [shadow]' : '';
    return `${el.tagName.toLowerCase()}${id}${cls}${src}${shadow}`;
  }

  // ---------- Input helpers (realm-safe for elements inside iframes) ----------

  function nativeSetter(el) {
    const view = viewOf(el);
    let proto = view.HTMLInputElement.prototype;
    if (el.tagName === 'TEXTAREA') proto = view.HTMLTextAreaElement.prototype;
    else if (el.tagName === 'SELECT') proto = view.HTMLSelectElement.prototype;
    return Object.getOwnPropertyDescriptor(proto, 'value').set;
  }

  function fire(el, type) {
    const view = viewOf(el);
    el.dispatchEvent(new view.Event(type, { bubbles: true }));
  }

  function key(el, type, k) {
    const view = viewOf(el);
    el.dispatchEvent(new view.KeyboardEvent(type, { bubbles: true, key: k }));
  }

  /** Sets a value the way a real keystroke would, so Ember/React state updates. */
  function setValue(el, value) {
    el.focus();
    nativeSetter(el).call(el, value);
    fire(el, 'input');
    fire(el, 'change');
    key(el, 'keyup', 'Unidentified');
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
      key(el, 'keydown', ch);
      fire(el, 'input');
      key(el, 'keyup', ch);
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
    while (node && node !== node.ownerDocument.body) {
      const style = viewOf(node).getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 10) return node;
      node = node.parentElement;
    }
    return null;
  }

  LAA.D = Object.freeze({
    roots,
    viewOf,
    describeCenter,
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
