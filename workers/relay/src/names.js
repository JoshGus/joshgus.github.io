// ─────────────────────────────────────────────────────────────────────────────
// names.js — username cleaning and profanity screening.
//
// Runs in the Worker, never the browser: a client-side check is cosmetic since
// anyone can skip it. Everything here treats its input as hostile.
// ─────────────────────────────────────────────────────────────────────────────

import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

// Real places and surnames the matcher flags anyway. Obscenity already handles
// the famous ones (Scunthorpe, assassin, classic) via its own whitelist, but
// not these — and telling someone their actual name is unacceptable is worse
// than letting a rude username through. Compared against the whole name only,
// so it can't be used to smuggle a slur inside a longer string.
const ALLOWLIST = new Set([
  'penistone', 'clitheroe', 'cockburn', 'cockermouth', 'dickinson', 'hancock',
  'babcock', 'glasscock', 'lightwater', 'shittleworth', 'sussex', 'middlesex',
  'wankie', 'fucking',   // Fucking, Austria (renamed Fugging in 2021)
]);

// Strips anything that renders deceptively: control characters, zero-width
// joiners, and bidi overrides that can reverse how a name displays.
export function cleanName(raw, fallback = 'Player') {
  const s = String(raw == null ? '' : raw)
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')          // control chars
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')  // zero-width, bidi
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
  return s || fallback;
}

// Casefolded uniqueness key. Confusable digits are folded too, so `J0sh` cannot
// be claimed alongside `Josh` to impersonate someone.
export function nameKey(name) {
  return cleanName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
    .replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't');
}

export function isProfane(name) {
  const bare = cleanName(name).toLowerCase().replace(/[^a-z]/g, '');
  if (ALLOWLIST.has(bare)) return false;
  return matcher.hasMatch(cleanName(name));
}

// Full check for a claim attempt. Returns { ok } or { ok:false, error }.
export function validateUsername(raw) {
  const name = cleanName(raw, '');
  if (name.length < 3)  return { ok: false, error: 'Username must be at least 3 characters' };
  if (name.length > 24) return { ok: false, error: 'Username must be 24 characters or fewer' };
  if (!/[a-z0-9]/i.test(name)) return { ok: false, error: 'Username needs at least one letter or number' };
  const key = nameKey(name);
  if (key.length < 3) return { ok: false, error: 'Username needs at least 3 letters or numbers' };
  if (isProfane(name)) return { ok: false, error: 'Please choose a different username' };
  return { ok: true, name, key };
}

export async function hashToken(token) {
  const data = new TextEncoder().encode(`joshg-relay:${token}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
