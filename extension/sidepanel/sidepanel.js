/**
 * Side panel UI: configuration, live progress, question answering,
 * answer bank management, profile and history. Available in PT, EN and ES.
 *
 * All rendering uses textContent / DOM APIs (never innerHTML with data), since
 * labels and options come from third-party pages.
 */
(function () {
  'use strict';

  const { Store, T, I18n } = window.LAA;
  const { STORAGE: K, MSG, CONTROL_STATE: S, PHASE, SPECIAL_KEYS } = window.LAA.C;

  const $ = (sel, scope = document) => scope.querySelector(sel);
  const $$ = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));

  const state = {
    settings: null,
    profile: null,
    answers: {},
    history: [],
    run: {},
    control: {},
    pending: null,
    log: [],
    lang: 'en',
    historyFilter: 'all',
    answersQuery: '',
    editingKey: null,
    pendingId: null,
  };

  // ---------------- i18n ----------------

  const t = (key, params) => I18n.t(state.lang, key, params);
  const tr = (value) => I18n.render(state.lang, value);
  const locale = () => I18n.LOCALES[state.lang] || 'en-US';

  function applyStaticTranslations() {
    document.documentElement.lang = locale();
    $$('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    $$('[data-i18n-ph]').forEach((el) => el.setAttribute('placeholder', t(el.dataset.i18nPh)));
    $$('[data-i18n-title]').forEach((el) => el.setAttribute('title', t(el.dataset.i18nTitle)));
    $$('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
  }

  function setLanguage() {
    const next = I18n.resolve(state.settings.language, navigator.language);
    const changed = next !== state.lang;
    state.lang = next;
    if (!changed && document.documentElement.dataset.translated) return;
    document.documentElement.dataset.translated = '1';
    applyStaticTranslations();
    state.pendingId = null; // force the question card to re-render in the new language
    renderAll();
  }

  // ---------------- DOM helpers ----------------

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'value') el.value = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    children.flat().forEach((c) => {
      if (c == null || c === false) return;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return el;
  }

  const ICONS = {
    edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    question: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
    send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  };

  function icon(name) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', ICONS[name]);
    svg.append(path);
    return svg;
  }

  let toastTimer = null;
  function toast(message, tone = 'info') {
    const el = $('#toast');
    el.textContent = message;
    el.dataset.tone = tone;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function timeAgo(ts) {
    if (!ts) return '';
    const diff = Math.max(0, Date.now() - ts) / 1000;
    if (diff < 60) return t('now');
    if (diff < 3600) return t('minutesAgo', { count: Math.floor(diff / 60) });
    if (diff < 86400) return t('hoursAgo', { count: Math.floor(diff / 3600) });
    return new Date(ts).toLocaleDateString(locale(), { day: '2-digit', month: 'short' });
  }

  function clock(ts) {
    return new Date(ts).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  }

  async function send(type) {
    try {
      const res = await chrome.runtime.sendMessage({ type });
      if (res && res.ok === false) toast(tr(res.error) || t('actionFailed'), 'error');
      return res;
    } catch (err) {
      toast(err.message, 'error');
      return null;
    }
  }

  // ---------------- Status ----------------

  function statusView() {
    const { run, control, pending } = state;
    const phase = run.phase || PHASE.IDLE;
    if (pending) return { key: pending.kind === 'confirm' ? 'statusConfirm' : 'statusWaiting', tone: 'warn', live: true };
    if (control.state === S.PAUSED) return phase === PHASE.ERROR ? { key: 'statusAttention', tone: 'danger' } : { key: 'statusPaused', tone: 'neutral' };
    if (control.state === S.RUNNING) {
      if (phase === PHASE.COOLDOWN) return { key: 'statusCooldown', tone: 'accent', live: true };
      if (phase === PHASE.APPLYING) return { key: 'statusApplying', tone: 'accent', live: true };
      return { key: 'statusSearching', tone: 'accent', live: true };
    }
    if (phase === PHASE.FINISHED) return { key: 'statusFinished', tone: 'success' };
    if (phase === PHASE.ERROR) return { key: 'statusAttention', tone: 'danger' };
    return { key: 'statusIdle', tone: 'neutral' };
  }

  const PLAY = '<path d="M8 5v14l11-7z"></path>';
  const PAUSE = '<rect x="6" y="5" width="4" height="14" rx="1"></rect><rect x="14" y="5" width="4" height="14" rx="1"></rect>';

  function renderStatus() {
    const { run, control, settings } = state;
    const view = statusView();
    const pill = $('#statusPill');
    pill.dataset.tone = view.tone;
    pill.dataset.live = view.live ? 'true' : 'false';
    $('#statusLabel').textContent = t(view.key);

    const idle = !control.state || control.state === S.IDLE || control.state === S.STOPPED;
    $('#statusMessage').textContent = run.message ? tr(run.message) : idle ? t('idleHint') : '';

    const job = run.current;
    $('#currentJob').hidden = !(job && job.jobId) || idle;
    if (job && job.jobId) {
      const title = $('#currentJobTitle');
      title.textContent = job.title || t('jobFallback', { id: job.jobId });
      title.href = job.url || '#';
      $('#currentJobCompany').textContent = job.company || '';
    }

    const stats = run.stats || {};
    $('#statApplied').textContent = stats.applied || 0;
    $('#statSkipped').textContent = stats.skipped || 0;
    $('#statFailed').textContent = stats.failed || 0;

    const max = Math.max(1, Number(settings.maxApplications) || 1);
    const applied = stats.applied || 0;
    $('#progressBar').style.width = `${Math.min(100, (applied / max) * 100)}%`;
    $('#progress').setAttribute('aria-valuemax', String(max));
    $('#progress').setAttribute('aria-valuenow', String(applied));
    $('#progressText').textContent = t('goalProgress', { applied, max });

    const btn = $('#btnPrimary');
    if (control.state === S.RUNNING) {
      btn.dataset.action = MSG.PAUSE;
      $('#btnPrimaryLabel').textContent = t('pause');
      $('#btnPrimaryIcon').innerHTML = PAUSE;
    } else if (control.state === S.PAUSED) {
      btn.dataset.action = MSG.RESUME;
      $('#btnPrimaryLabel').textContent = t('resume');
      $('#btnPrimaryIcon').innerHTML = PLAY;
    } else {
      btn.dataset.action = MSG.START;
      $('#btnPrimaryLabel').textContent = t('start');
      $('#btnPrimaryIcon').innerHTML = PLAY;
    }
    $('#btnStop').disabled = idle;

    $$('[data-search]').forEach((el) => {
      el.disabled = !idle;
    });
    $('#searchLockHint').hidden = idle;
    renderTimer();
  }

  function renderTimer() {
    const { run, control } = state;
    const el = $('#statusTimer');
    if (control.state === S.RUNNING && run.phase === PHASE.COOLDOWN && run.cooldownUntil) {
      el.textContent = t('nextIn', { seconds: Math.max(0, Math.round((run.cooldownUntil - Date.now()) / 1000)) });
    } else if (control.state === S.RUNNING && run.startedAt) {
      const mins = Math.floor((Date.now() - run.startedAt) / 60000);
      el.textContent = mins ? t('minutes', { count: mins }) : '';
    } else {
      el.textContent = '';
    }
  }

  // ---------------- Pending question / confirmation ----------------

  function questionControl(q, index) {
    const name = `q${index}`;
    const initial = q.suggestion !== '' && q.suggestion != null ? q.suggestion : q.current;
    const label = tr(q.label);

    if (q.family === 'checkbox') {
      // Only pre-select when there is a real suggestion: never default a new yes/no question.
      const choice = T.boolish(q.suggestion);
      return h(
        'div',
        { class: 'segmented', role: 'radiogroup', 'aria-label': label },
        h('label', null, h('input', { type: 'radio', name, value: 'yes', checked: choice === true }), t('yes')),
        h('label', null, h('input', { type: 'radio', name, value: 'no', checked: choice === false }), t('no'))
      );
    }

    if (q.family === 'multi') {
      const selected = Array.isArray(initial) ? initial : T.splitList(initial);
      return h(
        'div',
        { class: 'choices' },
        q.options.map((opt) =>
          h(
            'label',
            { class: 'choice' },
            h('input', { type: 'checkbox', name, value: opt, checked: selected.some((s) => T.matchOption([opt], s) === 0) }),
            h('span', { text: opt })
          )
        )
      );
    }

    if (q.family === 'choice' && q.options.length) {
      const idx = T.matchOption(q.options, initial);
      if (q.options.length > 8) {
        return h(
          'select',
          { name, id: name },
          h('option', { value: '', text: t('selectPh') }),
          q.options.map((opt, i) => h('option', { value: opt, text: opt, selected: i === idx }))
        );
      }
      return h(
        'div',
        { class: 'choices', role: 'radiogroup', 'aria-label': label },
        q.options.map((opt, i) =>
          h('label', { class: 'choice' }, h('input', { type: 'radio', name, value: opt, checked: i === idx }), h('span', { text: opt }))
        )
      );
    }

    const value = Array.isArray(initial) ? initial.join(', ') : String(initial || '');
    if (q.type === 'textarea') return h('textarea', { name, id: name, rows: 4, value });
    if (q.type === 'number') return h('input', { type: 'text', name, id: name, inputmode: 'numeric', value, placeholder: t('numbersOnly') });
    return h('input', { type: 'text', name, id: name, value });
  }

  function readAnswer(form, q, index) {
    const name = `q${index}`;
    if (q.family === 'multi') return $$(`input[name="${name}"]:checked`, form).map((i) => i.value);
    const radio = $(`input[name="${name}"]:checked`, form);
    if (radio) return radio.value;
    const el = form.elements[name];
    return el && 'value' in el ? String(el.value).trim() : '';
  }

  function renderQuestions(card, pending) {
    const job = pending.job || {};
    const jobLine = [job.title, job.company].filter(Boolean).join(' · ');
    const questions = pending.questions || [];

    const form = h('form', { novalidate: true });
    questions.forEach((q, i) => {
      const hint =
        q.suggestionLabel && q.suggestion ? h('p', { class: 'question-hint', text: t('suggestionFrom', { label: q.suggestionLabel }) }) : null;
      form.append(
        h(
          'div',
          { class: 'question' },
          h('label', { class: 'question-label', for: `q${i}` }, tr(q.label), q.required ? h('span', { class: 'req', text: '*' }) : null),
          q.error ? h('p', { class: 'question-error', text: tr(q.error) }) : null,
          questionControl(q, i),
          hint
        )
      );
    });

    const onlyResume = questions.length === 1 && questions[0].key === SPECIAL_KEYS.RESUME;
    const remember = h('input', { type: 'checkbox', checked: true });
    const submitBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, icon('send'), t('answerContinue'));
    const skipBtn = h('button', { class: 'btn btn-secondary', type: 'button', text: t('skipJob') });

    form.append(
      h(
        'div',
        { class: 'pending-foot' },
        onlyResume ? null : h('label', { class: 'check' }, remember, t('rememberAnswers')),
        h('div', { class: 'pending-actions' }, submitBtn, skipBtn)
      )
    );

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const answers = {};
      const rememberMap = {};
      for (let i = 0; i < questions.length; i += 1) {
        const q = questions[i];
        const value = readAnswer(form, q, i);
        const empty = value == null || value === '' || (Array.isArray(value) && !value.length);
        if (empty && q.required) {
          toast(t('answerRequired', { label: tr(q.label) }), 'error');
          const target = form.elements[`q${i}`];
          if (target && target.focus) target.focus();
          return;
        }
        answers[q.key] = value;
        rememberMap[q.key] = remember.checked;
      }
      submitBtn.disabled = true;
      await Store.set(K.PENDING_ANSWER, { id: pending.id, action: 'answer', answers, remember: rememberMap });
      toast(remember.checked && !onlyResume ? t('answersSaved') : t('sent'));
    });

    skipBtn.addEventListener('click', async () => {
      skipBtn.disabled = true;
      await Store.set(K.PENDING_ANSWER, { id: pending.id, action: 'skip' });
    });

    card.append(
      h(
        'div',
        { class: 'pending-head' },
        h('span', { class: 'pending-icon' }, icon('question')),
        h('div', null, h('h2', { text: t('questionsTitle', { count: questions.length }) }), h('p', { text: jobLine || t('questionsFallback') }))
      ),
      form
    );

    const firstInput = $('input:not([type="checkbox"]), textarea, select', form);
    if (firstInput) setTimeout(() => firstInput.focus(), 50);
  }

  function renderConfirm(card, pending) {
    const job = pending.job || {};
    const submitBtn = h('button', { class: 'btn btn-primary', type: 'button' }, icon('send'), t('submitApplication'));
    const skipBtn = h('button', { class: 'btn btn-secondary', type: 'button', text: t('skip') });
    submitBtn.addEventListener('click', async () => {
      submitBtn.disabled = true;
      await Store.set(K.PENDING_ANSWER, { id: pending.id, action: 'submit' });
    });
    skipBtn.addEventListener('click', async () => {
      skipBtn.disabled = true;
      await Store.set(K.PENDING_ANSWER, { id: pending.id, action: 'skip' });
    });
    card.append(
      h(
        'div',
        { class: 'pending-head' },
        h('span', { class: 'pending-icon' }, icon('send')),
        h('div', null, h('h2', { text: t('readyToSubmit') }), h('p', { text: [job.title, job.company].filter(Boolean).join(' · ') || t('reviewOnLinkedIn') }))
      ),
      h('p', { class: 'card-sub', text: t('reviewHint') }),
      h('div', { class: 'pending-actions' }, submitBtn, skipBtn)
    );
  }

  function renderPending() {
    const card = $('#pendingCard');
    const pending = state.pending;
    if (!pending) {
      card.hidden = true;
      card.replaceChildren();
      state.pendingId = null;
      return;
    }
    // Keep the user's in-progress input when unrelated state changes.
    if (state.pendingId === pending.id) return;
    state.pendingId = pending.id;
    card.replaceChildren();
    card.classList.toggle('confirm', pending.kind === 'confirm');
    if (pending.kind === 'confirm') renderConfirm(card, pending);
    else renderQuestions(card, pending);
    card.hidden = false;
    card.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  // ---------------- Settings & profile ----------------

  function fillForm(selector, attr, data) {
    $$(selector).forEach((el) => {
      if (document.activeElement === el) return;
      const value = data[el.dataset[attr]];
      if (el.type === 'checkbox') el.checked = !!value;
      else el.value = value == null ? '' : value;
    });
  }

  function readInput(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number') {
      const n = Number(el.value);
      const min = Number(el.min || 0);
      const max = Number(el.max || Infinity);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : min;
    }
    return el.value.trim();
  }

  const saveTimers = new Map();
  function debounceSave(key, fn, ms = 400) {
    clearTimeout(saveTimers.get(key));
    saveTimers.set(key, setTimeout(fn, ms));
  }

  function bindSettings() {
    $$('[data-setting]').forEach((el) => {
      const handler = () =>
        debounceSave(
          `s:${el.dataset.setting}`,
          async () => {
            const patch = { [el.dataset.setting]: readInput(el) };
            const next = { ...state.settings, ...patch };
            if (next.minDelaySec > next.maxDelaySec) {
              if (el.dataset.setting === 'minDelaySec') patch.maxDelaySec = next.minDelaySec;
              else patch.minDelaySec = next.maxDelaySec;
            }
            await Store.patch(K.SETTINGS, patch);
          },
          el.tagName === 'SELECT' ? 0 : 400
        );
      el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', handler);
      if (el.type === 'number') el.addEventListener('blur', () => fillForm('[data-setting]', 'setting', state.settings));
    });

    $$('[data-profile]').forEach((el) => {
      el.addEventListener('input', () =>
        debounceSave(
          `p:${el.dataset.profile}`,
          async () => {
            await Store.patch(K.PROFILE, { [el.dataset.profile]: readInput(el) });
            toast(t('profileSaved'));
          },
          600
        )
      );
    });
  }

  // ---------------- Log ----------------

  function renderLog() {
    const list = $('#logList');
    const entries = (state.log || []).slice(-80).reverse();
    list.replaceChildren(
      ...entries.map((e) =>
        h(
          'li',
          null,
          h('span', { class: 'lvl', 'data-level': e.level }),
          h('span', { text: tr(e.message) }),
          h('time', { datetime: new Date(e.at).toISOString(), text: clock(e.at) })
        )
      )
    );
    $('#logEmpty').hidden = entries.length > 0;
  }

  // ---------------- Answers ----------------

  const FAMILY_KEY = { text: 'familyText', choice: 'familyChoice', multi: 'familyMulti', checkbox: 'familyCheckbox' };

  function displayValue(value) {
    if (Array.isArray(value)) return value.join(', ');
    if (T.boolish(value) === true) return t('yes');
    if (T.boolish(value) === false) return t('no');
    return String(value == null ? '' : value);
  }

  function answerEditor(key, entry) {
    let input;
    if (entry.options && entry.options.length && entry.family === 'choice') {
      input = h('select', null, entry.options.map((o) => h('option', { value: o, text: o, selected: T.matchOption([o], entry.value) === 0 })));
    } else {
      input = h('input', { type: 'text', value: displayValue(entry.value) });
    }
    const save = h('button', { class: 'btn btn-primary', type: 'button', text: t('save') });
    const cancel = h('button', { class: 'btn btn-ghost', type: 'button', text: t('cancel') });
    save.addEventListener('click', async () => {
      let value = input.value.trim();
      if (entry.family === 'multi') value = T.splitList(value);
      if (entry.family === 'checkbox') value = T.boolish(value) === false ? 'no' : 'yes';
      await Store.saveAnswer(key, { value });
      state.editingKey = null;
      toast(t('answerUpdated'));
    });
    cancel.addEventListener('click', () => {
      state.editingKey = null;
      renderAnswers();
    });
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') save.click();
      if (ev.key === 'Escape') cancel.click();
    });
    setTimeout(() => input.focus(), 30);
    return h('div', { class: 'edit-row' }, input, save, cancel);
  }

  function renderAnswers() {
    const entries = Object.entries(state.answers || {});
    $('#answersCount').textContent = entries.length;
    const q = T.normalize(state.answersQuery);
    const filtered = entries
      .filter(([, e]) => !q || T.normalize(`${e.label} ${displayValue(e.value)}`).includes(q))
      .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));

    $('#answersList').replaceChildren(
      ...filtered.map(([key, entry]) => {
        const editBtn = h('button', { class: 'mini-btn', type: 'button', title: t('edit'), 'aria-label': t('edit') }, icon('edit'));
        const delBtn = h('button', { class: 'mini-btn danger', type: 'button', title: t('delete'), 'aria-label': t('delete') }, icon('trash'));
        editBtn.addEventListener('click', () => {
          state.editingKey = key;
          renderAnswers();
        });
        delBtn.addEventListener('click', async () => {
          await Store.update(K.ANSWERS, (all) => {
            delete all[key];
            return all;
          });
          toast(t('answerDeleted'));
        });
        return h(
          'li',
          { class: 'answer' },
          h('div', { class: 'answer-top' }, h('span', { class: 'answer-label', text: entry.label || key }), h('div', { class: 'answer-actions' }, editBtn, delBtn)),
          state.editingKey === key ? answerEditor(key, entry) : h('div', { class: 'answer-value', text: displayValue(entry.value) }),
          h(
            'div',
            { class: 'answer-meta' },
            h('span', { class: 'tag', text: t(FAMILY_KEY[entry.family] || 'familyText') }),
            h('span', { text: entry.uses ? t('usedTimes', { count: entry.uses }) : t('neverUsed') }),
            h('span', { text: `· ${timeAgo(entry.updatedAt)}` })
          )
        );
      })
    );
    $('#answersEmpty').hidden = filtered.length > 0;
    $('#answersEmpty').textContent = entries.length ? t('answersNoMatch') : t('answersEmpty');
  }

  async function exportAnswers() {
    const data = await Store.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `applypilot-backup-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(t('backupExported'));
  }

  async function importAnswers(file) {
    try {
      const payload = JSON.parse(await file.text());
      await Store.importData(payload, { merge: true });
      toast(t('backupImported'));
    } catch (err) {
      toast(t('importInvalid'), 'error');
    }
  }

  // ---------------- History ----------------

  const STATUS_KEY = { applied: 'statusApplied', skipped: 'statusSkipped', failed: 'statusFailed' };

  function renderHistory() {
    const list = (state.history || []).slice().reverse();
    const filtered = state.historyFilter === 'all' ? list : list.filter((item) => item.status === state.historyFilter);
    $('#historyList').replaceChildren(
      ...filtered.slice(0, 200).map((item) => {
        const title = item.title || t('jobFallback', { id: item.jobId });
        return h(
          'li',
          { class: 'hist' },
          item.url
            ? h('a', { class: 'hist-title', href: item.url, target: '_blank', rel: 'noopener noreferrer', text: title })
            : h('span', { class: 'hist-title', text: title }),
          h('span', { class: 'status-chip', 'data-status': item.status, text: STATUS_KEY[item.status] ? t(STATUS_KEY[item.status]) : item.status }),
          h('span', { class: 'hist-sub', text: [item.company, timeAgo(item.at)].filter(Boolean).join(' · ') }),
          item.status !== 'applied' && item.reason ? h('span', { class: 'hist-reason', text: tr(item.reason) }) : null
        );
      })
    );
    $('#historyEmpty').hidden = filtered.length > 0;
  }

  // ---------------- Tabs ----------------

  function selectTab(name) {
    $$('.tab').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.tab === name)));
    $$('.tab-panel').forEach((p) => {
      p.hidden = p.id !== `tab-${name}`;
    });
    try {
      localStorage.setItem('laa.tab', name);
    } catch (_) {
      /* ignore */
    }
  }

  // ---------------- Wiring ----------------

  function bindActions() {
    $('#btnPrimary').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      const action = btn.dataset.action || MSG.START;
      if (action === MSG.START && !$('[data-setting="keyword"]').value.trim()) {
        toast(t('keywordRequired'), 'error');
        selectTab('run');
        $('[data-setting="keyword"]').focus();
        return;
      }
      btn.disabled = true;
      if (action === MSG.START) {
        // Flush debounced edits so the run uses exactly what is on screen.
        const patch = {};
        $$('[data-setting]').forEach((el) => {
          clearTimeout(saveTimers.get(`s:${el.dataset.setting}`));
          patch[el.dataset.setting] = readInput(el);
        });
        await Store.patch(K.SETTINGS, patch);
      }
      await send(action);
      btn.disabled = false;
    });

    $('#btnStop').addEventListener('click', () => send(MSG.STOP));
    $('#btnFocusTab').addEventListener('click', () => send(MSG.FOCUS_TAB));
    $('#btnClearLog').addEventListener('click', () => Store.set(K.LOG, []));

    $$('.tab').forEach((tab) => tab.addEventListener('click', () => selectTab(tab.dataset.tab)));

    $('#answersSearch').addEventListener('input', (ev) => {
      state.answersQuery = ev.target.value;
      renderAnswers();
    });
    $('#btnExport').addEventListener('click', exportAnswers);
    $('#btnImport').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (file) importAnswers(file);
      ev.target.value = '';
    });
    $('#btnClearAnswers').addEventListener('click', async () => {
      // eslint-disable-next-line no-alert
      if (!window.confirm(t('confirmClearAnswers'))) return;
      await Store.set(K.ANSWERS, {});
      toast(t('answersCleared'));
    });

    $$('#historyFilter button').forEach((b) =>
      b.addEventListener('click', () => {
        state.historyFilter = b.dataset.filter;
        $$('#historyFilter button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        renderHistory();
      })
    );
    $('#btnClearHistory').addEventListener('click', async () => {
      // eslint-disable-next-line no-alert
      if (!window.confirm(t('confirmClearHistory'))) return;
      await Store.set(K.HISTORY, []);
      toast(t('historyCleared'));
    });
  }

  const RENDERERS = {
    [K.SETTINGS]: () => {
      fillForm('[data-setting]', 'setting', state.settings);
      setLanguage();
      renderStatus();
    },
    [K.PROFILE]: () => fillForm('[data-profile]', 'profile', state.profile),
    [K.ANSWERS]: renderAnswers,
    [K.HISTORY]: renderHistory,
    [K.RUN]: renderStatus,
    [K.CONTROL]: renderStatus,
    [K.PENDING]: () => {
      renderPending();
      renderStatus();
    },
    [K.LOG]: renderLog,
  };

  function renderAll() {
    renderStatus();
    renderPending();
    renderAnswers();
    renderHistory();
    renderLog();
  }

  const STATE_FIELD = {
    [K.SETTINGS]: 'settings',
    [K.PROFILE]: 'profile',
    [K.ANSWERS]: 'answers',
    [K.HISTORY]: 'history',
    [K.RUN]: 'run',
    [K.CONTROL]: 'control',
    [K.PENDING]: 'pending',
    [K.LOG]: 'log',
  };

  async function init() {
    const keys = Object.keys(STATE_FIELD);
    const data = await Store.getMany(keys);
    keys.forEach((k) => {
      state[STATE_FIELD[k]] = data[k];
    });

    bindSettings();
    bindActions();
    Object.values(RENDERERS).forEach((fn) => fn());

    let tab = 'run';
    try {
      tab = localStorage.getItem('laa.tab') || 'run';
    } catch (_) {
      /* ignore */
    }
    selectTab(tab);

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      Object.keys(changes).forEach((key) => {
        if (!(key in STATE_FIELD)) return;
        const def = Store.DEFAULTS[key];
        const value = changes[key].newValue;
        state[STATE_FIELD[key]] =
          value === undefined ? JSON.parse(JSON.stringify(def)) : def && typeof def === 'object' && !Array.isArray(def) && value ? { ...def, ...value } : value;
        RENDERERS[key]();
      });
    });

    setInterval(renderTimer, 1000);
  }

  init();
})();
