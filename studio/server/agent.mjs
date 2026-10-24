// The director: runs Claude Code headless with the studio's MCP tools so a brief typed in the studio becomes a
// finished design. It plans, builds what is missing (new 3D scene modules, research notes), generates assets,
// reviews its own renders, and learns from feedback. Failed runs are retried once with the error in hand, and
// renderer errors reported by browsers can start an automatic repair task.
//
// It uses the Claude Code CLI, so it bills the user's Claude plan (Pro/Max) unless they choose an API key.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { STUDIO_ROOT, DATA_DIR } from './store.mjs';
import { MEMORY_DIR, updateError, listErrors } from './memory.mjs';
import { readSettings } from './generators.mjs';

const TASKS_DIR = path.join(MEMORY_DIR, 'tasks');
const REPO_ROOT = path.resolve(STUDIO_ROOT, '..');
const running = new Map(); // id -> child process
let broadcast = () => {};
export const setAgentBroadcast = (fn) => { broadcast = fn; };

const which = (cmd) => {
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    const full = path.join(dir, cmd);
    try { if (fs.statSync(full).isFile()) return full; } catch { /* next */ }
  }
  return null;
};

export function agentStatus() {
  const cli = which('claude');
  const s = readSettings();
  return {
    available: !!cli,
    cli,
    billing: s.director?.useApiKey && (s.keys?.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY) ? 'Anthropic API key' : 'Claude plan (Pro/Max login)',
    model: s.director?.model || 'default',
    autoRepair: s.autoRepair !== false,
    why: cli ? null : 'Install Claude Code (`npm i -g @anthropic-ai/claude-code`) and sign in once with `claude`. The director runs it in the background.',
    running: [...running.keys()],
  };
}

// ---------- task store ----------
const taskFile = (id) => path.join(TASKS_DIR, `${id}.json`);
function saveTask(t) { fs.mkdirSync(TASKS_DIR, { recursive: true }); fs.writeFileSync(taskFile(t.id), JSON.stringify(t, null, 2)); return t; }
export function getTask(id) { try { return JSON.parse(fs.readFileSync(taskFile(path.basename(id)), 'utf8')); } catch { return null; } }
export function listTasks({ limit = 30 } = {}) {
  if (!fs.existsSync(TASKS_DIR)) return [];
  return fs.readdirSync(TASKS_DIR).filter((f) => f.endsWith('.json')).map((f) => { try { const t = JSON.parse(fs.readFileSync(path.join(TASKS_DIR, f), 'utf8')); return { ...t, log: undefined, logCount: t.log?.length || 0 }; } catch { return null; } })
    .filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, limit);
}

// ---------- prompts ----------
const DIRECTOR = `You are the Goldcom Studio director: an autonomous creative and engineering lead working inside the studio repository.
You have the goldcom-studio MCP tools plus file, search and web tools. Work until the task is truly finished; never stop at a plan.

Always:
1. Call studio_guide first. It gives the brand rules, the design DNA (what studio-grade means here), the lessons learned from earlier feedback, the 3D scenes available, the image generators available and any open errors. Lessons override your defaults.
2. Visual first: every idea is shown by one strong visual (a 3D scene, a generated image or a real screenshot) with at most one short line of copy. No kicker + headline + subline stacks, no sparkles, no flat yellow gold, no clip-art.
3. If no existing scene or generator can show the idea well, build the capability: write a new scene module with create_scene_module (contract in studio/modules/README.md, examples in studio/modules/scenes/), test it with test_scene at several times, Read the PNGs, and iterate until it looks studio-grade. If you lack the technique, research it (WebSearch/WebFetch) and save what you learned with save_knowledge so the next task can reuse it.
4. Choose images through generate_image; it routes to the best available provider and learns from ratings. Say which provider made what.
5. Review your own work: render_preview every slide, Read the images, compare against the design DNA "never do" list, fix, and run brand_check. Fix every error and warning.
6. When feedback says something was wrong, first turn it into a general rule with add_lesson (one rule per distinct problem, phrased so it prevents the problem next time), then fix the design.
7. Never invent prices, claims, statistics or testimonials. Prices are illustrative and labelled indicative with a date.
8. Finish with a short report: what you made (design id and link), which scenes and generators you used, anything you built or learned, and anything that needs a human (Arabic review, claims sign-off, prices to update).`;

function buildPrompt(t) {
  const lines = [`Task (${t.mode}): ${t.brief}`];
  if (t.designId) lines.push(`Design: ${t.designId}${Number.isFinite(t.slide) ? `, slide ${t.slide + 1}` : ''}. Read it with get_design before changing it.`);
  if (t.lang) lines.push(`Language: ${t.lang === 'ar' ? 'Arabic (write natively, Modern Standard Arabic for a Gulf audience)' : 'English'}.`);
  if (t.format) lines.push(`Format: ${t.format}. Kind: ${t.kind || 'post'}.`);
  if (t.feedback) {
    lines.push('', 'The user was not satisfied. Their feedback:');
    if (t.feedback.reasons?.length) lines.push(`Reasons: ${t.feedback.reasons.join(', ')}`);
    if (t.feedback.note) lines.push(`In their words: "${t.feedback.note}"`);
    lines.push('Record the lesson(s) with add_lesson first, then revise the design so it fixes every point. Keep what they did not complain about.');
  }
  if (t.error) {
    lines.push('', 'Self-repair. A renderer error was reported by the studio:', '```', JSON.stringify(t.error, null, 2).slice(0, 3000), '```',
      t.error.module ? `Read studio/modules/scenes/${t.error.module}.js (get_scene_source), find the cause, fix it with create_scene_module (same id), confirm with test_scene at t=0, 1.5 and 4, then call resolve_error with the signature ${t.error.sig}.` : `Find the cause in the studio code, fix it, verify, then call resolve_error with the signature ${t.error.sig}.`);
  }
  if (t.retryOf) lines.push('', `The previous attempt stopped with: ${t.lastError}. Continue from where it stopped, fix the cause, and finish.`);
  return lines.join('\n');
}

// ---------- running ----------
function summarise(ev) {
  if (ev.type === 'system' && ev.subtype === 'init') return { kind: 'info', text: `Started (${ev.model || 'model'}; tools: ${ev.mcp_servers?.map((s) => `${s.name} ${s.status}`).join(', ') || 'none'})` };
  if (ev.type === 'system' && ev.subtype === 'api_retry') return { kind: 'warn', text: `Retrying the API (${ev.error}, attempt ${ev.attempt})` };
  if (ev.type === 'assistant') {
    const out = [];
    for (const c of ev.message?.content || []) {
      if (c.type === 'text' && c.text?.trim()) out.push({ kind: 'text', text: c.text.trim() });
      if (c.type === 'tool_use') {
        const name = String(c.name).replace(/^mcp__goldcom-studio__/, '');
        const hint = c.input?.name || c.input?.id || c.input?.design_id || c.input?.prompt || c.input?.query || c.input?.file_path || c.input?.pattern || c.input?.url || '';
        out.push({ kind: 'tool', tool: name, text: `${name}${hint ? ` · ${String(hint).slice(0, 90)}` : ''}` });
      }
    }
    return out;
  }
  if (ev.type === 'user') {
    const errs = (ev.message?.content || []).filter((c) => c.type === 'tool_result' && c.is_error);
    return errs.map((e) => ({ kind: 'warn', text: `Tool error: ${JSON.stringify(e.content).slice(0, 220)}` }));
  }
  if (ev.type === 'result') return { kind: ev.is_error ? 'error' : 'done', text: ev.result || ev.subtype, cost: ev.total_cost_usd };
  return null;
}

function mcpConfig() {
  return JSON.stringify({ mcpServers: { 'goldcom-studio': { command: process.execPath, args: [path.join(STUDIO_ROOT, 'mcp', 'server.mjs')], env: { GOLDCOM_STUDIO_URL: process.env.STUDIO_PUBLIC_URL || `http://localhost:${process.env.PORT || 5177}`, GOLDCOM_STUDIO_DATA: DATA_DIR } } } });
}

export function startTask(spec) {
  const st = agentStatus();
  if (!st.available) throw Object.assign(new Error(st.why), { status: 503 });
  const t = saveTask({
    id: `task_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    createdAt: new Date().toISOString(), status: 'running', attempts: 0, log: [],
    mode: spec.mode || 'create', brief: String(spec.brief || '').slice(0, 6000), designId: spec.designId || null, slide: Number.isFinite(spec.slide) ? spec.slide : null,
    lang: spec.lang || null, format: spec.format || null, kind: spec.kind || null, feedback: spec.feedback || null, error: spec.error || null, feedbackId: spec.feedbackId || null,
  });
  run(t);
  return t;
}

function run(t) {
  const s = readSettings();
  t.attempts += 1;
  const env = { ...process.env, GOLDCOM_STUDIO_DATA: DATA_DIR };
  const useKey = s.director?.useApiKey && (s.keys?.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY);
  if (useKey) env.ANTHROPIC_API_KEY = s.keys?.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  else delete env.ANTHROPIC_API_KEY; // bill the Claude plan
  const args = [
    '-p', buildPrompt(t), '--output-format', 'stream-json', '--verbose',
    '--mcp-config', mcpConfig(), '--strict-mcp-config',
    '--permission-mode', 'dontAsk',
    '--allowedTools', ['mcp__goldcom-studio', 'mcp__goldcom-studio__*', 'Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'Edit(studio/knowledge/**)', 'Write(studio/knowledge/**)', 'Edit(studio/modules/**)', 'Write(studio/modules/**)'].join(','),
    '--append-system-prompt', DIRECTOR,
    '--max-turns', String(s.director?.maxTurns || 80),
  ];
  if (s.director?.model) args.push('--model', s.director.model);
  const child = spawn(which('claude'), args, { cwd: REPO_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  running.set(t.id, child);
  const push = (entry) => {
    const e = { at: new Date().toISOString(), ...entry };
    t.log.push(e);
    if (t.log.length > 400) t.log.splice(0, t.log.length - 400);
    broadcast({ type: 'agent', taskId: t.id, entry: e, status: t.status });
  };
  push({ kind: 'info', text: t.attempts > 1 ? `Attempt ${t.attempts}: retrying after an error` : 'Director started' });
  let buf = '', stderr = '', result = null;
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }
      if (ev.type === 'result') result = ev;
      const sum = summarise(ev);
      for (const e of [].concat(sum || [])) push(e);
      // Remember the design the director creates so the UI can open it.
      const m = /doc_[a-z0-9]{6,}/.exec(line);
      if (m && !t.designId) t.designId = m[0];
    }
    saveTask(t);
  });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', (code) => {
    running.delete(t.id);
    const failed = code !== 0 || result?.is_error;
    if (failed && t.status !== 'cancelled' && t.attempts < 2) {
      // Self-heal: try once more with the error in hand.
      t.retryOf = true;
      t.lastError = (result?.result || stderr || `exit ${code}`).slice(-800);
      saveTask(t);
      return run(t);
    }
    t.status = t.status === 'cancelled' ? 'cancelled' : failed ? 'failed' : 'done';
    t.finishedAt = new Date().toISOString();
    t.result = result?.result || null;
    t.cost = result?.total_cost_usd ?? null;
    if (failed && stderr) push({ kind: 'error', text: stderr.slice(-600) });
    if (t.error?.sig && !failed) updateError(t.error.sig, { status: 'fixed', fixedBy: t.id });
    saveTask(t);
    broadcast({ type: 'agent', taskId: t.id, status: t.status, designId: t.designId, done: true });
  });
}

export function cancelTask(id) {
  const child = running.get(id);
  const t = getTask(id);
  if (t) { t.status = 'cancelled'; saveTask(t); }
  if (child) child.kill('SIGINT');
  return t;
}

// ---------- self-repair ----------
const lastRepair = new Map();
/** Called for every new error signature. Starts at most one repair per module every 10 minutes, two attempts per signature. */
export function maybeRepair(entry) {
  const s = readSettings();
  if (s.autoRepair === false || !agentStatus().available) return null;
  if (entry.attempts >= 2) return null;
  const k = entry.module || entry.source;
  if (Date.now() - (lastRepair.get(k) || 0) < 10 * 60 * 1000) return null;
  lastRepair.set(k, Date.now());
  updateError(entry.sig, { status: 'repairing', attempts: (entry.attempts || 0) + 1 });
  return startTask({ mode: 'repair', brief: `Fix the error "${entry.message}" so the ${entry.module ? `"${entry.module}" scene` : 'studio'} renders again.`, error: entry });
}

export function openErrorCount() { return listErrors().filter((e) => e.status !== 'fixed').length; }
