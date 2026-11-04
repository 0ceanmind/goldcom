// Scene module registry. Every file in studio/modules/scenes/ is one 3D scene (see modules/README.md).
// The server imports each module in Node to validate it and read its metadata; the browser loads the same file.
import fs from 'node:fs';
import path from 'node:path';
import { parseMetadata } from './module-metadata.mjs';
import { DATA_DIR } from './store.mjs';
import crypto from 'node:crypto';
import { STUDIO_ROOT } from './store.mjs';

export const MODULES_DIR = process.env.GOLDCOM_STUDIO_MODULES || path.join(STUDIO_ROOT, 'modules', 'scenes');
const PENDING_DIR = path.join(DATA_DIR, 'pending-modules');
const cache = new Map(); // file -> { mtime, meta }

const ID_RE = /^[a-z0-9][a-z0-9-]{1,48}$/;

function describe(mod, file, mtime) {
  const d = mod;
  if (!d || typeof d !== 'object') throw new Error('No default export');
  if (d.create !== 'function') throw new Error('Default export has no create(api) function');
  const id = d.id || path.basename(file, '.js');
  if (!ID_RE.test(id)) throw new Error(`Invalid id "${id}" (lowercase letters, digits and dashes)`);
  if (id !== path.basename(file, '.js')) throw new Error(`id "${id}" must match the file name "${path.basename(file)}"`);
  return {
    id,
    file: path.basename(file),
    version: Math.round(mtime),
    name: d.name || id,
    description: d.description || '',
    idea: d.idea || null,
    tags: d.tags || [],
    duration: d.duration || 6,
    still: d.still ?? null,
    textZone: d.textZone || 'top',
    focusY: d.focusY ?? null,
    params: (d.params || []).map((p) => ({ key: p.key, label: p.label || p.key, type: p.type || 'text', options: p.options, default: p.default, min: p.min, max: p.max, step: p.step, hint: p.hint })),
    author: d.author || 'studio',
    status: 'ok',
  };
}

async function load(file) {
  const full = path.join(MODULES_DIR, file);
  const mtime = fs.statSync(full).mtimeMs;
  const hit = cache.get(file);
  if (hit && hit.mtime === mtime) return hit.meta;
  let meta;
  try {
    const mod = parseMetadata(fs.readFileSync(full, 'utf8'));
    meta = describe(mod, file, mtime);
  } catch (err) {
    meta = { id: path.basename(file, '.js'), file, version: Math.round(mtime), name: path.basename(file, '.js'), status: 'error', error: String(err?.message || err), params: [] };
  }
  cache.set(file, { mtime, meta });
  return meta;
}

export async function listModules() {
  if (!fs.existsSync(MODULES_DIR)) return [];
  const files = fs.readdirSync(MODULES_DIR).filter((f) => f.endsWith('.js') && !f.startsWith('_'));
  const out = await Promise.all(files.map(load));
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export async function getModule(id) {
  return (await listModules()).find((m) => m.id === id) || null;
}

export function moduleFile(file) {
  const clean = path.basename(String(file || ''));
  if (!clean.endsWith('.js')) return null;
  const full = path.join(MODULES_DIR, clean);
  return full.startsWith(MODULES_DIR) && fs.existsSync(full) ? full : null;
}

/** Write (create or replace) a scene module, then validate it. Returns its metadata; status "error" means it did not load. */
export async function writeModule(id, code) {
  if (!ID_RE.test(String(id || ''))) throw Object.assign(new Error('id must be lowercase letters, digits and dashes (2-49 chars)'), { status: 400 });
  if (typeof code !== 'string' || code.length < 40 || code.length > 512000) throw Object.assign(new Error('Scene source must be between 40 and 512000 characters'), { status: 400 });
  const parsed = describe(parseMetadata(code), `${id}.js`, Date.now());
  fs.mkdirSync(PENDING_DIR, { recursive: true });
  const digest = crypto.createHash('sha256').update(code).digest('hex');
  fs.writeFileSync(path.join(PENDING_DIR, `${id}.json`), JSON.stringify({ code, digest, meta: parsed }), { mode: 0o600 });
  return { ...parsed, status: 'pending', digest, message: 'Scene saved for source review. Approve it in Settings before it can execute in the editor.' };

}

export function readModuleSource(id) {
  const file = path.join(MODULES_DIR, `${path.basename(String(id))}.js`);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

export function pendingModules() {
  if (!fs.existsSync(PENDING_DIR)) return [];
  return fs.readdirSync(PENDING_DIR).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(PENDING_DIR,f),'utf8')));
}
export async function approveModule(id, digest) {
  if (!ID_RE.test(id)) throw Object.assign(new Error('Invalid module id'), { status: 400 });
  const file = path.join(PENDING_DIR, `${id}.json`);
  const item = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (digest !== item.digest) throw Object.assign(new Error('Scene changed since source review. Review it again.'), { status: 409 });
  parseMetadata(item.code);
  fs.mkdirSync(MODULES_DIR, { recursive: true });
  const target = path.join(MODULES_DIR, `${id}.js`);
  if (fs.existsSync(target)) { fs.mkdirSync(path.join(DATA_DIR,'module-versions'), { recursive: true }); fs.copyFileSync(target,path.join(DATA_DIR,'module-versions',`${id}-${Date.now()}.js`)); }
  fs.writeFileSync(target, item.code);
  fs.unlinkSync(file);
  cache.delete(`${id}.js`);
  return load(`${id}.js`);
}
