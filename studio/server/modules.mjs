// Scene module registry. Every file in studio/modules/scenes/ is one 3D scene (see modules/README.md).
// The server imports each module in Node to validate it and read its metadata; the browser loads the same file.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { STUDIO_ROOT } from './store.mjs';

export const MODULES_DIR = path.join(STUDIO_ROOT, 'modules', 'scenes');
const cache = new Map(); // file -> { mtime, meta }

const ID_RE = /^[a-z0-9][a-z0-9-]{1,48}$/;

function describe(mod, file, mtime) {
  const d = mod?.default;
  if (!d || typeof d !== 'object') throw new Error('No default export');
  if (typeof d.create !== 'function') throw new Error('Default export has no create(api) function');
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
    const mod = await import(`${pathToFileURL(full).href}?v=${mtime}`);
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
  if (typeof code !== 'string' || code.length < 40) throw Object.assign(new Error('code is required'), { status: 400 });
  if (/\bimport\s*[\w{*]|\brequire\s*\(/.test(code)) throw Object.assign(new Error('Scene modules must not import anything: use api.THREE and api.kit'), { status: 400 });
  fs.mkdirSync(MODULES_DIR, { recursive: true });
  const file = path.join(MODULES_DIR, `${id}.js`);
  const backup = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  fs.writeFileSync(file, code);
  const meta = await load(`${id}.js`);
  return { ...meta, replaced: backup !== null, backup };
}

export function readModuleSource(id) {
  const file = path.join(MODULES_DIR, `${path.basename(String(id))}.js`);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}
