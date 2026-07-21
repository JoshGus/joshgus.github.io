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
  });
})();
