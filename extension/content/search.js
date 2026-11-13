/**
 * Job search results page: scrolls the result list and collects job ids.
 */
(function (root) {
  'use strict';

  const LAA = (root.LAA = root.LAA || {});
  const { D, T, SEL, UI_TEXT, Urls } = LAA;

  function cardId(card) {
    const direct = card.getAttribute('data-occludable-job-id') || card.getAttribute('data-job-id');
    if (direct && /^\d+$/.test(direct)) return direct;
    const inner = card.querySelector('[data-job-id], [data-occludable-job-id]');
    if (inner) {
      const id = inner.getAttribute('data-job-id') || inner.getAttribute('data-occludable-job-id');
      if (/^\d+$/.test(id || '')) return id;
    }
    const link = card.querySelector('a[href*="/jobs/view/"], a[href*="currentJobId="]');
    return link ? Urls.jobIdFromUrl(link.getAttribute('href')) : null;
  }

  function cardMarkedApplied(card) {
    const footer = D.all(SEL.jobCardFooterState, card, { visible: false });
    const scope = footer.length ? footer.map((f) => D.text(f)).join(' ') : D.text(card).slice(-120);
    return T.includesAny(scope, UI_TEXT.applied);
  }

  function cards() {
    return D.all(SEL.jobCard, document, { visible: false });
  }

  function hasNoResults() {
    return !!D.first(SEL.noResults);
  }

  /** Scrolls the results pane gradually so lazy cards render. */
  async function scrollResults() {
    const list = cards();
    if (!list.length) return;
    const container = D.scrollParent(list[0]);
    const target = container || document.scrollingElement || document.documentElement;
    let lastTop = -1;
    for (let i = 0; i < 30; i += 1) {
      target.scrollTop += 450;
      await D.sleep(D.jitter(250, 500));
      if (target.scrollTop === lastTop) break;
      lastTop = target.scrollTop;
    }
    target.scrollTop = 0;
    await D.pause(300, 600);
  }

  /**
   * Returns { ids: string[], appliedOnPage: number, empty: boolean }.
   * ids are in page order, de-duplicated, excluding cards marked "Applied".
   */
  async function collect() {
    const ready = await D.waitFor(() => cards().length > 0 || hasNoResults(), { timeout: 20000, interval: 400 });
    if (!ready || hasNoResults()) return { ids: [], appliedOnPage: 0, empty: true };

    await D.pause(800, 1500);
    await scrollResults();

    const ids = [];
    const seen = new Set();
    let appliedOnPage = 0;
    cards().forEach((card) => {
      const id = cardId(card);
      if (!id || seen.has(id)) return;
      seen.add(id);
      if (cardMarkedApplied(card)) {
        appliedOnPage += 1;
        return;
      }
      ids.push(id);
    });

    // Fallback for unknown layouts: any job link on the page.
    if (!ids.length && !appliedOnPage) {
      document.querySelectorAll('a[href*="/jobs/view/"]').forEach((a) => {
        const id = Urls.jobIdFromUrl(a.getAttribute('href'));
        if (id && !seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
      });
    }

    return { ids, appliedOnPage, empty: ids.length === 0 && appliedOnPage === 0 };
  }

  LAA.Search = Object.freeze({ collect });
})(typeof globalThis !== 'undefined' ? globalThis : this);
