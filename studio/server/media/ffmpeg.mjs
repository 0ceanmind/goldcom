// ffmpeg / ffprobe resolution and small process helpers.
// Uses the binaries bundled by ffmpeg-static / ffprobe-static, falling back to the system PATH.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function resolveBin(envVar, pkg, pick, fallback) {
  if (process.env[envVar] && fs.existsSync(process.env[envVar])) return process.env[envVar];
  try {
    const mod = require(pkg);
    const p = pick(mod);
    if (p && fs.existsSync(p)) return p;
  } catch { /* package missing or binary not downloaded */ }
  return fallback;
}

export const FFMPEG = resolveBin('FFMPEG_PATH', 'ffmpeg-static', (m) => m, 'ffmpeg');
export const FFPROBE = resolveBin('FFPROBE_PATH', 'ffprobe-static', (m) => m.path, 'ffprobe');

/** Run a binary, collect stdout/stderr. Rejects on non-zero exit. */
export function run(bin, args, { input, cwd, timeout = 0, onStderr } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const out = [];
    let err = '';
    let timer = null;
    if (timeout) timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`${bin} timed out`)); }, timeout);
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => { const s = d.toString(); err += s; if (err.length > 200000) err = err.slice(-100000); onStderr?.(s); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout: Buffer.concat(out), stderr: err });
      else reject(Object.assign(new Error(`${bin.split(/[\\/]/).pop()} exited with ${code}: ${err.split('\n').filter(Boolean).slice(-4).join(' | ')}`), { code, stderr: err }));
    });
    if (input) child.stdin.end(input); else child.stdin.end();
  });
}

export const ffmpeg = (args, opts) => run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], opts);

/** ffprobe a media file: { duration, width, height, fps, hasAudio, codec, rotation } */
export async function probe(file) {
  const { stdout } = await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  const j = JSON.parse(stdout.toString('utf8'));
  const v = (j.streams || []).find((s) => s.codec_type === 'video');
  const a = (j.streams || []).find((s) => s.codec_type === 'audio');
  const rate = (r) => { const [n, d] = String(r || '0/1').split('/').map(Number); return d ? n / d : n || 0; };
  let rotation = 0;
  const sd = v?.side_data_list?.find((x) => x.rotation !== undefined);
  if (sd) rotation = Number(sd.rotation) || 0;
  else if (v?.tags?.rotate) rotation = Number(v.tags.rotate) || 0;
  let width = v?.width || 0, height = v?.height || 0;
  if (Math.abs(rotation) % 180 === 90) [width, height] = [height, width];
  return {
    duration: Number(j.format?.duration || v?.duration || 0),
    width,
    height,
    fps: rate(v?.avg_frame_rate) || rate(v?.r_frame_rate) || 30,
    codec: v?.codec_name || null,
    hasAudio: !!a,
    rotation,
    isImage: !!v && !(Number(j.format?.duration) > 0.05) && /png|mjpeg|webp|bmp|gif/.test(v.codec_name || ''),
  };
}

export async function ffmpegAvailable() {
  try { await run(FFMPEG, ['-version']); return true; } catch { return false; }
}
