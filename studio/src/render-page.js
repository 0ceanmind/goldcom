// Headless render target used by the server (/api/render, video export, scene previews, contact sheets) and by Claude previews.
//   ?doc=<id>&slide=<n>&t=<sec>&scale=<k>                 → window.__PNG for one slide
//   ?doc=<id>&mode=frames&fps=<n>&scale=<k>                → window.__frame(t, slide?, fmt?, quality?) returns a base64 image
//   ?scene=<id>&params=<json>&t=<sec>&w=&h=&theme=&lang=   → one 3D scene module on its own (module testing)
import './fonts.js';
import { loadFonts, ImageCache, renderSlide, renderFrame, videoRequests } from './render/renderer.js';
import { FrameSequence, footageIdOf } from './render/media.js';
import { sceneRuntime } from './render/scene3d/runtime.js';
import { normalizeDocument, createDocument, createSlide, layerDefaults } from '../shared/schema.js';

function sceneDoc(q) {
  const w = Number(q.get('w') || 1080), h = Number(q.get('h') || 1350);
  const doc = createDocument({ name: 'scene test', lang: q.get('lang') || 'en' });
  doc.width = w; doc.height = h;
  let params = {};
  try { params = JSON.parse(q.get('params') || '{}'); } catch { /* ignore */ }
  const layer = { ...layerDefaults('scene3d'), id: 'l_test', scene: q.get('scene'), params, w, h, transparent: q.get('transparent') === '1' };
  if (q.has('focusY')) layer.focusY = Number(q.get('focusY'));
  try { if (q.get('post')) layer.post = JSON.parse(q.get('post')); } catch { /* ignore */ }
  doc.slides = [createSlide({ theme: q.get('theme') || 'onyx', pattern: 'none', duration: Number(q.get('dur') || 6), layers: [layer] })];
  return normalizeDocument(doc);
}

async function loadDoc(q) {
  if (q.get('scene')) return sceneDoc(q);
  if (window.__DOC) return normalizeDocument(window.__DOC);
  const res = await fetch(`/api/documents/${q.get('doc')}`);
  if (!res.ok) throw new Error(`Document not found (${res.status})`);
  return normalizeDocument(await res.json());
}

(async () => {
  try {
    const q = new URLSearchParams(location.search);
    const doc = await loadDoc(q);
    const scale = Number(q.get('scale') || 1);
    const fps = Number(q.get('fps') || doc.fps || 30);
    await loadFonts();
    const media = new FrameSequence(fps);
    const images = new ImageCache(null, media);
    await images.preload(doc);
    const ids = new Set();
    for (const s of doc.slides) for (const l of s.layers) { const id = footageIdOf(l.src); if (id) ids.add(id); }
    await media.loadMeta(ids);
    const cv = document.getElementById('c');
    cv.width = Math.round(doc.width * scale);
    cv.height = Math.round(doc.height * scale);
    const c = cv.getContext('2d');

    if (q.get('mode') === 'frames') {
      window.__frame = async (t, slide = null, fmt = 'jpeg', quality = 0.95) => {
        await media.ensure(videoRequests(doc, t, slide));
        const t0 = performance.now();
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.fillStyle = '#151513'; c.fillRect(0, 0, cv.width, cv.height);
        if (slide === null || slide === undefined) renderFrame(c, doc, t, { images, scale });
        else renderSlide(c, doc, slide, { t, images, scale });
        const t1 = performance.now();
        const b64 = cv.toDataURL(fmt === 'png' ? 'image/png' : 'image/jpeg', quality).split(',')[1];
        window.__timing = { draw: t1 - t0, encode: performance.now() - t1 };
        return b64;
      };
      window.__READY = true;
      return;
    }

    const index = Math.min(Number(q.get('slide') || 0), doc.slides.length - 1);
    const t = q.has('t') ? Number(q.get('t')) : Infinity;
    await media.ensure(videoRequests(doc, Number.isFinite(t) ? t : Infinity, index));
    const t0 = performance.now();
    renderSlide(c, doc, index, { t, images, scale });
    window.__MS = Math.round(performance.now() - t0);
    const sceneIds = [...new Set(doc.slides[index].layers.filter((l) => l.type === 'scene3d').map((l) => l.scene))];
    const failed = sceneIds.map((id) => [id, sceneRuntime.status(id)]).filter(([, s]) => s.state !== 'ready');
    // Make sure error reports reach the server (they start self-repair) before the page is closed.
    await Promise.race([Promise.allSettled(sceneRuntime.pendingReports), new Promise((r) => setTimeout(r, 1500))]);
    if (failed.length && q.get('scene')) throw new Error(failed.map(([id, s]) => `${id}: ${s.message || s.state}`).join('; '));
    window.__WARN = failed.map(([id, s]) => `${id}: ${s.message || s.state}`);
    window.__PNG = cv.toDataURL('image/png');
    window.__READY = true;
  } catch (e) {
    window.__ERROR = String(e?.stack || e?.message || e);
  }
})();
