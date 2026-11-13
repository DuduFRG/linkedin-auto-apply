/**
 * Side panel UI: configuration, live progress, question answering,
 * answer bank management, profile and history.
 *
 * All rendering uses textContent / DOM APIs (never innerHTML with data), since
 * labels and options come from third-party pages.
 */
(function () {
  'use strict';

  const { Store, T } = window.LAA;
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
    historyFilter: 'all',
    answersQuery: '',
    editingKey: null,
    pendingId: null,
  };

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
    if (diff < 60) return 'agora';
    if (diff < 3600) return `${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
    return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }

  function clock(ts) {
    return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  async function send(type) {
    try {
      const res = await chrome.runtime.sendMessage({ type });
      if (res && res.ok === false) toast(res.error || 'Não foi possível executar a ação.', 'error');
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
    if (pending) return { label: pending.kind === 'confirm' ? 'Confirmar envio' : 'Aguardando você', tone: 'warn', live: true };
    if (control.state === S.PAUSED) return phase === PHASE.ERROR ? { label: 'Atenção', tone: 'danger' } : { label: 'Pausado', tone: 'neutral' };
    if (control.state === S.RUNNING) {
      if (phase === PHASE.COOLDOWN) return { label: 'Intervalo', tone: 'accent', live: true };
      if (phase === PHASE.APPLYING) return { label: 'Candidatando', tone: 'accent', live: true };
      return { label: 'Buscando vagas', tone: 'accent', live: true };
    }
    if (phase === PHASE.FINISHED) return { label: 'Concluído', tone: 'success' };
    if (phase === PHASE.ERROR) return { label: 'Atenção', tone: 'danger' };
    return { label: 'Parado', tone: 'neutral' };
  }

  function renderStatus() {
    const { run, control, settings } = state;
    const view = statusView();
    const pill = $('#statusPill');
    pill.dataset.tone = view.tone;
    pill.dataset.live = view.live ? 'true' : 'false';
    $('#statusLabel').textContent = view.label;

    const idle = !control.state || control.state === S.IDLE || control.state === S.STOPPED;
    $('#statusMessage').textContent = run.message || (idle ? 'Configure a busca e clique em Iniciar.' : '');

    const job = run.current;
    $('#currentJob').hidden = !(job && job.jobId) || idle;
    if (job && job.jobId) {
      const title = $('#currentJobTitle');
      title.textContent = job.title || `Vaga ${job.jobId}`;
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
    $('#progressText').textContent = `${applied} de ${max} candidaturas`;

    const btnLabel = $('#btnPrimaryLabel');
    const btnIcon = $('#btnPrimaryIcon');
    const btn = $('#btnPrimary');
    if (control.state === S.RUNNING) {
      btn.dataset.action = MSG.PAUSE;
      btnLabel.textContent = 'Pausar';
      btnIcon.innerHTML = '<rect x="6" y="5" width="4" height="14" rx="1"></rect><rect x="14" y="5" width="4" height="14" rx="1"></rect>';
    } else if (control.state === S.PAUSED) {
      btn.dataset.action = MSG.RESUME;
      btnLabel.textContent = 'Retomar';
      btnIcon.innerHTML = '<path d="M8 5v14l11-7z"></path>';
    } else {
      btn.dataset.action = MSG.START;
      btnLabel.textContent = 'Iniciar';
      btnIcon.innerHTML = '<path d="M8 5v14l11-7z"></path>';
    }
    $('#btnStop').disabled = idle;

    const running = !idle;
    $$('[data-search]').forEach((el) => {
      el.disabled = running;
    });
    $('#searchLockHint').hidden = !running;
    renderTimer();
  }

  function renderTimer() {
    const { run, control } = state;
    const el = $('#statusTimer');
    if (control.state === S.RUNNING && run.phase === PHASE.COOLDOWN && run.cooldownUntil) {
      const left = Math.max(0, Math.round((run.cooldownUntil - Date.now()) / 1000));
      el.textContent = `próxima em ${left}s`;
    } else if (control.state === S.RUNNING && run.startedAt) {
      const mins = Math.floor((Date.now() - run.startedAt) / 60000);
      el.textContent = mins ? `${mins} min` : '';
    } else {
      el.textContent = '';
    }
  }

  // ---------------- Pending question / confirmation ----------------

  function questionControl(q, index) {
    const name = `q${index}`;
    const initial = q.suggestion !== '' && q.suggestion != null ? q.suggestion : q.current;

    if (q.family === 'checkbox') {
      // Only pre-select when there is a real suggestion: never default a new yes/no question.
      const choice = T.boolish(q.suggestion);
      return h(
        'div',
        { class: 'segmented', role: 'radiogroup', 'aria-label': q.label },
        h('label', null, h('input', { type: 'radio', name, value: 'yes', checked: choice === true }), 'Sim'),
        h('label', null, h('input', { type: 'radio', name, value: 'no', checked: choice === false }), 'Não')
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
          { name },
          h('option', { value: '', text: 'Selecione…' }),
          q.options.map((opt, i) => h('option', { value: opt, text: opt, selected: i === idx }))
        );
      }
      return h(
        'div',
        { class: 'choices', role: 'radiogroup', 'aria-label': q.label },
        q.options.map((opt, i) =>
          h('label', { class: 'choice' }, h('input', { type: 'radio', name, value: opt, checked: i === idx }), h('span', { text: opt }))
        )
      );
    }

    const value = Array.isArray(initial) ? initial.join(', ') : String(initial || '');
    if (q.type === 'textarea') return h('textarea', { name, rows: 4, value });
    if (q.type === 'number') return h('input', { type: 'text', name, inputmode: 'numeric', value, placeholder: 'Somente números' });
    return h('input', { type: 'text', name, value });
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
        q.suggestionLabel && q.suggestion
          ? h('p', { class: 'question-hint', text: `Sugestão baseada em: "${q.suggestionLabel}"` })
          : null;
      form.append(
        h(
          'div',
          { class: 'question' },
          h('label', { class: 'question-label', for: `q${i}` }, q.label, q.required ? h('span', { class: 'req', text: '*' }) : null),
          q.error ? h('p', { class: 'question-error', text: q.error }) : null,
          questionControl(q, i),
          hint
        )
      );
    });

    const onlyResume = questions.length === 1 && questions[0].key === SPECIAL_KEYS.RESUME;
    const remember = h('input', { type: 'checkbox', checked: true });
    const submitBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, icon('send'), 'Responder e continuar');
    const skipBtn = h('button', { class: 'btn btn-secondary', type: 'button', text: 'Pular vaga' });

    form.append(
      h(
        'div',
        { class: 'pending-foot' },
        onlyResume ? null : h('label', { class: 'check' }, remember, 'Lembrar estas respostas nas próximas candidaturas'),
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
          toast(`Responda: ${q.label}`, 'error');
          const target = form.elements[`q${i}`];
          if (target && target.focus) target.focus();
          return;
        }
        answers[q.key] = value;
        rememberMap[q.key] = remember.checked;
      }
      submitBtn.disabled = true;
      await Store.set(K.PENDING_ANSWER, { id: pending.id, action: 'answer', answers, remember: rememberMap });
      toast(remember.checked && !onlyResume ? 'Respostas salvas' : 'Enviado');
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
        h(
          'div',
          null,
          h('h2', { text: questions.length > 1 ? `${questions.length} perguntas novas` : 'Pergunta nova' }),
          h('p', { text: jobLine || 'Responda para continuar a candidatura.' })
        )
      ),
      form
    );

    const firstInput = $('input:not([type="checkbox"]), textarea, select', form);
    if (firstInput) setTimeout(() => firstInput.focus(), 50);
  }

  function renderConfirm(card, pending) {
    const job = pending.job || {};
    const submitBtn = h('button', { class: 'btn btn-primary', type: 'button' }, icon('send'), 'Enviar candidatura');
    const skipBtn = h('button', { class: 'btn btn-secondary', type: 'button', text: 'Pular' });
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
        h(
          'div',
          null,
          h('h2', { text: 'Pronto para enviar' }),
          h('p', { text: [job.title, job.company].filter(Boolean).join(' · ') || 'Revise a candidatura na aba do LinkedIn.' })
        )
      ),
      h('p', { class: 'card-sub', text: 'Confira o resumo na aba do LinkedIn antes de confirmar.' }),
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
        debounceSave(`s:${el.dataset.setting}`, async () => {
          const patch = { [el.dataset.setting]: readInput(el) };
          const next = { ...state.settings, ...patch };
          if (next.minDelaySec > next.maxDelaySec) {
            if (el.dataset.setting === 'minDelaySec') patch.maxDelaySec = next.minDelaySec;
            else patch.minDelaySec = next.maxDelaySec;
          }
          await Store.patch(K.SETTINGS, patch);
        });
      el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', handler);
      if (el.type === 'number') el.addEventListener('blur', () => fillForm('[data-setting]', 'setting', state.settings));
    });

    $$('[data-profile]').forEach((el) => {
      el.addEventListener('input', () =>
        debounceSave(`p:${el.dataset.profile}`, async () => {
          await Store.patch(K.PROFILE, { [el.dataset.profile]: readInput(el) });
          toast('Perfil salvo');
        }, 600)
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
          h('span', { text: e.message }),
          h('time', { datetime: new Date(e.at).toISOString(), text: clock(e.at) })
        )
      )
    );
    $('#logEmpty').hidden = entries.length > 0;
  }

  // ---------------- Answers ----------------

  const FAMILY_LABEL = { text: 'Texto', choice: 'Escolha', multi: 'Múltipla', checkbox: 'Sim/Não' };

  function displayValue(value) {
    if (Array.isArray(value)) return value.join(', ');
    if (T.boolish(value) === true) return 'Sim';
    if (T.boolish(value) === false) return 'Não';
    return String(value == null ? '' : value);
  }

  function answerEditor(key, entry) {
    let input;
    if (entry.options && entry.options.length && entry.family === 'choice') {
      input = h('select', null, entry.options.map((o) => h('option', { value: o, text: o, selected: T.matchOption([o], entry.value) === 0 })));
    } else {
      input = h('input', { type: 'text', value: displayValue(entry.value) });
    }
    const save = h('button', { class: 'btn btn-primary', type: 'button', text: 'Salvar' });
    const cancel = h('button', { class: 'btn btn-ghost', type: 'button', text: 'Cancelar' });
    save.addEventListener('click', async () => {
      let value = input.value.trim();
      if (entry.family === 'multi') value = T.splitList(value);
      if (entry.family === 'checkbox') value = T.boolish(value) === false ? 'no' : 'yes';
      await Store.saveAnswer(key, { value });
      state.editingKey = null;
      toast('Resposta atualizada');
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
        const editBtn = h('button', { class: 'mini-btn', type: 'button', title: 'Editar', 'aria-label': 'Editar' }, icon('edit'));
        const delBtn = h('button', { class: 'mini-btn danger', type: 'button', title: 'Apagar', 'aria-label': 'Apagar' }, icon('trash'));
        editBtn.addEventListener('click', () => {
          state.editingKey = key;
          renderAnswers();
        });
        delBtn.addEventListener('click', async () => {
          await Store.update(K.ANSWERS, (all) => {
            delete all[key];
            return all;
          });
          toast('Resposta apagada');
        });
        return h(
          'li',
          { class: 'answer' },
          h('div', { class: 'answer-top' }, h('span', { class: 'answer-label', text: entry.label || key }), h('div', { class: 'answer-actions' }, editBtn, delBtn)),
          state.editingKey === key ? answerEditor(key, entry) : h('div', { class: 'answer-value', text: displayValue(entry.value) }),
          h(
            'div',
            { class: 'answer-meta' },
            h('span', { class: 'tag', text: FAMILY_LABEL[entry.family] || 'Texto' }),
            h('span', { text: entry.uses ? `usada ${entry.uses}×` : 'ainda não reutilizada' }),
            h('span', { text: `· ${timeAgo(entry.updatedAt)}` })
          )
        );
      })
    );
    $('#answersEmpty').hidden = filtered.length > 0;
    $('#answersEmpty').textContent = entries.length
      ? 'Nenhuma resposta corresponde à busca.'
      : 'Nenhuma resposta salva ainda. Elas aparecem aqui conforme você responde perguntas novas.';
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
    toast('Backup exportado');
  }

  async function importAnswers(file) {
    try {
      const payload = JSON.parse(await file.text());
      await Store.importData(payload, { merge: true });
      toast('Backup importado');
    } catch (err) {
      toast(err.message || 'Arquivo inválido', 'error');
    }
  }

  // ---------------- History ----------------

  const STATUS_LABEL = { applied: 'Enviada', skipped: 'Pulada', failed: 'Falha' };

  function renderHistory() {
    const list = (state.history || []).slice().reverse();
    const filtered = state.historyFilter === 'all' ? list : list.filter((h2) => h2.status === state.historyFilter);
    $('#historyList').replaceChildren(
      ...filtered.slice(0, 200).map((item) =>
        h(
          'li',
          { class: 'hist' },
          item.url
            ? h('a', { class: 'hist-title', href: item.url, target: '_blank', rel: 'noopener noreferrer', text: item.title || `Vaga ${item.jobId}` })
            : h('span', { class: 'hist-title', text: item.title || `Vaga ${item.jobId}` }),
          h('span', { class: 'status-chip', 'data-status': item.status, text: STATUS_LABEL[item.status] || item.status }),
          h('span', { class: 'hist-sub', text: [item.company, timeAgo(item.at)].filter(Boolean).join(' · ') }),
          item.status !== 'applied' && item.reason ? h('span', { class: 'hist-reason', text: item.reason }) : null
        )
      )
    );
    $('#historyEmpty').hidden = filtered.length > 0;
  }

  // ---------------- Tabs ----------------

  function selectTab(name) {
    $$('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
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
      if (action === MSG.START && !String(state.settings.keyword || '').trim()) {
        toast('Informe o cargo ou palavra-chave.', 'error');
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

    $$('.tab').forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab)));

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
      if (!window.confirm('Apagar todas as respostas salvas? Esta ação não pode ser desfeita.')) return;
      await Store.set(K.ANSWERS, {});
      toast('Respostas apagadas');
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
      if (!window.confirm('Limpar o histórico? Vagas já enviadas poderão ser tentadas de novo (o LinkedIn ainda as marcará como candidatadas).')) return;
      await Store.set(K.HISTORY, []);
      toast('Histórico limpo');
    });
  }

  const RENDERERS = {
    [K.SETTINGS]: () => {
      fillForm('[data-setting]', 'setting', state.settings);
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
