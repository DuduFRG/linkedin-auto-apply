/**
 * Easy Apply state machine for a single job page.
 *
 *   open modal -> [ resume step | fill known fields | ask unknown | next ]* -> submit -> close
 *
 * Returns { status, reason } where status is applied | skipped | failed.
 * Throws StopSignal / LimitReached / NeedsHuman for run-level conditions.
 */
(function (root) {
  'use strict';

  const LAA = (root.LAA = root.LAA || {});
  const { D, T, SEL, UI_TEXT, BLOCKERS, Store, Control, Fields, Resume, Profile } = LAA;
  const { STORAGE: K, STATUS, LIMITS } = LAA.C;
  const { SkipJob, LimitReached } = Control;

  // ---------------- Page inspection ----------------

  function getModal() {
    const candidates = D.all(SEL.modal);
    return (
      candidates.find((m) => m.matches('.jobs-easy-apply-modal')) ||
      candidates.find((m) => D.first(SEL.modalForm, m) && D.first(['footer button', 'button.artdeco-button--primary'], m)) ||
      null
    );
  }

  function jobInfo() {
    const title = D.text(D.first(SEL.jobTitle));
    const company = D.text(D.first(SEL.company));
    return { title, company };
  }

  function findEasyApplyButton() {
    const buttons = D.all(SEL.easyApplyButton);
    return buttons.find((b) => T.includesAny(`${D.text(b)} ${b.getAttribute('aria-label') || ''}`, UI_TEXT.easyApply)) || null;
  }

  /**
   * The job's top card only. Side rails ("similar jobs") also show "Applied"
   * badges for other jobs, so detection must never scan the whole page.
   */
  function topCard() {
    const known = D.first(SEL.topCard);
    if (known) return known;
    let node = D.first(SEL.jobTitle);
    for (let i = 0; node && i < 4; i += 1) node = node.parentElement;
    return node || document.querySelector('main') || document.body;
  }

  function alreadyApplied() {
    const scope = topCard();
    if (D.first(SEL.appliedIndicator, scope)) return true;
    return D.all('span, div.artdeco-inline-feedback__message', scope).some((el) => {
      const t = D.text(el);
      return t.length > 0 && t.length < 60 && T.includesAny(t, UI_TEXT.applied) && !T.includesAny(t, UI_TEXT.easyApply);
    });
  }

  function closedForApplications() {
    return T.includesAny(D.text(topCard()).slice(0, 4000), UI_TEXT.noLongerAccepting);
  }

  function hitDailyLimit(scope) {
    const nodes = D.all(['[role="alert"]', '.artdeco-inline-feedback', '.artdeco-toast-item', '[role="dialog"]'], scope || document);
    return nodes.some((n) => BLOCKERS.dailyLimit.test(T.stripAccents(D.text(n))));
  }

  function errorsIn(modal) {
    return D.all(SEL.fieldError, modal)
      .map((e) => D.text(e))
      .filter(Boolean);
  }

  function stepSignature(modal) {
    if (!modal) return 'closed';
    const progress = D.first(SEL.progress, modal, { visible: false });
    const header = D.text(D.first(SEL.modalHeader, modal));
    const labels = Fields.extractFields(modal)
      .map((f) => f.label)
      .join('|');
    const value = progress ? progress.getAttribute('value') || progress.getAttribute('aria-valuenow') || '' : '';
    return `${value}#${header}#${labels}`;
  }

  /** Primary footer action: { button, kind: 'next' | 'review' | 'submit' } */
  function primaryAction(modal) {
    const submit = D.first(SEL.submitButton, modal);
    if (submit) return { button: submit, kind: 'submit' };
    const review = D.first(SEL.reviewButton, modal);
    if (review) return { button: review, kind: 'review' };
    const next = D.first(SEL.nextButton, modal);
    if (next) return { button: next, kind: 'next' };

    const primary = D.first(SEL.footerPrimary, modal);
    if (!primary) return null;
    const label = `${D.text(primary)} ${primary.getAttribute('aria-label') || ''}`;
    if (T.includesAny(label, UI_TEXT.submit)) return { button: primary, kind: 'submit' };
    if (T.includesAny(label, UI_TEXT.review)) return { button: primary, kind: 'review' };
    return { button: primary, kind: 'next' };
  }

  function successVisible() {
    if (D.first(SEL.postApplyModal)) return true;
    return D.all('[role="dialog"], [role="alert"], .artdeco-toast-item').some((n) => T.includesAny(D.text(n), UI_TEXT.success));
  }

  // ---------------- Modal actions ----------------

  async function discard() {
    const modal = getModal();
    if (!modal) return;
    const close = D.first(SEL.dismiss, modal);
    if (!close) return;
    D.click(close);
    await D.pause(500, 900);
    const confirm = await D.waitFor(
      () => D.byText(document, 'button', UI_TEXT.discard)[0] || D.first(SEL.discardConfirm),
      { timeout: 4000 }
    );
    if (confirm) D.click(confirm);
    await D.waitFor(() => !getModal(), { timeout: 5000 });
    await D.pause(400, 800);
  }

  async function closeSuccessDialog() {
    await D.pause(800, 1500);
    const dialog = D.first(SEL.postApplyModal) || D.all('[role="dialog"]').find((d) => !d.matches('.jobs-easy-apply-modal'));
    if (!dialog) return;
    const done = D.byText(dialog, 'button', UI_TEXT.done)[0] || D.first(SEL.dismiss, dialog);
    if (done) D.click(done);
    await D.pause(400, 800);
  }

  function setFollowCompany(modal, follow) {
    const box = D.first(SEL.followCompany, modal, { visible: false });
    if (box && box.checked !== follow) {
      const label = box.id ? modal.querySelector(`label[for="${box.id}"]`) : null;
      D.click(label || box);
      if (box.checked !== follow) box.click();
    }
  }

  // ---------------- Answer resolution ----------------

  /** Known value for a field: profile first, then the local answer bank. */
  function resolve(field, ctx) {
    const profileField = Profile.matchProfileField(field.label);
    if (profileField) {
      const value = Profile.profileValue(ctx.profile, profileField);
      if (value) return { value, source: 'profile', profileField };
    }
    const saved = ctx.answers[field.key];
    if (saved && saved.value != null && saved.value !== '') return { value: saved.value, source: 'answers', profileField };
    return { value: null, source: null, profileField };
  }

  async function remember(field, value, profileField, ctx) {
    const writable = Profile.writableField(profileField);
    if (writable && !Profile.profileValue(ctx.profile, writable)) {
      ctx.profile[writable] = value;
      await Store.patch(K.PROFILE, { [writable]: value });
      return;
    }
    const entry = { label: field.label, type: field.type, family: field.family, value };
    if (field.options && field.options.length) entry.options = field.options;
    await Store.saveAnswer(field.key, entry);
    ctx.answers[field.key] = { ...(ctx.answers[field.key] || {}), ...entry };
  }

  /**
   * Fills every field of the current step. Unknown required fields (and fields
   * flagged with a validation error) are batched into a single question card.
   */
  async function fillStep(modal, ctx) {
    const fields = Fields.extractFields(modal);
    const unknown = [];
    const used = [];

    for (const field of fields) {
      await Control.checkpoint();
      const mustAsk = !!field.error;
      if (field.hasValue && !mustAsk) continue;

      const known = resolve(field, ctx);
      if (!field.required && !mustAsk && !ctx.settings.askOptionalFields) {
        if (known.value != null) await Fields.fillField(field, known.value);
        continue;
      }

      if (!mustAsk && known.value != null) {
        const result = await Fields.fillField(field, known.value);
        if (result.ok) {
          if (known.source === 'answers') used.push(field.key);
          continue;
        }
        field.error = result.reason || 'A resposta salva não serviu para este campo.';
      }
      unknown.push({ field, known });
    }

    await Store.touchAnswers(used);
    if (!unknown.length) return;

    // De-duplicate identical questions on the same step.
    const byKey = new Map();
    unknown.forEach((u) => {
      if (!byKey.has(u.field.key)) byKey.set(u.field.key, u);
    });

    const questions = Array.from(byKey.values()).map(({ field, known }) => {
      const similar = T.findSimilar(ctx.answers, field.family, field.label);
      return Fields.toQuestion(field, {
        suggestion: known.value != null ? known.value : similar ? similar.entry.value : '',
        suggestionLabel: similar && known.value == null ? similar.entry.label : '',
        profileField: known.profileField || null,
      });
    });

    await Store.log('info', `Pergunta nova (${questions.length}) em "${ctx.job.title || 'vaga'}". Aguardando sua resposta.`);
    const reply = await Control.ask({ kind: 'questions', job: ctx.job, questions });
    if (!reply || reply.action === 'skip') throw new SkipJob('Vaga pulada pelo usuário.');

    const answers = reply.answers || {};
    const rememberMap = reply.remember || {};
    for (const { field, known } of unknown) {
      const value = answers[field.key];
      if (value == null || value === '' || (Array.isArray(value) && !value.length)) continue;
      const result = await Fields.fillField(field, value);
      if (!result.ok) await Store.log('warn', `Não consegui preencher "${field.label}": ${result.reason || 'valor rejeitado'}.`);
      if (rememberMap[field.key] !== false) await remember(field, value, known.profileField, ctx);
    }
  }

  // ---------------- Main flow ----------------

  async function openModal() {
    const ready = await D.waitFor(() => findEasyApplyButton() || alreadyApplied() || closedForApplications() || D.first(SEL.jobTitle), {
      timeout: 15000,
    });
    if (!ready) throw new SkipJob('A página da vaga não carregou.', STATUS.FAILED);
    // Give the top card a moment to render its apply button.
    await D.waitFor(() => findEasyApplyButton() || alreadyApplied(), { timeout: 6000 });

    if (alreadyApplied()) throw new SkipJob('Você já se candidatou a esta vaga.');
    if (closedForApplications()) throw new SkipJob('A vaga não aceita mais candidaturas.');

    const button = findEasyApplyButton();
    if (!button) throw new SkipJob('Vaga sem candidatura simplificada.');
    if (D.isDisabled(button)) throw new SkipJob('Botão de candidatura desativado.');

    await D.pause(700, 1500);
    D.click(button);

    const modal = await D.waitFor(getModal, { timeout: 12000 });
    if (!modal) {
      if (hitDailyLimit()) throw new LimitReached();
      throw new SkipJob('O formulário de candidatura não abriu.', STATUS.FAILED);
    }
    await D.pause(600, 1200);
    return modal;
  }

  async function submit(action, ctx) {
    if (ctx.settings.confirmBeforeSubmit) {
      const reply = await Control.ask({ kind: 'confirm', job: ctx.job });
      if (!reply || reply.action !== 'submit') throw new SkipJob('Envio cancelado pelo usuário.');
    }
    await Control.checkpoint();
    D.click(action.button);

    const outcome = await D.waitFor(
      () => {
        if (successVisible()) return 'success';
        if (hitDailyLimit()) return 'limit';
        const modal = getModal();
        if (!modal) return 'success';
        if (errorsIn(modal).length) return 'error';
        return null;
      },
      { timeout: 20000, interval: 400 }
    );

    if (outcome === 'limit') throw new LimitReached();
    if (outcome === 'success') {
      await closeSuccessDialog();
      return { status: STATUS.APPLIED, reason: 'Candidatura enviada.' };
    }
    if (outcome === 'error') return { retry: true };
    throw new SkipJob('Não foi possível confirmar o envio da candidatura.', STATUS.FAILED);
  }

  async function applyToJob(ctx) {
    await Control.checkpoint();
    await openModal();

    let validationRetries = 0;
    for (let step = 0; step < LIMITS.MAX_STEPS; step += 1) {
      await Control.checkpoint();

      const modal = getModal();
      if (!modal) {
        if (successVisible()) return { status: STATUS.APPLIED, reason: 'Candidatura enviada.' };
        throw new SkipJob('O formulário foi fechado inesperadamente.', STATUS.FAILED);
      }
      if (hitDailyLimit(modal)) throw new LimitReached();

      let action = primaryAction(modal);
      if (action && action.kind !== 'submit') await Resume.handle(modal, ctx);
      await fillStep(modal, ctx);
      setFollowCompany(modal, !!ctx.settings.followCompanies);

      action = primaryAction(getModal() || modal);
      if (!action) throw new SkipJob('Botão de avanço não encontrado no formulário.', STATUS.FAILED);
      await D.waitFor(() => !D.isDisabled(action.button), { timeout: 3000 });
      await D.pause(500, 1100);

      if (action.kind === 'submit') {
        const result = await submit(action, ctx);
        if (!result.retry) return result;
      } else {
        const before = stepSignature(modal);
        D.click(action.button);
        await D.waitFor(
          () => {
            const m = getModal();
            return !m || stepSignature(m) !== before || errorsIn(m).length > 0;
          },
          { timeout: 8000, interval: 300 }
        );
        await D.pause(500, 1000);
      }

      const current = getModal();
      const errors = current ? errorsIn(current) : [];
      if (errors.length) {
        validationRetries += 1;
        await Store.log('warn', `Validação do LinkedIn: ${errors.slice(0, 3).join(' | ')}`);
        if (validationRetries > LIMITS.MAX_VALIDATION_RETRIES) {
          throw new SkipJob(`Formulário não aceitou as respostas: ${errors[0]}`, STATUS.FAILED);
        }
        // Errors not attached to any answerable field (e.g. a required file upload) cannot be fixed.
        const answerable = Fields.extractFields(current).some((f) => f.error);
        if (!answerable) throw new SkipJob(`Campo que não pode ser preenchido automaticamente: ${errors[0]}`, STATUS.FAILED);
      } else {
        validationRetries = 0;
      }
    }
    throw new SkipJob('Formulário com etapas demais.', STATUS.FAILED);
  }

  /** Runs one job end to end and always leaves the page without an open modal. */
  async function run(ctx) {
    try {
      return await applyToJob(ctx);
    } catch (err) {
      if (getModal()) {
        try {
          await discard();
        } catch (_) {
          /* best effort */
        }
      }
      if (err instanceof SkipJob) return { status: err.status, reason: err.message };
      throw err;
    }
  }

  LAA.EasyApply = Object.freeze({ run, jobInfo, getModal, discard, findEasyApplyButton, alreadyApplied });
})(typeof globalThis !== 'undefined' ? globalThis : this);
