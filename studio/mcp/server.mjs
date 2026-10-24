#!/usr/bin/env node
// Goldcom Studio MCP server: lets Claude Code (in any project) create and edit on-brand designs in the studio.
// Register once:  claude mcp add goldcom-studio --scope user -- node /abs/path/to/studio/mcp/server.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  STUDIO_ROOT, listDocuments, getDocument, saveDocument, deleteDocument, createFromSpec, saveAsset, saveAssetFromPath,
} from '../server/store.mjs';
import { TEMPLATE_IDS, templateCatalog, applyTemplate, applyAllTemplates, patchContent } from '../shared/templates.js';
import { THEMES, FORMATS, TRANSITIONS, DISCLAIMER, KINDS, SAFE_ZONES, BG_MOTION } from '../shared/brand.js';
import { LIBRARY, LIBRARY_CATEGORIES, libraryItem, buildLibraryDoc } from '../shared/library.js';
import { createSlide, normalizeDocument } from '../shared/schema.js';
import { lintDocument } from '../shared/lint.js';

const PORT = Number(process.env.GOLDCOM_STUDIO_PORT || process.env.PORT || 5177);
const STUDIO_URL = (process.env.GOLDCOM_STUDIO_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const BRAND_DIR = path.resolve(STUDIO_ROOT, '..', 'brand');
const log = (...a) => console.error('[goldcom-studio]', ...a);

// ---------- helpers ----------
const text = (t) => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) }] });
const fail = (msg) => ({ content: [{ type: 'text', text: `Error: ${msg}` }], isError: true });
const designUrl = (id) => `${STUDIO_URL}/#/doc/${id}`;
const project = () => path.basename(process.cwd());

function summary(doc) {
  const issues = lintDocument(doc);
  return {
    id: doc.id,
    name: doc.name,
    url: designUrl(doc.id),
    format: doc.format,
    size: `${doc.width}x${doc.height}`,
    kind: doc.kind,
    lang: doc.lang,
    slides: doc.slides.map((s, i) => ({ index: i, template: s.template, theme: s.theme, custom: s.custom, duration: s.duration, title: s.content?.title || s.content?.quote || s.content?.stat || null })),
    brand_check: issues.length ? issues.map((i) => `[${i.level}] slide ${i.slide + 1}: ${i.message}`) : ['OK: no brand issues'],
  };
}

function stamp(doc) {
  return { ...doc, source: { type: 'claude-code', project: doc.source?.project || project(), cwd: doc.source?.cwd || process.cwd(), ...(doc.source || {}), lastWriter: 'claude-code' } };
}

async function health(timeout = 800) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    const r = await fetch(`${STUDIO_URL}/api/health`, { signal: ctl.signal });
    clearTimeout(t);
    return r.ok ? r.json() : null;
  } catch { return null; }
}

/** Make sure the studio web app is running (build and start it if needed). */
async function ensureStudio() {
  if (await health()) return true;
  if (!/localhost|127\.0\.0\.1/.test(STUDIO_URL)) return false;
  if (!fs.existsSync(path.join(STUDIO_ROOT, 'dist', 'index.html'))) {
    log('building studio…');
    execFileSync(process.execPath, [path.join(STUDIO_ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], { cwd: STUDIO_ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  }
  log('starting studio server…');
  const child = spawn(process.execPath, [path.join(STUDIO_ROOT, 'server', 'index.mjs')], { cwd: STUDIO_ROOT, detached: true, stdio: 'ignore', env: { ...process.env, PORT: String(PORT) } });
  child.unref();
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (await health()) return true;
  }
  return false;
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try { spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref(); return true; } catch { return false; }
}

const slideSchema = z.object({
  template: z.enum(TEMPLATE_IDS).describe('Template id. See studio_guide for fields.'),
  theme: z.enum(Object.keys(THEMES)).optional().describe('onyx (dark, default) | charcoal | bullion (campaign gradient) | cream (light) | sand (light gold)'),
  content: z.record(z.string(), z.any()).default({}).describe('Template fields, e.g. { kicker, title, subtitle, body, items[], screenshot, device, icon, stat, label, code, button, link, disclaimer }. Wrap a word in *asterisks* for the gold accent. Can be omitted for logo-sting.'),
  duration: z.number().min(1).max(30).optional().describe('Seconds (video/animation). Default 4.'),
  transition: z.enum(Object.keys(TRANSITIONS)).optional().describe('Transition into this slide in reels/videos.'),
  bgMotion: z.enum(Object.keys(BG_MOTION)).optional().describe('none | drift (pattern drifts at 45°, feels live) | zoom (slow photo zoom)'),
});
const captionSchema = z.object({ text: z.string().describe('Instagram caption. First line is the hook. Natural, specific, no hype. Max 2,200 chars incl. hashtags.'), hashtags: z.array(z.string()).max(30).optional().describe('3–5 relevant hashtags, e.g. ["#Goldcom", "#ذهب"]') });

function buildSlides(specs) {
  return specs.map((s) => createSlide({ template: s.template, theme: s.theme || 'onyx', content: s.content || {}, duration: s.duration || 4, transition: s.transition || 'fade', bgMotion: s.bgMotion || 'none', pattern: 'top', layers: [] }));
}

// ---------- server ----------
const server = new McpServer({ name: 'goldcom-studio', version: '1.0.0' });

server.registerTool('studio_guide', {
  title: 'Goldcom brand + studio guide',
  description: 'Call this FIRST. Returns the Goldcom brand rules (voice, claims, colours, Arabic/English rules), the design workflow, every slide template with its fields, formats and themes.',
  inputSchema: {},
}, async () => {
  let brand = '';
  const promptFile = path.join(BRAND_DIR, 'AGENT_SYSTEM_PROMPT.md');
  if (fs.existsSync(promptFile)) {
    const md = fs.readFileSync(promptFile, 'utf8');
    const m = md.match(/```text\n([\s\S]*?)```/);
    brand = m ? m[1] : md;
  }
  return text([
    '# Goldcom Studio guide',
    '',
    '## Workflow',
    '1. Understand the subject: for a project, read README, package.json, main routes/features, and recent git log. Extract the one-line promise, the problem, 3–5 features, proof (numbers you can verify) and the audience.',
    '2. Get live visuals: if the project has a UI, start its dev server and call capture_screenshot (device phone for mobile/responsive apps, desktop for web apps). Use the returned url as content.screenshot.',
    '3. Plan a narrative of 5–10 slides: cover → problem (statement) → features (feature/screenshot) → proof (stat/list/code) → cta. One idea per slide, titles ≤ 8 words.',
    '4. Write copy following the brand voice below. Default language is Arabic (lang "ar") for Omani audiences unless the user asks for English. Write Arabic natively, not as a translation, and mention that new Arabic copy should get native review.',
    '5. Call create_design with a caption (hook first line, 3–5 hashtags). Read its brand_check, then fix issues with edit_slide. Call render_preview to look at the slides and refine.',
    '6. Audit: run the goldcom-auditor agent (Task tool, subagent_type "goldcom-auditor") on the design id. It checks design consistency and whether the copy sounds robotic or like AI filler, in English and Arabic. Fix every blocker and should-fix, then re-render.',
    '7. Give the user the studio URL. They can edit every word and layer there, preview it inside an Instagram mock-up, and export PNG/ZIP/MP4/GIF. export_pngs can also save the PNGs straight into the project.',
    '',
    '## Copy that sounds human',
    '- Banned filler: unlock, elevate, seamless, journey, game-changer, revolutionize, empower, "in today\'s world", "whether you\'re… or…", "look no further", "dive in", "it\'s not just X, it\'s Y", stacked adjectives, vague futures ("the future of gold").',
    '- One idea per slide. Concrete nouns and numbers. Short, plain sentences. Vary CTAs across slides and designs.',
    '- Arabic: natural Modern Standard Arabic as written in the Gulf, never word-for-word English. Watch gender agreement, use جرام / جولدكم / عيار consistently, and write prices as "31.204 ر.ع.".',
    '',
    '## Formats',
    ...Object.entries(FORMATS).map(([k, f]) => `- ${k}: ${f.label} (${f.w}x${f.h})`),
    '',
    '## Kinds (Instagram first)',
    ...Object.entries(KINDS).map(([k, v]) => `- ${k}: ${v.label}. ${v.hint}.`),
    `- Reels and Stories are 9:16 (format "story"). Templates keep text out of the Instagram UI: Reels top ${SAFE_ZONES.reel.top}px / bottom ${SAFE_ZONES.reel.bottom}px, Stories top ${SAFE_ZONES.story.top}px / bottom ${SAFE_ZONES.story.bottom}px.`,
    '- Feed posts are best at 4:5 (feed-portrait). The profile grid crops them to 3:4, so keep text away from the side edges.',
    '',
    '## Making it feel live',
    '- Use the live templates: live-price (price board: price counts up, chart draws, ticker scrolls, always badged Indicative with the date; never call a posted price "live"), notification (push notification drops onto a phone), sticker (poll/quiz/slider/question/countdown), countdown (ticking digits), chat (types itself out), goal (ring fills), kinetic (words land one by one), logo-sting (logo assembles).',
    '- bgMotion "drift" on dark slides adds slow 45° pattern movement. Vary transitions in reels: fade, slide, wipe, zoom.',
    '- For Stories with polls, quizzes, sliders, question boxes or countdowns, set content.native = "yes" so the studio marks the space for Instagram\'s own (tappable) sticker instead of baking a fake one into the image. Mention it in notes.',
    '- Never show invented results (poll %, user numbers, testimonials). Prices in designs are illustrative: say so, and add notes: "Update the price before posting".',
    '',
    '## Library',
    '- list_library shows ready-made, audited designs. create_from_library copies one (then edit_slide to adapt it). Start there when the request matches a library item.',
    '',
    '## Themes (per slide)',
    ...Object.entries(THEMES).map(([k, t]) => `- ${k}: ${t.label}`),
    '- Mix themes for rhythm, e.g. onyx cover, charcoal statement, cream list, bullion stat, onyx CTA. Use bullion for campaign moments; keep most slides dark.',
    '',
    '## Templates',
    ...templateCatalog().map((t) => `### ${t.id} (${t.name})\n${t.description}\nfields: ${t.fields.map((f) => `${f.key}${f.options ? ` [${f.options.join('|')}]` : ''} (${f.type})`).join(', ')}\nexample: ${JSON.stringify(t.example)}`),
    '',
    '## Content rules',
    '- *word* in a title renders in the accent colour. Use it on 1–3 words, max once per title.',
    '- screenshot/image values must be studio asset URLs (/assets/...) from capture_screenshot or add_asset.',
    '- device: "phone" for mobile UI, "browser" for web apps. visual on cover: device | goldbar | chart | none.',
    `- Any price, return, "invest" or "save" wording needs the disclaimer: use the price template, or cta with disclaimer "yes". Disclaimer text (en): ${DISCLAIMER.en}`,
    '- For a project that is not about gold, keep the Goldcom identity (logo, colours, voice) but do not invent gold claims.',
    '',
    '## Goldcom brand rules',
    brand || '(brand/AGENT_SYSTEM_PROMPT.md not found next to the studio)',
  ].join('\n'));
});

server.registerTool('list_designs', {
  title: 'List designs',
  description: 'List all designs in the Goldcom studio (most recent first).',
  inputSchema: {},
}, async () => text((await listDocuments()).map((d) => ({ ...d, url: designUrl(d.id) }))));

server.registerTool('get_design', {
  title: 'Get design',
  description: 'Get a design with its slides, template content and brand-check results. Set full=true to include every layer.',
  inputSchema: { id: z.string(), full: z.boolean().optional() },
}, async ({ id, full }) => {
  const doc = await getDocument(id);
  if (full) return text(doc);
  return text({ ...summary(doc), caption: doc.caption, notes: doc.notes || null, slides: doc.slides.map((s, i) => ({ index: i, template: s.template, theme: s.theme, custom: s.custom, duration: s.duration, transition: s.transition, content: s.content, layers: s.layers.map((l) => `${l.type}${l.name ? `:${l.name}` : ''}`) })) });
});

server.registerTool('create_design', {
  title: 'Create design',
  description: 'Create a new carousel, post or video from template slides. It appears live in the studio. Returns the URL and a brand check.',
  inputSchema: {
    name: z.string().describe('Design name, e.g. "Acme dashboard · launch carousel"'),
    format: z.enum(Object.keys(FORMATS)).default('feed-portrait'),
    kind: z.enum(Object.keys(KINDS)).default('carousel').describe('carousel | post | motion (animated post) | story (separate 9:16 frames) | reel (one 9:16 video) | video'),
    lang: z.enum(['ar', 'en']).default('ar').describe('Document language: ar = Arabic RTL (Goldcom default), en = English'),
    slides: z.array(slideSchema).min(1).max(20),
    project: z.string().optional().describe('Project this design is about (defaults to the current folder name)'),
    open: z.boolean().optional().describe('Open the studio in the browser (default true)'),
    caption: captionSchema.optional(),
    notes: z.string().optional().describe('Anything the user must do before posting (e.g. update prices, add a native sticker).'),
  },
}, async ({ name, format, kind, lang, slides, project: proj, open = true, caption, notes }) => {
  if ((kind === 'reel' || kind === 'story') && format !== 'story') format = 'story';
  let doc = await createFromSpec({ name, format, kind, lang, slides: slides.map((s) => ({ ...s, pattern: 'top' })), source: { type: 'claude-code', project: proj || project(), cwd: process.cwd(), lastWriter: 'claude-code', createdAt: new Date().toISOString() } });
  if (caption || notes) doc = await saveDocument({ ...doc, caption: caption ? { text: caption.text, hashtags: caption.hashtags || [] } : doc.caption, notes: notes || doc.notes });
  const up = await ensureStudio();
  if (up && open) openBrowser(designUrl(doc.id));
  return text({ ...summary(doc), studio: up ? 'running' : `not running. Start it with: cd ${STUDIO_ROOT} && npm run studio` });
});

server.registerTool('edit_slide', {
  title: 'Edit slide',
  description: 'Change one slide: content fields are merged (pass null to clear a field), and template/theme/duration/transition can be replaced. The layout is rebuilt from the template unless the user hand-edited the slide (then only text and media are updated).',
  inputSchema: {
    id: z.string(), index: z.number().int().min(0),
    template: z.enum(TEMPLATE_IDS).optional(), theme: z.enum(Object.keys(THEMES)).optional(),
    content: z.record(z.string(), z.any()).optional(), duration: z.number().optional(), transition: z.enum(Object.keys(TRANSITIONS)).optional(),
    force_layout: z.boolean().optional().describe('Rebuild layout even if the user hand-edited the slide (discards their manual tweaks). Ask the user first.'),
  },
}, async ({ id, index, template, theme, content, duration, transition, force_layout }) => {
  const doc = await getDocument(id);
  const s = doc.slides[index];
  if (!s) return fail(`Slide ${index} does not exist (design has ${doc.slides.length})`);
  const merged = { ...(s.content || {}) };
  for (const [k, v] of Object.entries(content || {})) { if (v === null) delete merged[k]; else merged[k] = v; }
  let next = { ...s, content: merged, ...(template ? { template } : {}), ...(theme ? { theme } : {}), ...(duration ? { duration } : {}), ...(transition ? { transition } : {}) };
  if (!next.template) return fail('This slide is free-form (no template). Pass template to convert it.');
  next = s.custom && !force_layout && !template && !theme ? patchContent(next, merged) : applyTemplate(next, doc, index, doc.slides.length);
  doc.slides[index] = next;
  const saved = await saveDocument(stamp(doc));
  return text({ ...summary(saved), note: s.custom && !force_layout && !template && !theme ? 'The user hand-edited this slide, so only text and media were updated.' : 'Layout rebuilt from template.' });
});

server.registerTool('add_slides', {
  title: 'Add slides',
  description: 'Insert template slides into a design at a position (default: end).',
  inputSchema: { id: z.string(), at: z.number().int().min(0).optional(), slides: z.array(slideSchema).min(1).max(20) },
}, async ({ id, at, slides }) => {
  const doc = await getDocument(id);
  const pos = at === undefined ? doc.slides.length : Math.min(at, doc.slides.length);
  doc.slides.splice(pos, 0, ...buildSlides(slides));
  const saved = await saveDocument(stamp(applyAllTemplates(normalizeDocument(doc))));
  return text(summary(saved));
});

server.registerTool('remove_slides', {
  title: 'Remove slides',
  description: 'Remove slides by index.',
  inputSchema: { id: z.string(), indexes: z.array(z.number().int().min(0)).min(1) },
}, async ({ id, indexes }) => {
  const doc = await getDocument(id);
  const drop = new Set(indexes);
  doc.slides = doc.slides.filter((_, i) => !drop.has(i));
  if (!doc.slides.length) return fail('A design needs at least one slide.');
  return text(summary(await saveDocument(stamp(applyAllTemplates(doc)))));
});

server.registerTool('update_design', {
  title: 'Update design',
  description: 'Rename, change format/kind/language, or reorder slides (order = new order of current indexes). Template slides re-layout automatically.',
  inputSchema: {
    id: z.string(), name: z.string().optional(), format: z.enum(Object.keys(FORMATS)).optional(), kind: z.enum(Object.keys(KINDS)).optional(),
    lang: z.enum(['ar', 'en']).optional(), order: z.array(z.number().int().min(0)).optional(),
  },
}, async ({ id, name, format, kind, lang, order }) => {
  let doc = await getDocument(id);
  if (name) doc.name = name;
  if (kind) doc.kind = kind;
  if (lang) doc.lang = lang;
  if (format) { doc.format = format; doc.width = FORMATS[format].w; doc.height = FORMATS[format].h; }
  if (order) {
    if (order.length !== doc.slides.length || new Set(order).size !== order.length) return fail(`order must list each of the ${doc.slides.length} slide indexes once`);
    doc.slides = order.map((i) => doc.slides[i]);
  }
  doc = applyAllTemplates(doc);
  return text(summary(await saveDocument(stamp(doc))));
});

server.registerTool('delete_design', {
  title: 'Delete design',
  description: 'Permanently delete a design. Only do this when the user asks.',
  inputSchema: { id: z.string() },
}, async ({ id }) => { await deleteDocument(id); return text(`Deleted ${id}`); });

server.registerTool('add_asset', {
  title: 'Add image asset',
  description: 'Import an image (PNG/JPG/WebP/SVG/GIF) from a local file path or an http(s) URL into the studio. Returns an asset URL for content.screenshot / content.image.',
  inputSchema: { path: z.string().optional().describe('Absolute or project-relative file path'), url: z.string().optional() },
}, async ({ path: p, url }) => {
  if (p) return text(await saveAssetFromPath(path.resolve(process.cwd(), p)));
  if (url) {
    const r = await fetch(url);
    if (!r.ok) return fail(`Download failed: ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    return text(await saveAsset(buf, { mime: r.headers.get('content-type')?.split(';')[0], name: path.basename(new URL(url).pathname) || 'image' }));
  }
  return fail('Pass path or url');
});

server.registerTool('capture_screenshot', {
  title: 'Capture live screenshot',
  description: 'Screenshot a running web app (e.g. the project dev server at http://localhost:3000) at real device size and store it as an asset. Optionally place it straight into a slide (attach_to).',
  inputSchema: {
    url: z.string().describe('http(s) URL, e.g. http://localhost:5173/dashboard'),
    device: z.enum(['phone', 'tablet', 'desktop']).default('phone'),
    full_page: z.boolean().optional(),
    wait_ms: z.number().optional().describe('Extra wait after load, default 800'),
    selector: z.string().optional().describe('CSS selector to capture one element only'),
    color_scheme: z.enum(['dark', 'light']).optional(),
    attach_to: z.object({ id: z.string(), index: z.number().int().min(0) }).optional().describe('Put the screenshot into this slide (content.screenshot)'),
  },
}, async ({ url, device, full_page, wait_ms, selector, color_scheme, attach_to }) => {
  const { capturePage } = await import('../server/browser.mjs');
  const png = await capturePage({ url, device, fullPage: full_page, waitMs: wait_ms ?? 800, selector, colorScheme: color_scheme || 'dark' });
  let host = 'capture';
  try { host = new URL(url).hostname; } catch { /* keep default */ }
  const asset = await saveAsset(png, { name: `${host}-${device}.png` });
  if (attach_to) {
    const doc = await getDocument(attach_to.id);
    const s = doc.slides[attach_to.index];
    if (s?.template) {
      const content = { ...(s.content || {}), screenshot: asset.url, device: device === 'desktop' ? 'browser' : 'phone', ...(device === 'desktop' ? { url: url.replace(/^https?:\/\//, '') } : {}) };
      doc.slides[attach_to.index] = s.custom ? patchContent({ ...s, content }, content) : applyTemplate({ ...s, content }, doc, attach_to.index, doc.slides.length);
      await saveDocument(stamp(doc));
    }
  }
  return text({ ...asset, attached: !!attach_to });
});

server.registerTool('render_preview', {
  title: 'Render preview',
  description: 'Render slides to PNG so you can see them. Starts the studio if needed. Use it to check layout, text fit and brand feel, then refine with edit_slide.',
  inputSchema: { id: z.string(), slides: z.array(z.number().int().min(0)).optional().describe('Slide indexes (default: all, max 10)'), scale: z.number().min(0.2).max(1).optional().describe('Default 0.5') },
}, async ({ id, slides, scale = 0.5 }) => {
  if (!(await ensureStudio())) return fail(`Studio is not running at ${STUDIO_URL}. Start it with: cd ${STUDIO_ROOT} && npm run studio`);
  const doc = await getDocument(id);
  const idx = (slides?.length ? slides : doc.slides.map((_, i) => i)).filter((i) => i < doc.slides.length).slice(0, 10);
  const content = [{ type: 'text', text: `${doc.name}: ${idx.length} slide(s) at ${Math.round(scale * 100)}% (${doc.width}x${doc.height} full size)` }];
  for (const i of idx) {
    const r = await fetch(`${STUDIO_URL}/api/render/${id}?slide=${i}&scale=${scale}`);
    if (!r.ok) { content.push({ type: 'text', text: `Slide ${i + 1}: render failed (${(await r.json().catch(() => ({}))).error || r.status})` }); continue; }
    content.push({ type: 'text', text: `Slide ${i + 1} · ${doc.slides[i].template || 'custom'}` });
    content.push({ type: 'image', data: Buffer.from(await r.arrayBuffer()).toString('base64'), mimeType: 'image/png' });
  }
  return { content };
});

server.registerTool('export_pngs', {
  title: 'Export PNGs',
  description: 'Render every slide at full size and save the PNGs into a folder (e.g. inside the current project). Videos, GIFs and MP4s are exported from the studio UI.',
  inputSchema: { id: z.string(), out_dir: z.string().describe('Folder to write into (created if missing), relative to the current project') },
}, async ({ id, out_dir }) => {
  if (!(await ensureStudio())) return fail(`Studio is not running at ${STUDIO_URL}`);
  const doc = await getDocument(id);
  const dir = path.resolve(process.cwd(), out_dir);
  fs.mkdirSync(dir, { recursive: true });
  const slug = doc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'goldcom';
  const files = [];
  for (let i = 0; i < doc.slides.length; i++) {
    const r = await fetch(`${STUDIO_URL}/api/render/${id}?slide=${i}&scale=1`);
    if (!r.ok) return fail(`Render failed on slide ${i + 1}`);
    const f = path.join(dir, `${slug}-${String(i + 1).padStart(2, '0')}.png`);
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    files.push(f);
  }
  return text({ saved: files });
});

server.registerTool('list_library', {
  title: 'List library designs',
  description: 'Ready-made, audited Goldcom Instagram designs (posts, carousels, reels, stories, animated posts, videos). Use create_from_library to copy one.',
  inputSchema: { category: z.enum(Object.keys(LIBRARY_CATEGORIES)).optional() },
}, async ({ category }) => text(LIBRARY.filter((i) => !category || i.category === category).map((i) => ({ id: i.id, category: i.category, kind: i.kind, format: i.format, name: i.name, tags: i.tags, notes: i.notes || null, slides: i.build('en').slides.map((s) => s.template) }))));

server.registerTool('create_from_library', {
  title: 'Create design from library',
  description: 'Copy a library design into an editable design in Arabic or English. Adapt it afterwards with edit_slide and set_caption.',
  inputSchema: { item_id: z.string(), lang: z.enum(['ar', 'en']).default('ar'), name: z.string().optional(), open: z.boolean().optional() },
}, async ({ item_id, lang, name, open = true }) => {
  const item = libraryItem(item_id);
  if (!item) return fail(`No library item "${item_id}". Call list_library.`);
  const d = buildLibraryDoc(item, lang);
  if (name) d.name = name;
  d.source = { type: 'claude-code', project: project(), cwd: process.cwd(), lastWriter: 'claude-code', library: item_id, createdAt: new Date().toISOString() };
  const saved = await saveDocument(d);
  const up = await ensureStudio();
  if (up && open) openBrowser(designUrl(saved.id));
  return text({ ...summary(saved), caption: saved.caption, notes: saved.notes || null });
});

server.registerTool('set_caption', {
  title: 'Set Instagram caption',
  description: 'Set the caption and hashtags of a design (shown in the Instagram preview and included in exports).',
  inputSchema: { id: z.string(), text: z.string(), hashtags: z.array(z.string()).max(30).optional(), notes: z.string().optional() },
}, async ({ id, text: captionText, hashtags, notes }) => {
  const doc = await getDocument(id);
  const saved = await saveDocument(stamp({ ...doc, caption: { text: captionText, hashtags: (hashtags || doc.caption?.hashtags || []).map((h) => (h.startsWith('#') ? h : `#${h}`)) }, ...(notes !== undefined ? { notes } : {}) }));
  return text({ id: saved.id, caption: saved.caption, brand_check: summary(saved).brand_check });
});

server.registerTool('brand_check', {
  title: 'Brand check',
  description: 'Run the Goldcom brand checks (claims register, name spelling, disclaimers, logo use, OMR format) on a design.',
  inputSchema: { id: z.string() },
}, async ({ id }) => text(lintDocument(await getDocument(id)).map((i) => ({ ...i, slide: i.slide + 1 }))));

server.registerTool('open_studio', {
  title: 'Open studio',
  description: 'Start the studio web app if needed and return its URL (optionally opening a design in the browser).',
  inputSchema: { id: z.string().optional(), open: z.boolean().optional() },
}, async ({ id, open = true }) => {
  const up = await ensureStudio();
  const url = id ? designUrl(id) : STUDIO_URL;
  if (up && open) openBrowser(url);
  return text(up ? { url } : `Could not start the studio. Run: cd ${STUDIO_ROOT} && npm install && npm run studio`);
});

server.registerPrompt('project_carousel', {
  title: 'Goldcom carousel for this project',
  description: 'Design an on-brand Goldcom carousel about the current project.',
  argsSchema: { language: z.string().optional().describe('ar or en (default ar)'), slides: z.string().optional().describe('Number of slides, default 7'), format: z.string().optional().describe('feed-portrait | square | story | linkedin') },
}, ({ language, slides, format }) => ({
  messages: [{ role: 'user', content: { type: 'text', text: `Use the goldcom-studio tools to design a ${slides || 7}-slide ${format || 'feed-portrait'} Instagram carousel about this project in ${language === 'en' ? 'English' : 'Arabic'}. Call studio_guide first, study the project, capture live screenshots if it has a UI, then create_design with a caption, check brand_check and render_preview, run the goldcom-auditor agent on it, fix what it finds, and give me the studio link.` } }],
}));

server.registerPrompt('project_video', {
  title: 'Goldcom video for this project',
  description: 'Design a short animated video (9:16 by default) about the current project.',
  argsSchema: { language: z.string().optional(), seconds: z.string().optional(), format: z.string().optional() },
}, ({ language, seconds, format }) => ({
  messages: [{ role: 'user', content: { type: 'text', text: `Use the goldcom-studio tools to design a ${seconds || 20}-second Instagram Reel (kind "reel", format "${format || 'story'}") about this project in ${language === 'en' ? 'English' : 'Arabic'}. Call studio_guide first. Open with a kinetic hook, use 4–6 slides with durations that add up to the target, use live templates and vary transitions (fade, slide, wipe, zoom), add a caption, then render_preview, run the goldcom-auditor agent, refine and give me the studio link so I can export the MP4.` } }],
}));

const transport = new StdioServerTransport();
await server.connect(transport);
log(`ready · studio ${STUDIO_URL} · data from ${STUDIO_ROOT}`);
