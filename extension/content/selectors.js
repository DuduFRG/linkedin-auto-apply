/**
 * Every LinkedIn-specific selector and UI string lives here.
 *
 * LinkedIn changes its markup frequently. Each entry is an ordered list of
 * fallbacks: data-* attributes first (most stable), then class names, then
 * aria-labels. When the site changes, this is the only file that should need
 * an update.
 */
(function (root) {
  'use strict';

  const LAA = (root.LAA = root.LAA || {});

  LAA.SEL = Object.freeze({
    // ----- Job search page -----
    jobCard: [
      'li[data-occludable-job-id]',
      '[data-job-id]',
      'div.job-card-container',
      'li.jobs-search-results__list-item',
      'li.scaffold-layout__list-item',
    ],
    jobCardFooterState: ['.job-card-container__footer-job-state', '.job-card-container__footer-item', '.job-card-list__footer-wrapper'],
    noResults: ['.jobs-search-no-results-banner', '.jobs-search-two-pane__no-results-banner--expand', '[data-test-no-results]'],

    // ----- Job detail page -----
    topCard: [
      '.job-details-jobs-unified-top-card__container--two-pane',
      '.job-details-jobs-unified-top-card__container',
      '.jobs-unified-top-card',
    ],
    jobTitle: [
      '.job-details-jobs-unified-top-card__job-title h1',
      '.job-details-jobs-unified-top-card__job-title',
      '.jobs-unified-top-card__job-title',
      '.t-24.job-details-jobs-unified-top-card__job-title',
      'main h1',
      'h1',
    ],
    company: [
      '.job-details-jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name',
      '.job-details-jobs-unified-top-card__primary-description-container a',
    ],
    easyApplyButton: [
      '.jobs-apply-button--top-card button',
      'button.jobs-apply-button',
      'button[data-live-test-job-apply-button]',
      'button[data-control-name="jobdetails_topcard_inapply"]',
      'button[aria-label*="Easy Apply" i]',
      'button[aria-label*="Candidatura simplificada" i]',
      'button[aria-label*="Solicitud sencilla" i]',
    ],
    appliedIndicator: [
      '.artdeco-inline-feedback--success',
      '.jobs-s-apply__application-link',
      '.post-apply-timeline__entity',
      '.jobs-details-top-card__apply-error',
    ],

    // ----- Easy Apply modal -----
    modal: ['.jobs-easy-apply-modal', 'div[data-test-modal][role="dialog"]', '[role="dialog"].artdeco-modal', '[role="dialog"]'],
    modalForm: ['.jobs-easy-apply-content', '.jobs-easy-apply-modal__content', 'form'],
    modalHeader: ['.jobs-easy-apply-content h3', '.jobs-easy-apply-modal__content h3', 'form h3', 'h3'],
    progress: ['progress', '[role="progressbar"]'],
    nextButton: [
      'button[data-easy-apply-next-button]',
      'button[data-live-test-easy-apply-next-button]',
      'button[aria-label="Continue to next step"]',
      'button[aria-label="Avançar para próxima etapa"]',
    ],
    reviewButton: [
      'button[data-live-test-easy-apply-review-button]',
      'button[aria-label="Review your application"]',
      'button[aria-label="Revise sua candidatura"]',
    ],
    submitButton: [
      'button[data-live-test-easy-apply-submit-button]',
      'button[aria-label="Submit application"]',
      'button[aria-label="Enviar candidatura"]',
    ],
    footerPrimary: ['footer button.artdeco-button--primary', '.jobs-easy-apply-footer button.artdeco-button--primary', 'button.artdeco-button--primary'],
    dismiss: ['button[data-test-modal-close-btn]', 'button.artdeco-modal__dismiss', 'button[aria-label="Dismiss"]', 'button[aria-label="Fechar"]'],
    discardConfirm: ['button[data-control-name="discard_application_confirm_btn"]', 'button[data-test-dialog-secondary-btn]'],
    formElement: [
      '[data-test-form-element]',
      '.jobs-easy-apply-form-section__grouping',
      '.fb-dash-form-element',
      '.jobs-easy-apply-form-element',
    ],
    fieldError: ['.artdeco-inline-feedback--error', '[data-test-form-element-error-messages]', '.fb-dash-form-element-error'],
    resumeCard: [
      '.jobs-document-upload-redesign-card__container',
      '[data-test-document-upload-card]',
      '.jobs-resume-picker__resume',
      '.ui-attachment--pdf',
    ],
    resumeName: [
      '.jobs-document-upload-redesign-card__file-name',
      '.jobs-resume-picker__resume-file-name',
      '[data-test-document-name]',
      'h3',
    ],
    resumeArea: '[class*="document-upload"], [class*="resume-picker"], [data-test-document-upload-card]',
    followCompany: ['#follow-company-checkbox', 'input[id*="follow-company"]'],
    typeaheadOption: ['[role="listbox"] [role="option"]', '.basic-typeahead__selectable', '.search-typeahead-v2__hit'],
    postApplyModal: ['[data-test-modal-id="post-apply-modal"]', '.artdeco-modal.jobs-post-apply'],
  });

  /** Localised UI strings (EN / PT-BR / ES / FR / DE). Matched normalised, word-bounded. */
  LAA.UI_TEXT = Object.freeze({
    easyApply: ['easy apply', 'candidatura simplificada', 'solicitud sencilla', 'candidature simplifiee', 'einfach bewerben'],
    externalApply: ['apply on company website', 'candidatar se no site da empresa', 'solicitar en el sitio web de la empresa'],
    applied: [
      'applied',
      'candidatou se',
      'candidatura enviada',
      'voce se candidatou',
      'solicitado',
      'solicitud enviada',
      'postulado',
      'candidature envoyee',
      'beworben',
    ],
    noLongerAccepting: ['no longer accepting applications', 'nao esta mais aceitando candidaturas', 'ya no se aceptan solicitudes'],
    submit: ['submit application', 'enviar candidatura', 'enviar solicitud', 'envoyer la candidature', 'bewerbung senden', 'submit'],
    review: ['review', 'revisar', 'revise', 'revisar candidatura', 'verifier', 'uberprufen'],
    next: ['next', 'continue', 'avancar', 'proximo', 'continuar', 'siguiente', 'suivant', 'weiter'],
    discard: ['discard', 'descartar', 'nao salvar', 'supprimer', 'verwerfen'],
    done: ['done', 'concluido', 'concluir', 'listo', 'ok', 'fechar', 'termine', 'fertig'],
    showMoreResumes: ['show more resumes', 'mostrar mais curriculos', 'ver mais curriculos', 'mostrar mas curriculums', 'show more'],
    success: [
      'your application was sent',
      'application was sent',
      'application submitted',
      'sua candidatura foi enviada',
      'candidatura foi enviada',
      'candidatura enviada',
      'tu solicitud se ha enviado',
      'solicitud enviada',
    ],
  });

  /** URL / page patterns that require a human (login wall, captcha, checkpoint). */
  LAA.BLOCKERS = Object.freeze({
    urlPatterns: [/\/checkpoint\//, /\/authwall/, /\/login/, /\/uas\/login/, /\/signup/],
    selectors: ['iframe[src*="captcha"]', '#captcha-internal', 'form[action*="checkpoint"]', '[data-test-id="captcha"]'],
    dailyLimit: /(limit|limite).{0,80}(today|daily|hoje|diari|hoy|aujourd)|(today|daily|hoje|diari|hoy).{0,80}(limit|limite)/i,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
