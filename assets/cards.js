// The game card, as markup. The homepage and the games index both call this, so
// a change to how a card is built happens once. Its styles are the "game card"
// section of shared.css.
//
//   root     path from the calling page back to the site root ('' or '../')
//   heading  'h2' where cards are the page's main sections, 'h3' under a section title

export function gameCard(g, { root = '', heading = 'h3' } = {}) {
  const soon = !!g.comingSoon;
  const thumb = g.thumbImg
    ? `<div class="card-thumb has-img" style="background:${g.thumbBg}"><img class="thumb-img" src="${root}${g.thumbImg}" alt="${g.title} cover"></div>`
    : `<div class="card-thumb" style="background:${g.thumbBg}">${g.thumbSvg}</div>`;
  const cta = soon
    ? `<span class="soon-label">${g.ctaShort}</span>`
    : `<span class="play-label">${g.ctaShort} <span class="arr">&#x2192;</span></span>`;
  // Credits are stored with links; a card is already one big link, so drop them.
  const credit = g.credit ? `<p class="card-credit">${g.credit.replace(/<[^>]+>/g, '')}</p>` : '';
  return `
      <a class="game-card${soon ? ' coming-soon' : ''}" href="${soon ? '#' : `${root}games/${g.href}`}">
        ${thumb}
        <div class="card-body">
          <${heading}>${g.title}</${heading}>
          <p>${g.descFull}</p>
          ${credit}
          <div class="card-foot">
            <div class="stack"><b>${g.stack.join(', ')}</b></div>
            ${cta}
          </div>
        </div>
      </a>`;
}
