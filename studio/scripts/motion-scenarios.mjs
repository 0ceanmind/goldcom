import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { chooseOption } from './ui-controls.mjs';

const base = process.env.STUDIO_URL;
if (!base || !process.env.GOLDCOM_STUDIO_DATA) throw new Error('Use npm run test:motion for an isolated instance.');
const out = process.env.GOLDCOM_QA_OUT || path.join(process.env.GOLDCOM_STUDIO_DATA,'motion-qa');
fs.mkdirSync(out,{recursive:true});
const token = fs.readFileSync(path.join(process.env.GOLDCOM_STUDIO_DATA,'.api-token'),'utf8').trim();
const api = async (url,method = 'GET',body) => {
  const response = await fetch(base + url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body ? JSON.stringify(body) : undefined});
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
};
const assert = (value,message) => { if (!value) throw new Error(message); };
const browser = await chromium.launch();
const context = await browser.newContext({viewport:{width:1440,height:1000}});
const page = await context.newPage();
page.setDefaultTimeout(10000);
let errors = [];
page.on('pageerror',error => errors.push(error.message));
const results = [];
const created = [];
const capture = name => page.screenshot({path:path.join(out,name),animations:'disabled'});
async function holdRequest(pattern) {
  let release;
  const gate = new Promise(resolve => { release=resolve; });
  const pending = new Set();
  const handler = async request => {
    const task = (async () => { await gate; await request.continue(); })();
    pending.add(task);
    try { await task; } finally { pending.delete(task); }
  };
  await page.route(pattern,handler);
  return async () => { release(); await Promise.all([...pending]); await page.unroute(pattern,handler); };
}
async function scenario(name,task) {
  errors = [];
  try { await task(); assert(!errors.length,errors.join(' | ')); results.push({name,ok:true}); console.log(`PASS ${name}`); }
  catch(error) { results.push({name,ok:false,error:error.message}); console.log(`FAIL ${name}: ${error.message}`); await capture(`failure-${results.length}.png`).catch(() => {}); }
}
try {
  await scenario('Cold startup paints an animated Goldcom screen before the application script arrives',async () => {
    const release = await holdRequest('**/static/main-*.js');
    try {
      await page.goto(base,{waitUntil:'commit'});
      await page.locator('.goldcom-first-paint').waitFor();
      assert(await page.locator('.goldcom-boot-facets i').count() === 3,'creative loading artwork present');
      assert(await page.locator('.goldcom-first-paint').evaluate(element => element.getBoundingClientRect().height >= innerHeight),'boot covers the viewport');
      await capture('cold-start.png');
    } finally { await release(); }
    await page.locator('.direction-option').first().waitFor();
  });
  await scenario('Cursor stays consistent across text, icons, and control edges without moving the hit area',async () => {
    await page.locator('.create-page').evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
    const button = page.locator('.format-picker button').filter({hasText:/^Reel$/});
    const before = await button.boundingBox();
    await button.hover(); await page.waitForTimeout(300);
    const after = await button.boundingBox();
    assert(Math.abs(before.x-after.x)<.25 && Math.abs(before.y-after.y)<.25 && Math.abs(before.width-after.width)<.25,'hover target does not move');
    const cursors = await button.evaluate(element => [element,...element.querySelectorAll('*')].map(child => getComputedStyle(child).cursor));
    assert(cursors.every(cursor => cursor.includes('goldcom-action.svg')),'children inherit the same custom cursor');
    // Stay on the straight part of the edge; rounded corners are intentionally outside the target.
    for (let i=0;i<12;i++) await page.mouse.move(before.x + before.width - 2,before.y + before.height * (.3 + i * .4 / 12));
    assert(await button.evaluate(element => element.matches(':hover')),'hover remains stable at the control boundary');
    assert(await page.locator('link[rel=preload][as=image][href^="/cursors/"]').count() === 7,'cursor assets preloaded');
    await page.getByRole('button',{name:'Advanced',exact:true}).hover();
    await page.mouse.move(800,120);
  });
  await scenario('A delayed document request gets immediate loading feedback; a newer navigation wins',async () => {
    const doc = await api('/api/documents','POST',{name:'Motion acceptance',kind:'post',lang:'en',slides:[{template:'statement',content:{title:'A responsive workspace'}}]});
    created.push(doc.id);
    await page.getByRole('button',{name:'My projects',exact:true}).click({noWaitAfter:true});
    await page.locator('.gallery').waitFor();
    await page.locator('.gsearch').fill('Motion acceptance');
    const release = await holdRequest(`**/api/documents/${doc.id}`);
    try {
      await page.locator('.gthumb').first().click({noWaitAfter:true});
      await page.locator('.studio-navigation-feedback.working').waitFor();
      assert(await page.locator('.navigation-capsule').innerText() === 'Opening your design workspace','navigation feedback identifies the real task');
      assert(await page.locator('.studio-editor').count() === 0,'feedback is visible before data arrives');
      await capture('loading-feedback.png');
      await page.getByRole('button',{name:'Create',exact:true}).click({noWaitAfter:true});
      await page.locator('.create-page').waitFor();
    } finally { await release(); }
    await page.waitForTimeout(300);
    assert(await page.locator('.create-page').isVisible() && !page.url().includes('/doc/'),'stale document response cannot change the current page');
  });
  await scenario('Fast navigation still has a visible transition and settles without an overlay',async () => {
    await page.getByRole('button',{name:'Media library',exact:true}).click({noWaitAfter:true});
    await page.locator('.studio-navigation-feedback').waitFor();
    await page.locator('.footage-page').waitFor();
    await page.locator('.studio-navigation-feedback').waitFor({state:'detached'});
    assert(await page.locator('html').getAttribute('data-gc-navigating') === null,'transition state cleared');
    await page.getByRole('button',{name:'Create',exact:true}).click({noWaitAfter:true});
    await page.locator('.create-page').waitFor();
    await page.locator('.studio-navigation-feedback').waitFor({state:'detached'});
  });
  await scenario('Selection highlights glide to the chosen control and remain aligned in RTL and on mobile',async () => {
    const picker = page.locator('.format-picker');
    await picker.getByRole('button',{name:'Reel',exact:true}).click();
    await page.waitForTimeout(300);
    const aligned = root => {
      const selected = root.querySelector('[aria-pressed=true]');
      const rect = selected.getBoundingClientRect(); const baseRect = root.getBoundingClientRect();
      const style = getComputedStyle(root,'::before');
      return Math.abs(parseFloat(style.left) + baseRect.left + root.clientLeft - rect.left) < 1 && Math.abs(parseFloat(style.width) - rect.width) < 1;
    };
    assert(await picker.evaluate(aligned),'highlight matches selected button');
    assert(await picker.evaluate(element => getComputedStyle(element,'::before').transitionProperty.includes('left')),'selection has a continuous position transition');
    await chooseOption(page,page.getByRole('combobox',{name:'Interface language',exact:true}),'ar');
    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(300);
    assert(await picker.evaluate(aligned),'RTL mobile highlight stays aligned');
    assert(await page.locator('.workspace-content').evaluate(element => element.scrollWidth <= element.clientWidth + 1),'no mobile overflow');
    await capture('mobile-selection.png');
    await page.setViewportSize({width:1440,height:1000});
    await chooseOption(page,page.getByRole('combobox',{name:'Interface language',exact:true}),'en');
  });
  await scenario('Reduced motion keeps useful loading feedback while removing sliding and repeating effects',async () => {
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.locator('.format-picker').getByRole('button',{name:'Post',exact:true}).click();
    const duration = await page.locator('.format-picker').evaluate(element => parseFloat(getComputedStyle(element,'::before').transitionDuration));
    assert(duration < .01,'highlight movement disabled');
    await page.getByRole('button',{name:'Media library',exact:true}).click({noWaitAfter:true});
    await page.locator('.footage-page').waitFor();
    await page.locator('.studio-navigation-feedback').waitFor({state:'detached'});
    assert(await page.locator('.studio-sidebar').isVisible(),'navigation remains usable');
  });
} finally {
  for (const id of created) await api(`/api/documents/${id}`,'DELETE').catch(() => {});
  await browser.close(); fs.writeFileSync(path.join(out,'motion-results.json'),JSON.stringify(results,null,2));
}
console.log(`${results.filter(result => result.ok).length}/${results.length} motion scenarios passed. Evidence: ${out}`);
if (results.some(result => !result.ok)) process.exitCode=1;
