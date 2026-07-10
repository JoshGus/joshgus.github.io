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
- Reference integration: **Darts** (`games/darts.html`) — online 2-player 301.

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
| **IP-address leakage** to other peers (WebRTC ICE) | **No, by default** | Everyone who joins learns everyone's IP. See "Privacy" below. |

The realistic goal is: block casual cheating and griefing, keep the host tab alive,
and don't pretend the password is real security — it's an "unlisted / friends-only"
gate. Don't open a **public** game to strangers you wouldn't share your IP with.

### The one rule when integrating
**The host must validate every command — never blindly apply what a client sends.**
`hooks.validate(player, cmd)` returns `false` to reject, `true` to accept as-is, or a
**sanitized command object** to apply instead of the raw one (clamp numbers, drop
extra fields). This is where you enforce turn order, unit ownership, resource costs,
cooldowns, and legal targets.

### Privacy (IP leakage) mitigation
WebRTC exposes peers' IPs to each other. To hide them you route media through a
**TURN relay** instead of a direct connection — that costs bandwidth and needs TURN
credentials, so it's off by default. If you later want it, pass an `iceServers`
config with a TURN server into the PeerJS `Peer` constructor in `p2p.js` and force
`iceTransportPolicy: 'relay'`. For friends-only play the default (direct) is fine.

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

### Daily Break (pool) — turn-based, host simulates physics
Physics **must not** run independently on both sides (float drift desyncs). Instead:
- Guest sends only the shot on their turn: `{ k:'shot', aim, power, spin }`.
- Host `validate`: is it this player's turn? clamp `power`∈[0,max], `spin` to legal
  range, `aim` finite. Reject otherwise.
- Host runs the existing physics sim, then `snapshot` returns the resulting ball
  positions / pocketed balls / whose turn / game-over. Guests render that snapshot;
  they do **not** simulate.
- Bandwidth is trivial (one shot per turn). Same 2-player shape as Darts.

### Frontline (RTS) — real-time, many players, hardest
Host-authoritative real-time. This is where the "host runs locally and applies enemy
commander commands" idea becomes safe **only if the host validates**:
- Guests send intents: `{ k:'move', unitIds, x, y }`, `{ k:'spawn', type }`,
  `{ k:'attack', unitId, targetId }`. Never send positions/HP — those are the host's.
- Host `validate` must check, per command: does this player **own** those units?
  is the spawn **affordable** (resources)? is the target **in range / valid**? is the
  destination **on the map**? Clamp all coordinates. Reject anything else — this is
  the whole anti-cheat surface.
- Host ticks the one authoritative sim and `pushState()`s **delta snapshots** at
  ~10–20 Hz (only what changed: unit positions/HP, resources, deaths). Guests
  **interpolate** between snapshots for smooth rendering; they never run the sim.
- Hard caps to survive griefing: max units per player, commands/sec per player
  (already enforced by the rate limiter — tune `rate.cmdsPerSec`), max message size.
- The host's machine is the server, so the host should have the best connection.
- Set `maxPlayers` on the room; the core already rejects joins past the cap.

Start Frontline at **2 players** (host + one rival commander) to prove the intent →
validate → tick → snapshot → interpolate loop, then raise `maxPlayers`.

---

## Testing
Real verification needs **two browsers** (or two tabs / a phone + laptop): open
`games/index.html`, Host from one, copy the code/link, Join from the other. There is
no way to exercise a live WebRTC connection headlessly, so automated checks here are
syntax + logic only.
