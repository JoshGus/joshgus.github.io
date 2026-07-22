// ─────────────────────────────────────────────────────────────────────────────
// identity.js — the site username used to publish open lobbies.
//
// Not an account and not authentication. A name is claimed first-come and bound
// to a random token this browser generates and keeps; the server stores only
// the token's hash. Anyone can abandon a username and claim another, so this is
// not a wall — it is friction. The point is to give abuse controls something
// durable to attach to that is not an IP address, since hiding addresses is the
// whole reason the transport relays in the first place.
//
// Playing is unaffected: you only need a username to LIST a game publicly.
// Hosting privately and joining by code never ask for one.
// ─────────────────────────────────────────────────────────────────────────────

const NAME_KEY  = 'joshg-username';
const TOKEN_KEY = 'joshg-user-token';

function store() {
  try { return window.localStorage; } catch { return null; }   // private mode, etc.
}

// Stable per-browser secret. Generated once, never sent anywhere except the
// claim/verify calls, and never displayed.
export function deviceToken() {
  const ls = store();
  if (!ls) return null;
  let t = ls.getItem(TOKEN_KEY);
  if (!t || t.length < 16) {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    t = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    ls.setItem(TOKEN_KEY, t);
  }
  return t;
}

export function getUsername() {
  const ls = store();
  return ls ? (ls.getItem(NAME_KEY) || '') : '';
}

export function hasUsername() {
  return !!getUsername();
}

function relayHttp() {
  // Mirrors p2p.js so a ?relay= override reaches this too.
  const override = new URLSearchParams(location.search).get('relay');
  const base = override || 'wss://relay.joshg.us';
  return String(base).replace(/\/+$/, '').replace(/^ws/, 'http');
}

// Claims `name` for this browser, or re-verifies one already held.
// → { ok:true, name } | { ok:false, error }
export async function claimUsername(name) {
  const token = deviceToken();
  if (!token) return { ok: false, error: 'Your browser is blocking local storage' };
  try {
    const res = await fetch(`${relayHttp()}/username`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return { ok: false, error: data.error || 'Could not set that username' };
    const ls = store();
    if (ls) ls.setItem(NAME_KEY, data.name);
    return { ok: true, name: data.name };
  } catch {
    return { ok: false, error: 'Could not reach the server' };
  }
}

export function clearUsername() {
  const ls = store();
  if (ls) ls.removeItem(NAME_KEY);   // the token stays, so the name can be re-claimed
}

// Credentials for hostRoom({ open:true }).
export function listingCredentials() {
  const name = getUsername();
  const token = deviceToken();
  return name && token ? { username: name, token } : null;
}
