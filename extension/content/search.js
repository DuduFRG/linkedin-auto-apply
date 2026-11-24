/**
 * Job search results page: scrolls the result list and collects job ids.
 *
 * LinkedIn ships several result layouts (classic list, the newer AI search
 * page, "no exact results, here are similar ones"). Collection therefore
 * never trusts a single selector: it reads every job id it can find from
 * card attributes, tracking URNs and job links, and only reports an empty
 * page when none of those exist after the list has fully loaded.
 */
(function (root) {
  'use strict';

  const LAA = (root.LAA = root.LAA || {});
  const { D, T, SEL, UI_TEXT, Urls } = LAA;

  const ID_ATTRS = ['data-occludable-job-id', 'data-job-id', 'data-entity-urn', 'data-urn', 'data-view-tracking-urn', 'componentkey', 'data-job-posting-id'];
  const ID_ATTR_SELECTOR = ID_ATTRS.map((a) => `[${a}]`).join(', ');
  const LINK_SELECTOR = 'a[href*="/jobs/view/"], a[href*="currentJobId="], a[href*="jobPosting"]';

  /** Extracts a numeric job id from an attribute value or URL, or null. */
  function idFrom(value) {
    const s = String(value || '');
    if (/^\d{6,}$/.test(s)) return s;
    const fromUrl = Urls.jobIdFromUrl(s);
    if (fromUrl) return fromUrl;
    const urn = s.match(/jobPosting(?::|%3A|\()(\d{6,})/i);
    return urn ? urn[1] : null;
  }

  function cardId(card) {
    for (const attr of ID_ATTRS) {
      const id = idFrom(card.getAttribute(attr));
      if (id) return id;
    }
    const inner = card.querySelector(ID_ATTR_SELECTOR);
    if (inner) {
      for (const attr of ID_ATTRS) {
        const id = idFrom(inner.getAttribute(attr));
        if (id) return id;
      }
    }
    const link = card.querySelector(LINK_SELECTOR);
    return link ? idFrom(link.getAttribute('href')) : null;
  }

  /** Text nodes joined by spaces, so adjacent inline labels never glue together. */
  function words(el) {
    const parts = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const v = walker.currentNode.nodeValue.trim();
      if (v) parts.push(v);
    }
    return parts.join(' ');
  }

  function cardMarkedApplied(card) {
    const footer = D.all(SEL.jobCardFooterState, card, { visible: false });
    const scope = footer.length ? footer.map(words).join(' ') : words(card).slice(-200);
    return T.includesAny(scope, UI_TEXT.applied);
  }

  function cards() {
    return D.all(SEL.jobCard, document, { visible: false });
  }

  function jobLinks() {
    return Array.from(document.querySelectorAll(LINK_SELECTOR));
  }

  /** Anything on the page that carries a job id (cards, links, tracking URNs). */
  function hasJobs() {
    if (cards().some((c) => cardId(c))) return true;
    return jobLinks().some((a) => idFrom(a.getAttribute('href')));
  }

  /**
   * True only when LinkedIn shows its "no results" state AND there is no job
   * on the page. The "no exact matches, here are similar jobs" banner reuses
   * the same classes while still listing results.
   */
  function hasNoResults() {
    return !!D.first(SEL.noResults) && !hasJobs();
  }

  /** Scrolls the results pane gradually so lazy cards render. */
  async function scrollResults() {
    const anchor = cards()[0] || jobLinks()[0];
    if (!anchor) return;
    const container = D.scrollParent(anchor);
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

  /** The card element that contains a job link, for "Applied" detection. */
  function cardFor(el) {
    return el.closest(SEL.jobCard.join(', ')) || el.closest('li') || el.parentElement;
  }

  /**
   * Returns { ids, appliedOnPage, empty, diagnostic }.
   * ids are in page order, de-duplicated, excluding cards marked "Applied".
   */
  async function collect() {
    await D.waitFor(() => hasJobs() || hasNoResults(), { timeout: 25000, interval: 400 });
    if (hasNoResults()) return { ids: [], appliedOnPage: 0, empty: true, diagnostic: diagnose() };

    await D.pause(800, 1500);
    await scrollResults();

    const ids = [];
    const seen = new Set();
    let appliedOnPage = 0;
    const consider = (id, card) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      if (card && cardMarkedApplied(card)) {
        appliedOnPage += 1;
        return;
      }
      ids.push(id);
    };

    cards().forEach((card) => consider(cardId(card), card));
    jobLinks().forEach((a) => consider(idFrom(a.getAttribute('href')), cardFor(a)));
    document.querySelectorAll(ID_ATTR_SELECTOR).forEach((el) => {
      for (const attr of ID_ATTRS) {
        const id = idFrom(el.getAttribute(attr));
        if (id) {
          consider(id, cardFor(el));
          break;
        }
      }
    });

    // The job open in the detail pane is always a result of this search.
    consider(Urls.jobIdFromUrl(location.href), null);

    // Newer result pages carry no job id in the markup: open each card like a person would.
    if (ids.length + appliedOnPage <= 1) {
      const clicked = await collectByClicking();
      clicked.applied.forEach((id) => {
        if (!seen.has(id)) {
          seen.add(id);
          appliedOnPage += 1;
        }
      });
      clicked.ids.forEach((id) => consider(id, null));
    }

    const empty = ids.length === 0 && appliedOnPage === 0;
    return { ids, appliedOnPage, empty, diagnostic: empty ? diagnose() : null };
  }

  // ---------- Card clicking (layouts without ids in the markup) ----------

  /** Small labels reading "Easy Apply" / "Candidatura simplificada" on result cards (never the apply button). */
  function easyApplyLabels() {
    return D.all('span, p, small, li, div', document).filter((el) => {
      if (el.childElementCount > 2) return false;
      if (el.closest('button')) return false;
      const t = D.text(el);
      return t.length > 0 && t.length < 60 && T.includesAny(t, UI_TEXT.easyApply);
    });
  }

  /** The largest ancestor of a label that contains no other card's label: the card itself. */
  function cardOfLabel(label, labels) {
    let node = label;
    for (let depth = 0; depth < 14; depth += 1) {
      const parent = node.parentElement;
      if (!parent || parent === document.body) break;
      const count = labels.filter((l) => parent.contains(l)).length;
      if (count > 1) break;
      node = parent;
    }
    return node;
  }

  /**
   * Clicks each Easy Apply card in order and reads the job id LinkedIn puts in
   * the address (currentJobId). Returns { ids, applied }.
   */
  async function collectByClicking(limit = 30) {
    const ids = [];
    const applied = [];
    const labels = easyApplyLabels();
    // Leaf labels only: drop wrappers that contain another label.
    const leaves = labels.filter((l) => !labels.some((o) => o !== l && l.contains(o)));
    const cardsFound = [];
    leaves.forEach((l) => {
      const card = cardOfLabel(l, leaves);
      if (!cardsFound.includes(card)) cardsFound.push(card);
    });

    for (const card of cardsFound.slice(0, limit)) {
      if (!card.isConnected) continue;
      const before = Urls.jobIdFromUrl(location.href);
      const target = card.querySelector('a, [role="link"], [role="button"], [tabindex="0"]') || card;
      D.click(target);
      const id = await D.waitFor(
        () => {
          const now = Urls.jobIdFromUrl(location.href);
          return now && now !== before ? now : null;
        },
        { timeout: 3000, interval: 150 }
      );
      const jobId = id || (cardsFound.indexOf(card) === 0 ? before : null);
      if (jobId && !ids.includes(jobId) && !applied.includes(jobId)) {
        if (cardMarkedApplied(card)) applied.push(jobId);
        else ids.push(jobId);
      }
      await D.pause(250, 600);
    }
    return { ids, applied };
  }

  /** Counts that help fix selectors when LinkedIn changes its layout. */
  function diagnose() {
    return {
      path: location.pathname,
      cards: cards().length,
      links: jobLinks().length,
      noResultsBanner: !!D.first(SEL.noResults),
      labels: easyApplyLabels().length,
    };
  }

  LAA.Search = Object.freeze({ collect, idFrom });
})(typeof globalThis !== 'undefined' ? globalThis : this);
