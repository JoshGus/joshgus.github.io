// ─────────────────────────────────────────────────────────────────────────────
// p2p.js — host-authoritative netcode core (WebSocket relay)
//
// Topology: star. One peer is the HOST and holds the single authoritative game
// simulation. Every other peer is a CLIENT that sends *intents* (commands). The
// host validates each intent (turn / ownership / legality), applies it to its
// own sim, and broadcasts the resulting state. Clients render what the host
// sends; they never trust each other.
//
// TRANSPORT: every participant holds one WebSocket to a Cloudflare Worker
// (workers/relay/), which forwards messages between them. Peers never connect
// to each other, so they never exchange IP addresses — that is the whole point
// of relaying rather than using WebRTC, which hands peers your address during
// ICE negotiation in order to find a direct route.
//
// The relay is a dumb pipe: rooms and routing only. It never sees the password
// and holds no game state, so the trust model below is unchanged from the
// WebRTC version — the HOST is still the only authority.
//
// SECURITY MODEL — read games/net/README.md for the full threat model. In short:
//   • The host is the authority. A CLIENT cannot cheat past host validation,
//     rate limits, or size caps because the host re-checks everything.
//   • This does NOT stop a malicious HOST (the host *is* the server) or a fully
//     modified client that still sends only *legal* commands — that's impossible
//     in this topology. The goal is to block casual cheating, griefing, tab-DoS.
//   • Passwords are enforced host-side. The relay forwards bytes it does not
//     interpret, so it never sees them and a client can't bypass the check. They
//     are an "unlisted / friends-only" gate, not real security.
//   • The relay operator (Cloudflare, and whoever deploys the Worker) can see
//     traffic. It is transport-encrypted (wss) but not end-to-end encrypted.
// ─────────────────────────────────────────────────────────────────────────────

// Deployed relay Worker. Set this to your workers.dev URL or custom route; see
// workers/relay/README.md. `?relay=ws://127.0.0.1:8787` overrides it for local
// testing against `wrangler dev`.
const RELAY_URL = 'wss://relay.joshg.us';

const MAX_MSG_BYTES = 24 * 1024;    // reject any single message larger than this
const HELLO_TIMEOUT_MS = 12000;     // client: give up if no welcome/reject in time
const CONNECT_TIMEOUT_MS = 15000;   // give up if the relay never opens the socket

// Heartbeats are deliberately slow. Every ping wakes the room's Durable Object,
// and an idle lobby that never sleeps burns the free plan's daily duration
// budget. The relay reports socket open/close reliably (far better than WebRTC
// did), so these only exist to catch zombies — a peer whose socket stayed up
// while the tab froze.
const HEARTBEAT_MS = 20000;
const DROP_MS = 50000;              // no traffic for this long ⇒ treat peer as gone

// ── reconnection ─────────────────────────────────────────────────────────────
// A WebSocket to the edge drops for all the usual reasons — a phone changing
// networks, a laptop sleeping, a flaky café AP. Rather than end the game, both
// roles transparently re-open the socket and resume:
//
//   • A CLIENT reopens, re-sends hello with the resume token the host gave it,
//     and the host maps it back to the SAME player slot. The relay assigns a new
//     connection id on reconnect, so seat identity is the token, not the id.
//   • A HOST reopens the same room code, proving itself with a host token it
//     minted (see the relay's HOST_GRACE_MS). The relay keeps the room and its
//     clients alive during the gap instead of tearing everything down.
//
// The host holds a dropped client's seat for CLIENT_GRACE_MS before giving up on
// it (onLeave). These windows are sized so a peer's own reconnect deadline is
// comfortably inside the window the other side is willing to wait.
const CLIENT_GRACE_MS = 60000;         // host holds a dropped client's seat this long
const CLIENT_RECONNECT_MS = 50000;     // a client keeps trying to get back for this long
const HOST_RECONNECT_MS = 40000;       // a host keeps trying to retake its room for this long
const RECONNECT_BASE_MS = 500;         // first retry delay; doubles each attempt…
const RECONNECT_CAP_MS = 5000;         // …up to this ceiling, plus jitter

function makeToken() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}
function backoff(attempt) {
  return Math.min(RECONNECT_CAP_MS, RECONNECT_BASE_MS * 2 ** attempt) + Math.random() * 300;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── shared "reconnecting…" banner ────────────────────────────────────────────
// A single lightweight toast, driven by whichever controller is on the page, so
// every game shows the same indicator without any per-game code. Games that want
// custom UI can also read hooks.onNetStatus(state) — 'reconnecting' | 'online'.
let _banner = null;
function ensureBanner() {
  if (_banner || typeof document === 'undefined' || !document.body) return _banner;
  const st = document.createElement('style');
  st.textContent = '@keyframes mplPulse{0%,100%{opacity:1}50%{opacity:.25}}';
  document.head.appendChild(st);
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2147483647;'
    + 'display:none;gap:9px;align-items:center;pointer-events:none;'
    + 'background:rgba(20,16,12,.92);color:#fff;border-radius:999px;padding:9px 16px;'
    + 'font:600 13px/1.3 var(--body,system-ui,sans-serif);box-shadow:0 8px 24px rgba(0,0,0,.35);'
    + 'opacity:0;transition:opacity .2s';
  const dot = document.createElement('span');
  dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#f0b429;animation:mplPulse 1s infinite';
  const txt = document.createElement('span');
  el.append(dot, txt);
  document.body.appendChild(el);
  el._txt = txt;
  _banner = el;
  return el;
}
function showBanner(text) {
  const el = ensureBanner();
  if (!el) return;
  el._txt.textContent = text;
  el.style.display = 'flex';
  requestAnimationFrame(() => { el.style.opacity = '1'; });
}
function hideBanner() {
  if (!_banner) return;
  _banner.style.opacity = '0';
  setTimeout(() => { if (_banner) _banner.style.display = 'none'; }, 250);
}

// Room codes: 4 unambiguous chars (no 0/O/1/I/etc). ~800k combinations — enough
// that random collisions are rare; we retry on the off chance one happens.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Relay close codes (mirrors workers/relay/src/index.js)
const CLOSE_ROOM_TAKEN = 4001;
const CLOSE_NO_HOST    = 4002;
const CLOSE_ROOM_FULL  = 4003;

function relayBase() {
  const override = new URLSearchParams(location.search).get('relay');
  const base = override || RELAY_URL;
  if (!base) throw new Error('Multiplayer is not configured yet (RELAY_URL unset in games/net/p2p.js)');
  return String(base).replace(/\/+$/, '');
}

function roomUrl(gameId, code, role, listing, hostToken) {
  let u = `${relayBase()}/room/${encodeURIComponent(gameId)}/${encodeURIComponent(code)}?role=${role}`;
  // The host presents its token on every connect so a reconnect can prove it is
  // the same host and retake the room during its grace window.
  if (role === 'host' && hostToken) u += `&ht=${encodeURIComponent(hostToken)}`;
  // Listing details ride on the handshake so the Durable Object publishes the
  // directory row itself. A browser never writes to the directory — it cannot
  // advertise a room that doesn't exist or lie about how full one is.
  if (listing) {
    u += '&open=1'
       + `&name=${encodeURIComponent(listing.hostName || 'Host')}`
       + `&max=${encodeURIComponent(listing.maxPlayers || 8)}`
       + (listing.hasPassword ? '&pw=1' : '');
    // Publishing requires a claimed site username; the relay verifies these and
    // silently keeps the room unlisted (sending {t:'unlisted'}) if they fail.
    if (listing.username && listing.token) {
      u += `&u=${encodeURIComponent(listing.username)}&t=${encodeURIComponent(listing.token)}`;
    }
  }
  return u;
}

// Open lobbies for a game (or all games when omitted). Never throws: the
// directory is a convenience, and join-by-code works without it.
export async function listLobbies(gameId) {
  try {
    const url = `${relayBase().replace(/^ws/, 'http')}/lobbies` + (gameId ? `?game=${encodeURIComponent(gameId)}` : '');
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.lobbies) ? data.lobbies : [];
  } catch {
    return [];
  }
}

// Opens a socket, or rejects with an Error carrying the relay's close code so
// callers can tell "code already hosted" from "no such room".
function openSocket(url) {
  return new Promise((resolve, reject) => {
    let ws;
    try { ws = new WebSocket(url); } catch (e) { return reject(e); }
    const timer = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('Relay timed out')); }, CONNECT_TIMEOUT_MS);
    let opened = false;
    ws.addEventListener('open', () => { opened = true; clearTimeout(timer); resolve(ws); });
    ws.addEventListener('close', (e) => {
      clearTimeout(timer);
      if (opened) return;                       // post-open closes are handled by callers
      const err = new Error(closeMessage(e.code));
      err.code = e.code;
      reject(err);
    });
    // 'error' is always followed by 'close'; let close carry the reason.
    ws.addEventListener('error', () => {});
  });
}

function closeMessage(code) {
  switch (code) {
    case CLOSE_ROOM_TAKEN: return 'That room code is already in use';
    case CLOSE_NO_HOST:    return 'No game found for that code';
    case CLOSE_ROOM_FULL:  return 'That game is full';
    default:               return 'Could not reach the relay';
  }
}

function sendFrame(ws, frame) {
  try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(frame)); } catch {}
}

// ── small utilities ──────────────────────────────────────────────────────────

export function makeCode(n = 4) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let c = '';
  for (let i = 0; i < n; i++) c += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return c;
}

function byteLen(obj) {
  try { return new Blob([JSON.stringify(obj)]).size; } catch { return Infinity; }
}

// Token-bucket rate limiter. One per connected client, checked on every inbound
// command. Sustained overflow trips a strike counter the host uses to kick.
class TokenBucket {
  constructor(ratePerSec, burst) {
    this.rate = ratePerSec;
    this.capacity = burst;
    this.tokens = burst;
    this.last = performance.now();
  }
  take(n = 1) {
    const now = performance.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
    if (this.tokens >= n) { this.tokens -= n; return true; }
    return false;
  }
}

// ── HOST ─────────────────────────────────────────────────────────────────────
//
// hostRoom(opts) → Promise<HostController>
//
// opts:
//   gameId      string   — short id, e.g. 'darts' (namespaces the room code)
//   hostName    string   — display name for the host player
//   password    string?  — optional; clients must supply the same string
//   maxPlayers  number   — including the host (default 8)
//   open        boolean? — list this room in the public directory (see
//                          listLobbies). Off by default: rooms are unlisted
//                          unless the host opts in.
//   rate        {cmdsPerSec, burst, strikeLimit}  — per-client command limits
//   hooks:
//     validate(player, cmd) → boolean | cmd'   REQUIRED. Return false to reject a
//                                              command, or a sanitized command to
//                                              apply instead of the raw one.
//     onCommand(player, cmd)                   Apply a validated command to state.
//     onJoin(player)                           A client finished the handshake.
//     onLeave(player)                          A client disconnected / was kicked /
//                                              went silent past DROP_MS (heartbeat).
//     onReject(player, cmd)                    A client's command failed validation —
//                                              the game may re-prompt that player.
//     snapshot(player) → stateObj              Build the state to send this player
//                                              (per-player so hosts can hide info).
//
// HostController:
//   code                      the room code to share
//   link                      a full join URL (current page + ?room=CODE)
//   players()                 array of {id, name, isHost}
//   pushState()               send a fresh per-player snapshot to everyone
//   send(playerId, msg)       host→one client event: {type:'event', event:msg}
//   broadcast(msg)            host→all clients event
//   kick(playerId, reason)
//   close()
//   onError(cb)               transport-level errors
//   isHost = true

export async function hostRoom(opts) {
  const gameId     = opts.gameId;
  const maxPlayers = opts.maxPlayers ?? 8;
  const password   = opts.password ? String(opts.password) : null;
  const rate       = Object.assign({ cmdsPerSec: 20, burst: 40, strikeLimit: 30 }, opts.rate || {});
  const hooks      = opts.hooks || {};
  if (typeof hooks.validate !== 'function') {
    throw new Error('hostRoom: hooks.validate is required (host-authoritative validation)');
  }
  // Needed before the socket opens, since the listing rides on the handshake.
  const hostPlayer0Name = (opts.hostName || 'Host').slice(0, 24);

  const clients = new Map();   // relay connection id → clientRec
  let nextSlot = 1;            // slot 0 is the host
  let errCb = () => {};

  // Minted once. The host re-presents it on every (re)connect so the relay can
  // recognise a reconnecting host and hand the room back rather than treating it
  // as a stranger grabbing an idle code. See roomUrl / the relay's HOST_GRACE_MS.
  const hostToken = makeToken();
  const listing = opts.open ? {
    hostName: hostPlayer0Name, maxPlayers, hasPassword: !!password,
    username: opts.username, token: opts.token,
  } : null;

  let ws;
  let hostConnected = false;   // is our own socket to the relay currently up?
  let intentionalClose = false;
  let reconnecting = false;

  function setStatus(state) {
    if (state === 'reconnecting') showBanner('Reconnecting…'); else hideBanner();
    if (typeof hooks.onNetStatus === 'function') { try { hooks.onNetStatus(state); } catch {} }
  }

  // Try codes until the relay accepts one (collision = someone already hosts it).
  let code;
  for (let attempt = 0; attempt < 6; attempt++) {
    code = makeCode();
    try {
      ws = await openSocket(roomUrl(gameId, code, 'host', listing, hostToken));
      break;
    } catch (e) {
      if (e && e.code === CLOSE_ROOM_TAKEN && attempt < 5) continue;
      throw e;
    }
  }
  hostConnected = true;

  // Each client gets a shim standing in for the old WebRTC DataConnection, so
  // the handshake/validation code below is unchanged. It sends through whatever
  // `ws` currently is, so it keeps working after the host socket reconnects.
  function makeConn(id) {
    return {
      peer: id,
      open: true,
      send(obj) { if (this.open) sendFrame(ws, { to: id, d: obj }); },
      close() { if (!this.open) return; this.open = false; sendFrame(ws, { t: 'kick', id }); },
    };
  }

  const hostPlayer = { id: 0, name: (opts.hostName || 'Host').slice(0, 24), isHost: true };
  let listedPublicly = !!opts.open;

  function snapshotFor(player) {
    return typeof hooks.snapshot === 'function' ? hooks.snapshot(player) : null;
  }
  function roster() {
    return [hostPlayer, ...[...clients.values()].filter(c => c.ready).map(
      c => ({ id: c.id, name: c.name, isHost: false, disconnected: !!c.disconnected }))];
  }
  function sendRosterToAll() {
    const r = roster();
    for (const c of clients.values()) if (c.ready && !c.disconnected) safeSend(c.conn, { type: 'roster', roster: r });
  }

  function clearGrace(c) { if (c.graceTimer) { clearTimeout(c.graceTimer); c.graceTimer = null; } }

  // A client's socket dropped. Don't end its game yet — hold the seat for
  // CLIENT_GRACE_MS so it can reconnect (matching its resume token) and pick up
  // exactly where it left off. Only if it never returns do we call onLeave.
  function markDisconnected(c) {
    if (!clients.has(c.conn.peer) || c.disconnected) return;
    c.disconnected = true;
    c.conn.open = false;
    sendRosterToAll();
    clearGrace(c);
    c.graceTimer = setTimeout(() => { c.graceTimer = null; removeClient(c, 'timeout'); }, CLIENT_GRACE_MS);
  }

  function removeClient(c, reason) {
    clearGrace(c);
    if (!clients.has(c.conn.peer)) return;
    clients.delete(c.conn.peer);
    // conn.close() asks the relay to drop that client's socket.
    try { c.conn.close(); } catch {}
    if (c.ready && typeof hooks.onLeave === 'function') hooks.onLeave({ id: c.id, name: c.name, isHost: false });
    sendRosterToAll();
  }

  // A reconnecting client re-hellos with the resume token from its welcome; find
  // the seat it belongs to so we can rebind rather than seat it as someone new.
  function findResume(token, exclude) {
    if (!token) return null;
    for (const c of clients.values()) if (c !== exclude && c.ready && c.resume === token) return c;
    return null;
  }

  function onHostMessage(ev) {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (!msg || typeof msg !== 'object') return;

    if (msg.t === 'unlisted') {
      // Asked to be public but the username didn't verify. The room still works
      // by code, so this is a notice rather than a failure.
      listedPublicly = false;
      if (typeof hooks.onUnlisted === 'function') hooks.onUnlisted();
      return;
    }
    if (msg.t === 'resume') {
      // We just reconnected. The relay lists the clients still present; anything
      // we think is connected but isn't there vanished while we were away — start
      // its grace timer so it too gets a chance to come back.
      const present = new Set(Array.isArray(msg.clients) ? msg.clients : []);
      for (const c of [...clients.values()]) {
        if (!c.disconnected && !present.has(c.conn.peer)) markDisconnected(c);
      }
      return;
    }
    if (msg.t === 'open') {
      const conn = makeConn(msg.id);
      const c = {
        conn, id: null, name: 'Player', ready: false,
        bucket: new TokenBucket(rate.cmdsPerSec, rate.burst), strikes: 0,
        lastSeen: performance.now(), disconnected: false, graceTimer: null, resume: null,
      };
      clients.set(msg.id, c);
      return;
    }
    if (msg.t === 'close') {
      const c = clients.get(msg.id);
      if (c) markDisconnected(c);
      return;
    }
    if (msg.from != null) {
      const c = clients.get(msg.from);
      if (!c) return;
      c.lastSeen = performance.now();
      handleClientData(c, msg.d);
    }
  }

  function onHostClose() {
    hostConnected = false;
    if (intentionalClose) { clearInterval(heartbeat); return; }
    beginHostReconnect();
  }

  // Our socket to the relay dropped. The game state lives here in the tab, so we
  // just need the pipe back: reopen the same code with our host token, and the
  // relay hands the room (and its still-connected clients) back to us.
  async function beginHostReconnect() {
    if (reconnecting || intentionalClose) return;
    reconnecting = true;
    setStatus('reconnecting');
    const deadline = performance.now() + HOST_RECONNECT_MS;
    let attempt = 0;
    while (!intentionalClose && performance.now() < deadline) {
      await sleep(backoff(attempt++));
      if (intentionalClose) break;
      try {
        const sock = await openSocket(roomUrl(gameId, code, 'host', listing, hostToken));
        ws = sock;
        hostConnected = true;
        reconnecting = false;
        wireHost(sock);
        setStatus('online');
        api.pushState();          // resync everyone still here
        return;
      } catch (e) {
        // ROOM_TAKEN can mean the old socket isn't reaped yet — keep trying.
        if (intentionalClose) break;
      }
    }
    reconnecting = false;
    clearInterval(heartbeat);
    setStatus('online');          // clear the banner; the game is ending
    errCb(new Error('Lost connection to the relay'));
  }

  function wireHost(sock) {
    sock.addEventListener('message', onHostMessage);
    sock.addEventListener('close', onHostClose);
    sock.addEventListener('error', () => {});   // 'close' carries the outcome
  }
  wireHost(ws);

  // Heartbeat: ping every live client and, if one goes silent past DROP_MS, start
  // its grace timer (not an instant kick — it may just be reconnecting). Paused
  // while our own socket is down, since we can't reach anyone then anyway.
  const heartbeat = setInterval(() => {
    if (!hostConnected) return;
    const now = performance.now();
    for (const c of clients.values()) {
      if (!c.ready || c.disconnected) continue;
      safeSend(c.conn, { type: 'ping' });
      if (now - c.lastSeen > DROP_MS) markDisconnected(c);
    }
  }, HEARTBEAT_MS);

  function handleClientData(c, data) {
    // 1) Anti-flood: size cap + basic shape check. Reject-don't-crash.
    if (byteLen(data) > MAX_MSG_BYTES) { strike(c, 5); return; }
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') { strike(c, 1); return; }

    if (data.type === 'ping') return;              // keepalive — lastSeen already bumped
    if (data.type === 'hello') return handleHello(c, data);
    if (data.type === 'bye') { removeClient(c, 'left'); return; }   // intentional leave — free the seat now
    if (!c.ready) { strike(c, 1); return; }        // no commands before handshake

    if (data.type === 'cmd') {
      if (!c.bucket.take(1)) { strike(c, 1); return; }   // 2) rate limit
      const player = { id: c.id, name: c.name, isHost: false };
      // 3) host-authoritative validation
      let cmd = data.cmd;
      const verdict = hooks.validate(player, cmd);
      if (verdict === false || verdict == null) {
        strike(c, 1);
        // Let the game re-prompt (e.g. re-grant the turn) so a rejected but
        // otherwise-live client isn't left waiting forever.
        if (typeof hooks.onReject === 'function') hooks.onReject(player, cmd);
        return;
      }
      if (verdict !== true) cmd = verdict;               // sanitized replacement
      if (typeof hooks.onCommand === 'function') hooks.onCommand(player, cmd);
      return;
    }
    // Unknown message type from a client — mild strike, ignore.
    strike(c, 1);
  }

  function handleHello(c, data) {
    if (c.ready) return;                                       // already joined

    // Reconnect: a client re-hellos with the resume token from its welcome. Map
    // the fresh socket onto the existing seat and pick the game up unchanged —
    // no new slot, no onJoin, no password re-check (the token is the proof).
    if (data.resume) {
      const prev = findResume(data.resume, c);
      if (prev) {
        clearGrace(prev);
        clients.delete(c.conn.peer);        // discard the temporary rec
        clients.delete(prev.conn.peer);      // the seat's relay id has changed
        prev.conn = c.conn;
        prev.conn.open = true;
        prev.disconnected = false;
        prev.lastSeen = performance.now();
        clients.set(prev.conn.peer, prev);
        const player = { id: prev.id, name: prev.name, isHost: false };
        safeSend(prev.conn, { type: 'welcome', you: player, roster: roster(), state: snapshotFor(player), resume: prev.resume });
        sendRosterToAll();
        if (typeof hooks.onRejoin === 'function') hooks.onRejoin(player);
        return;
      }
      // No matching seat (grace already expired) — fall through and seat afresh.
    }

    if (password && String(data.password || '') !== password) {
      safeSend(c.conn, { type: 'reject', reason: 'bad-password' });
      setTimeout(() => removeClient(c, 'bad-password'), 250);
      return;
    }
    if (roster().length >= maxPlayers) {
      safeSend(c.conn, { type: 'reject', reason: 'full' });
      setTimeout(() => removeClient(c, 'full'), 250);
      return;
    }
    c.id = nextSlot++;
    c.name = typeof data.name === 'string' ? data.name.slice(0, 24) : `Player ${c.id}`;
    c.ready = true;
    c.resume = makeToken();
    const player = { id: c.id, name: c.name, isHost: false };
    safeSend(c.conn, { type: 'welcome', you: player, roster: roster(), state: snapshotFor(player), resume: c.resume });
    if (typeof hooks.onJoin === 'function') hooks.onJoin(player);
    sendRosterToAll();
  }

  function strike(c, n) {
    c.strikes += n;
    if (c.strikes >= rate.strikeLimit) {
      safeSend(c.conn, { type: 'reject', reason: 'kicked' });
      setTimeout(() => removeClient(c, 'strikes'), 100);
    }
  }

  const api = {
    isHost: true,
    code,
    get listed() { return listedPublicly; },
    get link() {
      const u = new URL(location.href);
      u.searchParams.set('room', code);
      return u.toString();
    },
    players: () => roster(),
    pushState() {
      for (const c of clients.values()) {
        if (!c.ready) continue;
        safeSend(c.conn, { type: 'state', state: snapshotFor({ id: c.id, name: c.name, isHost: false }) });
      }
    },
    send(playerId, msg) {
      for (const c of clients.values()) if (c.id === playerId && c.ready) safeSend(c.conn, { type: 'event', event: msg });
    },
    broadcast(msg) {
      for (const c of clients.values()) if (c.ready) safeSend(c.conn, { type: 'event', event: msg });
    },
    kick(playerId, reason = 'kicked') {
      for (const c of clients.values()) if (c.id === playerId) {
        safeSend(c.conn, { type: 'reject', reason });
        setTimeout(() => removeClient(c, reason), 100);
      }
    },
    close() {
      intentionalClose = true;
      clearInterval(heartbeat);
      hideBanner();
      for (const c of clients.values()) clearGrace(c);
      clients.clear();
      // Tell the relay this is a real shutdown so it ends the room immediately
      // instead of holding it open for a reconnect that isn't coming. Give the
      // frame a beat to flush and let the relay close us; drop the socket
      // ourselves only as a fallback if it doesn't.
      sendFrame(ws, { t: 'bye' });
      setTimeout(() => { try { ws.close(1000, 'host closed'); } catch {} }, 300);
    },
    onError(cb) { errCb = typeof cb === 'function' ? cb : () => {}; },
  };
  return api;
}

// ── CLIENT ───────────────────────────────────────────────────────────────────
//
// joinRoom(opts) → Promise<ClientController>   (rejects on bad code/password/full)
//
// opts:
//   gameId, code, password?, name?
//   hooks:
//     onState(state)     host pushed a full/partial state snapshot
//     onRoster(roster)   the player list changed
//     onEvent(event)     a host→client event (from host.send/broadcast)
//     onKicked(reason)   host rejected/kicked us ('bad-password'|'full'|'kicked'|...)
//     onClose()          connection dropped
//
// ClientController:
//   isHost = false
//   me                 {id, name}
//   roster             last known roster
//   sendCmd(cmd)       client→host intent (host will validate)
//   close()

export async function joinRoom(opts) {
  const gameId   = opts.gameId;
  const code     = String(opts.code || '').toUpperCase().trim();
  const hooks    = opts.hooks || {};
  const name     = (opts.name || 'Player').slice(0, 24);
  const password = opts.password ? String(opts.password) : '';
  if (!code) throw new Error('joinRoom: code required');

  let ws = null;
  let conn = null;
  let controller = null;
  let resumeToken = null;               // handed to us at welcome; proves our seat on reconnect
  let lastSeen = performance.now();
  let heartbeat = null;
  let intentionalClose = false;
  let reconnecting = false;
  let closedFired = false;

  function setStatus(state) {
    if (state === 'reconnecting') showBanner('Reconnecting…'); else hideBanner();
    if (typeof hooks.onNetStatus === 'function') { try { hooks.onNetStatus(state); } catch {} }
  }

  // Terminal end of the session — host truly gone, we were kicked, or we ran out
  // of reconnect attempts. Fires onClose exactly once.
  function fireClose() {
    if (closedFired) return;
    closedFired = true;
    if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
    try { if (conn) conn.close(); } catch {}
    hideBanner();
    if (typeof hooks.onClose === 'function') hooks.onClose();
  }

  function startHeartbeat() {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = setInterval(() => {
      safeSend(conn, { type: 'ping' });
      if (performance.now() - lastSeen > DROP_MS) onSocketLost();
    }, HEARTBEAT_MS);
  }

  // Our socket looks dead (a close/error event, or silent past DROP_MS). If we
  // ever fully joined, try to get back rather than ending the game.
  function onSocketLost() {
    if (intentionalClose || closedFired || !controller) return;
    beginReconnect();
  }

  async function beginReconnect() {
    if (reconnecting || intentionalClose || closedFired) return;
    reconnecting = true;
    if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
    setStatus('reconnecting');
    const deadline = performance.now() + CLIENT_RECONNECT_MS;
    let attempt = 0;
    while (!intentionalClose && !closedFired && performance.now() < deadline) {
      await sleep(backoff(attempt++));
      if (intentionalClose || closedFired) break;
      try {
        await connect(true);          // re-hello with our resume token
        reconnecting = false;
        setStatus('online');
        return;
      } catch { /* NO_HOST (host also reconnecting) or transient — keep trying */ }
    }
    reconnecting = false;
    fireClose();
  }

  // Opens a socket, performs the hello handshake, and wires the live message
  // pump. Resolves once the host welcomes us; rejects on a hard reject or
  // timeout. `isReconnect` re-presents the resume token and keeps the existing
  // controller instead of minting a new one.
  function connect(isReconnect) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (fn, arg) => { if (!settled) { settled = true; fn(arg); } };

      openSocket(roomUrl(gameId, code, 'client')).then((sock) => {
        if (intentionalClose) { try { sock.close(); } catch {} return settle(reject, new Error('closed')); }
        ws = sock;
        conn = {
          open: true,
          send(obj) { if (this.open) sendFrame(sock, { d: obj }); },
          close() { this.open = false; try { sock.close(1000, 'client closed'); } catch {} },
        };

        const helloTimer = setTimeout(() => {
          try { sock.close(); } catch {}
          settle(reject, new Error('Timed out — is the code right and the host online?'));
        }, HELLO_TIMEOUT_MS);

        safeSend(conn, { type: 'hello', name, password, resume: isReconnect ? resumeToken : undefined });

        sock.addEventListener('message', (ev) => {
          let frame;
          try { frame = JSON.parse(ev.data); } catch { return; }
          if (!frame || typeof frame !== 'object') return;

          // Room-level notices (not host→client game data).
          if (frame.t === 'hostgone') { clearTimeout(helloTimer); settle(reject, new Error('Host closed the connection')); fireClose(); return; }
          if (frame.t === 'hostwait') { showBanner('Host reconnecting…'); if (typeof hooks.onNetStatus === 'function') { try { hooks.onNetStatus('reconnecting'); } catch {} } return; }
          if (frame.t === 'hostback') { setStatus('online'); return; }

          const data = frame.d;
          lastSeen = performance.now();
          if (!data || typeof data.type !== 'string') return;
          switch (data.type) {
            case 'ping': return;
            case 'welcome': {
              clearTimeout(helloTimer);
              if (data.resume) resumeToken = data.resume;
              if (!controller) {
                controller = {
                  isHost: false,
                  me: data.you,
                  roster: data.roster || [],
                  sendCmd(cmd) { safeSend(conn, { type: 'cmd', cmd }); },
                  close() { intentionalClose = true; closedFired = true; if (heartbeat) clearInterval(heartbeat); hideBanner(); safeSend(conn, { type: 'bye' }); setTimeout(() => { try { conn.close(); } catch {} }, 300); },
                };
              } else {
                controller.me = data.you || controller.me;   // same seat, fresh socket
                controller.roster = data.roster || controller.roster;
              }
              startHeartbeat();
              setStatus('online');
              if (data.state != null && typeof hooks.onState === 'function') hooks.onState(data.state);
              if (typeof hooks.onRoster === 'function') hooks.onRoster(controller.roster);
              settle(resolve, controller);
              break;
            }
            case 'reject':
              clearTimeout(helloTimer);
              if (typeof hooks.onKicked === 'function') hooks.onKicked(data.reason || 'rejected');
              settle(reject, new Error(rejectMessage(data.reason)));
              if (controller) fireClose();          // a kick mid-game is terminal
              break;
            case 'state':
              if (typeof hooks.onState === 'function') hooks.onState(data.state);
              break;
            case 'roster':
              if (controller) controller.roster = data.roster || [];
              if (typeof hooks.onRoster === 'function') hooks.onRoster(data.roster || []);
              break;
            case 'event':
              if (typeof hooks.onEvent === 'function') hooks.onEvent(data.event);
              break;
          }
        });

        sock.addEventListener('close', () => {
          if (conn) conn.open = false;
          clearTimeout(helloTimer);
          if (!settled) { settle(reject, new Error('Host closed the connection')); return; }
          onSocketLost();
        });
        sock.addEventListener('error', () => {
          if (!settled) { clearTimeout(helloTimer); settle(reject, new Error('Could not reach the host — check the code')); }
        });
      }).catch((err) => settle(reject, err));
    });
  }

  // Initial join: rejects here with the relay's reason (bad code, room full, no
  // host). Auto-reconnect only kicks in after this first join has succeeded.
  await connect(false);
  return controller;
}

// ── shared internals ───────────────────────────────────────────────────────

function safeSend(conn, obj) {
  try { if (conn && conn.open) conn.send(obj); } catch {}
}

function rejectMessage(reason) {
  switch (reason) {
    case 'bad-password': return 'Wrong password';
    case 'full':         return 'That game is full';
    case 'kicked':       return 'You were removed from the game';
    default:             return 'Join rejected';
  }
}
