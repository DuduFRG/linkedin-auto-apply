/**
 * Service worker: starts / pauses / stops runs, owns the automation tab,
 * keeps the toolbar badge in sync and notifies the user when input is needed.
 *
 * It holds no state of its own (MV3 workers are killed when idle); everything
 * is read from and written to chrome.storage.local.
 */
/* global importScripts */
importScripts('../shared/constants.js', '../shared/i18n.js', '../shared/storage.js', '../shared/search-url.js');

const { Store, Urls, I18n } = self.LAA;
const M = I18n.msg;

/** Text in the user's chosen language (used for OS notifications). */
async function text(value) {
  const settings = await Store.get(K.SETTINGS);
  return I18n.render(I18n.resolve(settings.language, self.navigator && self.navigator.language), value);
}
const { STORAGE: K, MSG, CONTROL_STATE: S, PHASE } = self.LAA.C;

const NOTIFY_QUESTION = 'laa-question';
const NOTIFY_DONE = 'laa-done';

// ---------------- Lifecycle ----------------

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  const control = await Store.get(K.CONTROL);
  if (control.state === S.RUNNING) await Store.patch(K.CONTROL, { state: S.IDLE });
  await refreshBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  // A browser restart kills the automation tab: never resume silently.
  const control = await Store.get(K.CONTROL);
  if (control.state !== S.IDLE) {
    await Store.patch(K.CONTROL, { state: S.IDLE });
    await Store.patchRun({ phase: PHASE.STOPPED, message: M('browserRestarted'), current: null });
  }
  await Store.set(K.PENDING, null);
  await refreshBadge();
});

// ---------------- Commands ----------------

async function getRunTab() {
  const run = await Store.get(K.RUN);
  if (run.tabId == null) return null;
  try {
    return await chrome.tabs.get(run.tabId);
  } catch (_) {
    return null;
  }
}

async function start() {
  const settings = await Store.get(K.SETTINGS);
  if (!String(settings.keyword || '').trim()) {
    return { ok: false, error: M('keywordRequired') };
  }

  const search = {
    keyword: settings.keyword.trim(),
    location: String(settings.location || '').trim(),
    datePosted: settings.datePosted,
    remoteOnly: !!settings.remoteOnly,
  };
  const url = Urls.buildSearchUrl(search, 0);

  let tab = await getRunTab();
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
  } else {
    tab = await chrome.tabs.create({ url: 'about:blank', active: true });
  }

  await Store.set(K.PENDING, null);
  await Store.set(K.PENDING_ANSWER, null);
  await Store.set(K.RUN, {
    phase: PHASE.STARTING,
    tabId: tab.id,
    search,
    page: 0,
    queue: [],
    processed: [],
    current: null,
    stats: { applied: 0, skipped: 0, failed: 0 },
    emptyPages: 0,
    errorStreak: 0,
    startedAt: Date.now(),
    message: M('openingLinkedIn'),
  });
  await Store.set(K.CONTROL, { state: S.RUNNING, at: Date.now() });
  await Store.log(
    'info',
    search.location ? M('runStartingIn', { keyword: search.keyword, location: search.location }) : M('runStarting', { keyword: search.keyword })
  );
  await chrome.tabs.update(tab.id, { url });
  return { ok: true };
}

async function resume() {
  const run = await Store.get(K.RUN);
  const tab = await getRunTab();
  if (!tab || !run.search) return start();

  await Store.patch(K.CONTROL, { state: S.RUNNING, at: Date.now() });
  await Store.patchRun({ phase: PHASE.STARTING, errorStreak: 0, message: M('resuming') });
  await Store.log('info', M('runResumed'));

  // If the tab left LinkedIn (or the content script is gone), reload the flow.
  const onLinkedIn = /^https:\/\/www\.linkedin\.com\//.test(tab.url || '');
  if (!onLinkedIn || run.phase === PHASE.ERROR) {
    const queue = run.queue || [];
    const url = queue.length ? Urls.buildJobUrl(queue[0]) : Urls.buildSearchUrl(run.search, run.page || 0);
    await chrome.tabs.update(tab.id, { url });
  }
  return { ok: true };
}

async function pause() {
  await Store.patch(K.CONTROL, { state: S.PAUSED, at: Date.now() });
  await Store.log('info', M('runPaused'));
  return { ok: true };
}

async function stop() {
  // The content script treats idle as "stop": it unwinds and discards any open form.
  await Store.patch(K.CONTROL, { state: S.IDLE, at: Date.now() });
  await Store.set(K.PENDING, null);
  await Store.patchRun({ phase: PHASE.STOPPED, message: M('runStopped'), current: null, cooldownUntil: null });
  return { ok: true };
}

async function focusTab() {
  const tab = await getRunTab();
  if (!tab) return { ok: false, error: M('noRunTab') };
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  return { ok: true };
}

const handlers = {
  [MSG.START]: start,
  [MSG.RESUME]: resume,
  [MSG.PAUSE]: pause,
  [MSG.STOP]: stop,
  [MSG.FOCUS_TAB]: focusTab,
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;
  // Only accept messages from this extension's own pages / content scripts.
  if (sender.id !== chrome.runtime.id) return false;

  if (message.type === MSG.WHOAMI) {
    sendResponse({ tabId: sender.tab ? sender.tab.id : null });
    return false;
  }
  const handler = handlers[message.type];
  if (!handler) return false;
  handler()
    .then((result) => sendResponse(result))
    .catch((err) => sendResponse({ ok: false, error: err && err.message ? err.message : String(err) }));
  return true;
});

// ---------------- Tab lifecycle ----------------

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const run = await Store.get(K.RUN);
  if (run.tabId !== tabId) return;
  const control = await Store.get(K.CONTROL);
  if (control.state === S.IDLE) return;
  await Store.patch(K.CONTROL, { state: S.IDLE });
  await Store.set(K.PENDING, null);
  await Store.patchRun({ phase: PHASE.STOPPED, message: M('tabClosed'), current: null, tabId: null });
  await Store.log('warn', M('tabClosedLog'));
});

// ---------------- Badge & notifications ----------------

async function refreshBadge() {
  const { [K.PENDING]: pending, [K.CONTROL]: control, [K.RUN]: run } = await Store.getMany([K.PENDING, K.CONTROL, K.RUN]);
  let text = '';
  let color = '#2557D6';
  if (pending) {
    text = '?';
    color = '#E8590C';
  } else if (run.phase === PHASE.ERROR) {
    text = '!';
    color = '#C92A2A';
  } else if (control.state === S.RUNNING) {
    text = String((run.stats && run.stats.applied) || 0);
  } else if (control.state === S.PAUSED) {
    text = 'II';
    color = '#868E96';
  }
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
}

async function notify(id, title, message) {
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: await text(title),
    message: await text(message),
    priority: 2,
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (K.PENDING in changes || K.CONTROL in changes || K.RUN in changes) refreshBadge();

  if (K.PENDING in changes) {
    const pending = changes[K.PENDING].newValue;
    if (pending) {
      const job = pending.job || {};
      const label = [job.title, job.company].filter(Boolean).join(' · ') || 'LinkedIn';
      if (pending.kind === 'confirm') {
        notify(NOTIFY_QUESTION, M('notifyConfirmTitle'), M('notifyConfirmBody', { job: label }));
      } else {
        notify(NOTIFY_QUESTION, M('notifyQuestionTitle'), M('notifyQuestionBody', { count: (pending.questions || []).length, job: label }));
      }
    } else {
      chrome.notifications.clear(NOTIFY_QUESTION);
    }
  }

  if (K.RUN in changes) {
    const prev = changes[K.RUN].oldValue || {};
    const next = changes[K.RUN].newValue || {};
    if (prev.phase !== next.phase && (next.phase === PHASE.FINISHED || next.phase === PHASE.ERROR)) {
      notify(NOTIFY_DONE, next.phase === PHASE.FINISHED ? M('notifyFinishedTitle') : M('notifyAttentionTitle'), next.message || '');
    }
  }
});

chrome.notifications.onClicked.addListener(async (id) => {
  chrome.notifications.clear(id);
  const tab = await getRunTab();
  if (tab) {
    await chrome.windows.update(tab.windowId, { focused: true });
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  }
});
