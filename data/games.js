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

const RTS_SVG = `<svg viewBox="0 0 200 120" style="width:85%;max-width:200px;height:auto" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- ground -->
  <rect width="200" height="120" fill="#141c0a"/>
  <!-- walls -->
  <rect x="60" y="18" width="12" height="36" fill="#252018"/>
  <rect x="60" y="66" width="12" height="28" fill="#252018"/>
  <rect x="100" y="10" width="12" height="28" fill="#252018"/>
  <rect x="100" y="72" width="12" height="30" fill="#252018"/>
  <rect x="140" y="22" width="12" height="32" fill="#252018"/>
  <rect x="140" y="68" width="12" height="24" fill="#252018"/>
  <!-- player zone tint -->
  <rect x="0" y="0" width="40" height="120" fill="rgba(40,80,200,.07)"/>
  <!-- enemy zone tint -->
  <rect x="160" y="0" width="40" height="120" fill="rgba(200,40,40,.07)"/>
  <!-- player units (blue) -->
  <circle cx="24" cy="38" r="7" fill="#4488ee"/>
  <circle cx="24" cy="38" r="7" stroke="rgba(255,255,255,.18)" stroke-width="1"/>
  <circle cx="24" cy="72" r="6" fill="#55bbff"/>
  <circle cx="24" cy="72" r="6" stroke="rgba(255,255,255,.18)" stroke-width="1"/>
  <circle cx="14" cy="55" r="10" fill="#2255cc"/>
  <circle cx="14" cy="55" r="10" stroke="rgba(255,255,255,.18)" stroke-width="1"/>
  <!-- enemy units (red) -->
  <circle cx="176" cy="35" r="7" fill="#ee4444"/>
  <circle cx="176" cy="35" r="7" stroke="rgba(255,255,255,.14)" stroke-width="1"/>
  <circle cx="184" cy="70" r="6" fill="#ff8833"/>
  <circle cx="184" cy="70" r="6" stroke="rgba(255,255,255,.14)" stroke-width="1"/>
  <circle cx="175" cy="85" r="10" fill="#bb2222"/>
  <circle cx="175" cy="85" r="10" stroke="rgba(255,255,255,.14)" stroke-width="1"/>
  <!-- projectiles -->
  <circle cx="85" cy="55" r="2.5" fill="#aaee55"/>
  <circle cx="115" cy="42" r="2" fill="#ff8833"/>
  <circle cx="50" cy="55" r="2" fill="#aaee55"/>
  <!-- selection ring on tank -->
  <circle cx="14" cy="55" r="14" stroke="#ccf73f" stroke-width="1.5" stroke-dasharray="4 3"/>
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

const POOL_SVG = `<svg viewBox="0 0 200 120" style="width:85%;max-width:200px;height:auto" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="14" width="180" height="92" rx="10" fill="#0d4c29"/>
  <rect x="10" y="14" width="180" height="92" rx="10" fill="none" stroke="#3a2415" stroke-width="7"/>
  <circle cx="20" cy="24" r="6" fill="#0a0a0a"/><circle cx="100" cy="21" r="6" fill="#0a0a0a"/><circle cx="180" cy="24" r="6" fill="#0a0a0a"/>
  <circle cx="20" cy="96" r="6" fill="#0a0a0a"/><circle cx="100" cy="99" r="6" fill="#0a0a0a"/><circle cx="180" cy="96" r="6" fill="#0a0a0a"/>
  <circle cx="132" cy="46" r="8" fill="#f4c400"/><circle cx="150" cy="60" r="8" fill="#123f9e"/>
  <circle cx="132" cy="74" r="8" fill="#c41e1e"/><circle cx="150" cy="88" r="8" fill="#5a2a86"/>
  <circle cx="114" cy="60" r="8" fill="#141414"/>
  <circle cx="60" cy="60" r="8" fill="#f7f3e8" stroke="rgba(0,0,0,.15)" stroke-width="1"/>
  <line x1="60" y1="60" x2="150" y2="60" stroke="rgba(255,255,255,.35)" stroke-width="1" stroke-dasharray="4 4"/>
  <line x1="58" y1="60" x2="18" y2="60" stroke="#caa25e" stroke-width="3" stroke-linecap="round"/>
</svg>`;

const ARTMATCH_SVG = `<svg viewBox="0 0 200 120" style="width:85%;max-width:200px;height:auto" xmlns="http://www.w3.org/2000/svg">
  <!-- source frame -->
  <rect x="14" y="30" width="56" height="60" rx="3" fill="#1c1916" stroke="rgba(255,255,255,.12)" stroke-width="1"/>
  <rect x="20" y="36" width="44" height="30" fill="#c86a3a"/>
  <rect x="20" y="66" width="44" height="18" fill="#3a6ea5"/>
  <circle cx="34" cy="50" r="6" fill="#f0c419"/>
  <!-- palette dots being read -->
  <circle cx="88" cy="42" r="4" fill="#c86a3a"/>
  <circle cx="88" cy="56" r="4" fill="#3a6ea5"/>
  <circle cx="88" cy="70" r="4" fill="#f0c419"/>
  <!-- match arrow -->
  <path d="M100 56 h18" stroke="#ccf73f" stroke-width="2" stroke-linecap="round"/>
  <path d="M113 51 l6 5 -6 5" fill="none" stroke="#ccf73f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- matched frames -->
  <rect x="128" y="24" width="52" height="40" rx="3" fill="#1c1916" stroke="rgba(255,255,255,.12)" stroke-width="1"/>
  <rect x="133" y="29" width="42" height="18" fill="#cf7440"/>
  <rect x="133" y="47" width="42" height="12" fill="#3f74aa"/>
  <rect x="128" y="72" width="52" height="34" rx="3" fill="#1c1916" stroke="rgba(255,255,255,.12)" stroke-width="1"/>
  <rect x="133" y="77" width="42" height="14" fill="#bf6338"/>
  <rect x="133" y="91" width="42" height="10" fill="#356699"/>
</svg>`;

const WORDHUNT_SVG = `<svg viewBox="0 0 200 120" style="width:82%;max-width:200px;height:auto" fill="none" xmlns="http://www.w3.org/2000/svg" font-family="'Bricolage Grotesque',sans-serif" text-anchor="middle">
  <g stroke="rgba(150,210,110,.18)" stroke-width="1">
    <rect x="48" y="8" width="22" height="22" rx="4"/><rect x="75" y="8" width="22" height="22" rx="4"/><rect x="102" y="8" width="22" height="22" rx="4"/><rect x="129" y="8" width="22" height="22" rx="4"/>
    <rect x="48" y="35" width="22" height="22" rx="4"/><rect x="75" y="35" width="22" height="22" rx="4"/><rect x="102" y="35" width="22" height="22" rx="4"/><rect x="129" y="35" width="22" height="22" rx="4"/>
    <rect x="48" y="62" width="22" height="22" rx="4"/><rect x="75" y="62" width="22" height="22" rx="4"/><rect x="102" y="62" width="22" height="22" rx="4"/><rect x="129" y="62" width="22" height="22" rx="4"/>
    <rect x="48" y="89" width="22" height="22" rx="4"/><rect x="75" y="89" width="22" height="22" rx="4"/><rect x="102" y="89" width="22" height="22" rx="4"/><rect x="129" y="89" width="22" height="22" rx="4"/>
  </g>
  <g fill="rgba(150,210,110,.28)" font-size="12">
    <text x="59" y="23">T</text><text x="140" y="23">I</text><text x="86" y="50">U</text><text x="140" y="50">W</text><text x="59" y="77">R</text><text x="113" y="77">K</text><text x="86" y="104">O</text>
  </g>
  <polyline points="86,19 59,46 86,73 113,100 140,73" stroke="#ccf73f" stroke-width="2.4" opacity=".9" stroke-linejoin="round" stroke-linecap="round"/>
  <g fill="#ccf73f" font-size="12" font-weight="700">
    <text x="86" y="23">L</text><text x="59" y="50">E</text><text x="86" y="77">A</text><text x="113" y="104">D</text><text x="140" y="77">S</text>
  </g>
</svg>`;

export const CARDS = [
  {
    id: 'pool',
    type: 'game',
    title: 'Daily Break',
    descShort: 'Seeded top-down pool. Run your group, sink the 8, one rack a day.',
    descFull: 'Top-down pool with real physics, spin and English. A seeded daily challenge — run your assigned group and finish on the 8 — plus classic 8-ball versus a friend or an AI you can crank up to insane.',
    href: 'pool.html',
    thumbBg: 'linear-gradient(160deg,#0a120e,#123a24)',
    thumbSvg: POOL_SVG,
    stack: ['Canvas', 'Physics', 'JS'],
    ctaFull: "Play today's rack",
    ctaShort: 'Play',
    mp: { max: 2, blurb: 'Online 8-ball — one rack, two players.' }
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
    ctaShort: 'Play',
    mp: { max: 2, blurb: 'Online 301 — each player throws from their own camera.' }
  },
  {
    id: 'rts',
    type: 'game',
    title: 'Frontline',
    descShort: 'Procedural-map RTS. Spawn units, command them through ruins, wipe the enemy base.',
    descFull: 'Mini top-down RTS with procedurally generated wall maps. Spawn soldiers, archers, tanks, and scouts — select and right-click to move. Enemies advance when you get close. Each map is freshly generated.',
    href: 'rts.html',
    thumbBg: 'linear-gradient(160deg,#0b0e07,#141c0a)',
    thumbSvg: RTS_SVG,
    stack: ['Canvas', 'A*', 'JS'],
    ctaFull: 'Play',
    ctaShort: 'Play',
    mp: { max: 6, blurb: 'Host a battle; rival commanders join and fight live.' }
  },
  {
    id: 'wordhunt-solver',
    type: 'game',
    category: 'solver',
    title: 'Word Hunt Solver',
    descShort: 'Paste a GamePigeon Word Hunt link — it decodes the board and finds every word.',
    descFull: "Paste a GamePigeon Word Hunt link (or just type the 4×4 board) and it finds every word, ranked by the game's scoring, tracing each path on the grid. The board is decoded straight from the message, and it validates against GamePigeon's exact dictionary — both reverse-engineered from the app.",
    href: 'wordhunt-solver.html',
    thumbBg: 'linear-gradient(160deg,#12200f,#1c3a17)',
    thumbSvg: WORDHUNT_SVG,
    stack: ['DFS', 'Reverse-eng', 'JS'],
    ctaFull: 'Open solver',
    ctaShort: 'Open'
  },
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
    category: 'component',
    ctaFull: 'Open sim',
    ctaShort: 'Open'
  },
  {
    id: 'art-match',
    type: 'game',
    title: 'Art Match',
    descShort: 'Drop an image, find paintings with the same palette and composition.',
    descFull: 'Paste, drop, or upload any image. It reads the dominant palette and 5×5 composition in the browser, then ranks it against a local library of ~10,700 public-domain paintings (Wikimedia Commons) — classical through early-modern abstraction, expressionism, cubism and more — to find the closest matches. Slide between color and composition weighting.',
    href: 'art-match.html',
    thumbBg: 'linear-gradient(160deg,#1a1512,#2a1f18)',
    thumbSvg: ARTMATCH_SVG,
    stack: ['Canvas', 'Commons', 'JS'],
    category: 'component',
    credit: 'Paintings & images from <a href="https://commons.wikimedia.org/" target="_blank" rel="noopener">Wikimedia Commons</a>',
    ctaFull: 'Open',
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
    category: 'component',
    ctaFull: 'Open',
    ctaShort: 'Open'
  }
];

export const GAMES = CARDS.filter(c => c.type === 'game');
