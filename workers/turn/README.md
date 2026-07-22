# turn — TURN credential minter

A ~90-line Cloudflare Worker that hands the games short-lived
[Cloudflare Realtime TURN](https://developers.cloudflare.com/realtime/turn/)
credentials, so multiplayer can relay traffic instead of connecting peers
directly.

## Why

WebRTC gives every peer your IP address during ICE negotiation — that is how it
finds a direct route. Forcing `iceTransportPolicy: 'relay'` stops it: all
traffic goes through a TURN server and no direct connection is ever attempted,
so peers never learn each other's addresses.

Relaying needs a TURN server. `p2p.js` used to fall back to the free public
Open Relay project, which is rate-limited and often fails — so "Hide my IP" was
off by default and nobody turned it on. Cloudflare's TURN is reliable enough to
leave on permanently, which is the actual fix.

The catch is that TURN credentials are minted with an API token, and that token
can never ship in client JS — anyone could spend the quota. Hence this Worker:
the browser asks it for credentials, and only it holds the token.

## Deploy

1. **Create a TURN key.** Cloudflare dashboard → *Realtime* → *TURN Keys* →
   create one. Note the **Key ID** and the **API token** it shows you (the token
   is only displayed once).

2. **Set the key ID** in `wrangler.jsonc`, replacing `REPLACE_WITH_YOUR_TURN_KEY_ID`.
   The ID is not sensitive on its own — it is useless without the token.

3. **Store the token as a secret** (never in the config file):

   ```sh
   cd workers/turn
   npx wrangler secret put TURN_KEY_API_TOKEN
   ```

4. **Deploy:**

   ```sh
   npx wrangler deploy
   ```

   Wrangler prints a URL like `https://joshgus-turn.<subdomain>.workers.dev`.
   A custom route such as `turn.joshg.us` also works if the domain is on
   Cloudflare.

5. **Point the client at it** — set `TURN_ENDPOINT` in `games/net/p2p.js`:

   ```js
   const TURN_ENDPOINT = 'https://joshgus-turn.<subdomain>.workers.dev/';
   ```

   While it stays `null`, the games fall back to the old public relay, so
   nothing breaks before step 5.

6. **Check it:**

   ```sh
   curl -s -H 'Origin: https://joshg.us' https://<your-worker-url>/ | head -c 400
   ```

   Expect `{"iceServers":[...],"ttl":7200}`. In a real game, open devtools →
   Network → WebRTC and confirm the selected candidate pair is `relay`.

## Notes

- **Credentials are cached at the edge** for half their lifetime, so a busy
  lobby costs a couple of API calls an hour rather than one per player.
- **`ALLOWED_ORIGINS`** in `src/index.js` restricts CORS. That is not real
  authentication — `Origin` can be forged by a non-browser client — it just
  stops the endpoint being casually reused by other sites. The real limits are
  the 2-hour TTL and Cloudflare's own per-key quota. Add a Cloudflare rate limit
  rule on the route if it is ever abused.
- **Both peers must relay** for both IPs to be hidden. If only one side is
  relay-only, the other still offers its direct candidate and reveals its
  address. This is why the lobby now defaults "Hide my IP" to **on**.
- **Relaying is not free.** Cloudflare bills TURN egress beyond the free
  allowance; these games send tiny messages, but watch it if usage grows.
