// 3D scene modules, image/3D generation, the director (autonomous Claude), feedback, memory and self-repair.
import fs from 'node:fs';
import path from 'node:path';
import { send, readJson } from '../http-util.mjs';
import { DATA_DIR, getDocument, saveDocument, assetPath, mimeOf } from '../store.mjs';
import { setSceneRegistry } from '../../shared/templates.js';
import { renderScene, rasterizeSvg } from '../browser.mjs';
import { generate, generatorStatus, rankProviders, publicGeneratorSettings, writeGeneratorSettings, INTENTS, KEY_NAMES } from '../generators.mjs';
import { listModules, moduleFile, MODULES_DIR } from '../modules.mjs';
import { recordError, listErrors, updateError, recordFeedback, listFeedback, feedbackThemes, readLessons, addLesson, providerStats, listGenerations, listKnowledge, FEEDBACK_REASONS } from '../memory.mjs';
import { agentStatus, startTask, getTask, listTasks, cancelTask, maybeRepair, setAgentBroadcast } from '../agent.mjs';

const PREVIEW_CACHE = path.join(DATA_DIR, 'cache', 'scene-previews');
let broadcast = () => {};

/** Start the module watcher (editors reload a scene the moment its file changes) and the self-repair hook. */
export function setupAutonomy({ broadcast: b }) {
  broadcast = b;
  setAgentBroadcast(b);
  fs.mkdirSync(MODULES_DIR, { recursive: true });
  const pending = new Map();
  fs.watch(MODULES_DIR, (_, file) => {
    if (!file || !file.endsWith('.js')) return;
    clearTimeout(pending.get(file));
    pending.set(file, setTimeout(async () => {
      setSceneRegistry(await listModules());
      broadcast({ type: 'module', id: file.replace(/\.js$/, '') });
    }, 150));
  });
  listModules().then(setSceneRegistry).catch(() => {});
}

// Every new error signature can start a repair task (rate-limited, see agent.mjs).
function onNewError(entry) {
  try { const t = maybeRepair(entry); if (t) broadcast({ type: 'repair', sig: entry.sig, taskId: t.id, module: entry.module }); } catch (e) { console.error('[studio] repair:', e.message); }
}

/** Which scenes and generators a design used: feedback on the design feeds back into their scores. */
function usedBy(doc) {
  const scenes = new Set(), providers = [];
  for (const s of doc.slides || []) for (const l of s.layers || []) {
    if (l.type === 'scene3d' && l.scene) scenes.add(l.scene);
    if (l.meta?.provider) providers.push({ provider: l.meta.provider, intent: l.meta.intent });
  }
  return { scenes: [...scenes], providers };
}

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

export async function autonomyRoutes(req, res, url, { base }) {
  const p = url.pathname;
  const m = (re) => p.match(re);
  let mm;

  // ---------- scene modules ----------
  if (p === '/api/modules') { send(res, 200, await listModules()); return true; }
  if ((mm = m(/^\/modules\/scenes\/([\w.-]+\.js)$/))) {
    const file = moduleFile(mm[1]);
    if (!file) { send(res, 404, { error: 'Module not found' }); return true; }
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
    return true;
  }
  if ((mm = m(/^\/api\/scene-preview\/([\w-]+)$/))) {
    const sp = url.searchParams;
    let params = {};
    try { params = JSON.parse(sp.get('params') || '{}'); } catch { /* ignore */ }
    const meta = (await listModules()).find((x) => x.id === mm[1]);
    const opts = { id: mm[1], params, t: sp.get('t'), w: Math.min(2160, Number(sp.get('w') || 1080)), h: Math.min(3840, Number(sp.get('h') || 1350)), theme: sp.get('theme') || 'onyx', lang: sp.get('lang') || 'en', transparent: sp.get('transparent') === '1', dur: Number(sp.get('dur') || 6), focusY: sp.get('focusY'), post: sp.get('post') || undefined };
    // Thumbnails are rendered once per module version and cached on disk.
    const key = `${mm[1]}-${meta?.version || 0}-${Buffer.from(JSON.stringify(opts)).toString('base64url').slice(0, 120)}`;
    const cached = path.join(PREVIEW_CACHE, `${key}.png`);
    if (fs.existsSync(cached)) { send(res, 200, fs.readFileSync(cached), { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' }); return true; }
    const r = await renderScene({ base, ...opts });
    fs.mkdirSync(PREVIEW_CACHE, { recursive: true });
    fs.writeFileSync(cached, r.png);
    send(res, 200, r.png, { 'Content-Type': 'image/png', 'X-Render-Ms': String(r.ms || 0) });
    return true;
  }

  // ---------- errors (self-repair inbox) ----------
  if (p === '/api/errors' && req.method === 'POST') {
    const body = await readJson(req);
    const { entry, isNew } = recordError(body);
    broadcast({ type: 'error', sig: entry.sig, source: entry.source, module: entry.module, message: entry.message, isNew });
    if (isNew) onNewError(entry);
    send(res, 201, { sig: entry.sig, isNew });
    return true;
  }
  if (p === '/api/errors' && req.method === 'GET') { send(res, 200, listErrors({ status: url.searchParams.get('status') || undefined })); return true; }
  if ((mm = m(/^\/api\/errors\/(\w+)$/)) && req.method === 'PATCH') { send(res, 200, updateError(mm[1], await readJson(req))); return true; }

  // ---------- director ----------
  if (p === '/api/agent/status') { send(res, 200, agentStatus()); return true; }
  if (p === '/api/agent/tasks' && req.method === 'GET') { send(res, 200, listTasks()); return true; }
  if (p === '/api/agent/tasks' && req.method === 'POST') { send(res, 201, startTask(await readJson(req))); return true; }
  if ((mm = m(/^\/api\/agent\/tasks\/([\w-]+)$/))) { const t = getTask(mm[1]); send(res, t ? 200 : 404, t || { error: 'Task not found' }); return true; }
  if ((mm = m(/^\/api\/agent\/tasks\/([\w-]+)\/cancel$/)) && req.method === 'POST') { send(res, 200, cancelTask(mm[1])); return true; }

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
    send(res, 201, { feedback: fb, task: task ? { id: task.id, status: task.status } : null, agent: agentStatus().available ? null : agentStatus().why });
    return true;
  }
  if (p === '/api/feedback' && req.method === 'GET') { send(res, 200, listFeedback({ designId: url.searchParams.get('designId') || undefined })); return true; }
  if (p === '/api/memory') { send(res, 200, { lessons: readLessons(), themes: feedbackThemes(), reasons: FEEDBACK_REASONS, feedback: listFeedback({ limit: 20 }), errors: listErrors().slice(0, 20), stats: providerStats(), generations: listGenerations({ limit: 20 }), knowledge: listKnowledge(), tasks: listTasks({ limit: 10 }) }); return true; }
  if (p === '/api/lessons' && req.method === 'POST') { const b = await readJson(req); send(res, 201, addLesson({ ...b, source: b.source || 'user' })); return true; }

  // ---------- generation ----------
  if (p === '/api/generators') { send(res, 200, { providers: generatorStatus(), intents: INTENTS, ranking: Object.fromEntries(Object.keys(INTENTS).map((i) => [i, rankProviders(i)])) }); return true; }
  if (p === '/api/generators/settings' && req.method === 'GET') { send(res, 200, publicGeneratorSettings()); return true; }
  if (p === '/api/generators/settings' && req.method === 'PUT') {
    const body = await readJson(req);
    const keys = {};
    for (const k of KEY_NAMES) if (body.keys && k in body.keys) keys[k] = body.keys[k];
    writeGeneratorSettings({ ...(body.models ? { models: body.models } : {}), ...(body.providers ? { providers: body.providers } : {}), ...(Object.keys(keys).length ? { keys } : {}), ...('autoRepair' in body ? { autoRepair: !!body.autoRepair } : {}), ...(body.director ? { director: body.director } : {}) });
    send(res, 200, publicGeneratorSettings());
    return true;
  }
  if (p === '/api/generate' && req.method === 'POST') {
    const body = await readJson(req);
    const references = (body.references || []).map((u) => { const f = assetPath(String(u).replace(/^\/assets\//, '')); return fs.existsSync(f) ? { buffer: fs.readFileSync(f), mime: mimeOf(f), name: path.basename(f) } : null; }).filter(Boolean);
    const ctx = { renderScene: (o) => renderScene({ base, ...o }), rasterize: rasterizeSvg };
    const out = await generate({ ...body, references }, ctx);
    if (body.attach?.docId) out.attached = await attachGenerated(body.attach, out.asset.url, out);
    broadcast({ type: 'generated', file: out.asset.file, provider: out.provider, intent: out.intent });
    send(res, 201, out);
    return true;
  }
  return false;
}
