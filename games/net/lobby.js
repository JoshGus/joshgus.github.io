// ─────────────────────────────────────────────────────────────────────────────
// lobby.js — drop-in multiplayer connect/lobby overlay built on p2p.js
//
// One call handles the whole pre-game flow: Host (with optional password) or
// Join-by-code, roster display, share link, and the host's "Start" signal. When
// the game should actually begin it calls onBegin({ role, net, roster }).
//
//   import { openLobby } from './net/lobby.js';
//   openLobby({
//     gameId: 'darts', gameName: 'Darts · 301',
//     maxPlayers: 2, minPlayers: 2,
//     hostHooks:   { validate, onCommand, onJoin, onLeave, snapshot },
//     clientHooks: { onState, onRoster, onEvent, onKicked, onClose },
//     onBegin({ role, net, roster }) { /* wire net into the game & run */ },
//     onCancel() { /* user backed out */ },
//   });
//
// `net` is the HostController or ClientController from p2p.js. The lobby wraps
// clientHooks.onEvent to swallow its own {__lobby:'start'} signal, so games can
// use onEvent freely.
// ─────────────────────────────────────────────────────────────────────────────

import { hostRoom, joinRoom } from './p2p.js';

const CSS = `
.mpl-backdrop{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;
  background:rgba(20,16,12,.55);backdrop-filter:blur(6px);font-family:var(--body,system-ui,sans-serif)}
.mpl-card{width:min(440px,92vw);max-height:90vh;overflow:auto;background:var(--surface,#fbf6ef);
  color:var(--fg,#1d1712);border:1px solid var(--line-strong,#c9b79f);border-radius:14px;
  box-shadow:0 30px 80px -30px rgba(0,0,0,.5);padding:26px 26px 22px}
.mpl-card h2{font-family:var(--disp,var(--body));font-weight:600;font-size:1.5rem;margin:0 0 2px;letter-spacing:-.01em}
.mpl-sub{font-family:var(--mono,ui-monospace,monospace);font-size:.66rem;letter-spacing:.12em;
  text-transform:uppercase;color:var(--dim,#8a7a66);margin:0 0 20px}
.mpl-tabs{display:flex;gap:6px;margin-bottom:20px;background:var(--bg,#f0e7db);padding:4px;border-radius:10px}
.mpl-tab{flex:1;border:0;background:transparent;color:var(--dim,#8a7a66);font:inherit;font-weight:600;
  padding:9px;border-radius:7px;cursor:pointer;transition:.2s}
.mpl-tab.active{background:var(--surface,#fff);color:var(--fg,#1d1712);box-shadow:0 1px 4px rgba(0,0,0,.08)}
.mpl-field{margin-bottom:14px}
.mpl-field label{display:block;font-family:var(--mono,monospace);font-size:.6rem;letter-spacing:.1em;
  text-transform:uppercase;color:var(--dim,#8a7a66);margin-bottom:6px}
.mpl-field input[type=text],.mpl-field input[type=password]{width:100%;box-sizing:border-box;
  padding:11px 13px;border:1px solid var(--line-strong,#c9b79f);border-radius:8px;
  background:var(--bg,#fff);color:var(--fg,#1d1712);font:inherit;font-size:1rem}
.mpl-field input:focus{outline:2px solid var(--accent,#ccf73f);outline-offset:1px}
.mpl-code-in{text-transform:uppercase;letter-spacing:.28em;font-family:var(--mono,monospace)!important;
  font-size:1.3rem!important;text-align:center}
.mpl-toggle{display:flex;align-items:center;gap:9px;cursor:pointer;font-size:.9rem;color:var(--fg,#1d1712);user-select:none}
.mpl-toggle input{width:17px;height:17px;accent-color:var(--accent-ink,#7a8c1f)}
.mpl-btn{width:100%;padding:13px;border:0;border-radius:9px;font:inherit;font-weight:700;font-size:1rem;
  cursor:pointer;background:var(--accent-ink,#3a4a12);color:#fff;transition:.2s;margin-top:6px}
.mpl-btn:hover:not(:disabled){filter:brightness(1.08)}
.mpl-btn:disabled{opacity:.45;cursor:default}
.mpl-btn.ghost{background:transparent;color:var(--dim,#8a7a66);border:1px solid var(--line-strong,#c9b79f);font-weight:600}
.mpl-code-box{text-align:center;padding:18px;background:var(--bg,#f0e7db);border-radius:10px;margin-bottom:16px}
.mpl-code-box .code{font-family:var(--mono,monospace);font-size:2.4rem;font-weight:700;letter-spacing:.32em;
  color:var(--accent-ink,#3a4a12)}
.mpl-code-box .hint{font-size:.78rem;color:var(--dim,#8a7a66);margin-top:6px}
.mpl-roster{list-style:none;margin:0 0 16px;padding:0;border:1px solid var(--line,#e0d3c0);border-radius:10px;overflow:hidden}
.mpl-roster li{display:flex;align-items:center;gap:9px;padding:10px 14px;font-size:.95rem}
.mpl-roster li+li{border-top:1px solid var(--line,#e0d3c0)}
.mpl-dot{width:8px;height:8px;border-radius:50%;background:#4caf50;flex:none}
.mpl-roster .host-tag{margin-left:auto;font-family:var(--mono,monospace);font-size:.58rem;letter-spacing:.1em;
  text-transform:uppercase;color:var(--dim,#8a7a66);border:1px solid var(--line-strong,#c9b79f);padding:2px 8px;border-radius:20px}
.mpl-status{font-size:.85rem;color:var(--dim,#8a7a66);text-align:center;margin:4px 0 12px;min-height:1.2em}
.mpl-err{color:#b8391c;font-weight:600}
.mpl-x{position:absolute;top:14px;right:16px;border:0;background:transparent;font-size:1.4rem;
  color:var(--dim,#8a7a66);cursor:pointer;line-height:1}
`;

let _styleInjected = false;
function injectStyle() {
  if (_styleInjected) return;
  const el = document.createElement('style');
  el.textContent = CSS;
  document.head.appendChild(el);
  _styleInjected = true;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function openLobby(opts) {
  injectStyle();
  const gameId    = opts.gameId;
  const gameName  = opts.gameName || gameId;
  const maxPlayers = opts.maxPlayers ?? 8;
  const minPlayers = opts.minPlayers ?? 2;
  const urlCode   = new URLSearchParams(location.search).get('room') || '';

  let net = null;        // controller once connected
  let role = null;       // 'host' | 'client'
  let destroyed = false;

  const backdrop = document.createElement('div');
  backdrop.className = 'mpl-backdrop';
  const card = document.createElement('div');
  card.className = 'mpl-card';
  card.style.position = 'relative';
  backdrop.appendChild(card);
  document.body.appendChild(backdrop);

  function teardown() {
    destroyed = true;
    backdrop.remove();
  }
  function cancel() {
    if (net) { try { net.close(); } catch {} }
    teardown();
    if (typeof opts.onCancel === 'function') opts.onCancel();
  }
  function begin(roster) {
    teardown();
    if (typeof opts.onBegin === 'function') opts.onBegin({ role, net, roster });
  }

  // Client wraps onEvent so the host's start signal never reaches the game hooks.
  const wrappedClientHooks = Object.assign({}, opts.clientHooks, {
    onEvent(evt) {
      if (evt && evt.__lobby === 'start') { begin(evt.roster || (net && net.roster) || []); return; }
      if (opts.clientHooks && typeof opts.clientHooks.onEvent === 'function') opts.clientHooks.onEvent(evt);
    },
    onRoster(r) {
      renderRoster(r);
      if (opts.clientHooks && typeof opts.clientHooks.onRoster === 'function') opts.clientHooks.onRoster(r);
    },
    onKicked(reason) {
      status(reason === 'bad-password' ? 'Wrong password' : 'Removed by host', true);
      if (opts.clientHooks && typeof opts.clientHooks.onKicked === 'function') opts.clientHooks.onKicked(reason);
    },
  });

  // ── views ──────────────────────────────────────────────────────────────────
  let statusEl = null;
  let rosterEl = null;

  function status(msg, isErr) {
    if (statusEl) { statusEl.textContent = msg || ''; statusEl.className = 'mpl-status' + (isErr ? ' mpl-err' : ''); }
  }
  function renderRoster(list) {
    if (!rosterEl) return;
    rosterEl.innerHTML = (list || []).map((p) =>
      `<li><span class="mpl-dot"></span>${esc(p.name)}${p.isHost ? '<span class="host-tag">Host</span>' : ''}</li>`
    ).join('');
  }

  function chooseView() {
    card.innerHTML = `
      <button class="mpl-x" title="Close">&times;</button>
      <h2>${esc(gameName)}</h2>
      <p class="mpl-sub">Play together · peer-to-peer</p>
      <div class="mpl-tabs">
        <button class="mpl-tab ${urlCode ? '' : 'active'}" data-tab="host">Host</button>
        <button class="mpl-tab ${urlCode ? 'active' : ''}" data-tab="join">Join</button>
      </div>
      <div id="mpl-body"></div>`;
    card.querySelector('.mpl-x').onclick = cancel;
    const tabs = card.querySelectorAll('.mpl-tab');
    tabs.forEach((t) => t.onclick = () => {
      tabs.forEach((x) => x.classList.toggle('active', x === t));
      t.dataset.tab === 'host' ? hostForm() : joinForm();
    });
    urlCode ? joinForm() : hostForm();
  }

  function hostForm() {
    const body = card.querySelector('#mpl-body');
    body.innerHTML = `
      <div class="mpl-field"><label>Your name</label><input type="text" id="mpl-name" maxlength="24" placeholder="Host" value="${esc(localStorage.getItem('mpl-name') || '')}"></div>
      <label class="mpl-toggle" style="margin-bottom:12px"><input type="checkbox" id="mpl-usepw"> Require a password</label>
      <div class="mpl-field" id="mpl-pw-wrap" style="display:none"><label>Password</label><input type="password" id="mpl-pw" maxlength="40"></div>
      <div class="mpl-status"></div>
      <button class="mpl-btn" id="mpl-host-btn">Create game</button>`;
    statusEl = body.querySelector('.mpl-status');
    const usepw = body.querySelector('#mpl-usepw');
    const pwWrap = body.querySelector('#mpl-pw-wrap');
    usepw.onchange = () => pwWrap.style.display = usepw.checked ? '' : 'none';
    body.querySelector('#mpl-host-btn').onclick = async () => {
      const name = body.querySelector('#mpl-name').value.trim() || 'Host';
      const password = usepw.checked ? body.querySelector('#mpl-pw').value : null;
      localStorage.setItem('mpl-name', name);
      status('Creating game…');
      body.querySelector('#mpl-host-btn').disabled = true;
      try {
        net = await hostRoom({
          gameId, hostName: name, password, maxPlayers,
          hooks: opts.hostHooks || {},
        });
        role = 'host';
        net.onError(() => status('Network hiccup — players may need to rejoin', true));
        hostWaitView();
      } catch (e) {
        status(friendly(e), true);
        body.querySelector('#mpl-host-btn').disabled = false;
      }
    };
  }

  function hostWaitView() {
    card.innerHTML = `
      <button class="mpl-x" title="Close">&times;</button>
      <h2>${esc(gameName)}</h2>
      <p class="mpl-sub">Waiting for players</p>
      <div class="mpl-code-box"><div class="code">${esc(net.code)}</div><div class="hint">share this code — or the link below</div></div>
      <button class="mpl-btn ghost" id="mpl-copy">Copy invite link</button>
      <div style="height:16px"></div>
      <ul class="mpl-roster"></ul>
      <div class="mpl-status"></div>
      <button class="mpl-btn" id="mpl-start" disabled>Start game</button>`;
    card.querySelector('.mpl-x').onclick = cancel;
    statusEl = card.querySelector('.mpl-status');
    rosterEl = card.querySelector('.mpl-roster');
    card.querySelector('#mpl-copy').onclick = async () => {
      try { await navigator.clipboard.writeText(net.link); status('Link copied!'); }
      catch { status(net.link); }
    };
    const startBtn = card.querySelector('#mpl-start');
    startBtn.onclick = () => {
      const roster = net.players();
      net.broadcast({ __lobby: 'start', roster });
      begin(roster);
    };

    // Re-render roster + gate the Start button as players come and go. The host
    // hooks the game passed us still fire; we only *wrap* to refresh this view.
    const origJoin = opts.hostHooks && opts.hostHooks.onJoin;
    const origLeave = opts.hostHooks && opts.hostHooks.onLeave;
    const refresh = () => {
      if (destroyed) return;
      const list = net.players();
      renderRoster(list);
      startBtn.disabled = list.length < minPlayers;
      status(list.length < minPlayers ? `Need at least ${minPlayers} players` : 'Ready when you are');
    };
    if (opts.hostHooks) {
      opts.hostHooks.onJoin = (p) => { if (origJoin) origJoin(p); refresh(); };
      opts.hostHooks.onLeave = (p) => { if (origLeave) origLeave(p); refresh(); };
    }
    refresh();
  }

  function joinForm() {
    const body = card.querySelector('#mpl-body');
    body.innerHTML = `
      <div class="mpl-field"><label>Game code</label><input type="text" id="mpl-code" class="mpl-code-in" maxlength="4" placeholder="ABCD" value="${esc(urlCode.toUpperCase())}"></div>
      <div class="mpl-field"><label>Your name</label><input type="text" id="mpl-jname" maxlength="24" placeholder="Player" value="${esc(localStorage.getItem('mpl-name') || '')}"></div>
      <div class="mpl-field"><label>Password (if any)</label><input type="password" id="mpl-jpw" maxlength="40"></div>
      <div class="mpl-status"></div>
      <button class="mpl-btn" id="mpl-join-btn">Join game</button>`;
    statusEl = body.querySelector('.mpl-status');
    body.querySelector('#mpl-join-btn').onclick = async () => {
      const code = body.querySelector('#mpl-code').value.trim().toUpperCase();
      const name = body.querySelector('#mpl-jname').value.trim() || 'Player';
      const password = body.querySelector('#mpl-jpw').value;
      if (code.length !== 4) { status('Enter the 4-letter code', true); return; }
      localStorage.setItem('mpl-name', name);
      status('Connecting…');
      body.querySelector('#mpl-join-btn').disabled = true;
      try {
        net = await joinRoom({ gameId, code, name, password, hooks: wrappedClientHooks });
        role = 'client';
        joinWaitView();
      } catch (e) {
        status(friendly(e), true);
        body.querySelector('#mpl-join-btn').disabled = false;
      }
    };
  }

  function joinWaitView() {
    card.innerHTML = `
      <button class="mpl-x" title="Close">&times;</button>
      <h2>${esc(gameName)}</h2>
      <p class="mpl-sub">Connected · waiting for host</p>
      <ul class="mpl-roster"></ul>
      <div class="mpl-status">Waiting for the host to start…</div>`;
    card.querySelector('.mpl-x').onclick = cancel;
    statusEl = card.querySelector('.mpl-status');
    rosterEl = card.querySelector('.mpl-roster');
    renderRoster(net.roster);
  }

  chooseView();
  return { close: cancel };
}

function friendly(e) {
  const m = (e && e.message) || String(e);
  if (/unavailable-id/.test(m)) return 'Try again — code collision';
  return m;
}
