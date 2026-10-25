// Stylized 3D people for Goldcom scenes.
// The look is a soft-matte "designer figure": clean volumes, real fabric sheen and folds, Omani dress, and a calm,
// restrained face (eyes with lids that blink, brows, a small mouth) that carries the mood together with the body.
// Motion follows how people move: gestures start from rest and travel in arcs, hands follow the arm a beat later,
// idle drift never repeats, gaze shifts with eased holds. Built from the same spec as the illustrated characters:
//   { gender, outfit, headwear, age, skin, pose, mood, prop, facing, beard, seed, robe, scarf, accent, glasses }
// Units are metres. The figure stands on y = 0 and faces +z; its right hand is on -x.
// Robe and sleeves are skinned meshes (waist and elbows bend like cloth); arms are posed with two-bone IK.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SKIN, HAIR, FABRIC } from '../characters/palette.js';
import { COLORS } from '../../../shared/brand.js';
import { canvasTexture, reliefMaps, drawSymbol, drawText, materials, barGeometry, barStamp, GOLD } from './kit.js';

const TAU = Math.PI * 2;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const mix = (a, b, p) => a + (b - a) * p;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const rnd = (seed) => { const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
const wave = (t, period, ph = 0) => Math.sin((t / period) * TAU + ph);
// Deterministic timing. Everything is a function of t, so exports can jump to any frame.
const easeIO = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const easeOut3 = (x) => 1 - (1 - clamp(x)) ** 3;
/** Attack-hold-release envelope: 0 → 1 over a, holds for h, back to 0 over r (eased). */
const env = (x, a, h, r) => (x < 0 ? 0 : x < a ? easeIO(x / a) : x < a + h ? 1 : x < a + h + r ? 1 - easeIO((x - a - h) / r) : 0);
/** Smooth drift in about -1..1 from incommensurate sines (never visibly repeats); periodic over `period` when looping. */
function drift(t, seed, rate = 1, period = 0) {
  const p1 = rnd(seed) * TAU, p2 = rnd(seed + 1.7) * TAU, p3 = rnd(seed + 3.1) * TAU;
  if (period) { const w = TAU / period; return 0.55 * Math.sin(w * t + p1) + 0.3 * Math.sin(2 * w * t + p2) + 0.15 * Math.sin(3 * w * t + p3); }
  return 0.55 * Math.sin(t * 0.83 * rate + p1) + 0.3 * Math.sin(t * 1.91 * rate + p2) + 0.15 * Math.sin(t * 3.37 * rate + p3);
}
/** Irregular events (glances, blinks, waves): time since the latest event started (-1 before the first) and its index. */
function lastEvent(t, seed, gapMin, gapMax, first = 0.6, period = 0) {
  if (period && t >= first) t = first + ((t - first) % period);
  if (t < first) return { dt: -1, i: -1 };
  let start = first, i = 0;
  for (; i < 500; i++) {
    const g = gapMin + rnd(seed * 13.1 + i * 7.7) * (gapMax - gapMin);
    if (start + g > t) break;
    start += g;
  }
  return { dt: t - start, i };
}
const hex = (token, fallback) => (token && String(token).startsWith('#') ? token : COLORS[token] || FABRIC[token]?.base || fallback);

// ---------- shared surfaces (cached: the textures are re-uploaded automatically if a scene disposes them) ----------
const CACHE = new Map();
const cached = (key, make) => { if (!CACHE.has(key)) CACHE.set(key, make()); return CACHE.get(key); };

/** Soft vertical drape folds, denser and deeper towards the hem (texture bottom = hem). */
function foldMaps(kind = 'robe') {
  return cached(`folds:${kind}`, () => reliefMaps((c, w, h) => {
    const n = kind === 'sleeve' ? 14 : kind === 'scarf' ? 18 : 34;
    for (let i = 0; i < n; i++) {
      const x = rnd(i * 3.1 + (kind === 'scarf' ? 7 : 1)) * w;
      const fw = (kind === 'robe' ? 10 : 7) + rnd(i * 1.7) * (kind === 'robe' ? 26 : 14);
      const reach = kind === 'robe' ? 0.35 + rnd(i * 5.3) * 0.6 : 0.5 + rnd(i * 2.2) * 0.5;
      const top = h * (1 - reach);
      for (const ox of [-w, 0, w]) {
        const g = c.createLinearGradient(x + ox - fw, 0, x + ox + fw, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        const v = c.createLinearGradient(0, top, 0, h);
        v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(1, 'rgba(0,0,0,0)');
        c.globalAlpha = 0.35 + rnd(i * 9.1) * 0.45;
        c.fillStyle = g;
        c.fillRect(x + ox - fw, top, fw * 2, h - top);
        c.globalAlpha = 1;
        // Fade the top end of each fold so it melts into the fabric.
        c.fillStyle = v;
        c.globalCompositeOperation = 'multiply';
        c.fillRect(x + ox - fw, top, fw * 2, (h - top) * 0.35);
        c.globalCompositeOperation = 'source-over';
      }
    }
  }, { w: 512, h: 512, strength: kind === 'robe' ? 1.6 : 1.1, blur: 5, fieldRoughness: 0.84, raisedRoughness: 0.8 }));
}

function fabric(color, { satin = false, folds = 'robe', normalScale = 0.6, map = null, metalnessMap = null } = {}) {
  const c = new THREE.Color(color);
  const lum = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
  const maps = folds ? foldMaps(folds) : null;
  return new THREE.MeshPhysicalMaterial({
    color: c, map, metalnessMap, metalness: metalnessMap ? 1 : 0,
    roughness: satin ? 0.46 : 0.86,
    sheen: satin ? (lum > 0.5 ? 0.45 : 0.9) : lum > 0.5 ? 0.4 : 0.75, sheenRoughness: satin ? 0.32 : 0.55,
    sheenColor: c.clone().lerp(new THREE.Color('#FFFFFF'), lum > 0.5 ? 0.2 : satin ? 0.35 : 0.55).multiplyScalar(lum < 0.2 ? 0.6 : 1),
    normalMap: maps?.normalMap || null, normalScale: new THREE.Vector2(normalScale, normalScale),
    envMapIntensity: satin ? 1 : 0.85,
  });
}

const skinMat = (tone) => new THREE.MeshPhysicalMaterial({
  color: (SKIN[tone] || SKIN.medium).base, roughness: 0.6, metalness: 0,
  sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color('#FFD2B4'), envMapIntensity: 0.8,
});

const hairMat = (c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.78, sheen: 0.6, sheenRoughness: 0.4, sheenColor: new THREE.Color(c).lerp(new THREE.Color('#FFFFFF'), 0.25), envMapIntensity: 0.6 });

// ---------- geometry helpers ----------
/** Smooth profile through control points [r, y] (bottom → top), evenly re-spaced so textures do not stretch. */
function profile(pts, n = 64) {
  const curve = new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y)));
  return curve.getSpacedPoints(n);
}

/**
 * Lathe with an elliptical cross-section: depth(y) squashes z, front(y) pushes the front out (chest).
 * The seam sits at the back (phiStart = π) so trims and plackets can run down the front at u = 0.5.
 */
function ovalLathe(points, { segments = 64, depth = () => 0.62, front = () => 0, ripple = null } = {}) {
  const g = new THREE.LatheGeometry(points, segments, Math.PI, TAU);
  const p = g.attributes.position, nrm = g.attributes.normal;
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); n.fromBufferAttribute(nrm, i);
    const phi = Math.atan2(v.x, v.z);
    if (ripple) { const k = 1 + ripple(v.y, phi); v.x *= k; v.z *= k; }
    const d = depth(v.y);
    v.z *= d;
    if (v.z > 0) v.z += front(v.y) * Math.cos(phi) ** 2;
    n.z /= d; n.normalize();
    p.setXYZ(i, v.x, v.y, v.z); nrm.setXYZ(i, n.x, n.y, n.z);
  }
  return g;
}

/** Skin weights for up to three bones from a per-vertex function returning [i0, w0, i1, w1]. */
function weigh(g, fn) {
  const p = g.attributes.position;
  const idx = new Uint16Array(p.count * 4), wt = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) {
    const [a, wa, b, wb] = fn(p.getX(i), p.getY(i), p.getZ(i));
    idx[i * 4] = a; idx[i * 4 + 1] = b; wt[i * 4] = wa; wt[i * 4 + 1] = wb;
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wt, 4));
  return g;
}

/** Head shape: a unit-sphere point → an ellipsoid that narrows towards a gentle jaw, chin forward a touch. */
function headShape(x, y, z, rx, ry, rz, taper) {
  const k = y < 0 ? 1 - taper * (-y) ** 1.6 : 1 - 0.04 * y * y;
  const X = x * rx * k, Z0 = z * rz * (y < 0 ? 1 - taper * 0.6 * (-y) ** 1.6 : 1), Y = y * ry;
  return [X, Y, Z0 > 0 && Y < 0 ? Z0 + rz * 0.06 * Math.sin(Math.PI * clamp(-Y / ry)) : Z0];
}
function headGeometry(rx, ry, rz, taper = 0.2, seg = 48) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, ...headShape(p.getX(i), p.getY(i), p.getZ(i), rx, ry, rz, taper));
  g.computeVertexNormals();
  return g;
}

// ---------- face ----------
// A restrained face drawn into a texture that wraps the front of the head, in real human proportions: eyes with
// the white, iris and pupil whose lids blink and narrow, tapered brows, lips with a soft line (and a trimmed beard). Expressions stay subtle: no grins,
// no blush, no cartoon mouths. Features are defined in metres on the head and mapped onto the curved surface,
// so they keep their shape at any angle. The texture redraws only when the face changes.
const FACE_MOODS = {
  // by brow raise · bi inner-brow raise · lid upper lid (0 open … 1 closed) · sq lower-lid squint · es eye scale
  // mc mouth curve (+ smile, - down) · mw mouth width · mo mouth open · ms mouth shift sideways · asym one-brow raise
  neutral: { by: 0, bi: 0, lid: 0.16, sq: 0, es: 1, mc: 0.14, mw: 1, mo: 0, ms: 0, asym: 0 },
  happy: { by: 0.0007, bi: -0.0005, lid: 0.12, sq: 0.3, es: 1, mc: 0.95, mw: 1.12, mo: 0, ms: 0, asym: 0 },
  worried: { by: 0.0004, bi: 0.0034, lid: 0.1, sq: 0, es: 1.03, mc: -0.5, mw: 0.86, mo: 0, ms: 0.0012, asym: 0 },
  surprised: { by: 0.004, bi: 0.001, lid: 0, sq: 0, es: 1.12, mc: 0, mw: 0.62, mo: 0.55, ms: 0, asym: 0 },
  calm: { by: -0.0003, bi: 0, lid: 0.34, sq: 0.14, es: 1, mc: 0.5, mw: 1, mo: 0, ms: 0, asym: 0 },
  proud: { by: 0.0004, bi: -0.0008, lid: 0.34, sq: 0.12, es: 1, mc: 0.62, mw: 1.06, mo: 0, ms: 0.0006, asym: 0.25 },
  thinking: { by: 0.0008, bi: 0, lid: 0.24, sq: 0, es: 1, mc: -0.12, mw: 0.8, mo: 0, ms: 0.0034, asym: 1 },
};
const range = (a, b, n, f) => Array.from({ length: n + 1 }, (_, i) => f(a + ((b - a) * i) / n));
const lerpMood = (a, b, k) => Object.fromEntries(Object.keys(a).map((key) => [key, mix(a[key], b[key], k)]));

/**
 * Face rig on an ellipsoid head (rx, ry, rz, taper) centred at `centre` in the parent's space.
 * layout (metres from the head centre): eye { dx, dy, w, h }, brow { dy, inner, len }, mouth { dy, w }.
 * Returns { mesh, set({ mood, blink, look }) }.
 */
function faceRig({ rx, ry, rz, taper, centre, layout, skin, brow, beard = null, woman = false, minimal = false, iris = '#4A2F1E' }) {
  const PH = 1.32, T0 = 0.95, T1 = 2.92, W = 768, H = 768;
  const geo = new THREE.SphereGeometry(1, 96, 80, Math.PI / 2 - PH, PH * 2, T0, T1 - T0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = headShape(p.getX(i), p.getY(i), p.getZ(i), rx, ry, rz, taper);
    p.setXYZ(i, x * 1.003, y * 1.003, z * 1.003);
  }
  geo.computeVertexNormals();
  const tex = canvasTexture(W, H);
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.55, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(centre);
  mesh.renderOrder = 2;
  const c = tex.userData.ctx;
  // Head-local metres → canvas pixels (inverts the sphere mapping and the jaw taper).
  const P = (x, y) => {
    const uy = clamp(y / ry, -0.995, 0.995);
    const th = Math.acos(uy);
    const k = uy < 0 ? 1 - taper * (-uy) ** 1.6 : 1 - 0.04 * uy * uy;
    const phi = Math.acos(clamp(-x / (rx * k * Math.sin(th)), -1, 1));
    return [((phi - (Math.PI / 2 - PH)) / (2 * PH)) * W, ((th - T0) / (T1 - T0)) * H];
  };
  const ppm = (x, y) => P(x + 0.0005, y)[0] - P(x - 0.0005, y)[0]; // pixels per millimetre across
  const tone = SKIN[skin] || SKIN.medium;
  const dark = new THREE.Color(tone.deep).lerp(new THREE.Color('#2A1C14'), 0.45).getStyle();
  const path = (pts) => { c.beginPath(); pts.forEach(([x, y], i) => { const [X, Y] = P(x, y); if (i) c.lineTo(X, Y); else c.moveTo(X, Y); }); };
  const stroke = (pts, width, color, alpha = 1) => {
    c.save(); c.globalAlpha = alpha; c.strokeStyle = color; c.lineCap = 'round'; c.lineJoin = 'round';
    c.lineWidth = width * 1000 * ppm(pts[0][0], pts[0][1]); path(pts); c.stroke(); c.restore();
  };
  const fill = (pts, color, alpha = 1, blur = 0) => { c.save(); c.globalAlpha = alpha; if (blur) c.filter = `blur(${blur}px)`; path(pts); c.closePath(); c.fillStyle = color; c.fill(); c.restore(); };
  const range = (a, b, n, f) => Array.from({ length: n + 1 }, (_, i) => f(a + ((b - a) * i) / n));
  let last = '';

  function drawBeard(L) {
    // A trimmed beard painted on: sideburns down the jaw, around the chin, joined to the moustache; the lips stay
    // clear. Soft edges and a fine hair texture keep it from reading as a sticker.
    const top = (x) => { const u = Math.abs(x); return mix(L.mouth.dy + 0.0108, -0.004, smooth(0.018, 0.088, u)) - 0.011 * Math.sin(Math.PI * clamp((u - 0.026) / 0.056)); };
    const outline = [...range(-0.084, 0.084, 60, (x) => [x, top(x)]), [0.084, -0.125], [-0.084, -0.125]];
    c.save();
    fill(outline, beard, 0.88, 3.4);
    // Thin out towards the ears so the beard never ends in an edge on the cheek.
    c.globalCompositeOperation = 'destination-out';
    for (const side of [-1, 1]) {
      const [x0] = P(side * 0.056, -0.04), [x1] = P(side * 0.083, -0.04);
      const g = c.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
      c.fillStyle = g; c.fillRect(side < 0 ? 0 : W / 2, 0, W / 2, H); // the gradient pads: clear outside, untouched inside
    }
    c.globalCompositeOperation = 'source-over';
    // Fine strokes in two tones.
    c.lineCap = 'round';
    for (let i = 0; i < 900; i++) {
      const x = (rnd(i * 1.31) - 0.5) * 0.17, y = top(x) - rnd(i * 2.7) * 0.12;
      if (y > top(x) - 0.001 || y < -0.122) continue;
      const [X, Y] = P(x, y);
      c.strokeStyle = i % 3 ? 'rgba(20,14,10,0.22)' : 'rgba(255,240,220,0.08)';
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(X, Y); c.lineTo(X + (x < 0 ? -1.2 : 1.2), Y + 3); c.stroke();
    }
    // Keep the lips clear.
    c.globalCompositeOperation = 'destination-out';
    const mw = L.mouth.w * 0.5;
    fill([...range(-mw, mw, 20, (x) => [x, L.mouth.dy + 0.0026 * (1 - (x / mw) ** 2)]), ...range(mw, -mw, 20, (x) => [x, L.mouth.dy - 0.0052 * (1 - (x / mw) ** 2)])], '#000', 1, 1.6);
    c.restore();
  }

  function draw(m, blink, look) {
    c.clearRect(0, 0, W, H);
    const L = layout;
    if (beard && !minimal) drawBeard(L);
    // Eyes: almond opening with the white, iris and pupil; the upper lid can lower (sleepy, blink), the lower lid
    // can rise (smile); a soft lid shadow, a lash line and a crease give them depth.
    for (const side of [-1, 1]) {
      const ex = side * L.eye.dx, ey = L.eye.dy;
      const a = (L.eye.w / 2) * m.es, b = (L.eye.h / 2) * m.es;
      const tilt = (x) => 0.0007 * side * ((x - ex) / a); // the outer corner sits a touch higher
      const topArc = (x) => { const u = (x - ex) / a; return ey + b * Math.pow(Math.max(0, 1 - u * u), 0.62) * (1 - 0.12 * side * u) + tilt(x); };
      const botArc = (x) => { const u = (x - ex) / a; return ey - b * 0.78 * Math.pow(Math.max(0, 1 - u * u), 0.85) + tilt(x); };
      const lid = clamp(m.lid + blink * (1 - m.lid));
      const sq = m.sq * (1 - blink);
      const lidY = (x) => mix(topArc(x), botArc(x), lid * 0.98);
      const lowY = (x) => Math.min(lidY(x), mix(botArc(x), topArc(x), sq * 0.5));
      if (lid < 0.9) {
        const opening = [...range(ex - a, ex + a, 32, (x) => [x, lidY(x)]), ...range(ex + a, ex - a, 32, (x) => [x, lowY(x)])];
        c.save();
        path(opening); c.closePath(); c.clip();
        const [cx, cy] = P(ex, ey);
        const ws = c.createRadialGradient(cx, cy, 2, cx, cy, a * 1000 * ppm(ex, ey));
        ws.addColorStop(0, '#F6F1EA'); ws.addColorStop(1, '#D9CFC3');
        c.fillStyle = ws; c.fillRect(0, 0, W, H);
        const ix = ex + clamp(look[0], -1, 1) * a * 0.34, iy = ey - b * 0.08 + clamp(look[1], -1, 1) * b * 0.22;
        const [IX, IY] = P(ix, iy);
        const ir = 0.0058 * m.es * 1000 * ppm(ix, iy);
        const ig = c.createRadialGradient(IX, IY, ir * 0.2, IX, IY, ir);
        ig.addColorStop(0, iris); ig.addColorStop(0.85, new THREE.Color(iris).multiplyScalar(0.7).getStyle()); ig.addColorStop(1, '#1A110B');
        c.fillStyle = ig; c.beginPath(); c.arc(IX, IY, ir, 0, TAU); c.fill();
        c.fillStyle = '#0E0907'; c.beginPath(); c.arc(IX, IY, ir * 0.42, 0, TAU); c.fill();
        c.fillStyle = 'rgba(255,252,246,0.9)'; c.beginPath(); c.arc(IX - ir * 0.35, IY - ir * 0.38, ir * 0.2, 0, TAU); c.fill();
        // Shadow the upper lid casts on the eye.
        const [, ly] = P(ex, lidY(ex));
        const sh = c.createLinearGradient(0, ly, 0, ly + b * 0.9 * 1000 * ppm(ex, ey));
        sh.addColorStop(0, 'rgba(60,35,25,0.38)'); sh.addColorStop(1, 'rgba(60,35,25,0)');
        c.fillStyle = sh; c.fillRect(0, 0, W, H);
        c.restore();
        // Lash line along the lid (a little wing at the outer corner for women), lower lid and crease.
        stroke(range(ex - a * 1.02, ex + a * (woman ? 1.14 : 1.02), 26, (x) => [x, x > ex + a ? lidY(ex + a) + (x - ex - a) * 0.35 * side : lidY(x) + 0.00025]), woman ? 0.0013 : 0.001, '#1C130E', 0.95);
        stroke(range(ex - a * 0.85, ex + a * 0.9, 18, (x) => [x, lowY(x) - 0.0002]), 0.0005, dark, 0.35 + 0.3 * sq);
        stroke(range(ex - a * 0.8, ex + a * 0.92, 18, (x) => [x, topArc(x) + 0.0032 - lid * 0.002]), 0.0006, dark, 0.32);
      } else {
        stroke(range(ex - a, ex + a * (woman ? 1.1 : 1), 24, (x) => [x, mix(topArc(x), botArc(x), 0.62) - 0.0008 * (1 - ((x - ex) / a) ** 2)]), woman ? 0.0013 : 0.0011, '#1C130E', 0.95);
        stroke(range(ex - a * 0.8, ex + a * 0.92, 18, (x) => [x, topArc(x) + 0.0024]), 0.0006, dark, 0.3);
      }
    }
    if (minimal) return;
    // Brows: soft, tapered from the inner end, the arch two thirds out; worry lifts the inner ends, thinking one brow.
    for (const side of [-1, 1]) {
      const inner = side * L.brow.inner, outer = side * (L.brow.inner + L.brow.len);
      const up = m.by + (m.asym ? (side > 0 ? 0.0028 : -0.0008) * m.asym : 0);
      const yi = L.brow.dy + up + m.bi, yo = L.brow.dy + up - 0.0015;
      const arch = (u) => mix(yi, yo, u) + 0.0028 * Math.sin(Math.PI * Math.min(1, u * 1.3)) * (1 - m.bi * 120);
      const thick = (u) => mix(woman ? 0.0034 : 0.0046, woman ? 0.001 : 0.0015, u ** 0.85);
      fill([...range(0, 1, 22, (u) => [mix(inner, outer, u), arch(u) + thick(u) * 0.5]), ...range(1, 0, 22, (u) => [mix(inner, outer, u), arch(u) - thick(u) * 0.5])], brow, 0.9, 0.8);
    }
    // Mouth: the line between the lips with a soft Cupid's bow, the lower lip's tone and the shadow beneath it.
    const mx0 = m.ms, my = L.mouth.dy, hw = (L.mouth.w / 2) * m.mw;
    const lipLine = new THREE.Color(tone.lip).lerp(new THREE.Color('#3A1C14'), 0.45).getStyle();
    if (m.mo > 0.05) {
      const ow = hw * 0.55, oh = 0.0042 * m.mo;
      fill(range(0, TAU, 32, (u) => [mx0 + Math.cos(u) * ow, my - oh * 0.4 + Math.sin(u) * oh]), '#3E1E18', 1);
      stroke(range(0, TAU, 32, (u) => [mx0 + Math.cos(u) * ow * 1.05, my - oh * 0.4 + Math.sin(u) * oh * 1.1]), 0.0011, tone.lip, 0.8);
    } else {
      const yAt = (x) => { const u = (x - mx0) / hw; return my + m.mc * 0.0032 * u * u - m.mc * 0.0007 - 0.0004 * Math.exp(-((u / 0.18) ** 2)); };
      // Lower lip (tone) and upper lip (lighter), then the line.
      fill([...range(-0.8, 0.8, 20, (u) => [mx0 + u * hw, yAt(mx0 + u * hw) - 0.0003]), ...range(0.8, -0.8, 20, (u) => [mx0 + u * hw, yAt(mx0 + u * hw) - 0.0042 * (1 - u * u) - 0.0005])], tone.lip, woman ? 0.5 : 0.36, 1.2);
      fill([...range(-0.85, 0.85, 20, (u) => [mx0 + u * hw, yAt(mx0 + u * hw) + 0.0026 * (1 - u * u) * (1 - 0.35 * Math.exp(-((u / 0.2) ** 2)))]), ...range(0.85, -0.85, 20, (u) => [mx0 + u * hw, yAt(mx0 + u * hw)])], tone.lip, woman ? 0.32 : 0.2, 1);
      stroke(range(-1, 1, 30, (u) => [mx0 + u * hw, yAt(mx0 + u * hw)]), 0.001, lipLine, 0.85);
      fill([...range(-0.5, 0.5, 12, (u) => [mx0 + u * hw, yAt(mx0) - 0.0058 - 0.001 * (1 - u * u)]), ...range(0.5, -0.5, 12, (u) => [mx0 + u * hw, yAt(mx0) - 0.0072])], tone.deep, 0.16, 2);
    }
  }

  return {
    mesh,
    set({ mood = FACE_MOODS.neutral, blink = 0, look = [0, 0] } = {}) {
      const q = (v) => Math.round(v * 400) / 400;
      const key = `${Object.values(mood).map(q).join(',')}|${q(blink)}|${q(look[0])},${q(look[1])}`;
      if (key === last) return;
      last = key;
      draw(mood, blink, look);
      tex.needsUpdate = true;
    },
  };
}

function capsule(r, len, seg = 12) { return new THREE.CapsuleGeometry(r, Math.max(0.0001, len), 6, seg); }

/** Basis quaternion from a forward-ish "y" direction and a preferred "z" direction. */
const _m = new THREE.Matrix4();
function basis(y, zHint, out = new THREE.Quaternion()) {
  const Y = y.clone().normalize();
  let Z = zHint.clone().sub(Y.clone().multiplyScalar(zHint.dot(Y)));
  if (Z.lengthSq() < 1e-6) Z = Math.abs(Y.z) < 0.9 ? V(0, 0, 1) : V(1, 0, 0);
  Z.normalize();
  const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
  Z.crossVectors(X, Y).normalize();
  _m.makeBasis(X, Y, Z);
  return out.setFromRotationMatrix(_m);
}

// ---------- hands ----------
// Hand space: wrist at the origin, fingers along +Y, palm facing +Z, thumb on +X (the left hand is mirrored).
// Fingers curl in a cascade (the little finger always a bit more than the index), the thumb opposes from a pad at
// the base of the palm, and shapes blend smoothly so a hand closing on a phone reads as one motion.
const FINGERS = [ // index, middle, ring, little: x across the palm, knuckle height, proximal / distal length, radius
  { x: 0.0222, y: 0.0728, l1: 0.026, l2: 0.026, r: 0.0091 },
  { x: 0.0073, y: 0.0755, l1: 0.029, l2: 0.028, r: 0.0094 },
  { x: -0.0075, y: 0.074, l1: 0.027, l2: 0.026, r: 0.009 },
  { x: -0.0218, y: 0.0688, l1: 0.021, l2: 0.021, r: 0.008 },
];
// c1 knuckle curl and c2 finger curl per finger (radians); thumb: r opposition (0 beside the palm … 1 across it),
// a abduction (spread away from the index), b tip bend; spread per finger.
const HAND_SHAPES = {
  relax: { c1: [0.42, 0.52, 0.6, 0.7], c2: [0.55, 0.65, 0.74, 0.82], thumb: { r: 0.3, a: 0.12, b: 0.22 }, spread: [0.02, 0, -0.02, -0.05] },
  open: { c1: [0.08, 0.07, 0.1, 0.14], c2: [0.1, 0.09, 0.12, 0.16], thumb: { r: 0.1, a: 0.5, b: 0.1 }, spread: [0.05, 0, -0.05, -0.11] },
  show: { c1: [0.1, 0.12, 0.3, 0.45], c2: [0.08, 0.1, 0.38, 0.55], thumb: { r: 0.66, a: 0.35, b: 0.16 }, spread: [0.01, 0, -0.02, -0.04] },
  flat: { c1: [0.05, 0.05, 0.06, 0.08], c2: [0.06, 0.06, 0.07, 0.09], thumb: { r: 0.12, a: 0.18, b: 0.05 }, spread: [0.02, 0, -0.02, -0.05] },
  cup: { c1: [0.16, 0.18, 0.22, 0.28], c2: [0.24, 0.26, 0.3, 0.36], thumb: { r: 0.3, a: 0.35, b: 0.15 }, spread: [0.03, 0, -0.03, -0.07] },
  hold: { c1: [0.95, 1.0, 1.06, 1.12], c2: [0.95, 1.0, 1.08, 1.15], thumb: { r: 0.9, a: 0.2, b: 0.12, lift: 0 }, spread: [0.02, 0, -0.02, -0.05] },
  wrap: { c1: [1.12, 1.16, 1.2, 1.24], c2: [1.15, 1.2, 1.25, 1.3], thumb: { r: 0.95, a: 0.3, b: 0.4 }, spread: [0, 0, -0.02, -0.04] },
  pinch: { c1: [0.72, 0.85, 1.12, 1.28], c2: [0.62, 0.72, 1.15, 1.3], thumb: { r: 1.0, a: 0.36, b: 0.28 }, spread: [0.02, 0, -0.03, -0.06] },
  hook: { c1: [0.55, 0.58, 0.6, 0.64], c2: [1.38, 1.4, 1.4, 1.38], thumb: { r: 0.3, a: 0.25, b: 0.25 }, spread: [0, 0, -0.02, -0.04] },
  fist: { c1: [1.48, 1.52, 1.54, 1.5], c2: [1.62, 1.62, 1.6, 1.58], thumb: { r: 1.05, a: 0.15, b: 0.62 }, spread: [0, 0, 0, 0] },
  point: { c1: [0.04, 1.52, 1.54, 1.5], c2: [0.05, 1.62, 1.6, 1.58], thumb: { r: 1.0, a: 0.2, b: 0.5 }, spread: [0.02, 0, 0, 0] },
};
function shapeMix(a, b, k) {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const m = (x, y) => x.map((v, i) => mix(v, y[i], k));
  return { c1: m(a.c1, b.c1), c2: m(a.c2, b.c2), spread: m(a.spread, b.spread), thumb: { r: mix(a.thumb.r, b.thumb.r, k), a: mix(a.thumb.a, b.thumb.a, k), b: mix(a.thumb.b, b.thumb.b, k) } };
}
const shapeOf = (s) => (typeof s === 'string' ? HAND_SHAPES[s] || HAND_SHAPES.relax : s || HAND_SHAPES.relax);

/** A finger segment: a capsule that tapers towards the tip. */
function segment(r, len, taper = 0.88) {
  const g = new THREE.CapsuleGeometry(r, Math.max(0.0001, len - 2 * r), 6, 12);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), u = clamp((y + len / 2) / len);
    const k = mix(1, taper, u);
    p.setXYZ(i, p.getX(i) * k, y + len / 2, p.getZ(i) * k * 0.92);
  }
  g.computeVertexNormals();
  return g;
}

function makeHand(mat, left) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  if (left) inner.scale.x = -1;
  g.add(inner);
  const add = (parent, m) => { m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  // Wrist runs into the sleeve so there is never a gap at the cuff.
  const wrist = add(inner, new THREE.Mesh(new THREE.CylinderGeometry(0.0215, 0.0235, 0.06, 20), mat)); wrist.position.y = -0.018; wrist.scale.z = 0.72;
  // Palm: narrower at the wrist, a touch thinner at the knuckles, softly cupped.
  const pg = new RoundedBoxGeometry(0.068, 0.08, 0.025, 5, 0.0105);
  const pp = pg.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i);
    const k = clamp((y + 0.04) / 0.08);
    const cup = z > 0 ? -0.0018 * (1 - (x / 0.034) ** 2) * Math.sin(Math.PI * k) : 0;
    pp.setXYZ(i, x * mix(0.8, 1, k), y, z * mix(1.06, 0.88, k) + cup);
  }
  pg.computeVertexNormals();
  const palm = add(inner, new THREE.Mesh(pg, mat)); palm.position.y = 0.037;
  // Thumb pad at the base of the palm.
  const pad = add(inner, new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), mat));
  pad.scale.set(0.0145, 0.024, 0.0115); pad.position.set(0.0175, 0.022, 0.0055); pad.rotation.z = -0.32;
  const fingers = FINGERS.map((f) => {
    const k1 = new THREE.Group(); k1.position.set(f.x, f.y, 0.0005);
    add(k1, new THREE.Mesh(segment(f.r, f.l1, 0.97), mat));
    const k2 = new THREE.Group(); k2.position.y = f.l1 - f.r * 0.35;
    add(k2, new THREE.Mesh(segment(f.r * 0.96, f.l2, 0.88), mat));
    k1.add(k2); inner.add(k1);
    return { ...f, k1, k2 };
  });
  // Thumb: from the pad, two segments; direction blends from beside the palm to across it.
  const tb = new THREE.Group(); tb.position.set(0.024, 0.016, 0.009);
  add(tb, new THREE.Mesh(segment(0.0106, 0.03, 0.95), mat));
  const t2 = new THREE.Group(); t2.position.y = 0.027;
  add(t2, new THREE.Mesh(segment(0.0098, 0.026, 0.84), mat));
  tb.add(t2); inner.add(tb);
  // Thumb directions: alongside the index (rest), across the palm lifted off it (around a cup), across the palm
  // close to it (resting on a phone screen held in the palm).
  const ALONG = V(0.3, 0.88, 0.36).normalize(), ACROSS = V(-0.3, 0.6, 0.74).normalize(), ACROSS_LOW = V(-0.55, 0.74, 0.38).normalize(), UP = V(0, 1, 0);
  const tq = new THREE.Quaternion();
  g.userData.set = (shape = 'relax', { tap = 0, fingerTap = 0 } = {}) => {
    const s = shapeOf(shape);
    fingers.forEach((f, i) => {
      const lift = i === 0 ? fingerTap * 0.35 : 0;
      f.k1.rotation.set(s.c1[i] - lift, 0, s.spread[i]);
      f.k2.rotation.x = s.c2[i] - lift * 0.6;
    });
    const r = clamp(s.thumb.r - tap * 0.25, 0, 1.2);
    const across = ACROSS.clone().lerp(ACROSS_LOW, 1 - (s.thumb.lift ?? 1)).normalize();
    const d = ALONG.clone().lerp(across, Math.min(1, r)).add(V(s.thumb.a * 0.3, 0, -s.thumb.a * 0.1)).normalize();
    tb.quaternion.copy(tq.setFromUnitVectors(UP, d));
    t2.rotation.set(s.thumb.b + tap * 0.35, 0, 0);
  };
  g.userData.set('relax');
  return g;
}

// ---------- props ----------
function phoneScreen(lang = 'en') {
  return cached(`phone-ui:${lang}`, () => canvasTexture(240, 512, (c, w, h) => {
    c.fillStyle = '#111110'; c.fillRect(0, 0, w, h);
    c.fillStyle = COLORS.gold; drawSymbol(c, w / 2, 70, 44);
    c.fillStyle = '#F6F1E7'; drawText(c, lang === 'ar' ? '1 جرام' : '1 g', w / 2, 150, { size: 54, weight: 700 });
    c.fillStyle = 'rgba(246,241,231,0.55)'; drawText(c, '24K · 999.9', w / 2, 196, { size: 20, weight: 500 });
    c.strokeStyle = COLORS.gold; c.lineWidth = 5; c.lineJoin = 'round'; c.beginPath();
    for (let i = 0; i <= 20; i++) { const x = 24 + (i / 20) * (w - 48); const y = 330 - i * 4.2 - Math.sin(i * 0.9) * 14; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
    c.stroke();
    const g = c.createLinearGradient(0, 240, 0, 360); g.addColorStop(0, 'rgba(219,167,97,0.28)'); g.addColorStop(1, 'rgba(219,167,97,0)');
    c.lineTo(w - 24, 360); c.lineTo(24, 360); c.closePath(); c.fillStyle = g; c.fill();
    c.fillStyle = COLORS.gold; c.beginPath(); c.roundRect(28, 420, w - 56, 54, 27); c.fill();
    c.fillStyle = '#151513'; drawText(c, lang === 'ar' ? 'شراء' : 'Buy', w / 2, 448, { size: 24, weight: 700 });
  }));
}

function paperLines() {
  return cached('receipt', () => canvasTexture(128, 256, (c, w, h) => {
    c.fillStyle = '#F7F4EC'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(40,36,30,0.55)';
    for (let i = 0; i < 16; i++) { const lw = 30 + rnd(i * 4.4) * 70; c.fillRect(14, 22 + i * 13, lw, 3); c.fillRect(w - 34, 22 + i * 13, 20, 3); }
    c.fillRect(14, h - 34, w - 28, 5);
  }));
}

/** A prop as a 3D object. Origin = where it is held (or its base for floor props). */
export function prop3d(name, { lang = 'en', theme = 'onyx' } = {}) {
  const g = new THREE.Group();
  g.name = `prop:${name}`;
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  const light = theme === 'cream' || theme === 'sand';
  switch (name) {
    case 'phone': {
      add(new RoundedBoxGeometry(0.074, 0.152, 0.0085, 4, 0.0042), new THREE.MeshPhysicalMaterial({ color: '#161615', metalness: 0.5, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
      const scr = add(new THREE.PlaneGeometry(0.068, 0.146), new THREE.MeshPhysicalMaterial({ color: '#000000', emissive: '#FFFFFF', emissiveMap: phoneScreen(lang), emissiveIntensity: 0.9, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 }), 0, 0, 0.0044);
      scr.castShadow = false;
      break;
    }
    case 'goldbar': {
      const stamp = barStamp({ weight: '100 g', lang, aspect: 0.116 / 0.068 });
      const m = add(barGeometry({ w: 0.068, h: 0.116, d: 0.009, r: 0.006, bevel: 0.002 }), [materials.gold({ normalMap: stamp.normalMap, roughnessMap: stamp.roughnessMap, roughness: 1, normalScale: 0.7 }), materials.satin()]);
      m.rotation.set(0, 0, 0);
      break;
    }
    case 'giftbox': {
      const box = light ? new THREE.MeshPhysicalMaterial({ color: '#1C1B19', roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.25 }) : new THREE.MeshPhysicalMaterial({ color: '#F1E8D8', roughness: 0.62, sheen: 0.3, sheenColor: new THREE.Color('#FFFFFF') });
      const rib = materials.satin({ color: GOLD.warm, roughness: 0.3 });
      const S = 0.2, H = 0.15;
      add(new RoundedBoxGeometry(S, H, S, 4, 0.008), box, 0, 0, 0);
      add(new RoundedBoxGeometry(S + 0.008, 0.028, S + 0.008, 3, 0.006), box, 0, H / 2 - 0.012, 0);
      add(new THREE.BoxGeometry(0.026, H + 0.012, S + 0.012), rib, 0, 0.002, 0);
      add(new THREE.BoxGeometry(S + 0.012, H + 0.012, 0.026), rib, 0, 0.002, 0);
      for (const s of [-1, 1]) {
        const loop = add(new THREE.TorusGeometry(0.032, 0.0085, 10, 28), rib, s * 0.03, H / 2 + 0.03, 0);
        loop.rotation.set(0, s * 0.4, s * 0.55); loop.scale.set(1, 0.72, 0.5);
      }
      add(new THREE.SphereGeometry(0.014, 16, 12), rib, 0, H / 2 + 0.012, 0).scale.set(1, 0.8, 1);
      break;
    }
    case 'receipts': {
      const mat = new THREE.MeshStandardMaterial({ map: paperLines(), roughness: 0.9, side: THREE.DoubleSide });
      for (let i = 0; i < 5; i++) {
        const geo = new THREE.PlaneGeometry(0.075, 0.16, 1, 8);
        const p = geo.attributes.position;
        for (let j = 0; j < p.count; j++) p.setZ(j, (p.getY(j) / 0.08) ** 2 * 0.012 * (i % 2 ? 1 : -1));
        geo.computeVertexNormals();
        const m = add(geo, mat, (i - 2) * 0.008, 0.05 + i * 0.004, i * 0.002);
        m.rotation.z = (i - 2) * 0.22 + (rnd(i) - 0.5) * 0.2;
      }
      break;
    }
    case 'bag':
    case 'shopping-bag': {
      const W = 0.24, H = 0.28, D = 0.11;
      const print = cached(`bag:${lang}`, () => canvasTexture(256, 300, (c, w, h) => {
        c.fillStyle = '#1A1918'; c.fillRect(0, 0, w, h);
        c.fillStyle = COLORS.gold; drawSymbol(c, w / 2, h * 0.46, 70);
      }));
      const body = new THREE.MeshPhysicalMaterial({ color: '#FFFFFF', map: print, roughness: 0.7, sheen: 0.2 });
      const side = new THREE.MeshStandardMaterial({ color: '#1A1918', roughness: 0.75 });
      add(new THREE.BoxGeometry(W, H, D), [side, side, side, side, body, side], 0, -0.1 - H / 2, 0);
      const rope = materials.satin({ color: GOLD.warm, roughness: 0.45 });
      for (const s of [-1, 1]) {
        const r = add(new THREE.TorusGeometry(0.05, 0.004, 8, 24, Math.PI), rope, 0, -0.1, s * D * 0.3);
        r.scale.set(1, 1.6, 1);
      }
      break;
    }
    case 'coffee': {
      const cup = new THREE.MeshPhysicalMaterial({ color: '#F4EFE6', roughness: 0.55, sheen: 0.2 });
      const sleeve = new THREE.MeshStandardMaterial({ color: '#B08A5E', roughness: 0.85 });
      const lid = new THREE.MeshPhysicalMaterial({ color: '#1C1B1A', roughness: 0.4 });
      add(new THREE.CylinderGeometry(0.041, 0.031, 0.125, 32), cup);
      add(new THREE.CylinderGeometry(0.0395, 0.0345, 0.05, 32), sleeve, 0, -0.005, 0).scale.set(1.03, 1, 1.03);
      add(new THREE.CylinderGeometry(0.043, 0.043, 0.014, 32), lid, 0, 0.068, 0);
      add(new THREE.CylinderGeometry(0.03, 0.04, 0.01, 32), lid, 0, 0.079, 0);
      break;
    }
    case 'coin': {
      const m = add(new THREE.CylinderGeometry(0.03, 0.03, 0.004, 48), materials.gold());
      m.rotation.x = Math.PI / 2;
      break;
    }
    default: return null;
  }
  return g;
}

// Where a prop sits in the hand (hand space: fingers +Y, palm faces +Z, thumb +X) and which hand shape holds it.
const GRIPS = {
  phone: { pos: [-0.004, 0.064, 0.019], rot: [0, 0, 0.08], shape: 'hold' },
  goldbar: { pos: [0.004, 0.112, 0.033], rot: [-0.24, 0, -0.06], shape: 'show' }, // tilted back to catch the key light
  receipts: { pos: [0.012, 0.036, 0.016], rot: [0, 0, 0.2], shape: 'pinch' },
  bag: { pos: [0, 0.058, 0.016], rot: [0, Math.PI / 2, Math.PI], shape: 'hook' },
  'shopping-bag': { pos: [0, 0.058, 0.016], rot: [0, Math.PI / 2, Math.PI], shape: 'hook' },
  coffee: { pos: [0.002, 0.052, 0.05], rot: [0, 0, -Math.PI / 2], shape: 'wrap' },
  coin: { pos: [0.014, 0.078, 0.02], rot: [0, 0, 0], shape: 'pinch' },
};

// ---------- poses ----------
// Wrist targets in figure space (metres) for a figure facing +z with the near hand = R (-x). Facing left mirrors x.
// palm: direction the palm faces · pole: where the elbow points · shape: hand shape · hold: the prop rides this hand.
// mood: the face when the spec gives none · eyes: where the eyes rest ([x, y], -1…1) · focus: how much idle gaze
// moves the head (0 when locked on a phone) · act(lt, c): the performance once posed (lt = seconds since posed),
// returning offsets; built from eased events and drift, never a bare sine loop.
const D = { R: { t: [-0.232, 0.862, 0.045], palm: [1, 0, 0.2], shape: 'relax', pole: [-0.35, 0, -1] }, L: { t: [0.232, 0.862, 0.045], palm: [-1, 0, 0.2], shape: 'relax', pole: [0.35, 0, -1] } };
const pulseTaps = (d, rate, n) => (d >= 0 && d < n / rate ? Math.max(0, Math.sin(d * TAU * rate)) : 0);
export const POSES3D = {
  stand: { label: 'Standing, relaxed, arms at the sides', mood: 'neutral', R: D.R, L: D.L },
  phone: {
    label: 'Looking down at a phone held at chest height, thumb scrolling',
    mood: 'neutral', eyes: [0.1, -1], focus: 0.25,
    head: { tilt: 0.36, turn: -0.06 },
    R: { t: [-0.07, 1.13, 0.26], palm: [0.1, 0.85, -0.5], shape: 'hold', pole: [-1, -0.6, -0.2], hold: true }, L: D.L,
    act: (lt, c) => {
      const g = lastEvent(lt, c.seed + 1, 3.6, 6.4, 1.6, c.period);
      const up = g.dt >= 0 ? env(g.dt, 0.32, 0.9, 0.5) : 0; // glances up from the screen now and then
      const s = lastEvent(lt, c.seed + 2, 1.6, 3.4, 0.3, c.period);
      return { headTilt: -0.3 * up, eyes: [0, 1.4 * up], tap: up > 0.1 ? 0 : pulseTaps(s.dt, 2.4, 3), R: [0, 0.008 * up, 0] };
    },
  },
  'phone-happy': {
    label: 'Smiling at good news on the phone, free hand in a small "yes" fist pump',
    mood: 'happy', eyes: [0.1, -0.7], focus: 0.4,
    head: { tilt: 0.18, turn: -0.04 }, chest: -0.04,
    R: { t: [-0.08, 1.16, 0.27], palm: [0.1, 0.8, -0.55], shape: 'hold', pole: [-1, -0.6, -0.2], hold: true },
    L: { t: [0.19, 1.12, 0.2], palm: [-0.7, 0.2, 0.5], shape: 'fist', pole: [0.5, -0.4, -1] },
    act: (lt, c) => {
      const x = lt - 0.1; // one pump: a small lift, then a quick pull down and back, then it settles
      const lift = x > 0 ? env(x, 0.16, 0.02, 0.14) : 0;
      const pump = x > 0.16 ? env(x - 0.16, 0.13, 0.22, 0.55) : 0;
      const b = lastEvent(lt, c.seed + 3, 3.4, 6, 2.6, c.period);
      const bob = b.dt >= 0 ? env(b.dt, 0.22, 0.08, 0.4) : 0;
      return { L: [0, 0.035 * lift - 0.07 * pump, -0.06 * pump], dy: -0.008 * pump + 0.005 * bob, chest: -0.03 * pump, headTilt: -0.07 * pump, face: { mc: 0.15 * pump } };
    },
  },
  stressed: {
    label: 'Worried, holding a messy handful of receipts, head down, hand at the temple',
    mood: 'worried', eyes: [0, -0.7], focus: 0.4,
    head: { tilt: 0.34, roll: 0.12 }, shrug: 0.022, lean: 0.04,
    R: { t: [-0.1, 1.04, 0.25], palm: [0.3, 0.7, -0.4], shape: 'pinch', pole: [-1, -0.5, -0.2], hold: true },
    L: { t: [0.075, 1.6, 0.095], palm: [-0.7, 0.1, -0.6], shape: 'cup', pole: [1, 0.2, -0.3], bend: -0.2 },
    act: (lt, c) => {
      const e = lastEvent(lt, c.seed + 4, 2.8, 4.6, 0.8, c.period);
      const shake = e.dt >= 0 && e.dt < 1.5 ? Math.sin(e.dt * TAU * 1.3) * env(e.dt, 0.25, 0.75, 0.45) : 0;
      const rub = drift(lt, c.seed + 9, 2.4, c.period);
      return { headTurn: 0.09 * shake, L: [0.004 * rub, 0.005 * rub, 0], headTilt: 0.02 * drift(lt, c.seed + 2, 0.8, c.period) };
    },
  },
  thinking: {
    label: 'Thinking: hand at the chin, other arm across the waist, eyes up',
    mood: 'thinking', eyes: [0.55, 0.85], focus: 0.5,
    head: { tilt: -0.14, roll: 0.14, turn: 0.12 },
    R: { t: [-0.035, 1.43, 0.16], palm: [0.5, 0.1, -0.85], shape: 'relax', pole: [-0.3, -1, 0.1] },
    L: { t: [-0.035, 1.14, 0.17], palm: [0, 1, 0.15], shape: 'cup', pole: [1, -0.3, -0.5], bend: 0.15 }, // cups the other elbow
    act: (lt, c) => {
      const e = lastEvent(lt, c.seed + 5, 2.6, 5, 1.2, c.period);
      const side = e.i % 2 ? 1 : -1, tilt = e.dt >= 0 ? env(e.dt, 0.5, 1.3, 0.7) * side : 0;
      const tp = lastEvent(lt, c.seed + 6, 1.8, 3.8, 0.6, c.period);
      return { headRoll: 0.07 * tilt, headTurn: 0.05 * tilt, eyes: [0.25 * tilt, 0], fingerTap: pulseTaps(tp.dt, 2.6, 2) };
    },
  },
  celebrate: {
    label: 'Celebrating with both arms up, small bounce',
    mood: 'happy', eyes: [0, 0.3], enterDip: 0.03, both: true,
    head: { tilt: -0.2 }, chest: -0.06,
    R: { t: [-0.34, 1.9, 0.08], palm: [0.3, 0, 0.9], shape: 'fist', pole: [-1, 0, -0.2] },
    L: { t: [0.34, 1.9, 0.08], palm: [-0.3, 0, 0.9], shape: 'fist', pole: [1, 0, -0.2] },
    act: (lt, c) => {
      const j = lastEvent(lt, c.seed + 7, 1.7, 3.4, 0.05, c.period);
      const hop = j.dt >= 0 && j.dt < 0.95 ? Math.abs(Math.sin(j.dt * Math.PI * 2.1)) * env(j.dt, 0.08, 0.55, 0.3) : 0;
      return { dy: 0.028 * hop, R: [0, 0.03 * hop, 0], L: [0, 0.03 * hop, 0], headTilt: -0.05 * hop, face: { mc: 0.1 * hop } };
    },
  },
  'give-gift': {
    label: 'Offering a gift box forward with both hands',
    mood: 'happy', eyes: [0, -0.35], both: true,
    head: { tilt: 0.2 }, lean: 0.07,
    prop: { at: [0, 1.1, 0.36], both: true },
    R: { t: [-0.118, 1.06, 0.34], palm: [1, 0.2, 0], shape: 'flat', pole: [-1, -0.6, -0.4] },
    L: { t: [0.118, 1.06, 0.34], palm: [-1, 0.2, 0], shape: 'flat', pole: [1, -0.6, -0.4] },
    act: (lt, c) => {
      const offer = easeIO(lt / 0.9); // after it arrives, a small reach forward, then it holds
      const n = lastEvent(lt, c.seed + 8, 2.6, 4.6, 1.5, c.period);
      const nod = n.dt >= 0 ? env(n.dt, 0.2, 0.12, 0.35) : 0;
      return { all: [0, 0.008 * offer, 0.025 * offer], lean: 0.02 * offer, headTilt: 0.07 * nod };
    },
  },
  'receive-gift': {
    label: 'Receiving: both palms up and forward, a gift box resting on them',
    mood: 'happy', eyes: [0, -0.55], both: true,
    head: { tilt: 0.24 }, lean: 0.03,
    prop: { at: [0, 1.135, 0.38], both: true, rest: true },
    R: { t: [-0.075, 1.035, 0.33], palm: [0.1, 1, 0.1], shape: 'cup', pole: [-1, -0.7, -0.3] },
    L: { t: [0.075, 1.035, 0.33], palm: [-0.1, 1, 0.1], shape: 'cup', pole: [1, -0.7, -0.3] },
    act: (lt) => { const land = lt > 0.15 ? env(lt - 0.15, 0.1, 0.05, 0.55) : 0; return { all: [0, -0.012 * land, 0], dy: -0.004 * land, headTilt: 0.03 * land }; },
  },
  wave: {
    label: 'Friendly wave with the near hand raised beside the head',
    mood: 'happy', eyes: [0, 0],
    head: { tilt: -0.04, roll: 0.06 },
    R: { t: [-0.47, 1.56, 0.26], palm: [0.2, 0, 1], shape: 'open', pole: [-0.6, -1, -0.1], bend: -0.25 }, L: D.L,
    act: (lt, c) => {
      // Waves come in short bursts (two or three swings), with pauses where the hand stays up.
      const e = lastEvent(lt, c.seed + 9, 2.4, 4, 0, c.period);
      const amp = e.dt >= 0 ? env(e.dt, 0.18, 0.95, 0.32) : 0;
      const osc = Math.sin(e.dt * TAU * 1.9);
      return { R: [0.045 * amp * osc, 0.005 * amp * Math.abs(osc), 0], handRoll: 0.3 * amp * osc, headRoll: 0.025 * amp };
    },
  },
  point: {
    label: 'Pointing forward / at something on the facing side',
    mood: 'neutral', eyes: [-0.6, -0.1],
    head: { tilt: 0.02, turn: -0.1 },
    R: { t: [-0.16, 1.36, 0.5], palm: [1, 0, 0], shape: 'point', pole: [-1, -0.6, 0] }, L: D.L,
    act: (lt, c) => {
      const e = lastEvent(lt, c.seed + 10, 2.4, 4.4, 0.25, c.period);
      const poke = pulseTaps(e.dt, 1.8, 2) * (e.dt >= 0 ? env(e.dt, 0.05, 0.9, 0.2) : 0);
      return { R: [0, 0, 0.022 * poke], headTilt: 0.035 * poke };
    },
  },
  shrug: {
    label: 'Shrugging: forearms out, palms up, shoulders raised (unsure)',
    mood: 'worried', eyes: [0, 0.2], both: true,
    head: { roll: 0.16, tilt: 0.06 }, shrug: 0.03,
    R: { t: [-0.36, 1.08, 0.18], palm: [0, 1, 0.1], shape: 'open', pole: [-0.4, -1, -0.4] },
    L: { t: [0.36, 1.08, 0.18], palm: [0, 1, 0.1], shape: 'open', pole: [0.4, -1, -0.4] },
    act: (lt, c) => {
      const e = lastEvent(lt, c.seed + 11, 2.8, 4.4, 0.05, c.period);
      const k = e.dt >= 0 ? env(e.dt, 0.26, 0.55, 0.5) : 0;
      return { shrug: 0.025 * k, R: [-0.02 * k, 0.035 * k, 0], L: [0.02 * k, 0.035 * k, 0], headRoll: 0.05 * k, headTilt: 0.03 * k, face: { by: 0.0015 * k } };
    },
  },
  walk: {
    label: 'Walking towards the facing side (a stride every 1.05 s)',
    mood: 'neutral', eyes: [0, 0], focus: 0.3,
    head: { tilt: 0.04 }, walk: true,
    R: { t: [-0.225, 0.89, 0.04], palm: [1, 0, 0.1], shape: 'relax', pole: [-0.3, 0, -1] }, L: { t: [0.225, 0.89, 0.04], palm: [-1, 0, 0.1], shape: 'relax', pole: [0.3, 0, -1] },
  },
  sit: {
    label: 'Seated on a low cushion, hands resting on the knees',
    mood: 'calm', eyes: [0, -0.2], sit: true, head: { tilt: 0.06 },
    R: { t: [-0.13, 0.6, 0.33], palm: [0, -1, 0.1], shape: 'relax', pole: [-1, 0, -0.4] },
    L: { t: [0.13, 0.6, 0.33], palm: [0, -1, 0.1], shape: 'relax', pole: [1, 0, -0.4] },
    holdAt: { t: [-0.06, 0.86, 0.3], palm: [0.15, 0.85, -0.5], shape: 'hold', pole: [-1, -0.6, -0.2], hold: true },
  },
  'hold-goldbar': {
    label: 'Proudly holding up a gold bar in front of the chest',
    mood: 'proud', eyes: [0.15, -0.3],
    head: { tilt: 0.1 }, chest: -0.05,
    R: { t: [-0.075, 1.25, 0.21], palm: [0.12, -0.05, 1], shape: 'show', pole: [-0.8, -1.3, 0.15], hold: true, bend: -0.3 }, L: D.L, // forearm up, palm to the viewer
    defaultProp: 'goldbar',
    act: (lt, c) => ({ handRoll: 0.14 * drift(lt, c.seed + 12, 0.55, c.period), R: [0, 0.005 * drift(lt, c.seed + 13, 0.5, c.period), 0] }),
  },
  present: {
    label: 'Presenting: open palm extended to the facing side, showing something',
    mood: 'happy', eyes: [-0.7, -0.2],
    head: { turn: -0.32, tilt: 0.05 },
    R: { t: [-0.34, 1.16, 0.36], palm: [0.1, 1, 0.2], shape: 'open', pole: [-1, -0.6, -0.2] }, L: D.L,
    act: (lt, c) => { const k = drift(lt, c.seed + 14, 0.5, c.period); return { R: [0.012 * k, 0.005 * k, 0.008 * k], headTurn: 0.025 * k }; },
  },
};
// How the near hand carries a prop when the pose itself does not hold one.
const CARRY = {
  phone: { t: [-0.16, 1.0, 0.21], palm: [0.85, 0.5, 0], shape: 'hold', pole: [-0.6, -1, -0.5], hold: true },
  goldbar: { t: [-0.16, 1.0, 0.21], palm: [0.6, 0.2, 0.8], shape: 'show', pole: [-0.6, -1, -0.5], hold: true },
  receipts: { t: [-0.16, 1.0, 0.21], palm: [0.6, 0.7, 0], shape: 'pinch', pole: [-0.6, -1, -0.5], hold: true },
  coffee: { t: [-0.17, 1.02, 0.21], palm: [1, 0, 0], shape: 'wrap', pole: [-0.6, -1, -0.5], hold: true, bend: 0 },
  coin: { t: [-0.16, 1.0, 0.21], palm: [0.6, 0.7, 0.2], shape: 'pinch', pole: [-0.6, -1, -0.5], hold: true },
  bag: { t: [-0.24, 0.9, 0.02], palm: [1, 0, 0], shape: 'hook', hold: true, bend: 0 },
  'shopping-bag': { t: [-0.24, 0.9, 0.02], palm: [1, 0, 0], shape: 'hook', hold: true, bend: 0 },
};
const POSE_DEFAULT_PROP = { phone: 'phone', 'phone-happy': 'phone', stressed: 'receipts', 'give-gift': 'giftbox', 'receive-gift': 'giftbox', 'hold-goldbar': 'goldbar' };
export function figurePoses() { return Object.fromEntries(Object.entries(POSES3D).map(([k, v]) => [k, v.label])); }

// Moods in the body (the face carries the rest, see FACE_MOODS).
const MOODS = {
  neutral: {},
  happy: { tilt: -0.05, chest: -0.025 },
  worried: { tilt: 0.1, shrug: 0.015, lean: -0.01 },
  surprised: { tilt: -0.1, lean: -0.04, shrug: 0.018 },
  calm: { roll: 0.05, breathe: 1.5 },
  proud: { tilt: -0.07, chest: -0.05 },
  thinking: { roll: 0.08, tilt: -0.05, turn: 0.07 },
};

// ---------- the figure ----------
const SHOULDER = { x: 0.16, y: 1.383 };
const UPPER = 0.285, FORE = 0.255;

/** Resolve a spec into concrete colours and options (seeded variety stays inside the brand neutrals). */
function resolve(spec = {}) {
  const man = spec.gender !== 'woman';
  const seed = Number(spec.seed) || 1;
  const outfit = spec.outfit || (man ? 'dishdasha' : 'abaya');
  const age = spec.age || 'adult';
  const robes = ['white', 'white', 'ivory', 'pearl', 'oat', 'mist'];
  const scarves = ['sandstone', 'espresso', 'taupe', 'stone', 'mocha', 'sandstone'];
  return {
    man, seed, outfit, age,
    headwear: spec.headwear || (man ? 'kumma' : 'hijab'),
    skin: SKIN[spec.skin] ? spec.skin : 'medium',
    beard: spec.beard ?? (man && age !== 'young'),
    robe: hex(spec.robe, FABRIC[outfit === 'abaya' ? 'abaya' : outfit === 'casual' ? (man ? 'denim' : ['olive', 'mocha', 'taupe'][(seed - 1) % 3]) : robes[(seed - 1) % robes.length]].base),
    scarf: hex(spec.scarf, FABRIC[scarves[(seed - 1) % scarves.length]].base),
    accent: hex(spec.accent === 'gold' ? 'bullion' : spec.accent, COLORS.bullion),
    hair: age === 'senior' ? HAIR.grey : seed % 3 === 0 ? HAIR.darkBrown : HAIR.black,
    glasses: spec.glasses ?? (age === 'senior' && seed % 2 === 0),
    pose: POSES3D[spec.pose] ? spec.pose : 'stand',
    mood: MOODS[spec.mood] ? spec.mood : 'neutral',
    prop: spec.prop === null || spec.prop === 'none' ? null : (spec.prop || POSE_DEFAULT_PROP[spec.pose] || null),
    facing: spec.facing || 'front',
    lang: spec.lang || 'en', theme: spec.theme || 'onyx',
  };
}

/** Embroidered kumma band (colour + bump), seeded. */
function kummaMaps(accent, seed) {
  return cached(`kumma:${accent}:${seed % 4}`, () => {
    const tex = canvasTexture(1024, 160, (c, w, h) => {
      c.fillStyle = '#F6F2EA'; c.fillRect(0, 0, w, h);
      const cols = [accent, '#B9A88C', accent, '#8C7B66'];
      for (let row = 0; row < 3; row++) {
        const y = 34 + row * 40;
        for (let i = 0; i < 64; i++) {
          const x = (i + (row % 2) * 0.5) * (w / 64);
          c.fillStyle = cols[(i + row + seed) % cols.length];
          c.beginPath(); c.moveTo(x, y - 9); c.lineTo(x + 6, y); c.lineTo(x, y + 9); c.lineTo(x - 6, y); c.closePath(); c.fill();
          c.fillStyle = 'rgba(120,104,84,0.5)'; c.beginPath(); c.arc(x + 8, y - 14, 2, 0, TAU); c.fill();
        }
      }
      c.fillStyle = accent; c.fillRect(0, h - 10, w, 5); c.fillRect(0, 6, w, 3);
    });
    return tex;
  });
}

function massarMaps(seed) {
  return cached(`massar:${seed % 3}`, () => canvasTexture(1024, 256, (c, w, h) => {
    const base = ['#6A4A33', '#7B5A3C', '#4F3A2C'][seed % 3];
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    const bands = ['#C8943D', '#E9E1CF', '#3B2A1C', '#A0703F', '#D9B98A'];
    for (let i = 0; i < 18; i++) { c.fillStyle = bands[i % bands.length]; c.fillRect(0, i * 15 + (i % 3) * 2, w, i % 4 === 0 ? 5 : 2.5); }
    for (let i = 0; i < 80; i++) { c.fillStyle = 'rgba(233,225,207,0.6)'; const x = (i * 97) % w, y = (i * 53) % h; c.beginPath(); c.ellipse(x, y, 6, 3, i, 0, TAU); c.fill(); }
  }));
}

/** Abaya front trim: colour map with a fine accent line down the front (u = 0.5) and metal where the trim is. */
function trimMaps(accent) {
  return cached(`trim:${accent}`, () => {
    const color = canvasTexture(1024, 16, (c, w, h) => { c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, w, h); c.fillStyle = accent; c.fillRect(w / 2 - 7, 0, 4, h); c.fillRect(w / 2 + 3, 0, 4, h); });
    const metal = canvasTexture(1024, 16, (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.fillStyle = '#FFF'; c.fillRect(w / 2 - 7, 0, 4, h); c.fillRect(w / 2 + 3, 0, 4, h); });
    metal.colorSpace = THREE.NoColorSpace;
    return { color, metal };
  });
}

/**
 * Build a posable figure.
 * Returns { group, spec, update(t), height, box() }. Add `group` to a scene; call update(t) every frame.
 */
export function figure(input = {}) {
  const spec = resolve(input);
  const { man } = spec;
  const ph = rnd(spec.seed * 7.7) * TAU; // idle phase per person
  const root = new THREE.Group();
  root.name = 'figure';
  const all = new THREE.Group(); // scaled (women are a touch smaller)
  root.add(all);
  const scale = man ? (spec.age === 'young' ? 1.01 : 1) : (spec.age === 'young' ? 0.95 : 0.94);
  all.scale.setScalar(scale);
  const slim = spec.age === 'young' ? 0.95 : 1;

  const skin = skinMat(spec.skin);
  const abaya = spec.outfit === 'abaya';
  const casual = spec.outfit === 'casual';
  const trim = abaya ? trimMaps(spec.accent) : null;
  const robeMat = fabric(spec.robe, { satin: abaya, map: trim?.color, metalnessMap: trim?.metal });
  if (abaya) { robeMat.metalness = 1; robeMat.roughness = 0.44; }
  const sleeveMat = abaya ? robeMat : fabric(spec.robe, { folds: 'sleeve', normalScale: 0.5 });
  const accentMat = new THREE.MeshPhysicalMaterial({ color: spec.accent, metalness: 0.85, roughness: 0.32, envMapIntensity: 1.1 });

  // ----- skeleton -----
  const base = new THREE.Bone(); base.name = 'base';
  const hip = new THREE.Bone(); hip.name = 'hip'; hip.position.set(0, 0.95, 0);
  const chest = new THREE.Bone(); chest.name = 'chest'; chest.position.set(0, 0.3, 0);
  base.add(hip); hip.add(chest);
  all.add(base);
  const shoulders = {}, elbows = {};
  for (const s of ['R', 'L']) {
    const sx = (s === 'R' ? -1 : 1) * SHOULDER.x * slim;
    const sh = new THREE.Bone(); sh.position.set(sx, SHOULDER.y - 1.25, -0.004);
    const el = new THREE.Bone(); el.position.set(0, -UPPER, 0);
    sh.name = `shoulder${s}`; el.name = `elbow${s}`;
    sh.add(el); chest.add(sh);
    shoulders[s] = sh; elbows[s] = el;
  }
  all.updateMatrixWorld(true);

  const meshes = [];
  const track = (m) => { m.castShadow = true; m.receiveShadow = true; meshes.push(m); return m; };

  // ----- robe / clothes (one skinned mesh: hem stays planted, waist and chest bend) -----
  const sit = !!POSES3D[spec.pose].sit;
  const robeWeights = (x, y) => {
    if (y < 0.72) return [0, 1, 1, 0];
    if (y < 1.0) { const k = smooth(0.72, 1.0, y); return [0, 1 - k, 1, k]; }
    if (y < 1.22) { const k = smooth(1.0, 1.22, y); return [1, 1 - k, 2, k]; }
    return [2, 1, 0, 0];
  };
  // Silhouettes (radius, height), hem → collar. A-line skirt, soft waist, sloping shoulders.
  const torso = (w) => [[0.178 * w, 1.1], [0.183 * w, 1.24], [0.19 * w, 1.32], [0.192 * w, 1.36], [0.181 * w, 1.398], [0.142 * w, 1.437], [0.09, 1.467], [0.056, 1.494]];
  const upperPts = (w) => [[0.168 * w, 0.84], [0.172 * w, 0.97], ...torso(w)];
  const robeDepth = (y) => mix(0.82, 0.6, smooth(0.1, 1.3, y));
  const chestFront = (y) => 0.012 * Math.exp(-(((y - 1.27) / 0.12) ** 2));
  const longPts = abaya
    ? [[0.272, 0.03], [0.263, 0.18], [0.238, 0.48], [0.207 * slim, 0.76], [0.184 * slim, 0.97], ...torso(slim)]
    : [[0.25, 0.035], [0.244, 0.2], [0.226, 0.48], [0.204 * slim, 0.74], [0.186 * slim, 0.95], ...torso(slim)];
  let clothes;
  if (casual) {
    // Overshirt / tunic to the hip (man) or knee (woman); legs or a long skirt below.
    const top = man ? [[0.19, 0.8], ...upperPts(slim)] : [[0.215, 0.5], [0.2, 0.7], ...upperPts(slim)];
    clothes = ovalLathe([V(0, top[0][1] - 0.001), ...profile(top, 56), V(0.042, 1.5)], { depth: robeDepth, front: chestFront });
  } else {
    const pts = sit ? [[0.168, 0.8], ...upperPts(slim)] : longPts;
    clothes = ovalLathe([V(0, pts[0][1] - 0.001), ...profile(pts, 80), V(0.042, 1.5)], {
      depth: robeDepth, front: chestFront,
      ripple: sit ? null : (y, phi) => 0.03 * Math.sin(phi * 9 + 1.3) * smooth(0.6, 0.04, y) + 0.012 * Math.sin(phi * 4 + 0.4) * smooth(0.9, 0.1, y),
    });
  }
  weigh(clothes, robeWeights);
  const robe = new THREE.SkinnedMesh(clothes, casual ? fabric(spec.robe, { folds: 'sleeve' }) : robeMat);
  robe.frustumCulled = false;
  all.add(track(robe));
  robe.bind(new THREE.Skeleton([base, hip, chest]));

  // Seated lap and drape (static), or legs and skirt for casual outfits.
  const legs = {};
  if (sit) {
    const lapMat = casual ? fabric(man ? '#3A3833' : spec.robe, { folds: 'sleeve' }) : robeMat;
    const lap = track(new THREE.Mesh(new RoundedBoxGeometry(0.34 * slim, 0.16, 0.46, 5, 0.075), lapMat));
    lap.position.set(0, 0.5, 0.17);
    const drape = track(new THREE.Mesh(ovalLathe([V(0, 0.03), ...profile([[0.2, 0.035], [0.19, 0.2], [0.18, 0.42], [0.16, 0.52]], 24), V(0.0, 0.53)], { depth: () => 0.62 }), lapMat));
    drape.position.set(0, 0, 0.36);
    all.add(lap, drape);
  } else if (casual) {
    const legMat = fabric(man ? '#3A3833' : spec.robe === FABRIC.sandstone.base ? FABRIC.taupe.base : FABRIC.sandstone.base, { folds: 'sleeve' });
    if (man) {
      for (const s of ['R', 'L']) {
        // Thigh and shin, so a step bends the knee instead of swinging a pole.
        const g = new THREE.Group(); g.position.set((s === 'R' ? -1 : 1) * 0.085, 0.86, 0);
        const thigh = track(new THREE.Mesh(capsule(0.068, 0.36), legMat)); thigh.position.y = -0.21;
        const knee = new THREE.Group(); knee.position.y = -0.41;
        const shin = track(new THREE.Mesh(capsule(0.06, 0.34), legMat)); shin.position.y = -0.2;
        knee.add(shin); g.add(thigh, knee); all.add(g);
        g.userData.knee = knee; legs[s] = g;
      }
    } else {
      const skirt = track(new THREE.Mesh(ovalLathe([V(0, 0.03), ...profile([[0.25, 0.035], [0.235, 0.3], [0.2, 0.7], [0.17, 0.92]], 40), V(0, 0.93)], { depth: () => 0.78, ripple: (y, phi) => 0.025 * Math.sin(phi * 8) * smooth(0.5, 0.04, y) }), legMat));
      all.add(skirt);
    }
  }

  // Feet: sandals for dishdasha, flats for abaya, sneakers for casual menswear.
  const feet = {};
  const soleMat = new THREE.MeshPhysicalMaterial({ color: casual && man ? '#F2EEE6' : abaya || !man ? '#1E1C1B' : '#5A3F2C', roughness: 0.6 });
  for (const s of ['R', 'L']) {
    const f = new THREE.Group();
    f.position.set((s === 'R' ? -1 : 1) * 0.088, 0, sit ? 0.5 : s === 'R' ? 0.052 : 0.026);
    f.rotation.y = s === 'R' ? -0.14 : 0.17; // toes turned out a little, never parallel like a mannequin
    f.userData.rest = { z: f.position.z, ry: f.rotation.y };
    const sole = track(new THREE.Mesh(new RoundedBoxGeometry(0.088, casual && man ? 0.06 : 0.022, 0.25, 4, casual && man ? 0.024 : 0.009), soleMat));
    sole.position.set(0, casual && man ? 0.03 : 0.011, 0.02);
    f.add(sole);
    if (!casual && man) { const foot = track(new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.05, 0.2, 4, 0.024), skin)); foot.position.set(0, 0.04, 0.03); f.add(foot); }
    all.add(f); feet[s] = f;
  }

  // ----- sleeves (skinned to shoulder + elbow) -----
  const hands = {}, handPivots = {};
  for (const s of ['R', 'L']) {
    const sx = (s === 'R' ? -1 : 1) * SHOULDER.x * slim;
    const y0 = SHOULDER.y, ye = y0 - UPPER, yw = ye - FORE;
    const casualSleeve = casual;
    const pts = abaya
      ? [[0.06, yw + 0.005], [0.074, yw - 0.004], [0.066, yw + 0.07], [0.056, ye - 0.04], [0.052, ye + 0.06], [0.056, y0 - 0.08], [0.059, y0 - 0.03], [0.048, y0 + 0.012], [0.022, y0 + 0.03]]
      : [[0.046, yw + 0.005], [0.047, yw + 0.012], [0.049, yw + 0.08], [0.05, ye - 0.03], [0.051, ye + 0.06], [0.052, y0 - 0.08], [0.053, y0 - 0.03], [0.045, y0 + 0.012], [0.022, y0 + 0.03]];
    const geo = new THREE.LatheGeometry([V(0.026, yw + 0.006), ...profile(pts, 40), V(0, y0 + 0.032)], 32);
    geo.translate(sx, 0, -0.004);
    weigh(geo, (x, y) => (y > ye + 0.05 ? [0, 1, 1, 0] : y < ye - 0.05 ? [1, 1, 0, 0] : [0, smooth(ye - 0.05, ye + 0.05, y), 1, 1 - smooth(ye - 0.05, ye + 0.05, y)]));
    const sleeve = new THREE.SkinnedMesh(geo, casualSleeve ? fabric(spec.robe, { folds: 'sleeve' }) : sleeveMat);
    sleeve.frustumCulled = false;
    all.add(track(sleeve));
    sleeve.bind(new THREE.Skeleton([shoulders[s], elbows[s]]));
    if (abaya) {
      const cuff = track(new THREE.Mesh(new THREE.TorusGeometry(0.071, 0.0028, 8, 40), accentMat));
      cuff.rotation.x = Math.PI / 2; cuff.position.set(0, -FORE + 0.006, 0);
      elbows[s].add(cuff);
    }
    const hp = new THREE.Group(); // positioned and oriented in chest space each frame
    const hand = makeHand(skin, s === 'L');
    hand.scale.setScalar(1.2);
    hp.add(hand);
    chest.add(hp);
    hands[s] = hand; handPivots[s] = hp;
    hand.traverse((m) => m.isMesh && meshes.push(m));
  }

  // ----- neck and head -----
  const neck = new THREE.Group(); neck.position.set(0, 0.215, 0.004); chest.add(neck);
  const neckMesh = track(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.044, 0.12, 24), skin)); neckMesh.position.y = 0.03; neck.add(neckMesh);
  const head = new THREE.Bone(); head.position.set(0, 0.075, 0.006); neck.add(head);
  const HR = { x: 0.088, y: 0.113, z: 0.099 };
  const skull = track(new THREE.Mesh(headGeometry(HR.x, HR.y, HR.z), skin)); skull.position.set(0, HR.y * 0.62, 0.008); head.add(skull);
  const hc = skull.position; // head centre in head space
  const veiled = !man && spec.headwear !== 'none';
  if (!veiled) {
    // Ears: level with the eyes to the base of the nose, angled back.
    for (const s of [-1, 1]) {
      const ear = track(new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), skin));
      ear.scale.set(0.0095, 0.027, 0.016); ear.position.set(s * HR.x * 0.965, hc.y - 0.016, hc.z - 0.008); ear.rotation.set(0, s * 0.32, s * 0.06);
      head.add(ear);
    }
  }
  // Nose: bridge, a rounded tip and the two wings, sitting on the face surface.
  const surfZ = (y) => headShape(0, y / HR.y, Math.sqrt(Math.max(0, 1 - (y / HR.y) ** 2)), HR.x, HR.y, HR.z, 0.2)[2];
  {
    // One sculpted shape: a narrow bridge widening to soft wings, the tip carried forward in the lower third.
    const ng = new THREE.SphereGeometry(1, 32, 32);
    const np = ng.attributes.position;
    for (let i = 0; i < np.count; i++) {
      const x = np.getX(i), y = np.getY(i), z = np.getZ(i);
      const u = (1 - y) / 2; // 0 at the bridge top, 1 at the base
      const wdt = mix(0.0042, 0.0118, smooth(0.15, 0.95, u)) * (1 - 0.18 * smooth(0.92, 1, u));
      const fwd = mix(0.004, 0.0105, smooth(0.25, 0.82, u)) * (1 - 0.55 * smooth(0.88, 1, u));
      np.setXYZ(i, x * wdt, y * 0.0215, Math.max(-0.35, z) * fwd);
    }
    ng.computeVertexNormals();
    const nose = track(new THREE.Mesh(ng, skin));
    nose.position.set(0, -0.0165, surfZ(-0.0165) - 0.0012).add(hc);
    head.add(nose);
  }
  // Face (input.face: 'natural' by default, 'minimal' = eyes only, 'none' = faceless).
  const faceMode = input.face === 'none' ? 'none' : input.face === 'minimal' ? 'minimal' : 'natural';
  const browColor = spec.age === 'senior' ? (man ? '#8E887E' : '#4A3E34') : man ? spec.hair : '#2B211B';
  const beardTone = new THREE.Color((SKIN[spec.skin] || SKIN.medium).deep).lerp(new THREE.Color(spec.age === 'senior' ? HAIR.grey : HAIR.darkBrown), spec.age === 'senior' ? 0.7 : 0.42).getStyle();
  let faceRigInst = null;
  if (faceMode !== 'none') {
    faceRigInst = faceRig({ rx: HR.x, ry: HR.y, rz: HR.z, taper: 0.2, centre: hc, skin: spec.skin, brow: browColor, beard: spec.beard && man ? beardTone : null, woman: !man, minimal: faceMode === 'minimal',
      iris: ['#4A2F1E', '#3B2618', '#5A3B22'][spec.seed % 3],
      layout: { eye: { dx: 0.0285, dy: -0.004, w: man ? 0.0265 : 0.026, h: man ? 0.0112 : 0.0118 }, brow: { dy: 0.0168, inner: 0.0112, len: man ? 0.034 : 0.031 }, mouth: { dy: -0.0605, w: man ? 0.036 : 0.033 } } });
    head.add(faceRigInst.mesh);
  }
  if (spec.glasses) {
    const gm = new THREE.MeshPhysicalMaterial({ color: '#2A2622', metalness: 0.7, roughness: 0.3 });
    for (const s of [-1, 1]) { const r = track(new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.0024, 8, 28), gm)); r.position.set(s * 0.034, hc.y + 0.012, hc.z + HR.z * 0.9); head.add(r); }
    const br = track(new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.026, 6), gm)); br.rotation.z = Math.PI / 2; br.position.set(0, hc.y + 0.016, hc.z + HR.z * 0.96); head.add(br);
  }

  // Headwear
  if (man && spec.headwear === 'kumma') {
    const km = kummaMaps(spec.accent, spec.seed);
    const capMat = new THREE.MeshPhysicalMaterial({ map: km, bumpMap: km, bumpScale: 1.5, roughness: 0.8, sheen: 0.5, sheenColor: new THREE.Color('#FFFFFF') });
    const cap = new THREE.Group(); cap.position.set(0, hc.y + 0.062, hc.z - 0.008); cap.rotation.x = -0.12; head.add(cap);
    const band = track(new THREE.Mesh(new THREE.CylinderGeometry(HR.x * 1.03, HR.x * 1.06, 0.07, 48, 1, true), capMat)); band.scale.z = HR.z / HR.x; band.material.side = THREE.DoubleSide; cap.add(band);
    const top = track(new THREE.Mesh(new THREE.SphereGeometry(HR.x * 1.03, 48, 12, 0, TAU, 0, Math.PI * 0.5), new THREE.MeshPhysicalMaterial({ color: '#F4F0E8', roughness: 0.8, sheen: 0.5, sheenColor: new THREE.Color('#FFFFFF') })));
    top.scale.set(1, 0.22, HR.z / HR.x); top.position.y = 0.035; cap.add(top);
  } else if (man && spec.headwear === 'massar') {
    const mm = new THREE.MeshPhysicalMaterial({ map: massarMaps(spec.seed), roughness: 0.82, sheen: 0.6, sheenColor: new THREE.Color('#E9D2A6') });
    const wrap = new THREE.Group(); wrap.position.set(0, hc.y + 0.058, hc.z - 0.008); wrap.rotation.x = -0.08; head.add(wrap);
    for (let i = 0; i < 4; i++) {
      const t = track(new THREE.Mesh(new THREE.TorusGeometry(HR.x * (1.02 - i * 0.07), 0.026 - i * 0.002, 14, 48), mm));
      t.rotation.set(Math.PI / 2 + (i % 2 ? 0.1 : -0.08), i % 2 ? 0.06 : -0.05, 0); t.scale.set(1, HR.z / HR.x, 1);
      t.position.y = i * 0.026; wrap.add(t);
    }
    const crown = track(new THREE.Mesh(new THREE.SphereGeometry(HR.x * 0.82, 36, 12, 0, TAU, 0, Math.PI * 0.5), mm)); crown.scale.set(1, 0.45, HR.z / HR.x); crown.position.y = 0.075; wrap.add(crown);
  } else if (man || spec.headwear === 'none') {
    // Short hair: a shell just outside the skull, tucked inside it below a hairline (high at the forehead,
    // above the ears, low at the nape), so the edge is clean from every angle.
    const hg = new THREE.SphereGeometry(1, 128, 80);
    const hpz = hg.attributes.position;
    for (let i = 0; i < hpz.count; i++) {
      const x = hpz.getX(i), y = hpz.getY(i), z = hpz.getZ(i);
      const side = Math.abs(x) / (Math.hypot(x, z) || 1);
      const line = z > 0 ? 0.42 - 0.3 * side : 0.12 - 0.42 * (-z) ** 0.8 * (1 - side * 0.5);
      const k = smooth(line - 0.035, line + 0.035, y);
      const r = 0.95 + 0.11 * k + 0.03 * k * Math.max(0, y);
      // Same jaw taper as the head, so the tucked-in part never pokes through the cheeks.
      const [X, Y, Z] = headShape(x, y, z, HR.x, HR.y, HR.z, 0.2);
      hpz.setXYZ(i, X * r, Y * r, Z * r);
    }
    hg.computeVertexNormals();
    const hair = track(new THREE.Mesh(hg, hairMat(spec.hair)));
    hair.position.copy(hc); head.add(hair);
  } else {
    // Hijab: one continuous drape from the crown over the shoulders, skinned to head and chest so it turns with the
    // head and settles on the shoulders. The face is a separate oval that meets the veil cleanly at the opening.
    const veilMat = fabric(spec.scarf, { satin: true, folds: 'scarf', normalScale: 0.75 });
    veilMat.side = THREE.DoubleSide;
    all.updateMatrixWorld(true);
    const hcw = hc.clone().applyMatrix4(head.matrixWorld).applyMatrix4(new THREE.Matrix4().copy(all.matrixWorld).invert());
    const w = slim;
    const hoodPts = spec.headwear === 'sheila' ? [[0.222 * w, 1.3], [0.22 * w, 1.34], [0.2 * w, 1.395], [0.152, 1.435], [0.106, 1.47],
      [0.093, hcw.y - 0.088], [0.098, hcw.y - 0.05], [0.102, hcw.y], [0.095, hcw.y + 0.055], [0.072, hcw.y + 0.097], [0.034, hcw.y + 0.119], [0.0, hcw.y + 0.124]]
      : [[0.196 * w, 1.37], [0.19 * w, 1.398], [0.162, 1.428], [0.12, 1.458], [0.1, 1.48], [0.092, hcw.y - 0.088], [0.098, hcw.y - 0.05], [0.102, hcw.y], [0.095, hcw.y + 0.055], [0.072, hcw.y + 0.097], [0.034, hcw.y + 0.119], [0.0, hcw.y + 0.124]];
    const hoodGeo = ovalLathe(profile(hoodPts, 110), {
      segments: 120,
      depth: (y) => mix(0.66, 1.0, smooth(1.43, 1.53, y)),
      ripple: (y, phi) => 0.018 * Math.sin(phi * 7 + 0.6) * smooth(1.44, 1.32, y),
    });
    const cy = hcw.y - 0.012, ow = 0.068, oh = 0.08; // the face opening; ends just above the chin, the fabric wraps under it
    // Skull surface in front (all space), so the fabric can wrap the cheeks and forehead instead of standing off them.
    const skullZ = (x, y) => { const ly = (y - hcw.y) / HR.y; const k = ly < 0 ? 1 - 0.12 * (-ly) ** 1.6 : 1; return hcw.z + HR.z * k * Math.sqrt(Math.max(0, 1 - (x / HR.x) ** 2 - ly * ly)); };
    const hp = hoodGeo.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
      const cf = Math.max(0, z) / Math.hypot(x, z || 1e-6);
      // The front hangs lower over the chest; the head part sits forward over the face.
      const dy = -(spec.headwear === 'sheila' ? 0.09 : 0.075) * cf * cf * smooth(1.44, 1.37, y);
      let nz = z + (hcw.z + 0.004) * smooth(1.44, 1.54, y);
      const e = Math.hypot(x / ow, (y + dy - cy) / oh);
      if (nz > hcw.z && e < 1.7) {
        const target = skullZ(x, y + dy) + 0.0035 + 0.018 * smooth(1, 1.7, e) ** 1.5;
        if (target < nz) nz = mix(target, nz, smooth(1.02, 1.7, e));
      }
      hp.setXYZ(i, x, y + dy, nz);
    }
    hoodGeo.computeVertexNormals();
    // Opening for the face: drop the triangles in front of it (the real head shows through), then edge it with a
    // soft band of the same fabric so the cut reads as a folded hem.
    const inside = (x, y, z) => z > hcw.z + 0.02 && (x / ow) ** 2 + ((y - cy) / oh) ** 2 < 1;
    {
      const idx = hoodGeo.index.array, keep = [];
      const P3 = hoodGeo.attributes.position;
      for (let i = 0; i < idx.length; i += 3) {
        const [a, b, c2] = [idx[i], idx[i + 1], idx[i + 2]];
        const x = (P3.getX(a) + P3.getX(b) + P3.getX(c2)) / 3, y = (P3.getY(a) + P3.getY(b) + P3.getY(c2)) / 3, z = (P3.getZ(a) + P3.getZ(b) + P3.getZ(c2)) / 3;
        if (!inside(x, y, z)) keep.push(a, b, c2);
      }
      hoodGeo.setIndex(keep);
    }
    weigh(hoodGeo, (x, y) => (y > hcw.y - 0.06 ? [1, 1, 0, 0] : y < 1.46 ? [0, 1, 1, 0] : [1, smooth(1.46, hcw.y - 0.06, y), 0, 1 - smooth(1.46, hcw.y - 0.06, y)]));
    const hood = new THREE.SkinnedMesh(hoodGeo, veilMat);
    hood.frustumCulled = false;
    all.add(track(hood));
    hood.bind(new THREE.Skeleton([chest, head]));
    // The band around the face, laid on the veil's surface (head space, so it turns with the head).
    const prof = profile(hoodPts, 72);
    const rAt = (y) => { for (let i = 1; i < prof.length; i++) if (prof[i].y >= y) { const a0 = prof[i - 1], a1 = prof[i]; return mix(a0.x, a1.x, (y - a0.y) / Math.max(1e-6, a1.y - a0.y)); } return prof[prof.length - 1].x; };
    const dAt = (y) => mix(0.66, 1.0, smooth(1.43, 1.53, y)), zShift = (y) => (hcw.z + 0.004) * smooth(1.44, 1.54, y);
    const bandPts = range(0, TAU, 72, (u) => {
      const x = Math.sin(u) * ow * 0.98, y = cy + Math.cos(u) * oh * 0.98;
      const z = Math.min(zShift(y) + dAt(y) * Math.sqrt(Math.max(0, rAt(y) ** 2 - x * x)), skullZ(x, y) + 0.0035);
      return V(x, y, z).sub(hcw).add(hc);
    });
    const band = track(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bandPts, true), 128, 0.0042, 10, true), veilMat));
    head.add(band);
  }

  // Dishdasha collar band and furakha tassel.
  if (spec.outfit === 'dishdasha') {
    const frontZ = (y) => robeDepth(y) * mix(0.182, 0.15, smooth(1.26, 1.448, y)) + chestFront(y) + 0.004;
    const curve = new THREE.CatmullRomCurve3([V(0, 1.47, 0.046), V(0, 1.44, frontZ(1.44)), V(0, 1.38, frontZ(1.38) + 0.004), V(0, 1.3, frontZ(1.3) + 0.006), V(0, 1.24, frontZ(1.24) + 0.008)].map((v) => v.sub(V(0, 1.25, 0))));
    const cord = track(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.0035, 8), accentMat));
    const tip = curve.getPoint(1);
    const tassel = track(new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.04, 16), accentMat)); tassel.position.copy(tip).add(V(0, -0.016, 0.002));
    const knot = track(new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 10), accentMat)); knot.position.copy(tip);
    chest.add(cord, tassel, knot);
  }

  // ----- the held prop -----
  const pose = POSES3D[spec.pose];
  const mirror = spec.facing === 'left';
  const near = mirror ? 'L' : 'R', far = mirror ? 'R' : 'L';
  const propName = spec.prop || pose.defaultProp || null;
  let prop = null, propMode = null;
  if (propName) {
    prop = prop3d(propName, { lang: spec.lang, theme: spec.theme });
    if (prop) {
      if (pose.prop?.both) { propMode = 'both'; chest.add(prop); }
      else if (!GRIPS[propName]) { propMode = 'floor'; prop.position.set(mirror ? 0.36 : -0.36, propName === 'giftbox' ? 0.075 : 0, 0.16); all.add(prop); }
      else {
        propMode = 'hand';
        const grip = GRIPS[propName];
        prop.position.fromArray(grip.pos); prop.rotation.fromArray(grip.rot);
        if (near === 'L') { prop.position.x *= -1; }
        hands[near].add(prop);
      }
      prop.traverse((m) => m.isMesh && meshes.push(m));
    }
  }
  if (sit && input.seat !== 'none') {
    const light = spec.theme === 'cream' || spec.theme === 'sand';
    const seat = track(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.26, 0.42, 48), materials.velvet({ color: light ? '#CDB898' : '#2E2620', sheenColor: light ? '#FFF1D8' : '#C8943D' })));
    seat.position.set(0, 0.21, 0.04);
    all.add(seat);
  }

  // ----- posing -----
  const facingAngle = spec.facing === 'right' ? 0.62 : spec.facing === 'left' ? -0.62 : 0;
  root.rotation.y = facingAngle;
  const mood = MOODS[spec.mood] || {};
  const faceMood = FACE_MOODS[input.mood] || FACE_MOODS[pose.mood] || FACE_MOODS.neutral;
  const loop = !!input.loop, period = loop ? Math.max(1, Number(input.dur) || 6) : 0;
  const enter = input.enter !== false && !loop && !pose.sit;
  const seed = spec.seed * 3.7 + (man ? 0 : 11) + (spec.skin?.length || 0);
  const chestInv = new THREE.Matrix4(), tmpM = new THREE.Matrix4();
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qp = new THREE.Quaternion(), qi = new THREE.Quaternion();
  const mx = (a) => (mirror ? [-a[0], a[1], a[2]] : a);
  const osc = (t, seconds, phase = 0) => (period ? Math.sin(TAU * Math.max(1, Math.round(period / seconds)) * t / period + phase) : Math.sin((t / seconds) * TAU + phase));
  const SH = { R: V(-SHOULDER.x * slim, SHOULDER.y, -0.004), L: V(SHOULDER.x * slim, SHOULDER.y, -0.004) };
  const LATERAL = { R: V(-0.72, -0.3, 0.62).normalize(), L: V(0.72, -0.3, 0.62).normalize() };
  const slerpV = (a, b, k) => a.clone().applyQuaternion(qi.identity().slerp(new THREE.Quaternion().setFromUnitVectors(a, b), k));
  const gripShape = propMode === 'hand' ? GRIPS[propName].shape : null;

  function armTarget(side, d, extra) {
    // Mirror: the authored R arm becomes the L arm and x flips.
    return { t: V(...mx(d.t)).add(extra), palm: V(...mx(d.palm || [0, 0, 1])).normalize(), pole: V(...mx(d.pole || (side === (mirror ? 'L' : 'R') ? [-1, -0.4, -0.7] : [1, -0.4, -0.7]))).normalize(), shape: d.shape || 'relax', bend: d.bend ?? 0.12, hold: d.hold };
  }
  /** Rest → pose: the wrist travels on an arc around the shoulder (never through the body); the hand settles later. */
  function blendArm(side, A, B, k) {
    if (k >= 1) return B;
    const S = SH[side];
    const a = A.t.clone().sub(S), b = B.t.clone().sub(S);
    const la = a.length(), lb = b.length(); a.normalize(); b.normalize();
    const dir = a.dot(b) < -0.2 ? (k < 0.5 ? slerpV(a, LATERAL[side], k * 2) : slerpV(LATERAL[side], b, k * 2 - 1)) : slerpV(a, b, k);
    const kh = clamp(k * 1.3 - 0.3);
    return {
      t: S.clone().addScaledVector(dir, mix(la, lb, k) * (1 - 0.3 * Math.sin(Math.PI * k) * (a.dot(b) < 0.3 ? 1 : 0.4))), // elbows bend on the way
      palm: slerpV(A.palm, B.palm.dot(A.palm) < -0.99 ? B.palm.clone().add(V(0, 0.01, 0)).normalize() : B.palm, kh),
      pole: A.pole.clone().lerp(B.pole, k).normalize(),
      shape: shapeMix(shapeOf(A.shape), shapeOf(B.shape), kh),
      bend: mix(A.bend, B.bend, kh),
    };
  }

  function solveArm(side, target, shrug, { tap = 0, fingerTap = 0, roll = 0 } = {}) {
    const sh = shoulders[side], el = elbows[side];
    // Everything in chest space. A raised arm lifts the shoulder with it.
    const T = target.t.clone().applyMatrix4(chestInv);
    const rest = V(sh.position.x, SHOULDER.y - 1.25, -0.004);
    const lift = clamp((T.y - (rest.y - 0.12)) / 0.45);
    sh.position.set(rest.x, rest.y + shrug + 0.028 * lift, rest.z + 0.008 * lift);
    const S = sh.position.clone();
    const pole = target.pole.clone().transformDirection(chestInv);
    const palm = target.palm.clone().transformDirection(chestInv);
    const d = T.clone().sub(S);
    let len = d.length();
    len = clamp(len, Math.abs(UPPER - FORE) + 0.02, UPPER + FORE - 0.003);
    const dir = d.normalize();
    const W = S.clone().addScaledVector(dir, len);
    const x = (UPPER * UPPER - FORE * FORE + len * len) / (2 * len);
    const h = Math.sqrt(Math.max(0, UPPER * UPPER - x * x));
    const p = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir)));
    if (p.lengthSq() < 1e-6) p.set(0, 0, -1);
    p.normalize();
    const E = S.clone().addScaledVector(dir, x).addScaledVector(p, h);
    // Bones point down their -Y axis.
    basis(S.clone().sub(E), p, qa); // upper arm orientation (chest space)
    sh.quaternion.copy(qa);
    basis(E.clone().sub(W), p, qb); // forearm orientation (chest space)
    el.quaternion.copy(qa).invert().multiply(qb);
    // Hand: fingers continue the forearm, bent towards the palm.
    const f = W.clone().sub(E).normalize();
    let n = palm.clone().sub(f.clone().multiplyScalar(palm.dot(f)));
    if (n.lengthSq() < 1e-6) n = p.clone().negate();
    n.normalize();
    const fb = f.clone().multiplyScalar(Math.cos(target.bend)).addScaledVector(n, Math.sin(target.bend)).normalize();
    // A forearm only turns so far: keep the palm within ~110° of the neutral, thumb-up position (palm towards the
    // body), so a hand can never end up twisted backwards.
    const med = V(side === 'R' ? 1 : -1, 0, 0);
    let n0 = med.sub(fb.clone().multiplyScalar(med.dot(fb)));
    if (n0.lengthSq() < 1e-4) n0 = V(0, 1, 0).sub(fb.clone().multiplyScalar(fb.y));
    n0.normalize();
    n.sub(fb.clone().multiplyScalar(n.dot(fb))).normalize();
    const LIM = 1.92;
    if (Math.acos(clamp(n.dot(n0), -1, 1)) > LIM) {
      const axis = V().crossVectors(n0, n);
      if (axis.lengthSq() < 1e-8) axis.copy(fb);
      n = n0.clone().applyAxisAngle(axis.normalize(), LIM);
    }
    const hp = handPivots[side];
    hp.position.copy(W);
    basis(fb, n, qp);
    if (roll) qp.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), roll));
    hp.quaternion.copy(qp);
    hands[side].userData.set(target.shape, { tap, fingerTap });
  }

  function update(t = 0) {
    const P = POSES3D[spec.pose];
    const T = period ? ((t % period) + period) % period : Math.max(0, t);
    // Entrance: body first, the near arm, the far arm a beat later, then head and face.
    const both = P.both || propMode === 'both';
    const eBody = enter ? easeIO(T / 0.7) : 1;
    const eNear = enter ? easeIO((T - 0.1) / 0.78) : 1;
    const eFar = enter ? (both ? eNear : easeIO((T - 0.28) / 0.72)) : 1;
    const eHead = enter ? easeIO((T - 0.16) / 0.72) : 1;
    const eFace = enter ? easeIO((T - 0.3) / 0.6) : 1;
    const lt = enter ? Math.max(0, T - 0.95) : T + 2;
    const c = { seed, period };
    const a = P.act ? P.act(lt, c) : {};
    const walk = !!P.walk;

    // Idle: breathing, a weight shift every few seconds, gaze that changes with eased holds, blinks.
    const br = osc(T, 4.1 * (mood.breathe || 1), ph);
    const ws = lastEvent(T, seed + 20, 4.6, 8.2, 1.4, period);
    const side0 = rnd(seed) > 0.5 ? 1 : -1;
    const sideAt = (i) => (i < 0 ? side0 : i % 2 ? side0 : -side0);
    const shift = walk ? 0 : ws.i < 0 ? side0 : mix(sideAt(ws.i - 1), sideAt(ws.i), easeIO(ws.dt / 1.2));
    const gz = lastEvent(T, seed + 30, 1.3, 3.6, 0.5, period);
    const gT = (i) => (i < 0 ? [0, 0] : [(rnd(seed + i * 3.3) - 0.5) * 2, (rnd(seed + i * 5.1) - 0.5) * 1.2]);
    const g0 = gT(gz.i - 1), g1 = gT(gz.i);
    const eyeK = easeIO(gz.dt / 0.09), headK = easeIO((gz.dt - 0.04) / 0.34); // the eyes lead, the head follows
    const focus = P.focus ?? 1;
    const look = [mix(g0[0], g1[0], eyeK) * 0.6 * focus, mix(g0[1], g1[1], eyeK) * 0.6 * focus];
    const headLook = [mix(g0[0], g1[0], headK) * focus, mix(g0[1], g1[1], headK) * focus];
    const bl = lastEvent(T, seed + 40, 2.3, 5.4, 0.9, period);
    const lidAt = (d) => (d < 0 ? 0 : d < 0.07 ? d / 0.07 : d < 0.19 ? 1 - (d - 0.07) / 0.12 : 0);
    let blink = bl.dt >= 0 ? lidAt(bl.dt) : 0;
    if (bl.dt >= 0 && rnd(seed + bl.i * 1.9) < 0.18) blink = Math.max(blink, lidAt(bl.dt - 0.27)); // an occasional double blink
    if (enter && T > 0.32 && T < 0.5) blink = Math.max(blink, lidAt(T - 0.32)); // a blink as they settle into the pose

    // Body
    const WP = 1.05;
    const wp = walk ? (period ? TAU * Math.max(1, Math.round(period / WP)) * T / period : (T / WP) * TAU) : 0;
    const dip = P.enterDip && enter ? -P.enterDip * env(T, 0.18, 0.04, 0.3) : 0;
    base.position.set((walk ? 0.012 * Math.sin(wp) : 0.009 * shift) + 0.0015 * drift(T, seed + 1, 0.6, period), (a.dy || 0) + dip + (walk ? 0.011 * Math.cos(2 * wp) - 0.004 : 0) - (P.sit ? 0.42 : 0), 0);
    const senior = spec.age === 'senior';
    hip.rotation.set(mix(0, (P.lean || 0) + (mood.lean || 0), eBody) + (a.lean || 0) + (senior ? 0.05 : 0) + (walk ? 0.035 : 0), walk ? 0.07 * Math.sin(wp) : 0.012 * drift(T, seed + 2, 0.5, period), walk ? 0.03 * Math.sin(wp) : 0.022 * shift);
    chest.rotation.set(mix(0, (P.chest || 0) + (mood.chest || 0), eBody) + (a.chest || 0) + br * 0.009 + (senior ? 0.06 : 0), walk ? -0.09 * Math.sin(wp) : 0.008 * drift(T, seed + 3, 0.6, period), walk ? -0.02 * Math.sin(wp) : -0.03 * shift);
    chest.position.y = 0.3 + br * 0.0018;
    // Head
    const hd = P.head || {};
    const tilt = mix(0, (hd.tilt || 0) + (mood.tilt || 0), eHead) + (a.headTilt || 0) - 0.035 * headLook[1] + 0.012 * drift(T, seed + 4, 0.9, period);
    const turn = (mix(0, (hd.turn || 0) + (mood.turn || 0), eHead) + (a.headTurn || 0)) * (mirror ? -1 : 1) + 0.06 * headLook[0] + (walk ? 0.07 * Math.sin(wp) : 0);
    const roll = (mix(0, (hd.roll || 0) + (mood.roll || 0), eHead) + (a.headRoll || 0)) * (mirror ? -1 : 1) + 0.025 * shift;
    neck.rotation.set(tilt * 0.35, turn * 0.3, 0);
    head.rotation.set(tilt * 0.65, turn * 0.7, roll);
    // Feet: planted with a natural stance; the walk rolls heel to toe and lifts the swinging foot.
    for (const s of ['R', 'L']) {
      const f = feet[s], r = f.userData.rest;
      if (walk) {
        const q = wp + (s === 'R' ? 0 : Math.PI);
        const swing = Math.max(0, Math.cos(q));
        f.position.z = 0.04 + 0.15 * Math.sin(q);
        f.position.y = 0.045 * swing ** 1.5;
        f.rotation.set(-0.3 * Math.sin(q) * (1 - swing) + 0.2 * swing * Math.sin(q), r.ry * 0.5, 0);
      } else if (!P.sit) { f.position.set(f.position.x, 0, r.z); f.rotation.set(0, r.ry, 0); }
      if (legs[s]) {
        const q = wp + (s === 'R' ? 0 : Math.PI);
        legs[s].rotation.x = walk ? -0.34 * Math.sin(q) - 0.06 : 0;
        legs[s].userData.knee.rotation.x = walk ? 0.55 * Math.max(0, Math.cos(q)) ** 1.2 + 0.05 : 0.02; // knee bends through the swing
      }
    }
    all.updateMatrixWorld(true);
    tmpM.copy(all.matrixWorld).invert();
    chestInv.copy(tmpM.multiply(chest.matrixWorld)).invert();
    // chestInv maps all-space → chest space; targets are authored in "all" space.

    // Arms
    const shrug = mix(0, (P.shrug || 0) + (mood.shrug || 0), eBody) + (a.shrug || 0);
    const extra = (k) => V(...mx(a[k] || [0, 0, 0])).add(V(...(a.all || [0, 0, 0])));
    let Rdef = P.R, Ldef = P.L;
    if (propMode === 'hand' && !P.R.hold) Rdef = P.sit ? P.holdAt : CARRY[propName] || CARRY.phone;
    const nearPose = armTarget(near, Rdef, extra('R'));
    const farPose = armTarget(far, Ldef, extra('L'));
    if (walk) {
      // Arms swing against the legs, a touch behind them, elbows soft.
      const sw = Math.sin(wp - 0.25);
      if (!nearPose.hold) nearPose.t.add(V(0, 0.012 * Math.abs(sw), -0.14 * sw));
      farPose.t.add(V(0, 0.012 * Math.abs(sw), 0.14 * sw));
    }
    if (gripShape) nearPose.shape = Rdef.hold ? Rdef.shape : gripShape;
    const nearRest = armTarget(near, P.sit ? P.R : D.R, V());
    const farRest = armTarget(far, P.sit ? P.L : D.L, V());
    if (gripShape) nearRest.shape = gripShape; // the prop is already in the hand
    const handRoll = (a.handRoll || 0) * (mirror ? -1 : 1);
    solveArm(near, blendArm(near, nearRest, nearPose, eNear), shrug, { tap: a.tap || 0, fingerTap: a.fingerTap || 0, roll: handRoll });
    solveArm(far, blendArm(far, farRest, farPose, eFar), shrug, {});
    if (propMode === 'both') {
      // The box rides between the hands, so it rises with them.
      const mid = handPivots.R.position.clone().add(handPivots.L.position).multiplyScalar(0.5);
      const authored = V(...mx(P.prop.at)).sub(V(...mx(P.R.t)).add(V(...mx(P.L.t))).multiplyScalar(0.5));
      const len = authored.length(); // read before transformDirection normalises it in place
      prop.position.copy(mid).add(authored.transformDirection(chestInv).multiplyScalar(len));
      prop.quaternion.setFromRotationMatrix(tmpM.extractRotation(chestInv));
    }
    // Face
    if (faceRigInst) {
      let fm = lerpMood(FACE_MOODS.neutral, faceMood, eFace);
      if (a.face) fm = { ...fm, ...Object.fromEntries(Object.entries(a.face).map(([k, v]) => [k, fm[k] + v])) };
      const eyes = P.eyes || [0, 0];
      const ex = mix(0, eyes[0], eHead) * (mirror ? -1 : 1) + look[0] + (a.eyes ? a.eyes[0] : 0);
      const ey = mix(0, eyes[1], eHead) + look[1] + (a.eyes ? a.eyes[1] : 0);
      faceRigInst.set({ mood: fm, blink, look: [clamp(ex, -1.2, 1.2), clamp(ey, -1.2, 1.2)] });
    }
    root.updateMatrixWorld(true);
  }

  update(0);
  for (const m of meshes) { m.castShadow = true; m.receiveShadow = true; }
  const tmpBox = new THREE.Box3();
  return {
    group: root, spec, update,
    height: (man ? 1.79 : 1.69) * scale,
    /** Bounds in world space after the last update. */
    box: () => tmpBox.setFromObject(root, true),
    hands, prop,
  };
}
