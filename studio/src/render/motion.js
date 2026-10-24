// Motion primitives: easing curves, keyframe tracks and camera moves.
// Keyframes live on a layer as `keys: [{ t, ease, x, y, w, h, scale, rotation, opacity, blur, rx, ry }]`
// (any subset of properties per key, times in slide-local seconds). A camera lives on a slide as
// `camera: [{ t, x, y, zoom, ease }]` where (x, y) is the point of the canvas kept at the centre of the frame.

export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

// Cubic-bezier easing (CSS semantics), solved with Newton iterations + bisection fallback.
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-5) return sy(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0, hi = 1; t = x;
    for (let i = 0; i < 20; i++) { const v = sx(t); if (Math.abs(v - x) < 1e-5) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return sy(t);
  };
}

// Damped spring settling to 1 (overshoot controlled by damping).
const spring = (damping = 0.55, freq = 3.2) => (p) => {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const w = freq * 2 * Math.PI;
  const decay = Math.exp(-damping * w * p * 0.5);
  const v = 1 - decay * Math.cos(w * p * Math.sqrt(1 - Math.min(0.99, damping * damping)));
  // Blend into exactly 1 at the end so long springs never pop.
  return v + (1 - v) * Math.pow(p, 6);
};

export const EASE = {
  linear: (p) => p,
  in: bezier(0.42, 0, 1, 1),
  out: bezier(0, 0, 0.2, 1),
  inOut: bezier(0.65, 0, 0.35, 1),
  // Premium motion curves: quick start, long silky settle.
  smooth: bezier(0.45, 0, 0.15, 1),
  expoOut: bezier(0.16, 1, 0.3, 1),
  expoInOut: bezier(0.87, 0, 0.13, 1),
  quartOut: bezier(0.25, 1, 0.5, 1),
  backOut: bezier(0.34, 1.45, 0.64, 1),
  anticipate: bezier(0.68, -0.35, 0.32, 1.2),
  spring: spring(0.5, 2.6),
  springSoft: spring(0.7, 1.8),
  hold: (p) => (p >= 1 ? 1 : 0),
};
export const easeFn = (name) => (typeof name === 'function' ? name : EASE[name] || EASE.smooth);

const PROPS = ['x', 'y', 'w', 'h', 'scale', 'rotation', 'opacity', 'blur', 'rx', 'ry', 'zoom'];

/** Value of one property at time t from a key list (keys sorted by t). Returns undefined if no key defines it. */
export function trackValue(keys, prop, t) {
  let prev = null, next = null;
  for (const k of keys) {
    if (k[prop] === undefined || k[prop] === null) continue;
    if (k.t <= t) prev = k;
    else { next = k; break; }
  }
  if (!prev && !next) return undefined;
  if (!prev) return next[prop];
  if (!next) return prev[prop];
  const span = next.t - prev.t;
  const p = span <= 0 ? 1 : easeFn(next.ease)((t - prev.t) / span);
  return prev[prop] + (next[prop] - prev[prop]) * p;
}

/** All keyed properties of a layer at time t. */
export function evalKeys(keys, t) {
  if (!keys?.length || !Number.isFinite(t)) return null;
  const sorted = keys.length > 1 && keys.some((k, i) => i && k.t < keys[i - 1].t) ? [...keys].sort((a, b) => a.t - b.t) : keys;
  const out = {};
  let any = false;
  for (const p of PROPS) {
    const v = trackValue(sorted, p, t);
    if (v !== undefined) { out[p] = v; any = true; }
  }
  return any ? out : null;
}

/** Camera state at time t: { x, y, zoom } in canvas units, or null for no camera. */
export function evalCamera(camera, t, W, H) {
  if (!camera?.length) return null;
  const tt = Number.isFinite(t) ? t : camera[camera.length - 1].t;
  const keys = camera.length > 1 && camera.some((k, i) => i && k.t < camera[i - 1].t) ? [...camera].sort((a, b) => a.t - b.t) : camera;
  const x = trackValue(keys, 'x', tt) ?? W / 2;
  const y = trackValue(keys, 'y', tt) ?? H / 2;
  const zoom = Math.max(0.2, trackValue(keys, 'zoom', tt) ?? 1);
  if (Math.abs(zoom - 1) < 1e-4 && Math.abs(x - W / 2) < 0.01 && Math.abs(y - H / 2) < 0.01) return null;
  return { x, y, zoom };
}

/** Apply a camera to a 2D context (after the base scale transform). */
export function applyCamera(c, cam, W, H) {
  if (!cam) return;
  c.translate(W / 2, H / 2);
  c.scale(cam.zoom, cam.zoom);
  c.translate(-cam.x, -cam.y);
}

/** Piecewise-linear time map [[t, value], ...] (used to remap slide time to footage time: holds, speed ramps). */
export function mapTime(map, t) {
  if (!map?.length) return t;
  if (t <= map[0][0]) return map[0][1] + (map.length > 1 ? 0 : t - map[0][0]);
  for (let i = 1; i < map.length; i++) {
    const [t0, v0] = map[i - 1], [t1, v1] = map[i];
    if (t <= t1) return t1 === t0 ? v1 : v0 + ((t - t0) / (t1 - t0)) * (v1 - v0);
  }
  const [tl, vl] = map[map.length - 1];
  const [tp, vp] = map.length > 1 ? map[map.length - 2] : [tl - 1, vl - 1];
  const rate = tl === tp ? 0 : (vl - vp) / (tl - tp);
  return vl + (t - tl) * rate;
}

/** A gentle "Screen Studio" style camera: zoom towards each focus point, hold, ease back out. */
export function autoCamera(focus, { W, H, zoom = 1.6, lead = 0.45, hold = 1.2, release = 0.6, base = { x: W / 2, y: H / 2, zoom: 1 } } = {}) {
  const keys = [{ t: 0, ...base, ease: 'smooth' }];
  let lastOut = 0;
  for (const f of focus) {
    const tIn = Math.max(lastOut, f.t - lead);
    const tHold = f.t + (f.hold ?? hold);
    const z = f.zoom || zoom;
    // Keep the zoomed frame inside the canvas.
    const half = (v, dim) => clamp(v, dim / (2 * z), dim - dim / (2 * z));
    keys.push({ t: tIn, x: keys[keys.length - 1].x, y: keys[keys.length - 1].y, zoom: keys[keys.length - 1].zoom, ease: 'smooth' });
    keys.push({ t: f.t, x: half(f.x, W), y: half(f.y, H), zoom: z, ease: 'smooth' });
    keys.push({ t: tHold, x: half(f.x, W), y: half(f.y, H), zoom: z, ease: 'linear' });
    if (!f.chain) {
      keys.push({ t: tHold + release, ...base, ease: 'smooth' });
      lastOut = tHold + release;
    } else lastOut = tHold;
  }
  return keys;
}
