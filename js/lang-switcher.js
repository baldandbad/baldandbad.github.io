(function () {
  function normalizeBase(pathname) {
    // remove leading /en or /en/ if present
    if (pathname === '/en' || pathname === '/en/') return '/';
    if (pathname.indexOf('/en/') === 0) return pathname.slice(3);
    return pathname;
  }

  function init() {
    var sel = document.getElementById('lang-select');
    if (!sel) return;

    var pathname = window.location.pathname || '/';
    // set initial selection
    if (pathname === '/en' || pathname.indexOf('/en/') === 0) {
      sel.value = 'en';
    } else {
      sel.value = 'vi';
    }

    sel.addEventListener('change', function (e) {
      var lang = e.target.value;
      var curr = window.location.pathname || '/';
      var base = normalizeBase(curr); // e.g. '/home-1.html' or '/'

      var target;
      if (lang === 'en') {
        // target = '/en/' for root, otherwise '/en' + base
        target = (base === '/' ? '/en/' : '/en' + base);
      } else {
        // default language: remove /en prefix if present
        target = base;
      }

      // preserve search and hash
      var qs = window.location.search || '';
      var hash = window.location.hash || '';
      // only navigate if path changed
      if (target !== curr) {
        window.location.href = target + qs + hash;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
(function () {
  const DEFAULT_LANG = 'vi'; // default (no /en prefix)
  const ALT_LANG = 'en';     // alternate prefix
  const LANG_PREFIX = '/en'; // prefix for EN URLs

  function normalizeBase(pathname) {
    if (pathname === LANG_PREFIX || pathname === LANG_PREFIX + '/') return '/';
    if (pathname.startsWith(LANG_PREFIX + '/')) return pathname.slice(LANG_PREFIX.length);
    return pathname;
  }

  function setLanguage(lang) {
    const btnFlag = document.getElementById('lang-btn-flag');
    const btn = document.getElementById('lang-btn');

    if (!btnFlag) return;

    if (lang === 'en') {
      btnFlag.src = '/images/flag-en.svg';
      btnFlag.alt = 'English';
      btn.setAttribute('title', 'English');
    } else {
      btnFlag.src = '/images/flag-vi.svg';
      btnFlag.alt = 'Tiếng Việt';
      btn.setAttribute('title', 'Tiếng Việt');
    }
  }

  function init() {
    const btn = document.getElementById('lang-btn');
    const menu = document.querySelector('.lang-menu');
    const items = document.querySelectorAll('.lang-item');

    if (!btn || !menu) return;

    // Detect current language by URL
    const pathname = window.location.pathname || '/';
    const currentLang =
      pathname === LANG_PREFIX || pathname.startsWith(LANG_PREFIX + '/')
        ? ALT_LANG
        : DEFAULT_LANG;

    // Update button flag accordingly
    setLanguage(currentLang);

    // Toggle dropdown open/close
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', !expanded);
      menu.style.display = expanded ? 'none' : 'block';
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && !btn.contains(e.target)) {
        btn.setAttribute('aria-expanded', 'false');
        menu.style.display = 'none';
      }
    });

    // Handle selection
    items.forEach((item) => {
      item.addEventListener('click', () => {
        const lang = item.getAttribute('data-lang');
        if (!lang) return;

        const curr = window.location.pathname || '/';
        const base = normalizeBase(curr);
        let target;

        if (lang === ALT_LANG) {
          target = base === '/' ? LANG_PREFIX + '/' : LANG_PREFIX + base;
        } else {
          target = base;
        }

        const qs = window.location.search || '';
        const hash = window.location.hash || '';

        if (target !== curr) {
          window.location.href = target + qs + hash;
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
