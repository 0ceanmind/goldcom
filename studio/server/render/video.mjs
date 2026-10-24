// Studio-quality video export: every frame is drawn by the studio renderer in headless Chromium (exact, no
// dropped frames), piped to ffmpeg as JPEG and encoded to H.264. Several pages render in parallel; frames are
// written to ffmpeg in order. Footage frames are pre-extracted so video inside phones is frame-exact.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { getBrowser } from '../browser.mjs';
import { FFMPEG } from '../media/ffmpeg.mjs';
import { ensureFrames } from '../footage/store.mjs';
import { docDuration } from '../../shared/schema.js';

const footageIds = (doc) => {
  const ids = new Set();
  for (const s of doc.slides) for (const l of s.layers) { const m = String(l.src || '').match(/^\/footage\/([\w-]+)\/video/); if (m) ids.add(m[1]); }
  return [...ids];
};

/** Open a render page in frames mode. */
async function openPage(browser, base, doc, fps, scale) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 400 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript((d) => { window.__DOC = d; }, doc);
  await page.goto(`${base}/render.html?mode=frames&fps=${fps}&scale=${scale}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('window.__READY === true || window.__ERROR', null, { timeout: 60000 });
  const err = await page.evaluate('window.__ERROR || null');
  if (err) { await ctx.close(); throw new Error(`Render page failed: ${err}`); }
  return { page, close: () => ctx.close() };
}

/**
 * Render frames of a document.
 * opts: { base, doc, fps, scale, mode: 'sequence'|'slide', index, from, to, workers, onProgress(p), signal, fmt, quality }
 * onFrame(i, buffer) is awaited in frame order.
 */
export async function renderFrames(opts, onFrame) {
  const { base, doc, scale = 1, mode = 'sequence', index = 0, signal, fmt = 'jpeg', quality = 0.95 } = opts;
  const fps = opts.fps || doc.fps || 30;
  const duration = mode === 'slide' ? Number(doc.slides[index]?.duration) || 4 : docDuration(doc);
  const times = opts.times || Array.from({ length: Math.max(1, Math.round(duration * fps)) }, (_, i) => i / fps);
  for (const id of footageIds(doc)) await ensureFrames(id, fps);
  const browser = await getBrowser();
  const nWorkers = Math.max(1, Math.min(opts.workers || Math.max(1, Math.min(4, os.cpus().length - 1)), times.length));
  const pages = await Promise.all(Array.from({ length: nWorkers }, () => openPage(browser, base, doc, fps, scale)));
  const results = new Map();
  let next = 0, written = 0, failed = null;
  const waiters = new Set();
  const wait = () => new Promise((r) => waiters.add(r));
  const notify = () => { for (const r of waiters) r(); waiters.clear(); };
  try {
    const worker = async ({ page }) => {
      while (!failed) {
        if (signal?.aborted) throw new Error('Export cancelled');
        // Keep workers at most ~2 frames per worker ahead of the writer so memory stays flat.
        while (next - written > nWorkers * 3 && !failed) await wait();
        const i = next++;
        if (i >= times.length) return;
        const b64 = await page.evaluate(([t, sl, f, qq]) => window.__frame(t, sl, f, qq), [times[i], mode === 'slide' ? index : null, fmt, quality]);
        results.set(i, Buffer.from(b64, 'base64'));
        notify();
      }
    };
    const writer = async () => {
      while (written < times.length) {
        if (failed) return;
        if (!results.has(written)) { await wait(); continue; }
        const buf = results.get(written);
        results.delete(written);
        await onFrame(written, buf);
        written++;
        opts.onProgress?.(written / times.length);
        notify();
      }
    };
    await Promise.all([...pages.map((p) => worker(p).catch((e) => { failed = e; notify(); })), writer()]);
    if (failed) throw failed;
  } finally {
    await Promise.all(pages.map((p) => p.close().catch(() => {})));
  }
  return { frames: times.length, fps, duration };
}

/** Encode a document (or one slide) to MP4. Returns { file, duration, frames }. */
export async function renderVideo({ base, doc, out, fps, scale = 1, mode = 'sequence', index = 0, onProgress, signal, crf = 16, preset = 'medium' }) {
  fps = fps || doc.fps || 30;
  await fsp.mkdir(path.dirname(out), { recursive: true });
  const w = Math.round(doc.width * scale), h = Math.round(doc.height * scale);
  const tmp = `${out}.part.mp4`;
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-vf', `scale=${w + (w % 2)}:${h + (h % 2)}:flags=lanczos,format=yuv420p`,
    '-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(fps), '-movflags', '+faststart', tmp];
  const ff = spawn(FFMPEG, args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
  let ffErr = '';
  ff.stderr.on('data', (d) => { ffErr += d.toString(); });
  const ffDone = new Promise((resolve, reject) => { ff.on('error', reject); ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed (${code}): ${ffErr.slice(-400)}`)))); });
  ffDone.catch(() => {});
  let pipeErr = null;
  ff.stdin.on('error', (e) => { pipeErr = e; });
  const write = (buf) => new Promise((resolve, reject) => {
    if (pipeErr) { reject(new Error(`ffmpeg stopped: ${ffErr.slice(-300) || pipeErr.message}`)); return; }
    if (ff.stdin.write(buf)) resolve(); else ff.stdin.once('drain', resolve);
  });
  let res;
  try {
    res = await renderFrames({ base, doc, fps, scale, mode, index, signal, onProgress: (p) => onProgress?.(p * 0.97) }, (_, buf) => write(buf));
  } catch (e) {
    ff.stdin.destroy(); ff.kill('SIGKILL');
    await fsp.rm(tmp, { force: true });
    throw e;
  }
  ff.stdin.end();
  await ffDone;
  await fsp.rename(tmp, out);
  onProgress?.(1);
  return { file: out, ...res };
}

/** Render specific moments to PNG/JPEG buffers (contact sheets for review, thumbnails). */
export async function renderStills({ base, doc, times, scale = 0.5, fmt = 'jpeg', quality = 0.9, mode = 'sequence', index = 0 }) {
  const out = [];
  await renderFrames({ base, doc, times, scale, fmt, quality, mode, index, workers: Math.min(2, times.length) }, (i, buf) => { out[i] = buf; });
  return out;
}

export const exportsDir = (dataDir) => { const d = path.join(dataDir, 'exports'); fs.mkdirSync(d, { recursive: true }); return d; };
