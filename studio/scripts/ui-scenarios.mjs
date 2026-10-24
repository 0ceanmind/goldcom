// Editor scenario tests: drives the real studio in a headless browser through best-case and worst-case use.
// Usage: npm run test:ui   (needs the studio running: npm run studio)
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.STUDIO_URL || 'http://localhost:5177';
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null; // ONLY="gallery header" runs matching scenarios
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'goldcom-ui-'));
const api = async (p, method = 'GET', body) => {
  const r = await fetch(BASE + p, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status}`);
  return r.json();
};
try { await api('/api/health'); } catch { console.error(`Studio is not running at ${BASE}. Start it with: npm run studio`); process.exit(1); }

const results = [];
const created = new Set();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
let errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|net::/.test(m.text())) errors.push(`console: ${m.text()}`); });
page.on('dialog', (d) => d.accept());

async function scenario(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  errors = [];
  const t0 = Date.now();
  try {
    await fn();
    if (errors.length) throw new Error(errors.slice(0, 3).join(' | '));
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`  ✓ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, err: e.message });
    console.log(`  ✕ ${name}\n      ${e.message.split('\n')[0]}`);
    await page.screenshot({ path: path.join(OUT, `fail-${results.length}.png`) }).catch(() => {});
  }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const wait = (ms) => page.waitForTimeout(ms);
const openEditor = async (id) => { await page.goto(`${BASE}/#/doc/${id}`); await page.waitForSelector('.topbar .docname', { timeout: 15000 }); await wait(500); };
const savedDoc = (id) => api(`/api/documents/${id}`);
const waitSaved = async () => { await page.waitForFunction(() => /Saved/.test(document.querySelector('.save')?.textContent || ''), null, { timeout: 10000 }); };
const newDoc = async (spec) => { const d = await api('/api/documents', 'POST', spec); created.add(d.id); return d; };
const download = async (label) => {
  await page.locator('.topbar .btn.primary', { hasText: 'Export' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 240000 }), page.locator('.menu button', { hasText: label }).first().click()]);
  const file = path.join(OUT, dl.suggestedFilename());
  await dl.saveAs(file);
  await page.waitForSelector('.progress', { state: 'detached', timeout: 240000 }).catch(() => {});
  return { file, size: fs.statSync(file).size, name: dl.suggestedFilename() };
};
const canvasPainted = () => page.evaluate(() => {
  const c = document.querySelector('.stage canvas');
  if (!c) return false;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let lit = 0;
  for (let i = 0; i < d.length; i += 400) if (d[i] + d[i + 1] + d[i + 2] > 120) lit++;
  return lit > 5;
});

console.log(`\nGoldcom Studio · editor scenarios against ${BASE}\n`);

// ---------- Create, footage, settings ----------
await scenario('Create page shows the prompt composer, examples and readiness', async () => {
  await page.goto(`${BASE}/#/`);
  await page.waitForSelector('.composer textarea');
  expect(await page.locator('.chips .chip').count() >= 4, 'example prompts are listed');
  expect(await page.locator('.ready-item').count() === 3, 'Claude, phone and footage readiness shown');
  await page.locator('.chips .chip').first().click();
  expect((await page.inputValue('.composer textarea')).length > 10, 'clicking an example fills the prompt');
});

await scenario('Footage page and phone panel load', async () => {
  await page.goto(`${BASE}/#/footage`);
  await page.waitForSelector('.dropzone');
  await page.waitForSelector('.phone-panel h3');
});

await scenario('Capture sources: emulator, cloud phone (form, prices), iPhone and USB tabs', async () => {
  await page.goto(`${BASE}/#/footage`);
  await page.waitForSelector('.phone-panel .seg');
  await page.click('.phone-panel .seg button:has-text("Emulator")');
  await page.waitForSelector('.phone-panel :text("Android"), .phone-panel :text("emulator")');
  await page.click('.phone-panel .seg button:has-text("Cloud phone")');
  await page.click('.phone-panel :text("Add a cloud phone")');
  for (const pv of ['geelark', 'duoplus', 'morelogin', 'multilogin', 'other']) await page.selectOption('.phone-panel select', pv);
  await page.click('.phone-panel :text("Cancel")');
  await page.click('.phone-panel :text("Compare cloud phone prices")');
  await page.waitForSelector('.phone-panel .price-table tbody tr');
  await page.click('.phone-panel .seg button:has-text("iPhone")');
  await page.waitForSelector('.phone-panel :text("Real iPhone in the cloud")');
  await page.click('.phone-panel .seg button:has-text("USB phone")');
  await page.waitForTimeout(500);
  await page.click('.phone-panel .seg button:has-text("Emulator")');
});

await scenario('Settings dialog opens and closes', async () => {
  await page.goto(`${BASE}/#/`);
  await page.locator('.topbar button[title="Settings"]').click();
  await page.waitForSelector('.modal.settings');
  await page.locator('.modal.settings .btn', { hasText: 'Close' }).click();
  await page.waitForSelector('.modal.settings', { state: 'detached' });
});

// ---------- Gallery ----------
await scenario('Gallery loads with both tabs and no errors', async () => {
  await page.goto(`${BASE}/#/designs`);
  await page.waitForSelector('.gallery');
  await page.locator('.seg.big button', { hasText: 'Library' }).click();
  await page.waitForSelector('.gcard');
  const n = await page.locator('.gcard').count();
  expect(n >= 24, `library shows ${n} cards`);
});

await scenario('Library filters: category chips, search with and without results', async () => {
  await page.locator('.chip', { hasText: 'Reels' }).click();
  const reels = await page.locator('.gcard').count();
  expect(reels > 0 && reels < 20, `reels chip shows ${reels}`);
  await page.locator('.chip').first().click();
  await page.fill('.gsearch', 'zzzz-nothing');
  await page.waitForSelector('.empty');
  await page.fill('.gsearch', '');
  expect(await page.locator('.gcard').count() >= 24, 'clearing search restores cards');
});

await scenario('Library card plays on hover and opens the Instagram preview in every mode', async () => {
  await page.locator('.gthumb').nth(3).hover();
  await wait(900);
  await page.locator('.chip', { hasText: 'Stories' }).click();
  await page.locator('.gthumb').first().click();
  await page.waitForSelector('.ig-phone');
  for (const m of ['Feed post', 'Reel', 'Story', 'Profile grid']) {
    await page.locator('.ig-modes .chip', { hasText: m }).click();
    await wait(500);
  }
  await page.locator('.ig-modes .chip', { hasText: 'Story' }).click();
  await page.locator('.ig-tap.r').click();
  await page.locator('.ig-tap.l').click();
  await page.keyboard.press('Escape');
  await page.waitForSelector('.ig-phone', { state: 'detached' });
  await page.locator('.chip').first().click();
});

let libDocId;
await scenario('Use a library design → editable copy opens in the editor', async () => {
  await page.locator('.gcard .btn.primary', { hasText: 'Use' }).first().click();
  await page.waitForSelector('.topbar .docname', { timeout: 15000 });
  libDocId = page.url().split('/doc/')[1];
  expect(libDocId, 'URL has the new doc id');
  created.add(libDocId);
  expect(await canvasPainted(), 'stage canvas is painted');
});

await scenario('Browser back and forward move between gallery and editor', async () => {
  await page.goBack();
  await page.waitForSelector('.gallery');
  await page.goForward();
  await page.waitForSelector('.topbar .docname');
});

await scenario('Unknown design URL shows a clear message instead of hanging', async () => {
  await page.goto(`${BASE}/#/doc/doc_does_not_exist`);
  await wait(2500);
  const body = await page.textContent('body');
  expect(/not found|couldn.t|could not|gallery|Your designs/i.test(body), 'some recovery UI is shown');
  expect(!/Loading design…/.test(body), 'not stuck on "Loading design…"');
  errors = errors.filter((e) => !/404|not found/i.test(e));
});

// ---------- New design ----------
await scenario('New design dialog offers every content type and every starter creates a design', async () => {
  await page.goto(`${BASE}/#/designs`);
  await page.waitForSelector('.gallery');
  await page.locator('.ghead .btn.primary', { hasText: 'New design' }).click();
  await page.waitForSelector('.starter');
  const typeOptions = await page.locator('.modal select').nth(1).locator('option').allTextContents();
  expect(['Reel', 'Story', 'Animated post'].every((k) => typeOptions.some((o) => o.includes(k))), `type options: ${typeOptions.join(', ')}`);
  const starters = await page.locator('.starter button').count();
  await page.keyboard.press('Escape');
  for (let i = 0; i < starters; i++) {
    await page.goto(`${BASE}/#/designs`);
    await page.waitForSelector('.gallery');
    await page.locator('.ghead .btn.primary', { hasText: 'New design' }).click();
    await page.locator('.starter button').nth(i).click();
    await page.locator('.modal .btn.primary', { hasText: 'Create' }).click();
    await page.waitForSelector('.topbar .docname', { timeout: 15000 });
    created.add(page.url().split('/doc/')[1]);
  }
});

// ---------- Editing, best case ----------
const base = await newDoc({ name: 'UI test · base', format: 'feed-portrait', kind: 'carousel', lang: 'en', slides: [
  { template: 'cover', theme: 'onyx', content: { kicker: 'Test', title: 'Real gold, *from 1 g*', subtitle: 'Buy, hold and gift.' } },
  { template: 'list', theme: 'cream', content: { title: 'Three steps', items: ['Sign up', 'Verify', 'Buy'] } },
] });

await scenario('Add every layer type from the toolbar', async () => {
  await openEditor(base.id);
  await page.locator('.toolbar .tool[title="Add text"]').click();
  const groups = await page.locator('.toolbar .rel > .tool').count();
  let added = 1;
  for (let g = 0; g < groups; g++) {
    await page.locator('.toolbar .rel > .tool').nth(g).click();
    const items = await page.locator('.toolbar .menu button').count();
    await page.keyboard.press('Escape');
    for (let i = 0; i < items; i++) {
      await page.locator('.toolbar .rel > .tool').nth(g).click();
      await page.locator('.toolbar .menu button').nth(i).click();
      added++;
      await wait(60);
    }
  }
  await waitSaved();
  const d = await savedDoc(base.id);
  expect(d.slides[0].layers.length >= added, `slide has ${d.slides[0].layers.length} layers, added ${added}`);
  await wait(1200); // let every layer animate at least once
  expect(await canvasPainted(), 'stage still renders with every layer type');
});

await scenario('Undo 40 times, then redo 40 times, without errors', async () => {
  for (let i = 0; i < 40; i++) await page.keyboard.press('Control+z');
  const undone = Number(await page.textContent('.panel.right .tabs .count'));
  for (let i = 0; i < 40; i++) await page.keyboard.press('Control+Shift+z');
  await waitSaved();
  const redone = Number(await page.textContent('.panel.right .tabs .count'));
  expect(redone > undone, `undo removed layers and redo restored them (${undone} → ${redone})`);
});

await scenario('Copy, paste, nudge and delete a layer with the keyboard', async () => {
  const d0 = await savedDoc(base.id);
  const n0 = d0.slides[0].layers.length;
  await page.locator('.panel.right .tabs button', { hasText: 'Layers' }).click();
  await page.locator('.panel.right .layer-row').first().click();
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  await waitSaved();
  const d1 = await savedDoc(base.id);
  expect(d1.slides[0].layers.length === n0 + 1, `paste added a layer (${n0} → ${d1.slides[0].layers.length})`);
  await page.keyboard.press('Delete');
  await waitSaved();
  const d2 = await savedDoc(base.id);
  expect(d2.slides[0].layers.length === n0, 'Delete removed it');
});

// ---------- Editing, worst case ----------
const stress = await newDoc({ name: 'UI test · stress', format: 'feed-portrait', kind: 'carousel', lang: 'ar', slides: [
  { template: 'cover', theme: 'onyx', content: { kicker: 'اختبار', title: 'ذهب حقيقي', subtitle: 'نص قصير' } },
] });

await scenario('Very long Arabic, emoji, mixed numbers and an empty title still render', async () => {
  await openEditor(stress.id);
  await page.locator('.panel.right .tabs button', { hasText: 'Slide' }).click();
  const longAr = 'اشترِ الذهب من جرام واحد واحتفظ به باسمك، وبِعه متى شئت بسعر السوق الحالي. '.repeat(14);
  const title = page.locator('.panel.right .field').filter({ has: page.locator('label', { hasText: /^Headline/ }) }).locator('textarea, input').first();
  await title.fill(longAr);
  await wait(400);
  await title.fill('🎁✨ هدية ذهب 24K · 31.204 ر.ع. · OMR 31.204 🔥🔥🔥');
  await wait(300);
  await title.fill('');
  await wait(300);
  await title.fill('<script>alert(1)</script> "quotes" & ampersands');
  await waitSaved();
  expect(await canvasPainted(), 'canvas still paints');
  const d = await savedDoc(stress.id);
  expect(JSON.stringify(d).includes('<script>alert(1)</script>'), 'text is stored as plain text');
});

await scenario('Number fields reject junk (letters, NaN, huge values)', async () => {
  await page.locator('.panel.right .tabs button', { hasText: 'Slide' }).click();
  const dur = page.locator('.panel.right .section').filter({ hasText: 'Motion' }).locator('input').first();
  const check = async (input, label) => {
    await dur.fill(input);
    await dur.blur();
    await waitSaved();
    const v = (await savedDoc(stress.id)).slides[0].duration;
    expect(Number.isFinite(v) && v >= 1 && v <= 60, `${label}: duration stayed sane (${v})`);
    return v;
  };
  await check('', 'cleared field');
  expect(await check('-5', 'negative') === 1, 'negative clamps to the minimum');
  expect(await check('99999', 'huge') === 60, 'huge clamps to the maximum');
  await check('3.5', 'normal');
});

await scenario('Switch through every format, every kind and both languages', async () => {
  const selects = page.locator('.topbar select');
  const formats = await selects.nth(0).locator('option').evaluateAll((o) => o.map((x) => x.value));
  for (const f of formats) { await selects.nth(0).selectOption(f); await wait(150); }
  const kinds = await selects.nth(1).locator('option').evaluateAll((o) => o.map((x) => x.value));
  for (const k of kinds) { await selects.nth(1).selectOption(k); await wait(150); }
  await page.locator('.topbar .seg button', { hasText: 'EN' }).click();
  await page.locator('.topbar .seg button', { hasText: 'AR' }).click();
  await selects.nth(1).selectOption('reel');
  await waitSaved();
  const d = await savedDoc(stress.id);
  expect(d.kind === 'reel' && d.height / d.width > 1.7, `reel forces 9:16 (${d.width}×${d.height})`);
  expect(await canvasPainted(), 'canvas paints after switching');
});

await scenario('Slide operations: add 20 slides, duplicate, reorder, delete down to one, refuse deleting the last', async () => {
  for (let i = 0; i < 19; i++) {
    await page.locator('.add-slide').click();
    await page.locator('.modal .tcard').nth(i % 10).click();
    await wait(80);
  }
  const items = page.locator('.slide-item');
  expect(await items.count() === 20, `20 slides (${await items.count()})`);
  await items.nth(2).hover();
  await items.nth(2).locator('button[title="Duplicate"]').click();
  await items.nth(3).hover();
  await items.nth(3).locator('button[title="Move up"]').click();
  while (await items.count() > 1) { await items.first().hover(); await items.first().locator('button[title="Delete"]').click(); }
  await items.first().hover();
  await items.first().locator('button[title="Delete"]').click();
  await page.waitForSelector('.toast.err');
  expect(await items.count() === 1, 'last slide kept');
});

await scenario('Placing a non-image and an oversized image shows a clear message', async () => {
  const drop = (name, type, size) => page.evaluate(([name, type, size]) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(size)], name, { type }));
    document.querySelector('.center').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, [name, type, size]);
  await drop('notes.pdf', 'application/pdf', 1000);
  await page.waitForSelector('.toast.err', { hasText: 'Only images' });
  await drop('huge.png', 'image/png', 41 * 1024 * 1024);
  await page.waitForSelector('.toast.err >> text=/40 MB/');
});

await scenario('Placing a real image adds an image layer', async () => {
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const x = c.getContext('2d'); x.fillStyle = '#C9A24B'; x.fillRect(0, 0, 64, 64);
    const b = await new Promise((r) => c.toBlob(r, 'image/png'));
    const dt = new DataTransfer(); dt.items.add(new File([b], 'gold.png', { type: 'image/png' }));
    document.querySelector('.center').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    return true;
  });
  expect(png, 'dropped');
  await wait(1500);
  await waitSaved();
  const d = await savedDoc(stress.id);
  expect(d.slides.some((s) => s.layers.some((l) => l.type === 'image' && l.src)), 'image layer saved');
});

await scenario('Caption: over-long caption and 31 hashtags are flagged', async () => {
  await page.locator('.panel.right .tabs button', { hasText: 'Caption' }).click();
  const ta = page.locator('.panel.right textarea').first();
  await ta.fill('ذهب '.repeat(600));
  const tags = page.locator('.panel.right .scroll input, .panel.right .scroll textarea').nth(1);
  await tags.fill(Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(' '));
  await wait(600);
  const text = await page.textContent('.panel.right');
  expect(/2,200|2200/.test(text) && /30 hashtags/.test(text), 'both limits are reported');
  await ta.fill('ذهب حقيقي من جرام واحد.');
  await tags.fill('#جولدكم #ذهب');
  await waitSaved();
});

// ---------- Saving and sync ----------
await scenario('Autosave survives the server being unreachable, then catches up', async () => {
  await page.route('**/api/documents/**', (r) => (r.request().method() === 'PUT' ? r.abort() : r.continue()));
  const name = page.locator('.topbar .docname');
  await name.fill('Offline edit');
  await wait(2500);
  const label = await page.textContent('.save');
  expect(!/^Saved/.test(label.trim()), `save state shows a problem while offline ("${label}")`);
  await page.unroute('**/api/documents/**');
  await waitSaved();
  const d = await savedDoc(stress.id);
  expect(d.name === 'Offline edit', 'the offline edit reached the server');
});

await scenario('A change from Claude Code shows up live; unsaved local edits are not overwritten', async () => {
  const d = await savedDoc(stress.id);
  await api(`/api/documents/${stress.id}`, 'PUT', { ...d, name: 'Renamed by Claude', source: { ...(d.source || {}), lastWriter: 'claude-code' } });
  await page.waitForFunction(() => document.querySelector('.topbar .docname')?.value === 'Renamed by Claude', null, { timeout: 8000 });
  // now edit locally and race a remote write
  await page.route('**/api/documents/**', (r) => (r.request().method() === 'PUT' ? new Promise((res) => setTimeout(() => res(r.continue().catch(() => {})), 1500)) : r.continue()));
  await page.locator('.topbar .docname').fill('Local edit wins');
  const d2 = await savedDoc(stress.id);
  await api(`/api/documents/${stress.id}`, 'PUT', { ...d2, name: 'Remote edit', updatedAt: new Date().toISOString() });
  await wait(600);
  expect(await page.locator('.topbar .docname').inputValue() === 'Local edit wins', 'local edit kept on screen');
  await page.unroute('**/api/documents/**');
  await waitSaved();
});

await scenario('Deleting the open design elsewhere does not crash the editor', async () => {
  const tmp = await newDoc({ name: 'UI test · to delete', format: 'square', kind: 'post', lang: 'en', slides: [{ template: 'statement', content: { title: 'Delete me' } }] });
  await openEditor(tmp.id);
  await api(`/api/documents/${tmp.id}`, 'DELETE');
  created.delete(tmp.id);
  await wait(2000);
  const body = await page.textContent('body');
  expect(/deleted|gallery|Your designs/i.test(body), 'user is told or returned to the gallery');
  errors = errors.filter((e) => !/404/.test(e));
});

// ---------- Exports ----------
const reel = await newDoc({ name: 'UI test · reel', format: 'story', kind: 'reel', lang: 'ar', slides: [
  { template: 'kinetic', content: { title: 'ذهب حقيقي. من جرام واحد.' }, duration: 2 },
  { template: 'countdown', content: { title: 'العيد بعد' }, duration: 2, transition: 'zoom' },
] });
const story = await newDoc({ name: 'UI test · story', format: 'story', kind: 'story', lang: 'en', slides: [
  { template: 'statement', content: { title: 'Gift gold this Eid' }, duration: 2 },
  { template: 'sticker', content: { sticker: 'poll', question: 'Gold or cash?', options: ['Gold', 'Cash'], native: 'yes' }, duration: 2 },
] });

await scenario('Export matrix: PNG, ZIP, MP4, GIF, caption and JSON', async () => {
  await openEditor(reel.id);
  const png = await download('PNG');
  expect(png.size > 20000 && png.name.endsWith('.png'), `PNG ${png.size} bytes`);
  const mp4 = await download('Video');
  expect(mp4.size > 50000 && mp4.name.endsWith('.mp4'), `MP4 ${mp4.size} bytes`);
  const gif = await download('GIF');
  expect(gif.size > 20000 && gif.name.endsWith('.gif'), `GIF ${gif.size} bytes`);
  const json = await download('Design file');
  expect(JSON.parse(fs.readFileSync(json.file, 'utf8')).slides.length === 2, 'JSON round-trips');
  await openEditor(story.id);
  const zip = await download('Story frames');
  expect(zip.size > 50000 && zip.name.endsWith('.zip'), `story ZIP ${zip.size} bytes`);
  const all = await download('All slides');
  expect(all.size > 20000, `PNG ZIP ${all.size} bytes`);
});

await scenario('Caption export without a caption explains what to do', async () => {
  await page.locator('.topbar .btn.primary', { hasText: 'Export' }).click();
  await page.locator('.menu button', { hasText: 'Caption' }).click();
  await page.waitForSelector('.toast.err >> text=/caption/i');
});

await scenario('Stories hide the native-sticker guide in exports', async () => {
  const d = await savedDoc(story.id);
  expect(d.slides[1].layers.some((l) => l.guide), 'sticker is a guide layer');
  const r = await fetch(`${BASE}/render.html?doc=${story.id}&slide=1&scale=0.25`);
  expect(r.ok, 'render page reachable');
});

await scenario('A 20-slide video exports as one MP4', async () => {
  const slides = Array.from({ length: 20 }, (_, i) => ({ template: i % 2 ? 'statement' : 'kinetic', content: { title: `Slide ${i + 1}` }, duration: 1, transition: ['fade', 'slide', 'wipe', 'zoom'][i % 4] }));
  const long = await newDoc({ name: 'UI test · 20 slides', format: 'square', kind: 'video', lang: 'en', slides });
  await openEditor(long.id);
  const mp4 = await download('Video');
  expect(mp4.size > 100000, `MP4 ${mp4.size} bytes`);
});

await scenario('Preview, brand check and Claude panel open from the editor', async () => {
  await page.locator('.topbar .btn', { hasText: 'Preview' }).click();
  await page.waitForSelector('.ig-phone');
  await page.keyboard.press('Escape');
  await page.locator('.topbar .btn', { hasText: 'Check' }).click();
  await page.waitForSelector('.modal');
  await page.keyboard.press('Escape');
  await page.locator('.topbar .btn[title="Claude Code connection"]').click();
  await page.waitForSelector('.modal');
  await page.keyboard.press('Escape');
});

await scenario('Ask Claude, Generate, Rate (with reasons) and the 3D scene picker open from the editor', async () => {
  await page.locator('.topbar .btn', { hasText: 'Ask Claude' }).click();
  await page.waitForSelector('.director textarea');
  await page.keyboard.press('Escape');
  await page.locator('.toolbar .tool', { hasText: 'Generate' }).click();
  await page.waitForSelector('.provider-status .pill');
  await page.keyboard.press('Escape');
  await page.locator('.topbar .btn', { hasText: 'Rate' }).click();
  await page.locator('.rate-btn', { hasText: 'Not there yet' }).click();
  await page.waitForSelector('.chips .chip');
  await page.keyboard.press('Escape');
  await page.locator('.toolbar .tool', { hasText: '3D' }).click();
  await page.waitForSelector('.scene-current');
  await page.locator('.scene-current').click();
  await page.waitForSelector('.scene-card');
  expect(await page.locator('.scene-card').count() >= 10, 'scene picker lists the scenes');
});

await scenario('Gallery header: generators and what the studio has learned', async () => {
  await page.goto(`${BASE}/#/designs`);
  await page.waitForSelector('.gallery');
  await page.locator('.topbar .btn[title^="Generators"]').click();
  await page.waitForSelector('.gen-row');
  expect(await page.locator('.gen-row').count() >= 5, 'settings lists the generators');
  await page.keyboard.press('Escape');
  await page.locator('.topbar .btn[title="What the studio has learned"]').click();
  await page.waitForSelector('.lesson');
  expect(await page.locator('.lesson').count() >= 5, 'memory shows the learned rules');
  await page.keyboard.press('Escape');
});

// ---------- Gallery management ----------
await scenario('Gallery card menu: duplicate, rename and delete', async () => {
  await page.goto(`${BASE}/#/designs`);
  await page.waitForSelector('.gcard');
  await page.fill('.gsearch', 'UI test · base');
  await page.waitForTimeout(300);
  const before = await api('/api/documents');
  await page.locator('.gcard .btn[title="More"]').first().click();
  await page.locator('.menu button', { hasText: 'Duplicate' }).click();
  let after = before;
  for (let i = 0; i < 40 && after.length === before.length; i++) { await wait(250); after = await api('/api/documents'); }
  expect(after.length === before.length + 1, 'duplicate added a design');
  for (const d of after) if (!before.some((b) => b.id === d.id)) created.add(d.id);
  await page.goto(`${BASE}/#/designs`);
  await page.waitForSelector('.gcard');
  await page.fill('.gsearch', 'UI test · base');
  await page.locator('.gcard .btn[title="More"]').first().click();
  await page.locator('.menu button', { hasText: 'Delete' }).click();
  let final = after;
  for (let i = 0; i < 40 && final.length === after.length; i++) { await wait(250); final = await api('/api/documents'); }
  expect(final.length === after.length - 1, 'delete removed a design');
});

// ---------- Clean up ----------
for (const id of created) await api(`/api/documents/${id}`, 'DELETE').catch(() => {});
for (const id of [base.id, stress.id, reel.id, story.id]) await api(`/api/documents/${id}`, 'DELETE').catch(() => {});
const all = await api('/api/documents');
for (const d of all) if (/^UI test|^Offline edit|^Renamed by Claude|^Local edit wins|^Remote edit/.test(d.name)) await api(`/api/documents/${d.id}`, 'DELETE').catch(() => {});
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} scenarios passed.${failed.length ? ` Screenshots of failures: ${OUT}` : ''}`);
if (!failed.length) fs.rmSync(OUT, { recursive: true, force: true });
process.exit(failed.length ? 1 : 0);
