// ─────────────────────────────────────────────────────────────────────────────
// p2p.js — host-authoritative P2P netcode core (WebRTC via PeerJS)
//
// Topology: star. One peer is the HOST and holds the single authoritative game
// simulation. Every other peer is a CLIENT that sends *intents* (commands). The
// host validates each intent (turn / ownership / legality), applies it to its
// own sim, and broadcasts the resulting state. Clients render what the host
// sends; they never trust each other.
//
// SECURITY MODEL — read games/net/README.md for the full threat model. In short:
//   • The host is the authority. A CLIENT cannot cheat past host validation,
//     rate limits, or size caps because the host re-checks everything.
//   • This does NOT stop a malicious HOST (the host *is* the server) or a fully
//     modified client that still sends only *legal* commands — that's impossible
//     in pure P2P. The goal is to block casual cheating, griefing, and tab-DoS.
//   • Passwords are enforced host-side over the DTLS-encrypted data channel, so
//     the PeerJS broker never sees them and a client can't bypass the check. They
//     are an "unlisted / friends-only" gate, not real security.
//   • WebRTC leaks peers' IP addresses to each other (ICE). Don't invite people
//     you wouldn't share your IP with. See README for TURN-relay mitigation.
// ─────────────────────────────────────────────────────────────────────────────

const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const ID_PREFIX  = 'jgus';          // namespace on the shared public PeerJS broker
const MAX_MSG_BYTES = 24 * 1024;    // reject any single message larger than this
const HELLO_TIMEOUT_MS = 12000;     // client: give up if no welcome/reject in time
const CONNECT_TIMEOUT_MS = 15000;   // host: give up if the broker never opens

// Room codes: 4 unambiguous chars (no 0/O/1/I/etc). ~800k combinations — enough
// that random collisions are rare; we retry on the off chance one happens.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// ── small utilities ──────────────────────────────────────────────────────────

let _peerLibPromise = null;
function loadPeerJS() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (_peerLibPromise) return _peerLibPromise;
  _peerLibPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PEERJS_URL;
    s.onload  = () => window.Peer ? resolve(window.Peer) : reject(new Error('PeerJS loaded but Peer missing'));
    s.onerror = () => reject(new Error('Failed to load PeerJS from CDN'));
    document.head.appendChild(s);
  });
  return _peerLibPromise;
}

export function makeCode(n = 4) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let c = '';
  for (let i = 0; i < n; i++) c += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return c;
}

function roomPeerId(gameId, code) {
  return `${ID_PREFIX}-${gameId}-${String(code).toUpperCase()}`.toLowerCase();
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
//     onLeave(player)                          A client disconnected / was kicked.
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
  const Peer = await loadPeerJS();
  const gameId     = opts.gameId;
  const maxPlayers = opts.maxPlayers ?? 8;
  const password   = opts.password ? String(opts.password) : null;
  const rate       = Object.assign({ cmdsPerSec: 20, burst: 40, strikeLimit: 30 }, opts.rate || {});
  const hooks      = opts.hooks || {};
  if (typeof hooks.validate !== 'function') {
    throw new Error('hostRoom: hooks.validate is required (host-authoritative validation)');
  }

  const clients = new Map();   // peerConnId → clientRec
  let nextSlot = 1;            // slot 0 is the host
  let errCb = () => {};

  // Try codes until the broker accepts our id (collision = someone already hosts it).
  let code, peer;
  for (let attempt = 0; attempt < 6; attempt++) {
    code = makeCode();
    try {
      peer = await openPeer(Peer, roomPeerId(gameId, code));
      break;
    } catch (e) {
      if (e && e.type === 'unavailable-id' && attempt < 5) continue;
      throw e;
    }
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
    try { c.conn.close(); } catch {}
    if (c.ready && typeof hooks.onLeave === 'function') hooks.onLeave({ id: c.id, name: c.name, isHost: false });
    sendRosterToAll();
  }

  peer.on('connection', (conn) => {
    const c = {
      conn, id: null, name: 'Player', ready: false,
      bucket: new TokenBucket(rate.cmdsPerSec, rate.burst), strikes: 0,
    };
    clients.set(conn.peer, c);

    conn.on('data', (data) => handleClientData(c, data));
    conn.on('close', () => removeClient(c, 'closed'));
    conn.on('error', () => removeClient(c, 'error'));
  });

  peer.on('error', (e) => {
    // Per-connection transport errors shouldn't tear the room down; surface them.
    errCb(e);
  });
  peer.on('disconnected', () => { try { peer.reconnect(); } catch {} });

  function handleClientData(c, data) {
    // 1) Anti-flood: size cap + basic shape check. Reject-don't-crash.
    if (byteLen(data) > MAX_MSG_BYTES) { strike(c, 5); return; }
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') { strike(c, 1); return; }

    if (data.type === 'hello') return handleHello(c, data);
    if (!c.ready) { strike(c, 1); return; }        // no commands before handshake

    if (data.type === 'cmd') {
      if (!c.bucket.take(1)) { strike(c, 1); return; }   // 2) rate limit
      const player = { id: c.id, name: c.name, isHost: false };
      // 3) host-authoritative validation
      let cmd = data.cmd;
      const verdict = hooks.validate(player, cmd);
      if (verdict === false || verdict == null) { strike(c, 1); return; }
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
      for (const c of clients.values()) { try { c.conn.close(); } catch {} }
      clients.clear();
      try { peer.destroy(); } catch {}
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
  const Peer  = await loadPeerJS();
  const gameId = opts.gameId;
  const code   = String(opts.code || '').toUpperCase().trim();
  const hooks  = opts.hooks || {};
  if (!code) throw new Error('joinRoom: code required');

  const peer = await openPeer(Peer);            // random client id
  const conn = peer.connect(roomPeerId(gameId, code), { reliable: true });

  return await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { peer.destroy(); } catch {}
      reject(new Error('Timed out — is the code right and the host online?'));
    }, HELLO_TIMEOUT_MS);

    const finish = (fn) => { if (!settled) { settled = true; clearTimeout(timer); fn(); } };

    let controller = null;

    conn.on('open', () => {
      safeSend(conn, { type: 'hello', name: (opts.name || 'Player').slice(0, 24), password: opts.password ? String(opts.password) : '' });
    });

    conn.on('data', (data) => {
      if (!data || typeof data.type !== 'string') return;
      switch (data.type) {
        case 'welcome': {
          controller = {
            isHost: false,
            me: data.you,
            roster: data.roster || [],
            sendCmd(cmd) { safeSend(conn, { type: 'cmd', cmd }); },
            close() { try { conn.close(); } catch {} try { peer.destroy(); } catch {} },
          };
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

    conn.on('close', () => {
      if (!settled) finish(() => reject(new Error('Host closed the connection')));
      else if (typeof hooks.onClose === 'function') hooks.onClose();
    });
    conn.on('error', () => {
      finish(() => reject(new Error('Could not reach the host — check the code')));
    });
    peer.on('error', (e) => {
      // 'peer-unavailable' = no host with that code.
      const msg = e && e.type === 'peer-unavailable' ? 'No game found for that code' : (e.message || 'Connection error');
      finish(() => reject(new Error(msg)));
    });
  });
}

// ── shared internals ───────────────────────────────────────────────────────

function openPeer(Peer, id) {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id) : new Peer();
    const timer = setTimeout(() => { try { peer.destroy(); } catch {} reject(new Error('Signaling server timeout')); }, CONNECT_TIMEOUT_MS);
    peer.on('open', () => { clearTimeout(timer); resolve(peer); });
    peer.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

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
