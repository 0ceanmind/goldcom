// Local settings (<data>/settings.json). Secrets never leave this machine and are masked in API responses.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './store.mjs';

const FILE = path.join(DATA_DIR, 'settings.json');

export const DEFAULTS = {
  engine: 'auto', // auto | api | claude-code
  anthropicApiKey: '',
  model: 'claude-opus-5-5',
  effort: 'high',
  claudePath: '', // custom path to the `claude` CLI
  language: 'ar', // default content language
  appPackage: '', // Android package of the Goldcom app (auto-detected when empty)
  captureDevice: '', // adb serial to film with ('' = automatic: emulator, then any connected phone)
  cloudPhones: [], // saved cloud phones: [{ name, provider, address: 'host:port' }]
  updateBranch: '', // empty = studio/release.json
  autoUpdateCheck: true,
  exportFps: 30,
  music: 'none', // default bed for productions: none | library name
  githubToken: '',
  // Image and 3D generators (see generators.mjs). keys: { OPENAI_API_KEY, GEMINI_API_KEY, MESHY_API_KEY, TRIPO_API_KEY }
  keys: {},
  models: {}, // overrides; providers rewrite them when a model is retired
  providers: {}, // { openai: false } turns a provider off
  autoRepair: true, // renderer errors start a repair task
  director: {}, // { model, maxTurns, useApiKey }
};

const SECRET = new Set(['anthropicApiKey', 'githubToken']);
let cache = null;

export function getSettings() {
  if (!cache) {
    try { cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { cache = { ...DEFAULTS }; }
  }
  return cache;
}

export function updateSettings(patch = {}) {
  const cur = getSettings();
  const next = { ...cur };
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULTS)) continue;
    // A masked secret coming back from the UI means "unchanged".
    if (SECRET.has(k) && typeof v === 'string' && v.includes('•')) continue;
    if (k === 'keys' && v && typeof v === 'object') {
      // Masked keys echoed back by a settings form keep their stored value.
      next.keys = { ...(cur.keys || {}) };
      for (const [name, val] of Object.entries(v)) if (!(typeof val === 'string' && val.includes('•'))) { if (val) next.keys[name] = val; else delete next.keys[name]; }
      continue;
    }
    next[k] = v;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  cache = next;
  return next;
}

export function publicSettings() {
  const s = getSettings();
  const out = {};
  for (const [k, v] of Object.entries(s)) out[k] = SECRET.has(k) && v ? `${'•'.repeat(8)}${String(v).slice(-4)}` : v;
  // Generator keys are never sent back, only whether they are set.
  out.keys = Object.fromEntries(Object.entries(s.keys || {}).map(([k, v]) => [k, v ? `${'•'.repeat(8)}${String(v).slice(-4)}` : '']));
  out.hasApiKey = !!(s.anthropicApiKey || process.env.ANTHROPIC_API_KEY);
  return out;
}
