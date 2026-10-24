// File-based storage shared by the studio HTTP server and the MCP server.
// Documents: <data>/documents/<id>.json · Assets: <data>/assets/<file>
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { normalizeDocument, createDocument } from '../shared/schema.js';
import { applyAllTemplates } from '../shared/templates.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const STUDIO_ROOT = path.resolve(here, '..');
export const DATA_DIR = path.resolve(process.env.GOLDCOM_STUDIO_DATA || path.join(STUDIO_ROOT, 'data'));
export const DOCS_DIR = path.join(DATA_DIR, 'documents');
export const ASSETS_DIR = path.join(DATA_DIR, 'assets');
const SAMPLES_DIR = path.join(STUDIO_ROOT, 'samples');

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json' };
export const mimeOf = (file) => MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
const EXT = Object.fromEntries(Object.entries(MIME).map(([k, v]) => [v, k]));

export function ensureDirs() {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  const marker = path.join(DATA_DIR, '.seeded');
  if (!fs.existsSync(marker) && fs.existsSync(SAMPLES_DIR)) {
    for (const f of fs.readdirSync(SAMPLES_DIR)) {
      const src = path.join(SAMPLES_DIR, f);
      if (f.endsWith('.json')) fs.copyFileSync(src, path.join(DOCS_DIR, f));
      else if (fs.statSync(src).isFile()) fs.copyFileSync(src, path.join(ASSETS_DIR, f));
    }
    fs.writeFileSync(marker, new Date().toISOString());
  }
}

const safeId = (id) => {
  if (!/^[\w-]+$/.test(String(id))) throw Object.assign(new Error('Invalid id'), { status: 400 });
  return id;
};

async function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, data);
  await fsp.rename(tmp, file);
}

export async function listDocuments() {
  ensureDirs();
  const files = (await fsp.readdir(DOCS_DIR)).filter((f) => f.endsWith('.json'));
  const docs = [];
  for (const f of files) {
    try {
      const d = JSON.parse(await fsp.readFile(path.join(DOCS_DIR, f), 'utf8'));
      docs.push({ id: d.id, name: d.name, format: d.format, kind: d.kind, lang: d.lang, slides: d.slides?.length || 0, updatedAt: d.updatedAt, source: d.source || null, cover: d.slides?.[0]?.theme || 'onyx' });
    } catch { /* skip partial or corrupt files */ }
  }
  return docs.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function getDocument(id) {
  ensureDirs();
  const file = path.join(DOCS_DIR, `${safeId(id)}.json`);
  if (!fs.existsSync(file)) throw Object.assign(new Error(`Document ${id} not found`), { status: 404 });
  return normalizeDocument(JSON.parse(await fsp.readFile(file, 'utf8')));
}

export async function saveDocument(doc, { touch = true } = {}) {
  ensureDirs();
  const d = normalizeDocument(doc);
  safeId(d.id);
  if (touch) d.updatedAt = new Date().toISOString();
  await writeAtomic(path.join(DOCS_DIR, `${d.id}.json`), JSON.stringify(d, null, 2));
  return d;
}

/** Create a document from template-based slide specs: [{ template, content, theme, duration }] */
export async function createFromSpec({ name, format, kind, lang, slides = [], source }) {
  const doc = createDocument({ name, format, kind, lang, source });
  doc.slides = slides.map((s) => ({ template: s.template || 'statement', content: s.content || {}, theme: s.theme || 'onyx', pattern: s.pattern ?? 'top', duration: s.duration || 4, transition: s.transition || 'fade', layers: s.layers || [], custom: !!s.layers?.length && !s.template }));
  const built = applyAllTemplates(normalizeDocument(doc));
  return saveDocument(built);
}

export async function deleteDocument(id) {
  const file = path.join(DOCS_DIR, `${safeId(id)}.json`);
  if (fs.existsSync(file)) await fsp.unlink(file);
}

export async function saveAsset(buffer, { mime, name } = {}) {
  ensureDirs();
  const ext = (name && path.extname(name).toLowerCase()) || EXT[mime] || '.png';
  if (!MIME[ext]) throw Object.assign(new Error(`Unsupported file type ${ext}`), { status: 415 });
  const hash = crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 16);
  const base = (name ? path.basename(name, path.extname(name)) : 'asset').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'asset';
  const file = `${base}-${hash}${ext}`;
  const full = path.join(ASSETS_DIR, file);
  if (!fs.existsSync(full)) await fsp.writeFile(full, buffer);
  return { file, url: `/assets/${file}`, mime: MIME[ext], bytes: buffer.length };
}

export async function saveAssetFromPath(p) {
  const abs = path.resolve(p);
  const buf = await fsp.readFile(abs);
  return saveAsset(buf, { name: path.basename(abs) });
}

export async function listAssets() {
  ensureDirs();
  const files = await fsp.readdir(ASSETS_DIR);
  const out = [];
  for (const f of files) {
    if (!MIME[path.extname(f).toLowerCase()]) continue;
    const st = await fsp.stat(path.join(ASSETS_DIR, f));
    out.push({ file: f, url: `/assets/${f}`, mime: mimeOf(f), bytes: st.size, mtime: st.mtimeMs });
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

export function assetPath(file) {
  const f = path.basename(String(file));
  return path.join(ASSETS_DIR, f);
}
