// Shared math, colour and path helpers for the character & prop illustration system.
// Everything here is pure (no globals mutated) so drawing stays deterministic.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, p) => a + (b - a) * p;
export const smooth = (p) => { p = clamp(p); return p * p * (3 - 2 * p); };
export const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
export const wave = (t, period, phase = 0) => Math.sin(((t / period) + phase) * TAU);

/** Small deterministic PRNG (mulberry32). */
export function rng(seed = 1) {
  let a = (Math.floor(seed * 2654435761) ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ---------- colour ----------
const hexCache = new Map();
export function hexRgb(hex) {
  let v = hexCache.get(hex);
  if (v) return v;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  hexCache.set(hex, v);
  return v;
}
const toHex = (r, g, b) => '#' + [r, g, b].map((x) => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, '0')).join('');
/** Mix two hex colours (p = 0 → a, 1 → b). */
export function mix(a, b, p) {
  const A = hexRgb(a), B = hexRgb(b);
  return toHex(lerp(A[0], B[0], p), lerp(A[1], B[1], p), lerp(A[2], B[2], p));
}
export function rgba(hex, a) { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; }
/** Darken (amt < 0) or lighten (amt > 0) towards black / white. */
export const tone = (hex, amt) => (amt < 0 ? mix(hex, '#000000', -amt) : mix(hex, '#FFFFFF', amt));
/** Pull a colour towards a target (used to desaturate and harmonise sets with a theme). */
export const toward = (hex, target, p) => mix(hex, target, p);

// ---------- geometry ----------
export const v = (x, y) => ({ x, y });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const scl = (a, k) => ({ x: a.x * k, y: a.y * k });
export const len = (a) => Math.hypot(a.x, a.y);
export const norm = (a) => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
export const perp = (a) => ({ x: -a.y, y: a.x });
export const rot = (a, ang) => { const c = Math.cos(ang), s = Math.sin(ang); return { x: a.x * c - a.y * s, y: a.x * s + a.y * c }; };
export const angOf = (a) => Math.atan2(a.y, a.x);
export const mid = (a, b, p = 0.5) => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) });

/** Two-bone IK. Returns the elbow position for shoulder S → target T. bend = ±1 picks the side. */
export function ik(S, T, L1, L2, bend = 1) {
  const d0 = sub(T, S);
  let d = len(d0);
  const maxD = L1 + L2 - 0.5;
  const minD = Math.abs(L1 - L2) + 1;
  d = clamp(d, minD, maxD);
  const dir = norm(d0);
  const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const e = add(S, scl(rot(dir, a * bend), L1));
  const w = add(S, scl(dir, d));
  return { elbow: e, wrist: w };
}

// ---------- paths ----------
/** Tapered capsule from a (radius ra) to b (radius rb), appended to a Path2D. */
export function tube(p, a, b, ra, rb, capA = 'round', capB = 'round') {
  const d = sub(b, a);
  const L = len(d) || 0.001;
  const u = scl(d, 1 / L);
  const n = perp(u);
  // tangent offset for unequal radii
  const s = clamp((ra - rb) / L, -0.95, 0.95);
  const c = Math.sqrt(1 - s * s);
  const na = add(scl(n, c), scl(u, s));
  const nb = add(scl(n, -c), scl(u, s));
  const ang = angOf(u);
  const off = Math.asin(s);
  p.moveTo(a.x + na.x * ra, a.y + na.y * ra);
  p.lineTo(b.x + na.x * rb, b.y + na.y * rb);
  if (capB === 'round') p.arc(b.x, b.y, rb, ang + Math.PI / 2 - off, ang - Math.PI / 2 + off, true);
  else p.lineTo(b.x + nb.x * rb, b.y + nb.y * rb);
  p.lineTo(a.x + nb.x * ra, a.y + nb.y * ra);
  if (capA === 'round') p.arc(a.x, a.y, ra, ang - Math.PI / 2 + off, ang + Math.PI / 2 - off, true);
  p.closePath();
  return p;
}

export function rrect(p, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  p.moveTo(x + r, y);
  p.arcTo(x + w, y, x + w, y + h, r);
  p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r);
  p.arcTo(x, y, x + w, y, r);
  p.closePath();
  return p;
}

/** Rounded rect with a 45° chamfer on the top-right corner (the brand "facet corner"). */
export function facetRect(p, x, y, w, h, r, f) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  f = Math.min(f, w / 2, h / 2);
  p.moveTo(x + r, y);
  p.lineTo(x + w - f, y);
  p.lineTo(x + w, y + f);
  p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r);
  p.arcTo(x, y, x + w, y, r);
  p.closePath();
  return p;
}

export function ellipse(p, x, y, rx, ry, a = 0) { p.moveTo(x + rx * Math.cos(a), y + rx * Math.sin(a)); p.ellipse(x, y, rx, ry, a, 0, TAU); p.closePath(); return p; }
export function circle(p, x, y, r) { p.moveTo(x + r, y); p.arc(x, y, r, 0, TAU); p.closePath(); return p; }
/** Closed polygon through points ([x,y] pairs). */
export function poly(p, pts) { p.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]); p.closePath(); return p; }
/** Smooth closed shape through points (Catmull-Rom → bezier). tension 0..1 */
export function blob(p, pts, tension = 0.5, closed = true) {
  const n = pts.length;
  const P = (i) => (closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)]);
  p.moveTo(pts[0][0], pts[0][1]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const k = tension / 3 * 2;
    p.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * k / 2, p1[1] + (p2[1] - p0[1]) * k / 2, p2[0] - (p3[0] - p1[0]) * k / 2, p2[1] - (p3[1] - p1[1]) * k / 2, p2[0], p2[1]);
  }
  if (closed) p.closePath();
  return p;
}

/**
 * Smooth path through points [x, y, k?] (Catmull-Rom → bezier). k = per-point tension
 * (1 = smooth, 0 = sharp corner). Points may also be {x, y, k} objects.
 */
export function spline(p, pts, closed = true, move = true) {
  const P = pts.map((q) => (Array.isArray(q) ? q : [q.x, q.y, q.k]));
  const n = P.length;
  const get = (i) => (closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
  if (move) p.moveTo(P[0][0], P[0][1]); else p.lineTo(P[0][0], P[0][1]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const k1 = (p1[2] ?? 1) / 6, k2 = (p2[2] ?? 1) / 6;
    p.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) * k1, p1[1] + (p2[1] - p0[1]) * k1,
      p2[0] - (p3[0] - p1[0]) * k2, p2[1] - (p3[1] - p1[1]) * k2,
      p2[0], p2[1],
    );
  }
  if (closed) p.closePath();
  return p;
}
/** [x, y, k] helper from a point. */
export const pk = (q, k = 1) => [q.x, q.y, k];

// ---------- shading ----------
/**
 * Flat 2–3 tone fill. Fills `path` with `base`, then (inside the shape) a shadow crescent on the
 * side away from the light and an optional thin highlight on the lit side. Uses nested clips (not
 * even-odd) so unions of overlapping sub-paths shade as one shape.
 * light: {x, y} vector pointing *towards* the light (screen space, upper-left by default).
 */
export function shade(c, path, base, { shadow, hi, depth = 10, hiDepth = 0, light = { x: -1, y: -0.6 }, fillRule = 'nonzero' } = {}) {
  if (!shadow && !(hi && hiDepth > 0)) { c.fillStyle = base; c.fill(path, fillRule); return; }
  c.save();
  c.clip(path, fillRule);
  c.fillStyle = shadow || base;
  c.fill(path, fillRule);
  const ax = shadow ? light.x * depth : 0, ay = shadow ? light.y * depth : 0;
  c.translate(ax, ay); // A = path moved towards the light: everything outside it stays in shadow
  if (hi && hiDepth > 0) {
    c.fillStyle = hi;
    c.fill(path, fillRule);
    c.clip(path, fillRule);
    c.translate(-ax - light.x * hiDepth, -ay - light.y * hiDepth); // B = path moved away from the light
  }
  c.fillStyle = base;
  c.fill(path, fillRule);
  c.restore();
}

/** Fill only the part of `path` inside `clipPath`. */
export function fillIn(c, clipPath, path, color, rule = 'nonzero') {
  c.save();
  c.clip(clipPath);
  c.fillStyle = color;
  c.fill(path, rule);
  c.restore();
}

/** Soft ground shadow ellipse. */
export function groundShadow(c, x, y, rx, ry, alpha = 0.22, col = '#000000') {
  if (rx <= 0 || ry <= 0) return;
  c.save();
  c.translate(x, y);
  c.scale(1, ry / rx);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, rgba(col, alpha));
  g.addColorStop(0.55, rgba(col, alpha * 0.6));
  g.addColorStop(1, rgba(col, 0));
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, rx, 0, TAU);
  c.fill();
  c.restore();
}

/** Fit a content box of aspect (w/h) inside box. align: 'bottom' | 'center'. Returns {x, y, s} where s = scale for unit-height content. */
export function fitBox(box, aspect, align = 'center') {
  const bw = box.w, bh = box.h;
  let h = bh, w = h * aspect;
  if (w > bw) { w = bw; h = w / aspect; }
  const x = box.x + (bw - w) / 2;
  const y = align === 'bottom' ? box.y + bh - h : box.y + (bh - h) / 2;
  return { x, y, w, h };
}
