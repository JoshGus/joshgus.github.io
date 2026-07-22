// ─────────────────────────────────────────────────────────────────────────────
// turn — mints short-lived Cloudflare Realtime TURN credentials for the games.
//
// Why this exists: WebRTC hands every peer your IP address during ICE. Forcing
// `iceTransportPolicy:'relay'` stops that, but relaying needs a TURN server, and
// TURN credentials are minted with an API token that must never ship in client
// JS — anyone could spend the quota. So the browser asks this Worker, and only
// the Worker holds the token.
//
// Response shape is what games/net/p2p.js expects:
//   { "iceServers": [ ...Cloudflare's array... ], "ttl": <seconds> }
// ─────────────────────────────────────────────────────────────────────────────

const CF_API = 'https://rtc.live.cloudflare.com/v1/turn/keys';

// Credential lifetime. Short enough that a leaked pair is worth little, long
// enough to outlast a match. p2p.js re-fetches a minute before expiry.
const TTL_SECONDS = 2 * 60 * 60;

// Only these origins get CORS headers. This is not real authentication — a
// script can forge Origin — but it stops the endpoint being trivially reused
// by other sites. The real protections are the short TTL and Cloudflare's
// own per-key quota.
const ALLOWED_ORIGINS = [
  'https://joshg.us',
  'https://www.joshg.us',
  'https://joshgus.github.io',
  'http://localhost:8765',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

const json = (body, status, origin) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(origin) },
});

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== 'GET')     return json({ error: 'method not allowed' }, 405, origin);

    if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) {
      return json({ error: 'TURN not configured' }, 500, origin);
    }

    // One set of credentials can serve everyone for its lifetime, so cache at
    // the edge for a fraction of the TTL rather than hitting the API per player.
    const cache = caches.default;
    const cacheKey = new Request(new URL('/__turn-creds', request.url).toString(), { method: 'GET' });
    const hit = await cache.match(cacheKey);
    if (hit) {
      const body = await hit.json();
      return json(body, 200, origin);
    }

    let upstream;
    try {
      upstream = await fetch(`${CF_API}/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.TURN_KEY_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: TTL_SECONDS }),
      });
    } catch (e) {
      return json({ error: 'upstream unreachable' }, 502, origin);
    }

    if (!upstream.ok) {
      // Don't echo the upstream body — it can contain account detail.
      return json({ error: `upstream ${upstream.status}` }, 502, origin);
    }

    const data = await upstream.json();
    if (!Array.isArray(data.iceServers) || !data.iceServers.length) {
      return json({ error: 'upstream returned no iceServers' }, 502, origin);
    }

    const body = { iceServers: data.iceServers, ttl: TTL_SECONDS };

    // Cache for half the TTL so a cached entry is never close to expiring.
    ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(body), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${Math.floor(TTL_SECONDS / 2)}` },
    })));

    return json(body, 200, origin);
  },
};
