// Exports: PNG, carousel ZIP, MP4/WebM video (WebCodecs, frame-exact) and GIF.
import { zipSync } from 'fflate';
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { renderSlide, renderFrame } from './renderer.js';
import { docDuration } from '../../shared/schema.js';

const slug = (s) => String(s || 'goldcom').toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '-').replace(/^-|-$/g, '') || 'goldcom';

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function makeCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  return cv;
}

const toBlob = (cv, type = 'image/png', q) => new Promise((res) => cv.toBlob(res, type, q));

export async function slidePng(doc, index, images, scale = 1) {
  await images.preload(doc);
  const cv = makeCanvas(Math.round(doc.width * scale), Math.round(doc.height * scale));
  renderSlide(cv.getContext('2d'), doc, index, { t: Infinity, images, scale });
  return toBlob(cv);
}

export async function exportPng(doc, index, images) {
  downloadBlob(await slidePng(doc, index, images), `${slug(doc.name)}-${String(index + 1).padStart(2, '0')}.png`);
}

export async function exportZip(doc, images, onProgress) {
  await images.preload(doc);
  const files = {};
  for (let i = 0; i < doc.slides.length; i++) {
    const blob = await slidePng(doc, i, images);
    files[`${slug(doc.name)}-${String(i + 1).padStart(2, '0')}.png`] = new Uint8Array(await blob.arrayBuffer());
    onProgress?.((i + 1) / doc.slides.length);
  }
  files['document.json'] = new TextEncoder().encode(JSON.stringify(doc, null, 2));
  downloadBlob(new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }), `${slug(doc.name)}-carousel.zip`);
}

export function exportJson(doc) {
  downloadBlob(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }), `${slug(doc.name)}.json`);
}

// ---------- video ----------
async function pickCodec(width, height, fps, bitrate) {
  if (typeof VideoEncoder === 'undefined') return null;
  const cands = [
    { container: 'mp4', codec: 'avc1.640033', muxCodec: 'avc' },
    { container: 'mp4', codec: 'avc1.640028', muxCodec: 'avc' },
    { container: 'mp4', codec: 'avc1.4d0033', muxCodec: 'avc' },
    { container: 'mp4', codec: 'avc1.42e033', muxCodec: 'avc' },
    { container: 'webm', codec: 'vp09.00.50.08', muxCodec: 'V_VP9' },
    { container: 'webm', codec: 'vp8', muxCodec: 'V_VP8' },
  ];
  for (const c of cands) {
    const config = { codec: c.codec, width, height, bitrate, framerate: fps, ...(c.container === 'mp4' ? { avc: { format: 'avc' } } : {}) };
    try {
      const res = await VideoEncoder.isConfigSupported(config);
      if (res.supported) return { ...c, config };
    } catch { /* try next */ }
  }
  return null;
}

/**
 * Render frames to a video file.
 * mode 'sequence' plays all slides with transitions; mode 'slide' animates one slide (index) for its duration.
 */
export async function exportVideo(doc, images, { mode = 'sequence', index = 0, onProgress, signal } = {}) {
  await images.preload(doc);
  const fps = doc.fps || 30;
  const width = doc.width % 2 ? doc.width + 1 : doc.width;
  const height = doc.height % 2 ? doc.height + 1 : doc.height;
  const duration = mode === 'slide' ? Number(doc.slides[index]?.duration) || 4 : docDuration(doc);
  const frames = Math.max(1, Math.round(duration * fps));
  const cv = makeCanvas(width, height);
  const c = cv.getContext('2d', { alpha: false });
  const draw = (f) => {
    const t = f / fps;
    c.fillStyle = '#151513'; c.fillRect(0, 0, width, height);
    if (mode === 'slide') renderSlide(c, doc, index, { t, images });
    else renderFrame(c, doc, t, { images });
  };
  const bitrate = Math.round(width * height * fps * 0.18);
  const pick = await pickCodec(width, height, fps, bitrate);
  const name = `${slug(doc.name)}${mode === 'slide' ? `-slide-${index + 1}` : ''}`;

  if (!pick) return recordRealtime(cv, draw, frames, fps, name, onProgress);

  const target = pick.container === 'mp4' ? new Mp4Target() : new WebmTarget();
  const muxer = pick.container === 'mp4'
    ? new Mp4Muxer({ target, video: { codec: pick.muxCodec, width, height, frameRate: fps }, fastStart: 'in-memory' })
    : new WebmMuxer({ target, video: { codec: pick.muxCodec, width, height, frameRate: fps } });
  let encErr = null;
  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { encErr = e; } });
  encoder.configure(pick.config);
  for (let f = 0; f < frames; f++) {
    if (signal?.aborted) { encoder.close(); throw new Error('Export cancelled'); }
    if (encErr) throw encErr;
    draw(f);
    const frame = new VideoFrame(cv, { timestamp: Math.round((f * 1e6) / fps), duration: Math.round(1e6 / fps) });
    encoder.encode(frame, { keyFrame: f % (fps * 2) === 0 });
    frame.close();
    while (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 4));
    if (f % 5 === 0) { onProgress?.(f / frames); await new Promise((r) => setTimeout(r, 0)); }
  }
  await encoder.flush();
  encoder.close();
  muxer.finalize();
  if (encErr) throw encErr;
  onProgress?.(1);
  const type = pick.container === 'mp4' ? 'video/mp4' : 'video/webm';
  const blob = new Blob([target.buffer], { type });
  downloadBlob(blob, `${name}.${pick.container}`);
  return { container: pick.container, codec: pick.codec, bytes: blob.size, frames };
}

async function recordRealtime(cv, draw, frames, fps, name, onProgress) {
  const stream = cv.captureStream(fps);
  const type = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) || 'video/webm';
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 12e6 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((r) => { rec.onstop = r; });
  rec.start();
  const start = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      const f = Math.floor(((performance.now() - start) / 1000) * fps);
      if (f >= frames) return resolve();
      draw(f); onProgress?.(f / frames);
      requestAnimationFrame(tick);
    };
    tick();
  });
  rec.stop();
  await done;
  const ext = type.includes('mp4') ? 'mp4' : 'webm';
  const blob = new Blob(chunks, { type });
  downloadBlob(blob, `${name}.${ext}`);
  return { container: ext, codec: type, bytes: blob.size, frames };
}

export async function exportGif(doc, images, { mode = 'sequence', index = 0, maxWidth = 540, fps = 15, onProgress } = {}) {
  await images.preload(doc);
  const scale = Math.min(1, maxWidth / doc.width);
  const w = Math.round(doc.width * scale), h = Math.round(doc.height * scale);
  const cv = makeCanvas(w, h);
  const c = cv.getContext('2d', { willReadFrequently: true });
  const duration = mode === 'slide' ? Number(doc.slides[index]?.duration) || 4 : docDuration(doc);
  const frames = Math.max(1, Math.round(duration * fps));
  const gif = GIFEncoder();
  for (let f = 0; f < frames; f++) {
    const t = f / fps;
    if (mode === 'slide') renderSlide(c, doc, index, { t, images, scale });
    else renderFrame(c, doc, t, { images, scale });
    const { data } = c.getImageData(0, 0, w, h);
    const palette = quantize(data, 256);
    gif.writeFrame(applyPalette(data, palette), w, h, { palette, delay: Math.round(1000 / fps) });
    if (f % 3 === 0) { onProgress?.(f / frames); await new Promise((r) => setTimeout(r, 0)); }
  }
  gif.finish();
  onProgress?.(1);
  downloadBlob(new Blob([gif.bytes()], { type: 'image/gif' }), `${slug(doc.name)}${mode === 'slide' ? `-slide-${index + 1}` : ''}.gif`);
}
