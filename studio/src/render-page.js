// Headless render target used by the server (/api/render) and by Claude Code previews.
import './fonts.js';
import { loadFonts, ImageCache, renderSlide } from './render/renderer.js';
import { normalizeDocument } from '../shared/schema.js';

(async () => {
  try {
    const q = new URLSearchParams(location.search);
    const res = await fetch(`/api/documents/${q.get('doc')}`);
    if (!res.ok) throw new Error(`Document not found (${res.status})`);
    const doc = normalizeDocument(await res.json());
    const index = Math.min(Number(q.get('slide') || 0), doc.slides.length - 1);
    const scale = Number(q.get('scale') || 1);
    const t = q.has('t') ? Number(q.get('t')) : Infinity;
    await loadFonts();
    const images = new ImageCache();
    await images.preload(doc);
    const cv = document.getElementById('c');
    cv.width = Math.round(doc.width * scale);
    cv.height = Math.round(doc.height * scale);
    renderSlide(cv.getContext('2d'), doc, index, { t, images, scale });
    window.__PNG = cv.toDataURL('image/png');
    window.__READY = true;
  } catch (e) {
    window.__ERROR = String(e?.message || e);
  }
})();
