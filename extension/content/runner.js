/**
 * Content script entry point. Runs on every LinkedIn page but only acts in the
 * tab that owns the current run (run.tabId) while control.state === 'running'.
 *
 * Each page load performs one "step" based on the URL:
 *   /jobs/search  -> collect job ids into the queue, open the first one
 *   /jobs/view/ID -> apply, record the result, wait, open the next one
 *   anything else -> go to the search page
 *
 * Because all state lives in chrome.storage, a reload or crash simply resumes
 * from the current queue.
 */
(function (root) {
  'use strict';

  const LAA = (root.LAA = root.LAA || {});
  const { D, T, SEL, BLOCKERS, Store, Control, Urls, Search, EasyApply } = LAA;
  const { STORAGE: K, MSG, CONTROL_STATE: S, PHASE, STATUS, LIMITS } = LAA.C;
  const M = LAA.I18n.msg;

  let active = false;

  // ---------------- Helpers ----------------

  function isBlocked() {
    if (BLOCKERS.urlPatterns.some((re) => re.test(location.pathname))) return true;
    return !!D.first(BLOCKERS.selectors);
  }

  async function navigate(url, message) {
    await Store.patchRun({ message: message || M('loading') });
    await D.pause(600, 1200);
    location.assign(url);
  }

  async function finish(message, phase = PHASE.FINISHED) {
    await Store.patchRun({ phase, message, current: null, queue: [], cooldownUntil: null });
    await Store.patch(K.CONTROL, { state: S.IDLE });
    await Store.log(phase === PHASE.ERROR ? 'error' : 'success', message);
  }

  async function pauseForHuman(message) {
    await Store.patchRun({ phase: PHASE.ERROR, message, cooldownUntil: null });
    await Store.patch(K.CONTROL, { state: S.PAUSED });
    await Store.log('warn', message);
  }

  function excludedBy(job, settings) {
    const words = T.splitList(settings.excludeKeywords);
    const haystack = `${job.title} ${job.company}`;
    return words.find((w) => T.includesAny(haystack, [w])) || null;
  }

  async function record(job, result) {
    await Store.appendHistory({
      jobId: job.jobId,
      title: job.title,
      company: job.company,
      url: job.url,
      status: result.status,
      reason: result.reason,
    });
    await Store.update(K.RUN, (run) => {
      const stats = { applied: 0, skipped: 0, failed: 0, ...(run.stats || {}) };
      stats[result.status] = (stats[result.status] || 0) + 1;
      const processed = Array.from(new Set([...(run.processed || []), job.jobId])).slice(-500);
      // Só falhas gerais (vaga ou formulário que não abre) contam para pausar.
      // Um campo que não foi lido falha só esta vaga e a execução segue.
      const errorStreak = result.status === STATUS.FAILED && result.systemic ? (run.errorStreak || 0) + 1 : 0;
      return { ...run, stats, processed, errorStreak };
    });
    const level = { applied: 'success', skipped: 'info', failed: 'warn' }[result.status] || 'info';
    const label = [job.title, job.company].filter(Boolean).join(' · ') || M('jobFallback', { id: job.jobId });
    await Store.log(level, M('jobResult', { job: label, reason: result.reason }));
  }

  // ---------------- Steps ----------------

  async function goToNext(jobId, delayMs) {
    let run = await Store.get(K.RUN);
    const settings = await Store.get(K.SETTINGS);
    const queue = (run.queue || []).filter((id) => id !== jobId);
    await Store.patchRun({ queue });

    if ((run.stats || {}).applied >= settings.maxApplications) {
      return finish(M('goalReached', { count: run.stats.applied }));
    }
    if ((run.errorStreak || 0) >= LIMITS.MAX_ERROR_STREAK) {
      return pauseForHuman(M('tooManyFailures'));
    }

    if (delayMs > 0) {
      await Store.patchRun({ phase: PHASE.COOLDOWN, cooldownUntil: Date.now() + delayMs, message: M('cooldown') });
      await Control.sleep(delayMs);
      await Store.patchRun({ cooldownUntil: null });
    }
    await Control.checkpoint();

    run = await Store.get(K.RUN);
    if (queue.length) return navigate(Urls.buildJobUrl(queue[0]), M('openingNext'));

    const page = (run.page || 0) + 1;
    if (page >= LIMITS.MAX_PAGES) return finish(M('endOfResults'));
    await Store.patchRun({ page, phase: PHASE.SEARCHING });
    return navigate(Urls.buildSearchUrl(run.search, page), M('goingToPage', { page: page + 1 }));
  }

  async function processSearch(run) {
    const page = run.page || 0;
    await Store.patchRun({ phase: PHASE.SEARCHING, message: M('readingResults', { page: page + 1 }) });
    const { ids, empty, diagnostic } = await Search.collect();
    await Control.checkpoint();

    const history = await Store.get(K.HISTORY);
    const done = new Set(history.filter((h) => h.status !== STATUS.FAILED).map((h) => h.jobId));
    const processed = new Set(run.processed || []);
    const queue = ids.filter((id) => !done.has(id) && !processed.has(id));

    if (empty) {
      if (diagnostic) await Store.log('warn', M('searchDiagnostic', diagnostic));
      // The results list sometimes renders late: reload the first page once before giving up.
      if (page === 0 && !run.firstPageRetried) {
        await Store.patchRun({ firstPageRetried: true });
        return navigate(Urls.buildSearchUrl(run.search, 0), M('openingSearch'));
      }
      const emptyPages = (run.emptyPages || 0) + 1;
      if (page === 0) return finish(M('noJobsFound'));
      if (emptyPages >= LIMITS.MAX_EMPTY_PAGES) return finish(M('endOfResults'));
      await Store.patchRun({ emptyPages, page: page + 1 });
      return navigate(Urls.buildSearchUrl(run.search, page + 1));
    }

    await Store.log('info', M('pageSummary', { page: page + 1, total: ids.length, fresh: queue.length }));
    await Store.patchRun({ queue, emptyPages: 0 });

    if (!queue.length) {
      if (page + 1 >= LIMITS.MAX_PAGES) return finish(M('endOfResults'));
      await Store.patchRun({ page: page + 1 });
      return navigate(Urls.buildSearchUrl(run.search, page + 1), M('goingToPage', { page: page + 2 }));
    }
    return navigate(Urls.buildJobUrl(queue[0]), M('openingJob'));
  }

  async function processJob() {
    const jobId = Urls.jobIdFromUrl(location.href);
    const job = { jobId, title: '', company: '', url: Urls.buildJobUrl(jobId) };
    await Store.patchRun({ phase: PHASE.APPLYING, current: job, message: M('openingJob') });

    await D.waitFor(() => D.first(SEL.jobTitle) || EasyApply.findEasyApplyButton(), { timeout: 8000 });
    await D.pause(500, 1000);
    Object.assign(job, EasyApply.jobInfo());
    await Store.patchRun({ current: job, message: M('applyingTo', { title: job.title || jobId }) });

    const data = await Store.getMany([K.SETTINGS, K.PROFILE, K.ANSWERS, K.DOCUMENTS]);
    const ctx = { job, settings: data[K.SETTINGS], profile: data[K.PROFILE], answers: data[K.ANSWERS], documents: data[K.DOCUMENTS] };

    let result;
    const excludedWord = excludedBy(job, ctx.settings);
    if (excludedWord) {
      result = { status: STATUS.SKIPPED, reason: M('excludedBy', { word: excludedWord }) };
    } else {
      result = await EasyApply.run(ctx);
    }
    await record(job, result);
    await Store.patchRun({ current: null });

    const { minDelaySec, maxDelaySec } = ctx.settings;
    const delay =
      result.status === STATUS.APPLIED
        ? D.jitter(Math.max(5, minDelaySec) * 1000, Math.max(minDelaySec, maxDelaySec) * 1000)
        : D.jitter(2500, 5000);
    return goToNext(jobId, delay);
  }

  async function step() {
    try {
      await Control.checkpoint();
      if (isBlocked()) {
        throw new Control.NeedsHuman(M('needsHuman'));
      }
      const run = await Store.get(K.RUN);
      if (!run.search || !run.search.keyword) return finish(M('missingSearch'), PHASE.ERROR);

      if (/^\/jobs\/view\/\d+/.test(location.pathname)) return await processJob();
      if (/^\/jobs\/(search|collections)/.test(location.pathname)) return await processSearch(run);
      return await navigate(Urls.buildSearchUrl(run.search, run.page || 0), M('openingSearch'));
    } catch (err) {
      if (err instanceof Control.StopSignal) {
        await Store.patchRun({ phase: PHASE.STOPPED, message: M('runStopped'), current: null, cooldownUntil: null });
        await Store.log('info', M('runStopped'));
        return undefined;
      }
      if (err instanceof Control.LimitReached) return finish(err.reason);
      if (err instanceof Control.NeedsHuman) return pauseForHuman(err.reason);

      console.error('[ApplyPilot]', err);
      await Store.log('error', M('unexpectedError', { error: err && err.message ? err.message : String(err) }));
      const run = await Store.update(K.RUN, (r) => ({ ...r, errorStreak: (r.errorStreak || 0) + 1 }));
      if (run.errorStreak >= LIMITS.MAX_ERROR_STREAK) {
        return pauseForHuman(M('tooManyErrors'));
      }
      const jobId = Urls.jobIdFromUrl(location.href);
      if (jobId) {
        await record({ jobId, title: '', company: '', url: Urls.buildJobUrl(jobId) }, { status: STATUS.FAILED, reason: M('unexpectedErrorShort') });
        return goToNext(jobId, 3000);
      }
      return navigate(Urls.buildSearchUrl(run.search, run.page || 0));
    }
  }

  // ---------------- Boot ----------------

  async function maybeStart(tabId) {
    if (active) return;
    const { [K.CONTROL]: control, [K.RUN]: run } = await Store.getMany([K.CONTROL, K.RUN]);
    if (control.state !== S.RUNNING || run.tabId !== tabId) return;
    active = true;
    try {
      await step();
    } finally {
      active = false;
    }
  }

  async function boot() {
    if (root.top !== root) return;
    let tabId = null;
    try {
      const reply = await root.chrome.runtime.sendMessage({ type: MSG.WHOAMI });
      tabId = reply && reply.tabId;
    } catch (_) {
      return;
    }
    if (tabId == null) return;
    Store.onChange(K.CONTROL, (control) => {
      if (control.state === S.RUNNING) maybeStart(tabId);
    });
    maybeStart(tabId);
  }

  LAA.Runner = Object.freeze({ boot, step });

  if (!root.__LAA_NO_AUTOBOOT__) boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
