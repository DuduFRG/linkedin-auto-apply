/**
 * Resume step of the Easy Apply modal: selects one of the resumes already
 * saved on the LinkedIn account. If no resume is configured yet (or the
 * configured one is missing), the user is asked once and the choice is saved.
 */
(function (root) {
  'use strict';

  const LAA = (root.LAA = root.LAA || {});
  const { D, T, SEL, UI_TEXT, Store, Control } = LAA;
  const { STORAGE: K, SPECIAL_KEYS } = LAA.C;
  const M = LAA.I18n.msg;

  function cards(modal) {
    return D.all(SEL.resumeCard, modal);
  }

  function nameOf(card) {
    const node = D.first(SEL.resumeName, card, { visible: false });
    const name = T.cleanLabel(node ? node.innerText || node.textContent : card.getAttribute('aria-label') || '');
    return name || T.cleanLabel(D.text(card)).split(' ').slice(0, 6).join(' ');
  }

  function isSelected(card) {
    if (/selected/.test(card.className)) return true;
    if (card.getAttribute('aria-checked') === 'true' || card.getAttribute('aria-pressed') === 'true') return true;
    const input = card.querySelector('input[type="radio"], input[type="checkbox"]');
    return !!(input && input.checked);
  }

  async function select(card) {
    if (isSelected(card)) return true;
    const target = card.querySelector('label') || card.querySelector('button') || card;
    D.click(target);
    await D.pause(400, 800);
    if (!isSelected(card)) {
      const input = card.querySelector('input[type="radio"]');
      if (input) input.click();
      await D.pause(200, 400);
    }
    return isSelected(card);
  }

  async function expand(modal) {
    const more = D.byText(modal, 'button', UI_TEXT.showMoreResumes)[0];
    if (more) {
      D.click(more);
      await D.pause(500, 900);
    }
  }

  /** Returns true when a resume step was found and handled. */
  async function handle(modal, ctx) {
    if (!cards(modal).length) return false;
    await expand(modal);

    const list = cards(modal);
    const names = list.map(nameOf);
    let target = ctx.settings.resumeName;
    let error = '';

    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (target) {
        const wanted = T.normalize(target);
        const idx = names.findIndex((n) => T.normalize(n) === wanted || T.normalize(n).includes(wanted));
        if (idx >= 0) {
          const ok = await select(list[idx]);
          if (!ok) await Store.log('warn', M('resumeNotConfirmed', { name: names[idx] }));
          return true;
        }
        error = M('resumeNotFound', { name: target });
      }

      const reply = await Control.ask({
        kind: 'questions',
        job: ctx.job,
        questions: [
          {
            key: SPECIAL_KEYS.RESUME,
            label: M('resumeQuestion'),
            type: 'radio',
            family: 'choice',
            options: names,
            required: true,
            error,
            current: '',
          },
        ],
      });
      if (!reply || reply.action === 'skip') throw new Control.SkipJob(M('userSkipped'));
      target = String((reply.answers || {})[SPECIAL_KEYS.RESUME] || '').trim();
      if (target) {
        ctx.settings.resumeName = target;
        await Store.patch(K.SETTINGS, { resumeName: target });
        await Store.log('info', M('resumeSet', { name: target }));
      }
    }
    throw new Control.SkipJob(M('resumeNotSelected'), LAA.C.STATUS.FAILED);
  }

  LAA.Resume = Object.freeze({ handle });
})(typeof globalThis !== 'undefined' ? globalThis : this);
