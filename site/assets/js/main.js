/* ApplyPilot landing page. No tracking, no third-party code. */
(function () {
  'use strict';

  var doc = document.documentElement;
  doc.classList.remove('no-js');

  // Sticky header border once the page scrolls.
  var header = document.querySelector('.site-header');
  if (header) {
    // The header sits on the petrol cover, then turns into report paper once the cover is passed.
    var cover = document.querySelector('.cover');
    var onScroll = function () {
      var limit = cover ? cover.offsetTop + cover.offsetHeight - header.offsetHeight : 8;
      header.classList.toggle('is-scrolled', window.scrollY > limit);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // Mobile menu.
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    var setOpen = function (open) {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });
  }

  // Scroll reveal (skipped for reduced motion).
  var items = document.querySelectorAll('.reveal');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!('IntersectionObserver' in window) || reduce) {
    items.forEach(function (el) {
      el.classList.add('is-visible');
    });
  } else {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    items.forEach(function (el) {
      io.observe(el);
    });
  }

  // Current year in the footer.
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  // Thank-you page: start the download once, after the page is visible.
  var auto = document.querySelector('[data-autodownload]');
  if (auto) {
    window.setTimeout(function () {
      try {
        if (sessionStorage.getItem('ap-downloaded') === '1') return;
        sessionStorage.setItem('ap-downloaded', '1');
      } catch (_) {
        /* storage blocked: download anyway */
      }
      window.location.href = auto.getAttribute('href');
    }, 1200);
  }
})();
