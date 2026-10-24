// Headless render target used by the server (/api/render, video export, contact sheets) and by Claude previews.
//   ?doc=<id>&slide=<n>&t=<sec>&scale=<k>   → window.__PNG for one slide
//   ?doc=<id>&mode=frames&fps=<n>&scale=<k>  → window.__frame(t, slide?, fmt?, quality?) returns a base64 image
import './fonts.js';
import { loadFonts, ImageCache, renderSlide, renderFrame, videoRequests } from './render/renderer.js';
import { FrameSequence, footageIdOf } from './render/media.js';
import { normalizeDocument } from '../shared/schema.js';

async function loadDoc(q) {
  if (window.__DOC) return normalizeDocument(window.__DOC);
  const res = await fetch(`/api/documents/${q.get('doc')}`);
  if (!res.ok) throw new Error(`Document not found (${res.status})`);
  return normalizeDocument(await res.json());
}

const toBase64 = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(blob); });

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
    renderSlide(c, doc, index, { t, images, scale });
    window.__PNG = cv.toDataURL('image/png');
    window.__READY = true;
  } catch (e) {
    window.__ERROR = String(e?.stack || e?.message || e);
  }
})();
