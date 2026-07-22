// ─────────────────────────────────────────────────────────────────────────────
// relay — WebSocket room relay for the multiplayer games.
//
// Replaces the WebRTC/PeerJS transport. Peers never connect to each other, so
// they never exchange IP addresses: everyone holds one WebSocket to Cloudflare
// and the room Durable Object forwards messages between them.
//
// This is deliberately a DUMB PIPE. It knows about rooms, who the host is, and
// nothing else — no passwords, no game state, no validation. The host browser
// stays the authority exactly as before (see games/net/README.md); moving that
// here would mean trusting the edge with game logic for no benefit.
//
// Wire protocol (all JSON):
//   client → relay   { d: <msg> }                 always routed to the host
//   host   → relay   { to: <id>|"*", d: <msg> }   routed to one client, or all
//   relay  → host    { t:"open", id } | { t:"close", id } | { from:<id>, d:<msg> }
//   relay  → client  { d: <msg> } | { t:"hostgone" }
//
// A client cannot address another client: the relay ignores `to` from clients
// and always forwards to the host. That keeps the star topology enforceable at
// the edge rather than by convention.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_FRAME_BYTES = 96 * 1024;   // generous vs the host's own 24KB cmd cap,
                                     // because host→client state can be large
const MAX_CLIENTS = 16;              // hard ceiling; the host enforces its own

// A room with no traffic for this long is closed out. Durable Objects don't
// need destroying — with no sockets and no stored data they are simply evicted
// and cost nothing. This exists for the case that *does* cost: a host tab left
// open for days, whose heartbeats keep waking the object forever.
const IDLE_MS = 30 * 60 * 1000;

// Close codes (4000+ is the application-defined range)
const CLOSE_ROOM_TAKEN = 4001;
const CLOSE_NO_HOST    = 4002;
const CLOSE_ROOM_FULL  = 4003;
const CLOSE_BAD_FRAME  = 4004;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response('ok', { headers: { 'Cache-Control': 'no-store' } });
    }

    // /room/<gameId>/<CODE>
    const m = url.pathname.match(/^\/room\/([a-z0-9_-]{1,24})\/([A-Za-z0-9]{1,12})$/i);
    if (!m) return new Response('not found', { status: 404 });

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }

    const gameId = m[1].toLowerCase();
    const code   = m[2].toUpperCase();
    const id     = env.ROOMS.idFromName(`${gameId}:${code}`);
    return env.ROOMS.get(id).fetch(request);
  },
};

export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  // Hibernation means this object can be evicted between messages, so socket
  // metadata lives on the sockets themselves rather than in instance fields.
  meta(ws) {
    try { return ws.deserializeAttachment() || {}; } catch { return {}; }
  }
  sockets() {
    return this.state.getWebSockets().map(ws => ({ ws, ...this.meta(ws) }));
  }
  hostSocket() {
    return this.sockets().find(s => s.role === 'host') || null;
  }

  // Records activity and keeps the idle alarm armed. The timestamp is persisted
  // at most once a minute: the alarm has to survive hibernation, but writing on
  // every message would be pure waste.
  async touch() {
    this.last = Date.now();
    if (!this.lastPersist || this.last - this.lastPersist > 60_000) {
      this.lastPersist = this.last;
      await this.state.storage.put('last', this.last);
    }
    if (!this.alarmArmed) {
      this.alarmArmed = true;
      await this.state.storage.setAlarm(Date.now() + IDLE_MS);
    }
  }

  async alarm() {
    this.alarmArmed = false;
    const sockets = this.state.getWebSockets();
    if (!sockets.length) { await this.state.storage.deleteAll(); return; }

    const last = (await this.state.storage.get('last')) || 0;
    const idle = Date.now() - last;
    if (idle >= IDLE_MS) {
      for (const ws of sockets) { try { ws.close(1000, 'room idle'); } catch {} }
      await this.state.storage.deleteAll();
      return;
    }
    // Still busy — check back when it *could* next go idle.
    this.alarmArmed = true;
    await this.state.storage.setAlarm(Date.now() + (IDLE_MS - idle));
  }

  async fetch(request) {
    const url  = new URL(request.url);
    const role = url.searchParams.get('role') === 'host' ? 'host' : 'client';

    const existing = this.sockets();
    const host = existing.find(s => s.role === 'host');

    const pair = new WebSocketPair();
    const [clientEnd, serverEnd] = Object.values(pair);

    await this.touch();

    if (role === 'host') {
      // One host per code. The client library retries with a fresh code, which
      // is how a code collision resolves.
      if (host) {
        serverEnd.accept();
        serverEnd.close(CLOSE_ROOM_TAKEN, 'room code in use');
        return new Response(null, { status: 101, webSocket: clientEnd });
      }
      this.state.acceptWebSocket(serverEnd);
      serverEnd.serializeAttachment({ role: 'host', id: 0 });
      return new Response(null, { status: 101, webSocket: clientEnd });
    }

    // Joining as a client requires a live host, otherwise the code is dead.
    if (!host) {
      serverEnd.accept();
      serverEnd.close(CLOSE_NO_HOST, 'no host for that code');
      return new Response(null, { status: 101, webSocket: clientEnd });
    }
    if (existing.filter(s => s.role === 'client').length >= MAX_CLIENTS) {
      serverEnd.accept();
      serverEnd.close(CLOSE_ROOM_FULL, 'room full');
      return new Response(null, { status: 101, webSocket: clientEnd });
    }

    // Monotonic per-room connection id. Derived from the high-water mark stored
    // on the host socket so it survives hibernation and never reuses an id.
    const hostMeta = this.meta(host.ws);
    const nextId = (hostMeta.nextId || 1);
    host.ws.serializeAttachment({ ...hostMeta, nextId: nextId + 1 });

    this.state.acceptWebSocket(serverEnd);
    serverEnd.serializeAttachment({ role: 'client', id: nextId });
    this.send(host.ws, { t: 'open', id: nextId });

    return new Response(null, { status: 101, webSocket: clientEnd });
  }

  send(ws, obj) {
    try { ws.send(JSON.stringify(obj)); } catch {}
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string') return;                     // no binary frames
    if (raw.length > MAX_FRAME_BYTES) {
      try { ws.close(CLOSE_BAD_FRAME, 'frame too large'); } catch {}
      return;
    }
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }         // ignore garbage
    if (!msg || typeof msg !== 'object') return;

    await this.touch();

    const me = this.meta(ws);

    if (me.role === 'host') {
      // The host has no socket of its own to a client, so evicting one has to
      // come through here.
      if (msg.t === 'kick') {
        const victim = this.sockets().find(s => s.role === 'client' && s.id === msg.id);
        if (victim) try { victim.ws.close(1000, 'kicked'); } catch {}
        return;
      }
      const to = msg.to;
      if (to === '*') {
        for (const s of this.sockets()) if (s.role === 'client') this.send(s.ws, { d: msg.d });
        return;
      }
      const target = this.sockets().find(s => s.role === 'client' && s.id === to);
      if (target) this.send(target.ws, { d: msg.d });
      return;
    }

    // Client: `to` is ignored on purpose — clients may only reach the host.
    const host = this.hostSocket();
    if (host) this.send(host.ws, { from: me.id, d: msg.d });
  }

  async webSocketClose(ws) { this.onGone(ws); }
  async webSocketError(ws) { this.onGone(ws); }

  async onGone(ws) {
    const me = this.meta(ws);
    // Once the room is empty there is nothing to keep: clearing storage lets the
    // object be evicted cleanly rather than lingering with an armed alarm.
    const remaining = this.state.getWebSockets().filter(s => s !== ws);
    if (!remaining.length) {
      try { await this.state.storage.deleteAll(); } catch {}
      this.alarmArmed = false;
    }
    if (me.role === 'host') {
      // The room dies with its host — tell everyone so they can surface it
      // rather than sitting in a silent lobby.
      for (const s of this.sockets()) {
        if (s.role !== 'client') continue;
        this.send(s.ws, { t: 'hostgone' });
        try { s.ws.close(1000, 'host left'); } catch {}
      }
      return;
    }
    const host = this.hostSocket();
    if (host) this.send(host.ws, { t: 'close', id: me.id });
  }
}
