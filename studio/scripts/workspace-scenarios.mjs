// Browser-level acceptance checks. AI responses are fixtures; document editing uses the real API.
// Runs only against the isolated instance created by test-server.mjs. No provider calls are made.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { chooseOption } from './ui-controls.mjs';

const base = process.env.STUDIO_URL;
if (!base || !process.env.GOLDCOM_STUDIO_DATA) throw new Error('Run npm run test:workspace for an isolated test instance.');
const out = process.env.GOLDCOM_QA_OUT || path.join(process.env.GOLDCOM_STUDIO_DATA, 'workspace-qa');
fs.mkdirSync(out, { recursive:true });
const token = fs.readFileSync(path.join(process.env.GOLDCOM_STUDIO_DATA, '.api-token'), 'utf8').trim();
const api = async (url, method = 'GET', body) => {
  const response = await fetch(base + url, { method, headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' }, body:body ? JSON.stringify(body) : undefined });
  if (!response.ok) throw new Error(`${url}: ${response.status} ${await response.text()}`);
  return response.json();
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport:{ width:1440,height:1000 }, acceptDownloads:true });
await context.addInitScript(() => {
  const NativeEventSource = window.EventSource;
  window.EventSource = class extends NativeEventSource {
    constructor(...args) { super(...args); window.__workspaceTestEvents = this; }
  };
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const results = [];
let errors = [];
page.on('pageerror', error => errors.push(error.message));
let currentJob;
const fixture = (status = 'running', stage = 'storyboard') => ({
  id:'prod_workspace_fixture', type:'production', status, stage, title:'A meaningful gift', prompt:'Create a Reel about gifting gold.', message:'Writing the storyboard for the selected concept', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), progress:.3,
  brief:{ brand:'Goldcom', title:'A meaningful gift', format:'reel', lang:'en', objective:'Explain gifting', audience:'Omani adults', key_message:'A meaningful gift', tone:'Calm', duration_s:25, slide_count:3, must_include:[], assumptions:[] },
  concepts:['A','B','C'].map((id,index) => ({ id,name:['A meaningful gift','A simple walkthrough','From one person to another'][index],hook:['A gift with meaning','Every step, made clear','A thoughtful gesture'][index],angle:'A calm, clear approach.',beats:['Introduce the idea','Show the steps','Close with the app'] })),
  pick:{ winner:'A', reason:'Clear and relevant to the brief.', scores:[] },
  storyboard:{ scenes:['The opening','The app','The closing'].map(title => ({ scene:'title-card', duration:5,theme:'onyx',transition:'fade', fields:[{ key:'title',value:title }],footage:{ use:false } })), notes:[],caption:{ text:'An example caption for testing.',hashtags:['#Goldcom'] } }, reviews:[],log:[{ t:new Date().toISOString(),msg:'Test fixture: storyboard requested.' }],
});
let createPayload;
let chosen;
let stops = 0;
let resumes = 0;
await page.route('**/api/engine', route => route.fulfill({ json:{ selected:'claude-code' } }));
await page.route('**/api/productions', async route => {
  if (route.request().method() !== 'POST') return route.continue();
  createPayload = route.request().postDataJSON();
  currentJob = fixture();
  return route.fulfill({ status:202,json:{ jobId:currentJob.id } });
});
await page.route('**/api/jobs/prod_workspace_fixture', route => route.fulfill({ json:currentJob }));
await page.route('**/api/productions/prod_workspace_fixture/choose', async route => { chosen = route.request().postDataJSON().concept; currentJob = { ...currentJob,status:'running',stage:'storyboard',chosen }; await route.fulfill({ json:{ ok:true } }); });
await page.route('**/api/jobs/prod_workspace_fixture/cancel', async route => { stops++; currentJob = { ...currentJob,status:'cancelled' }; await route.fulfill({ json:{ ok:true } }); });
await page.route('**/api/productions/prod_workspace_fixture/resume', async route => { resumes++; currentJob = { ...currentJob,status:'running' }; await route.fulfill({ json:{ ok:true } }); });
const refreshJob = async () => { currentJob.updatedAt = new Date().toISOString(); await page.evaluate(() => window.dispatchEvent(new CustomEvent('gc:job',{ detail:{ job:{ id:'prod_workspace_fixture' } } }))); };
const navigate = async hash => { await page.goto(base + '/#/' + hash); await page.locator('.studio-shell, .studio-editor').waitFor(); };
const capture = async name => {
  await page.evaluate(async () => { await document.fonts.ready; document.querySelector('.workspace-content')?.scrollTo({ top:0,behavior:'instant' }); });
  await page.waitForTimeout(450);
  await page.screenshot({ path:path.join(out,name),animations:'disabled' });
};
async function scenario(name, test) {
  errors = [];
  try { await test(); assert(!errors.length, errors.join(' | ')); results.push({ name,ok:true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name,ok:false,error:error.message }); console.log(`FAIL ${name}: ${error.message.split('\n')[0]}`); await page.screenshot({ path:path.join(out,`failure-${results.length}.png`) }).catch(() => {}); }
}

try {
  await scenario('Guided creation is the default; starter fills brief; options reach the production request', async () => {
    await navigate('');
    assert(await page.getByRole('button',{ name:'Guided',exact:true }).getAttribute('aria-pressed') === 'true','guided default');
    assert(await page.locator('.create-submit').isDisabled(),'blank request cannot start');
    await page.locator('.starter-card').first().click();
    assert((await page.locator('#creative-brief').inputValue()).includes('gifting'),'starter fills real request');
    await page.locator('.format-picker button').filter({ hasText:/^Reel$/ }).click();
    await chooseOption(page,page.getByRole('combobox',{name:'Content language',exact:true}),'en');
    await chooseOption(page,page.getByRole('combobox',{name:'Length',exact:true}),'15');
    await page.locator('.creation-details summary').click();
    await page.getByLabel('Let me choose the creative direction',{ exact:true }).check();
    await page.locator('.create-submit').click();
    await page.locator('.production-journey').waitFor();
    assert(createPayload.options.format === 'reel' && createPayload.options.duration === 15 && createPayload.options.lang === 'en' && createPayload.options.chooseConcept,'selected options sent unchanged');
    assert(!await page.locator('.production-journey').innerText().then(text => /\d+%/.test(text)),'no fabricated percentage in production');
  });
  await scenario('Each backend phase has the right visual state; completed stages can be inspected', async () => {
    for (const [stage,title] of [['brief','Getting to know'],['concepts','Exploring creative'],['pick','Finding the strongest'],['storyboard','Shaping your storyboard'],['capture','Bringing in the real app'],['footage','Bringing in the real app'],['build','Bringing your scenes'],['review','Giving every detail'],['export','Preparing your finished'],['footage-index','Bringing in the real app']]) {
      currentJob = { ...fixture(),stage }; await refreshJob();
      await page.waitForFunction(expected => document.querySelector('.journey-heading h1')?.textContent.includes(expected),title);
      assert(await page.locator('.journey-rail [aria-current=step]').count() === 1,`one active phase for ${stage}`);
    }
    await page.getByRole('button',{ name:'View brief',exact:true }).click();
    assert(await page.locator('[data-tab=brief]').getAttribute('aria-selected') === 'true','brief opens from journey');
    currentJob = fixture(); await refreshJob();
    await page.locator('.journey-rail button').filter({ hasText:'Ideas' }).click();
    assert(await page.locator('[data-tab=ideas]').getAttribute('aria-selected') === 'true','phase button opens real concepts');
    await capture('production-desktop.png');
  });
  await scenario('Waiting highlights the decision; selecting a direction continues the same production', async () => {
    currentJob = fixture('waiting','choose'); await refreshJob();
    await page.getByRole('heading',{ name:'Which direction feels right?' }).waitFor();
    await page.locator('.concept').nth(1).getByRole('button',{ name:'Use this direction',exact:true }).click();
    await page.getByRole('heading',{ name:'Shaping your storyboard' }).waitFor();
    assert(chosen === 'B','selected concept id passed to the API');
  });
  await scenario('Stop and continue controls call the correct APIs without losing the current job', async () => {
    await page.getByRole('button',{ name:'Stop generation',exact:true }).click();
    await page.getByRole('heading',{ name:'Your work is right where you left it' }).waitFor();
    await page.getByRole('button',{ name:'Continue production',exact:true }).click();
    await page.getByRole('heading',{ name:'Shaping your storyboard' }).waitFor();
    assert(stops === 1 && resumes === 1 && page.url().includes('prod_workspace_fixture'),'same job resumed');
  });
  await scenario('Error, interrupted, needs-attention, and completed states stay usable and honest', async () => {
    currentJob = { ...fixture('error'),error:'Recording not available' }; await refreshJob();
    await page.getByRole('alert').filter({ hasText:'Recording not available' }).waitFor();
    assert(await page.getByRole('button',{ name:'Continue production',exact:true }).isVisible(),'error has recovery');
    currentJob = fixture('interrupted'); await refreshJob();
    await page.getByRole('heading',{ name:'Your work is right where you left it' }).waitFor();
    currentJob = { ...fixture('needs-attention','review'),blockers:['A real app recording is required before export.'] }; await refreshJob();
    await page.getByRole('alert').filter({ hasText:'A real app recording is required' }).waitFor();
    assert(await page.getByRole('link',{ name:'Download MP4',exact:true }).count() === 0,'unapproved work has no final download');
    currentJob = fixture('done','done'); await refreshJob();
    await page.getByRole('heading',{ name:'Your creation is ready' }).waitFor();
    assert(await page.locator('.journey-rail .complete').count() === 7,'finished rail');
  });
  await scenario('Advanced activity is optional and the mode survives reload', async () => {
    assert(await page.locator('[data-tab=log]').count() === 0,'log hidden in guided');
    await page.getByRole('button',{ name:'Advanced',exact:true }).click();
    await page.locator('[data-tab=log]').click();
    await page.getByText('Test fixture: storyboard requested.',{ exact:true }).waitFor();
    await page.reload(); await page.locator('.production-journey').waitFor();
    assert(await page.getByRole('button',{ name:'Advanced',exact:true }).getAttribute('aria-pressed') === 'true','mode persisted');
    await page.getByRole('button',{ name:'Guided',exact:true }).click();
  });
  await scenario('Arabic interface mirrors navigation and keeps production state and content intact', async () => {
    await chooseOption(page,page.getByRole('combobox',{ name:'Interface language',exact:true }),'ar');
    assert(await page.locator('.studio-shell').getAttribute('dir') === 'rtl','RTL shell');
    await page.getByRole('heading',{ name:'عملك الإبداعي جاهز' }).waitFor();
    const sidebar = await page.locator('.studio-sidebar').boundingBox();
    assert(sidebar.x > 1100,'sidebar moves to the right');
    await page.reload(); await page.locator('.production-journey').waitFor();
    assert(await page.locator('html').getAttribute('lang') === 'ar','language persisted');
    await chooseOption(page,page.getByRole('combobox',{ name:'Interface language',exact:true }),'en');
  });
  await scenario('A completion notification links back to the production while working elsewhere', async () => {
    await navigate('');
    currentJob = fixture('done','done');
    await page.evaluate(job => window.__workspaceTestEvents.onmessage({ data:JSON.stringify({ type:'job',job }) }),currentJob);
    await page.getByText('Your creation is ready to review',{ exact:true }).waitFor();
    await page.getByRole('button',{ name:'View production',exact:true }).click();
    await page.getByRole('heading',{ name:'Your creation is ready' }).waitFor();
    assert(page.url().includes(currentJob.id),'notification opens the matching job');
  });
  await scenario('Responsive layouts keep Create and production within the viewport', async () => {
    for (const width of [390,540,768,1024,1440]) {
      await page.setViewportSize({ width,height:900 });
      await navigate('');
      await page.locator('.direction-list').waitFor();
      assert(await page.locator('.workspace-content').evaluate(element => element.scrollWidth <= element.clientWidth + 1),`create fits ${width}`);
      await chooseOption(page,page.getByRole('combobox',{ name:'Interface language' }),'ar');
      assert(await page.locator('.workspace-content').evaluate(element => element.scrollWidth <= element.clientWidth + 1),`RTL create fits ${width}`);
      await chooseOption(page,page.getByRole('combobox',{ name:'Interface language' }),'en');
      currentJob = fixture(); await navigate('p/prod_workspace_fixture'); await page.locator('.journey-rail').waitFor();
      assert(await page.locator('.workspace-content').evaluate(element => element.scrollWidth <= element.clientWidth + 1),`production fits ${width}`);
      if (width === 390) await capture('production-mobile.png');
    }
    await navigate(''); await capture('create-desktop.png');
    await page.setViewportSize({ width:390,height:844 }); await capture('create-mobile.png');
    await page.setViewportSize({ width:1440,height:1000 });
  });
  await scenario('Help supports keyboard focus, Escape, and return to its trigger', async () => {
    await page.getByRole('button',{ name:'Help & shortcuts',exact:true }).click();
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Shift+Tab');
    assert(await page.getByRole('dialog').evaluate(dialog => dialog.contains(document.activeElement)),'focus trapped');
    await page.keyboard.press('Escape');
    assert(await page.getByRole('dialog').count() === 0,'Escape closes');
    assert(await page.getByRole('button',{ name:'Help & shortcuts',exact:true }).evaluate(button => document.activeElement === button),'focus restored');
  });
  await scenario('Guided settings, media capture disclosure, and brand panel remain accessible', async () => {
    await page.getByRole('button',{ name:'Settings',exact:true }).click();
    await page.getByRole('heading',{ name:'Your creative assistant',exact:true }).waitFor();
    assert(await page.locator('.guided-settings').count() === 1,'simple settings shown');
    await page.keyboard.press('Escape');
    await page.getByRole('button',{ name:'Brand',exact:true }).click();
    assert(await page.locator('.brand-colours>div').count() === 4,'brand colours accessible');
    await page.keyboard.press('Escape');
    await page.getByRole('button',{ name:'Media library',exact:true }).click();
    await page.locator('.capture-disclosure').waitFor();
    assert(!await page.locator('.capture-disclosure').evaluate(element => element.open),'capture closed in guided');
    await page.locator('.capture-disclosure summary').click();
    await page.locator('.phone-panel h3').waitFor();
  });
  await scenario('Settings, media, and project loading failures offer working retry controls', async () => {
    await page.route('**/api/settings', route => route.fulfill({ status:503,json:{ error:'Example settings load failure' } }));
    await page.getByRole('button',{ name:'Settings',exact:true }).click();
    await page.getByRole('alert').filter({ hasText:'Example settings load failure' }).waitFor();
    await page.unroute('**/api/settings');
    await page.getByRole('button',{ name:'Try again',exact:true }).click();
    await page.locator('.guided-settings').waitFor();
    await page.keyboard.press('Escape');
    await page.route('**/api/footage', route => route.fulfill({ status:503,json:{ error:'Example media load failure' } }));
    await navigate('footage');
    await page.getByRole('alert').filter({ hasText:'Example media load failure' }).waitFor();
    await page.unroute('**/api/footage');
    await page.getByRole('button',{ name:'Try again',exact:true }).click();
    await page.getByRole('alert').filter({ hasText:'Example media load failure' }).waitFor({ state:'detached' });
    await page.route('**/api/documents', route => route.fulfill({ status:503,json:{ error:'Example project load failure' } }));
    await page.getByRole('button',{ name:'My projects',exact:true }).click();
    await page.getByRole('alert').filter({ hasText:'Example project load failure' }).waitFor();
    await page.unroute('**/api/documents');
    await page.getByRole('button',{ name:'Try again',exact:true }).click();
    await page.locator('.gallery').waitFor();
  });
  await scenario('Goldcom menus support keyboard selection, typeahead, Escape, and modal focus', async () => {
    await navigate('');
    const language = page.getByRole('combobox',{ name:'Content language',exact:true });
    await language.click(); await page.getByRole('listbox').waitFor();
    assert(await page.locator('select').count() === 0,'no native select element');
    await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    assert(await language.locator('.gc-select-value').innerText() === 'English','arrow keys commit selected value');
    await language.click(); await page.keyboard.press('Home'); await page.keyboard.press('Escape');
    assert(await language.locator('.gc-select-value').innerText() === 'English','Escape preserves previous value');
    assert(await language.evaluate(element => document.activeElement === element),'focus returned to trigger');
    await language.click(); await page.keyboard.press('c'); await page.keyboard.press('Enter');
    assert(await language.locator('.gc-select-value').innerText() === 'Choose for me','typeahead selects matching option');
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    const settings = page.getByRole('dialog',{name:'Settings',exact:true});
    await settings.getByRole('combobox',{name:'Content language',exact:true}).click();
    await page.keyboard.press('Escape');
    assert(await settings.isVisible() && await page.getByRole('listbox').count() === 0,'Escape closes only the menu inside a dialog');
    await page.keyboard.press('Escape');
    assert(await page.getByRole('dialog').count() === 0,'second Escape closes dialog');
  });
  await scenario('Goldcom cursors, checkboxes, and tooltips replace browser-provided visuals', async () => {
    assert(await page.locator('body').evaluate(element => getComputedStyle(element).cursor.includes('goldcom-arrow.svg')),'custom default cursor');
    assert(await page.locator('.starter-card').first().evaluate(element => getComputedStyle(element).cursor.includes('goldcom-action.svg')),'custom action cursor');
    assert(await page.locator('#creative-brief').evaluate(element => getComputedStyle(element).cursor.includes('goldcom-text.svg') && getComputedStyle(element).resize === 'none'),'custom text cursor and no native resize grip');
    await page.locator('.creation-details summary').click();
    assert(await page.locator('.creation-details input[type=checkbox]').first().evaluate(element => getComputedStyle(element).appearance === 'none'),'checkbox drawn by Goldcom');
    const updates = page.getByRole('button',{ name:'Check for updates',exact:true });
    await updates.hover(); await page.getByRole('tooltip').waitFor();
    assert(await page.getByRole('tooltip').innerText() === 'Check for updates','custom tooltip shown');
    assert(await page.locator('[title]').count() === 0,'no native title balloons');
    await page.mouse.move(500,120);
    for (const asset of ['goldcom-arrow','goldcom-action','goldcom-text','goldcom-move','goldcom-resize-nwse','goldcom-resize-nesw','goldcom-unavailable']) {
      const response = await page.request.get(base + '/cursors/' + asset + '.svg');
      assert(response.ok() && (await response.text()).includes('<svg'),`${asset} asset loads`);
    }
  });
  await scenario('Goldcom rename and delete dialogs honour both cancel and confirm', async () => {
    const doc = await api('/api/documents','POST',{ name:'Control acceptance document',kind:'post',lang:'en',slides:[{ template:'statement',content:{ title:'For control testing' } }] });
    await navigate('designs'); await page.getByRole('button',{name:/^My projects/}).last().click();
    await page.locator('.gsearch').fill('Control acceptance');
    const more = page.locator('.gcard [data-goldcom-tooltip="More"]').first();
    await more.click(); await page.locator('.menu button').filter({hasText:'Rename'}).click();
    const rename = page.getByRole('dialog',{name:'Rename project',exact:true});
    await rename.getByRole('textbox').fill('Cancelled rename'); await page.keyboard.press('Escape');
    assert((await api('/api/documents/' + doc.id)).name === 'Control acceptance document','cancel leaves original name');
    await more.click(); await page.locator('.menu button').filter({hasText:'Rename'}).click();
    await rename.getByRole('textbox').fill('Control acceptance renamed'); await rename.getByRole('button',{name:'Save name',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('.ginfo b')?.textContent === 'Control acceptance renamed');
    assert((await api('/api/documents/' + doc.id)).name === 'Control acceptance renamed','rename saved');
    await more.click(); await page.locator('.menu button').filter({hasText:'Delete'}).click();
    const decision = page.getByRole('dialog',{name:'Delete this design?',exact:true});
    await decision.getByRole('button',{name:'Cancel',exact:true}).click();
    assert((await api('/api/documents/' + doc.id)).id === doc.id,'cancel preserves document');
    await more.click(); await page.locator('.menu button').filter({hasText:'Delete'}).click();
    await decision.getByRole('button',{name:'Delete design',exact:true}).click();
    await page.locator('.gcard').waitFor({state:'detached'});
    assert(!(await api('/api/documents')).some(item => item.id === doc.id),'confirm removes intended document');
  });
  await scenario('Guided editing saves through the real API; advanced mode preserves content and scene selection', async () => {
    const doc = await api('/api/documents','POST',{ name:'Workspace acceptance',kind:'carousel',lang:'en',slides:[{ template:'statement',content:{ title:'A meaningful gift' } },{ template:'statement',content:{ title:'The next scene' } }] });
    await page.goto(base + '/#/doc/' + doc.id);
    await page.locator('.guided-inspector').waitFor();
    await page.locator('.docname').fill('Saved in guided mode');
    await page.locator('.docname').blur();
    await page.waitForFunction(() => document.querySelector('.save')?.textContent === 'Saved');
    assert((await api('/api/documents/' + doc.id)).name === 'Saved in guided mode','autosave persisted actual document');
    await chooseOption(page,page.getByRole('combobox',{ name:'Scene',exact:true }),'1');
    await page.getByRole('button',{ name:'Advanced',exact:true }).click();
    await page.locator('.toolbar').waitFor(); await page.locator('.timeline').waitFor();
    assert(await page.locator('.slide-item.on .n').innerText() === '2','selected scene preserved');
    assert(await page.locator('.docname').inputValue() === 'Saved in guided mode','document preserved');
    await page.getByRole('button',{ name:'Guided',exact:true }).click();
    assert(await page.locator('.timeline').count() === 0 && await page.locator('.guided-inspector').count() === 1,'simple tools restored');
    await page.setViewportSize({ width:390,height:844 });
    assert(await page.getByRole('combobox',{ name:'Scene',exact:true }).isVisible(),'scene navigation remains available on phone');
    await chooseOption(page,page.getByRole('combobox',{ name:'Scene',exact:true }),'0');
    await capture('editor-guided-mobile.png');
    await page.setViewportSize({ width:1440,height:1000 });
    await capture('editor-guided-desktop.png');
    await api('/api/documents/' + doc.id,'DELETE');
  });
  await scenario('Reduced motion is respected and an unavailable production offers retry', async () => {
    await page.emulateMedia({ reducedMotion:'reduce' });
    currentJob = fixture(); await navigate('p/prod_workspace_fixture'); await page.locator('.production-journey').waitFor();
    await page.waitForFunction(() => { const element = document.querySelector('.production-journey .mini-activity i'); return element && parseFloat(getComputedStyle(element).animationDuration) < .01; });
    assert(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),'reduced-motion preference active');
    await page.emulateMedia({ reducedMotion:'no-preference' });
    await navigate('p/prod_missing_for_test');
    await page.getByRole('heading',{ name:'We couldn’t load this production.' }).waitFor();
    assert(await page.getByRole('button',{ name:'Try again',exact:true }).isVisible(),'retry available');
  });
} finally {
  await browser.close();
  fs.writeFileSync(path.join(out,'workspace-results.json'),JSON.stringify(results,null,2));
}
console.log(`${results.filter(result => result.ok).length}/${results.length} workspace scenarios passed. Evidence: ${out}`);
if (results.some(result => !result.ok)) process.exitCode = 1;
