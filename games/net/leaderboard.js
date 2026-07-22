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

/** Shared styles, injected once per page. */
export function injectStyles() {
  if (document.getElementById('lb-styles')) return;
  const s = document.createElement('style');
  s.id = 'lb-styles';
  s.textContent = `
    .lb-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
    .lb-row{display:flex;align-items:center;gap:10px;padding:7px 9px;border-radius:7px;
      font-family:var(--mono,monospace);font-size:.72rem}
    .lb-row.me{background:rgba(204,247,63,.16);font-weight:700}
    .lb-rank{width:1.4em;text-align:right;opacity:.6;flex-shrink:0}
    .lb-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:inherit}
    .lb-score{flex-shrink:0;opacity:.85}
    .lb-note{font-family:var(--mono,monospace);font-size:.58rem;letter-spacing:.06em;
      opacity:.55;margin-top:9px;text-align:center}
    .lb-claim label{display:block;font-family:var(--mono,monospace);font-size:.6rem;
      letter-spacing:.1em;text-transform:uppercase;opacity:.7;margin-bottom:7px}
    .lb-claim-row{display:flex;gap:7px}
    .lb-claim-in{flex:1;min-width:0;padding:9px 10px;border-radius:8px;font:inherit;font-size:.9rem;
      border:1px solid rgba(128,128,128,.4);background:rgba(255,255,255,.06);color:inherit}
    .lb-claim-go{padding:9px 14px;border-radius:8px;border:0;font:inherit;font-weight:700;
      cursor:pointer;background:#5e7d0f;color:#fff;min-height:38px}
    .lb-claim-go:disabled{opacity:.5;cursor:default}
    .lb-claim-msg{font-family:var(--mono,monospace);font-size:.62rem;opacity:.75;margin-top:6px;min-height:1em}`;
  document.head.appendChild(s);
}
