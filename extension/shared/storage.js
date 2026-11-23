/**
 * Local persistence layer on top of chrome.storage.local.
 *
 * Privacy: this is the ONLY place user data is written. chrome.storage.local
 * lives inside the browser profile on the user's machine. Nothing is synced
 * (chrome.storage.sync is never used) and nothing is sent over the network.
 *
 * chrome.storage also doubles as the message bus between the content script,
 * the service worker and the side panel: it survives service worker restarts
 * and page reloads, which makes the automation resumable.
 */
(function (root) {
  'use strict';

  const LAA = (root.LAA = root.LAA || {});
  const { STORAGE: K, LIMITS, CONTROL_STATE, PHASE } = LAA.C;

  const DEFAULTS = Object.freeze({
    [K.SETTINGS]: {
      language: 'auto', // auto | pt | en | es
      termsAcceptedAt: null, // timestamp of the first-run acceptance
      termsVersion: null,
      keyword: '',
      location: '',
      resumeName: '',
      datePosted: 'any', // any | day | week | month
      remoteOnly: false,
      maxApplications: 25,
      minDelaySec: 15,
      maxDelaySec: 40,
      confirmBeforeSubmit: false,
      askOptionalFields: false,
      followCompanies: false,
      excludeKeywords: '',
    },
    [K.PROFILE]: {
      firstName: '',
      lastName: '',
      email: '',
      phoneCountry: '',
      phone: '',
      city: '',
      linkedinUrl: '',
      website: '',
    },
    [K.ANSWERS]: {},
    [K.HISTORY]: [],
    [K.RUN]: { phase: PHASE.IDLE },
    [K.CONTROL]: { state: CONTROL_STATE.IDLE },
    [K.PENDING]: null,
    [K.PENDING_ANSWER]: null,
    [K.LOG]: [],
  });

  const clone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)));

  function area() {
    if (!root.chrome || !root.chrome.storage || !root.chrome.storage.local) {
      throw new Error('chrome.storage.local is not available in this context');
    }
    return root.chrome.storage.local;
  }

  function withDefaults(key, value) {
    const def = DEFAULTS[key];
    if (value === undefined) return clone(def);
    if (def && typeof def === 'object' && !Array.isArray(def) && value && typeof value === 'object' && !Array.isArray(value)) {
      return { ...clone(def), ...value };
    }
    return value;
  }

  async function get(key) {
    const result = await area().get(key);
    return withDefaults(key, result[key]);
  }

  async function getMany(keys) {
    const result = await area().get(keys);
    const out = {};
    keys.forEach((key) => {
      out[key] = withDefaults(key, result[key]);
    });
    return out;
  }

  async function set(key, value) {
    await area().set({ [key]: value });
    return value;
  }

  // Serialises read-modify-write cycles on the same key within one JS context.
  const locks = new Map();
  function withLock(key, fn) {
    const prev = locks.get(key) || Promise.resolve();
    const next = prev.then(fn, fn);
    locks.set(key, next.catch(() => {}));
    return next;
  }

  function update(key, mutator) {
    return withLock(key, async () => {
      const current = await get(key);
      const result = mutator(current);
      const next = result === undefined ? current : result;
      await set(key, next);
      return next;
    });
  }

  function patch(key, partial) {
    return update(key, (current) => ({ ...(current || {}), ...partial }));
  }

  /** Subscribes to changes of one key. Returns an unsubscribe function. */
  function onChange(key, callback) {
    const listener = (changes, areaName) => {
      if (areaName !== 'local' || !(key in changes)) return;
      callback(withDefaults(key, changes[key].newValue), changes[key].oldValue);
    };
    root.chrome.storage.onChanged.addListener(listener);
    return () => root.chrome.storage.onChanged.removeListener(listener);
  }

  /**
   * Resolves with { tag, value } as soon as any watcher predicate is true.
   * watchers: [{ key, tag, test(value) }]
   */
  function waitForAny(watchers) {
    return new Promise((resolve, reject) => {
      let done = false;
      const offs = [];
      const finish = (payload) => {
        if (done) return;
        done = true;
        offs.forEach((off) => off());
        resolve(payload);
      };
      watchers.forEach((w) => {
        offs.push(
          onChange(w.key, (value) => {
            try {
              if (w.test(value)) finish({ tag: w.tag, value });
            } catch (err) {
              done = true;
              offs.forEach((off) => off());
              reject(err);
            }
          })
        );
      });
      // Check current values in case the condition is already met.
      Promise.all(watchers.map((w) => get(w.key)))
        .then((values) => {
          values.forEach((value, i) => {
            if (!done && watchers[i].test(value)) finish({ tag: watchers[i].tag, value });
          });
        })
        .catch(reject);
    });
  }

  // ---------- Domain helpers ----------

  async function log(level, message, extra) {
    // `message` is an i18n message object ({ key, params }) or plain text.
    const entry = { at: Date.now(), level, message: message && typeof message === 'object' ? message : String(message) };
    if (extra) entry.extra = extra;
    await update(K.LOG, (list) => {
      const next = Array.isArray(list) ? list.slice(-(LIMITS.MAX_LOG - 1)) : [];
      next.push(entry);
      return next;
    });
    return entry;
  }

  function patchRun(partial) {
    return patch(K.RUN, partial);
  }

  function saveAnswer(key, data) {
    return update(K.ANSWERS, (answers) => {
      const prev = answers[key] || {};
      answers[key] = {
        ...prev,
        ...data,
        createdAt: prev.createdAt || Date.now(),
        updatedAt: Date.now(),
        uses: prev.uses || 0,
      };
      return answers;
    });
  }

  function touchAnswers(keys) {
    if (!keys.length) return Promise.resolve();
    return update(K.ANSWERS, (answers) => {
      keys.forEach((key) => {
        if (answers[key]) {
          answers[key].uses = (answers[key].uses || 0) + 1;
          answers[key].lastUsedAt = Date.now();
        }
      });
      return answers;
    });
  }

  function appendHistory(entry) {
    return update(K.HISTORY, (list) => {
      const next = Array.isArray(list) ? list.filter((h) => h.jobId !== entry.jobId) : [];
      next.push({ ...entry, at: Date.now() });
      return next.slice(-LIMITS.MAX_HISTORY);
    });
  }

  /** Exportable snapshot of what the user taught the extension. */
  async function exportData() {
    const data = await getMany([K.SETTINGS, K.PROFILE, K.ANSWERS]);
    return {
      app: LAA.C.APP_NAME,
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: data[K.SETTINGS],
      profile: data[K.PROFILE],
      answers: data[K.ANSWERS],
    };
  }

  async function importData(payload, { merge = true } = {}) {
    if (!payload || typeof payload !== 'object' || typeof payload.answers !== 'object') {
      throw new Error('importInvalid');
    }
    await update(K.ANSWERS, (answers) => (merge ? { ...answers, ...payload.answers } : { ...payload.answers }));
    if (payload.profile && typeof payload.profile === 'object') await patch(K.PROFILE, payload.profile);
    if (payload.settings && typeof payload.settings === 'object') await patch(K.SETTINGS, payload.settings);
  }

  LAA.Store = Object.freeze({
    KEYS: K,
    DEFAULTS,
    get,
    getMany,
    set,
    update,
    patch,
    onChange,
    waitForAny,
    log,
    patchRun,
    saveAnswer,
    touchAnswers,
    appendHistory,
    exportData,
    importData,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
