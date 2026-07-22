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

function roomUrl(gameId, code, role) {
  return `${relayBase()}/room/${encodeURIComponent(gameId)}/${encodeURIComponent(code)}?role=${role}`;
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

  const clients = new Map();   // relay connection id → clientRec
  let nextSlot = 1;            // slot 0 is the host
  let errCb = () => {};

  // Try codes until the relay accepts one (collision = someone already hosts it).
  let code, ws;
  for (let attempt = 0; attempt < 6; attempt++) {
    code = makeCode();
    try {
      ws = await openSocket(roomUrl(gameId, code, 'host'));
      break;
    } catch (e) {
      if (e && e.code === CLOSE_ROOM_TAKEN && attempt < 5) continue;
      throw e;
    }
  }

  // Each client gets a shim standing in for the old WebRTC DataConnection, so
  // the handshake/validation code below is unchanged.
  function makeConn(id) {
    return {
      peer: id,
      open: true,
      send(obj) { if (this.open) sendFrame(ws, { to: id, d: obj }); },
      close() { if (!this.open) return; this.open = false; sendFrame(ws, { t: 'kick', id }); },
    };
  }

  const hostPlayer = { id: 0, name: (opts.hostName || 'Host').slice(0, 24), isHost: true };

  function snapshotFor(player) {
    return typeof hooks.snapshot === 'function' ? hooks.snapshot(player) : null;
  }
  function roster() {
    return [hostPlayer, ...[...clients.values()].filter(c => c.ready).map(c => ({ id: c.id, name: c.name, isHost: false }))];
  }
  function sendRosterToAll() {
    const r = roster();
    for (const c of clients.values()) if (c.ready) safeSend(c.conn, { type: 'roster', roster: r });
  }

  function removeClient(c, reason) {
    if (!clients.has(c.conn.peer)) return;
    clients.delete(c.conn.peer);
    // conn.close() asks the relay to drop that client's socket.
    try { c.conn.close(); } catch {}
    if (c.ready && typeof hooks.onLeave === 'function') hooks.onLeave({ id: c.id, name: c.name, isHost: false });
    sendRosterToAll();
  }

  ws.addEventListener('message', (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (!msg || typeof msg !== 'object') return;

    if (msg.t === 'open') {
      const conn = makeConn(msg.id);
      const c = {
        conn, id: null, name: 'Player', ready: false,
        bucket: new TokenBucket(rate.cmdsPerSec, rate.burst), strikes: 0,
        lastSeen: performance.now(),
      };
      clients.set(msg.id, c);
      return;
    }
    if (msg.t === 'close') {
      const c = clients.get(msg.id);
      if (c) { c.conn.open = false; removeClient(c, 'closed'); }
      return;
    }
    if (msg.from != null) {
      const c = clients.get(msg.from);
      if (!c) return;
      c.lastSeen = performance.now();
      handleClientData(c, msg.d);
    }
  });

  ws.addEventListener('close', () => { clearInterval(heartbeat); errCb(new Error('Relay connection lost')); });

  // Heartbeat: ping every client and evict any that has gone silent past DROP_MS.
  // Receiving *any* data (including a client's own ping) refreshes lastSeen above.
  const heartbeat = setInterval(() => {
    const now = performance.now();
    for (const c of clients.values()) {
      if (!c.ready) continue;
      safeSend(c.conn, { type: 'ping' });
      if (now - c.lastSeen > DROP_MS) removeClient(c, 'timeout');
    }
  }, HEARTBEAT_MS);

  ws.addEventListener('error', () => errCb(new Error('Relay connection error')));

  function handleClientData(c, data) {
    // 1) Anti-flood: size cap + basic shape check. Reject-don't-crash.
    if (byteLen(data) > MAX_MSG_BYTES) { strike(c, 5); return; }
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') { strike(c, 1); return; }

    if (data.type === 'ping') return;              // keepalive — lastSeen already bumped
    if (data.type === 'hello') return handleHello(c, data);
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
    const player = { id: c.id, name: c.name, isHost: false };
    safeSend(c.conn, { type: 'welcome', you: player, roster: roster(), state: snapshotFor(player) });
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
      clearInterval(heartbeat);
      for (const c of clients.values()) { try { c.conn.close(); } catch {} }
      clients.clear();
      try { ws.close(1000, 'host closed'); } catch {}
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
  const gameId = opts.gameId;
  const code   = String(opts.code || '').toUpperCase().trim();
  const hooks  = opts.hooks || {};
  if (!code) throw new Error('joinRoom: code required');

  // Rejects here with the relay's reason: no such room, room full, etc.
  const ws = await openSocket(roomUrl(gameId, code, 'client'));

  // Stands in for the old DataConnection so the handshake below is unchanged.
  const conn = {
    open: true,
    send(obj) { if (this.open) sendFrame(ws, { d: obj }); },
    close() { this.open = false; try { ws.close(1000, 'client closed'); } catch {} },
  };

  return await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
      reject(new Error('Timed out — is the code right and the host online?'));
    }, HELLO_TIMEOUT_MS);

    const finish = (fn) => { if (!settled) { settled = true; clearTimeout(timer); fn(); } };

    let controller = null;
    let lastSeen = performance.now();
    let heartbeat = null;
    let closedFired = false;

    // Fire onClose exactly once, whether the drop was detected by the WebRTC
    // 'close' event or by the heartbeat going silent past DROP_MS.
    const fireClose = () => {
      if (closedFired) return;
      closedFired = true;
      if (heartbeat) clearInterval(heartbeat);
      try { conn.close(); } catch {}
      if (typeof hooks.onClose === 'function') hooks.onClose();
    };

    // The socket is already open by the time we get here.
    safeSend(conn, { type: 'hello', name: (opts.name || 'Player').slice(0, 24), password: opts.password ? String(opts.password) : '' });

    ws.addEventListener('message', (ev) => {
      let frame;
      try { frame = JSON.parse(ev.data); } catch { return; }
      if (!frame || typeof frame !== 'object') return;
      if (frame.t === 'hostgone') {
        if (!settled) finish(() => reject(new Error('Host closed the connection')));
        else fireClose();
        return;
      }
      const data = frame.d;
      lastSeen = performance.now();
      if (!data || typeof data.type !== 'string') return;
      switch (data.type) {
        case 'ping': return;                       // keepalive — lastSeen already bumped
        case 'welcome': {
          controller = {
            isHost: false,
            me: data.you,
            roster: data.roster || [],
            sendCmd(cmd) { safeSend(conn, { type: 'cmd', cmd }); },
            close() { closedFired = true; if (heartbeat) clearInterval(heartbeat); try { conn.close(); } catch {} },
          };
          // Start pinging the host and watch for it going silent (silent drops
          // that never fire a 'close' event — network loss, tab killed, etc.).
          heartbeat = setInterval(() => {
            safeSend(conn, { type: 'ping' });
            if (performance.now() - lastSeen > DROP_MS) fireClose();
          }, HEARTBEAT_MS);
          if (data.state != null && typeof hooks.onState === 'function') hooks.onState(data.state);
          if (typeof hooks.onRoster === 'function') hooks.onRoster(controller.roster);
          finish(() => resolve(controller));
          break;
        }
        case 'reject':
          if (typeof hooks.onKicked === 'function') hooks.onKicked(data.reason || 'rejected');
          finish(() => reject(new Error(rejectMessage(data.reason))));
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

    ws.addEventListener('close', () => {
      conn.open = false;
      if (!settled) finish(() => reject(new Error('Host closed the connection')));
      else fireClose();
    });
    ws.addEventListener('error', () => {
      finish(() => reject(new Error('Could not reach the host — check the code')));
    });
  });
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
