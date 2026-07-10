# Multiplayer netcode (`games/net/`)

Peer-to-peer multiplayer for the games, running on a **static site** (no backend of
our own). WebRTC data channels carry the traffic; the free public **PeerJS** broker
does only the initial signaling handshake. Discovery is **join-by-code / share-link**
— there is no public lobby list and no server that holds game state.

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
| Wrong password / room full | **Yes** | Enforced host-side over the DTLS-encrypted data channel (the broker never sees the password). |
| Malicious **host** (sees hidden info, edits state) | **No — impossible in P2P** | The host *is* the server. Mitigation is social: host = whoever players trust. |
| Fully modified client that still sends only *legal* commands | **No** | Indistinguishable from honest play. Out of scope for P2P. |
| **IP-address leakage** to other peers (WebRTC ICE) | **Opt-in** | Off by default (peers learn each other's IPs). The lobby's **"Hide my IP"** toggle forces a TURN relay so no direct connection happens. See "Privacy" below. |

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

### Privacy (IP leakage) mitigation
WebRTC exposes peers' IPs to each other by default. The lobby now has a **"Hide my
IP"** checkbox (both Host and Join). It sets `relayOnly`, which forces
`iceTransportPolicy: 'relay'` in `p2p.js` — all traffic goes through a **TURN relay**
so no direct peer connection (and no IP exchange) ever happens.

Two things to know:
- **Both players must enable it.** If only one side is relay-only, the *other* side
  still offers its direct (host) candidate and reveals its IP. To hide both IPs, both
  toggle it on.
- The default TURN server is the free, no-signup **Open Relay (Metered)** project
  (`DEFAULT_ICE` in `p2p.js`). It's rate-limited and can be flaky, so relay mode may
  be slow or fail to connect. For reliable relaying, drop your own TURN credentials
  into `DEFAULT_ICE` (metered.ca has a free tier, or self-host coturn) — or pass
  `iceServers` through `hostRoom`/`joinRoom`.

For friends-only play the default (direct, no relay) is fine and fastest.

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
Real verification needs **two browsers** (or two tabs / a phone + laptop): open
`games/index.html`, Host from one, copy the code/link, Join from the other. There is
no way to exercise a live WebRTC connection headlessly, so automated checks here are
syntax + logic only.
