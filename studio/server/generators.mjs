// Image and 3D generation router.
//
// Providers: OpenAI Images (API key), Google Gemini image models (API key), Codex CLI (ChatGPT subscription),
// Claude (SVG art, via ANTHROPIC_API_KEY or the Claude Code CLI on a Pro/Max plan), the studio's own 3D scenes
// (free, brand-exact bars and coins), and Meshy / Tripo for text-to-3D models (GLB).
//
// The router reads what the request is for (intent), ranks the providers that can do it, adds what it has
// learned from past results and the user's ratings, and falls back to the next provider when one fails.
// Model IDs are configurable and self-correcting: if a model is retired, the provider asks the API for its
// current models, switches, remembers the choice and retries.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DATA_DIR, saveAsset } from './store.mjs';
import { recordGeneration, providerStats, readLessons, readKnowledge } from './memory.mjs';

// ---------- settings (local only: <data>/settings.json, git-ignored) ----------
const SETTINGS = path.join(DATA_DIR, 'settings.json');
export const KEY_NAMES = ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'MESHY_API_KEY', 'TRIPO_API_KEY'];
const DEFAULT_MODELS = {
  openai: 'gpt-image-2.5-sunburst',
  openaiFast: 'gpt-image-2.5-flare',
  gemini: 'gemini-nano-banana-2.1',
  geminiPro: 'gemini-3-pro-image',
  claude: 'claude-sonnet-5-5',
  meshy: 'meshy-7.1',
  tripo: 'v3.1-20260211',
};

export function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); } catch { return {}; }
}
export function writeSettings(patch) {
  const cur = readSettings();
  const next = { ...cur, ...patch, keys: { ...(cur.keys || {}), ...(patch.keys || {}) }, models: { ...(cur.models || {}), ...(patch.models || {}) }, providers: { ...(cur.providers || {}), ...(patch.providers || {}) } };
  for (const [k, v] of Object.entries(next.keys)) if (v === '' || v === null) delete next.keys[k];
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS, JSON.stringify(next, null, 2), { mode: 0o600 });
  return next;
}
const key = (name) => readSettings().keys?.[name] || process.env[name] || '';
const model = (name) => readSettings().models?.[name] || DEFAULT_MODELS[name];
const rememberModel = (name, id) => writeSettings({ models: { [name]: id } });
const enabled = (id) => readSettings().providers?.[id] !== false;

/** Settings for the UI: keys are masked, never returned in full. */
export function publicSettings() {
  const s = readSettings();
  const keys = Object.fromEntries(KEY_NAMES.map((k) => {
    const v = s.keys?.[k] || process.env[k] || '';
    return [k, v ? { set: true, source: s.keys?.[k] ? 'studio' : 'environment', hint: `…${v.slice(-4)}` } : { set: false }];
  }));
  return { keys, models: { ...DEFAULT_MODELS, ...(s.models || {}) }, providers: s.providers || {}, autoRepair: s.autoRepair !== false, director: s.director || {} };
}

// ---------- helpers ----------
const which = (cmd) => {
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    const full = path.join(dir, process.platform === 'win32' ? `${cmd}.cmd` : cmd);
    try { if (fs.statSync(full).isFile()) return full; } catch { /* keep looking */ }
  }
  return null;
};

function httpError(provider, status, body) {
  const msg = body?.error?.message || body?.message || body?.error || (typeof body === 'string' ? body.slice(0, 300) : `HTTP ${status}`);
  const code = body?.error?.code || body?.error?.status || body?.code || status;
  const e = new Error(`${provider}: ${msg}`);
  e.status = status; e.code = code;
  // Some failures must not be retried on the same provider: billing, safety, auth.
  e.fatal = status === 401 || status === 402 || status === 403 || /moderation|safety|billing|quota|credit|insufficient/i.test(`${code} ${msg}`);
  e.modelMissing = status === 404 || /model.*(not found|does not exist|unsupported|retired|shut down|deprecated)|unknown model|invalid model/i.test(msg);
  return e;
}

async function fetchJson(url, init, provider, timeoutMs = 180000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal });
    const txt = await r.text();
    let body;
    try { body = JSON.parse(txt); } catch { body = txt; }
    if (!r.ok) throw httpError(provider, r.status, body);
    return body;
  } finally { clearTimeout(t); }
}

function runCli(cmd, args, { cwd, env, timeoutMs = 240000, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`${path.basename(cmd)} timed out after ${Math.round(timeoutMs / 1000)} s`)); }, timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => { clearTimeout(timer); if (code === 0) resolve({ out, err }); else reject(Object.assign(new Error(`${path.basename(cmd)} exited with ${code}: ${(err || out).slice(-600)}`), { code })); });
    if (input) { child.stdin.write(input); child.stdin.end(); }
  });
}

/** Aspect → provider-native size. OpenAI wants multiples of 16; Gemini takes a ratio. */
const SIZES = {
  '4:5': { openai: '1088x1360', gemini: '4:5', px: [1080, 1350] },
  '9:16': { openai: '1152x2048', gemini: '9:16', px: [1080, 1920] },
  '1:1': { openai: '1088x1088', gemini: '1:1', px: [1080, 1080] },
  '16:9': { openai: '2048x1152', gemini: '16:9', px: [1920, 1080] },
};
export const aspectOf = (w, h) => { const r = w / h; return r > 1.5 ? '16:9' : r > 0.92 ? '1:1' : r > 0.7 ? '4:5' : '9:16'; };

// ---------- art direction ----------
const ART_DIRECTION = [
  'Art direction (Goldcom): premium, calm, editorial. Dark onyx and charcoal surroundings (#151513, #1D1D1F) with warm 24K gold as the single accent.',
  'Light like high-end product photography: one soft key from top-back, a thin strip rim light, deep but not crushed shadows, gentle falloff into darkness. Long lens, shallow depth of field.',
  'Real materials only: polished and brushed gold that reflects its surroundings, black stone, frosted glass, velvet, paper. Correct physical proportions (a 1 g minted bar is about 15 x 8.7 mm).',
  'One subject, generous negative space. No text, numbers, logos or watermarks in the image unless the prompt asks for them. No sparkles, glitter, lens flares, bokeh confetti, coins raining, rockets, arrows or money symbols.',
  'People and places, when asked for: contemporary Oman and the Gulf, modest dress, natural and dignified, never stock-photo poses. Avoid showing faces unless the prompt asks.',
].join('\n');

export function artDirect(prompt, { intent, aspect, transparent } = {}) {
  const lessons = readLessons().split('\n').filter((l) => /^- /.test(l) && /image|photo|generat|visual|render/i.test(l)).slice(0, 8).join('\n');
  const extra = readKnowledge('art-direction.md');
  return [
    String(prompt).trim(),
    '',
    ART_DIRECTION,
    extra ? `\nHouse notes:\n${extra.slice(0, 1500)}` : '',
    lessons ? `\nLearned from earlier feedback:\n${lessons}` : '',
    aspect ? `\nFrame: ${aspect} vertical composition for Instagram; keep the subject in the central 80%.` : '',
    transparent ? 'Background: transparent, subject isolated.' : '',
    intent === 'texture' ? 'This is a background texture: even, seamless, no focal object.' : '',
  ].filter(Boolean).join('\n');
}

// ---------- intent ----------
export const INTENTS = {
  product: 'Gold bar, coin or jewellery hero shot',
  photo: 'Realistic photo: people, places, lifestyle, occasions',
  typography: 'Poster or image with lettering inside it',
  illustration: 'Illustration, vector art, icon, diagram or pattern',
  texture: 'Background texture or abstract material',
  edit: 'Change or extend a reference image',
  model3d: '3D model (GLB) of an object',
};

export function classify(prompt = '', { intent, references = [] } = {}) {
  if (intent && INTENTS[intent]) return intent;
  const p = String(prompt).toLowerCase();
  if (references.length) return 'edit';
  if (/\b(3d model|glb|mesh|sculpt\w*|figurine|3d object)/.test(p)) return 'model3d';
  if (/\b(icons?|vector|svg|illustrat\w*|diagram|infographic|line[\s-]?art|flat design|pattern|isometric|map of|logo mark)/.test(p)) return 'illustration';
  if (/\b(poster|lettering|headline in|typograph\w*|text that says|calligraph\w*)/.test(p) || /["“].+["”]/.test(p)) return 'typography';
  if (/\b(texture|backgrounds?|abstract|marble|stone surface|gradient|liquid gold|molten)/.test(p)) return 'texture';
  if (/\b(bar|bullion|ingot|coin|minted|999\.9|24k|karat|jewel)/.test(p) && !/\b(person|people|woman|man|family|hand|souq|market|wedding|street)\b/.test(p)) return 'product';
  return 'photo';
}

const FALLBACK_INTENTS = { photo: ['product', 'illustration'], typography: ['illustration'], texture: ['product', 'illustration'], edit: ['photo', 'product'], product: ['illustration'], illustration: ['product'] };

// How good each provider is at each intent (0..1). The router multiplies by availability and adds what it learned.
const CAPABILITY = {
  scene: { product: 0.95, texture: 0.4, photo: 0, typography: 0, illustration: 0, edit: 0, model3d: 0.5 },
  openai: { product: 0.75, photo: 0.85, typography: 0.95, illustration: 0.7, texture: 0.75, edit: 0.95, model3d: 0 },
  gemini: { product: 0.75, photo: 0.95, typography: 0.8, illustration: 0.6, texture: 0.8, edit: 0.9, model3d: 0 },
  codex: { product: 0.7, photo: 0.8, typography: 0.88, illustration: 0.65, texture: 0.7, edit: 0.6, model3d: 0 },
  claude: { product: 0.15, photo: 0, typography: 0.55, illustration: 0.9, texture: 0.35, edit: 0, model3d: 0 },
  meshy: { model3d: 0.9 },
  tripo: { model3d: 0.85 },
};

// ---------- providers ----------
function b64ToBuf(b64) { return Buffer.from(String(b64), 'base64'); }

const providers = {
  openai: {
    label: 'OpenAI GPT Image',
    route: 'API key',
    available: () => (key('OPENAI_API_KEY') ? { ok: true, via: 'OPENAI_API_KEY' } : { ok: false, why: 'Add an OpenAI API key in Settings (or OPENAI_API_KEY).' }),
    async generate(req) {
      const size = SIZES[req.aspect]?.openai || '1088x1360';
      const m = req.fast ? model('openaiFast') : model('openai');
      const headers = { Authorization: `Bearer ${key('OPENAI_API_KEY')}` };
      const call = async (mid) => {
        if (req.references?.length) {
          const fd = new FormData();
          fd.append('model', mid); fd.append('prompt', req.prompt); fd.append('size', size); fd.append('quality', req.fast ? 'medium' : 'high');
          for (const r of req.references.slice(0, 16)) fd.append('image[]', new Blob([r.buffer], { type: r.mime || 'image/png' }), r.name || 'ref.png');
          return fetchJson('https://api.openai.com/v1/images/edits', { method: 'POST', headers, body: fd }, 'openai');
        }
        return fetchJson('https://api.openai.com/v1/images/generations', {
          method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: mid, prompt: req.prompt, size, quality: req.fast ? 'medium' : 'high', n: 1, output_format: 'png', ...(req.transparent ? { background: 'transparent' } : {}) }),
        }, 'openai');
      };
      let j, used = m;
      try { j = await call(m); } catch (e) {
        if (!e.modelMissing) throw e;
        // Self-heal: the model was retired or renamed. Ask for the current image models and switch.
        const list = await fetchJson('https://api.openai.com/v1/models', { headers }, 'openai');
        const ids = (list.data || []).filter((x) => /^gpt-image|image/.test(x.id)).sort((a, b) => (b.created || 0) - (a.created || 0)).map((x) => x.id);
        used = ids.find((x) => (req.fast ? /flare|mini|fast/ : /sunburst|2\.5|^gpt-image-2/).test(x)) || ids[0];
        if (!used) throw e;
        j = await call(used);
        rememberModel(req.fast ? 'openaiFast' : 'openai', used);
      }
      const b64 = j?.data?.[0]?.b64_json;
      if (!b64) throw new Error('openai: no image in the response');
      return { buffer: b64ToBuf(b64), mime: 'image/png', model: used, revised: j?.data?.[0]?.revised_prompt };
    },
  },

  gemini: {
    label: 'Google Gemini (Nano Banana)',
    route: 'API key',
    available: () => (key('GEMINI_API_KEY') || process.env.GOOGLE_API_KEY ? { ok: true, via: 'GEMINI_API_KEY' } : { ok: false, why: 'Add a Gemini API key on a billing-enabled project in Settings (or GEMINI_API_KEY). Image models have no free tier.' }),
    async generate(req) {
      const k = key('GEMINI_API_KEY') || process.env.GOOGLE_API_KEY;
      const m = req.premium ? model('geminiPro') : model('gemini');
      const ratio = SIZES[req.aspect]?.gemini || '4:5';
      const headers = { 'x-goog-api-key': k, 'Content-Type': 'application/json' };
      const refs = (req.references || []).slice(0, 10);
      const viaInteractions = async (mid) => {
        const j = await fetchJson('https://generativelanguage.googleapis.com/v1beta/interactions', {
          method: 'POST', headers,
          body: JSON.stringify({ model: mid, input: [{ type: 'text', text: req.prompt }, ...refs.map((r) => ({ type: 'image', mime_type: r.mime || 'image/png', data: r.buffer.toString('base64') }))], response_format: { type: 'image', aspect_ratio: ratio, image_size: '2K' }, store: false }),
        }, 'gemini');
        const steps = j.steps || j.outputs || [];
        const blocks = steps.flatMap((s) => s.content || []).filter((c) => c.type === 'image' && c.data);
        if (!blocks.length && j.errors?.length) throw new Error(`gemini: ${j.errors.map((e) => e.message).join('; ')}`);
        return blocks.length ? { buffer: b64ToBuf(blocks[blocks.length - 1].data), mime: blocks[blocks.length - 1].mime_type || 'image/png' } : null;
      };
      const viaGenerateContent = async (mid, version) => {
        const j = await fetchJson(`https://generativelanguage.googleapis.com/${version}/models/${mid}:generateContent`, {
          method: 'POST', headers,
          body: JSON.stringify({ contents: [{ parts: [{ text: req.prompt }, ...refs.map((r) => ({ inline_data: { mime_type: r.mime || 'image/png', data: r.buffer.toString('base64') } }))] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: ratio, imageSize: '2K' } } }),
        }, 'gemini');
        if (j.promptFeedback?.blockReason) throw Object.assign(new Error(`gemini: blocked (${j.promptFeedback.blockReason})`), { fatal: true });
        const parts = (j.candidates?.[0]?.content?.parts || []).filter((p) => (p.inlineData || p.inline_data) && !p.thought);
        const last = parts[parts.length - 1];
        if (!last) throw new Error(`gemini: no image returned (${j.candidates?.[0]?.finishReason || 'unknown reason'})`);
        const d = last.inlineData || last.inline_data;
        return { buffer: b64ToBuf(d.data), mime: d.mimeType || d.mime_type || 'image/png' };
      };
      const attempt = async (mid) => {
        try { const r = await viaInteractions(mid); if (r) return r; } catch (e) { if (e.fatal && !e.modelMissing) throw e; }
        try { return await viaGenerateContent(mid, 'v1'); } catch (e) { if (e.fatal && !e.modelMissing) throw e; return viaGenerateContent(mid, 'v1beta'); }
      };
      try { return { ...(await attempt(m)), model: m }; } catch (e) {
        if (!e.modelMissing) throw e;
        const list = await fetchJson('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers }, 'gemini');
        const ids = (list.models || []).map((x) => String(x.name).replace(/^models\//, '')).filter((x) => /image|nano-banana/.test(x) && !/preview-0|imagen/.test(x));
        const pick = ids.find((x) => (req.premium ? /pro/ : /nano-banana|flash-image/).test(x)) || ids[0];
        if (!pick) throw e;
        const r = await attempt(pick);
        rememberModel(req.premium ? 'geminiPro' : 'gemini', pick);
        return { ...r, model: pick };
      }
    },
  },

  codex: {
    label: 'ChatGPT subscription (Codex CLI)',
    route: 'subscription',
    available: () => (which('codex') ? { ok: true, via: 'codex CLI (ChatGPT Plus/Pro login)' } : { ok: false, why: 'Install the Codex CLI and sign in with your ChatGPT plan (`npm i -g @openai/codex`, then `codex login`).' }),
    busy: Promise.resolve(),
    async generate(req) {
      // Codex shares state under ~/.codex: serialise runs.
      const run = this.busy.then(() => codexOnce(req));
      this.busy = run.catch(() => {});
      return run;
    },
  },

  claude: {
    label: 'Claude (vector art as SVG)',
    route: 'API key or subscription',
    available: () => (key('ANTHROPIC_API_KEY') ? { ok: true, via: 'ANTHROPIC_API_KEY' } : which('claude') ? { ok: true, via: 'Claude Code CLI (Pro/Max login)' } : { ok: false, why: 'Add an Anthropic API key, or install Claude Code and sign in.' }),
    async generate(req, ctx) {
      const ask = `Create one finished SVG illustration for this brief. Reply with the SVG code only, starting with <svg and ending with </svg>. viewBox matching ${req.px[0]}x${req.px[1]}. Use the Goldcom palette only: onyx #151513, charcoal #1D1D1F, graphite #2D2E2B, gold #DBA761, spark #F2D46B, bronze #8A5A2B, cream #FFF8EA. Use gradients for metal, keep it minimal and precise, no text unless the brief asks for it, no external references or fonts.\n\nBrief:\n${req.prompt}`;
      let svg;
      if (key('ANTHROPIC_API_KEY')) {
        const j = await fetchJson('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': key('ANTHROPIC_API_KEY'), 'anthropic-version': readSettings().anthropicVersion || '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: model('claude'), max_tokens: 16000, messages: [{ role: 'user', content: ask }] }),
        }, 'claude');
        svg = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
      } else {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'goldcom-svg-'));
        const env = { ...process.env };
        delete env.ANTHROPIC_API_KEY; // bill the subscription, not an API key
        const { out } = await runCli(which('claude'), ['-p', ask, '--output-format', 'json', '--max-turns', '1', '--permission-mode', 'dontAsk', '--mcp-config', '{"mcpServers":{}}', '--strict-mcp-config'], { cwd: tmp, env, timeoutMs: 300000 });
        try { svg = JSON.parse(out).result; } catch { svg = out; }
      }
      const m = /<svg[\s\S]*<\/svg>/i.exec(String(svg || ''));
      if (!m) throw new Error('claude: the reply did not contain an SVG');
      const clean = m[0].replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '');
      const png = ctx.rasterize ? await ctx.rasterize(clean, req.px[0], req.px[1]) : null;
      return png ? { buffer: png, mime: 'image/png', model: model('claude'), svg: clean } : { buffer: Buffer.from(clean), mime: 'image/svg+xml', model: model('claude'), svg: clean };
    },
  },

  scene: {
    label: 'Goldcom 3D scenes (built in)',
    route: 'free, local',
    available: () => ({ ok: true, via: 'studio renderer' }),
    async generate(req, ctx) {
      if (!ctx.renderScene) throw new Error('scene: renderer unavailable');
      const p = req.prompt.toLowerCase();
      const weight = (/(\d+(\.\d+)?)\s?(g|gram|جرام)/.exec(p) || [])[1];
      const pick = /coin|عملة/.test(p) ? { id: 'coin-stack', params: {} }
        : /gift|box|هدية/.test(p) ? { id: 'gift-box', params: weight ? { weight: `${weight} g` } : {} }
          : /(line|row|sizes|from 1|weights)/.test(p) ? { id: 'gram-steps', params: {} }
            : /vault|safe|خزن/.test(p) ? { id: 'vault-tile', params: {} }
              : { id: 'bar-hero', params: { motion: 'still', ...(weight ? { weight: `${weight} g` } : {}) } };
      const r = await ctx.renderScene({ id: req.scene || pick.id, params: req.sceneParams || pick.params, w: req.px[0], h: req.px[1], theme: req.theme || 'onyx', lang: req.lang || 'en' });
      return { buffer: r.png, mime: 'image/png', model: `scene:${req.scene || pick.id}` };
    },
  },

  meshy: {
    label: 'Meshy (text to 3D)',
    route: 'API key',
    kind: 'model3d',
    available: () => (key('MESHY_API_KEY') ? { ok: true, via: 'MESHY_API_KEY' } : { ok: false, why: 'Add a Meshy API key (paid plan) in Settings.' }),
    async generate(req) {
      const headers = { Authorization: `Bearer ${key('MESHY_API_KEY')}`, 'Content-Type': 'application/json' };
      const base = 'https://api.meshy.ai/openapi/v2/text-to-3d';
      const poll = async (id) => {
        for (let i = 0; i < 120; i++) {
          const t = await fetchJson(`${base}/${id}`, { headers }, 'meshy');
          if (t.status === 'SUCCEEDED') return t;
          if (t.status === 'FAILED' || t.status === 'CANCELED') throw new Error(`meshy: ${t.task_error?.message || t.status}`);
          await new Promise((r) => setTimeout(r, 5000));
        }
        throw new Error('meshy: timed out');
      };
      const pre = await fetchJson(base, { method: 'POST', headers, body: JSON.stringify({ mode: 'preview', prompt: req.prompt.slice(0, 800), ai_model: model('meshy'), target_formats: ['glb'] }) }, 'meshy');
      await poll(pre.result);
      const ref = await fetchJson(base, { method: 'POST', headers, body: JSON.stringify({ mode: 'refine', preview_task_id: pre.result, enable_pbr: true, texture_resolution: '2k', target_formats: ['glb'] }) }, 'meshy');
      const done = await poll(ref.result);
      const url = done.model_urls?.glb;
      if (!url) throw new Error('meshy: no GLB in the result');
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      return { buffer: buf, mime: 'model/gltf-binary', ext: '.glb', model: model('meshy'), thumbnail: done.thumbnail_url };
    },
  },

  tripo: {
    label: 'Tripo (text to 3D)',
    route: 'API key',
    kind: 'model3d',
    available: () => (key('TRIPO_API_KEY') ? { ok: true, via: 'TRIPO_API_KEY' } : { ok: false, why: 'Add a Tripo API key in Settings.' }),
    async generate(req) {
      const headers = { Authorization: `Bearer ${key('TRIPO_API_KEY')}`, 'Content-Type': 'application/json' };
      const base = 'https://openapi.tripo3d.ai/v3';
      const created = await fetchJson(`${base}/generation/text-to-model`, { method: 'POST', headers, body: JSON.stringify({ prompt: req.prompt.slice(0, 1024), model: model('tripo'), texture: true, pbr: true, texture_quality: 'standard' }) }, 'tripo');
      const id = created?.data?.task_id;
      if (!id) throw new Error(`tripo: ${created?.message || 'no task id'}`);
      for (let i = 0; i < 120; i++) {
        const t = await fetchJson(`${base}/tasks/${id}`, { headers }, 'tripo');
        const st = t?.data?.status;
        if (st === 'success') {
          const url = t.data.output?.model_url || t.data.output?.pbr_model;
          const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
          return { buffer: buf, mime: 'model/gltf-binary', ext: '.glb', model: model('tripo'), thumbnail: t.data.output?.rendered_image_url };
        }
        if (['failed', 'banned', 'expired', 'cancelled'].includes(st)) throw Object.assign(new Error(`tripo: task ${st}`), { fatal: st === 'banned' });
        await new Promise((r) => setTimeout(r, 5000));
      }
      throw new Error('tripo: timed out');
    },
  },
};

async function codexOnce(req) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'goldcom-codex-'));
  const env = { ...process.env };
  delete env.OPENAI_API_KEY; delete env.CODEX_API_KEY; // bill the ChatGPT plan, not an API key
  const refNames = [];
  for (const [i, r] of (req.references || []).entries()) { const n = `ref-${i + 1}.png`; fs.writeFileSync(path.join(work, n), r.buffer); refNames.push(n); }
  const ask = `Use $imagegen to create one image. ${req.aspect} vertical frame. ${refNames.length ? `Use these reference images in this folder: ${refNames.join(', ')}. ` : ''}Save the final PNG as ./out.png and print its path.\n\n${req.prompt}`;
  const { out } = await runCli(which('codex'), ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '--json', ask], { cwd: work, env, timeoutMs: 300000 });
  const first = out.split('\n').find((l) => l.includes('thread.started'));
  let thread = null;
  try { thread = JSON.parse(first).thread_id; } catch { /* fall back to ./out.png */ }
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const dir = thread ? path.join(home, 'generated_images', thread) : null;
  let file = dir && fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.png$/i.test(f)).map((f) => path.join(dir, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] : null;
  if (!file && fs.existsSync(path.join(work, 'out.png'))) file = path.join(work, 'out.png');
  if (!file) throw new Error('codex: no image was produced (check that your ChatGPT plan includes image generation)');
  return { buffer: fs.readFileSync(file), mime: 'image/png', model: 'codex:$imagegen' };
}

// ---------- status & ranking ----------
export function generatorStatus() {
  return Object.entries(providers).map(([id, p]) => {
    const a = p.available();
    return { id, label: p.label, route: p.route, kind: p.kind || 'image', enabled: enabled(id), available: a.ok && enabled(id), via: a.via || null, why: a.ok ? (enabled(id) ? null : 'Turned off in Settings') : a.why, capability: CAPABILITY[id] };
  });
}

/** Rank providers for an intent: capability, availability, then learning (success rate and the user's votes). */
export function rankProviders(intent, { prefer, exclude = [] } = {}) {
  const stats = providerStats();
  const out = [];
  for (const [id, p] of Object.entries(providers)) {
    if (exclude.includes(id) || !enabled(id)) continue;
    const cap = CAPABILITY[id]?.[intent] || 0;
    if (cap <= 0) continue;
    const a = p.available();
    if (!a.ok) continue;
    const s = stats[`${id}|${intent}`] || {};
    const tries = (s.ok || 0) + (s.fail || 0);
    const reliability = tries ? (s.ok + 1) / (tries + 2) : 0.75;
    const taste = s.votes ? Math.max(-0.25, Math.min(0.25, (s.score / s.votes) * 0.25)) : 0;
    let score = cap * (0.55 + 0.45 * reliability) + taste;
    if (prefer === id) score += 1;
    out.push({ id, score: Math.round(score * 1000) / 1000, why: `capability ${cap}, reliability ${Math.round(reliability * 100)}%${s.votes ? `, your votes ${s.score > 0 ? '+' : ''}${s.score}` : ''}`, via: a.via });
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * Generate an image (or a 3D model) through the best available provider, with automatic fallback.
 * Returns { asset, provider, model, intent, attempts[], prompt }.
 */
export async function generate(opts, ctx = {}) {
  const prompt = String(opts.prompt || '').trim();
  if (!prompt) throw Object.assign(new Error('prompt is required'), { status: 400 });
  const intent = classify(prompt, { intent: opts.intent, references: opts.references });
  const aspect = opts.aspect || '4:5';
  const px = SIZES[aspect]?.px || [1080, 1350];
  let ranked = opts.provider && opts.provider !== 'auto' ? [{ id: opts.provider, score: 1, why: 'chosen' }, ...rankProviders(intent, { exclude: [opts.provider] })] : rankProviders(intent);
  // Nothing can make this kind of image right now: fall back to the closest kind something can make, and say so.
  let degraded = null;
  if (!ranked.length) {
    for (const alt of FALLBACK_INTENTS[intent] || []) {
      const r = rankProviders(alt);
      if (r.length) { ranked = r; degraded = `No provider for "${INTENTS[intent]}" is set up, so this was made as "${INTENTS[alt]}". Add a key in Settings for the real thing.`; break; }
    }
  }
  if (!ranked.length) {
    const status = generatorStatus().filter((s) => (CAPABILITY[s.id]?.[intent] || 0) > 0);
    throw Object.assign(new Error(`No provider can make "${INTENTS[intent]}" right now. ${status.map((s) => `${s.label}: ${s.why || 'ready'}`).join(' · ')}`), { status: 503, intent });
  }
  const directed = opts.raw ? prompt : artDirect(prompt, { intent, aspect, transparent: opts.transparent });
  const attempts = [];
  for (const cand of ranked.slice(0, opts.maxAttempts || 4)) {
    const p = providers[cand.id];
    const t0 = Date.now();
    try {
      const r = await p.generate({ prompt: cand.id === 'scene' ? prompt : directed, aspect, px, intent, references: opts.references || [], transparent: opts.transparent, fast: opts.fast, premium: opts.premium, theme: opts.theme, lang: opts.lang, scene: opts.scene, sceneParams: opts.sceneParams }, ctx);
      const ms = Date.now() - t0;
      const ext = r.ext || (r.mime === 'image/svg+xml' ? '.svg' : r.mime === 'image/jpeg' ? '.jpg' : r.mime === 'image/webp' ? '.webp' : '.png');
      const asset = await saveAsset(r.buffer, { name: `gen-${cand.id}-${intent}${ext}` });
      if (r.svg && r.mime !== 'image/svg+xml') asset.svg = (await saveAsset(Buffer.from(r.svg), { name: `gen-${cand.id}-${intent}.svg` })).url;
      recordGeneration({ provider: cand.id, model: r.model, intent, ok: true, ms, file: asset.file, prompt, aspect, why: cand.why });
      attempts.push({ provider: cand.id, ok: true, ms });
      return { asset, provider: cand.id, label: p.label, model: r.model, intent, aspect, attempts, ranked, prompt: directed, ...(degraded ? { degraded } : {}) };
    } catch (e) {
      const ms = Date.now() - t0;
      recordGeneration({ provider: cand.id, intent, ok: false, ms, error: e.message, prompt });
      attempts.push({ provider: cand.id, ok: false, error: e.message, ms });
      // Safety blocks are about the prompt, not the provider: stop instead of trying the same prompt elsewhere.
      if (/moderation|safety|blocked|banned/i.test(e.message)) break;
    }
  }
  const err = new Error(`All providers failed: ${attempts.map((a) => `${a.provider}: ${a.error}`).join(' | ')}`);
  err.status = 502; err.attempts = attempts;
  throw err;
}
