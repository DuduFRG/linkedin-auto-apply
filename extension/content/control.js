/**
 * Run control for the content script: pause / stop checkpoints, interruptible
 * sleeps and the "ask the user" round trip through chrome.storage.
 */
(function (root) {
  'use strict';

  const LAA = (root.LAA = root.LAA || {});
  const { Store, D } = LAA;
  const { STORAGE: K, CONTROL_STATE: S, PHASE } = LAA.C;

  /** Thrown when the user stops the run. Unwinds everything. */
  class StopSignal extends Error {
    constructor() {
      super('Execução interrompida pelo usuário.');
      this.name = 'StopSignal';
    }
  }

  /** Thrown to abandon the current job and move on to the next one. */
  class SkipJob extends Error {
    constructor(reason, status = LAA.C.STATUS.SKIPPED) {
      super(reason);
      this.name = 'SkipJob';
      this.status = status;
    }
  }

  /** Thrown when LinkedIn reports the daily Easy Apply limit. */
  class LimitReached extends Error {
    constructor() {
      super('O LinkedIn informou que o limite diário de candidaturas simplificadas foi atingido.');
      this.name = 'LimitReached';
    }
  }

  /** Thrown when a captcha / login / checkpoint needs a human. */
  class NeedsHuman extends Error {
    constructor(reason) {
      super(reason);
      this.name = 'NeedsHuman';
    }
  }

  const isStopped = (state) => state === S.STOPPED || state === S.IDLE;

  /** Call between every meaningful action. Throws on stop, blocks while paused. */
  async function checkpoint() {
    const control = await Store.get(K.CONTROL);
    if (isStopped(control.state)) throw new StopSignal();
    if (control.state === S.PAUSED) {
      const run = await Store.get(K.RUN);
      const previous = run.phase === PHASE.PAUSED ? PHASE.APPLYING : run.phase;
      await Store.patchRun({ phase: PHASE.PAUSED });
      const { value } = await Store.waitForAny([{ key: K.CONTROL, tag: 'control', test: (c) => c.state !== S.PAUSED }]);
      if (isStopped(value.state)) throw new StopSignal();
      await Store.patchRun({ phase: previous });
    }
  }

  /** Sleeps in 1s slices so pause/stop react quickly. */
  async function sleep(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      await checkpoint();
      await D.sleep(Math.min(1000, end - Date.now()));
    }
  }

  /**
   * Publishes a request for the side panel and waits for the user's reply.
   * request: { kind: 'questions' | 'confirm', job, questions? }
   * resolves: { action: 'answer' | 'skip' | 'submit', answers?, remember? }
   */
  async function ask(request) {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const run = await Store.get(K.RUN);
    const previous = run.phase;

    await Store.set(K.PENDING_ANSWER, null);
    await Store.set(K.PENDING, { ...request, id, createdAt: Date.now() });
    await Store.patchRun({ phase: PHASE.WAITING_USER });

    try {
      const result = await Store.waitForAny([
        { key: K.PENDING_ANSWER, tag: 'answer', test: (a) => !!a && a.id === id },
        { key: K.CONTROL, tag: 'control', test: (c) => isStopped(c.state) },
      ]);
      if (result.tag === 'control') throw new StopSignal();
      return result.value;
    } finally {
      await Store.set(K.PENDING, null);
      await Store.set(K.PENDING_ANSWER, null);
      await Store.patchRun({ phase: previous === PHASE.WAITING_USER ? PHASE.APPLYING : previous });
    }
  }

  LAA.Control = Object.freeze({ checkpoint, sleep, ask, StopSignal, SkipJob, LimitReached, NeedsHuman });
})(typeof globalThis !== 'undefined' ? globalThis : this);
