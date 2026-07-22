# relay — WebSocket room relay

The multiplayer transport for the games. A Worker plus one Durable Object per
room; everyone holds a WebSocket to it and it forwards messages between them.

## Why it exists

WebRTC hands every peer your IP address during ICE negotiation — that is how it
finds a direct route between you. There is no way to use it peer-to-peer and not
reveal addresses; the only mitigation is to stop connecting peers directly and
relay instead.

The previous approach relayed via TURN, which works but bills egress. This
relays via a Worker instead, which sits inside the **Workers Free plan** — and
the free plan is a *hard cap*, not a bill: exceed it and requests fail, you are
never charged. That was the requirement.

It is deliberately a **dumb pipe**: rooms and routing, nothing else. It never
sees the room password and holds no game state, so the host browser stays the
only authority exactly as before. See `games/net/README.md` for the threat model.

## Deploy

```sh
cd workers/relay
npx wrangler deploy
```

Then set `RELAY_URL` in `games/net/p2p.js` to the `wss://` URL wrangler prints:

```js
const RELAY_URL = 'wss://joshgus-relay.<subdomain>.workers.dev';
```

Until that is set, multiplayer reports that it is not configured rather than
failing obscurely.

Check it: `curl https://<your-worker-url>/health` → `ok`.

## Local development

```sh
npx wrangler dev --local --port 8787
```

Then load any game with `?relay=ws://127.0.0.1:8787` to point the client at it
without editing the source — that override is how the automated tests run.

## Wire protocol

All JSON. The relay adds routing and nothing else.

| direction | frame | meaning |
| --- | --- | --- |
| client → relay | `{d}` | always forwarded to the host |
| host → relay | `{to:<id>\|"*", d}` | forwarded to one client, or all |
| host → relay | `{t:"kick", id}` | close that client's socket |
| relay → host | `{t:"open", id}` / `{t:"close", id}` | a client arrived / left |
| relay → host | `{from:<id>, d}` | a client's message |
| relay → client | `{d}` / `{t:"hostgone"}` | a host message / the room ended |

A client **cannot address another client**: the relay ignores `to` on client
frames and always routes to the host, so the star topology is enforced at the
edge rather than by convention.

Close codes: `4001` code already hosted (the client library retries with a new
code), `4002` no host for that code, `4003` room full, `4004` frame too large.

## Object lifecycle

Durable Objects are not resources you allocate and free. One is created on first
access to its name (`<gameId>:<CODE>`), and when its sockets are gone and it has
no stored data it is simply evicted. There is nothing to destroy.

Two things keep that true:

- **No durable storage in normal operation.** Socket metadata rides on the
  sockets via `serializeAttachment`, so it disappears with them. The only key
  ever written is an activity timestamp for the idle alarm, and it is deleted
  when the room empties.
- **An idle alarm reaps abandoned rooms.** The case that actually costs is a
  host tab left open for days: its heartbeats would keep waking the object
  forever. After `IDLE_MS` (30 min) of no traffic the room closes its sockets
  and clears storage.

Hibernation matters for the same reason. Sockets are accepted with
`state.acceptWebSocket()` rather than `ws.accept()`, so an idle room is evicted
from memory between messages and does not accrue duration. This is also why
`games/net/p2p.js` heartbeats every 20s rather than every 2.5s — each ping wakes
the object, and the free plan's daily budget is duration, not requests.

## Free plan budget

100,000 requests/day, 13,000 GB-s/day duration, 5 GB storage. Duration is the
binding one: a Durable Object bills at 128 MB, so 13,000 GB-s is roughly **28
object-hours of live room time per day**, shared across concurrent rooms. Ample
for friends-and-family play. Going over means new connections fail until the
window resets — never a charge.
