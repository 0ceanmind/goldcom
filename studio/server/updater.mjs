// One-click updates from GitHub (repo + default channel in ../release.json).
// Git checkout: fetch + reset (fast). Plain folder (ZIP download): turned into a git checkout when git is
// installed, otherwise the channel's ZIP is unpacked over the install. Then `npm install` (only when
// package.json / package-lock.json changed) and a vite build; the caller restarts the server.
// Never touches the data dir; node_modules and dist only through npm and vite.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { STUDIO_ROOT, DATA_DIR } from './store.mjs';
import { run, npmInstall, viteBuild, depsHash, writeStamp } from '../scripts/launcher.mjs';

export const ROOT = path.resolve(STUDIO_ROOT, '..');
export const RESTART_CODE = 75; // exit code that tells the launcher loop to start the server again
const INSTALL_FILE = path.join(DATA_DIR, 'install.json'); // ZIP installs: { repo, branch, sha, date, message, files }
const DEFAULTS = { repo: '0ceanmind/goldcom', branch: 'claude/friendly-ritchie-ou0783' };
const MAX_CHANGES = 30;
const GIT_ENV = { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', LC_ALL: 'C' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function release() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(path.join(STUDIO_ROOT, 'release.json'), 'utf8')) }; } catch { return { ...DEFAULTS }; }
}
const validBranch = (b) => typeof b === 'string' && /^[\w.-]+(\/[\w.-]+)*$/.test(b) && !b.startsWith('-') && !b.includes('..') && !b.endsWith('.lock');
function errText(err) {
  const lines = String(err?.stderr || err?.message || err).split('\n').map((l) => l.trim()).filter((l) => l && !/^Node\.js v\d/.test(l));
  return lines.findLast((l) => /error|fatal|failed|cannot|not found|denied|EPERM|EACCES|ENOENT/i.test(l)) || lines.pop() || err?.message || 'unknown error';
}

// ---------- git ----------
const git = async (args, opts) => (await run('git', args, { cwd: ROOT, env: GIT_ENV, timeoutMs: 60e3, ...opts })).stdout.trim();
const gitOk = (args) => git(args).then(() => true, () => false);
const FMT = '--format=%H%x1f%cI%x1f%s';
const parseLog = (out) => out.split('\n').filter(Boolean).map((l) => { const [sha, date, message] = l.split('\x1f'); return { sha, date, message }; });
const gitCommit = (ref) => git(['log', '-1', FMT, ref, '--']).then((o) => parseLog(o)[0] || null, () => null);
const gitBranch = () => git(['symbolic-ref', '--short', '-q', 'HEAD']).then((b) => b || null, () => null);
const isAncestor = (a, b) => gitOk(['merge-base', '--is-ancestor', a, b]);
const which = (cmd) => (process.env.PATH || '').split(path.delimiter).map((d) => path.join(d, cmd)).find((f) => fs.existsSync(f)) || null;

let gitCheck = null;
function hasGit() {
  gitCheck ??= (async () => {
    // macOS ships a /usr/bin/git stub that opens an "install developer tools" dialog instead of running
    if (process.platform === 'darwin' && which('git') === '/usr/bin/git' && !(await run('/usr/bin/xcode-select', ['-p'], { timeoutMs: 10e3 }).then(() => true, () => false))) return false;
    return run('git', ['--version'], { timeoutMs: 15e3 }).then(() => true, () => false);
  })();
  return gitCheck;
}
const mode = async () => (fs.existsSync(path.join(ROOT, '.git')) && (await hasGit()) ? 'git' : 'zip');

async function gitRemote() {
  const remotes = await git(['remote']).catch(() => '');
  return remotes.split('\n').includes('origin') ? 'origin' : `https://github.com/${release().repo}.git`;
}
/** Fetch the channel into refs/remotes/origin/<branch>; returns its sha. */
async function gitFetch(branch) {
  await git(['fetch', '--quiet', '--no-tags', await gitRemote(), `+refs/heads/${branch}:refs/remotes/origin/${branch}`], { timeoutMs: 180e3 });
  return git(['rev-parse', '--verify', `refs/remotes/origin/${branch}^{commit}`]);
}
async function assertHasStudio(sha, branch) {
  if (await gitOk(['cat-file', '-e', `${sha}:studio/package.json`])) return;
  throw Object.assign(new Error(`${branch} has no studio/package.json`), { friendly: `The update channel "${branch}" does not contain Goldcom Studio, so nothing was changed.` });
}
async function setUpstream(branch) {
  if ((await gitRemote()) !== 'origin') return;
  await git(['config', `branch.${branch}.remote`, 'origin']).catch(() => {});
  await git(['config', `branch.${branch}.merge`, `refs/heads/${branch}`]).catch(() => {});
}

// ---------- GitHub API (ZIP installs) ----------
const UA = { 'User-Agent': 'goldcom-studio-updater' };
async function gh(api, timeoutMs = 20e3) {
  const headers = { ...UA, Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
  const res = await fetch(`https://api.github.com${api}`, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    res.body?.cancel().catch(() => {});
    throw Object.assign(new Error(`GitHub API ${res.status}`), { status: res.status, rateLimited: res.status === 429 || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') });
  }
  return res.json();
}
const refPath = (b) => b.split('/').map(encodeURIComponent).join('/');
const apiCommit = (c) => ({ sha: c.sha, date: c.commit?.committer?.date || c.commit?.author?.date || null, message: String(c.commit?.message || '').split('\n')[0] });
const latestCommit = (repo, branch) => gh(`/repos/${repo}/commits/${refPath(branch)}`).then(apiCommit);

function readInstall() {
  try { return JSON.parse(fs.readFileSync(INSTALL_FILE, 'utf8').replace(/^\uFEFF/, '')); } catch { return null; }
}

function friendly(err, branch, what = 'check for updates') {
  if (err?.friendly) return err.friendly;
  const s = [err?.message, err?.stderr, err?.cause?.code, err?.cause?.message].filter(Boolean).join(' ');
  if (err?.status === 404 || /couldn't find remote ref|not found|does not exist/i.test(s)) return `The update channel "${branch}" was not found on GitHub.`;
  if (err?.rateLimited || err?.status === 403 || /rate limit/i.test(s)) return 'GitHub is limiting update checks right now. Please try again in an hour.';
  if ((err?.status === 401 || err?.status === 407) && process.env.GITHUB_TOKEN) return 'GitHub did not accept GITHUB_TOKEN. Check the token or remove it.';
  if (err?.status >= 500) return 'GitHub is not responding right now. Please try again later.';
  if (err?.status === 401 || err?.status === 407) return 'Could not reach GitHub. Check your internet connection and try again.';
  if (/timeout|timed out|abort|ENOTFOUND|EAI_AGAIN|ECONN|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|fetch failed|could not resolve|unable to access|failed to connect|network/i.test(s)) {
    return 'Could not reach GitHub. Check your internet connection and try again.';
  }
  return `Could not ${what}: ${errText(err)}`;
}

// ---------- version + check ----------
/** { mode: 'git'|'zip', repo, branch, current: { sha, date, message } | null, localBranch, root, updating } */
export async function getVersionInfo({ branch } = {}) {
  const rel = release();
  const m = await mode();
  const info = { mode: m, repo: rel.repo, branch: branch || rel.branch, current: null, localBranch: null, root: ROOT, updating: !!lock };
  if (m === 'git') {
    [info.current, info.localBranch] = await Promise.all([gitCommit('HEAD'), gitBranch()]);
  } else {
    const inst = readInstall();
    if (inst?.sha) info.current = { sha: inst.sha, date: inst.date || null, message: inst.message || '' };
    info.localBranch = inst?.branch || null;
  }
  return info;
}

const checks = new Map();
/** Never throws: network problems come back as { available: false, error }. */
export async function checkForUpdate({ branch } = {}) {
  const b = branch || release().branch;
  if (!checks.has(b)) checks.set(b, check(b).finally(() => checks.delete(b)));
  return checks.get(b);
}

async function check(branch) {
  const result = { available: false, mode: null, branch, current: null, latest: null, behind: 0, changes: [] };
  try {
    const info = await getVersionInfo({ branch });
    Object.assign(result, { mode: info.mode, current: info.current });
    if (lock) return { ...result, updating: true, error: 'An update is already in progress.' };
    if (!validBranch(branch)) return { ...result, error: `"${branch}" is not a valid update channel name.` };
    return info.mode === 'git' ? await checkGit(result, info) : await checkZip(result, info);
  } catch (err) {
    return { ...result, available: false, error: friendly(err, branch) };
  }
}

async function checkGit(result, info) {
  const to = await gitFetch(result.branch);
  result.latest = await gitCommit(to);
  const head = info.current?.sha;
  if (head === to) return result;
  await assertHasStudio(to, result.branch);
  // switching channel, or HEAD is not behind the channel tip: still offered (applyUpdate resets to the tip)
  result.available = info.localBranch !== result.branch || !head || !(await isAncestor(to, 'HEAD'));
  if (head) {
    result.behind = Number(await git(['rev-list', '--count', `HEAD..${to}`])) || 0;
    result.changes = parseLog(await git(['log', `-${MAX_CHANGES}`, FMT, `HEAD..${to}`, '--']));
  }
  return result;
}

async function checkZip(result, info) {
  const { repo } = release();
  const latest = (result.latest = await latestCommit(repo, result.branch));
  const cur = info.current;
  if (cur?.sha === latest.sha) return result;
  result.available = true;
  result.behind = null; // unknown until compared
  result.changes = [latest];
  if (!cur) return result;
  try {
    const cmp = await gh(`/repos/${repo}/compare/${cur.sha}...${latest.sha}`);
    if (cmp.status === 'behind' && (!info.localBranch || info.localBranch === result.branch)) result.available = false;
    result.behind = cmp.ahead_by || 0;
    result.changes = (cmp.commits || []).slice(-MAX_CHANGES).reverse().map(apiCommit);
  } catch { /* unknown history (e.g. force-push): still offer the update */ }
  return result;
}

// ---------- apply ----------
let lock = null;

/**
 * Update to the tip of `branch` (default: release.json). onProgress({ step, message, pct }).
 * Resolves { ok: true, from, to, restart: true } or { ok: false, step, error, log, rolledBack?, restart: false }.
 */
export async function applyUpdate({ branch, onProgress } = {}) {
  if (lock) return { ok: false, busy: true, error: 'An update is already in progress.', restart: false };
  lock = update(branch || release().branch, onProgress);
  try { return await lock; } finally { lock = null; }
}

async function update(branch, onProgress) {
  const log = [];
  let step = 'prepare';
  const report = (s, message, pct = null) => {
    step = s;
    if (message) { log.push(message); if (log.length > 80) log.shift(); }
    try { onProgress?.({ step: s, message, pct }); } catch { /* progress only */ }
  };
  const ctx = { branch, repo: release().repo, report, lines: (s, pct) => (line) => report(s, line, pct) };
  const fail = (err) => ({ ok: false, step, error: stepError(step, err, branch), detail: err?.message ? errText(err) : null, log: log.slice(-40).join('\n'), restart: false });
  if (!validBranch(branch)) return fail({ friendly: `"${branch}" is not a valid update channel name.` });

  const before = depsHash();
  let res;
  try {
    const m = await mode();
    if (m === 'git') res = await gitUpdate(ctx);
    else {
      assertInstallRoot();
      res = (await hasGit()) ? await convertToGit(ctx) : await zipUpdate(ctx);
    }
    if (res.upToDate) {
      report('done', 'Already up to date.', 100);
      return { ok: true, mode: m, from: res.from, to: res.to, branch, upToDate: true, converted: !!res.converted, restart: false };
    }
    if (depsHash() !== before || !fs.existsSync(path.join(STUDIO_ROOT, 'node_modules'))) {
      report('install', 'Installing updated components (this can take a minute)...', 45);
      ctx.npmRan = true;
      await npmInstall({ onLine: ctx.lines('install', 45) });
      writeStamp();
    }
    report('build', 'Building the editor...', 75);
    ctx.built = true;
    await viteBuild({ onLine: ctx.lines('build', 75) });
    await res.finish?.();
    report('done', 'Update installed.', 100);
    return { ok: true, mode: m, from: res.from, to: res.to, branch, stashed: res.stashed || null, converted: !!res.converted, restart: true };
  } catch (err) {
    log.push(errText(err));
    const out = fail(err); // log tail as it was when the step failed
    if (ctx.rollback) {
      report('rollback', 'Restoring the previous version...');
      try {
        await ctx.rollback();
        out.rolledBack = true;
        report('rollback', 'The previous version was restored.');
      } catch (e) {
        out.rolledBack = false;
        out.rollbackError = errText(e);
        report('rollback', `Could not restore the previous version: ${out.rollbackError}`);
      }
      out.log += `\n${out.rolledBack ? 'The previous version was restored.' : `Restoring the previous version failed: ${out.rollbackError}`}`;
    }
    return out;
  }
}

function stepError(step, err, branch) {
  if (err?.friendly) return err.friendly;
  if (step === 'prepare' || step === 'download') return friendly(err, branch, 'download the update');
  return {
    stash: 'Could not set aside your local file changes, so nothing was updated.',
    apply: 'Could not replace the program files. Close other programs using the Goldcom folder and try again.',
    install: 'Could not install the updated components. Check your internet connection and try again.',
    build: 'Could not build the new version of the editor.',
  }[step] || `The update failed: ${errText(err)}`;
}

function assertInstallRoot() {
  // a lone studio/ folder copied elsewhere must not unpack the whole repo (or `git init`) into its parent
  if (['brand', 'Goldcom Studio.cmd', 'goldcom-studio.sh', 'Goldcom Studio.command'].some((m) => fs.existsSync(path.join(ROOT, m)))) return;
  throw Object.assign(new Error(`unexpected install folder ${ROOT}`), {
    friendly: 'This copy of Goldcom Studio is not inside the complete Goldcom folder, so it cannot update itself. Reinstall it with the installer (see install/README.md).',
  });
}

async function gitUpdate(ctx) {
  const { branch, report } = ctx;
  report('download', `Downloading the latest version (${branch})...`, 10);
  const [head, fromBranch] = await Promise.all([gitCommit('HEAD'), gitBranch()]);
  const from = head?.sha || null;
  const to = await gitFetch(branch);
  if (from === to && fromBranch === branch) return { upToDate: true, from, to };
  await assertHasStudio(to, branch);

  const stashed = from ? await stashLocalChanges(ctx) : null;
  if (from) {
    ctx.rollback = async () => {
      if (fromBranch === branch) await git(['reset', '--hard', '--quiet', from]);
      else await git(['checkout', '-f', '-q', ...(fromBranch ? [fromBranch] : ['--detach', from])]);
      if (stashed) await git(['stash', 'pop', '--quiet']).catch(() => {});
      if (ctx.npmRan) {
        report('rollback', 'Reinstalling the previous components...');
        await npmInstall({ onLine: ctx.lines('rollback') });
        writeStamp();
      }
      if (ctx.built || ctx.npmRan) {
        report('rollback', 'Rebuilding the previous version...');
        await viteBuild({ onLine: ctx.lines('rollback') });
      }
    };
  }
  report('apply', 'Installing the new files...', 30);
  if (from && fromBranch === branch && !(await isAncestor('HEAD', to))) {
    const backup = `goldcom-backup-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
    await git(['branch', backup, 'HEAD']);
    report('apply', `Local commits kept on branch ${backup}.`);
  }
  // tracked files only: untracked and ignored files (data, node_modules, dist) are left alone
  if (fromBranch === branch) await git(['reset', '--hard', '--quiet', to]);
  else await git(['checkout', '-f', '-q', '-B', branch, to]);
  await setUpstream(branch);
  return { from, to, stashed };
}

/** git stash for edited tracked files (npm's own package-lock.json rewrites are just discarded). */
async function stashLocalChanges({ report }) {
  const dirty = (await git(['diff', '--name-only', '-z', 'HEAD', '--'])).split('\0').filter(Boolean);
  if (!dirty.some((f) => f !== 'studio/package-lock.json')) return null;
  report('stash', 'Saving your local file changes (git stash)...', 30);
  const message = `goldcom-studio auto-stash ${new Date().toISOString()}`;
  const ident = (await git(['config', 'user.email']).catch(() => '')) ? [] : ['-c', 'user.name=Goldcom Studio', '-c', 'user.email=studio@goldcom.invalid'];
  await git([...ident, 'stash', 'push', '--quiet', '-m', message]);
  return message;
}

async function convertToGit(ctx) {
  const { branch, repo, report } = ctx;
  report('download', 'Setting up faster updates (one time)...', 5);
  const inst = readInstall();
  const dotGit = path.join(ROOT, '.git');
  const existed = fs.existsSync(dotGit);
  let to;
  try {
    await git(['init', '--quiet']);
    await git(['symbolic-ref', 'HEAD', `refs/heads/${branch}`]);
    await git(['remote', 'add', 'origin', `https://github.com/${repo}.git`]);
    report('download', `Downloading the latest version (${branch})...`, 10);
    to = await gitFetch(branch);
    await assertHasStudio(to, branch);
    report('apply', 'Installing the new files...', 30);
    await git(['reset', '--hard', '--quiet', to]);
  } catch (err) {
    if (!existed) await fsp.rm(dotGit, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
  await setUpstream(branch);
  if (Array.isArray(inst?.files)) {
    const tracked = new Set((await git(['ls-files', '-z'])).split('\0'));
    await removeStale(inst.files.filter((f) => !tracked.has(f)));
  }
  await fsp.rm(INSTALL_FILE, { force: true }); // git is the source of truth from now on
  return { from: inst?.sha || null, to, converted: true, upToDate: inst?.sha === to };
}

async function zipUpdate(ctx) {
  const { branch, repo, report } = ctx;
  const inst = readInstall();
  report('download', `Downloading the latest version (${branch})...`, 5);
  let latest = await latestCommit(repo, branch).catch(() => null); // metadata only: the ZIP comment carries the sha
  if (latest && inst?.sha === latest.sha) return { upToDate: true, from: inst.sha, to: latest.sha };
  const zip = await download(`https://codeload.github.com/${repo}/zip/refs/heads/${refPath(branch)}`, report);
  const sha = zipComment(zip) || latest?.sha || null;
  if (latest?.sha !== sha) latest = { sha, date: null, message: '' };

  const { unzipSync } = await import('fflate');
  report('apply', 'Installing the new files...', 35);
  const files = new Map();
  for (const [name, data] of Object.entries(unzipSync(zip))) {
    const i = name.indexOf('/'); // strip the top folder (goldcom-<branch>/)
    const rel = name.slice(i + 1);
    if (i < 0 || !rel || rel.endsWith('/') || skipPath(rel)) continue;
    files.set(rel, data);
  }
  if (!files.has('studio/package.json')) throw Object.assign(new Error('studio/package.json missing from the download'), { friendly: 'The downloaded update looks incomplete. Please try again later.' });
  let changed = 0;
  for (const [rel, data] of files) if (await writeIfChanged(path.join(ROOT, rel), data)) changed++;
  if (Array.isArray(inst?.files)) await removeStale(inst.files.filter((f) => !files.has(f)));
  report('apply', `${changed} file${changed === 1 ? '' : 's'} updated.`, 40);
  const finish = async () => {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    const info = { repo, branch, sha, date: latest.date, message: latest.message, updatedAt: new Date().toISOString(), files: [...files.keys()].sort() };
    await writeAtomic(INSTALL_FILE, `${JSON.stringify(info, null, 2)}\n`);
  };
  return { from: inst?.sha || null, to: sha, finish };
}

async function download(url, report) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15 * 60e3) });
  if (!res.ok) throw Object.assign(new Error(`Download failed (HTTP ${res.status})`), { status: res.status });
  const total = Number(res.headers.get('content-length')) || 0;
  const chunks = [];
  let got = 0;
  let shown = 0;
  for await (const chunk of res.body) {
    chunks.push(chunk);
    got += chunk.length;
    if (got - shown < 1 << 20) continue;
    shown = got;
    report('download', total ? `Downloading... ${Math.round((got / total) * 100)}%` : `Downloading... ${(got / 1048576).toFixed(1)} MB`, total ? 5 + (got / total) * 25 : 15);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/** GitHub archives carry the commit sha as the ZIP comment. */
function zipComment(buf) {
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf[i] !== 0x50 || buf[i + 1] !== 0x4b || buf[i + 2] !== 0x05 || buf[i + 3] !== 0x06) continue;
    const c = Buffer.from(buf.subarray(i + 22, i + 22 + (buf[i + 20] | (buf[i + 21] << 8)))).toString('latin1').trim();
    return /^[0-9a-f]{40}$/.test(c) ? c : null;
  }
  return null;
}

const SKIP = /^studio\/(?:data|dist)\/|(?:^|\/)(?:node_modules|\.git)(?:\/|$)/;
function skipPath(rel) {
  if (SKIP.test(rel) || rel.includes('\\') || rel.split('/').some((p) => p === '' || p === '.' || p === '..')) return true;
  const abs = path.resolve(ROOT, rel);
  return !abs.startsWith(ROOT + path.sep) || abs === DATA_DIR || abs.startsWith(DATA_DIR + path.sep);
}

async function writeIfChanged(file, data) {
  const old = await fsp.readFile(file).catch(() => null);
  if (old && Buffer.compare(old, data) === 0) return false;
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const mode = old ? (await fsp.stat(file)).mode & 0o777 : /\.(sh|command)$/.test(file) ? 0o755 : 0o644;
  await writeAtomic(file, data, mode);
  return true;
}

async function writeAtomic(file, data, mode = 0o644) {
  const tmp = `${file}.${process.pid}.goldcom-tmp`;
  await fsp.writeFile(tmp, data, { mode });
  for (let i = 0; ; i++) {
    try { await fsp.rename(tmp, file); return; } catch (err) {
      // Windows: antivirus or the search indexer can hold a freshly written file for a moment
      if (i >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) { await fsp.rm(tmp, { force: true }); throw err; }
      await sleep(200 * (i + 1));
    }
  }
}

async function removeStale(rels) {
  for (const rel of rels) {
    if (typeof rel !== 'string' || skipPath(rel)) continue;
    const file = path.resolve(ROOT, rel);
    await fsp.rm(file, { force: true }).catch(() => {}); // files only: never recursive
    for (let dir = path.dirname(file); dir.startsWith(ROOT + path.sep); dir = path.dirname(dir)) {
      try { await fsp.rmdir(dir); } catch { break; } // drop folders that became empty
    }
  }
}

// ---------- channels, restart, auto-check ----------
/** Branch names of the repo (GitHub API, falling back to `git ls-remote`). */
export async function listChannels() {
  const { repo, branch } = release();
  try {
    const names = [];
    for (let page = 1; page <= 10; page++) {
      const list = await gh(`/repos/${repo}/branches?per_page=100&page=${page}`);
      names.push(...list.map((b) => b.name));
      if (list.length < 100) break;
    }
    return names;
  } catch { /* rate-limited or offline: try git */ }
  try {
    if (await hasGit()) {
      const remote = fs.existsSync(path.join(ROOT, '.git')) ? await gitRemote() : `https://github.com/${repo}.git`;
      const names = (await git(['ls-remote', '--heads', remote])).split('\n').map((l) => l.split('\trefs/heads/')[1]).filter(Boolean);
      if (names.length) return names;
    }
  } catch { /* offline */ }
  return [branch];
}

/**
 * Under a launcher (GOLDCOM_LAUNCHER=1) exit with RESTART_CODE and let its loop start the new version;
 * otherwise start a detached copy of this process (it waits for the port, see listenWithRetry) and exit.
 */
export function restartServer({ cleanup, delayMs = 300 } = {}) {
  setTimeout(async () => {
    try { await Promise.race([cleanup?.(), sleep(3000)]); } catch { /* exiting anyway */ }
    if (process.env.GOLDCOM_LAUNCHER === '1') process.exit(RESTART_CODE);
    try {
      spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)], { cwd: process.cwd(), env: process.env, detached: true, stdio: 'ignore', windowsHide: true }).unref();
    } catch (err) {
      console.error(`[studio] could not restart: ${err.message}`);
      return;
    }
    process.exit(0);
  }, delayMs);
}

/** server.listen that waits (every 300 ms, up to 15 s) while the previous server still holds the port. */
export function listenWithRetry(server, port, host, onReady, { retryMs = 300, timeoutMs = 15e3 } = {}) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const onError = (err) => {
        server.off('listening', onListening);
        if (err.code === 'EADDRINUSE' && Date.now() - started < timeoutMs) return void setTimeout(attempt, retryMs);
        if (err.code === 'EADDRINUSE') err.message = `Port ${port} is already in use. Is Goldcom Studio already running? Close it, or set another PORT.`;
        reject(err);
      };
      const onListening = () => {
        server.off('error', onError);
        try { onReady?.(); } finally { resolve(server); }
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, host);
    };
    attempt();
  });
}

/** Check ~10 s after startup, then every intervalMs. `branch` may be a function (current setting). Never throws. */
export function startAutoCheck({ intervalMs = 6 * 3600e3, onResult, branch, delayMs = 10e3 } = {}) {
  const tick = async () => {
    try {
      const r = await checkForUpdate({ branch: typeof branch === 'function' ? branch() : branch });
      await onResult?.(r);
    } catch { /* never throws */ }
  };
  const first = setTimeout(tick, delayMs);
  const timer = setInterval(tick, intervalMs);
  first.unref?.();
  timer.unref?.();
  return { check: tick, stop: () => { clearTimeout(first); clearInterval(timer); } };
}
