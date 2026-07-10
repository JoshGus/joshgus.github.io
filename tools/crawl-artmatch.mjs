// Build / extend data/artmatch-index.json — the Art Match painting fingerprint library.
// Usage:
//   1) serve the repo root:  python3 -m http.server 8777
//   2) npm i puppeteer-core && node tools/crawl-artmatch.mjs [--merge] [maxPerSource]
//
// It pages the Wikimedia Commons categories in SOURCES, then fingerprints each image
// via the page's OWN feature extraction (window.__AM_batch on games/art-match.html) so
// cached fingerprints can never drift from what the client computes at match time.
// Features are packed to base64 (5x5 grid + 5-colour palette + stats). Each entry also
// carries a short style tag `c`.
//
//   --merge : keep the existing index and only fetch/analyze files not already in it
//             (so you can add categories without re-crawling everything).
//
// The current index was built as: the "Google Art Project paintings" set (tag "classic",
// from v1) plus the modern/abstract SOURCES below merged in.

import fs from 'fs';
import puppeteer from 'puppeteer-core';

const API='https://commons.wikimedia.org/w/api.php';
const OUT=new URL('../data/artmatch-index.json',import.meta.url).pathname;
const GRID=5, SAMPLE=72, THUMB=320;
const MERGE=process.argv.includes('--merge');
const CAPARG=parseInt(process.argv.find(a=>/^\d+$/.test(a))||'0',10);

// {root category (no "Category:" prefix), style tag, cap}. The whole subcategory
// tree under each root is walked via categorymembers (reliable, unlike deepcategory).
const SOURCES=[
  {cat:'Abstract paintings',          tag:'abstract',        cap:1200},
  {cat:'Expressionist paintings',     tag:'expressionism',   cap:1000},
  {cat:'Post-Impressionist paintings',tag:'postimpressionism',cap:800},
  {cat:'Cubist paintings',            tag:'cubism',          cap:600},
  {cat:'Surrealist paintings',        tag:'surrealism',      cap:500},
  {cat:'Suprematist paintings',       tag:'suprematism',     cap:300},
  {cat:'Paintings by Paul Klee',      tag:'abstract',        cap:300},
  {cat:'Paintings by Egon Schiele',   tag:'expressionism',   cap:250},
];

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

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function apiGet(params){
  for(let t=0;t<8;t++){
    try{ const j=await fetch(API+'?'+params).then(r=>r.json()); if(!j.error) return j; }catch(e){}
    await sleep(800*(t+1));
  }
  return {};
}
// Walk the whole subcategory tree under `root` via categorymembers → file titles.
async function walkTree(root,cap){
  const files=[], seen=new Set([root]), queue=[root]; let maxCats=600;
  while(queue.length && files.length<cap && maxCats-->0){
    const cat=queue.shift();
    let c=null;                                        // files in this category
    do{ const j=await apiGet(new URLSearchParams({action:'query',format:'json',
          list:'categorymembers',cmtitle:'Category:'+cat,cmtype:'file',cmlimit:'500',...(c?{cmcontinue:c}:{})}));
        for(const m of (j.query?.categorymembers||[])){ if(files.length<cap) files.push(m.title); }
        c=j.continue?.cmcontinue; await sleep(120);
    }while(c && files.length<cap);
    let s=null;                                        // subcategories → queue
    do{ const j=await apiGet(new URLSearchParams({action:'query',format:'json',
          list:'categorymembers',cmtitle:'Category:'+cat,cmtype:'subcat',cmlimit:'500',...(s?{cmcontinue:s}:{})}));
        for(const m of (j.query?.categorymembers||[])){ const n=m.title.replace(/^Category:/,''); if(!seen.has(n)){seen.add(n);queue.push(n);} }
        s=j.continue?.cmcontinue; await sleep(120);
    }while(s);
    process.stdout.write(`\r    files:${files.length} cats:${seen.size}`);
  }
  process.stdout.write('\n');
  return files;
}
// Resolve file titles → {f,h,a,thumburl}, batched imageinfo (50/req).
async function resolveInfo(titles,tag,skip,out){
  for(let i=0;i<titles.length;i+=50){
    const j=await apiGet(new URLSearchParams({action:'query',format:'json',
      titles:titles.slice(i,i+50).join('|'),prop:'imageinfo',iiprop:'url|extmetadata|mediatype',iiurlwidth:String(THUMB)}));
    for(const k in (j.query?.pages||{})){
      const pg=j.query.pages[k], ii=pg.imageinfo?.[0]; if(!ii||!ii.thumburl) continue;
      if(ii.mediatype && !['BITMAP','DRAWING'].includes(ii.mediatype)) continue;
      const f=pg.title.replace(/^File:/,'').replace(/ /g,'_'); if(skip.has(f)) continue;
      const m=ii.thumburl.match(/\/thumb\/(.)\/(..)\/([^/]+)\//); if(!m||m[3]!==encodeURIComponent(f)) continue;
      const em=ii.extmetadata||{};
      const a=(em.Artist?String(em.Artist.value):'').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim().slice(0,70);
      skip.add(f); out.push({f,h:m[2],a,c:tag,thumburl:ii.thumburl});
    }
    await sleep(120);
  }
}

// ── load existing (for --merge) ─────────────────────────────────────
let base={v:1,grid:GRID,sample:SAMPLE,w:THUMB,base:'https://upload.wikimedia.org/wikipedia/commons/thumb',items:[]};
if(MERGE && fs.existsSync(OUT)){
  base=JSON.parse(fs.readFileSync(OUT,'utf8'));
  base.items.forEach(x=>{ if(!x.c) x.c='classic'; });
  console.log(`Merging onto existing index (${base.items.length} items)`);
}
const have=new Set(base.items.map(x=>x.f));

// ── collect metadata for new files ──────────────────────────────────
const toDo=[];
for(const s of SOURCES){
  const cap=CAPARG||s.cap;
  console.log(`Collecting ${s.tag}: ${s.cat} (cap ${cap})`);
  const titles=await walkTree(s.cat,cap);
  await resolveInfo(titles,s.tag,have,toDo);
  console.log(`    → ${toDo.length} total new so far`);
}
console.log(`New files to analyze: ${toDo.length}`);

// ── analyze via the page's own extractor ────────────────────────────
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
const page=await browser.newPage();
await page.goto('http://localhost:8777/games/art-match.html',{waitUntil:'domcontentloaded'});
await page.waitForFunction('typeof window.__AM_batch==="function"');

const CHUNK=120; let ok=0;
// Gentle passes — upload.wikimedia.org burst-throttles image loads, so keep
// concurrency low and pause between chunks; failures get a slower retry pass.
async function analyzePass(list,conc,gap){
  const failed=[];
  for(let i=0;i<list.length;i+=CHUNK){
    const chunk=list.slice(i,i+CHUNK);
    let feats;
    try{ feats=await page.evaluate((u,c)=>window.__AM_batch(u,c), chunk.map(x=>x.thumburl), conc); }
    catch(e){ feats=chunk.map(()=>null); }
    chunk.forEach((it,j)=>{
      const f=feats[j];
      if(f&&f.grid&&f.grid.length===GRID*GRID){ base.items.push({f:it.f,h:it.h,a:it.a,c:it.c,d:pack(f)}); ok++; }
      else failed.push(it);
    });
    fs.writeFileSync(OUT,JSON.stringify(base));   // checkpoint
    process.stdout.write(`\r  added:${ok} pendingFail:${failed.length} (${(100*(i+chunk.length)/list.length||0).toFixed(0)}%)`);
    await sleep(gap);
  }
  process.stdout.write('\n');
  return failed;
}
let fails=await analyzePass(toDo,6,900);
for(let pass=0; pass<2 && fails.length; pass++){
  console.log(`Retry pass ${pass+1} on ${fails.length} failed (cooling down)…`);
  await sleep(15000);
  fails=await analyzePass(fails,3,1800);
}
console.log(`Unrecoverable after retries: ${fails.length}`);
await browser.close();

const by={}; base.items.forEach(x=>by[x.c||'classic']=(by[x.c||'classic']||0)+1);
base.generated=new Date().toISOString().slice(0,10);
fs.writeFileSync(OUT,JSON.stringify(base));
console.log(`DONE. Total ${base.items.length} paintings, ${(fs.statSync(OUT).size/1048576).toFixed(2)} MB`);
console.log('By style:',by);
