// Goldcom Studio server: REST API, live updates (SSE), assets, footage, AI productions, exports, updates,
// 3D scene modules, image/3D generation, the director (autonomous Claude), feedback, memory and self-repair.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {
  STUDIO_ROOT, DATA_DIR, DOCS_DIR, ensureDirs, listDocuments, getDocument, saveDocument, deleteDocument,
  createFromSpec, saveAsset, listAssets, assetPath,
} from './store.mjs';
import { templateCatalog } from '../shared/templates.js';
import { COLORS, THEMES, FORMATS, BRAND, DISCLAIMER } from '../shared/brand.js';
import { lintDocument } from '../shared/lint.js';
import { capturePage, renderDocument, browserAvailable, closeBrowser } from './browser.mjs';
import { send, readJson, readBody, serveFile } from './http-util.mjs';
import { setBroadcaster, getJob, listJobs, cancelJob, deleteJob, recoverJobs } from './jobs.mjs';
import { onFootageChange, resumeProcessing } from './footage/store.mjs';
import { footageRoutes } from './routes/footage.mjs';
import { exportRoutes } from './routes/exports.mjs';
import { systemRoutes, startUpdateChecks } from './routes/system.mjs';
import { productionRoutes } from './routes/production.mjs';
import { deviceRoutes } from './routes/device.mjs';
import { emulatorRoutes } from './routes/emulator.mjs';
import { cloudRoutes } from './routes/cloud.mjs';
import { autonomyRoutes, setupAutonomy } from './routes/autonomy.mjs';

const PORT = Number(process.env.PORT || 5177);
const HOST = process.env.HOST || '127.0.0.1';
const DIST = path.join(STUDIO_ROOT, 'dist');
const PUBLIC_URL = process.env.STUDIO_PUBLIC_URL || `http://localhost:${PORT}`;
const BASE = `http://127.0.0.1:${PORT}`;

ensureDirs();
recoverJobs().catch(() => {});
resumeProcessing().catch(() => {});

// ---------- live updates ----------
const clients = new Set();
function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) res.write(data);
}
setBroadcaster(broadcast);
setupAutonomy({ broadcast });
onFootageChange((meta) => broadcast({ type: 'footage', id: meta.id, status: meta.status || null, deleted: !!meta.deleted }));
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

// ---------- routes ----------
async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  const m = (re) => p.match(re);
  let mm;

  if (p === '/api/health') {
    let version = null;
    try { version = JSON.parse(fs.readFileSync(path.join(STUDIO_ROOT, 'package.json'), 'utf8')).version; } catch { /* ignore */ }
    return send(res, 200, { ok: true, name: 'goldcom-studio', version, pid: process.pid, root: STUDIO_ROOT, dataDir: DATA_DIR, url: PUBLIC_URL, browser: await browserAvailable() });
  }
  if (p === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify({ type: 'hello', pid: process.pid })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (p === '/api/templates') return send(res, 200, templateCatalog());
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
    const png = await renderDocument({ base: BASE, id: mm[1], slide: Number(url.searchParams.get('slide') || 0), t: url.searchParams.get('t'), scale: Number(url.searchParams.get('scale') || 1) });
    return send(res, 200, png, { 'Content-Type': 'image/png' });
  }

  // Jobs (exports, productions, captures)
  if (p === '/api/jobs' && req.method === 'GET') return send(res, 200, await listJobs(url.searchParams.get('type') || undefined));
  if ((mm = m(/^\/api\/jobs\/([\w-]+)$/))) {
    if (req.method === 'GET') return send(res, 200, await getJob(mm[1]));
    if (req.method === 'DELETE') { cancelJob(mm[1]); await deleteJob(mm[1]); return send(res, 200, { ok: true }); }
  }
  if ((mm = m(/^\/api\/jobs\/([\w-]+)\/cancel$/)) && req.method === 'POST') return send(res, 200, { ok: cancelJob(mm[1]) });

  if (await footageRoutes(req, res, url)) return;
  if (await exportRoutes(req, res, url, { base: BASE })) return;
  if (await productionRoutes(req, res, url, { base: BASE, broadcast })) return;
  if (await deviceRoutes(req, res, url, { base: BASE, broadcast })) return;
  if (await emulatorRoutes(req, res, url)) return;
  if (await cloudRoutes(req, res, url)) return;
  if (await systemRoutes(req, res, url, { broadcast, server })) return;
  if (await autonomyRoutes(req, res, url, { base: BASE })) return;

  if ((mm = m(/^\/assets\/([^/]+)$/))) {
    if (serveFile(req, res, assetPath(decodeURIComponent(mm[1])), { cache: 'public, max-age=31536000, immutable' })) return;
    return send(res, 404, { error: 'Asset not found' });
  }

  // Static frontend (production build)
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (!fs.existsSync(DIST)) return send(res, 200, '<p style="font-family:sans-serif">Goldcom Studio API is running. Build the editor with <code>npm run build</code>, or use <code>npm run dev</code>.</p>', { 'Content-Type': 'text/html' });
    const rel = p === '/' ? 'index.html' : p.slice(1);
    const file = path.join(DIST, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (file.startsWith(DIST) && serveFile(req, res, file, { cache: rel.startsWith('static/') ? 'public, max-age=31536000, immutable' : 'no-cache' })) return;
    if (serveFile(req, res, path.join(DIST, 'index.html'))) return;
  }
  return send(res, 404, { error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  try {
    await handle(req, res);
  } catch (err) {
    if (err.status !== 404) console.error(`[studio] ${req.method} ${req.url}:`, err.message);
    if (!res.headersSent) send(res, err.status || 500, { error: err.message });
    else res.end();
  }
});

// After an update the new process may start while the old one is still releasing the port: retry for a while.
let attempts = 0;
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE' && attempts++ < 50) { setTimeout(() => server.listen(PORT, HOST), 300); return; }
  console.error(`[studio] ${e.code === 'EADDRINUSE' ? `Port ${PORT} is in use. Is the studio already running? Open ${PUBLIC_URL}` : e.message}`);
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  console.log(`\n  Goldcom Studio  →  ${PUBLIC_URL}\n  Data             ${DATA_DIR}\n`);
  startUpdateChecks(broadcast);
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await closeBrowser(); process.exit(0); });
