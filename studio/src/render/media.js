// Video frame providers for the renderer.
// The editor plays footage through <video> elements; the headless exporter draws pre-extracted JPEG frames
// so every exported frame is exact. Both expose frame(src, time) → a drawable or null.

const isVideoSrc = (src) => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(String(src || '')) || /^\/footage\/[^/]+\/video/.test(String(src || ''));
export { isVideoSrc };

/** Footage id from a studio footage URL (/footage/<id>/video.mp4). */
export const footageIdOf = (src) => (String(src || '').match(/^\/footage\/([\w-]+)\//) || [])[1] || null;

/** Live playback in the editor. */
export class VideoPool {
  constructor(onFrame) {
    this.map = new Map();
    this.onFrame = onFrame;
    this.playing = false;
  }

  el(src) {
    let v = this.map.get(src);
    if (!v) {
      v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
      v.src = src;
      v.addEventListener('seeked', () => this.onFrame?.(src));
      v.addEventListener('loadeddata', () => this.onFrame?.(src));
      this.map.set(src, v);
    }
    return v;
  }

  /**
   * Drawable for src at footage time `time` (seconds). When successive requests advance at playback speed the
   * element plays natively (smooth); otherwise it seeks (scrubbing, stills). `rate` is the footage speed.
   */
  frame(src, time, rate = 1) {
    if (!src) return null;
    const v = this.el(src);
    const dur = v.duration || Infinity;
    const target = Math.max(0, Math.min(time, dur - 0.04));
    const now = performance.now() / 1000;
    const st = v.__gc || (v.__gc = { wall: 0, t: -9 });
    const dt = now - st.wall;
    const smooth = rate > 0 && rate <= 4 && dt < 0.3 && Math.abs((target - st.t) - dt * rate) < 0.12;
    st.wall = now; st.t = target;
    if (this.playing || smooth) {
      if (v.paused) { v.playbackRate = rate || 1; if (Math.abs(v.currentTime - target) > 0.08) v.currentTime = target; v.play().catch(() => {}); }
      else {
        if (Math.abs(v.playbackRate - rate) > 0.01) v.playbackRate = rate;
        if (Math.abs(v.currentTime - target) > 0.25) v.currentTime = target;
      }
      // Pause once requests stop (playback ended or the preview closed).
      clearTimeout(st.idle);
      st.idle = setTimeout(() => { if (!v.paused) v.pause(); }, 350);
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - target) > 1 / 60 && !v.seeking) v.currentTime = target;
    }
    return v.readyState >= 2 ? v : null;
  }

  setPlaying(on) {
    this.playing = on;
    if (!on) for (const v of this.map.values()) if (!v.paused) v.pause();
  }

  dispose() { for (const v of this.map.values()) { v.pause(); v.removeAttribute('src'); v.load(); } this.map.clear(); }
}

/**
 * Exact frames for export: frames are JPEGs extracted by the server at the document fps
 * (/footage/<id>/frames/<fps>/<n>.jpg, n from 1). Call `await ensure(list)` before drawing a frame.
 */
export class FrameSequence {
  constructor(fps = 30) {
    this.fps = fps;
    this.cache = new Map();
    this.order = [];
    this.meta = new Map();
  }

  key(src, time) {
    const id = footageIdOf(src);
    if (!id) return null;
    const m = this.meta.get(id);
    const max = m ? Math.max(1, Math.floor(m.duration * this.fps)) : Infinity;
    const n = Math.max(1, Math.min(max, Math.round(time * this.fps) + 1));
    return `/footage/${id}/frames/${this.fps}/${n}.jpg`;
  }

  async loadMeta(ids) {
    await Promise.all([...ids].filter((id) => !this.meta.has(id)).map(async (id) => {
      try { const r = await fetch(`/api/footage/${id}`); if (r.ok) this.meta.set(id, await r.json()); } catch { /* frames still load */ }
    }));
  }

  async ensure(requests) {
    const keys = requests.map(([src, time]) => this.key(src, time)).filter(Boolean);
    await Promise.all(keys.filter((k) => !this.cache.has(k)).map(async (k) => {
      const p = fetch(k).then((r) => (r.ok ? r.blob() : null)).then((b) => (b ? createImageBitmap(b) : null)).catch(() => null);
      this.cache.set(k, p);
      const bmp = await p;
      this.cache.set(k, bmp);
      this.order.push(k);
      while (this.order.length > 90) { const old = this.order.shift(); const b = this.cache.get(old); if (b?.close) b.close(); this.cache.delete(old); }
    }));
  }

  frame(src, time) {
    const k = this.key(src, time);
    const v = k && this.cache.get(k);
    return v && !(v instanceof Promise) ? v : null;
  }

  setPlaying() {}
}
