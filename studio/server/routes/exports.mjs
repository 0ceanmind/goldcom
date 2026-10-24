// Video export jobs: studio-quality MP4 rendered on the server, with the soundtrack mixed in.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { zipSync } from 'fflate';
import { send, readJson, serveFile } from '../http-util.mjs';
import { DATA_DIR, getDocument } from '../store.mjs';
import { createJob, updateJob } from '../jobs.mjs';
import { renderVideo, renderStills } from '../render/video.mjs';
import { soundtrackFor } from '../render/soundtrack.mjs';
import { getSettings } from '../settings.mjs';

export const EXPORTS_DIR = path.join(DATA_DIR, 'exports');
const slug = (s) => String(s || 'goldcom').toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'goldcom';
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

/** Render a document to MP4 (whole sequence, one slide, or each slide zipped). Returns the job. */
export function startExport({ base, docId, mode = 'auto', index = 0, fps, scale = 1, audio = true }) {
  const job = createJob('export', { title: 'Export video', docId, message: 'Preparing…' });
  (async () => {
    const doc = await getDocument(docId);
    job.title = `Export · ${doc.name}`;
    fs.mkdirSync(EXPORTS_DIR, { recursive: true });
    const m = mode === 'auto' ? (['reel', 'video'].includes(doc.kind) ? 'sequence' : doc.slides.length > 1 ? 'slides' : 'slide') : mode;
    const f = fps || doc.fps || getSettings().exportFps || 30;
    const signal = job.controller.signal;
    const one = async (opts, out, frac0, frac1) => {
      const tmpVideo = `${out}.video.mp4`;
      await renderVideo({ base, doc, out: tmpVideo, fps: f, scale, signal, ...opts, onProgress: (p) => updateJob(job, { progress: frac0 + (frac1 - frac0) * p * 0.92, message: `Rendering ${Math.round(p * 100)}%` }) });
      if (audio && doc.audio?.enabled !== false) {
        updateJob(job, { message: 'Mixing sound…' });
        const ok = await soundtrackFor(doc, { mode: opts.mode, index: opts.index, video: tmpVideo, out }).catch((e) => { updateJob(job, {}, `Sound skipped: ${e.message}`); return false; });
        if (ok) { await fsp.rm(tmpVideo, { force: true }); return; }
      }
      await fsp.rename(tmpVideo, out);
    };
    let file;
    if (m === 'png') {
      // Full-size PNG of every slide (exact footage frames), zipped with the caption.
      const files = {};
      for (let i = 0; i < doc.slides.length; i++) {
        updateJob(job, { progress: i / doc.slides.length, message: `Rendering slide ${i + 1} of ${doc.slides.length}` });
        const [buf] = await renderStills({ base, doc, times: [Infinity], scale, fmt: 'png', mode: 'slide', index: i });
        files[`${slug(doc.name)}-${String(i + 1).padStart(2, '0')}.png`] = new Uint8Array(buf);
      }
      const cap = [doc.caption?.text || '', (doc.caption?.hashtags || []).join(' ')].filter((x) => x.trim()).join('\n\n');
      if (cap) files['caption.txt'] = new TextEncoder().encode(cap);
      file = path.join(EXPORTS_DIR, `${slug(doc.name)}-images-${stamp()}.zip`);
      await fsp.writeFile(file, zipSync(files, { level: 0 }));
    } else if (m === 'slides') {
      const files = {};
      for (let i = 0; i < doc.slides.length; i++) {
        const out = path.join(EXPORTS_DIR, `${slug(doc.name)}-${String(i + 1).padStart(2, '0')}-${stamp()}.mp4`);
        await one({ mode: 'slide', index: i }, out, i / doc.slides.length, (i + 1) / doc.slides.length);
        files[path.basename(out).replace(/-\d{12}\.mp4$/, '.mp4')] = new Uint8Array(await fsp.readFile(out));
        await fsp.rm(out, { force: true });
      }
      const cap = [doc.caption?.text || '', (doc.caption?.hashtags || []).join(' ')].filter((x) => x.trim()).join('\n\n');
      if (cap) files['caption.txt'] = new TextEncoder().encode(cap);
      file = path.join(EXPORTS_DIR, `${slug(doc.name)}-${stamp()}.zip`);
      await fsp.writeFile(file, zipSync(files, { level: 0 }));
    } else {
      file = path.join(EXPORTS_DIR, `${slug(doc.name)}${m === 'slide' ? `-slide-${index + 1}` : ''}-${stamp()}.mp4`);
      await one({ mode: m, index }, file, 0, 1);
    }
    const st = await fsp.stat(file);
    updateJob(job, { status: 'done', progress: 1, message: 'Ready', result: { file: path.basename(file), url: `/exports/${encodeURIComponent(path.basename(file))}`, bytes: st.size } }, `Exported ${path.basename(file)}`);
  })().catch((e) => { if (job.status === 'running') updateJob(job, { status: 'error', error: e.message, message: e.message }, e.stack); });
  return job;
}

export async function exportRoutes(req, res, url, { base }) {
  const p = url.pathname;
  let m;
  if ((m = p.match(/^\/api\/documents\/([\w-]+)\/export$/)) && req.method === 'POST') {
    const body = await readJson(req);
    const job = startExport({ base, docId: m[1], ...body });
    send(res, 202, { jobId: job.id });
    return true;
  }
  if (p === '/api/exports' && req.method === 'GET') {
    fs.mkdirSync(EXPORTS_DIR, { recursive: true });
    const files = (await fsp.readdir(EXPORTS_DIR)).filter((f) => !f.includes('.part') && !f.endsWith('.video.mp4'));
    const out = [];
    for (const f of files) { const st = await fsp.stat(path.join(EXPORTS_DIR, f)); out.push({ file: f, url: `/exports/${encodeURIComponent(f)}`, bytes: st.size, mtime: st.mtimeMs }); }
    send(res, 200, out.sort((a, b) => b.mtime - a.mtime));
    return true;
  }
  if ((m = p.match(/^\/exports\/([^/]+)$/))) {
    const name = path.basename(decodeURIComponent(m[1]));
    if (serveFile(req, res, path.join(EXPORTS_DIR, name), { download: url.searchParams.has('download') ? name : null })) return true;
    send(res, 404, { error: 'Export not found' });
    return true;
  }
  return false;
}
