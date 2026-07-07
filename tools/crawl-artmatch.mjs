// Build script for data/artmatch-index.json — the Art Match painting fingerprint library.
// Usage:
//   1) serve the repo root:  python3 -m http.server 8777
//   2) install puppeteer-core and run against your local Chrome:
//        npm i puppeteer-core && node tools/crawl-artmatch.mjs [count]
// It pages Wikimedia Commons' "Google Art Project paintings" category, then uses the
// page's OWN feature extraction (window.__AM_batch on games/art-match.html) so the cached
// fingerprints can never drift from what the client computes at match time.
//
import fs from 'fs';
import puppeteer from 'puppeteer-core';

const CAT='Google Art Project paintings';
const API='https://commons.wikimedia.org/w/api.php';
const OUT=new URL('../data/artmatch-index.json',import.meta.url).pathname;
const GRID=5, SAMPLE=72, THUMB=320;
const TARGET=parseInt(process.argv[2]||'9700',10);

const clamp=v=>Math.max(0,Math.min(255,Math.round(v)));
function pack(feat){
  const b=[];
  for(const [L,a,bb] of feat.grid) b.push(clamp(L),clamp(a+128),clamp(bb+128));
  const pal=feat.palette.slice(0,5);
  while(pal.length<5) pal.push(pal[pal.length-1]||{lab:[0,0,0],w:0});
  for(const c of pal) b.push(clamp(c.lab[0]),clamp(c.lab[1]+128),clamp(c.lab[2]+128),clamp(c.w*255));
  const s=feat.stats; b.push(clamp(s.lightness),clamp(s.saturation),clamp(s.warmth+128),clamp(s.contrast));
  return Buffer.from(b).toString('base64');
}

async function collectMeta(target){
  const items=[], seen=new Set(); let cont=null;
  while(items.length<target){
    const p=new URLSearchParams({action:'query',format:'json',
      generator:'search',gsrsearch:`incategory:"${CAT}"`,gsrnamespace:'6',gsrlimit:'500',
      prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:String(THUMB)});
    if(cont) for(const k in cont) p.set(k,cont[k]);
    let j; try{ j=await fetch(API+'?'+p).then(r=>r.json()); }catch(e){ await new Promise(r=>setTimeout(r,1500)); continue; }
    const pages=(j.query&&j.query.pages)||{};
    for(const k in pages){
      const pg=pages[k], ii=pg.imageinfo&&pg.imageinfo[0]; if(!ii||!ii.thumburl) continue;
      const f=pg.title.replace(/^File:/,'').replace(/ /g,'_');
      if(seen.has(f)) continue;
      const m=ii.thumburl.match(/\/thumb\/(.)\/(..)\/([^/]+)\//); if(!m) continue;
      if(m[3]!==encodeURIComponent(f)) continue;          // ensure client can rebuild the URL
      const em=ii.extmetadata||{};
      const a=(em.Artist?String(em.Artist.value):'').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim().slice(0,70);
      seen.add(f); items.push({f,h:m[2],a,thumburl:ii.thumburl});
      if(items.length>=target) break;
    }
    process.stdout.write(`\r  meta collected: ${items.length}`);
    if(!j.continue) break; cont=j.continue;
  }
  process.stdout.write('\n');
  return items;
}

function write(items){
  fs.writeFileSync(OUT, JSON.stringify({
    v:1, grid:GRID, sample:SAMPLE, w:THUMB,
    base:'https://upload.wikimedia.org/wikipedia/commons/thumb',
    generated:new Date().toISOString().slice(0,10),
    items
  }));
}

console.log(`Collecting metadata (target ${TARGET})…`);
const meta=await collectMeta(TARGET);
console.log(`Analyzing ${meta.length} paintings…`);

const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
const page=await browser.newPage();
await page.goto('http://localhost:8777/games/art-match.html',{waitUntil:'domcontentloaded'});
await page.waitForFunction('typeof window.__AM_batch==="function"');

const CHUNK=200, entries=[]; let ok=0, fail=0;
for(let i=0;i<meta.length;i+=CHUNK){
  const chunk=meta.slice(i,i+CHUNK);
  let feats;
  try{ feats=await page.evaluate(urls=>window.__AM_batch(urls,12), chunk.map(x=>x.thumburl)); }
  catch(e){ console.log('\nchunk error',e.message); feats=chunk.map(()=>null); }
  chunk.forEach((it,j)=>{
    const f=feats[j];
    if(f&&f.grid&&f.grid.length===GRID*GRID){ entries.push({f:it.f,h:it.h,a:it.a,d:pack(f)}); ok++; }
    else fail++;
  });
  write(entries);   // checkpoint
  process.stdout.write(`\r  analyzed: ${ok} ok / ${fail} failed  (${(100*(i+chunk.length)/meta.length).toFixed(0)}%)`);
}
process.stdout.write('\n');
await browser.close();

const bytes=fs.statSync(OUT).size;
console.log(`DONE: ${ok} paintings, ${fail} failed. Index ${(bytes/1048576).toFixed(2)} MB at ${OUT}`);
