// Android Debug Bridge driver: find/install adb, list devices, screenshots, screen recording, input,
// UI hierarchy dumps, clean "demo mode" status bar, and raw touch logging for manual takes.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { unzipSync } from 'fflate';
import { DATA_DIR } from '../store.mjs';

export const TOOLS_DIR = path.join(DATA_DIR, 'tools');
const exe = process.platform === 'win32' ? 'adb.exe' : 'adb';

export function findAdb() {
  const cands = [
    process.env.ADB_PATH,
    path.join(TOOLS_DIR, 'platform-tools', exe),
    process.env.ANDROID_HOME && path.join(process.env.ANDROID_HOME, 'platform-tools', exe),
    process.env.ANDROID_SDK_ROOT && path.join(process.env.ANDROID_SDK_ROOT, 'platform-tools', exe),
    process.platform === 'win32' ? path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk', 'platform-tools', exe) : null,
    process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Android', 'sdk', 'platform-tools', exe) : null,
    path.join(os.homedir(), 'Android', 'Sdk', 'platform-tools', exe),
  ].filter(Boolean);
  for (const c of cands) if (fs.existsSync(c)) return c;
  try { return execFileSync(process.platform === 'win32' ? 'where' : 'which', ['adb'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).split(/\r?\n/)[0].trim() || null; } catch { return null; }
}

/** Download Google's Android platform-tools into the studio's data folder (one time). */
export async function installPlatformTools(onProgress = () => {}) {
  const plat = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux';
  const url = `https://dl.google.com/android/repository/platform-tools-latest-${plat}.zip`;
  onProgress({ message: 'Downloading Android platform tools from Google…', pct: 0.05 });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const buf = new Uint8Array(await res.arrayBuffer());
  onProgress({ message: 'Unpacking…', pct: 0.7 });
  const files = unzipSync(buf);
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith('/')) continue;
    const out = path.join(TOOLS_DIR, name);
    if (!out.startsWith(TOOLS_DIR)) continue;
    await fsp.mkdir(path.dirname(out), { recursive: true });
    await fsp.writeFile(out, data);
    if (process.platform !== 'win32' && !name.includes('.')) await fsp.chmod(out, 0o755);
  }
  const adb = path.join(TOOLS_DIR, 'platform-tools', exe);
  if (process.platform !== 'win32') await fsp.chmod(adb, 0o755).catch(() => {});
  onProgress({ message: 'Android tools ready', pct: 1 });
  return adb;
}

function adbPath() {
  const p = findAdb();
  if (!p) throw Object.assign(new Error('Android tools (adb) are not installed. Open Footage → Phone and press "Install Android tools".'), { status: 412, code: 'NO_ADB' });
  return p;
}

/** Run adb and return stdout as a Buffer. */
export function adb(args, { serial, timeout = 30000, input } = {}) {
  const full = serial ? ['-s', serial, ...args] : args;
  return new Promise((resolve, reject) => {
    const child = spawn(adbPath(), full, { windowsHide: true });
    const out = [];
    let err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`adb ${args[0]} timed out`)); }, timeout);
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`adb ${args.join(' ').slice(0, 80)} failed: ${(err || Buffer.concat(out).toString()).trim().slice(0, 300)}`));
    });
    if (input) child.stdin.end(input); else child.stdin.end();
  });
}
const sh = async (serial, cmd, opts) => (await adb(['shell', cmd], { serial, ...opts })).toString('utf8');

export async function devices() {
  const out = (await adb(['devices', '-l'], { timeout: 8000 })).toString('utf8');
  return out.split(/\r?\n/).slice(1).map((l) => l.trim()).filter(Boolean).map((l) => {
    const [serial, state, ...rest] = l.split(/\s+/);
    const kv = Object.fromEntries(rest.map((x) => x.split(':')).filter((x) => x.length === 2));
    return { serial, state, model: (kv.model || '').replace(/_/g, ' '), product: kv.product || '', device: kv.device || '', usb: kv.usb || null };
  });
}

/**
 * The phone to film with: the preferred serial when it is online, otherwise the studio's emulator, otherwise the
 * first connected device (USB phone or cloud phone connected over the network).
 */
export async function pickDevice(preferred) {
  const ready = (await devices()).filter((d) => d.state === 'device');
  return ready.find((d) => d.serial === preferred) || ready.find((d) => d.serial === 'emulator-5584') || ready[0] || null;
}

export async function deviceInfo(serial) {
  const size = await sh(serial, 'wm size');
  const m = size.match(/Override size:\s*(\d+)x(\d+)/) || size.match(/Physical size:\s*(\d+)x(\d+)/);
  const dens = (await sh(serial, 'wm density')).match(/(\d+)\s*$/m);
  const props = await sh(serial, 'getprop ro.product.model; getprop ro.build.version.release; getprop ro.product.manufacturer');
  const [model, android, maker] = props.split(/\r?\n/).map((s) => s.trim());
  return { serial, width: m ? Number(m[1]) : 1080, height: m ? Number(m[2]) : 2400, density: dens ? Number(dens[1]) : 420, model, android, maker };
}

// A complete PNG starts with the signature and ends with the IEND chunk; a phone that is busy (or a flaky USB link)
// can return a cut-off image, so it is retried.
const pngComplete = (b) => b.length > 64 && b.readUInt32BE(0) === 0x89504e47 && b.subarray(b.length - 12).includes(Buffer.from('IEND'));
export async function screencap(serial) {
  let last;
  for (let i = 0; i < 3; i++) {
    last = await adb(['exec-out', 'screencap', '-p'], { serial, timeout: 15000 });
    if (pngComplete(last)) return last;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`The phone returned an incomplete screenshot (${last.length} bytes). Unlock the phone and keep the screen on.`);
}
export const tap = (serial, x, y) => sh(serial, `input tap ${Math.round(x)} ${Math.round(y)}`);
export const swipe = (serial, x1, y1, x2, y2, ms = 450) => sh(serial, `input swipe ${Math.round(x1)} ${Math.round(y1)} ${Math.round(x2)} ${Math.round(y2)} ${Math.round(ms)}`);
export const keyevent = (serial, code) => sh(serial, `input keyevent ${code}`);
export const KEY = { back: 4, home: 3, enter: 66, del: 67 };
/** `input text` only types ASCII; spaces are sent as %s. */
export async function typeText(serial, text) {
  const clean = String(text).replace(/[^\x20-\x7E]/g, '');
  if (!clean) throw new Error('Only Latin letters and digits can be typed on the phone');
  return sh(serial, `input text '${clean.replace(/'/g, '').replace(/ /g, '%s')}'`);
}

export async function listPackages(serial, filter = '') {
  const out = await sh(serial, `pm list packages ${filter ? `| grep -i ${filter.replace(/[^\w.]/g, '')}` : ''}`).catch(() => '');
  return out.split(/\r?\n/).map((l) => l.replace(/^package:/, '').trim()).filter(Boolean);
}

/** Best guess for the Goldcom app's package name on the phone. */
export async function findGoldcomPackage(serial) {
  const pk = await listPackages(serial, 'gold');
  return pk.find((p) => /goldcom/i.test(p)) || pk.find((p) => /gold/i.test(p) && !/google/i.test(p)) || null;
}

export async function launchApp(serial, pkg, { fresh = true } = {}) {
  if (fresh) await sh(serial, `am force-stop ${pkg}`).catch(() => {});
  await sh(serial, `monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`);
}

/** Clean status bar for recordings: 09:41, full battery, full signal, no notification icons. */
export async function demoMode(serial, on) {
  const b = (args) => sh(serial, `am broadcast -a com.android.systemui.demo ${args}`).catch(() => {});
  if (!on) { await b('-e command exit'); return; }
  await sh(serial, 'settings put global sysui_demo_allowed 1').catch(() => {});
  await b('-e command enter');
  await b('-e command clock -e hhmm 0941');
  await b('-e command battery -e level 100 -e plugged false');
  await b('-e command network -e wifi show -e level 4 -e fully true');
  await b('-e command network -e mobile show -e datatype none -e level 4');
  await b('-e command notifications -e visible false');
}

// ---------- UI hierarchy ----------
const attr = (s, k) => { const m = s.match(new RegExp(`\\s${k}="([^"]*)"`)); return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#10;/g, ' ') : ''; };

/** Parse a uiautomator XML dump into a flat list of meaningful elements. */
export function parseUiDump(xml) {
  const out = [];
  for (const m of xml.matchAll(/<node\b([^>]*?)\/?>/g)) {
    const a = m[1];
    const b = attr(a, 'bounds').match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
    if (!b) continue;
    const [x1, y1, x2, y2] = b.slice(1).map(Number);
    if (x2 - x1 < 4 || y2 - y1 < 4) continue;
    const el = {
      text: attr(a, 'text'), desc: attr(a, 'content-desc'), id: attr(a, 'resource-id').replace(/^.*:id\//, ''), cls: attr(a, 'class').replace(/^.*\./, ''),
      clickable: attr(a, 'clickable') === 'true', scrollable: attr(a, 'scrollable') === 'true', checked: attr(a, 'checked') === 'true', enabled: attr(a, 'enabled') !== 'false', focused: attr(a, 'focused') === 'true',
      editable: /EditText/.test(attr(a, 'class')), bounds: [x1, y1, x2, y2],
    };
    if (el.text || el.desc || el.clickable || el.scrollable || el.editable) out.push(el);
  }
  return out;
}

export async function uiDump(serial) {
  // Dumping to a file and reading it back is the most compatible way across Android versions.
  const out = await sh(serial, 'uiautomator dump /sdcard/goldcom-ui.xml >/dev/null 2>&1; cat /sdcard/goldcom-ui.xml', { timeout: 20000 }).catch(() => '');
  return parseUiDump(out);
}

// ---------- screen recording ----------
/**
 * Start a device-side recording. Returns a handle: { startedAt (host ms when frames started), stop() → local mp4 path }.
 * Android caps a single screenrecord at 3 minutes.
 */
export async function startRecording(serial, { bitRate = 16e6, maxSec = 180 } = {}) {
  const remote = '/sdcard/goldcom-take.mp4';
  await sh(serial, `rm -f ${remote}`).catch(() => {});
  const spawnedAt = Date.now();
  const child = spawn(adbPath(), ['-s', serial, 'shell', `screenrecord --verbose --bit-rate ${Math.round(bitRate)} --time-limit ${maxSec} ${remote}`], { windowsHide: true });
  let firstOutput = null;
  child.stdout.on('data', (d) => { if (!firstOutput && /encoder|recording|content area|configuring/i.test(String(d))) firstOutput = Date.now(); });
  await new Promise((r) => setTimeout(r, 900));
  const handle = {
    child,
    get startedAt() { return firstOutput || spawnedAt + 450; },
    async stop(localFile) {
      await sh(serial, 'pkill -2 screenrecord || kill -2 $(pidof screenrecord)').catch(() => {});
      await new Promise((r) => { const t = setTimeout(r, 4000); child.on('close', () => { clearTimeout(t); r(); }); });
      if (child.exitCode === null) child.kill();
      await new Promise((r) => setTimeout(r, 700));
      await adb(['pull', remote, localFile], { serial, timeout: 120000 });
      await sh(serial, `rm -f ${remote}`).catch(() => {});
      return localFile;
    },
  };
  return handle;
}

/**
 * Log real finger taps while the person operates the phone (manual takes). Returns { stop() → [{ t, x, y }] }
 * with t in host ms and x, y normalised to the screen.
 */
export async function startTouchLog(serial, screen) {
  let maxX = screen.width - 1, maxY = screen.height - 1;
  try {
    const caps = await sh(serial, 'getevent -lp', { timeout: 8000 });
    const mx = caps.match(/ABS_MT_POSITION_X\s*:.*?max\s+(\d+)/); const my = caps.match(/ABS_MT_POSITION_Y\s*:.*?max\s+(\d+)/);
    if (mx) maxX = Number(mx[1]); if (my) maxY = Number(my[1]);
  } catch { /* use screen size */ }
  const child = spawn(adbPath(), ['-s', serial, 'shell', 'getevent -lt'], { windowsHide: true });
  const taps = [];
  let cur = null, x = null, y = null, buf = '';
  child.stdout.on('data', (d) => {
    buf += d.toString();
    const lines = buf.split(/\r?\n/); buf = lines.pop();
    for (const line of lines) {
      let m;
      if ((m = line.match(/ABS_MT_POSITION_X\s+([0-9a-f]+)/))) x = parseInt(m[1], 16);
      else if ((m = line.match(/ABS_MT_POSITION_Y\s+([0-9a-f]+)/))) y = parseInt(m[1], 16);
      else if (/BTN_TOUCH\s+DOWN/.test(line)) cur = { t: Date.now(), x: null, y: null };
      else if (/BTN_TOUCH\s+UP/.test(line) && cur) {
        if (x !== null && y !== null) taps.push({ t: cur.t, x: x / maxX, y: y / maxY, up: Date.now() });
        cur = null;
      }
      if (cur && cur.x === null && x !== null && y !== null) { cur.x = x; cur.y = y; }
    }
  });
  return { stop() { child.kill('SIGKILL'); return taps.map((tp) => ({ t: tp.t, x: Math.min(1, Math.max(0, tp.x)), y: Math.min(1, Math.max(0, tp.y)), hold: (tp.up - tp.t) / 1000 })); } };
}
