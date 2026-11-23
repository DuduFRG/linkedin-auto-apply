/**
 * Builds LinkedIn job search URLs. `f_AL=true` restricts results to Easy Apply.
 */
(function (root) {
  'use strict';

  const LAA = (root.LAA = root.LAA || {});
  const BASE = 'https://www.linkedin.com';

  const DATE_POSTED = Object.freeze({
    any: null,
    day: 'r86400',
    week: 'r604800',
    month: 'r2592000',
  });

  function buildSearchUrl(settings, page = 0) {
    const params = new URLSearchParams();
    params.set('keywords', String(settings.keyword || '').trim());
    if (settings.location && String(settings.location).trim()) {
      params.set('location', String(settings.location).trim());
    }
    params.set('f_AL', 'true');
    const tpr = DATE_POSTED[settings.datePosted];
    if (tpr) params.set('f_TPR', tpr);
    if (settings.remoteOnly) params.set('f_WT', '2');
    params.set('sortBy', 'DD');
    const pageSize = (LAA.C && LAA.C.LIMITS.PAGE_SIZE) || 25;
    if (page > 0) params.set('start', String(page * pageSize));
    return `${BASE}/jobs/search/?${params.toString()}`;
  }

  function buildJobUrl(jobId) {
    return `${BASE}/jobs/view/${encodeURIComponent(jobId)}/`;
  }

  function jobIdFromUrl(url) {
    const s = String(url || '');
    const view = s.match(/\/jobs\/view\/(\d+)/);
    if (view) return view[1];
    const current = s.match(/[?&]currentJobId=(\d+)/);
    if (current) return current[1];
    const urn = s.match(/jobPosting(?::|%3A)(\d{6,})/i);
    return urn ? urn[1] : null;
  }

  LAA.Urls = Object.freeze({ buildSearchUrl, buildJobUrl, jobIdFromUrl, DATE_POSTED });
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = globalThis.LAA.Urls;
