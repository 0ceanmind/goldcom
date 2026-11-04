// Claude engine for the studio. Two backends behind one call:
//   api          → Anthropic API with the key from Settings (or ANTHROPIC_API_KEY)
//   claude-code  → the `claude` CLI already signed in on this computer (uses the person's Claude plan)
// complete() sends a system prompt, a user prompt and optional images, and returns parsed JSON when a schema is given.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';
import Ajv from 'ajv';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
const ajv = new Ajv({ strict: false, allErrors: true });
const execAsync = promisify(execFile);
let versionCache = null;
let authenticated = null;
export function validateReply(schema, value) { const check = ajv.compile(schema); if (!check(value)) throw new Error(`Claude returned invalid schema: ${ajv.errorsText(check.errors)}`); return value; }
export function cliEnvironment({ useApiKey = false } = {}) { const env = { ...process.env }; for (const k of Object.keys(env)) if (/CLAUDECODE|CLAUDE_CODE_|SESSION|TOKEN|SECRET|API_KEY|PASSWORD/i.test(k)) delete env[k]; if (useApiKey && apiKey()) env.ANTHROPIC_API_KEY = apiKey(); return env; }
import { getSettings } from '../settings.mjs';
import { whichAll, isShim, commandFor } from '../cli.mjs';

const MEDIA = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

// ---------- discovery ----------
// The CLI is always started without a shell (see ../cli.mjs), so prompts and JSON arguments pass through untouched.
// { path, cmd, prefix }: spawn(cmd, [...prefix, ...args]).
const CLAUDE_NAME = /^claude(\.exe|\.cmd|\.bat)?$/i;
let cliCache = null;
const describeCli = (file) => { const c = commandFor(file); return c ? { path: file, native: true, ...c } : null; };
export function findClaudeCli() {
  const s = getSettings();
  // A custom location must still be the claude program, not any file on disk.
  if (s.claudePath && CLAUDE_NAME.test(path.basename(s.claudePath)) && fs.existsSync(s.claudePath)) return describeCli(s.claudePath);
  if (cliCache !== null) return cliCache || null;
  const home = os.homedir();
  const win = process.platform === 'win32';
  const candidates = [
    ...whichAll('claude'),
    path.join(home, '.local', 'bin', win ? 'claude.exe' : 'claude'),
    path.join(home, '.claude', 'local', win ? 'claude.exe' : 'claude'),
    path.join(home, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
    '/opt/homebrew/bin/claude', '/usr/local/bin/claude',
  ].filter((c) => (!win || /\.(exe|cmd|bat)$/i.test(c)) && (() => { try { return fs.statSync(c).isFile(); } catch { return false; } })());
  // Prefer a real executable over npm's .cmd shim; a shim is only used when its target can be found.
  candidates.sort((a, b) => isShim(a) - isShim(b));
  cliCache = candidates.map(describeCli).find(Boolean) || false;
  return cliCache || null;
}

const apiKey = () => getSettings().anthropicApiKey || process.env.ANTHROPIC_API_KEY || '';

export async function enginePreflight() {
  const selected = await pickEngine();
  const cli = findClaudeCli();
  if (selected === 'claude-code' && authenticated?.engine === selected && authenticated.path === cli?.path && Date.now() - authenticated.at < 30000) return selected;
  if (selected === 'claude-code') {
    try {
      const result = await execAsync(cli.cmd, [...cli.prefix, 'auth', 'status', '--json'], { env: cliEnvironment(), timeout: 5000, windowsHide: true });
      if (!JSON.parse(result.stdout).loggedIn) throw new Error('Not signed in');
    } catch { throw Object.assign(new Error('Claude Code is not signed in. Sign in with claude, then try again.'), { status: 412 }); }
  } else {
    const rates = getSettings().apiRates;
    if (!rates?.input || !rates?.output || !rates?.cacheRead || !rates?.cacheWrite) throw Object.assign(new Error('Configure the current API token rates in Settings before starting.'), { status: 412 });
    try { await new Anthropic({ apiKey: apiKey(), timeout: 10000, maxRetries: 0 }).models.list({ limit: 1 }); }
    catch { throw Object.assign(new Error('The Anthropic API credentials could not be verified. Check Settings and your connection.'), { status: 412 }); }
  }
  authenticated = { engine: selected, path: cli?.path, at: Date.now() };
  return selected;
}

export async function engineStatus({ checkVersion = true } = {}) {
  const s = getSettings();
  const cli = findClaudeCli();
  let version = null;
  if (cli && checkVersion) {
    if (!versionCache || versionCache.path !== cli.path || Date.now() - versionCache.at > 60000) {
      versionCache = { path: cli.path, at: Date.now(), promise: execAsync(cli.cmd, [...cli.prefix, '--version'], { timeout: 8000, windowsHide: true, env: cliEnvironment() }).then(r => r.stdout.trim()).catch(() => null) };
    }
    version = await versionCache.promise;
  }
  const api = !!apiKey();
  const selected = s.engine === 'api' ? (api ? 'api' : null) : s.engine === 'claude-code' ? (cli ? 'claude-code' : null) : api ? 'api' : cli ? 'claude-code' : null;
  return { selected, verified: false, readiness: selected ? 'Configured; use Test connection to verify authentication' : 'Not configured', setting: s.engine, model: s.model, api: { available: api }, claudeCode: { available: !!cli, path: cli?.path || null, version } };
}

async function pickEngine() {
  const st = await engineStatus({ checkVersion: false });
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
async function completeApi({ system, prompt, images, schema, effort, signal, maxTokens, onUsage, budgetUsd }) {
  const s = getSettings();
  const client = new Anthropic({ apiKey: apiKey(), maxRetries: 0, timeout: 5 * 60e3 });
  const imgs = await Promise.all((images || []).map(loadImage));
  const content = [];
  imgs.forEach((im, i) => {
    if (im.label || im.file) content.push({ type: 'text', text: `Image ${i + 1}${im.label ? `: ${im.label}` : ''}` });
    content.push({ type: 'image', source: { type: 'base64', media_type: im.mediaType, data: im.data } });
  });
  content.push({ type: 'text', text: prompt });
  const params = {
    model: s.model || 'claude-opus-5-5',
    max_tokens: maxTokens || 8000,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
    thinking: { type: 'adaptive' },
    output_config: { effort: effort || s.effort || 'high', ...(schema ? { format: { type: 'json_schema', schema } } : {}) },
  };
  const rates = s.apiRates;
  if (!rates?.input || !rates?.output || !rates?.cacheRead || !rates?.cacheWrite) throw Object.assign(new Error('Set the current model token rates in Settings before using the API budget'), { status: 412 });
  const inputBytes = Buffer.byteLength(system || '') + Buffer.byteLength(prompt || '') + imgs.reduce((n,im) => n + im.data.length, 0);
  const reserve = (inputBytes * Math.max(rates.input, rates.cacheWrite) + params.max_tokens * rates.output) / 1e6;
  if (reserve > budgetUsd) throw Object.assign(new Error('Remaining budget cannot cover this call’s maximum token allowance. Increase the budget or shorten the request.'), { status: 402 });
  const msg = await client.messages.stream(params, { signal }).finalMessage();
  const usage = msg.usage || {};
  const costUsd = ((usage.input_tokens || 0) * rates.input + (usage.output_tokens || 0) * rates.output + (usage.cache_read_input_tokens || 0) * rates.cacheRead + (usage.cache_creation_input_tokens || 0) * rates.cacheWrite) / 1e6;
  onUsage?.({ engine: 'api', model: msg.model, costUsd, estimated: true, input: usage.input_tokens || 0, output: usage.output_tokens || 0, cacheRead: usage.cache_read_input_tokens || 0 });
  if (msg.stop_reason === 'refusal') throw new Error(`Claude declined this request${msg.stop_details?.explanation ? `: ${msg.stop_details.explanation}` : ''}`);
  if (msg.stop_reason === 'max_tokens') throw new Error('Claude ran out of output space; try a shorter request.');
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return schema ? validateReply(schema, parseJsonLoose(text)) : text;
}

// ---------- Claude Code backend ----------
async function completeCli({ system, prompt, images, schema, effort, signal, onUsage, budgetUsd, timeoutMs = 5 * 60e3 }) {
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
    const args = ['-p', '--output-format', 'json', '--system-prompt-file', sysFile, '--no-session-persistence', '--model', s.model || 'claude-opus-5-5', '--effort', effort || s.effort || 'high'];
    if (files.length) args.push('--tools', 'Read', '--allowedTools', `Read(${work}/**)`, '--add-dir', work);
    else args.push('--tools', '');
    if (schema) args.push('--json-schema', JSON.stringify(schema));
    args.push('--max-budget-usd', String(budgetUsd), '--mcp-config', '{"mcpServers":{}}', '--strict-mcp-config');
    if (signal?.aborted) throw new Error('Cancelled');
    const out = await new Promise((resolve, reject) => {
      const child = spawn(cli.cmd, [...cli.prefix, ...args], { cwd: work, windowsHide: true, env: cliEnvironment() });
      let so = '', se = '';
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Claude Code timed out')); }, timeoutMs);
      const onAbort = () => { child.kill('SIGKILL'); reject(new Error('Cancelled')); };
      signal?.addEventListener('abort', onAbort, { once: true });
      child.stdout.on('data', (d) => { so += d; if (so.length > 16 * 1024 * 1024) { child.kill('SIGKILL'); reject(new Error('Claude response exceeded the output limit')); } });
      child.stderr.on('data', (d) => { se += d; });
      child.on('error', (e) => { clearTimeout(timer); reject(e); });
      child.on('close', (code) => {
        clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
        if (!so.trim()) return reject(new Error(`Claude Code exited (${code}) ${se.split('\n').filter(Boolean).slice(-3).join(' | ') || ''}`.trim()));
        resolve({ text: so, code });
      });
      child.stdin.end(body);
    });
    const res = parseJsonLoose(out.text);
    onUsage?.({ engine: 'claude-code', costUsd: res.total_cost_usd || 0, model: Object.keys(res.modelUsage || {})[0] || null });
    if (out.code !== 0 || res.is_error || res.subtype !== 'success') {
      const msg = String(res.result || res.error || res.subtype || 'error');
      if (/log ?in|auth|credential|not logged/i.test(msg)) throw Object.assign(new Error('Claude Code is not signed in. Open a terminal, run `claude`, sign in, then try again.'), { status: 401 });
      throw new Error(`Claude Code: ${msg.slice(0, 400)}`);
    }
    if (!schema) return res.result;
    return validateReply(schema, res.structured_output ?? parseJsonLoose(res.result));
  } finally {
    fsp.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * One Claude call.
 * { system, prompt, images: [path | Buffer | { data, mediaType, label }], schema, effort, signal, label, onUsage }
 */
export async function complete(opts) {
  if (opts.signal?.aborted) throw new Error('Cancelled');
  opts = { ...opts, budgetUsd: opts.budgetUsd ?? getSettings().productionBudgetUsd };
  if (!Number.isFinite(opts.budgetUsd) || opts.budgetUsd <= 0) throw Object.assign(new Error('Production budget exhausted'), { status: 402 });
  const engine = opts.engine || (await pickEngine());
  const run = engine === 'api' ? completeApi : completeCli;
  const onUsage = opts.onUsage;
  let spent = 0;
  const account = u => { spent += u.costUsd || 0; onUsage?.(u); };
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (spent >= opts.budgetUsd) throw Object.assign(new Error('Production budget exhausted'), { status: 402 });
      return await run({ ...opts, onUsage: account, budgetUsd: opts.budgetUsd - spent });
    } catch (e) {
      lastErr = e;
      if (opts.signal?.aborted || e.status === 401 || e.status === 412 || /declined|Cancelled/.test(e.message)) throw e;
      if (/session limit|usage limit|rate limit|429/i.test(e.message) || e.status === 429) {
        if (attempt === 0) { await delay(1000, undefined, { signal: opts.signal }); continue; }
        throw Object.assign(new Error('Claude usage limit reached. Wait for your provider limit to reset, then Resume.'), { status: 429 });
      }
      if (!/valid JSON|invalid schema|exited|overloaded|529|500|502|503/i.test(e.message)) throw e;
    }
  }
  throw lastErr;
}

export function budgetedComplete(onUsage = () => {}) {
  let used = 0;
  return opts => complete({ ...opts, budgetUsd: getSettings().productionBudgetUsd - used, onUsage: u => { used += u.costUsd || 0; onUsage(u); } });
}
