// Generates the per-page link-preview (Open Graph) images.
//
// Every page gets its own 1200x630 card: the page's name in one or two words,
// set in the site's display face on the site's paper colour. Nothing else. The
// existing homepage card (og-image.png) is the reference this matches, so the
// whole set reads as one thing when links get shared around.
//
// Type is drawn to a canvas rather than laid out in the DOM so the ink can be
// positioned exactly. Each card measures its own glyph bounds, then places the
// block at a fixed left margin and optical centre. That keeps "Code" and
// "Image Breakdown" sitting on the same baseline grid despite very different
// widths, and it lets long names shrink to fit instead of running off the edge.
//
//   node tools/make-og.mjs           # writes og/*.png
//   node tools/make-og.mjs --home    # also rewrites og-image.png
//
// Needs playwright-core plus a Chromium build; see the README.
//
// These come out as full 24-bit PNGs, around 35KB each, which is a lot for two
// flat colours. Squashing them to a small palette cuts the set from ~680KB to
// ~115KB with no visible change, since only the glyph antialiasing needs more
// than two entries:
//
//   python3 -c "
//   from PIL import Image; import glob
//   for f in glob.glob('og/*.png'):
//       Image.open(f).convert('RGB').quantize(colors=32, dither=Image.NONE).save(f, optimize=True)"

import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Matched to the original homepage card and to shared.css (--bg / --fg).
const W = 1200, H = 630;
const BG = '#f7ece1', FG = '#1d1712';
const FONT = 'Bricolage Grotesque';
const WEIGHT = 650;
const SIZE = 152;          // ink height/width that matches og-image.png
const TRACKING = '-0.02em';
const LINE = 143;          // baseline pitch between stacked words
const MARGIN = 89;         // ink starts here, as on the homepage card
const MAX_W = W - MARGIN * 2;

// One entry per page carrying an og:image. `words` are stacked one per line,
// the way "Joshua / Gustaveson" is on the homepage card.
const CARDS = [
  { out: 'og/code.png',            words: ['Code'] },
  { out: 'og/photography.png',     words: ['Photography'] },
  { out: 'og/color-space.png',     words: ['Color', 'Space'] },
  { out: 'og/privacy.png',         words: ['Privacy'] },
  { out: 'og/games.png',           words: ['Games'] },
  { out: 'og/server.png',          words: ['Game', 'Server'] },
  { out: 'og/art-match.png',       words: ['Art', 'Match'] },
  { out: 'og/boids.png',           words: ['3D', 'Boids'] },
  { out: 'og/cv-lab.png',          words: ['CV', 'Lab'] },
  { out: 'og/darts.png',           words: ['Darts'] },
  { out: 'og/gamepigeon.png',      words: ['GamePigeon'] },
  { out: 'og/hand-tracker.png',    words: ['Hand', 'Tracker'] },
  { out: 'og/image-breakdown.png', words: ['Image', 'Breakdown'] },
  { out: 'og/daily-links.png',     words: ['Daily', 'Links'] },
  { out: 'og/pixel-sim.png',       words: ['Pixel', 'Sim'] },
  { out: 'og/daily-break.png',     words: ['Daily', 'Break'] },
  { out: 'og/frontline.png',       words: ['Frontline'] },
  { out: 'og/word-hunt.png',       words: ['Word', 'Hunt'] },
];

const HOME = { out: 'og-image.png', words: ['Joshua', 'Gustaveson'] };

const SHELL = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&display=swap" rel="stylesheet">
<style>html,body{margin:0;background:#fff}canvas{display:block}</style>
</head><body><canvas id="c" width="${W}" height="${H}"></canvas></body></html>`;

async function main() {
  const exe = process.env.PW_CHROME;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.setContent(SHELL, { waitUntil: 'networkidle' });
  // The face has to be resident before anything is measured, or the first card
  // silently gets drawn in a fallback and every metric below is wrong.
  await page.evaluate(
    ([f, w, s]) => document.fonts.load(`${w} ${s}px "${f}"`).then(() => document.fonts.ready),
    [FONT, WEIGHT, SIZE]
  );

  const jobs = process.argv.includes('--home') ? [HOME, ...CARDS] : CARDS;
  for (const card of jobs) {
    const dataUrl = await page.evaluate(drawCard, {
      words: card.words, W, H, BG, FG, FONT, WEIGHT, SIZE, TRACKING, LINE, MARGIN, MAX_W,
    });
    const file = resolve(ROOT, card.out);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`${card.out.padEnd(26)} ${card.words.join(' ')}`);
  }
  await browser.close();
}

// Runs in the page. Measures the real ink box, shrinks to fit if a name is long,
// then draws with the ink pinned to the left margin and vertically centred.
function drawCard(o) {
  const cv = document.getElementById('c');
  const ctx = cv.getContext('2d');
  ctx.fillStyle = o.BG;
  ctx.fillRect(0, 0, o.W, o.H);

  let size = o.SIZE, line = o.LINE;
  const setFont = (px) => {
    ctx.font = `${o.WEIGHT} ${px}px "${o.FONT}"`;
    ctx.letterSpacing = o.TRACKING;
  };
  setFont(size);

  // Longest word decides whether the whole block has to come down a notch.
  const widest = () => Math.max(...o.words.map((w) => {
    const m = ctx.measureText(w);
    return m.actualBoundingBoxRight + m.actualBoundingBoxLeft;
  }));
  if (widest() > o.MAX_W) {
    size = Math.floor(size * (o.MAX_W / widest()));
    line = Math.round(line * (size / o.SIZE));
    setFont(size);
  }

  // Ink extents of the stack: left edge of the widest line, top of the first
  // word's ascent, bottom of the last word's descent.
  const metrics = o.words.map((w) => ctx.measureText(w));
  const inkLeft = Math.min(...metrics.map((m) => -m.actualBoundingBoxLeft));
  const inkTop = -metrics[0].actualBoundingBoxAscent;
  const inkBottom = (o.words.length - 1) * line + metrics[metrics.length - 1].actualBoundingBoxDescent;
  const inkH = inkBottom - inkTop;

  // Baseline of the first word, such that the ink block lands where we want it.
  const x = o.MARGIN - inkLeft;
  const y = (o.H - inkH) / 2 - inkTop;

  ctx.fillStyle = o.FG;
  ctx.textBaseline = 'alphabetic';
  o.words.forEach((w, i) => ctx.fillText(w, x, y + i * line));

  return cv.toDataURL('image/png');
}

main().catch((e) => { console.error(e); process.exit(1); });
