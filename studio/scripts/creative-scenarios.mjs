// Render the new catalog in both languages through the real export target, using disposable data.
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { LIBRARY, buildLibraryDoc } from '../shared/library.js';
import { lintDocument } from '../shared/lint.js';
import { contactSheet } from '../server/render/review.mjs';

const base=process.env.STUDIO_URL;
if(!base||!process.env.GOLDCOM_STUDIO_DATA)throw new Error('Run through scripts/test-server.mjs creative');
const out=path.resolve(process.env.CREATIVE_QA_OUT || '../verification/creative-update');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
let current;
await page.route('**/api/documents/creative-preview',r=>r.fulfill({json:current}));
const frames=[],families=new Set();let rendered=0;
try {
  for(const item of LIBRARY.filter(i=>i.medium!=='3d')) {
    for(const lang of ['en','ar']) {
      current=buildLibraryDoc(item,lang);
      const issues=lintDocument(current).filter(x=>x.level==='error');
      if(issues.length)throw new Error(`${item.id} ${lang}: ${JSON.stringify(issues)}`);
      await page.goto(`${base}/render.html?doc=creative-preview&scale=.3&mode=frames`);
      await page.waitForFunction(()=>window.__READY||window.__ERROR,{},{timeout:30000});
      const error=await page.evaluate(()=>window.__ERROR);
      if(error)throw new Error(`${item.id} ${lang}: ${error}`);
      for(let slide=0;slide<current.slides.length;slide++) {
        const b64=await page.evaluate(async i=>window.__frame(2.5,i,'png'),slide);
        if(b64.length<4000)throw new Error(`Blank frame: ${item.id} ${lang} ${slide}`);
        rendered++;
        if(!families.has(item.medium+lang)) {
          families.add(item.medium+lang);
          const buf=Buffer.from(b64,'base64');
          await fs.writeFile(path.join(out,`${item.medium}-${lang}.png`),buf);
          if(lang==='ar')frames.push({buf,label:item.medium});
        }
      }
    }
  }
  // Check style filtering and editing a new direction in the actual workspace.
  await page.goto(base+'/#/designs');
  await page.getByRole('button',{name:/^Library |^المكتبة /}).click();
  await page.getByRole('button',{name:/Paper sculpture|قصاصات ورق/,exact:true}).click();
  const expected=LIBRARY.filter(i=>i.medium==='paper-cut').length;
  await page.waitForFunction(count=>document.querySelectorAll('.ggrid .gcard').length===count,expected);
  const cards=await page.locator('.ggrid .gcard').count();
  if(cards!==expected)throw new Error(`Style filter: expected ${expected}, got ${cards}`);
  await page.screenshot({path:path.join(out,'library-filter.png'),fullPage:true});
  if(errors.length)throw new Error(errors.join('\n'));
  await contactSheet(frames,{cols:4,out:path.join(out,'directions-ar.jpg')});
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify({designs:LIBRARY.length,newDesigns:LIBRARY.filter(i=>i.medium!=='3d').length,rendered,styleFilterCards:cards,errors},null,2));
  console.log(JSON.stringify({designs:LIBRARY.length,rendered,styleFilterCards:cards,out}));
} finally {await browser.close();}
