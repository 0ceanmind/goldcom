// Headless render target used by the server (/api/render, /api/scene-preview) and by Claude Code previews.
//   ?doc=<id>&slide=<n>&t=<sec>&scale=<k>                      one slide of a saved design
//   ?scene=<id>&params=<json>&t=<sec>&w=&h=&theme=&lang=        one 3D scene module on its own (module testing)
import './fonts.js';
import { loadFonts, ImageCache, renderSlide } from './render/renderer.js';
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

(async () => {
  try {
    const q = new URLSearchParams(location.search);
    let doc;
    if (q.get('scene')) doc = sceneDoc(q);
    else {
      const res = await fetch(`/api/documents/${q.get('doc')}`);
      if (!res.ok) throw new Error(`Document not found (${res.status})`);
      doc = normalizeDocument(await res.json());
    }
    const index = Math.min(Number(q.get('slide') || 0), doc.slides.length - 1);
    const scale = Number(q.get('scale') || 1);
    const t = q.has('t') ? Number(q.get('t')) : Infinity;
    await loadFonts();
    const images = new ImageCache();
    await images.preload(doc);
    const cv = document.getElementById('c');
    cv.width = Math.round(doc.width * scale);
    cv.height = Math.round(doc.height * scale);
    const t0 = performance.now();
    renderSlide(cv.getContext('2d'), doc, index, { t, images, scale });
    window.__MS = Math.round(performance.now() - t0);
    const ids = [...new Set(doc.slides[index].layers.filter((l) => l.type === 'scene3d').map((l) => l.scene))];
    const failed = ids.map((id) => [id, sceneRuntime.status(id)]).filter(([, s]) => s.state !== 'ready');
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
