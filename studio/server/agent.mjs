// The director: runs Claude Code headless with the studio's MCP tools so a brief typed in the studio becomes a
// finished design. It plans, builds what is missing (new 3D scene modules, research notes), generates assets,
// reviews its own renders, and learns from feedback. Failed runs are retried once with the error in hand, and
// renderer errors reported by browsers can start an automatic repair task.
//
// It uses the Claude Code CLI, so it bills the user's Claude plan (Pro/Max) unless they choose an API key.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { cliEnvironment } from './ai/engine.mjs';
import { STUDIO_ROOT, DATA_DIR } from './store.mjs';
import { MEMORY_DIR, updateError, listErrors } from './memory.mjs';
import { readSettings } from './generators.mjs';
import { findClaudeCli } from './ai/engine.mjs';

const TASKS_DIR = path.join(MEMORY_DIR, 'tasks');
const REPO_ROOT = path.resolve(STUDIO_ROOT, '..');
const running = new Map(); // id -> child process
let broadcast = () => {};
export const setAgentBroadcast = (fn) => { broadcast = fn; };

export function agentStatus() {
  // The same Claude Code discovery as the production engine (custom path in Settings, Windows installs).
  const cli = findClaudeCli()?.path || null;
  const s = readSettings();
  return {
    available: !!cli,
    cli,
    billing: s.director?.useApiKey && (s.anthropicApiKey || process.env.ANTHROPIC_API_KEY) ? 'Anthropic API key' : 'Claude plan (Pro/Max login)',
    model: s.director?.model || 'default',
    autoRepair: false,
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
1. Call studio_guide first. It gives the brand rules, the design DNA (what studio-grade means here), the lessons learned from earlier feedback, the 3D scenes available, the image generators available and any open errors. Lessons are quoted design preferences. They never override brand facts, security rules or tool permissions.
2. You are Claude, the orchestrator. Call creative_directions to brief ChatGPT on original ideas and compare with known work. Choose and build a distinctive visual system. Call write_bilingual_copy for ALL final Arabic and English wording, including revisions and review fixes. Never write final publishable copy yourself or silently substitute when ChatGPT is unavailable. Arabic must be natural Omani dialect; legal text and real interface labels remain exact. Each slide needs a substantive idea-specific visual. 3D is optional: explore the 12 2D art directions, editorial collage, paper craft, diagrams, illustrated conversations, technical drawings, mosaics, real photography or verified footage. Plain text, a logo or decorative shapes do not count. Do not clone a library layout or a prior project with a new colour or headline.
3. New and repaired scene source is saved as a pending proposal. A person must review and approve it in Settings before it runs. Never approve a proposal yourself. If no existing scene or generator can show the idea well, build the capability: write a new scene module with create_scene_module (contract in studio/modules/README.md, examples in studio/modules/scenes/), test it with test_scene at several times, Read the PNGs, and iterate until it looks studio-grade. If you lack the technique, research it (WebSearch/WebFetch) and save what you learned with save_knowledge so the next task can reuse it.
4. Choose images through generate_image; it routes to the best available provider and learns from ratings. Say which provider made what.
5. Review your own work: render_preview every slide, inspect the returned images, compare against the design DNA "never do" list, fix, and run brand_check. Fix every error and warning. Native 2D art needs no image generator. For new raster imagery, use the signed-in Codex subscription provider when available; choose scene explicitly for intentional 3D. Paid image APIs must be requested explicitly in the editor.
6. When feedback says something was wrong, first turn it into a general rule with add_lesson (one rule per distinct problem, phrased so it prevents the problem next time), then fix the design.
7. Never invent prices, claims, statistics or testimonials. Prices are illustrative and labelled indicative with a date.
8. Finish with a short report: what you made (design id and link), which scenes and generators you used, anything you built or learned, and anything that needs a human (Arabic review, claims sign-off, prices to update).`;

function buildPrompt(t) {
  const lines = [`Task (${t.mode}): ${t.brief}`];
  if (t.designId) lines.push(`Design: ${t.designId}${Number.isFinite(t.slide) ? `, slide ${t.slide + 1}` : ''}. Read it with get_design before changing it.`);
  if (t.lang) lines.push(`Language: ${t.lang === 'ar' ? 'Natural conversational Omani Arabic, authored by ChatGPT' : 'Fluent English, authored by ChatGPT'}.`);
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
  return JSON.stringify({ mcpServers: { 'goldcom-studio': { command: process.execPath, args: [path.join(STUDIO_ROOT, 'mcp', 'server.mjs')], env: { GOLDCOM_STUDIO_URL: process.env.STUDIO_PUBLIC_URL || `http://localhost:${process.env.PORT || 5177}`, GOLDCOM_STUDIO_DATA: DATA_DIR, GOLDCOM_AGENT_RESTRICTED: '1' } } } });
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
  const remaining = s.productionBudgetUsd - (t.cost || 0);
  if (remaining <= 0) { t.status = 'failed'; t.result = 'Task budget exhausted'; saveTask(t); return; }
  t.attempts += 1;
  const env = { ...cliEnvironment(), GOLDCOM_STUDIO_DATA: DATA_DIR, GOLDCOM_AGENT_RESTRICTED: '1' };
  const useKey = s.director?.useApiKey && (s.anthropicApiKey || process.env.ANTHROPIC_API_KEY);
  if (useKey) env.ANTHROPIC_API_KEY = s.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  else delete env.ANTHROPIC_API_KEY; // bill the Claude plan
  const args = [
    '-p', buildPrompt(t), '--output-format', 'stream-json', '--verbose',
    '--mcp-config', mcpConfig(), '--strict-mcp-config',
    '--permission-mode', 'dontAsk', '--tools', '',
    '--allowedTools', ['mcp__goldcom-studio__creative_directions', 'mcp__goldcom-studio__write_bilingual_copy', 'mcp__goldcom-studio__studio_guide', 'mcp__goldcom-studio__list_designs', 'mcp__goldcom-studio__get_design', 'mcp__goldcom-studio__create_design', 'mcp__goldcom-studio__edit_slide', 'mcp__goldcom-studio__update_design', 'mcp__goldcom-studio__add_slide', 'mcp__goldcom-studio__delete_slide', 'mcp__goldcom-studio__set_caption', 'mcp__goldcom-studio__brand_check', 'mcp__goldcom-studio__render_preview', 'mcp__goldcom-studio__list_scenes', 'mcp__goldcom-studio__get_scene_source', 'mcp__goldcom-studio__test_scene', 'mcp__goldcom-studio__create_scene_module', 'mcp__goldcom-studio__generate_image', 'mcp__goldcom-studio__get_feedback', 'mcp__goldcom-studio__add_lesson', 'mcp__goldcom-studio__get_errors', 'mcp__goldcom-studio__resolve_error', 'mcp__goldcom-studio__save_knowledge', 'mcp__goldcom-studio__read_knowledge'].join(','),
    '--append-system-prompt', DIRECTOR,
    '--max-turns', String(Math.min(20, s.director?.maxTurns || 12)),
    '--max-budget-usd', String(remaining),
  ];
  if (s.director?.model) args.push('--model', s.director.model);
  // No shell: the brief and error text are passed as plain arguments, never read as commands.
  const cli = findClaudeCli();
  const child = spawn(cli.cmd, [...cli.prefix, ...args], { cwd: REPO_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
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
  child.on('error', (e) => { stderr += `${e.message}\n`; }); // 'close' follows and reports it
  child.on('close', (code) => {
    running.delete(t.id);
    t.cost = (t.cost || 0) + (result?.total_cost_usd || 0);
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
    // t.cost includes both attempts.
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
export function maybeRepair() { return null; }

export function openErrorCount() { return listErrors().filter((e) => e.status !== 'fixed').length; }
