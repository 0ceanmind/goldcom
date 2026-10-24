// Claude engine for the studio. Two backends behind one call:
//   api          → Anthropic API with the key from Settings (or ANTHROPIC_API_KEY)
//   claude-code  → the `claude` CLI already signed in on this computer (uses the person's Claude plan)
// complete() sends a system prompt, a user prompt and optional images, and returns parsed JSON when a schema is given.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';
import { getSettings } from '../settings.mjs';

const MEDIA = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

// ---------- discovery ----------
let cliCache = null;
export function findClaudeCli() {
  const s = getSettings();
  if (s.claudePath && fs.existsSync(s.claudePath)) return { path: s.claudePath, native: !/\.(cmd|bat)$/i.test(s.claudePath) };
  if (cliCache !== null) return cliCache || null;
  const candidates = [];
  try {
    const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', process.platform === 'win32' ? ['claude'] : ['-a', 'claude'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 });
    candidates.push(...out.split(/\r?\n/).map((x) => x.trim()).filter(Boolean));
  } catch { /* not on PATH */ }
  const home = os.homedir();
  candidates.push(
    path.join(home, '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude'),
    path.join(home, '.claude', 'local', process.platform === 'win32' ? 'claude.exe' : 'claude'),
    path.join(home, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
    '/opt/homebrew/bin/claude', '/usr/local/bin/claude',
  );
  // Prefer a native executable (no shell needed) over npm's .cmd shim.
  const found = candidates.filter((c) => { try { return fs.statSync(c).isFile(); } catch { return false; } });
  const pick = found.find((c) => !/\.(cmd|bat|ps1)$/i.test(c)) || found[0];
  cliCache = pick ? { path: pick, native: !/\.(cmd|bat|ps1)$/i.test(pick) } : false;
  return cliCache || null;
}

const apiKey = () => getSettings().anthropicApiKey || process.env.ANTHROPIC_API_KEY || '';

export async function engineStatus() {
  const s = getSettings();
  const cli = findClaudeCli();
  let version = null;
  if (cli) { try { version = execFileSync(cli.path, ['--version'], { encoding: 'utf8', timeout: 8000, shell: !cli.native, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* ignore */ } }
  const api = !!apiKey();
  const selected = s.engine === 'api' ? (api ? 'api' : null) : s.engine === 'claude-code' ? (cli ? 'claude-code' : null) : api ? 'api' : cli ? 'claude-code' : null;
  return { selected, setting: s.engine, model: s.model, api: { available: api }, claudeCode: { available: !!cli, path: cli?.path || null, version } };
}

async function pickEngine() {
  const st = await engineStatus();
  if (!st.selected) {
    throw Object.assign(new Error('Claude is not connected. Open Settings and either paste an Anthropic API key, or install Claude Code and sign in (then choose "Claude Code" as the engine).'), { status: 412, code: 'NO_ENGINE' });
  }
  return st.selected;
}

async function loadImage(img) {
  if (typeof img === 'string') {
    const data = await fsp.readFile(img);
    return { data: data.toString('base64'), mediaType: MEDIA[path.extname(img).toLowerCase()] || 'image/jpeg', file: img };
  }
  if (Buffer.isBuffer(img)) return { data: img.toString('base64'), mediaType: 'image/jpeg' };
  return img;
}

/** Pull the first JSON object/array out of a model reply. */
export function parseJsonLoose(text) {
  const s = String(text || '').trim();
  try { return JSON.parse(s); } catch { /* fall through */ }
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* fall through */ } }
  const start = s.search(/[[{]/);
  if (start >= 0) {
    const open = s[start], close = open === '{' ? '}' : ']';
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close && --depth === 0) { try { return JSON.parse(s.slice(start, i + 1)); } catch { break; } }
    }
  }
  throw new Error('Claude did not return valid JSON');
}

// ---------- API backend ----------
async function completeApi({ system, prompt, images, schema, effort, signal, maxTokens, onUsage }) {
  const s = getSettings();
  const client = new Anthropic({ apiKey: apiKey(), maxRetries: 3, timeout: 15 * 60e3 });
  const imgs = await Promise.all((images || []).map(loadImage));
  const content = [];
  imgs.forEach((im, i) => {
    if (im.label || im.file) content.push({ type: 'text', text: `Image ${i + 1}${im.label ? `: ${im.label}` : ''}` });
    content.push({ type: 'image', source: { type: 'base64', media_type: im.mediaType, data: im.data } });
  });
  content.push({ type: 'text', text: prompt });
  const params = {
    model: s.model || 'claude-opus-5-5',
    max_tokens: maxTokens || 32000,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
    thinking: { type: 'adaptive' },
    output_config: { effort: effort || s.effort || 'high', ...(schema ? { format: { type: 'json_schema', schema } } : {}) },
  };
  let msg;
  try {
    // Server-side fallback keeps a production running if the main model declines a request.
    msg = await client.beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, { signal }).finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.BadRequestError && /fallback/i.test(e.message)) msg = await client.messages.stream(params, { signal }).finalMessage();
    else if (e instanceof Anthropic.AuthenticationError) throw Object.assign(new Error('The Anthropic API key was rejected. Check it in Settings.'), { status: 401 });
    else if (e instanceof Anthropic.RateLimitError) throw Object.assign(new Error('Anthropic rate limit reached. Wait a minute and try again.'), { status: 429 });
    else throw e;
  }
  onUsage?.({ engine: 'api', model: msg.model, input: msg.usage?.input_tokens || 0, output: msg.usage?.output_tokens || 0, cacheRead: msg.usage?.cache_read_input_tokens || 0 });
  if (msg.stop_reason === 'refusal') throw new Error(`Claude declined this request${msg.stop_details?.explanation ? `: ${msg.stop_details.explanation}` : ''}`);
  if (msg.stop_reason === 'max_tokens') throw new Error('Claude ran out of output space; try a shorter request.');
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return schema ? parseJsonLoose(text) : text;
}

// ---------- Claude Code backend ----------
async function completeCli({ system, prompt, images, schema, effort, signal, onUsage, timeoutMs = 20 * 60e3 }) {
  const cli = findClaudeCli();
  const s = getSettings();
  const work = await fsp.mkdtemp(path.join(os.tmpdir(), 'goldcom-claude-'));
  try {
    const imgs = await Promise.all((images || []).map(loadImage));
    const files = [];
    for (let i = 0; i < imgs.length; i++) {
      const f = path.join(work, `image-${String(i + 1).padStart(2, '0')}${imgs[i].mediaType === 'image/png' ? '.png' : '.jpg'}`);
      await fsp.writeFile(f, Buffer.from(imgs[i].data, 'base64'));
      files.push({ f, label: imgs[i].label });
    }
    const sysFile = path.join(work, 'system.md');
    await fsp.writeFile(sysFile, system);
    let body = '';
    if (files.length) body += `Before answering, use the Read tool to look at each of these images (they are part of the brief):\n${files.map((x, i) => `- Image ${i + 1}: ${x.f}${x.label ? ` (${x.label})` : ''}`).join('\n')}\n\n`;
    body += prompt;
    const useSchemaFlag = schema && cli.native;
    if (schema && !useSchemaFlag) body += `\n\nReply with ONLY a JSON value matching this JSON Schema (no prose, no code fences):\n${JSON.stringify(schema)}`;
    const args = ['-p', '--output-format', 'json', '--system-prompt-file', sysFile, '--no-session-persistence', '--model', s.model || 'claude-opus-5-5', '--effort', effort || s.effort || 'high'];
    if (files.length) args.push('--tools', 'Read', '--allowedTools', 'Read', '--add-dir', work);
    else args.push('--tools', cli.native ? '' : 'Read');
    if (useSchemaFlag) args.push('--json-schema', JSON.stringify(schema));
    const out = await new Promise((resolve, reject) => {
      const child = spawn(cli.path, cli.native ? args : args.map((a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)), { cwd: work, shell: !cli.native, windowsHide: true, env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'goldcom-studio' } });
      let so = '', se = '';
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Claude Code timed out')); }, timeoutMs);
      const onAbort = () => { child.kill('SIGKILL'); reject(new Error('Cancelled')); };
      signal?.addEventListener('abort', onAbort, { once: true });
      child.stdout.on('data', (d) => { so += d; });
      child.stderr.on('data', (d) => { se += d; });
      child.on('error', (e) => { clearTimeout(timer); reject(e); });
      child.on('close', (code) => {
        clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
        if (!so.trim()) return reject(new Error(`Claude Code exited (${code}) ${se.split('\n').filter(Boolean).slice(-3).join(' | ') || ''}`.trim()));
        resolve(so);
      });
      child.stdin.end(body);
    });
    const res = parseJsonLoose(out);
    onUsage?.({ engine: 'claude-code', costUsd: res.total_cost_usd || 0, model: Object.keys(res.modelUsage || {})[0] || null });
    if (res.is_error || res.subtype !== 'success') {
      const msg = String(res.result || res.error || res.subtype || 'error');
      if (/log ?in|auth|credential|not logged/i.test(msg)) throw Object.assign(new Error('Claude Code is not signed in. Open a terminal, run `claude`, sign in, then try again.'), { status: 401 });
      throw new Error(`Claude Code: ${msg.slice(0, 400)}`);
    }
    if (!schema) return res.result;
    return res.structured_output ?? parseJsonLoose(res.result);
  } finally {
    fsp.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * One Claude call.
 * { system, prompt, images: [path | Buffer | { data, mediaType, label }], schema, effort, signal, label, onUsage }
 */
export async function complete(opts) {
  const engine = opts.engine || (await pickEngine());
  const run = engine === 'api' ? completeApi : completeCli;
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await run(opts); } catch (e) {
      lastErr = e;
      if (opts.signal?.aborted || e.status === 401 || e.status === 412 || /declined|Cancelled/.test(e.message)) throw e;
      if (!/valid JSON|timed out|exited|overloaded|529|500|502|503/i.test(e.message)) throw e;
    }
  }
  throw lastErr;
}
