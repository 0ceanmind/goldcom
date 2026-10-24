// Android phone emulator on this computer. Downloads Google's official Android Emulator and a Google Play system
// image straight from Google (no Android Studio, no Java), creates a phone, starts it, and hands it to the capture
// agent as an ordinary adb device. The user signs in to Google Play and to Goldcom once; the phone keeps its data
// (and a quick-boot snapshot) between runs.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import * as A from './adb.mjs';

const REPO = 'https://dl.google.com/android/repository/';
const SYSIMG_REPO = `${REPO}sys-img/google_apis_playstore/`;
export const SDK = A.TOOLS_DIR; // platform-tools/, emulator/ and system-images/ side by side, like an Android SDK
const AVD_HOME = path.join(SDK, 'avd');
const EMU_HOME = path.join(SDK, 'emulator-home');
const DOWNLOADS = path.join(SDK, 'downloads');
const STATE = path.join(SDK, 'emulator.json');
export const AVD_NAME = 'Goldcom';
export const PORT = 5584; // console port; adb sees it as emulator-5584
export const SERIAL = `emulator-${PORT}`;
export const GOLDCOM_PACKAGE = 'om.goldcom.app';
const API_LEVELS = ['35', '34', '36']; // preferred Android versions (15, 14, 16)
const NEED_FREE_GB = 12;

const exeName = (n) => (process.platform === 'win32' ? `${n}.exe` : n);
const emulatorBin = () => path.join(SDK, 'emulator', exeName('emulator'));

/** What this computer needs: Google's host names, the image ABI, and whether it can run at all. */
export function host() {
  const osName = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macosx' : process.platform === 'linux' ? 'linux' : null;
  const arm = process.arch === 'arm64';
  const archName = arm ? 'aarch64' : 'x64';
  const abi = arm ? 'arm64-v8a' : 'x86_64';
  let unsupported = null;
  if (!osName) unsupported = `The Android emulator does not run on ${process.platform}.`;
  else if (arm && osName !== 'macosx') unsupported = 'The Android emulator needs an Intel or AMD processor on Windows and Linux (ARM PCs are not supported by Google).';
  return { os: osName, arch: archName, abi, unsupported };
}

const readState = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; } };
const writeState = (patch) => { const s = { ...readState(), ...patch }; fs.mkdirSync(SDK, { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(s, null, 2)); return s; };

// ---------- Google's package manifests ----------
async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not reach Google's download server (${r.status} for ${url})`);
  return r.text();
}

function packages(xml) {
  const out = [];
  for (const m of xml.matchAll(/<remotePackage path="([^"]+)">([\s\S]*?)<\/remotePackage>/g)) {
    const [, pkgPath, body] = m;
    const channel = (body.match(/<channelRef ref="([^"]+)"/) || [])[1] || 'channel-0';
    const rev = ['major', 'minor', 'micro'].map((k) => Number((body.match(new RegExp(`<revision>[\\s\\S]*?<${k}>(\\d+)</${k}>`)) || [])[1] || 0));
    const license = (body.match(/<uses-license ref="([^"]+)"/) || [])[1] || null;
    const archives = [...body.matchAll(/<archive>([\s\S]*?)<\/archive>/g)].map(([, a]) => ({
      url: (a.match(/<url>([^<]+)<\/url>/) || [])[1],
      size: Number((a.match(/<size>(\d+)<\/size>/) || [])[1] || 0),
      sha1: (a.match(/<checksum type="sha1">([0-9a-f]+)<\/checksum>/) || [])[1] || null,
      os: (a.match(/<host-os>([^<]+)<\/host-os>/) || [])[1] || null,
      arch: (a.match(/<host-arch>([^<]+)<\/host-arch>/) || [])[1] || null,
    })).filter((a) => a.url && !/<patch>/.test(a.url));
    out.push({ path: pkgPath, channel, rev, version: rev.join('.'), license, archives });
  }
  return out;
}

const archiveFor = (pkg, h) => pkg.archives.find((a) => (!a.os || a.os === h.os) && (!a.arch || a.arch === h.arch));

/** The stable emulator build and the Google Play system image for this computer. */
export async function plan() {
  const h = host();
  if (h.unsupported) throw new Error(h.unsupported);
  const [repo, imgs] = await Promise.all([fetchText(`${REPO}repository2-3.xml`), fetchText(`${SYSIMG_REPO}sys-img2-3.xml`)]);
  const emu = packages(repo).filter((p) => p.path === 'emulator' && p.channel === 'channel-0' && archiveFor(p, h))
    .sort((a, b) => b.rev[0] - a.rev[0] || b.rev[1] - a.rev[1] || b.rev[2] - a.rev[2])[0];
  if (!emu) throw new Error('No Android Emulator build is published for this computer.');
  const all = packages(imgs);
  let image = null;
  for (const api of API_LEVELS) {
    image = all.find((p) => p.path === `system-images;android-${api};google_apis_playstore;${h.abi}` && p.channel === 'channel-0' && archiveFor(p, h));
    if (image) { image.api = api; break; }
  }
  if (!image) throw new Error('No Google Play system image is published for this computer.');
  return { host: h, emulator: { ...emu, archive: archiveFor(emu, h), base: REPO }, image: { ...image, archive: archiveFor(image, h), base: SYSIMG_REPO } };
}

// ---------- download (resumable, verified) and unpack ----------
async function download(url, dest, { size, sha1, onBytes, signal }) {
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest) && (!size || fs.statSync(dest).size === size)) return dest;
  const part = `${dest}.part`;
  let hash = crypto.createHash('sha1');
  let have = 0;
  if (fs.existsSync(part)) {
    // Resume: re-hash what is already on disk, then ask Google for the rest.
    for await (const chunk of fs.createReadStream(part)) { hash.update(chunk); have += chunk.length; }
  }
  const res = await fetch(url, { headers: have ? { Range: `bytes=${have}-` } : {}, signal });
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${path.basename(dest)}`);
  if (have && res.status !== 206) { hash = crypto.createHash('sha1'); have = 0; } // server sent the whole file again
  onBytes(have);
  const out = fs.createWriteStream(part, { flags: have ? 'a' : 'w' });
  try {
    for await (const chunk of res.body) {
      hash.update(chunk);
      have += chunk.length;
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
      onBytes(have);
    }
  } finally {
    await new Promise((r) => out.end(r));
  }
  if (size && have !== size) throw new Error(`Download of ${path.basename(dest)} was incomplete (${have} of ${size} bytes). Try again: it resumes where it stopped.`);
  if (sha1 && hash.digest('hex') !== sha1) { await fsp.rm(part, { force: true }); throw new Error(`Download of ${path.basename(dest)} was corrupted. Try again.`); }
  await fsp.rename(part, dest);
  return dest;
}

const has = (cmd, args = ['--help']) => { try { return spawnSync(cmd, args, { stdio: 'ignore', timeout: 5000 }).error == null; } catch { return false; } };

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} failed (${code}): ${err.slice(-300)}`))));
  });
}

/** Unzip with the system's own tools (they handle multi-GB ZIP64 archives and file permissions). */
async function unzip(zip, dest) {
  await fsp.mkdir(dest, { recursive: true });
  if (process.platform === 'win32') {
    const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    if (fs.existsSync(tar)) return run(tar, ['-xf', zip, '-C', dest]);
    return run('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force`]);
  }
  if (has('unzip', ['-v'])) return run('unzip', ['-q', '-o', zip, '-d', dest]);
  if (has('bsdtar', ['--version'])) return run('bsdtar', ['-xf', zip, '-C', dest]);
  if (has('python3', ['--version'])) { await run('python3', ['-m', 'zipfile', '-e', zip, dest]); return fixModes(dest); }
  throw new Error('Unpacking needs "unzip". Install it (e.g. sudo apt install unzip) and try again.');
}

// python's zipfile drops the executable bit; restore it for the emulator's programs.
async function fixModes(dir) {
  for (const e of await fsp.readdir(dir, { withFileTypes: true, recursive: true })) {
    if (!e.isFile()) continue;
    const full = path.join(e.parentPath || e.path, e.name);
    if (!e.name.includes('.') || /qemu-system|crashpad|netsimd/.test(e.name)) await fsp.chmod(full, 0o755).catch(() => {});
  }
}

const imageDir = (api, abi) => path.join(SDK, 'system-images', `android-${api}`, 'google_apis_playstore', abi);

/** Write the phone definition (what Android Studio's device manager would create). */
async function createAvd({ api, abi }) {
  const dir = path.join(AVD_HOME, `${AVD_NAME}.avd`);
  await fsp.mkdir(dir, { recursive: true });
  const cores = Math.max(2, Math.min(4, os.cpus().length - 2));
  const ram = os.totalmem() >= 15e9 ? 4096 : os.totalmem() >= 7.5e9 ? 3072 : 2048;
  const config = {
    AvdId: AVD_NAME,
    'avd.ini.displayname': 'Goldcom Phone',
    'avd.ini.encoding': 'UTF-8',
    'PlayStore.enabled': 'true',
    'abi.type': abi,
    'hw.cpu.arch': abi === 'x86_64' ? 'x86_64' : 'arm64',
    'hw.cpu.ncore': cores,
    'hw.ramSize': ram,
    'vm.heapSize': 256,
    'disk.dataPartition.size': '8G',
    'hw.lcd.width': 1080,
    'hw.lcd.height': 2400,
    'hw.lcd.density': 420,
    'hw.initialOrientation': 'portrait',
    'hw.device.manufacturer': 'Google',
    'hw.device.name': 'pixel_7',
    'hw.keyboard': 'yes',
    'hw.mainKeys': 'no',
    'hw.dPad': 'no',
    'hw.trackBall': 'no',
    'hw.gpu.enabled': 'yes',
    'hw.gpu.mode': 'auto',
    'hw.sdCard': 'no',
    'hw.camera.back': 'none',
    'hw.camera.front': 'none',
    'hw.audioInput': 'no',
    'hw.battery': 'yes',
    'hw.accelerometer': 'yes',
    'hw.sensors.orientation': 'yes',
    'hw.sensors.proximity': 'yes',
    'hw.gps': 'yes',
    'fastboot.forceColdBoot': 'no',
    'fastboot.forceFastBoot': 'yes',
    'image.sysdir.1': `system-images/android-${api}/google_apis_playstore/${abi}/`,
    'runtime.network.latency': 'none',
    'runtime.network.speed': 'full',
    'showDeviceFrame': 'no',
    'skin.dynamic': 'yes',
    'skin.name': '1080x2400',
    'skin.path': '_no_skin',
    'tag.display': 'Google Play',
    'tag.id': 'google_apis_playstore',
  };
  await fsp.writeFile(path.join(dir, 'config.ini'), Object.entries(config).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  await fsp.writeFile(path.join(AVD_HOME, `${AVD_NAME}.ini`), `avd.ini.encoding=UTF-8\npath=${dir}\npath.rel=avd/${AVD_NAME}.avd\ntarget=android-${api}\n`);
}

function freeGb(dir) {
  try { const s = fs.statfsSync(dir); return (s.bavail * s.bsize) / 1e9; } catch { return null; }
}

/**
 * Download and set up everything (one time, about 2.3 GB). onProgress({ message, pct }).
 * Downloads resume after an interruption; finished parts are not downloaded again.
 */
export async function install({ onProgress = () => {}, signal } = {}) {
  await fsp.mkdir(SDK, { recursive: true });
  const free = freeGb(SDK);
  if (free !== null && free < NEED_FREE_GB) throw new Error(`The phone emulator needs about ${NEED_FREE_GB} GB of free disk space; this drive has ${free.toFixed(1)} GB.`);
  onProgress({ message: 'Checking Google’s latest Android Emulator…', pct: 0.01 });
  if (!A.findAdb()) await A.installPlatformTools(() => {});
  const p = await plan();
  const parts = [
    { name: 'Android Emulator', pkg: p.emulator, dest: path.join(DOWNLOADS, p.emulator.archive.url), into: SDK, done: () => fs.existsSync(emulatorBin()) && readState().emulatorVersion === p.emulator.version },
    { name: `Android ${{ 34: '14', 35: '15', 36: '16' }[p.image.api] || p.image.api} with Google Play`, pkg: p.image, dest: path.join(DOWNLOADS, p.image.archive.url), into: path.dirname(imageDir(p.image.api, p.host.abi)), done: () => fs.existsSync(path.join(imageDir(p.image.api, p.host.abi), 'system.img')) },
  ];
  const total = parts.reduce((a, x) => a + (x.done() ? 0 : x.pkg.archive.size), 0) || 1;
  let before = 0;
  for (const part of parts) {
    if (part.done()) continue;
    const { url, size, sha1 } = part.pkg.archive;
    await download(part.pkg.base + url, part.dest, {
      size, sha1, signal,
      onBytes: (n) => onProgress({ message: `Downloading ${part.name} · ${(n / 1e9).toFixed(2)} of ${(size / 1e9).toFixed(2)} GB`, pct: 0.02 + 0.83 * ((before + n) / total) }),
    });
    before += size;
    onProgress({ message: `Unpacking ${part.name}…`, pct: 0.02 + 0.83 * (before / total) });
    if (part.pkg === p.emulator) await fsp.rm(path.join(SDK, 'emulator'), { recursive: true, force: true });
    await unzip(part.dest, part.into);
    await fsp.rm(part.dest, { force: true });
    if (part.pkg === p.emulator) writeState({ emulatorVersion: p.emulator.version });
  }
  writeState({ emulatorVersion: p.emulator.version, api: p.image.api, abi: p.host.abi, imageVersion: p.image.version, installedAt: new Date().toISOString() });
  onProgress({ message: 'Creating the phone…', pct: 0.92 });
  if (!fs.existsSync(path.join(AVD_HOME, `${AVD_NAME}.avd`, 'config.ini'))) await createAvd({ api: p.image.api, abi: p.host.abi });
  const accel = await accelCheck();
  onProgress({ message: accel.ok ? 'Phone emulator ready' : `Installed. ${accel.message}`, pct: 1 });
  return { ...readState(), accel };
}

const emuEnv = () => ({ ...process.env, ANDROID_SDK_ROOT: SDK, ANDROID_HOME: SDK, ANDROID_AVD_HOME: AVD_HOME, ANDROID_EMULATOR_HOME: EMU_HOME });

/** Is hardware virtualization available? (Without it the emulator would be unusably slow.) */
export async function accelCheck() {
  if (!fs.existsSync(emulatorBin())) return { ok: false, checked: false, message: 'Emulator not installed yet.' };
  let out = '';
  try {
    out = execFileSync(emulatorBin(), ['-accel-check'], { env: emuEnv(), encoding: 'utf8', timeout: 20000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { out = `${e.stdout || ''}${e.stderr || ''}`; }
  const m = out.match(/accel:\s*\r?\n\s*(\d+)\s*\r?\n([\s\S]*?)\r?\naccel/);
  const code = m ? Number(m[1]) : null;
  const detail = ((m ? m[2] : out).trim().split(/\r?\n/)[0] || 'unknown').replace(/\.$/, '');
  if (code === 0) return { ok: true, checked: true, message: detail };
  const fix = process.platform === 'win32'
    ? 'Turn on “Windows Hypervisor Platform” (press the button below, or Start → “Turn Windows features on or off”), make sure virtualization is enabled in the BIOS (Task Manager → Performance → CPU shows “Virtualization: Enabled”), then restart the computer.'
    : process.platform === 'linux'
      ? 'Enable KVM: virtualization must be on in the BIOS and your user needs access to /dev/kvm (sudo usermod -aG kvm $USER, then log out and in).'
      : 'Hardware acceleration is not available on this Mac.';
  return { ok: false, checked: true, message: `Hardware acceleration is off (${detail}). ${fix}` };
}

/** Windows only: ask for admin rights and switch on the Windows Hypervisor Platform feature (needs a restart). */
export function enableHypervisor() {
  if (process.platform !== 'win32') throw new Error('Only needed on Windows.');
  const inner = 'Enable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform -All -NoRestart; Write-Host; Write-Host \'Done. Restart the computer, then start the Goldcom phone again.\'; Read-Host \'Press Enter to close\'';
  spawn('powershell', ['-NoProfile', '-Command', `Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-Command',"${inner.replace(/"/g, '`"')}"`], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

let child = null;
let bootError = null;
let stopping = false;

// Ways to run the phone, from fastest to most compatible. When the emulator crashes (on Windows usually error
// 0xC0000005 from a graphics driver, a leftover process or a broken quick-boot snapshot), the studio moves one level
// down and tries again by itself. The level that works is remembered.
export const LEVELS = [
  { label: 'Normal (uses the graphics card)', args: ['-gpu', 'auto'] },
  { label: 'Software graphics', args: ['-gpu', 'swiftshader_indirect', '-feature', '-Vulkan', '-no-snapshot-load'] },
  { label: 'Software graphics, phone shown in the studio only', args: ['-gpu', 'swiftshader_indirect', '-feature', '-Vulkan', '-no-snapshot-load', '-no-window'], headless: true },
  { label: 'Safest (software, no window, less memory, no quick boot)', args: ['-gpu', 'swiftshader_indirect', '-feature', '-Vulkan', '-no-snapshot', '-no-window', '-memory', '2048', '-cores', '2'], headless: true },
];
const MAX_LEVEL = LEVELS.length - 1;

const crashText = (code) => (code === 3221225477 || code === -1073741819 ? 'crashed (Windows error 0xC0000005)' : `stopped unexpectedly (code ${code})`);

export function setLevel(level) {
  const l = Number(level);
  if (!LEVELS[l]) throw Object.assign(new Error('Unknown mode'), { status: 400 });
  writeState({ level: l, coldBoot: true });
}

/** Wipe the phone's data on the next start (fixes a corrupted phone; Google and Goldcom must be signed in again). */
export function resetPhone() { writeState({ wipe: true, coldBoot: true }); }

const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

const logFile = () => path.join(SDK, 'emulator.log');
function crashLog() {
  try {
    const lines = fs.readFileSync(logFile(), 'utf8').split(/\r?\n/).filter((l) => l.trim());
    return lines.slice(-40).join('\n');
  } catch { return ''; }
}

/**
 * Emulator processes left behind by a crash (qemu, netsimd for Bluetooth/Wi-Fi, crash handler) keep files locked and
 * make the next start crash too. Stop the ones that run from the studio's own emulator folder, and clear stale locks.
 */
async function cleanLeftovers() {
  const dir = path.join(SDK, 'emulator');
  try {
    if (process.platform === 'win32') {
      const ps = `Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith('${dir.replace(/'/g, "''")}', [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
      spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore', timeout: 20000, windowsHide: true });
    } else {
      const out = spawnSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8', timeout: 5000 }).stdout || '';
      for (const line of out.split('\n')) {
        const m = line.trim().match(/^(\d+)\s+(.*)$/);
        if (m && m[2].startsWith(dir) && Number(m[1]) !== process.pid) { try { process.kill(Number(m[1]), 'SIGKILL'); } catch { /* gone */ } }
      }
    }
  } catch { /* best effort */ }
  await new Promise((r) => setTimeout(r, 800));
  const avd = path.join(AVD_HOME, `${AVD_NAME}.avd`);
  try {
    for (const f of await fsp.readdir(avd, { recursive: true })) if (String(f).endsWith('.lock')) await fsp.rm(path.join(avd, f), { recursive: true, force: true });
  } catch { /* no avd yet */ }
}

export async function status() {
  const h = host();
  const st = readState();
  const installed = fs.existsSync(emulatorBin()) && !!st.api && fs.existsSync(path.join(imageDir(st.api, st.abi || h.abi), 'system.img'));
  let device = null;
  if (A.findAdb()) { try { device = (await A.devices()).find((d) => d.serial === SERIAL) || null; } catch { /* adb busy */ } }
  const running = device?.state === 'device';
  let booted = false;
  if (running) { try { booted = (await A.adb(['shell', 'getprop sys.boot_completed'], { serial: SERIAL, timeout: 5000 })).toString().trim() === '1'; } catch { /* booting */ } }
  const procAlive = !!(child && child.exitCode === null) || (st.pid ? pidAlive(st.pid) : false);
  let goldcom = null;
  if (booted) { try { goldcom = (await A.listPackages(SERIAL, 'goldcom')).length > 0; } catch { /* ignore */ } }
  const level = Number.isInteger(st.level) ? st.level : 0;
  return {
    supported: !h.unsupported, unsupported: h.unsupported, host: h,
    installed, version: st.emulatorVersion || null, android: st.api ? { 34: '14', 35: '15', 36: '16' }[st.api] || st.api : null,
    accel: installed ? (st.accel || null) : null,
    serial: SERIAL, state: booted ? 'ready' : running || procAlive ? 'starting' : 'stopped', goldcomInstalled: goldcom,
    freeGb: freeGb(fs.existsSync(SDK) ? SDK : os.homedir()), needGb: NEED_FREE_GB, error: runtimeError(),
    level, levels: LEVELS.map((l) => l.label), headless: !!(LEVELS[level]?.headless || st.headless),
    lastCrash: st.lastCrash || null, wipePending: !!st.wipe,
  };
}

function launch({ level, headless }) {
  const saved = readState();
  const L = LEVELS[level] || LEVELS[0];
  const args = ['-avd', AVD_NAME, '-port', String(PORT), '-no-boot-anim', '-no-audio', '-netdelay', 'none', '-netspeed', 'full', ...L.args];
  if (saved.coldBoot && !args.includes('-no-snapshot-load') && !args.includes('-no-snapshot')) args.push('-no-snapshot-load');
  if (saved.wipe) args.push('-wipe-data');
  if (headless && !args.includes('-no-window')) args.push('-no-window');
  const log = fs.openSync(logFile(), 'w');
  fs.writeSync(log, `[studio] ${new Date().toISOString()} level ${level}: emulator ${args.join(' ')}\n`);
  stopping = false;
  // Detached: the phone keeps running while the studio restarts (updates) and is stopped explicitly.
  const proc = spawn(emulatorBin(), args, { env: emuEnv(), detached: true, stdio: ['ignore', log, log], windowsHide: !!(headless || L.headless) });
  const t0 = Date.now();
  proc.on('exit', (code) => {
    if (proc !== child || !code || stopping) return;
    const log40 = crashLog();
    const next = Math.min(MAX_LEVEL, level + 1);
    writeState({ pid: null, coldBoot: true, level: next, lastCrash: { at: new Date().toISOString(), code, level, afterSec: Math.round((Date.now() - t0) / 1000), log: log40 } });
    try { fs.copyFileSync(logFile(), path.join(SDK, 'emulator-crash.log')); } catch { /* ignore */ }
    bootError = { code, level, exhausted: level >= MAX_LEVEL };
  });
  proc.unref();
  child = proc;
  writeState({ pid: proc.pid, headless: !!headless, wipe: false });
}

/**
 * Start the phone (window visible so the user can sign in, unless the mode or `headless` hides it) and wait until
 * Android has booted. If it crashes while starting, more compatible modes are tried automatically.
 */
export async function start({ headless = false, onProgress = () => {}, signal } = {}) {
  const st = await status();
  if (!st.installed) throw new Error('Install the phone emulator first.');
  if (st.state === 'ready') return st;
  const accel = await accelCheck();
  writeState({ accel });
  if (!accel.ok) throw new Error(accel.message);
  bootError = null;
  if (st.state === 'stopped') { await fsp.mkdir(EMU_HOME, { recursive: true }); await cleanLeftovers(); launch({ level: st.level, headless }); }
  let level = st.level;
  let t0 = Date.now();
  while (Date.now() - t0 < 8 * 60e3) {
    if (signal?.aborted) throw new Error('Cancelled');
    if (bootError) {
      const { code, exhausted } = bootError;
      if (exhausted) {
        throw new Error(`The phone ${crashText(code)} in every mode, including the safest one. Press “Copy details” below and send them to support, or use a cloud phone instead. Things that often help: update Windows and the graphics driver, restart the computer, turn off “Memory integrity” (Windows Security → Device security → Core isolation), and make sure no other emulator (BlueStacks, LDPlayer, Android Studio) is running.`);
      }
      level = readState().level;
      onProgress({ message: `The phone ${crashText(code)}. Trying a more compatible mode: ${LEVELS[level].label}…`, pct: 0.05 });
      bootError = null;
      await cleanLeftovers();
      launch({ level, headless });
      t0 = Date.now();
      continue;
    }
    const s = await status();
    if (s.state === 'ready') {
      writeState({ coldBoot: false });
      // Let the status bar demo mode work for clean recordings.
      await A.adb(['shell', 'settings put global sysui_demo_allowed 1'], { serial: SERIAL }).catch(() => {});
      return s;
    }
    const secs = Math.round((Date.now() - t0) / 1000);
    onProgress({ message: secs < 20 ? `Starting the phone (${LEVELS[level].label})…` : `Android is booting (${secs} s; the first start takes a few minutes)…`, pct: Math.min(0.95, secs / 240) });
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`The phone did not finish starting in 8 minutes. ${crashLog().split('\n').filter((l) => /ERROR|FATAL|error:/i.test(l)).slice(-2).join(' ').slice(0, 400)}`);
}

/** A crash while the phone was already running: the next start uses the next mode. */
export function runtimeError() {
  if (!bootError) return null;
  return `The phone ${crashText(bootError.code)}. Press “Start the phone” again: it will use ${LEVELS[readState().level ?? 0].label.toLowerCase()}.`;
}

export async function stop() {
  stopping = true;
  try { await A.adb(['emu', 'kill'], { serial: SERIAL, timeout: 15000 }); } catch {
    const st = readState();
    if (st.pid && pidAlive(st.pid)) { try { process.kill(st.pid); } catch { /* gone */ } }
  }
  child = null;
  bootError = null;
  writeState({ pid: null });
}

/** Open Goldcom's Google Play page inside the phone (sign in to Google first). */
export async function openStore(pkg = GOLDCOM_PACKAGE) {
  await A.adb(['shell', `am start -a android.intent.action.VIEW -d "market://details?id=${pkg}"`], { serial: SERIAL });
}

/** Remove the emulator, the Android image and the phone's data (frees about 8–10 GB). */
export async function uninstall() {
  await stop().catch(() => {});
  for (const d of ['emulator', 'system-images', 'avd', 'emulator-home', 'downloads']) await fsp.rm(path.join(SDK, d), { recursive: true, force: true });
  await fsp.rm(STATE, { force: true });
}
