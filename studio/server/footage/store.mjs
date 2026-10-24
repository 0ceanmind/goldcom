// Footage library: real app screen recordings and screenshots, ready to drop into designs.
// <data>/footage/<id>/ holds original.<ext>, video.mp4 (H.264 proxy with dense keyframes), poster.jpg,
// kf/<n>.jpg (one keyframe per detected segment), frames/<fps>/<n>.jpg (exact frames for export) and meta.json.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from '../store.mjs';
import { ffmpeg, probe, run, FFMPEG } from '../media/ffmpeg.mjs';

export const FOOTAGE_DIR = path.join(DATA_DIR, 'footage');
const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.3gp']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

const safeId = (id) => {
  if (!/^[\w-]+$/.test(String(id))) throw Object.assign(new Error('Invalid footage id'), { status: 400 });
  return id;
};
export const footageDir = (id) => path.join(FOOTAGE_DIR, safeId(id));
const metaPath = (id) => path.join(footageDir(id), 'meta.json');

async function writeJson(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2));
  await fsp.rename(tmp, file);
}

const listeners = new Set();
export const onFootageChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (meta) => { for (const fn of listeners) { try { fn(meta); } catch { /* ignore */ } } };

export async function getFootage(id) {
  const file = metaPath(id);
  if (!fs.existsSync(file)) throw Object.assign(new Error(`Footage ${id} not found`), { status: 404 });
  return JSON.parse(await fsp.readFile(file, 'utf8'));
}

export async function updateFootage(id, patch) {
  const meta = { ...(await getFootage(id)), ...patch, updatedAt: new Date().toISOString() };
  await writeJson(metaPath(id), meta);
  emit(meta);
  return meta;
}

export async function listFootage() {
  fs.mkdirSync(FOOTAGE_DIR, { recursive: true });
  const out = [];
  for (const id of await fsp.readdir(FOOTAGE_DIR)) {
    try { out.push(JSON.parse(await fsp.readFile(path.join(FOOTAGE_DIR, id, 'meta.json'), 'utf8'))); } catch { /* partial import */ }
  }
  return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function deleteFootage(id) {
  await fsp.rm(footageDir(id), { recursive: true, force: true });
  emit({ id, deleted: true });
}

/** URL helpers used by designs. */
export const footageUrls = (meta) => ({
  src: meta.kind === 'image' ? `/footage/${meta.id}/image${meta.ext || '.png'}` : `/footage/${meta.id}/video.mp4`,
  poster: `/footage/${meta.id}/poster.jpg`,
});

/**
 * Import a recording or screenshot. `input` is a file path or a Buffer.
 * extra: { name, source ('upload'|'device'|'web'), events ([{ t, type, x, y }] in 0..1 screen coords), device, notes }
 * Processing (proxy, poster, segments) runs in the background; poll meta.status.
 */
export async function importFootage(input, extra = {}) {
  fs.mkdirSync(FOOTAGE_DIR, { recursive: true });
  const name = extra.name || (typeof input === 'string' ? path.basename(input) : 'recording.mp4');
  const ext = (path.extname(name) || (typeof input === 'string' ? path.extname(input) : '.mp4')).toLowerCase();
  if (!VIDEO_EXT.has(ext) && !IMAGE_EXT.has(ext)) throw Object.assign(new Error(`Unsupported footage type ${ext}. Use MP4, MOV, PNG or JPG.`), { status: 415 });
  const id = `ft_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
  const dir = footageDir(id);
  await fsp.mkdir(dir, { recursive: true });
  const original = path.join(dir, `original${ext}`);
  if (typeof input === 'string') await fsp.copyFile(input, original); else await fsp.writeFile(original, input);
  const kind = IMAGE_EXT.has(ext) ? 'image' : 'video';
  const meta = {
    id, name: path.basename(name, ext), kind, ext: kind === 'image' ? (ext === '.jpeg' ? '.jpg' : ext) : '.mp4',
    source: extra.source || 'upload', device: extra.device || null, notes: extra.notes || '',
    createdAt: new Date().toISOString(), status: 'processing', events: extra.events || [], segments: [], labels: null, tags: extra.tags || [],
  };
  await writeJson(metaPath(id), meta);
  emit(meta);
  processFootage(id).catch(async (e) => { try { await updateFootage(id, { status: 'error', error: e.message }); } catch { /* deleted */ } });
  return meta;
}

/** Transcode, poster, segment detection. */
export async function processFootage(id) {
  const meta = await getFootage(id);
  const dir = footageDir(id);
  const original = fs.readdirSync(dir).find((f) => f.startsWith('original'));
  const src = path.join(dir, original);
  const info = await probe(src);
  if (meta.kind === 'image') {
    const out = path.join(dir, `image${meta.ext}`);
    await fsp.copyFile(src, out);
    await ffmpeg(['-i', src, '-vf', 'scale=540:-2', '-q:v', '3', path.join(dir, 'poster.jpg')]);
    return updateFootage(id, { status: 'ready', width: info.width, height: info.height, duration: 0, fps: 0, segments: [{ start: 0, end: 0, kf: 'poster.jpg' }] });
  }
  // Proxy: H.264, even dimensions, a keyframe every half second so scrubbing is instant. Max 60 fps.
  const fps = Math.min(60, Math.round(info.fps) || 30);
  const vf = [`fps=${fps}`, 'scale=trunc(iw/2)*2:trunc(ih/2)*2', 'format=yuv420p'].join(',');
  await ffmpeg(['-i', src, '-an', '-vf', vf, '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-g', String(Math.round(fps / 2)), '-movflags', '+faststart', path.join(dir, 'video.mp4')]);
  const pinfo = await probe(path.join(dir, 'video.mp4'));
  await ffmpeg(['-ss', String(Math.min(1, pinfo.duration / 2)), '-i', path.join(dir, 'video.mp4'), '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '3', path.join(dir, 'poster.jpg')]);
  const segments = await detectSegments(path.join(dir, 'video.mp4'), pinfo.duration);
  await fsp.mkdir(path.join(dir, 'kf'), { recursive: true });
  for (let i = 0; i < segments.length; i++) {
    const sg = segments[i];
    const at = sg.still ? sg.stillAt : (sg.start + sg.end) / 2;
    await ffmpeg(['-ss', at.toFixed(3), '-i', path.join(dir, 'video.mp4'), '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '3', path.join(dir, 'kf', `${i + 1}.jpg`)]);
    sg.kf = `kf/${i + 1}.jpg`;
    sg.kfAt = at;
  }
  return updateFootage(id, { status: 'ready', width: pinfo.width, height: pinfo.height, duration: pinfo.duration, fps, segments, hasAudio: info.hasAudio });
}

/**
 * Split a screen recording into segments: hard cuts (screen changes) and still/moving stretches.
 * Returns [{ start, end, still, stillAt }] where still segments are screens at rest (good for holds and captions).
 */
export async function detectSegments(file, duration) {
  // scdet logs scene scores; freezedetect logs stretches without motion.
  const { stderr } = await run(FFMPEG, ['-hide_banner', '-i', file, '-vf', 'scale=270:-2,scdet=threshold=12,freezedetect=n=0.003:d=0.4', '-an', '-f', 'null', '-'], { timeout: 10 * 60e3 }).catch((e) => ({ stderr: e.stderr || '' }));
  const cuts = [...stderr.matchAll(/lavfi\.scd\.time:\s*([\d.]+)/g)].map((m) => Number(m[1])).filter((t) => t > 0.2 && t < duration - 0.2);
  const freezes = [];
  let cur = null;
  for (const line of stderr.split('\n')) {
    let m;
    if ((m = line.match(/freeze_start:\s*([\d.]+)/))) cur = { start: Number(m[1]) };
    else if ((m = line.match(/freeze_end:\s*([\d.]+)/)) && cur) { cur.end = Number(m[1]); freezes.push(cur); cur = null; }
  }
  if (cur) { cur.end = duration; freezes.push(cur); }
  // Boundaries: every cut, plus freeze edges, merged when closer than 0.35 s.
  const raw = [0, ...cuts, ...freezes.flatMap((f) => [f.start, f.end]), duration].sort((a, b) => a - b);
  const bounds = [];
  for (const t of raw) if (!bounds.length || t - bounds[bounds.length - 1] > 0.35) bounds.push(t);
  if (bounds[bounds.length - 1] < duration - 0.05) bounds.push(duration); else bounds[bounds.length - 1] = duration;
  const segs = [];
  for (let i = 1; i < bounds.length; i++) {
    const start = bounds[i - 1], end = bounds[i];
    const fr = freezes.find((f) => f.start <= start + 0.2 && f.end >= end - 0.2);
    segs.push({ start: +start.toFixed(3), end: +end.toFixed(3), still: !!fr, stillAt: +(fr ? Math.min(end - 0.05, start + 0.15) : (start + end) / 2).toFixed(3), cut: cuts.some((c) => Math.abs(c - start) < 0.2) });
  }
  return segs.length ? segs : [{ start: 0, end: duration, still: false, stillAt: duration / 2 }];
}

const extracting = new Map();
/** Exact frames at `fps` for export: frames/<fps>/<n>.jpg where frame n shows time (n-1)/fps. */
export async function ensureFrames(id, fps = 30) {
  const dir = path.join(footageDir(id), 'frames', String(fps));
  if (fs.existsSync(path.join(dir, '.done'))) return dir;
  const key = `${id}:${fps}`;
  if (!extracting.has(key)) {
    extracting.set(key, (async () => {
      await fsp.rm(dir, { recursive: true, force: true });
      await fsp.mkdir(dir, { recursive: true });
      await ffmpeg(['-i', path.join(footageDir(id), 'video.mp4'), '-vf', `fps=${fps}`, '-q:v', '2', '-start_number', '1', path.join(dir, '%d.jpg')], { timeout: 20 * 60e3 });
      await fsp.writeFile(path.join(dir, '.done'), new Date().toISOString());
      return dir;
    })().finally(() => extracting.delete(key)));
  }
  return extracting.get(key);
}

/** Map a /footage/... URL path to a file on disk (or null). */
export function footageFile(urlPath) {
  const m = urlPath.match(/^\/footage\/([\w-]+)\/(.+)$/);
  if (!m) return null;
  const dir = footageDir(m[1]);
  const rel = path.normalize(decodeURIComponent(m[2])).replace(/^(\.\.[/\\])+/, '');
  const file = path.join(dir, rel);
  return file.startsWith(dir) ? file : null;
}
