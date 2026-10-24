// Goldcom Studio server: REST API, live updates (SSE), assets, URL capture and PNG rendering.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {
  STUDIO_ROOT, DATA_DIR, DOCS_DIR, ensureDirs, listDocuments, getDocument, saveDocument, deleteDocument,
  createFromSpec, saveAsset, listAssets, assetPath, mimeOf,
} from './store.mjs';
import { templateCatalog, setSceneRegistry } from '../shared/templates.js';
import { COLORS, THEMES, FORMATS, BRAND, DISCLAIMER } from '../shared/brand.js';
import { lintDocument } from '../shared/lint.js';
import { capturePage, renderDocument, renderScene, rasterizeSvg, browserAvailable, closeBrowser } from './browser.mjs';
import { generate, generatorStatus, rankProviders, publicSettings, writeSettings, INTENTS, KEY_NAMES } from './generators.mjs';
import { listModules, moduleFile, MODULES_DIR } from './modules.mjs';
import { recordError, listErrors, updateError, recordFeedback, listFeedback, feedbackThemes, readLessons, addLesson, providerStats, listGenerations, listKnowledge, FEEDBACK_REASONS } from './memory.mjs';
import { agentStatus, startTask, getTask, listTasks, cancelTask, maybeRepair, setAgentBroadcast } from './agent.mjs';

const PORT = Number(process.env.PORT || 5177);
const HOST = process.env.HOST || '127.0.0.1';
const DIST = path.join(STUDIO_ROOT, 'dist');
const PUBLIC_URL = process.env.STUDIO_PUBLIC_URL || `http://localhost:${PORT}`;

ensureDirs();

// ---------- live updates ----------
const clients = new Set();
function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) res.write(data);
}
const pending = new Map();
fs.watch(DOCS_DIR, (_, file) => {
  if (!file || !file.endsWith('.json')) return;
  clearTimeout(pending.get(file));
  pending.set(file, setTimeout(async () => {
    const id = file.replace(/\.json$/, '');
    try {
      const d = JSON.parse(fs.readFileSync(path.join(DOCS_DIR, file), 'utf8'));
      broadcast({ type: 'document', id, name: d.name, updatedAt: d.updatedAt, origin: d.source?.lastWriter || null });
    } catch {
      if (!fs.existsSync(path.join(DOCS_DIR, file))) broadcast({ type: 'deleted', id });
    }
  }, 120));
});
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000).unref();

// Scene modules: tell open editors to reload a module when its file changes (Claude writes new ones while you watch).
fs.mkdirSync(MODULES_DIR, { recursive: true });
const pendingMods = new Map();
fs.watch(MODULES_DIR, (_, file) => {
  if (!file || !file.endsWith('.js')) return;
  clearTimeout(pendingMods.get(file));
  pendingMods.set(file, setTimeout(async () => {
    setSceneRegistry(await listModules());
    broadcast({ type: 'module', id: file.replace(/\.js$/, '') });
  }, 150));
});
listModules().then(setSceneRegistry).catch(() => {});

// Scene thumbnails are rendered headless once per module version and cached on disk.
const PREVIEW_CACHE = path.join(DATA_DIR, 'cache', 'scene-previews');

/** Place a generated image into a design: as the slide background, or as a layer. */
async function attachGenerated({ docId, slide = 0, as = 'layer' }, src, gen) {
  const doc = await getDocument(docId);
  const s = doc.slides[Math.min(Number(slide) || 0, doc.slides.length - 1)];
  if (!s) throw Object.assign(new Error('Slide not found'), { status: 404 });
  if (as === 'background') s.bg = { type: 'image', src };
  else {
    const w = Math.round(doc.width * 0.8), h = Math.round(w * (doc.height / doc.width) * 0.6);
    s.layers.push({ id: `l_${Date.now().toString(36)}`, type: 'image', name: 'generated', src, fit: 'cover', radius: 24, x: Math.round((doc.width - w) / 2), y: Math.round((doc.height - h) / 2), w, h, rotation: 0, opacity: 1, anim: { in: 'fade-up', delay: 0.2, dur: 0.8 }, meta: { provider: gen.provider, model: gen.model, intent: gen.intent } });
    s.custom = !!s.template || s.custom;
  }
  doc.source = { ...(doc.source || {}), lastWriter: 'studio-generator' };
  await saveDocument(doc);
  return { docId, slide: Number(slide) || 0, as };
}

// Self-repair: every new error signature can start a repair task (rate-limited, see agent.mjs).
const onNewError = (entry) => { try { const t = maybeRepair(entry); if (t) broadcast({ type: 'repair', sig: entry.sig, taskId: t.id, module: entry.module }); } catch (e) { console.error('[studio] repair:', e.message); } };

/** Which scenes and generators a design used: feedback on the design feeds back into their scores. */
function usedBy(doc) {
  const scenes = new Set(), providers = [];
  for (const s of doc.slides || []) for (const l of s.layers || []) {
    if (l.type === 'scene3d' && l.scene) scenes.add(l.scene);
    if (l.meta?.provider) providers.push({ provider: l.meta.provider, intent: l.meta.intent });
  }
  return { scenes: [...scenes], providers };
}

// ---------- helpers ----------
function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  res.writeHead(status, { 'Content-Type': isBuf ? 'application/octet-stream' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(isBuf || typeof body === 'string' ? body : JSON.stringify(body));
}
function readBody(req, limit = 60 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Body too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
const readJson = async (req) => { const b = await readBody(req); return b.length ? JSON.parse(b.toString('utf8')) : {}; };

function serveFile(res, file, cache = 'no-cache') {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  res.writeHead(200, { 'Content-Type': mimeOf(file) === 'application/octet-stream' ? staticMime(file) : mimeOf(file), 'Cache-Control': cache });
  fs.createReadStream(file).pipe(res);
  return true;
}
function staticMime(file) {
  const ext = path.extname(file);
  return { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.map': 'application/json' }[ext] || 'application/octet-stream';
}

// ---------- routes ----------
async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  const m = (re) => p.match(re);
  let mm;

  if (p === '/api/health') return send(res, 200, { ok: true, name: 'goldcom-studio', root: STUDIO_ROOT, dataDir: DATA_DIR, url: PUBLIC_URL, browser: await browserAvailable() });
  if (p === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify({ type: 'hello' })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (p === '/api/templates') return send(res, 200, templateCatalog());
  if (p === '/api/modules') return send(res, 200, await listModules());
  if ((mm = m(/^\/modules\/scenes\/([\w.-]+\.js)$/))) {
    const file = moduleFile(mm[1]);
    if (file) { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }); fs.createReadStream(file).pipe(res); return; }
    return send(res, 404, { error: 'Module not found' });
  }
  if (p === '/api/errors' && req.method === 'POST') {
    const body = await readJson(req);
    const { entry, isNew } = recordError(body);
    broadcast({ type: 'error', sig: entry.sig, source: entry.source, module: entry.module, message: entry.message, isNew });
    if (isNew) onNewError?.(entry);
    return send(res, 201, { sig: entry.sig, isNew });
  }
  if (p === '/api/errors' && req.method === 'GET') return send(res, 200, listErrors({ status: url.searchParams.get('status') || undefined }));
  if ((mm = m(/^\/api\/errors\/(\w+)$/)) && req.method === 'PATCH') return send(res, 200, updateError(mm[1], await readJson(req)));
  if (p === '/api/brand') return send(res, 200, { brand: BRAND, colors: COLORS, themes: THEMES, formats: FORMATS, disclaimer: DISCLAIMER });

  if (p === '/api/documents' && req.method === 'GET') return send(res, 200, await listDocuments());
  if (p === '/api/documents' && req.method === 'POST') {
    const body = await readJson(req);
    const doc = body.slides?.some((s) => s.template && !s.layers?.length) && !body.id ? await createFromSpec(body) : await saveDocument(body);
    return send(res, 201, doc);
  }
  if ((mm = m(/^\/api\/documents\/([\w-]+)$/))) {
    const id = mm[1];
    if (req.method === 'GET') return send(res, 200, await getDocument(id));
    if (req.method === 'PUT') { const body = await readJson(req); return send(res, 200, await saveDocument({ ...body, id })); }
    if (req.method === 'DELETE') { await deleteDocument(id); return send(res, 200, { ok: true }); }
  }
  if ((mm = m(/^\/api\/documents\/([\w-]+)\/lint$/))) return send(res, 200, lintDocument(await getDocument(mm[1])));

  if (p === '/api/assets' && req.method === 'GET') return send(res, 200, await listAssets());
  if (p === '/api/assets' && req.method === 'POST') {
    const buf = await readBody(req);
    const name = decodeURIComponent(req.headers['x-filename'] || 'upload');
    return send(res, 201, await saveAsset(buf, { mime: req.headers['content-type'], name }));
  }
  if (p === '/api/capture' && req.method === 'POST') {
    const body = await readJson(req);
    const png = await capturePage(body);
    const host = (() => { try { return new URL(body.url).hostname; } catch { return 'capture'; } })();
    return send(res, 201, await saveAsset(png, { name: `${host}-${body.device || 'phone'}.png` }));
  }
  if ((mm = m(/^\/api\/render\/([\w-]+)$/))) {
    const png = await renderDocument({ base: `http://127.0.0.1:${PORT}`, id: mm[1], slide: Number(url.searchParams.get('slide') || 0), t: url.searchParams.get('t'), scale: Number(url.searchParams.get('scale') || 1) });
    return send(res, 200, png, { 'Content-Type': 'image/png' });
  }

  if ((mm = m(/^\/api\/scene-preview\/([\w-]+)$/))) {
    const sp = url.searchParams;
    let params = {};
    try { params = JSON.parse(sp.get('params') || '{}'); } catch { /* ignore */ }
    const meta = (await listModules()).find((x) => x.id === mm[1]);
    const opts = { id: mm[1], params, t: sp.get('t'), w: Math.min(2160, Number(sp.get('w') || 1080)), h: Math.min(3840, Number(sp.get('h') || 1350)), theme: sp.get('theme') || 'onyx', lang: sp.get('lang') || 'en', transparent: sp.get('transparent') === '1', dur: Number(sp.get('dur') || 6), focusY: sp.get('focusY'), post: sp.get('post') || undefined };
    const key = `${mm[1]}-${meta?.version || 0}-${Buffer.from(JSON.stringify(opts)).toString('base64url').slice(0, 120)}`;
    const cached = path.join(PREVIEW_CACHE, `${key}.png`);
    if (fs.existsSync(cached)) return send(res, 200, fs.readFileSync(cached), { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' });
    const r = await renderScene({ base: `http://127.0.0.1:${PORT}`, ...opts });
    fs.mkdirSync(PREVIEW_CACHE, { recursive: true });
    fs.writeFileSync(cached, r.png);
    return send(res, 200, r.png, { 'Content-Type': 'image/png', 'X-Render-Ms': String(r.ms || 0) });
  }
  // ---------- director (autonomous agent) ----------
  if (p === '/api/agent/status') return send(res, 200, agentStatus());
  if (p === '/api/agent/tasks' && req.method === 'GET') return send(res, 200, listTasks());
  if (p === '/api/agent/tasks' && req.method === 'POST') return send(res, 201, startTask(await readJson(req)));
  if ((mm = m(/^\/api\/agent\/tasks\/([\w-]+)$/))) return send(res, getTask(mm[1]) ? 200 : 404, getTask(mm[1]) || { error: 'Task not found' });
  if ((mm = m(/^\/api\/agent\/tasks\/([\w-]+)\/cancel$/)) && req.method === 'POST') return send(res, 200, cancelTask(mm[1]));

  // ---------- feedback & memory ----------
  if (p === '/api/feedback' && req.method === 'POST') {
    const body = await readJson(req);
    let used = { scenes: [], providers: [] };
    try { if (body.designId) used = usedBy(await getDocument(body.designId)); } catch { /* design may be gone */ }
    const fb = recordFeedback({ ...body, ...used });
    let task = null;
    if (fb.status === 'needs-revision' && body.improve !== false && agentStatus().available) {
      task = startTask({ mode: 'revise', brief: `Improve design ${body.designId} based on the user's feedback.`, designId: body.designId, slide: body.slide, feedback: { reasons: (body.reasons || []).map((r) => FEEDBACK_REASONS[r] || r), note: body.note }, feedbackId: fb.id });
    }
    broadcast({ type: 'feedback', id: fb.id, designId: fb.designId, taskId: task?.id || null });
    return send(res, 201, { feedback: fb, task: task ? { id: task.id, status: task.status } : null, agent: agentStatus().available ? null : agentStatus().why });
  }
  if (p === '/api/feedback' && req.method === 'GET') return send(res, 200, listFeedback({ designId: url.searchParams.get('designId') || undefined }));
  if (p === '/api/memory') return send(res, 200, { lessons: readLessons(), themes: feedbackThemes(), reasons: FEEDBACK_REASONS, feedback: listFeedback({ limit: 20 }), errors: listErrors().slice(0, 20), stats: providerStats(), generations: listGenerations({ limit: 20 }), knowledge: listKnowledge(), tasks: listTasks({ limit: 10 }) });
  if (p === '/api/lessons' && req.method === 'POST') { const b = await readJson(req); return send(res, 201, addLesson({ ...b, source: b.source || 'user' })); }

  // ---------- generation ----------
  if (p === '/api/generators') return send(res, 200, { providers: generatorStatus(), intents: INTENTS, ranking: Object.fromEntries(Object.keys(INTENTS).map((i) => [i, rankProviders(i)])) });
  if (p === '/api/settings' && req.method === 'GET') return send(res, 200, publicSettings());
  if (p === '/api/settings' && req.method === 'PUT') {
    const body = await readJson(req);
    const keys = {};
    for (const k of KEY_NAMES) if (body.keys && k in body.keys) keys[k] = body.keys[k];
    writeSettings({ ...(body.models ? { models: body.models } : {}), ...(body.providers ? { providers: body.providers } : {}), ...(Object.keys(keys).length ? { keys } : {}), ...('autoRepair' in body ? { autoRepair: !!body.autoRepair } : {}), ...(body.director ? { director: body.director } : {}) });
    return send(res, 200, publicSettings());
  }
  if (p === '/api/generate' && req.method === 'POST') {
    const body = await readJson(req);
    const references = (body.references || []).map((u) => { const f = assetPath(String(u).replace(/^\/assets\//, '')); return fs.existsSync(f) ? { buffer: fs.readFileSync(f), mime: mimeOf(f), name: path.basename(f) } : null; }).filter(Boolean);
    const ctx = { renderScene: (o) => renderScene({ base: `http://127.0.0.1:${PORT}`, ...o }), rasterize: rasterizeSvg };
    const out = await generate({ ...body, references }, ctx);
    if (body.attach?.docId) out.attached = await attachGenerated(body.attach, out.asset.url, out);
    broadcast({ type: 'generated', file: out.asset.file, provider: out.provider, intent: out.intent });
    return send(res, 201, out);
  }
  if ((mm = m(/^\/assets\/([^/]+)$/))) {
    if (serveFile(res, assetPath(decodeURIComponent(mm[1])), 'public, max-age=31536000, immutable')) return;
    return send(res, 404, { error: 'Asset not found' });
  }

  // Static frontend (production build)
  if (req.method === 'GET') {
    if (!fs.existsSync(DIST)) return send(res, 200, '<p style="font-family:sans-serif">Goldcom Studio API is running. Build the editor with <code>npm run build</code>, or use <code>npm run dev</code>.</p>', { 'Content-Type': 'text/html' });
    const rel = p === '/' ? 'index.html' : p.slice(1);
    const file = path.join(DIST, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (file.startsWith(DIST) && serveFile(res, file, rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache')) return;
    if (serveFile(res, path.join(DIST, 'index.html'))) return;
  }
  return send(res, 404, { error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  try {
    await handle(req, res);
  } catch (err) {
    console.error(`[studio] ${req.method} ${req.url}:`, err.message);
    if (!res.headersSent) send(res, err.status || 500, { error: err.message });
    else res.end();
  }
});

setAgentBroadcast(broadcast);

server.listen(PORT, HOST, () => {
  console.log(`\n  Goldcom Studio  →  ${PUBLIC_URL}\n  Data             ${DATA_DIR}\n`);
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await closeBrowser(); process.exit(0); });
