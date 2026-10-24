// Desktop-shortcut helpers. Node built-ins only: this runs before `npm install`.
//   node scripts/launcher.mjs prepare [--restart]  install components / build the editor when needed
//                                                  (exit 3: the studio is already running, browser opened)
//   node scripts/launcher.mjs open                 wait for /api/health, then open the browser
//   node scripts/launcher.mjs update               apply the latest update from GitHub (used by the installers)
//   node scripts/launcher.mjs shortcut             add a Desktop (Windows, macOS) / app-menu (Linux) shortcut
//   node scripts/launcher.mjs icon <file.ico>      write the app icon as a Windows .ico
// The restart loop (exit code 75 = restart after an update) lives in the shell launchers at the repo root.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const STUDIO = path.resolve(here, '..');
export const ROOT = path.resolve(STUDIO, '..');
const STAMP = path.join(STUDIO, 'node_modules', '.goldcom-installed');
const PORT = Number(process.env.PORT || 5177);
const STUDIO_URL = `http://localhost:${PORT}`;
const isWin = process.platform === 'win32';
const say = (msg = '') => console.log(msg && `  ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- install stamp: node_modules/.goldcom-installed holds the hash of package.json + package-lock.json ----------
export function depsHash() {
  const h = crypto.createHash('sha256');
  for (const f of ['package.json', 'package-lock.json']) {
    const p = path.join(STUDIO, f);
    h.update(`${f}\0`).update(fs.existsSync(p) ? fs.readFileSync(p) : '');
  }
  return h.digest('hex');
}
const readStamp = () => { try { return fs.readFileSync(STAMP, 'utf8').trim(); } catch { return null; } };
export const installNeeded = () => !fs.existsSync(path.join(STUDIO, 'node_modules')) || readStamp() !== depsHash();
export const writeStamp = () => fs.writeFileSync(STAMP, `${depsHash()}\n`);

// ---------- processes ----------
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

/** Run a command. Resolves { stdout, stderr } on exit 0, rejects with { code, stdout, stderr } otherwise. */
export function run(cmd, args, { cwd = STUDIO, env, onLine, shell = false, timeoutMs = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: env ? { ...process.env, ...env } : process.env, shell, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const out = { stdout: '', stderr: '' };
    let done = false;
    let timedOut = false;
    const timer = timeoutMs ? setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs) : null;
    const emit = (l) => { const s = l.replace(ANSI, '').trimEnd(); if (s.trim()) try { onLine(s); } catch { /* progress only */ } };
    for (const key of ['stdout', 'stderr']) {
      let partial = '';
      child[key].setEncoding('utf8');
      child[key].on('data', (s) => {
        out[key] = key === 'stderr' ? (out.stderr + s).slice(-64e3) : out.stdout + s;
        if (!onLine) return;
        const lines = (partial + s).split(/\r\n|\r|\n/);
        partial = lines.pop();
        lines.forEach(emit);
      });
      child[key].on('end', () => { if (onLine && partial) emit(partial); });
    }
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (err) reject(Object.assign(err, out, { timedOut }));
      else resolve(out);
    };
    child.on('error', finish);
    child.on('close', (code, signal) => {
      if (code === 0) return finish();
      const why = timedOut ? 'timed out' : signal ? `was stopped (${signal})` : `exited with code ${code}`;
      finish(Object.assign(new Error(`${path.basename(cmd)} ${args[0] || ''} ${why}`), { code }));
    });
  });
}

export const npmInstall = (opts = {}) => run(isWin ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund'], {
  cwd: STUDIO, shell: isWin, timeoutMs: 30 * 60e3, ...opts, env: { npm_config_update_notifier: 'false', ...opts.env },
});
export const viteBuild = (opts = {}) => run(process.execPath, [path.join(STUDIO, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], { cwd: STUDIO, timeoutMs: 10 * 60e3, ...opts });

// ---------- studio + browser ----------
/** Resolves the /api/health payload when a Goldcom Studio answers on the port, else null. */
export function health(port = PORT, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { const j = JSON.parse(body); resolve(j?.name === 'goldcom-studio' ? j : null); } catch { resolve(null); } });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

export function openBrowser(url = STUDIO_URL) {
  if (process.env.GOLDCOM_NO_BROWSER === '1') return;
  const [cmd, args] = isWin ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  const manual = () => say(`Open ${url} in your browser.`);
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: isWin });
    child.on('error', manual);
    child.unref();
  } catch { manual(); }
}

// ---------- commands ----------
async function prepare({ restart = false } = {}) {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) {
    say(`Goldcom Studio needs Node.js 20 or newer (this computer has ${process.version}).`);
    say('Install the LTS version from https://nodejs.org, then start Goldcom Studio again.');
    return 1;
  }
  if (!restart && (await health())) {
    say(`Goldcom Studio is already running: ${STUDIO_URL}`);
    openBrowser();
    return 3;
  }
  if (installNeeded()) {
    const first = !fs.existsSync(path.join(STUDIO, 'node_modules'));
    say(first ? 'Installing Goldcom Studio components. The first start can take a few minutes...' : 'Updating Goldcom Studio components...');
    try {
      await npmInstall({ onLine: say });
      writeStamp();
    } catch (err) {
      say();
      say(err.code === 'ENOENT' ? 'npm was not found. Reinstall Node.js from https://nodejs.org.' : 'Could not install the components. Check your internet connection, then start Goldcom Studio again.');
      return 1;
    }
  }
  if (!fs.existsSync(path.join(STUDIO, 'dist', 'index.html'))) {
    say('Building the editor...');
    try { await viteBuild({ onLine: say }); } catch {
      say();
      say('Could not build the editor (see the messages above).');
      return 1;
    }
  }
  await ensureBrowser();
  return 0;
}

/** The headless Chromium used for video export and AI previews (downloaded once, ~150 MB). */
async function ensureBrowser() {
  const cli = path.join(STUDIO, 'node_modules', 'playwright', 'cli.js');
  if (!fs.existsSync(cli)) return;
  const marker = path.join(STUDIO, 'node_modules', '.goldcom-browser');
  let version = '';
  try { version = JSON.parse(fs.readFileSync(path.join(STUDIO, 'node_modules', 'playwright', 'package.json'), 'utf8')).version; } catch { /* ignore */ }
  if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8').trim() === version) return;
  say('Downloading the video renderer (one time, about 150 MB)...');
  try {
    await run(process.execPath, [cli, 'install', 'chromium'], { cwd: STUDIO, timeoutMs: 30 * 60e3, onLine: (l) => { if (!/%|\|/.test(l)) say(l); } });
    fs.writeFileSync(marker, version);
  } catch {
    say('Could not download the video renderer now. The studio still opens; video export will retry next start.');
  }
}

async function open() {
  for (const until = Date.now() + 120e3; Date.now() < until; await sleep(500)) {
    if (await health()) { openBrowser(); return 0; }
  }
  return 1;
}

async function update() {
  const { applyUpdate } = await import('../server/updater.mjs');
  let last = null;
  const r = await applyUpdate({
    onProgress: ({ step, message }) => {
      if (message && (step !== last || !['install', 'build', 'rollback'].includes(step))) say(message); // headlines, not npm/vite output
      last = step;
    },
  });
  if (!r.ok) say(`Update failed: ${r.error}${r.detail ? ` (${r.detail})` : ''}`);
  return r.ok ? 0 : 1;
}

const shQuote = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
const desktopQuote = (s) => `"${s.replace(/[\\"`$]/g, '\\$&').replace(/%/g, '%%')}"`;

async function shortcut() {
  if (isWin) {
    const icon = path.join(process.env.LOCALAPPDATA || os.homedir(), 'Goldcom Studio', 'goldcom-studio.ico');
    try { fs.mkdirSync(path.dirname(icon), { recursive: true }); fs.writeFileSync(icon, makeIco()); } catch { /* the shortcut works without it */ }
    const ps = [
      "$desktop = [Environment]::GetFolderPath('Desktop')",
      "$s = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop 'Goldcom Studio.lnk'))",
      '$s.TargetPath = $env:GS_TARGET',
      '$s.WorkingDirectory = $env:GS_DIR',
      "if (Test-Path -LiteralPath $env:GS_ICON) { $s.IconLocation = $env:GS_ICON + ',0' }",
      "$s.Description = 'Start Goldcom Studio'",
      '$s.Save()',
      'Write-Output $desktop',
    ].join('\n');
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], {
      env: { GS_TARGET: path.join(ROOT, 'Goldcom Studio.cmd'), GS_DIR: ROOT, GS_ICON: icon }, timeoutMs: 60e3,
    });
    say(`Shortcut added: ${path.join(stdout.trim(), 'Goldcom Studio.lnk')}`);
    return 0;
  }
  if (process.platform === 'darwin') {
    const desktop = path.join(os.homedir(), 'Desktop');
    const file = path.join(desktop, 'Goldcom Studio.command');
    fs.mkdirSync(desktop, { recursive: true });
    fs.writeFileSync(file, `#!/bin/bash\n# Starts Goldcom Studio installed in ${ROOT}\nexec bash ${shQuote(path.join(ROOT, 'Goldcom Studio.command'))}\n`);
    fs.chmodSync(file, 0o755);
    say(`Shortcut added: ${file}`);
    return 0;
  }
  const icon = [path.join(ROOT, 'brand', 'logo', 'goldcom-app-icon.svg'), path.join(STUDIO, 'public', 'favicon.svg')].find((f) => fs.existsSync(f));
  const entry = [
    '[Desktop Entry]', 'Type=Application', 'Name=Goldcom Studio', 'Comment=Start Goldcom Studio',
    `Exec=bash ${desktopQuote(path.join(ROOT, 'goldcom-studio.sh'))}`, ...(icon ? [`Icon=${icon}`] : []), 'Terminal=true', 'Categories=Graphics;', '',
  ].join('\n');
  const apps = path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'applications');
  const targets = [path.join(apps, 'goldcom-studio.desktop')];
  if (fs.existsSync(path.join(os.homedir(), 'Desktop'))) targets.push(path.join(os.homedir(), 'Desktop', 'goldcom-studio.desktop'));
  for (const file of targets) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, entry);
    fs.chmodSync(file, 0o755);
    say(`Shortcut added: ${file}`);
  }
  return 0;
}

// ---------- app icon (brand/logo/goldcom-app-icon.svg) as 32-bit BMP .ico entries ----------
const ICON_BG = [0x14, 0x14, 0x16];
const ICON_SHAPES = [
  [[0xcd, 0x86, 0x4b], [[0, 213.5], [213.5, 0], [427, 213.5], [335, 213.5], [213.5, 92], [92, 213.5]]],
  [[0xdb, 0xa7, 0x61], [[0, 213.5], [92, 213.5], [213.5, 335], [249.5, 299], [167.5, 217], [213.5, 171], [341, 298.5], [213.5, 426]]],
  [[0xdb, 0xa7, 0x61], [[213.5, 426], [270.5, 483], [213.5, 540], [156.5, 483]]],
];
function inPoly(x, y, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function iconBmp(size) {
  const ss = 4;
  const k = 1024 / size / ss;
  const r = 180; // corner radius on the 1024 canvas
  const maskRow = Math.ceil(size / 32) * 4;
  const px = 40;
  const mask = px + size * size * 4;
  const buf = Buffer.alloc(mask + maskRow * size);
  buf.writeUInt32LE(40, 0);
  buf.writeInt32LE(size, 4);
  buf.writeInt32LE(size * 2, 8); // colour + mask
  buf.writeUInt16LE(1, 12);
  buf.writeUInt16LE(32, 14);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let n = 0, cr = 0, cg = 0, cb = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = (x * ss + sx + 0.5) * k;
          const v = (y * ss + sy + 0.5) * k;
          const dx = Math.max(r - u, 0, u - 1024 + r);
          const dy = Math.max(r - v, 0, v - 1024 + r);
          if (dx * dx + dy * dy > r * r) continue;
          const hit = ICON_SHAPES.find(([, pts]) => inPoly((u - 258.96) / 1.185185, (v - 192) / 1.185185, pts));
          const [R, G, B] = hit ? hit[0] : ICON_BG;
          n++; cr += R; cg += G; cb += B;
        }
      }
      const row = size - 1 - y; // BMP rows run bottom-up
      if (!n) { buf[mask + row * maskRow + (x >> 3)] |= 0x80 >> (x & 7); continue; }
      const o = px + (row * size + x) * 4;
      buf[o] = Math.round(cb / n);
      buf[o + 1] = Math.round(cg / n);
      buf[o + 2] = Math.round(cr / n);
      buf[o + 3] = Math.round((n / (ss * ss)) * 255);
    }
  }
  return buf;
}
export function makeIco(sizes = [256, 48, 32, 16]) {
  const imgs = sizes.map(iconBmp);
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    head[e] = head[e + 1] = s >= 256 ? 0 : s; // 0 means 256
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(imgs[i].length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += imgs[i].length;
  });
  return Buffer.concat([head, ...imgs]);
}

// ---------- CLI ----------
if (path.basename(process.argv[1] || '').toLowerCase() === 'launcher.mjs') {
  const [cmd, ...rest] = process.argv.slice(2);
  const commands = {
    prepare: () => prepare({ restart: rest.includes('--restart') }),
    open,
    update,
    shortcut,
    icon: async () => { fs.writeFileSync(path.resolve(rest[0] || 'goldcom-studio.ico'), makeIco()); return 0; },
  };
  if (!commands[cmd]) {
    console.log('Usage: node scripts/launcher.mjs prepare [--restart] | open | update | shortcut | icon <file.ico>');
    process.exit(2);
  }
  commands[cmd]().then((code) => process.exit(code ?? 0), (err) => { say(err.message); process.exit(1); });
}
