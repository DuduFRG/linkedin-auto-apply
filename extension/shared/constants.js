/**
 * Shared constants.
 *
 * Every shared/content script is a classic script that attaches itself to the
 * `LAA` namespace on `globalThis`. This keeps the extension build-free: the same
 * files are loaded by the content script (manifest order), the service worker
 * (importScripts), the side panel (<script> tags) and Node unit tests (require).
 */
(function (root) {
  'use strict';

  const LAA = (root.LAA = root.LAA || {});

  LAA.C = Object.freeze({
    APP_NAME: 'ApplyPilot',

    /** chrome.storage.local keys. All user data lives under these keys only. */
    STORAGE: Object.freeze({
      SETTINGS: 'settings',
      PROFILE: 'profile',
      ANSWERS: 'answers',
      HISTORY: 'history',
      RUN: 'run',
      CONTROL: 'control',
      PENDING: 'pending',
      PENDING_ANSWER: 'pendingAnswer',
      LOG: 'log',
      DOCUMENTS: 'documents',
    }),

    /** runtime messages handled by the service worker. */
    MSG: Object.freeze({
      WHOAMI: 'WHOAMI',
      START: 'START',
      PAUSE: 'PAUSE',
      RESUME: 'RESUME',
      STOP: 'STOP',
      FOCUS_TAB: 'FOCUS_TAB',
    }),

    /** Desired state, owned by the UI / service worker. */
    CONTROL_STATE: Object.freeze({
      IDLE: 'idle',
      RUNNING: 'running',
      PAUSED: 'paused',
      STOPPED: 'stopped',
    }),

    /** What the automation is doing right now, owned by the content script. */
    PHASE: Object.freeze({
      IDLE: 'idle',
      STARTING: 'starting',
      SEARCHING: 'searching',
      APPLYING: 'applying',
      WAITING_USER: 'waiting_user',
      COOLDOWN: 'cooldown',
      PAUSED: 'paused',
      FINISHED: 'finished',
      STOPPED: 'stopped',
      ERROR: 'error',
    }),

    STATUS: Object.freeze({
      APPLIED: 'applied',
      SKIPPED: 'skipped',
      FAILED: 'failed',
    }),

    LIMITS: Object.freeze({
      MAX_HISTORY: 2000,
      MAX_LOG: 300,
      MAX_STEPS: 15,
      MAX_VALIDATION_RETRIES: 2,
      MAX_PAGES: 40,
      MAX_EMPTY_PAGES: 3,
      MAX_ERROR_STREAK: 4,
      PAGE_SIZE: 25,
    }),

    /** Special question keys that are not stored in the answer bank. */
    SPECIAL_KEYS: Object.freeze({
      RESUME: '__resume__',
    }),
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = globalThis.LAA;
