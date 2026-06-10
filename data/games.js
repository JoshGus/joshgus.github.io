// Single source of truth for all featured card data.
// type: 'game' — lives in games/ dir; href is relative to games/
// type: 'tool' — lives at root; href is relative to root
// Pages use the type to build the correct link.

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

const PIXEL_SIM_SVG = `<svg viewBox="0 0 200 120" style="width:85%;max-width:200px;height:auto" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="82" cy="16" r="26" fill="rgba(220,60,10,.10)"/>
  <rect x="75" y="8" width="8" height="8" fill="#e04a12" rx="1"/>
  <rect x="85" y="8" width="8" height="8" fill="#ef5e18" rx="1"/>
  <rect x="80" y="17" width="8" height="8" fill="#f08020" rx="1"/>
  <rect x="70" y="17" width="8" height="8" fill="#e03a10" rx="1"/>
  <rect x="90" y="17" width="8" height="8" fill="#e84e14" rx="1"/>
  <rect x="10" y="60" width="8" height="8" fill="#c8913a" rx="1"/>
  <rect x="19" y="60" width="8" height="8" fill="#d09a44" rx="1"/>
  <rect x="28" y="60" width="8" height="8" fill="#c2893a" rx="1"/>
  <rect x="37" y="60" width="8" height="8" fill="#b88030" rx="1"/>
  <rect x="10" y="69" width="8" height="8" fill="#d09a44" rx="1"/>
  <rect x="19" y="69" width="8" height="8" fill="#c8913a" rx="1"/>
  <rect x="28" y="69" width="8" height="8" fill="#d09a44" rx="1"/>
  <rect x="37" y="69" width="8" height="8" fill="#c2893a" rx="1"/>
  <rect x="46" y="69" width="8" height="8" fill="#b88030" rx="1"/>
  <rect x="19" y="78" width="8" height="8" fill="#c8913a" rx="1"/>
  <rect x="28" y="78" width="8" height="8" fill="#d09a44" rx="1"/>
  <rect x="37" y="78" width="8" height="8" fill="#c2893a" rx="1"/>
  <rect x="46" y="78" width="8" height="8" fill="#c8913a" rx="1"/>
  <rect x="28" y="87" width="8" height="8" fill="#b88030" rx="1"/>
  <rect x="37" y="87" width="8" height="8" fill="#c2893a" rx="1"/>
  <rect x="105" y="60" width="8" height="8" fill="rgba(46,108,198,.88)" rx="1"/>
  <rect x="114" y="60" width="8" height="8" fill="rgba(50,115,205,.85)" rx="1"/>
  <rect x="100" y="69" width="8" height="8" fill="rgba(44,102,192,.88)" rx="1"/>
  <rect x="109" y="69" width="8" height="8" fill="rgba(50,115,205,.88)" rx="1"/>
  <rect x="118" y="69" width="8" height="8" fill="rgba(46,108,200,.85)" rx="1"/>
  <rect x="127" y="69" width="8" height="8" fill="rgba(42,98,188,.82)" rx="1"/>
  <rect x="105" y="78" width="8" height="8" fill="rgba(50,112,202,.88)" rx="1"/>
  <rect x="114" y="78" width="8" height="8" fill="rgba(46,108,198,.88)" rx="1"/>
  <rect x="123" y="78" width="8" height="8" fill="rgba(50,115,205,.85)" rx="1"/>
  <rect x="132" y="78" width="8" height="8" fill="rgba(44,102,192,.82)" rx="1"/>
  <rect x="110" y="87" width="8" height="8" fill="rgba(50,115,205,.85)" rx="1"/>
  <rect x="119" y="87" width="8" height="8" fill="rgba(46,108,200,.82)" rx="1"/>
  <rect x="128" y="87" width="8" height="8" fill="rgba(42,98,188,.80)" rx="1"/>
  <rect x="10" y="96" width="8" height="8" fill="rgba(88,82,76,.85)" rx="1"/>
  <rect x="19" y="96" width="8" height="8" fill="rgba(82,76,70,.85)" rx="1"/>
  <rect x="28" y="96" width="8" height="8" fill="rgba(90,84,78,.85)" rx="1"/>
  <rect x="37" y="96" width="8" height="8" fill="rgba(84,78,72,.85)" rx="1"/>
  <rect x="46" y="96" width="8" height="8" fill="rgba(88,82,76,.85)" rx="1"/>
  <rect x="55" y="96" width="8" height="8" fill="rgba(82,76,70,.85)" rx="1"/>
  <rect x="64" y="96" width="8" height="8" fill="rgba(90,84,78,.85)" rx="1"/>
  <rect x="73" y="96" width="8" height="8" fill="rgba(86,80,74,.85)" rx="1"/>
  <rect x="82" y="96" width="8" height="8" fill="rgba(82,76,70,.85)" rx="1"/>
  <rect x="91" y="96" width="8" height="8" fill="rgba(90,84,78,.85)" rx="1"/>
  <rect x="100" y="96" width="8" height="8" fill="rgba(86,80,74,.85)" rx="1"/>
  <rect x="109" y="96" width="8" height="8" fill="rgba(82,76,70,.85)" rx="1"/>
  <rect x="118" y="96" width="8" height="8" fill="rgba(90,84,78,.85)" rx="1"/>
  <rect x="127" y="96" width="8" height="8" fill="rgba(86,80,74,.85)" rx="1"/>
  <rect x="136" y="96" width="8" height="8" fill="rgba(82,76,70,.85)" rx="1"/>
  <rect x="145" y="96" width="8" height="8" fill="rgba(90,84,78,.85)" rx="1"/>
  <rect x="154" y="96" width="8" height="8" fill="rgba(86,80,74,.85)" rx="1"/>
  <rect x="163" y="96" width="8" height="8" fill="rgba(82,76,70,.85)" rx="1"/>
  <rect x="172" y="96" width="8" height="8" fill="rgba(90,84,78,.85)" rx="1"/>
  <rect x="10" y="105" width="8" height="8" fill="rgba(76,70,66,.85)" rx="1"/>
  <rect x="19" y="105" width="8" height="8" fill="rgba(80,74,70,.85)" rx="1"/>
  <rect x="28" y="105" width="8" height="8" fill="rgba(76,70,66,.85)" rx="1"/>
  <rect x="37" y="105" width="8" height="8" fill="rgba(80,74,70,.85)" rx="1"/>
  <rect x="46" y="105" width="8" height="8" fill="rgba(76,70,66,.85)" rx="1"/>
  <rect x="55" y="105" width="8" height="8" fill="rgba(80,74,70,.85)" rx="1"/>
  <rect x="64" y="105" width="8" height="8" fill="rgba(76,70,66,.85)" rx="1"/>
  <rect x="73" y="105" width="8" height="8" fill="rgba(80,74,70,.85)" rx="1"/>
  <rect x="82" y="105" width="8" height="8" fill="rgba(76,70,66,.85)" rx="1"/>
  <rect x="91" y="105" width="8" height="8" fill="rgba(80,74,70,.85)" rx="1"/>
  <rect x="100" y="105" width="8" height="8" fill="rgba(76,70,66,.85)" rx="1"/>
  <rect x="109" y="105" width="8" height="8" fill="rgba(80,74,70,.85)" rx="1"/>
  <rect x="118" y="105" width="8" height="8" fill="rgba(76,70,66,.85)" rx="1"/>
  <rect x="127" y="105" width="8" height="8" fill="rgba(80,74,70,.85)" rx="1"/>
  <rect x="136" y="105" width="8" height="8" fill="rgba(76,70,66,.85)" rx="1"/>
  <rect x="145" y="105" width="8" height="8" fill="rgba(80,74,70,.85)" rx="1"/>
  <rect x="154" y="105" width="8" height="8" fill="rgba(76,70,66,.85)" rx="1"/>
  <rect x="163" y="105" width="8" height="8" fill="rgba(80,74,70,.85)" rx="1"/>
  <rect x="172" y="105" width="8" height="8" fill="rgba(76,70,66,.85)" rx="1"/>
</svg>`;

const BOIDS_SVG = `<svg viewBox="0 0 200 120" style="width:85%;max-width:200px;height:auto" fill="none" xmlns="http://www.w3.org/2000/svg">
  <polygon points="9,0 -4,-3.5 -4,3.5" fill="rgba(220,230,255,.88)" transform="translate(120,35) rotate(40)"/>
  <polygon points="9,0 -4,-3.5 -4,3.5" fill="rgba(215,228,255,.86)" transform="translate(132,28) rotate(38)"/>
  <polygon points="8,0 -3.5,-3 -3.5,3" fill="rgba(218,228,255,.84)" transform="translate(144,40) rotate(42)"/>
  <polygon points="6,0 -3,-2.5 -3,2.5" fill="rgba(205,218,255,.72)" transform="translate(110,25) rotate(36)"/>
  <polygon points="6,0 -3,-2.5 -3,2.5" fill="rgba(210,222,255,.70)" transform="translate(150,22) rotate(44)"/>
  <polygon points="6,0 -3,-2.5 -3,2.5" fill="rgba(205,218,255,.68)" transform="translate(160,35) rotate(40)"/>
  <polygon points="6,0 -3,-2.5 -3,2.5" fill="rgba(200,215,255,.62)" transform="translate(60,50) rotate(38)"/>
  <polygon points="5,0 -2.5,-2 -2.5,2" fill="rgba(195,212,255,.58)" transform="translate(72,42) rotate(42)"/>
  <polygon points="5,0 -2.5,-2 -2.5,2" fill="rgba(198,214,255,.55)" transform="translate(80,55) rotate(45)"/>
  <polygon points="4,0 -2,-1.5 -2,1.5" fill="rgba(185,205,255,.48)" transform="translate(48,60) rotate(35)"/>
  <polygon points="4,0 -2,-1.5 -2,1.5" fill="rgba(188,208,255,.46)" transform="translate(90,65) rotate(40)"/>
  <polygon points="3,0 -1.5,-1.2 -1.5,1.2" fill="rgba(175,198,255,.38)" transform="translate(30,30) rotate(50)"/>
  <polygon points="3,0 -1.5,-1.2 -1.5,1.2" fill="rgba(170,195,255,.36)" transform="translate(170,60) rotate(30)"/>
  <polygon points="3,0 -1.5,-1.2 -1.5,1.2" fill="rgba(172,196,255,.35)" transform="translate(20,70) rotate(42)"/>
  <polygon points="3,0 -1.5,-1.2 -1.5,1.2" fill="rgba(175,198,255,.34)" transform="translate(180,25) rotate(38)"/>
  <polygon points="3,0 -1.5,-1.2 -1.5,1.2" fill="rgba(170,195,255,.36)" transform="translate(100,15) rotate(40)"/>
  <polygon points="3,0 -1.5,-1.2 -1.5,1.2" fill="rgba(168,193,255,.32)" transform="translate(45,80) rotate(35)"/>
  <polygon points="3,0 -1.5,-1.2 -1.5,1.2" fill="rgba(172,196,255,.30)" transform="translate(155,75) rotate(44)"/>
  <polygon points="2.5,0 -1.2,-1 -1.2,1" fill="rgba(160,188,255,.26)" transform="translate(15,45) rotate(48)"/>
  <polygon points="2.5,0 -1.2,-1 -1.2,1" fill="rgba(160,188,255,.24)" transform="translate(185,85) rotate(36)"/>
  <polygon points="2.5,0 -1.2,-1 -1.2,1" fill="rgba(162,190,255,.26)" transform="translate(90,90) rotate(42)"/>
</svg>`;

const DARTS_SVG = `<svg viewBox="0 0 200 120" style="width:85%;max-width:200px;height:auto" xmlns="http://www.w3.org/2000/svg">
  <circle cx="100" cy="60" r="54" fill="#181818"/>
  <circle cx="100" cy="60" r="51" fill="#c9b990"/>
  <circle cx="100" cy="60" r="46" fill="#181818"/>
  <circle cx="100" cy="60" r="29" fill="#c9b990"/>
  <circle cx="100" cy="60" r="24" fill="#181818"/>
  <circle cx="100" cy="60" r="50" fill="none" stroke="#c82000" stroke-width="2"/>
  <circle cx="100" cy="60" r="29" fill="none" stroke="#0f7020" stroke-width="2.5"/>
  <circle cx="100" cy="60" r="10" fill="#0f7020"/>
  <circle cx="100" cy="60" r="4.5" fill="#c82000"/>
  <line x1="100" y1="4" x2="100" y2="12" stroke="#aaa" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="100" cy="12" r="3.5" fill="#ccf73f"/>
  <line x1="137" y1="27" x2="131" y2="35" stroke="#aaa" stroke-width="2" stroke-linecap="round"/>
  <circle cx="131" cy="35" r="3" fill="#ccf73f" opacity=".65"/>
</svg>`;

const COLORMAP_SVG = `<svg viewBox="0 0 200 112" style="width:80%;opacity:.55" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="60" cy="72" r="3" fill="#e74c3c"/><circle cx="44" cy="80" r="2.5" fill="#c0392b"/>
  <circle cx="78" cy="62" r="2" fill="#e67e22"/><circle cx="90" cy="68" r="3" fill="#f39c12"/>
  <circle cx="110" cy="44" r="3" fill="#2ecc71"/><circle cx="126" cy="36" r="2.5" fill="#27ae60"/>
  <circle cx="98" cy="30" r="2" fill="#3498db"/><circle cx="82" cy="22" r="3" fill="#2980b9"/>
  <circle cx="148" cy="58" r="2.5" fill="#9b59b6"/><circle cx="162" cy="70" r="2" fill="#8e44ad"/>
  <circle cx="136" cy="78" r="3" fill="#f1c40f"/><circle cx="150" cy="86" r="2" fill="#f39c12"/>
  <circle cx="56" cy="44" r="2" fill="#e74c3c" opacity=".6"/><circle cx="72" cy="38" r="2.5" fill="#c0392b" opacity=".5"/>
  <circle cx="118" cy="62" r="2" fill="#1abc9c" opacity=".7"/><circle cx="104" cy="80" r="2" fill="#16a085" opacity=".6"/>
</svg>`;

export const CARDS = [
  {
    id: 'colormap',
    type: 'tool',
    title: 'Color Space',
    descShort: 'Photographs plotted in 3D RGB color space.',
    descFull: 'Your photo library plotted in RGB color space. Each dot is a dominant color — see how colors cluster by subject, season, and light.',
    href: 'colormap.html',
    thumbBg: 'radial-gradient(ellipse at 28% 55%,rgba(231,76,60,.38) 0,transparent 48%),radial-gradient(ellipse at 72% 38%,rgba(46,204,113,.32) 0,transparent 45%),radial-gradient(ellipse at 50% 18%,rgba(52,152,219,.3) 0,transparent 40%),radial-gradient(ellipse at 82% 78%,rgba(243,156,18,.28) 0,transparent 32%),radial-gradient(ellipse at 18% 78%,rgba(155,89,182,.26) 0,transparent 32%),#0e0d0b',
    thumbSvg: COLORMAP_SVG,
    stack: ['WebGL', 'JS'],
    ctaFull: 'Explore',
    ctaShort: 'Explore'
  },
  {
    id: 'minigolf',
    type: 'game',
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
    id: 'darts',
    type: 'game',
    title: 'Darts',
    descShort: 'Throw darts with your hand tracked through the webcam.',
    descFull: 'Camera-tracked darts. Aim with your index finger, throw by lunging toward the camera. Practice solo or play local 2-player 301.',
    href: 'darts.html',
    thumbBg: '#121210',
    thumbSvg: DARTS_SVG,
    stack: ['MediaPipe', 'Canvas', 'JS'],
    ctaFull: 'Play',
    ctaShort: 'Play'
  },
  {
    id: 'pixel-sim',
    type: 'game',
    title: 'Pixel Sim',
    descShort: 'Every pixel is a simulated object with its own material properties.',
    descFull: 'A falling-sand style simulation where every pixel is a discrete physical object. Sand falls, water flows, fire spreads. Materials interact in emergent ways.',
    href: 'pixel-sim.html',
    thumbBg: '#0b0a09',
    thumbSvg: PIXEL_SIM_SVG,
    stack: ['Canvas', 'JS'],
    credit: 'Inspired by <a href="https://dan-ball.jp/en/javagame/dust/" target="_blank" rel="noopener">Powder Game</a> and Noita',
    ctaFull: 'Open sim',
    ctaShort: 'Open'
  },
  {
    id: 'boids',
    type: 'game',
    title: '3D Boids',
    descShort: 'Emergent flocking behavior in three dimensions.',
    descFull: 'Three-dimensional boid simulation. Thousands of agents following three simple rules produce complex, lifelike swarm patterns.',
    href: 'boids.html',
    thumbBg: '#080c16',
    thumbSvg: BOIDS_SVG,
    stack: ['Canvas', 'JS'],
    ctaFull: 'Open sim',
    ctaShort: 'Open'
  },
  {
    id: 'hand-tracker',
    type: 'game',
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

export const GAMES = CARDS.filter(c => c.type === 'game');
