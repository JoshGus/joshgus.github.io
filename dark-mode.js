(function () {
  const KEY = 'dark';
  if (localStorage.getItem(KEY) === '1') document.documentElement.classList.add(KEY);

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
    });

    // Insert before the clock if it exists, otherwise append
    const clock = status.querySelector('#clock');
    clock ? status.insertBefore(btn, clock) : status.appendChild(btn);
  });
})();
