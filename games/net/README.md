# Multiplayer netcode (`games/net/`)

Host-authoritative multiplayer for the games. The site itself stays static; the
only backend is a **relay Worker** (`workers/relay/`) that forwards messages
between players. Discovery is **join-by-code / share-link** — there is no public
lobby list, and the relay holds no game state.

The transport used to be WebRTC data channels over the public PeerJS broker.
That was replaced because WebRTC necessarily reveals players' IP addresses to
each other (see "Privacy" below). Everyone now holds one WebSocket to the relay
instead, so no peer-to-peer connection exists to leak an address. The topology,
the trust model and the whole `p2p.js` API are otherwise unchanged — only the
pipe underneath is different.

- `p2p.js` — the netcode core. Host-authoritative star topology, join-by-code,
  password gate, per-command validation, rate limiting, message size caps, roster
  and disconnect handling. Game-agnostic.
- `lobby.js` — a drop-in connect/lobby overlay (Host / Join-by-code UI, password
  toggle, share link, roster, "Start"). Injects its own CSS.
- Integrated: **Darts** (`games/darts.html`, online 301) and **Daily Break**
  (`games/pool.html`, online 8-ball), both stable. **Frontline** (`rts.html`) has an
  experimental, not-yet-live-tested foundation (host + one remote commander).

The games index (`games/index.html`) shows a **Play together** hub built from any
catalog entry with an `mp` field (`data/games.js`); each tile links to the game with
`?mp=host` / `?mp=join`, which boots it straight into the lobby overlay.

---

## Threat model — read this before trusting it

**A pure-P2P browser game cannot be made cheat-proof.** The client is public JS that
anyone can read and modify. What this code *does* buy you:

| Attack | Handled? | How |
| --- | --- | --- |
| Malicious **client** sends illegal commands (free units, wrong turn, teleport) | **Yes** | Host is authoritative. Every command runs through `hooks.validate` before it can touch state. Reject-don't-apply. |
| Client floods the host tab (DoS) | **Yes** | Per-client token-bucket rate limit + `MAX_MSG_BYTES` size cap + strike/kick. |
| Malformed / garbage messages | **Yes** | Shape-checked and size-capped; parse failures are ignored, never crash the sim. |
| Wrong password / room full | **Yes** | Enforced host-side. The relay forwards bytes it does not interpret, so it never sees the password and a client cannot bypass the check. |
| Malicious **host** (sees hidden info, edits state) | **No — impossible in P2P** | The host *is* the server. Mitigation is social: host = whoever players trust. |
| Fully modified client that still sends only *legal* commands | **No** | Indistinguishable from honest play. Out of scope for P2P. |
| **IP-address leakage** to other peers | **Yes, structurally** | There is no peer-to-peer connection at all. Everyone holds a WebSocket to the relay Worker, so peers have no way to learn each other's addresses and there is no setting to get wrong. See "Privacy" below. |

The realistic goal is: block casual cheating and griefing, keep the host tab alive,
and don't pretend the password is real security — it's an "unlisted / friends-only"
gate. Don't open a **public** game to strangers you wouldn't share your IP with.

### The one rule when integrating
**The host must validate every command — never blindly apply what a client sends.**
`hooks.validate(player, cmd)` returns `false` to reject, `true` to accept as-is, or a
**sanitized command object** to apply instead of the raw one (clamp numbers, drop
extra fields). This is where you enforce turn order, unit ownership, resource costs,
cooldowns, and legal targets.

### How messages are sanitized (both directions)
**Client → host (untrusted, fully checked in `p2p.js` `handleClientData`):**
1. **Size cap** — anything over `MAX_MSG_BYTES` (24 KB) is dropped + striked.
2. **Shape check** — must be an object with a string `type`; else dropped.
3. **Handshake gate** — no `cmd` is processed before a valid `hello`/`welcome`.
4. **Rate limit** — a per-client token bucket drops commands over `cmdsPerSec`.
5. **Game validation** — `hooks.validate(player, cmd)` must return a value; it
   returns a **sanitized copy** (coerced numbers, clamped ranges, whitelisted
   fields) that is applied *instead of* the raw message. The raw client object is
   never trusted directly. Repeated failures trip a strike counter → kick.

**Host → client (trusted by design):** the host *is* the authority, so clients
apply its `state`/`event` messages without re-validation — they do a light shape
check (`typeof data.type === 'string'`) and coerce fields, but a malicious host is
out of scope for P2P (see the table above). Host→client messages are **not**
size-capped, which is why the host can send the large one-time Frontline init.

### Privacy (IP leakage)
**Peers never connect to each other, so they never learn each other's IPs.**

This used to be a WebRTC concern: ICE negotiation hands peers your address in
order to find a direct route, and the only mitigation was to force a TURN relay
via a "Hide my IP" toggle. That had two problems — it was opt-in, and it only
worked if *both* sides enabled it, since one direct candidate is enough to leak.

The transport is now a **WebSocket relay** (`workers/relay/`): everyone holds one
socket to a Cloudflare Worker which forwards messages between them. There is no
peer connection to leak an address, and no setting to get wrong. The toggle is
gone because it no longer describes anything optional.

What this trades away:
- **The relay operator can see traffic.** It is transport-encrypted (`wss`) but
  not end-to-end encrypted, so Cloudflare — and whoever deploys the Worker — is
  in the path. A malicious *host* was already able to see everything, so this
  does not change the game-integrity model, but it is worth stating.
- **A little latency**, since every message takes two hops instead of one.
- **A dependency.** If the relay is down or over its daily free-tier cap,
  multiplayer stops. There is no direct-connection fallback by design: falling
  back would silently reintroduce the exact leak this removes.

---

## Open lobbies

Rooms are unlisted by default. `hostRoom({ open: true })` publishes one to a
public directory that `listLobbies(gameId)` reads back, and the lobby UI shows
under "Open games" on the Join tab.

**The Durable Object writes the directory, not the browser.** The DO is the only
party that actually knows a room exists and how many players are in it, so a
client cannot advertise a room that isn't there, inflate a player count, or keep
a dead room listed. Rows are written on host connect and on every membership
change — never per message, since D1's free tier budgets writes per day — and
deleted when the host leaves or the room is reaped.

The table carries **no IP column and never should**. Hiding addresses is the
reason the transport is a relay at all; a public directory keyed by address
would hand straight back what that bought. The Worker does not read
`CF-Connecting-IP` anywhere, and the only request header it touches is the
WebSocket `Upgrade` check — there is a comment saying so at the top of
`workers/relay/src/index.js`.

### Site usernames
Listing publicly requires a claimed username; hosting privately and joining by
code never ask for one. A name is claimed first-come and bound to a random token
the browser generates — the server stores only the token's **hash**, never the
token. Re-using the name from another browser returns 409.

This is friction, not authentication: anyone can abandon a username and claim
another. The point is to give abuse controls something durable to attach to that
**is not an IP address**, since hiding addresses is why the transport relays at
all. One live listing per username, so the directory can't be flooded from a
single account. The listed name is the *verified* username, so a host cannot
advertise itself as someone else.

Names are screened server-side with [obscenity](https://github.com/jo3-l/obscenity)
(MIT), which catches obfuscation a plain wordlist misses — `fuuuuck`, `sh1t`,
`ʃṳ𝒸𝗄` — while its whitelist clears `Scunthorpe`, `assassin` and `classic`. It
does flag genuine names like **Penistone**, so `names.js` keeps a small
allowlist of real places and surnames, compared against the whole name only.
Control, zero-width and bidi-override characters are stripped and the result
capped at 24. Uniqueness folds confusable digits, so `J0sh` can't be claimed
next to `Josh`.

### Listing lifetime
Listings **expire rather than persist**. A live room rewrites its row every
~45s and listings are hidden after `LOBBY_TTL_MS` (2 min), so anything that
stops checking in — closed tab, frozen phone, a DO evicted mid-crash — drops out
on its own. A clean host disconnect retracts immediately; a cron job sweeps rows
older than 10 minutes so the table doesn't grow. Refreshing on a timer rather
than per message keeps this inside D1's daily write budget.

The directory is best-effort: if D1 is unavailable the endpoint returns an empty
list rather than an error, and join-by-code is unaffected.

---

## Reconnection

A WebSocket to the edge drops for all the usual reasons (a phone changing
networks, a laptop sleeping, a flaky AP). Rather than end the game, **both roles
transparently reconnect** — no game code changes; the same controller stays valid
and state keeps flowing. A shared "Reconnecting…" banner shows automatically, and
`hooks.onNetStatus('reconnecting' | 'online')` is available for custom UI.

- **A client** that drops reopens the socket and re-`hello`s with the **resume
  token** the host handed it at welcome. The host maps it back to the *same*
  player slot (the relay assigns a fresh connection id on reconnect, so seat
  identity is the token, not the id). Its game just receives a fresh snapshot.
  The host holds a dropped seat for `CLIENT_GRACE_MS` (60s) before it gives up
  and fires `onLeave`; the client keeps trying for `CLIENT_RECONNECT_MS` (50s).
- **A host** that drops reopens the *same room code*, proving itself with a
  **host token** it minted (`ht=` on the handshake). The relay keeps the room —
  and its still-connected clients — alive for `HOST_GRACE_MS` (45s) instead of
  tearing everything down, telling clients to wait (`hostwait` → banner) and
  handing the room back (`hostback`) when the host returns. Only the original
  token holder can retake a room in its grace window, so a hostless code can't be
  hijacked. The host re-pushes state to resync everyone.
- **Intentional leaves are not drops.** `net.close()` sends an explicit `bye`
  so the relay ends the room (host) or frees the seat (client) *immediately*,
  instead of parking the other side in the reconnect grace window. Backgrounding
  a tab or refreshing is treated as a drop, so a quick return resumes the game.

None of this changes the trust model: the host is still the sole authority, and
the resume/host tokens are client-held secrets the relay only matches, never
stores in a way that identifies a player.

---

## Integration guide

```js
import { openLobby } from './net/lobby.js';

openLobby({
  gameId: 'darts', gameName: 'Darts · 301',
  maxPlayers: 2, minPlayers: 2,
  hostHooks:   { validate, onCommand, snapshot, onJoin, onLeave },
  clientHooks: { onState, onEvent, onRoster, onKicked, onClose },
  onBegin({ role, net, roster }) { /* role 'host'|'client'; wire net and run */ },
});
```

- **`net`** is a `HostController` or `ClientController`. Host: `pushState()`,
  `broadcast(evt)`, `send(id, evt)`, `kick(id)`, `players()`, `close()`, `code`,
  `link`. Client: `sendCmd(cmd)`, `me`, `roster`, `close()`.
- Player ids: **host is always `0`**, guests are `1, 2, …` in join order.
- **Authoritative loop:** guests call `net.sendCmd(intent)`. Host runs `validate`
  then `onCommand`, mutates its sim, and calls `net.pushState()` (which calls your
  `snapshot(player)` per client). Guests receive it in `clientHooks.onState`.
- Use `broadcast`/`onEvent` for one-off, non-state visuals (a hit flash, a sound).

### How Darts does it (reference)
Each player throws with their own webcam. Only the **landing position** `{bx,by}`
crosses the wire (`darts.html` → `submitOnlineThrow`). The host re-derives the score
with its own `scoreDart()` (never trusts a claimed score), applies bust/turn/win
rules in `hostApplyThrow`, broadcasts the scoreboard via `snapshot`, and broadcasts a
`dart` event so every client renders the mark + flash. Turn order is enforced in
`onlineValidate` (`player.id !== currPlayer → reject`).

---

## Plugging in the other games

### Daily Break (pool) — DONE (turn-based, host simulates physics)
Implemented in `games/pool.html` (search `ONLINE 8-BALL`). How it works:
- The host owns the authoritative `game` + `balls` + `resolveClassic`. Guest (seat 1)
  sends `{ k:'shot', dir, power, spin }` — plus `cue:{x,y}` when it had ball-in-hand
  and `call` when calling the 8. It never simulates authoritatively.
- Host `validate` (`poolValidate`) rejects anything that isn't a legal shot from the
  player whose turn it is; clamps `power`∈[0.02,1] and `spin` to ±1; only accepts a
  cue reposition when that seat was actually granted ball-in-hand (`hostBihSeat`).
- Host broadcasts a `playShot` event (pre-shot snapshot + params) so guests **replay
  the shot cosmetically**, runs the real sim itself, then `pushState`s the
  authoritative result. Guests defer incoming state until their replay ends
  (`pendingOnlineState`) and snap to it — so cross-machine float drift is corrected.
- Whose-turn input is handed to the guest via a `yourTurn` event; game-over via `over`.

### Frontline (RTS) — EXPERIMENTAL foundation, real-time, host-authoritative
Implemented in `games/rts.html` (search `ONLINE MULTIPLAYER`). All online code is
gated behind `rtsOnline` so single-player is completely untouched. Status: a working
foundation for **host + one remote commander** (`maxPlayers:6` is set, but only the
core loop is wired). It has **not** been live-tested end-to-end.

**Match setup:** after the lobby, the host goes through the normal **setup screen**
(`rtsBeginHostSetup`) — teams, per-bot difficulty, map style/size, terrain, gold,
troop cap — with the connected guests pinned to their slots (shown as "network"
players). So a guest can be **teamed with allied bots**, and since comms/pings are
networked (`{k:'ping'}` → `sendSuggestionForPlayer`, which routes only to AI allies),
each human can direct their own bot allies (attack/defend/gather/rally). Bot vs
guest slots are decided at start; empty slots are AI.

How it works:
- The host runs the entire sim (bots included) authoritatively. Each guest takes a
  commander slot (p2p id === commander id); its AI is nulled so the human drives it
  (the `botCommander`/ally-AI loops now skip `!p.ai` slots). Its **engineers still
  auto-gather** (that path keys off `!p.human`, not the AI), so economy works even
  without micro. On a guest drop, `rtsHostLeave` hands the slot back to a bot.
- The map is generated with `Math.random()` (not seedable), so the host sends the
  full initial state **once** — including the baked terrain as a `mapCanvas` WebP
  data-URL the guest blits onto its own `mapCanvas` — then streams `rtsSnapshot`
  (units/players/deposits/constructions/projectiles) at ~11 Hz via `pushState`.
- The guest is a **thin client**: `loop()` skips `update()` for guests, so they never
  simulate — they just render the latest snapshot with the real renderer. (`loop()`
  already try/catches `update`/`render`, so a malformed snapshot can't hard-crash.)
- Guest intents (all sanitized by `rtsValidate`, then re-checked for ownership/team/
  gold/building-owner in the matching `*ForPlayer`/`netApply*` handler):
  `move`, `attack`, `spawn`, `train` (produce at a building), `upgrade` (base `BUPG`
  research), `research` (`UPGD` combat tree at a building), `gather`/`assignMine`/
  `build`/`repair`/`returnGold` (engineer economy), `place` (construct a building),
  `buyAirstrike`/`airstrike`, `mortar`, `healzone`/`medicmode`, and `ping` (direct
  AI allies). The per-client rate limiter caps command spam.
- Guests **interpolate**: each snapshot sets an authoritative target and units glide
  toward it (exponential smoothing in `loop()`), smooth between ~11 Hz updates. The
  `upgradeQueue` is **owner-aware** (`owner` field) so a commander's research applies
  to their own player.

**Full commander parity:** every action a solo commander has is networked — including
mortar entrench/un-pit (`entrench`), hospital ward and per-mine profit upgrades
(`ward`/`mprofit`), cover targetable/deconstruct toggles (`coverTarget`/`coverDeco`),
and **per-commander mining zones** (`mzoneSet` — mine-zone painting was refactored from
a single human-only global to `mineZonesByOwner[pid]`, read via `zonesFor(p)` in
`bestDeposit`). The only things a guest can't do are host-machine conveniences
(pause/game-speed/dev-console), which are inherently local.

---

## Testing
Manual: open `games/index.html` in **two browsers** (or two tabs / a phone +
laptop), Host from one, copy the code or link, Join from the other.

Unlike the old WebRTC transport, this one **can** be exercised headlessly, which
is how the rewrite was verified end to end:

```sh
cd workers/relay && npx wrangler dev --local --port 8787   # real Durable Object
```

Then drive two browser pages against it with
`?relay=ws://127.0.0.1:8787`, calling `hostRoom` in one and `joinRoom` in the
other. Worth covering: wrong password, roster and initial snapshot, a legal
command, a sanitized command, a rejected command, a burst that trips the rate
limiter, broadcast vs targeted send, kick, and host-disconnect.

The relay itself is testable directly over plain WebSockets — duplicate host
rejection, joining a dead code, id assignment, and that a client cannot address
another client.
