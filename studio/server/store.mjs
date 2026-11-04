// File-based storage shared by the studio HTTP server and the MCP server.
// Documents: <data>/documents/<id>.json · Assets: <data>/assets/<file>
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { atomicWrite, withFileLock } from './files.mjs';
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
  await atomicWrite(file, data);
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
  const doc = normalizeDocument(JSON.parse(await fsp.readFile(file, 'utf8')));
  doc.revision ||= 0;
  return doc;
}

export async function saveDocument(doc, { touch = true, expectedRevision = doc.revision } = {}) {
  ensureDirs();
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.slides) || doc.slides.length > 100 || doc.slides.some(s => !s || (s.layers !== undefined && !Array.isArray(s.layers)))) throw Object.assign(new Error('Invalid document: expected at most 100 slides with layer arrays'), { status: 400 });
  const d = normalizeDocument(doc);
  safeId(d.id);
  const file = path.join(DOCS_DIR, `${d.id}.json`);
  return withFileLock(file, async () => {
    let prior = null;
    try { prior = JSON.parse(await fsp.readFile(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (prior && expectedRevision !== (prior.revision || 0)) throw Object.assign(new Error('This design changed elsewhere. Reload it before saving; your unsaved edits have been kept in the editor.'), { status: 409 });
    if (prior) await writeAtomic(path.join(DATA_DIR, 'versions', d.id, `${prior.revision || 0}.json`), JSON.stringify(prior, null, 2));
    d.revision = (prior?.revision || 0) + 1;
    if (touch) d.updatedAt = new Date().toISOString();
    await writeAtomic(file, JSON.stringify(d, null, 2));
    return d;
  });
}

/** Create a document from template-based slide specs: [{ template, content, theme, duration }] */
export async function createFromSpec({ name, format, kind, lang, slides = [], source, persist = true }) {
  const doc = createDocument({ name, format, kind, lang, source });
  doc.slides = slides.map((s) => ({ template: s.template || 'statement', content: s.content || {}, theme: s.theme || 'onyx', pattern: s.pattern ?? 'top', duration: s.duration || 4, transition: s.transition || 'fade', layers: s.layers || [], custom: !!s.layers?.length && !s.template }));
  const built = applyAllTemplates(normalizeDocument(doc));
  return persist ? saveDocument(built) : built;
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

export async function listVersions(id) {
  const dir = path.join(DATA_DIR, 'versions', safeId(id));
  const files = await fsp.readdir(dir).catch(() => []);
  return (await Promise.all(files.filter(f => /^\d+\.json$/.test(f)).map(async f => {
    const d = JSON.parse(await fsp.readFile(path.join(dir,f), 'utf8'));
    return { revision: d.revision || 0, updatedAt: d.updatedAt, name: d.name };
  }))).sort((a,b) => b.revision-a.revision);
}
export async function restoreVersion(id, revision, expectedRevision) {
  if (!Number.isInteger(revision) || revision < 0) throw Object.assign(new Error('Invalid version'), { status: 400 });
  const saved = JSON.parse(await fsp.readFile(path.join(DATA_DIR, 'versions', safeId(id), `${revision}.json`), 'utf8'));
  return saveDocument({ ...saved, id, approval: null, source: { ...saved.source, lastWriter: 'studio' } }, { expectedRevision });
}
