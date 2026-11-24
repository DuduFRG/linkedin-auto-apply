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
  const M = LAA.I18n.msg;

  // ---------------- Page inspection ----------------

  /** A button that moves the application forward (next, review or submit), in any supported language. */
  const BUTTONS = 'button, [role="button"], input[type="submit"]';

  function isFlowButton(b) {
    const label = `${D.text(b)} ${b.getAttribute('aria-label') || ''}`;
    return T.includesAny(label, UI_TEXT.next) || T.includesAny(label, UI_TEXT.review) || T.includesAny(label, UI_TEXT.submit);
  }

  function getModal() {
    const candidates = D.all(SEL.modal);
    return (
      candidates.find((m) => m.matches('.jobs-easy-apply-modal')) ||
      candidates.find((m) => D.first(SEL.modalForm, m) && D.first(['footer button', 'button.artdeco-button--primary'], m)) ||
      // Newer layouts: any dialog with form controls and a next / review / submit button.
      candidates.find((m) => hasControls(m) && D.all(BUTTONS, m).some(isFlowButton)) ||
      // Dialog content loaded as an iframe document: its body is the form.
      D.roots(document)
        .filter((r) => r !== document && r.nodeType === 9 && r.body)
        .map((doc) => doc.body)
        .find((body) => D.isVisible(body.ownerDocument.defaultView.frameElement || body) && hasControls(body) && D.all(BUTTONS, body).some(isFlowButton)) ||
      containerOfFlowButton() ||
      null
    );
  }

  /**
   * Last resort for unknown markup: start from a visible next / review / submit
   * button and climb to the element that holds it together with the form
   * fields. Only an ancestor that is a dialog, a modal or a fixed overlay
   * qualifies, so page-level controls (like the global search box) are never
   * mistaken for the application form.
   */
  function containerOfFlowButton() {
    const buttons = D.all(BUTTONS, document).filter(isFlowButton);
    for (const button of buttons) {
      let node = button.parentElement || (button.getRootNode() && button.getRootNode().host);
      let withControls = null;
      for (let depth = 0; node && depth < 25; depth += 1) {
        const isDoc = node === node.ownerDocument.body || node === node.ownerDocument.documentElement;
        if (isDoc) break;
        if (!withControls && hasControls(node)) withControls = node;
        const fixed = D.viewOf(node).getComputedStyle(node).position === 'fixed';
        if (withControls && (node.matches('dialog, [role="dialog"], [aria-modal="true"]') || fixed)) return node;
        node = node.parentElement || (node.getRootNode() && node.getRootNode().host) || null;
      }
    }
    return null;
  }

  function hasControls(scope) {
    return !!D.first(['input:not([type="hidden"])', 'select', 'textarea', 'fieldset'], scope, { visible: false });
  }

  /** What the page looked like when the dialog could not be found, so selectors can be fixed. */
  function dialogDiagnostic() {
    const all = D.roots(document);
    return {
      dialogs: D.all('[role="dialog"], dialog, .artdeco-modal', document).length,
      frames: document.querySelectorAll('iframe').length,
      frameDocs: all.filter((r) => r !== document && r.nodeType === 9).length,
      shadows: all.filter((r) => r.nodeType === 11).length,
      center: D.describeCenter(),
    };
  }

  function jobInfo() {
    let title = D.text(D.first(SEL.jobTitle));
    let company = D.text(D.first(SEL.company));
    // Fallback: the tab title reads "Job title | Company | LinkedIn".
    const parts = String(document.title || '')
      .replace(/^\(\d+\)\s*/, '')
      .split(' | ')
      .map((p) => p.trim())
      .filter((p) => p && !/^linkedin$/i.test(p));
    if (!title || title.length > 140) title = parts[0] || '';
    if (!company) company = parts[1] || '';
    return { title, company };
  }

  function findEasyApplyButton() {
    const matches = (b) => T.includesAny(`${D.text(b)} ${b.getAttribute('aria-label') || ''}`, UI_TEXT.easyApply);
    const known = D.all(SEL.easyApplyButton).find(matches);
    if (known) return known;
    // Newer layouts render the action as a plain button or link; never pick one inside the results list.
    const scope = document.querySelector('main') || document.body;
    return D.all('button, a[role="button"], a[href*="/apply"]', scope).find((b) => matches(b) && D.text(b).length < 60 && !b.closest('li')) || null;
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

    // Text fallback for layouts without the data attributes: the last flow button wins (it is the primary one).
    const flow = D.all(BUTTONS, modal).filter(isFlowButton);
    if (flow.length) {
      const button = flow[flow.length - 1];
      const label = `${D.text(button)} ${button.getAttribute('aria-label') || ''}`;
      if (T.includesAny(label, UI_TEXT.submit)) return { button, kind: 'submit' };
      if (T.includesAny(label, UI_TEXT.review)) return { button, kind: 'review' };
      return { button, kind: 'next' };
    }

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
    const close = D.first(SEL.dismiss, modal) || D.first(SEL.dismiss);
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
    const saved = T.findSavedAnswer(ctx.answers, field.key, field.label);
    if (saved) return { value: saved.entry.value, source: 'answers', savedKey: saved.key, profileField };
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
          if (known.source === 'answers') used.push(known.savedKey || field.key);
          continue;
        }
        field.error = result.reason || M('savedAnswerInvalid');
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

    await Store.log('info', M('newQuestions', { count: questions.length, job: ctx.job.title || M('jobFallback', { id: ctx.job.jobId }) }));
    const reply = await Control.ask({ kind: 'questions', job: ctx.job, questions });
    if (!reply || reply.action === 'skip') throw new SkipJob(M('userSkipped'));

    const answers = reply.answers || {};
    const rememberMap = reply.remember || {};
    for (const { field, known } of unknown) {
      const value = answers[field.key];
      if (value == null || value === '' || (Array.isArray(value) && !value.length)) continue;
      const result = await Fields.fillField(field, value);
      if (!result.ok) await Store.log('warn', M('fillFailed', { label: field.label, reason: result.reason || M('valueRejected') }));
      if (rememberMap[field.key] !== false) await remember(field, value, known.profileField, ctx);
    }
  }

  // ---------------- Main flow ----------------

  async function openModal() {
    const ready = await D.waitFor(() => findEasyApplyButton() || alreadyApplied() || closedForApplications() || D.first(SEL.jobTitle), {
      timeout: 10000,
    });
    if (!ready) throw new SkipJob(M('jobNotLoaded'), STATUS.FAILED);
    // Give the top card a moment to render its apply button.
    await D.waitFor(() => findEasyApplyButton() || alreadyApplied(), { timeout: 5000 });

    if (alreadyApplied()) throw new SkipJob(M('alreadyApplied'));
    if (closedForApplications()) throw new SkipJob(M('jobClosed'));

    const button = findEasyApplyButton();
    if (!button) throw new SkipJob(M('noEasyApply'));
    if (D.isDisabled(button)) throw new SkipJob(M('buttonDisabled'));

    await D.pause(400, 900);
    D.click(button);

    const modal = await D.waitFor(getModal, { timeout: 12000 });
    if (!modal) {
      if (hitDailyLimit()) throw new LimitReached();
      await Store.log('warn', M('dialogDiagnostic', dialogDiagnostic()));
      throw new SkipJob(M('formNotOpened'), STATUS.FAILED);
    }
    await D.pause(400, 800);
    return modal;
  }

  async function submit(action, ctx) {
    if (ctx.settings.confirmBeforeSubmit) {
      const reply = await Control.ask({ kind: 'confirm', job: ctx.job });
      if (!reply || reply.action !== 'submit') throw new SkipJob(M('submitCancelled'));
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
      return { status: STATUS.APPLIED, reason: M('applied') };
    }
    if (outcome === 'error') return { retry: true };
    throw new SkipJob(M('submitUnconfirmed'), STATUS.FAILED);
  }

  async function applyToJob(ctx) {
    await Control.checkpoint();
    await openModal();

    let validationRetries = 0;
    for (let step = 0; step < LIMITS.MAX_STEPS; step += 1) {
      await Control.checkpoint();

      const modal = getModal();
      if (!modal) {
        if (successVisible()) return { status: STATUS.APPLIED, reason: M('applied') };
        throw new SkipJob(M('formClosed'), STATUS.FAILED);
      }
      if (hitDailyLimit(modal)) throw new LimitReached();

      let action = primaryAction(modal);
      if (action && action.kind !== 'submit') await Resume.handle(modal, ctx);
      await fillStep(modal, ctx);
      setFollowCompany(modal, !!ctx.settings.followCompanies);

      action = primaryAction(getModal() || modal);
      if (!action) throw new SkipJob(M('noNextButton'), STATUS.FAILED);
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
        await Store.log('warn', M('validationLog', { errors: errors.slice(0, 3).join(' | ') }));
        if (validationRetries > LIMITS.MAX_VALIDATION_RETRIES) {
          throw new SkipJob(M('validationFailed', { error: errors[0] }), STATUS.FAILED);
        }
        // Errors not attached to any answerable field (e.g. a required file upload) cannot be fixed.
        const answerable = Fields.extractFields(current).some((f) => f.error);
        if (!answerable) throw new SkipJob(M('unfillable', { error: errors[0] }), STATUS.FAILED);
      } else {
        validationRetries = 0;
      }
    }
    throw new SkipJob(M('tooManySteps'), STATUS.FAILED);
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
      if (err instanceof SkipJob) return { status: err.status, reason: err.reason };
      throw err;
    }
  }

  LAA.EasyApply = Object.freeze({ run, jobInfo, getModal, discard, findEasyApplyButton, alreadyApplied });
})(typeof globalThis !== 'undefined' ? globalThis : this);
