# joshgus.github.io

The source for my personal site, **[joshg.us](https://joshg.us)** — a portfolio,
a photo gallery, and a set of things I built for fun that happen to run in the
browser. Static site on GitHub Pages; the only backend is one Cloudflare Worker
that relays multiplayer traffic (details below).

- **[index.html](index.html)** — home / about.
- **[code.html](code.html)** — coding projects.
- **[gallery.html](gallery.html)** + **[colormap.html](colormap.html)** — photography,
  including a map where each dot is one photo positioned by the average RGB of its
  dominant colors.
- **[games/](games/)** — the interactive work. Some are toys, some are real
  computer-vision and physics builds.

## Games & tools (`games/`)

Hand-written, dependency-light, and mostly an excuse to implement something from
scratch:

- **[cv-lab.html](games/cv-lab.html)** — EECS 442 computer-vision algorithms
  written by hand (convolution, FFT, image pyramids, DCT, Harris corners, HOG,
  homography, backprop) run live on your own image.
- **[image-breakdown.html](games/image-breakdown.html)** — repaints a photo via
  Sobel edges → colour blocks → subject saliency, then a particle painter. The
  homepage hero shares its engine.
- **[art-match.html](games/art-match.html)** — a painting-matcher over a crawled
  corpus of artworks.
- **[pool.html](games/pool.html)** (Daily Break), **[minigolf.html](games/minigolf.html)**,
  **[darts.html](games/darts.html)**, **[rts.html](games/rts.html)** (Frontline) —
  physics/strategy games, several playable **online with a friend** (see below).
- **[boids.html](games/boids.html)**, **[pixel-sim.html](games/pixel-sim.html)**,
  **[hand-tracker.html](games/hand-tracker.html)**, and word/game solvers.

Every online-capable game shows up in the **[server browser](games/server.html)** —
see any open game and jump in, or host your own.

## Multiplayer

The site stays static; multiplayer is host-authoritative and runs over a **relay
Worker**, with discovery by join-code, share-link, or a public lobby list. Two
docs cover it in full:

- **[games/net/README.md](games/net/README.md)** — the netcode. Host-authoritative
  star topology, per-command validation, rate limiting, open lobbies, transparent
  reconnection, and the **threat model** (what a P2P browser game can and cannot
  defend against). Read this before trusting it.
- **[workers/relay/README.md](workers/relay/README.md)** — the Cloudflare Worker +
  Durable Object that forwards messages. Why it exists (WebRTC leaks every peer's
  IP; relaying doesn't), the wire protocol, object lifecycle, and how it stays
  inside the Workers Free plan's *hard cap* — exceed it and requests fail, you are
  never billed.

The short version: the transport is a **WebSocket relay** so peers never connect
directly and never learn each other's IP addresses; the host browser is the sole
authority and re-validates every command; and there is no direct-connection
fallback by design, because falling back would silently reintroduce the leak the
relay removes.

## Local development

The site is plain static files — serve the repo root with anything:

```sh
python3 -m http.server 8000        # then open http://localhost:8000
```

For multiplayer against a local relay:

```sh
cd workers/relay && npx wrangler dev --local --port 8787
```

then load any game with `?relay=ws://127.0.0.1:8787` to point the client at it
without editing the source.
