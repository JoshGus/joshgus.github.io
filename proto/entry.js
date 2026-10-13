// Which games have a notepad sketch, and how one game is written out.

export const SKETCH = {
  pool: 'pool.jpg',
  minigolf: 'golf.jpg',
  darts: 'dart.jpg',
  rts: 'rts.jpg',
  'pixel-sim': 'pixelsim.jpg',
};

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// `root` is the path back to the site root from the page doing the rendering.
export function entry(c, root) {
  const href = root + (c.href.startsWith('colormap') ? '' : 'games/') + c.href;
  const text = `
    <div>
      <h3><a href="${href}">${esc(c.title)}</a></h3>
      <p>${esc(c.descFull)}</p>
      <p class="stack">${(c.stack || []).map(esc).join(', ')}</p>
    </div>`;
  const img = SKETCH[c.id];
  if (!img) return `<article class="entry bare">${text}</article>`;
  return `<article class="entry">
    <a class="sketch" href="${href}"><img loading="lazy" src="${root}sketches/${img}" alt="Notepad sketch planning ${esc(c.title)}"></a>${text}
  </article>`;
}
