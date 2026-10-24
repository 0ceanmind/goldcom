// The studio's memory: what went wrong (errors), what the user thought (feedback), what was learned (lessons)
// and how well each generator performs (provider stats). Shared by the HTTP server and the MCP server.
//
// Raw events live in <data>/memory/ (local, git-ignored). Curated lessons live in studio/knowledge/lessons.md
// so they travel with the repository and every future session starts from them.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR, STUDIO_ROOT } from './store.mjs';

export const MEMORY_DIR = path.join(DATA_DIR, 'memory');
export const KNOWLEDGE_DIR = path.join(STUDIO_ROOT, 'knowledge');
const ERRORS = path.join(MEMORY_DIR, 'errors.json');
const FEEDBACK = path.join(MEMORY_DIR, 'feedback.jsonl');
const GENERATIONS = path.join(MEMORY_DIR, 'generations.jsonl');
const STATS = path.join(MEMORY_DIR, 'provider-stats.json');
export const LESSONS = path.join(KNOWLEDGE_DIR, 'lessons.md');

const now = () => new Date().toISOString();
const ensure = () => fs.mkdirSync(MEMORY_DIR, { recursive: true });
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, v) => { ensure(); const tmp = `${f}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(v, null, 2)); fs.renameSync(tmp, f); };
const appendJsonl = (f, v) => { ensure(); fs.appendFileSync(f, `${JSON.stringify(v)}\n`); };
const readJsonl = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } };

// ---------- errors (self-healing inbox) ----------
export function recordError(e) {
  const message = String(e.message || 'Unknown error').slice(0, 2000);
  const sig = crypto.createHash('sha1').update(`${e.source}|${e.module || ''}|${e.phase || ''}|${message.replace(/\d+/g, '#')}`).digest('hex').slice(0, 12);
  const all = readJson(ERRORS, []);
  let entry = all.find((x) => x.sig === sig);
  const isNew = !entry || entry.status === 'fixed';
  if (!entry) {
    entry = { sig, source: e.source || 'unknown', module: e.module || null, phase: e.phase || null, message, stack: String(e.stack || '').slice(0, 4000), url: e.url || null, context: e.context || null, count: 0, firstAt: now(), status: 'open', attempts: 0 };
    all.unshift(entry);
  }
  entry.count += 1;
  entry.lastAt = now();
  if (entry.status === 'fixed') entry.status = 'open';
  writeJson(ERRORS, all.slice(0, 200));
  return { entry, isNew };
}

export function listErrors({ status } = {}) {
  const all = readJson(ERRORS, []);
  return status ? all.filter((e) => e.status === status) : all;
}

export function updateError(sig, patch) {
  const all = readJson(ERRORS, []);
  const e = all.find((x) => x.sig === sig);
  if (!e) return null;
  Object.assign(e, patch, { updatedAt: now() });
  writeJson(ERRORS, all);
  return e;
}

// ---------- feedback ----------
export const FEEDBACK_REASONS = {
  'too-much-text': 'Too much text',
  generic: 'Looks generic / AI-made',
  'visual-quality': 'Visuals not polished enough',
  'wrong-idea': "Doesn't show the idea",
  'motion-feel': 'Motion feels off (too slow, too busy, stiff)',
  'off-brand': 'Off-brand colours, type or logo',
  copy: 'Copy sounds wrong',
  arabic: 'Arabic needs fixing',
  layout: 'Layout, spacing or crop',
  'not-premium': 'Not premium enough',
};

export function recordFeedback({ designId, slide = null, rating, reasons = [], note = '', taskId = null, scenes = [], providers = [] }) {
  const entry = { id: `fb_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: now(), designId, slide, rating, reasons, note: String(note || '').slice(0, 4000), taskId, scenes, providers, status: rating === 'down' || rating <= 2 ? 'needs-revision' : 'ok' };
  appendJsonl(FEEDBACK, entry);
  // Feed the generator scores: a disliked design lowers the providers that made its images.
  for (const p of providers) rateProvider(p.provider, p.intent || 'any', entry.status === 'ok' ? 1 : -1);
  return entry;
}

export function listFeedback({ limit = 50, designId } = {}) {
  let all = readJsonl(FEEDBACK).reverse();
  if (designId) all = all.filter((f) => f.designId === designId);
  return all.slice(0, limit);
}

export function updateFeedback(id, patch) {
  const all = readJsonl(FEEDBACK);
  const f = all.find((x) => x.id === id);
  if (!f) return null;
  Object.assign(f, patch);
  ensure();
  fs.writeFileSync(FEEDBACK, all.map((x) => JSON.stringify(x)).join('\n') + '\n');
  return f;
}

/** Counts of the reasons the user gave, newest weighted higher, so recurring complaints surface first. */
export function feedbackThemes() {
  const counts = {};
  readJsonl(FEEDBACK).forEach((f, i, arr) => {
    const w = 1 + i / Math.max(1, arr.length);
    for (const r of f.reasons || []) counts[r] = (counts[r] || 0) + w;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([reason, weight]) => ({ reason, label: FEEDBACK_REASONS[reason] || reason, weight: Math.round(weight * 10) / 10 }));
}

// ---------- lessons (curated, in the repo) ----------
export function readLessons() {
  try { return fs.readFileSync(LESSONS, 'utf8'); } catch { return ''; }
}

/** Append a lesson under a category heading in knowledge/lessons.md. */
export function addLesson({ rule, why = '', category = 'General', source = 'feedback' }) {
  const text = String(rule || '').trim();
  if (!text) throw Object.assign(new Error('rule is required'), { status: 400 });
  fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
  let md = readLessons() || '# Lessons learned\n\nRules the studio has learned from feedback and mistakes. Read before every task. Newest first within each section.\n';
  if (md.toLowerCase().includes(text.toLowerCase())) return { added: false, reason: 'already known' };
  const line = `- ${text}${why ? ` _(why: ${why})_` : ''} <!-- ${source}, ${now().slice(0, 10)} -->`;
  const heading = `## ${category}`;
  if (md.includes(`\n${heading}\n`)) md = md.replace(`\n${heading}\n`, `\n${heading}\n${line}\n`);
  else md = `${md.trimEnd()}\n\n${heading}\n${line}\n`;
  fs.writeFileSync(LESSONS, md);
  return { added: true, line };
}

// ---------- generator stats (the router learns from these) ----------
export function recordGeneration(g) {
  appendJsonl(GENERATIONS, { at: now(), ...g });
  const stats = readJson(STATS, {});
  const key = `${g.provider}|${g.intent || 'any'}`;
  const s = (stats[key] ||= { ok: 0, fail: 0, ms: 0, score: 0, votes: 0 });
  if (g.ok) { s.ok += 1; s.ms = Math.round((s.ms * (s.ok - 1) + (g.ms || 0)) / s.ok); } else s.fail += 1;
  s.lastError = g.ok ? s.lastError : String(g.error || '').slice(0, 300);
  s.lastAt = now();
  writeJson(STATS, stats);
}

export function rateProvider(provider, intent, vote) {
  const stats = readJson(STATS, {});
  const key = `${provider}|${intent || 'any'}`;
  const s = (stats[key] ||= { ok: 0, fail: 0, ms: 0, score: 0, votes: 0 });
  s.votes += 1;
  s.score += vote;
  writeJson(STATS, stats);
}

export function providerStats() { return readJson(STATS, {}); }

export function listGenerations({ limit = 50 } = {}) { return readJsonl(GENERATIONS).reverse().slice(0, limit); }

export function findGeneration(file) { return readJsonl(GENERATIONS).reverse().find((g) => g.file === file) || null; }

// ---------- knowledge files ----------
export function listKnowledge() {
  const out = [];
  const walk = (dir, rel = '') => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) walk(full, path.join(rel, f));
      else if (f.endsWith('.md')) out.push({ path: path.join(rel, f), bytes: fs.statSync(full).size });
    }
  };
  walk(KNOWLEDGE_DIR);
  return out;
}

export function readKnowledge(rel) {
  const full = path.resolve(KNOWLEDGE_DIR, String(rel));
  if (!full.startsWith(KNOWLEDGE_DIR) || !fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

/** Save research notes so the next task can reuse them instead of searching again. */
export function writeKnowledge(rel, content) {
  const clean = String(rel).replace(/\.\.+/g, '').replace(/^\/+/, '');
  if (!clean.endsWith('.md')) throw Object.assign(new Error('Knowledge files are markdown (.md)'), { status: 400 });
  const full = path.resolve(KNOWLEDGE_DIR, clean);
  if (!full.startsWith(KNOWLEDGE_DIR)) throw Object.assign(new Error('Path outside knowledge/'), { status: 400 });
  if (path.basename(full) === 'lessons.md') throw Object.assign(new Error('Use add_lesson for lessons.md'), { status: 400 });
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, String(content));
  return { path: path.relative(KNOWLEDGE_DIR, full) };
}
