// ─────────────────────────────────────────────────────────────────────────────
// leaderboard.js — the daily board for Daily Break and Daily Links.
//
// These scores are UNVERIFIED and the UI says so. Both games run entirely in the
// browser; no server ever witnesses a shot, so anything posted here is taken on
// trust. The Worker checks that you hold the username you post under, that the
// value is in a range the game can produce, and that the day is still open —
// which stops casual nonsense, not somebody with devtools open. Presenting it as
// anything firmer would be a lie to whoever reads it.
//
// Posting needs a claimed username (see identity.js). Playing never does.
// ─────────────────────────────────────────────────────────────────────────────

import { getUsername, deviceToken, claimUsername } from './identity.js';

function relayHttp() {
  const override = new URLSearchParams(location.search).get('relay');
  const base = override || 'wss://relay.joshg.us';
  return String(base).replace(/\/+$/, '').replace(/^ws/, 'http');
}

/** Today's date in the same YYYY-MM-DD form the games seed from. */
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Top scores for a game+day. Never throws — an outage just means no board. */
export async function fetchBoard(game, day = today()) {
  try {
    const res = await fetch(`${relayHttp()}/scores?game=${encodeURIComponent(game)}&day=${encodeURIComponent(day)}`,
      { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.scores) ? data.scores : [];
  } catch { return []; }
}

/**
 * Post a score. → { ok } | { ok:false, error, needsName? }
 * `needsName` tells the caller to prompt for a username rather than showing a
 * failure, since not having one is the expected first-run state.
 */
export async function submitScore(game, score, detail, day = today()) {
  const name = getUsername();
  const token = deviceToken();
  if (!name || !token) return { ok: false, needsName: true, error: 'Set a username to join the leaderboard' };
  try {
    const res = await fetch(`${relayHttp()}/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game, day, score, detail, name, token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return { ok: false, error: data.error || 'Could not post your score' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not reach the leaderboard' };
  }
}

const esc = (x) => String(x).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Renders the board into `el`, highlighting the local player.
 * `opts.emptyText` is shown when nobody has posted yet.
 */
export async function renderBoard(el, game, opts = {}) {
  if (!el) return;
  const day = opts.day || today();
  el.innerHTML = '<div class="lb-note">Loading…</div>';
  const rows = await fetchBoard(game, day);
  const me = getUsername();
  if (!rows.length) {
    el.innerHTML = `<div class="lb-note">${esc(opts.emptyText || 'No scores yet today — be first.')}</div>`;
    return;
  }
  el.innerHTML = `
    <ol class="lb-list">
      ${rows.slice(0, opts.limit || 10).map((r, i) => `
        <li class="lb-row${r.name === me ? ' me' : ''}">
          <span class="lb-rank">${i + 1}</span>
          <span class="lb-name">${esc(r.name)}</span>
          <span class="lb-score">${esc(r.detail || r.score)}</span>
        </li>`).join('')}
    </ol>
    <div class="lb-note">Scores are self-reported and unverified.</div>`;
}

/** Prompts for a username inline, then retries the submission. */
export async function promptForName(container, onDone) {
  container.innerHTML = `
    <div class="lb-claim">
      <label>Pick a username to join the leaderboard</label>
      <div class="lb-claim-row">
        <input type="text" class="lb-claim-in" maxlength="24" placeholder="e.g. josh">
        <button type="button" class="lb-claim-go">Save</button>
      </div>
      <div class="lb-claim-msg"></div>
    </div>`;
  const input = container.querySelector('.lb-claim-in');
  const btn = container.querySelector('.lb-claim-go');
  const msg = container.querySelector('.lb-claim-msg');
  const go = async () => {
    const want = input.value.trim();
    if (!want) { msg.textContent = 'Enter a username'; return; }
    btn.disabled = true; msg.textContent = 'Checking…';
    const r = await claimUsername(want);
    btn.disabled = false;
    if (!r.ok) { msg.textContent = r.error; return; }
    if (onDone) onDone(r.name);
  };
  btn.onclick = go;
  input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
  input.focus();
}

/**
 * Opens the board as an overlay, any time — you do not have to finish a round
 * to look. Arrows step back through previous days; today is the right-hand
 * limit since a future board cannot exist.
 */
export function openLeaderboard(game, opts = {}) {
  injectStyles();
  const title = opts.title || 'Daily leaderboard';
  let day = opts.day || today();

  const wrap = document.createElement('div');
  wrap.className = 'lb-overlay';
  wrap.innerHTML = `
    <div class="lb-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <button class="lb-x" aria-label="Close">&times;</button>
      <div class="lb-head">${esc(title)}</div>
      <div class="lb-daybar">
        <button class="lb-day-btn" data-step="-1" aria-label="Previous day">&#8249;</button>
        <span class="lb-day"></span>
        <button class="lb-day-btn" data-step="1" aria-label="Next day">&#8250;</button>
      </div>
      <div class="lb-body"></div>
    </div>`;
  document.body.appendChild(wrap);

  const body = wrap.querySelector('.lb-body');
  const label = wrap.querySelector('.lb-day');
  const next = wrap.querySelector('[data-step="1"]');

  const shift = (iso, days) => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d + days);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  };
  const pretty = (iso) => {
    if (iso === today()) return 'Today';
    if (iso === shift(today(), -1)) return 'Yesterday';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  async function draw() {
    label.textContent = pretty(day);
    next.disabled = day === today();     // no future boards
    await renderBoard(body, game, { day, limit: opts.limit || 20,
      emptyText: day === today() ? 'No scores yet today — be first.' : 'Nobody posted a score that day.' });
  }
  wrap.querySelectorAll('.lb-day-btn').forEach(b => {
    b.onclick = () => { day = shift(day, Number(b.dataset.step)); draw(); };
  });

  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  wrap.querySelector('.lb-x').onclick = close;
  wrap.onclick = (e) => { if (e.target === wrap) close(); };
  document.addEventListener('keydown', onKey);

  draw();
  return { close };
}

/** Shared styles, injected once per page. */
export function injectStyles() {
  if (document.getElementById('lb-styles')) return;
  const s = document.createElement('style');
  s.id = 'lb-styles';
  s.textContent = `
    /* This board is injected into two very different surfaces: inline on a
       game's win card (always dark) and inside .lb-modal (a light panel). It
       must never inherit the page's text colour — the game pages leave body
       colour at the default black, which rendered the whole board black on
       dark green. Everything below is coloured from --lb-fg, which defaults to
       light and is overridden inside the modal. */
    .lb-list,.lb-row,.lb-note,.lb-claim{--lb-fg:#ede3d8}
    .lb-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px;
      color:var(--lb-fg)}
    .lb-row{display:flex;align-items:center;gap:10px;padding:7px 9px;border-radius:7px;
      font-family:var(--mono,monospace);font-size:.72rem;color:var(--lb-fg)}
    .lb-row.me{background:rgba(204,247,63,.16);font-weight:700}
    .lb-rank{width:1.4em;text-align:right;opacity:.6;flex-shrink:0}
    .lb-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
      font-family:var(--body,system-ui,sans-serif);font-size:.9rem;letter-spacing:0;text-transform:none}
    .lb-score{flex-shrink:0;opacity:.85}
    .lb-note{font-family:var(--mono,monospace);font-size:.58rem;letter-spacing:.06em;
      color:var(--lb-fg);opacity:.6;margin-top:9px;text-align:center}
    .lb-claim label{display:block;font-family:var(--mono,monospace);font-size:.6rem;
      letter-spacing:.1em;text-transform:uppercase;color:var(--lb-fg);opacity:.8;
      margin-bottom:8px;line-height:1.4}
    .lb-claim-row{display:flex;gap:7px}
    .lb-claim-in{flex:1;min-width:0;padding:10px 11px;border-radius:8px;
      font-family:var(--body,system-ui,sans-serif);font-size:.95rem;font-weight:400;letter-spacing:0;
      text-transform:none;line-height:1.3;
      border:1px solid rgba(128,128,128,.45);background:rgba(255,255,255,.07);color:var(--lb-fg)}
    .lb-claim-go{padding:10px 16px;border-radius:8px;border:0;
      font-family:var(--body,system-ui,sans-serif);font-size:.9rem;font-weight:600;letter-spacing:0;
      text-transform:none;cursor:pointer;background:#5e7d0f;color:#fff;min-height:40px;white-space:nowrap}
    .lb-claim-go:disabled{opacity:.5;cursor:default}
    .lb-claim-msg{font-family:var(--mono,monospace);font-size:.62rem;color:var(--lb-fg);
      opacity:.8;margin-top:6px;min-height:1em}
    /* overlay — the games it sits over are dark, so it brings its own surface
       rather than inheriting whatever the page happens to use */
    .lb-overlay{position:fixed;inset:0;z-index:400;display:grid;place-items:center;
      background:rgba(6,10,6,.72);backdrop-filter:blur(4px);padding:18px}
    .lb-modal{width:min(420px,100%);max-height:82vh;overflow-y:auto;position:relative;
      background:var(--surface,#fdf5ea);color:var(--fg,#1d1712);
      border:1px solid var(--line,rgba(0,0,0,.14));border-radius:14px;
      padding:22px 20px 18px;box-shadow:0 30px 70px -30px rgba(0,0,0,.7)}
    .lb-modal .lb-list,.lb-modal .lb-row,.lb-modal .lb-note,.lb-modal .lb-claim{
      --lb-fg:var(--fg,#1d1712)}
    .lb-x{position:absolute;top:9px;right:11px;background:none;border:0;cursor:pointer;
      font-size:1.5rem;line-height:1;color:var(--dim,#8a7a66);padding:6px;min-width:38px;min-height:38px}
    .lb-x:hover{color:var(--fg,#1d1712)}
    .lb-head{font-family:var(--disp,sans-serif);font-weight:560;font-size:1.25rem;
      letter-spacing:-.01em;margin-bottom:12px;padding-right:30px}
    .lb-daybar{display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:14px}
    .lb-day{font-family:var(--mono,monospace);font-size:.68rem;letter-spacing:.12em;
      text-transform:uppercase;color:var(--dim,#8a7a66);min-width:11ch;text-align:center}
    .lb-day-btn{background:none;border:1px solid var(--line-strong,rgba(0,0,0,.3));border-radius:8px;
      color:var(--fg,#1d1712);cursor:pointer;font-size:1rem;line-height:1;
      min-width:38px;min-height:38px;transition:border-color .15s,opacity .15s}
    .lb-day-btn:hover:not(:disabled){border-color:var(--accent-ink,#5e7d0f);color:var(--accent-ink,#5e7d0f)}
    .lb-day-btn:disabled{opacity:.3;cursor:default}`;
  document.head.appendChild(s);
}
