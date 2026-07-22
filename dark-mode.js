(function () {
  const KEY = 'dark';
  if (localStorage.getItem(KEY) === '1') document.documentElement.classList.add(KEY);

  // The favicon lives outside the document, so CSS can't reach it — swap the
  // <link> elements instead so the tab icon tracks the site's own toggle.
  function setFavicon(on) {
    const head = document.head;
    if (!head) return;
    head.querySelectorAll('link[rel="icon"]').forEach(l => l.remove());
    [['32x32', '32'], ['16x16', '16']].forEach(([sizes, n]) => {
      const l = document.createElement('link');
      l.rel = 'icon';
      l.type = 'image/png';
      l.sizes = sizes;
      l.href = '/favicon-' + n + (on ? '-dark' : '') + '.png';
      head.appendChild(l);
    });
  }
  setFavicon(document.documentElement.classList.contains(KEY));

  document.addEventListener('DOMContentLoaded', function () {
    const status = document.querySelector('.status');
    if (!status) return;

    const btn = document.createElement('button');
    btn.id = 'dark-toggle';
    btn.setAttribute('aria-label', 'Toggle dark mode');
    btn.textContent = '◑';
    btn.addEventListener('click', function () {
      const on = document.documentElement.classList.toggle(KEY);
      localStorage.setItem(KEY, on ? '1' : '0');
      setFavicon(on);
    });

    // Insert before the clock if it exists, otherwise append
    const clock = status.querySelector('#clock');
    clock ? status.insertBefore(btn, clock) : status.appendChild(btn);

    addPrivacyLink(status);
    buildMobileNav(status);   // clones nav links, so it must run after
  });

  // Every page loads this file, so injecting the privacy link here is the only
  // way to guarantee it is reachable site-wide without editing each page — and
  // it keeps working for any page added later. Depth is derived from the URL so
  // the link resolves from /games/ as well as the root.
  function addPrivacyLink(status) {
    const nav = status.querySelector('nav');
    if (!nav || nav.querySelector('[data-privacy]')) return;
    const depth = location.pathname.replace(/\/[^/]*$/, '/').split('/').length - 2;
    const a = document.createElement('a');
    a.href = '../'.repeat(Math.max(0, depth)) + 'privacy.html';
    a.textContent = 'Privacy';
    a.setAttribute('data-privacy', '');
    a.style.opacity = '.75';
    nav.appendChild(a);
  }

  // The desktop nav is hidden under 640px, which left phones with no way to
  // navigate at all. Clone its links into a slide-down panel behind a burger.
  function buildMobileNav(status) {
    const nav = status.querySelector('nav');
    if (!nav || status.querySelector('#nav-toggle')) return;

    const toggle = document.createElement('button');
    toggle.id = 'nav-toggle';
    toggle.setAttribute('aria-label', 'Menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<span></span><span></span><span></span>';

    const panel = document.createElement('div');
    panel.id = 'nav-panel';
    panel.hidden = true;
    nav.querySelectorAll('a').forEach(a => {
      const link = a.cloneNode(true);
      link.removeAttribute('style');
      panel.appendChild(link);
    });

    function setOpen(on) {
      toggle.setAttribute('aria-expanded', on ? 'true' : 'false');
      toggle.classList.toggle('open', on);
      panel.classList.toggle('open', on);
      if (on) panel.hidden = false;
      else setTimeout(() => { if (!panel.classList.contains('open')) panel.hidden = true; }, 200);
    }

    toggle.addEventListener('click', e => {
      e.stopPropagation();
      setOpen(!panel.classList.contains('open'));
    });
    panel.addEventListener('click', e => { if (e.target.tagName === 'A') setOpen(false); });
    document.addEventListener('click', e => {
      if (panel.classList.contains('open') && !panel.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });

    status.appendChild(toggle);
    status.appendChild(panel);
  }
})();
