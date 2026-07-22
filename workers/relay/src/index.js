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
//
// INVARIANT — this Worker must never read, log or store a player's IP address.
// Hiding addresses from other players is the entire reason the transport is a
// relay instead of WebRTC. Cloudflare necessarily sees the connection, but
// nothing here should put an address anywhere we control: no CF-Connecting-IP,
// no IP column in the lobby table, no console.log of request metadata. The only
// request header read is the WebSocket Upgrade check.
// ─────────────────────────────────────────────────────────────────────────────

import { cleanName, nameKey, validateUsername, hashToken } from './names.js';

const MAX_FRAME_BYTES = 96 * 1024;   // generous vs the host's own 24KB cmd cap,
                                     // because host→client state can be large
const MAX_CLIENTS = 16;              // hard ceiling; the host enforces its own

// A room with no traffic for this long is closed out. Durable Objects don't
// need destroying — with no sockets and no stored data they are simply evicted
// and cost nothing. This exists for the case that *does* cost: a host tab left
// open for days, whose heartbeats keep waking the object forever.
const IDLE_MS = 30 * 60 * 1000;

// Listings expire rather than persist. A room refreshes its row while it is
// alive, so anything that stops checking in — closed tab, frozen phone, a DO
// evicted mid-crash — drops out of the directory within LOBBY_TTL_MS on its
// own. That is cheaper and more reliable than trying to detect every way a
// host can vanish.
const LOBBY_TTL_MS = 2 * 60 * 1000;        // hidden from listings after this
const LOBBY_REFRESH_MS = 45 * 1000;        // how often a live room rewrites its row
const LOBBY_SWEEP_MS = 10 * 60 * 1000;     // cron deletes rows older than this

// Close codes (4000+ is the application-defined range). The client library
// mirrors these in games/net/p2p.js — a host retries with a fresh code on
// ROOM_TAKEN, so losing these to a bad refactor silently breaks hosting.
const CLOSE_ROOM_TAKEN = 4001;
const CLOSE_NO_HOST    = 4002;
const CLOSE_ROOM_FULL  = 4003;
const CLOSE_BAD_FRAME  = 4004;

export default {
  // Expired listings are hidden on read; this stops the table growing forever
  // with rows whose Durable Object died before it could delete them.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      env.DB.prepare('DELETE FROM lobbies WHERE updated_at < ?')
        .bind(Date.now() - LOBBY_SWEEP_MS).run().catch(() => {})
    );
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response('ok', { headers: { 'Cache-Control': 'no-store' } });
    }

    // Claim or re-verify a site username. First come, bound to a token the
    // browser generates and keeps; the token itself is never stored, only its
    // hash. This is not authentication — it exists so abuse controls have
    // something durable to attach to that is not an IP address.
    if (url.pathname === '/username') {
      const cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      };
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      if (request.method !== 'POST') return new Response('{"error":"method"}', { status: 405, headers: cors });

      let body;
      try { body = await request.json(); } catch { body = null; }
      const token = body && typeof body.token === 'string' ? body.token : '';
      if (!body || token.length < 16) {
        return new Response(JSON.stringify({ ok: false, error: 'Missing token' }), { status: 400, headers: cors });
      }
      const v = validateUsername(body.name);
      if (!v.ok) return new Response(JSON.stringify({ ok: false, error: v.error }), { status: 400, headers: cors });

      try {
        const hash = await hashToken(token);
        const now = Date.now();
        const row = await env.DB.prepare('SELECT name, token_hash FROM usernames WHERE name_key = ?')
          .bind(v.key).first();

        if (row) {
          // Taken. Only the holder of the original token may keep using it.
          if (row.token_hash !== hash) {
            return new Response(JSON.stringify({ ok: false, error: 'That username is taken' }), { status: 409, headers: cors });
          }
          await env.DB.prepare('UPDATE usernames SET name = ?, last_seen = ? WHERE name_key = ?')
            .bind(v.name, now, v.key).run();
          return new Response(JSON.stringify({ ok: true, name: v.name, key: v.key }), { headers: cors });
        }

        await env.DB.prepare(
          'INSERT INTO usernames (name_key, name, token_hash, created_at, last_seen) VALUES (?, ?, ?, ?, ?)'
        ).bind(v.key, v.name, hash, now, now).run();
        return new Response(JSON.stringify({ ok: true, name: v.name, key: v.key }), { headers: cors });
      } catch (e) {
        // Losing a race to the same name lands here via the PK constraint.
        return new Response(JSON.stringify({ ok: false, error: 'That username is taken' }), { status: 409, headers: cors });
      }
    }

    // ── daily leaderboard ────────────────────────────────────────────────
    // GET  /scores?game=pool&day=YYYY-MM-DD   → today's board
    // POST /scores {game, day, score, detail, name, token}
    //
    // Scores cannot be verified — the game runs in the browser and no server
    // sees it played. What this does enforce: you must hold the username you
    // post under, one entry per person per game per day, and the value has to
    // be inside the range the game can actually produce. The UI labels the
    // board unverified rather than implying more than that.
    if (url.pathname === '/scores') {
      const cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      };
      const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

      const GAMES = {
        // min/max are the plausible range for a completed daily round; anything
        // outside is a typo or a forgery and is refused outright.
        pool:     { min: 1, max: 200 },
        minigolf: { min: 1, max: 200 },
      };

      if (request.method === 'GET') {
        const game = url.searchParams.get('game');
        const day  = url.searchParams.get('day');
        if (!GAMES[game] || !/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return reply({ error: 'bad request' }, 400);
        try {
          const { results } = await env.DB.prepare(
            'SELECT name, score, detail, updated_at FROM scores WHERE game = ? AND day = ? ORDER BY score ASC, updated_at ASC LIMIT 50'
          ).bind(game, day).all();
          return reply({ scores: results || [] });
        } catch {
          return reply({ scores: [], error: 'unavailable' });
        }
      }

      if (request.method !== 'POST') return reply({ error: 'method' }, 405);

      let body;
      try { body = await request.json(); } catch { body = null; }
      if (!body) return reply({ error: 'bad request' }, 400);
      const spec = GAMES[body.game];
      if (!spec) return reply({ error: 'unknown game' }, 400);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.day || ''))) return reply({ error: 'bad day' }, 400);
      const score = Number(body.score);
      if (!Number.isInteger(score) || score < spec.min || score > spec.max) {
        return reply({ error: 'score out of range' }, 400);
      }
      // Only today's and yesterday's boards accept writes, so old days can't be
      // back-filled once they've stopped being visible.
      const today = new Date().toISOString().slice(0, 10);
      const yday  = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      if (body.day !== today && body.day !== yday) return reply({ error: 'that day is closed' }, 400);

      const token = typeof body.token === 'string' ? body.token : '';
      if (token.length < 16) return reply({ error: 'Set a username to post a score' }, 400);
      try {
        const key = nameKey(body.name);
        const row = await env.DB.prepare('SELECT name, token_hash FROM usernames WHERE name_key = ?').bind(key).first();
        if (!row || row.token_hash !== (await hashToken(token))) {
          return reply({ error: 'Set a username to post a score' }, 403);
        }
        const detail = cleanName(body.detail, '').slice(0, 40);
        const now = Date.now();
        // Keep the best score for the day rather than the latest.
        await env.DB.prepare(
          `INSERT INTO scores (id, game, day, name_key, name, score, detail, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             score = MIN(scores.score, excluded.score),
             detail = CASE WHEN excluded.score < scores.score THEN excluded.detail ELSE scores.detail END,
             name = excluded.name,
             updated_at = excluded.updated_at`
        ).bind(`${body.game}:${body.day}:${key}`, body.game, body.day, key, row.name, score, detail, now, now).run();
        return reply({ ok: true });
      } catch {
        return reply({ error: 'unavailable' }, 500);
      }
    }

    // Public directory of open lobbies. Read-only: rooms publish themselves
    // from the Durable Object, so there is no client-writable path here.
    if (url.pathname === '/lobbies') {
      const cors = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      };
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      if (request.method !== 'GET') return new Response('{"error":"method"}', { status: 405, headers: cors });
      try {
        const game = url.searchParams.get('game');
        const fresh = Date.now() - LOBBY_TTL_MS;
        const sql = game
          ? 'SELECT game, code, host_name, players, max_players, has_password, created_at FROM lobbies WHERE game = ? AND updated_at > ? ORDER BY updated_at DESC LIMIT 100'
          : 'SELECT game, code, host_name, players, max_players, has_password, created_at FROM lobbies WHERE updated_at > ? ORDER BY updated_at DESC LIMIT 100';
        const stmt = game ? env.DB.prepare(sql).bind(game, fresh) : env.DB.prepare(sql).bind(fresh);
        const { results } = await stmt.all();
        return new Response(JSON.stringify({ lobbies: results || [] }), { headers: cors });
      } catch (e) {
        // A directory outage must not take multiplayer with it — join-by-code
        // keeps working regardless.
        return new Response(JSON.stringify({ lobbies: [], error: 'unavailable' }), { status: 200, headers: cors });
      }
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
    // Refresh the listing so it outlives its TTL, but far less often than
    // messages arrive — D1's free tier budgets writes per day, not per second.
    if (!this.lastPublish || this.last - this.lastPublish > LOBBY_REFRESH_MS) {
      await this.publish();
    }
  }

  async alarm() {
    this.alarmArmed = false;
    const sockets = this.state.getWebSockets();
    if (!sockets.length) { await this.state.storage.deleteAll(); return; }

    const last = (await this.state.storage.get('last')) || 0;
    const idle = Date.now() - last;
    if (idle >= IDLE_MS) {
      await this.retract();
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

    // Reject synchronously. A deferred close does not survive here: with no
    // hibernatable socket registered the object finalizes as soon as fetch
    // returns, the timer never fires, and the client sees a bare 1006 instead
    // of the reason. Crucially there must be no awaited work before this — the
    // close code is lost if the handshake is still settling.
    const reject = (code, reason) => {
      serverEnd.accept();
      serverEnd.close(code, reason);
      return new Response(null, { status: 101, webSocket: clientEnd });
    };

    if (role === 'host') {
      // One host per code. The client library retries with a fresh code, which
      // is how a code collision resolves.
      if (host) {
        return reject(CLOSE_ROOM_TAKEN, 'room code in use');
      }
      this.state.acceptWebSocket(serverEnd);
      // Listing publicly requires a claimed username. Verified here rather than
      // trusted from the client, and a failure only costs the listing — the
      // room itself still works as an unlisted join-by-code game.
      let open = url.searchParams.get('open') === '1';
      let hostKey = null;
      let hostName = cleanName(url.searchParams.get('name'), 'Host');
      if (open) {
        const verified = await this.verifyUser(url.searchParams.get('u'), url.searchParams.get('t'));
        if (verified) { hostKey = verified.key; hostName = verified.name; }
        else open = false;
      }
      serverEnd.serializeAttachment({
        role: 'host', id: 0,
        open, hostKey,
        game: this.gameOf(url),
        code: this.codeOf(url),
        hostName,
        maxPlayers: Math.max(2, Math.min(16, Number(url.searchParams.get('max')) || 8)),
        hasPassword: url.searchParams.get('pw') === '1',
      });
      if (open) await this.publish();
      else if (url.searchParams.get('open') === '1') this.send(serverEnd, { t: 'unlisted' });
      return new Response(null, { status: 101, webSocket: clientEnd });
    }

    // Joining as a client requires a live host, otherwise the code is dead.
    if (!host) {
      return reject(CLOSE_NO_HOST, 'no host for that code');
    }
    if (existing.filter(s => s.role === 'client').length >= MAX_CLIENTS) {
      return reject(CLOSE_ROOM_FULL, 'room full');
    }

    await this.touch();

    // Monotonic per-room connection id. Derived from the high-water mark stored
    // on the host socket so it survives hibernation and never reuses an id.
    const hostMeta = this.meta(host.ws);
    const nextId = (hostMeta.nextId || 1);
    host.ws.serializeAttachment({ ...hostMeta, nextId: nextId + 1 });

    this.state.acceptWebSocket(serverEnd);
    serverEnd.serializeAttachment({ role: 'client', id: nextId });
    this.send(host.ws, { t: 'open', id: nextId });
    await this.publish();   // player count changed

    return new Response(null, { status: 101, webSocket: clientEnd });
  }

  gameOf(url) { const m = url.pathname.match(/^\/room\/([^/]+)\//); return m ? m[1].toLowerCase() : ''; }
  codeOf(url) { const m = url.pathname.match(/\/([^/]+)$/);            return m ? m[1].toUpperCase() : ''; }

  // Writes this room into the public directory. Called on host connect and
  // whenever the player count changes — never on every message, since D1's free
  // tier budgets writes per day.
  // `leaving` is the socket currently closing: webSocketClose fires while it is
  // still in getWebSockets(), so counting it would report a player who has gone.
  // Confirms the name is claimed by the holder of this token.
  async verifyUser(name, token) {
    if (!name || !token || String(token).length < 16) return null;
    try {
      const key = nameKey(name);
      if (key.length < 3) return null;
      const row = await this.env.DB.prepare('SELECT name, token_hash FROM usernames WHERE name_key = ?')
        .bind(key).first();
      if (!row) return null;
      const hash = await hashToken(String(token));
      if (row.token_hash !== hash) return null;
      return { key, name: row.name };
    } catch { return null; }
  }

  async publish(leaving = null) {
    const host = this.hostSocket();
    if (!host) return;
    const m = this.meta(host.ws);
    if (!m.open || !m.game || !m.code) return;
    const players = 1 + this.sockets().filter(s => s.role === 'client' && s.ws !== leaving).length;
    const now = Date.now();
    this.lastPublish = now;
    try {
      // One live listing per username — claiming a second room retires the
      // first, so the directory cannot be flooded from one account.
      if (m.hostKey) {
        await this.env.DB.prepare('DELETE FROM lobbies WHERE host_key = ? AND id != ?')
          .bind(m.hostKey, `${m.game}:${m.code}`).run();
      }
      await this.env.DB.prepare(
        `INSERT INTO lobbies (id, game, code, host_name, players, max_players, has_password, created_at, updated_at, host_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           host_name = excluded.host_name,
           players = excluded.players,
           max_players = excluded.max_players,
           has_password = excluded.has_password,
           updated_at = excluded.updated_at,
           host_key = excluded.host_key`
      ).bind(`${m.game}:${m.code}`, m.game, m.code, m.hostName || 'Host',
             players, m.maxPlayers || 8, m.hasPassword ? 1 : 0, now, now, m.hostKey || null).run();
    } catch {}   // the directory is best-effort; the room plays on without it
  }

  async retract() {
    const host = this.hostSocket();
    const m = host ? this.meta(host.ws) : (this.lastListing || {});
    if (!m.game || !m.code) return;
    try {
      await this.env.DB.prepare('DELETE FROM lobbies WHERE id = ?').bind(`${m.game}:${m.code}`).run();
    } catch {}
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
      // Remember the listing key: once the socket is gone we can no longer read
      // it back off the host to delete the row.
      this.lastListing = { game: me.game, code: me.code };
      await this.retract();
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
    await this.publish(ws);   // player count changed
  }
}
