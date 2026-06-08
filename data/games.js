// Single source of truth for game card data.
// href values are filenames relative to the games/ directory.
// Pages prepend their own base path when rendering links.

const GOLF_SVG = `<svg viewBox="0 0 200 120" style="width:85%;max-width:200px;height:auto" fill="none" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="74" cy="56" rx="64" ry="40" stroke="rgba(120,185,65,.09)" stroke-width=".8"/>
  <ellipse cx="74" cy="56" rx="50" ry="31" stroke="rgba(120,185,65,.13)" stroke-width=".9"/>
  <ellipse cx="74" cy="56" rx="37" ry="23" stroke="rgba(128,192,68,.18)" stroke-width="1"/>
  <ellipse cx="74" cy="56" rx="24" ry="15" stroke="rgba(140,200,74,.24)" stroke-width="1"/>
  <ellipse cx="74" cy="56" rx="12" ry="8" stroke="rgba(155,210,80,.30)" stroke-width="1"/>
  <ellipse cx="74" cy="56" rx="4" ry="2.5" stroke="rgba(170,220,88,.38)" stroke-width="1"/>
  <ellipse cx="164" cy="90" rx="38" ry="24" stroke="rgba(100,168,52,.09)" stroke-width=".8"/>
  <ellipse cx="164" cy="90" rx="26" ry="16" stroke="rgba(100,168,52,.15)" stroke-width=".9"/>
  <ellipse cx="164" cy="90" rx="15" ry="9" stroke="rgba(112,178,58,.21)" stroke-width="1"/>
  <ellipse cx="164" cy="90" rx="5" ry="3" stroke="rgba(126,188,65,.28)" stroke-width="1"/>
  <ellipse cx="185" cy="22" rx="30" ry="19" stroke="rgba(108,172,56,.09)" stroke-width=".8"/>
  <ellipse cx="185" cy="22" rx="18" ry="11" stroke="rgba(108,172,56,.15)" stroke-width=".9"/>
  <ellipse cx="185" cy="22" rx="7" ry="4.5" stroke="rgba(120,182,62,.21)" stroke-width="1"/>
</svg>`;

const HAND_SVG = `<svg viewBox="0 0 200 120" style="width:85%;max-width:200px;height:auto" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="18" y1="48" x2="42" y2="22" stroke="rgba(180,220,255,.13)" stroke-width=".8"/>
  <line x1="18" y1="48" x2="38" y2="76" stroke="rgba(180,220,255,.13)" stroke-width=".8"/>
  <line x1="42" y1="22" x2="72" y2="10" stroke="rgba(180,220,255,.11)" stroke-width=".8"/>
  <line x1="42" y1="22" x2="100" y2="36" stroke="rgba(180,220,255,.10)" stroke-width=".8"/>
  <line x1="62" y1="54" x2="85" y2="88" stroke="rgba(180,220,255,.11)" stroke-width=".8"/>
  <line x1="62" y1="54" x2="100" y2="36" stroke="rgba(180,220,255,.09)" stroke-width=".8"/>
  <line x1="100" y1="36" x2="136" y2="48" stroke="rgba(180,220,255,.13)" stroke-width=".8"/>
  <line x1="136" y1="48" x2="118" y2="68" stroke="rgba(180,220,255,.11)" stroke-width=".8"/>
  <line x1="136" y1="48" x2="150" y2="14" stroke="rgba(180,220,255,.10)" stroke-width=".8"/>
  <line x1="136" y1="48" x2="175" y2="36" stroke="rgba(180,220,255,.09)" stroke-width=".8"/>
  <line x1="118" y1="68" x2="158" y2="82" stroke="rgba(180,220,255,.11)" stroke-width=".8"/>
  <line x1="175" y1="36" x2="188" y2="52" stroke="rgba(180,220,255,.13)" stroke-width=".8"/>
  <line x1="188" y1="52" x2="182" y2="80" stroke="rgba(180,220,255,.13)" stroke-width=".8"/>
  <line x1="158" y1="82" x2="182" y2="80" stroke="rgba(180,220,255,.09)" stroke-width=".8"/>
  <line x1="55" y1="102" x2="85" y2="88" stroke="rgba(180,220,255,.11)" stroke-width=".8"/>
  <line x1="85" y1="88" x2="120" y2="102" stroke="rgba(180,220,255,.11)" stroke-width=".8"/>
  <circle cx="18" cy="48" r="2" fill="rgba(200,228,255,.40)"/>
  <circle cx="42" cy="22" r="2" fill="rgba(200,228,255,.40)"/>
  <circle cx="38" cy="76" r="1.5" fill="rgba(200,228,255,.32)"/>
  <circle cx="62" cy="54" r="2" fill="rgba(200,228,255,.40)"/>
  <circle cx="85" cy="88" r="2" fill="rgba(200,228,255,.40)"/>
  <circle cx="100" cy="36" r="2" fill="rgba(200,228,255,.40)"/>
  <circle cx="118" cy="68" r="2" fill="rgba(200,228,255,.36)"/>
  <circle cx="136" cy="48" r="2" fill="rgba(200,228,255,.40)"/>
  <circle cx="158" cy="82" r="2" fill="rgba(200,228,255,.36)"/>
  <circle cx="175" cy="36" r="1.5" fill="rgba(200,228,255,.32)"/>
  <circle cx="22" cy="98" r="1.5" fill="rgba(200,228,255,.26)"/>
  <circle cx="72" cy="10" r="1.5" fill="rgba(200,228,255,.30)"/>
  <circle cx="150" cy="14" r="3.8" fill="#ccf73f" opacity=".86"/>
  <circle cx="150" cy="14" r="7.5" fill="#ccf73f" opacity=".10"/>
  <circle cx="188" cy="52" r="3.8" fill="#ccf73f" opacity=".86"/>
  <circle cx="188" cy="52" r="7.5" fill="#ccf73f" opacity=".10"/>
  <circle cx="182" cy="80" r="3.5" fill="#ccf73f" opacity=".84"/>
  <circle cx="182" cy="80" r="7" fill="#ccf73f" opacity=".10"/>
  <circle cx="120" cy="102" r="3.5" fill="#ccf73f" opacity=".82"/>
  <circle cx="120" cy="102" r="7" fill="#ccf73f" opacity=".10"/>
  <circle cx="55" cy="102" r="3.5" fill="#ccf73f" opacity=".80"/>
  <circle cx="55" cy="102" r="7" fill="#ccf73f" opacity=".10"/>
</svg>`;

export const GAMES = [
  {
    id: 'minigolf',
    title: 'Daily Links',
    descShort: 'A seeded minigolf course generated fresh each day. Resets at midnight.',
    descFull: 'A seeded minigolf course generated fresh each day. Perlin-noise terrain, realistic slopes, drag-to-shoot. Same course for everyone.',
    href: 'minigolf.html',
    thumbBg: 'linear-gradient(160deg,#111e11,#1e3c1a)',
    thumbSvg: GOLF_SVG,
    stack: ['Canvas', 'JS'],
    ctaFull: "Play today's course",
    ctaShort: 'Play'
  },
  {
    id: 'hand-tracker',
    title: 'Hand Tracker',
    descShort: 'Webcam hand detection.',
    descFull: 'Webcam hand detection. 21 landmarks per hand tracked in real time. Foundation for gesture-controlled games.',
    href: 'hand-tracker.html',
    thumbBg: '#0a0908',
    thumbSvg: HAND_SVG,
    stack: ['MediaPipe', 'WebGL'],
    ctaFull: 'Open',
    ctaShort: 'Open'
  }
];
