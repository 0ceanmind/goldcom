// Stylized 3D people for Goldcom scenes.
// The look is a soft-matte "designer figure": clean volumes, real fabric sheen and folds, Omani dress, and no
// drawn faces. Body language carries the mood (head, shoulders, hands), which keeps the figures calm and premium
// instead of cartoonish. Built from the same spec as the illustrated characters:
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

/** Ellipsoid that narrows towards the bottom (a head with a gentle jaw). */
function headGeometry(rx, ry, rz, taper = 0.2, seg = 48) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = y < 0 ? 1 - taper * (-y) ** 1.6 : 1 - 0.04 * y * y;
    x *= rx * k; z *= rz * (y < 0 ? 1 - taper * 0.6 * (-y) ** 1.6 : 1); y *= ry;
    if (z > 0 && y < 0) z += rz * 0.06 * Math.sin(Math.PI * clamp(-y / ry)); // chin forward a touch
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
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
const HAND_SHAPES = {
  relax: { c1: 0.5, c2: 0.55, thumb: 0.15, spread: 0 },
  open: { c1: 0.06, c2: 0.06, thumb: 0.9, spread: 0.06 },
  hold: { c1: 1.05, c2: 0.95, thumb: 1.15, spread: 0 },
  pinch: { c1: 0.7, c2: 0.6, thumb: 1.25, spread: 0 },
  fist: { c1: 1.55, c2: 1.45, thumb: 1.3, spread: 0 },
  point: { c1: 1.55, c2: 1.45, thumb: 1.2, spread: 0, index: true },
  flat: { c1: 0.0, c2: 0.0, thumb: 0.55, spread: 0 },
};

/** Hand: palm, four two-segment fingers, thumb. Wrist at origin, fingers +Y, palm faces +Z, thumb +X. */
const FINGERS = [ // x across the palm (thumb side +), radius, proximal and distal length, spread, extra curl
  { x: 0.0225, r: 0.0084, l1: 0.029, l2: 0.025, spread: 0.05, curl: 0 },
  { x: 0.0075, r: 0.0088, l1: 0.032, l2: 0.027, spread: 0, curl: 0.04 },
  { x: -0.0075, r: 0.0084, l1: 0.03, l2: 0.025, spread: -0.04, curl: 0.08 },
  { x: -0.0222, r: 0.0074, l1: 0.023, l2: 0.02, spread: -0.1, curl: 0.14 },
];
function makeHand(mat, left) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  if (left) inner.scale.x = -1;
  g.add(inner);
  const parts = [];
  const add = (parent, m) => { m.castShadow = true; m.receiveShadow = true; parent.add(m); parts.push(m); return m; };
  const palm = add(inner, new THREE.Mesh(new RoundedBoxGeometry(0.066, 0.08, 0.026, 4, 0.0115), mat));
  palm.position.set(0, 0.037, 0);
  const fingers = FINGERS.map((f) => {
    const k1 = new THREE.Group(); k1.position.set(f.x, 0.072, 0.001);
    const p1 = add(k1, new THREE.Mesh(capsule(f.r, f.l1 - f.r * 2, 10), mat)); p1.position.y = f.l1 / 2;
    const k2 = new THREE.Group(); k2.position.y = f.l1;
    const p2 = add(k2, new THREE.Mesh(capsule(f.r * 0.94, f.l2 - f.r * 2, 10), mat)); p2.position.y = f.l2 / 2 - f.r * 0.3;
    k1.add(k2); inner.add(k1);
    return { ...f, k1, k2 };
  });
  const tb = new THREE.Group(); tb.position.set(0.027, 0.016, 0.006);
  const t1 = add(tb, new THREE.Mesh(capsule(0.0112, 0.024, 10), mat)); t1.position.y = 0.022;
  inner.add(tb);
  g.userData.set = (shape = 'relax', tap = 0) => {
    const s = HAND_SHAPES[shape] || HAND_SHAPES.relax;
    fingers.forEach((f, i) => {
      const straight = s.index && i === 0;
      f.k1.rotation.set(straight ? 0.05 : s.c1 + f.curl * (0.5 + s.c1), 0, f.spread * (0.6 + (s.spread || 0) * 6));
      f.k2.rotation.x = straight ? 0.04 : s.c2 + f.curl;
    });
    // Thumb swings from alongside the palm (0) to opposing the fingers (≈1.2).
    tb.rotation.set(0.3 + 0.7 * s.thumb - tap * 0.4, 0, -0.18 - 0.3 * Math.min(1, s.thumb));
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
  phone: { pos: [0.004, 0.058, 0.02], rot: [0, 0, 0], shape: 'hold' },
  goldbar: { pos: [0.006, 0.06, 0.016], rot: [0, 0, 0], shape: 'pinch' },
  receipts: { pos: [0.01, 0.03, 0.014], rot: [0, 0, 0.2], shape: 'pinch' },
  bag: { pos: [0, 0.07, 0.012], rot: [0, Math.PI / 2, Math.PI], shape: 'hold' },
  'shopping-bag': { pos: [0, 0.07, 0.012], rot: [0, Math.PI / 2, Math.PI], shape: 'hold' },
  coffee: { pos: [0.004, 0.048, 0.046], rot: [0, 0, -Math.PI / 2], shape: 'hold' },
  coin: { pos: [0.01, 0.07, 0.02], rot: [0, 0, 0], shape: 'pinch' },
};

// ---------- poses ----------
// Wrist targets in figure space (metres) for a figure facing +z with the near hand = R (-x). Facing left mirrors x.
// palm: direction the palm faces. pole: where the elbow points. shape: hand shape. hold: prop on that hand.
const D = { R: { t: [-0.232, 0.862, 0.045], palm: [1, 0, 0.2], shape: 'relax', pole: [-0.35, 0, -1] }, L: { t: [0.232, 0.862, 0.045], palm: [-1, 0, 0.2], shape: 'relax', pole: [0.35, 0, -1] } };
export const POSES3D = {
  stand: { label: 'Standing, relaxed, arms at the sides', R: D.R, L: D.L },
  phone: {
    label: 'Looking down at a phone held at chest height, thumb scrolling',
    head: { tilt: 0.36, turn: -0.06 },
    R: { t: [-0.07, 1.13, 0.26], palm: [0.1, 0.85, -0.5], shape: 'hold', pole: [-1, -0.6, -0.2], hold: true }, L: D.L,
    anim: (t, ph) => { const g = Math.max(0, wave(t, 3.4, ph)) ** 4; return { headTilt: -0.32 * g, tap: Math.sin(t * TAU * 1.5) > 0.4 ? 1 : 0 }; },
  },
  'phone-happy': {
    label: 'Smiling at good news on the phone, free hand in a small fist pump',
    head: { tilt: 0.18, turn: -0.04 }, chest: -0.04,
    R: { t: [-0.08, 1.16, 0.27], palm: [0.1, 0.8, -0.55], shape: 'hold', pole: [-1, -0.6, -0.2], hold: true },
    L: { t: [0.19, 1.1, 0.19], palm: [-0.7, 0.2, 0.5], shape: 'fist', pole: [0.5, -0.4, -1] },
    anim: (t, ph) => { const p = Math.max(0, Math.sin((t / 1.3) * TAU + ph)) ** 2; return { dy: 0.01 * p, L: [0.01 * p, -0.05 * p, -0.03 * p] }; },
  },
  stressed: {
    label: 'Worried, holding a messy handful of receipts, head down, hand at the temple',
    head: { tilt: 0.34, roll: 0.12 }, shrug: 0.022, lean: 0.04,
    R: { t: [-0.1, 1.04, 0.25], palm: [0.3, 0.7, -0.4], shape: 'pinch', pole: [-1, -0.5, -0.2], hold: true },
    L: { t: [0.075, 1.6, 0.095], palm: [-0.7, 0.1, -0.6], shape: 'open', pole: [1, 0.2, -0.3], bend: -0.2 },
    anim: (t, ph) => ({ headTurn: 0.08 * wave(t, 1.8, ph) }),
  },
  thinking: {
    label: 'Thinking: hand at the chin, other arm across the waist, eyes up',
    head: { tilt: -0.14, roll: 0.14, turn: 0.12 },
    R: { t: [-0.035, 1.43, 0.16], palm: [0.5, 0.1, -0.85], shape: 'relax', pole: [-0.3, -1, 0.1] },
    L: { t: [-0.035, 1.14, 0.17], palm: [0, 1, 0.15], shape: 'relax', pole: [1, -0.3, -0.5], bend: 0.15 }, // cups the other elbow
    anim: (t, ph) => ({ headTurn: 0.05 * wave(t, 4.2, ph) }),
  },
  celebrate: {
    label: 'Celebrating with both arms up, small bounce',
    head: { tilt: -0.2 }, chest: -0.06,
    R: { t: [-0.34, 1.9, 0.08], palm: [0.3, 0, 0.9], shape: 'fist', pole: [-1, 0, -0.2] },
    L: { t: [0.34, 1.9, 0.08], palm: [-0.3, 0, 0.9], shape: 'fist', pole: [1, 0, -0.2] },
    anim: (t, ph) => { const b = Math.abs(Math.sin((t / 1.1) * Math.PI + ph)); return { dy: 0.025 * b, R: [0, 0.03 * b, 0], L: [0, 0.03 * b, 0] }; },
  },
  'give-gift': {
    label: 'Offering a gift box forward with both hands',
    head: { tilt: 0.2 }, lean: 0.07,
    prop: { at: [0, 1.1, 0.36], both: true },
    R: { t: [-0.118, 1.06, 0.34], palm: [1, 0.2, 0], shape: 'flat', pole: [-1, -0.6, -0.4] },
    L: { t: [0.118, 1.06, 0.34], palm: [-1, 0.2, 0], shape: 'flat', pole: [1, -0.6, -0.4] },
    anim: (t, ph) => { const p = 0.5 + 0.5 * wave(t, 3, ph); return { all: [0, 0.008 * p, 0.02 * p] }; },
  },
  'receive-gift': {
    label: 'Receiving: both palms up and forward, a gift box resting on them',
    head: { tilt: 0.24 }, lean: 0.03,
    prop: { at: [0, 1.135, 0.38], both: true, rest: true },
    R: { t: [-0.075, 1.035, 0.33], palm: [0.1, 1, 0.1], shape: 'flat', pole: [-1, -0.7, -0.3] },
    L: { t: [0.075, 1.035, 0.33], palm: [-0.1, 1, 0.1], shape: 'flat', pole: [1, -0.7, -0.3] },
  },
  wave: {
    label: 'Friendly wave with the near hand raised beside the head',
    head: { tilt: -0.04, roll: 0.06 },
    R: { t: [-0.47, 1.56, 0.26], palm: [0.2, 0, 1], shape: 'open', pole: [-0.6, -1, -0.1], bend: -0.25 }, L: D.L,
    anim: (t, ph) => ({ R: [0.045 * wave(t, 0.7, ph), 0, 0], handRoll: 0.35 * wave(t, 0.7, ph) }),
  },
  point: {
    label: 'Pointing forward / at something on the facing side',
    head: { tilt: 0.02, turn: -0.1 },
    R: { t: [-0.16, 1.36, 0.5], palm: [1, 0, 0], shape: 'point', pole: [-1, -0.6, 0] }, L: D.L,
    anim: (t, ph) => ({ R: [0, 0.01 * wave(t, 1.6, ph), 0] }),
  },
  shrug: {
    label: 'Shrugging: forearms out, palms up, shoulders raised (unsure)',
    head: { roll: 0.16, tilt: 0.06 }, shrug: 0.04,
    R: { t: [-0.38, 1.1, 0.18], palm: [0, 1, 0.1], shape: 'open', pole: [-0.4, -1, -0.4] },
    L: { t: [0.38, 1.1, 0.18], palm: [0, 1, 0.1], shape: 'open', pole: [0.4, -1, -0.4] },
    anim: (t, ph) => { const s = Math.max(0, Math.sin((t / 2.2) * TAU + ph)) ** 2; return { shrug: 0.02 * s, R: [0, 0.02 * s, 0], L: [0, 0.02 * s, 0] }; },
  },
  walk: {
    label: 'Walking towards the facing side (loops every 1.1 s)',
    head: { tilt: 0.04 }, walk: true,
    R: { t: [-0.225, 0.89, 0.04], palm: [1, 0, 0.1], shape: 'relax', pole: [-0.3, 0, -1] }, L: { t: [0.225, 0.89, 0.04], palm: [-1, 0, 0.1], shape: 'relax', pole: [0.3, 0, -1] },
  },
  sit: {
    label: 'Seated on a low cushion, hands resting on the knees',
    sit: true, head: { tilt: 0.06 },
    R: { t: [-0.13, 0.6, 0.33], palm: [0, -1, 0.1], shape: 'relax', pole: [-1, 0, -0.4] },
    L: { t: [0.13, 0.6, 0.33], palm: [0, -1, 0.1], shape: 'relax', pole: [1, 0, -0.4] },
    holdAt: { t: [-0.06, 0.86, 0.3], palm: [0.15, 0.85, -0.5], shape: 'hold', pole: [-1, -0.6, -0.2], hold: true },
  },
  'hold-goldbar': {
    label: 'Proudly holding up a gold bar in front of the chest',
    head: { tilt: 0.1 }, chest: -0.05,
    R: { t: [-0.05, 1.22, 0.3], palm: [0.15, 0.2, 1], shape: 'pinch', pole: [-1, -0.7, -0.2], hold: true, bend: -0.1 }, L: D.L,
    defaultProp: 'goldbar',
    anim: (t, ph) => ({ handRoll: 0.08 * wave(t, 3.2, ph) }),
  },
  present: {
    label: 'Presenting: open palm extended to the facing side, showing something',
    head: { turn: -0.32, tilt: 0.05 },
    R: { t: [-0.34, 1.16, 0.36], palm: [0.1, 1, 0.2], shape: 'open', pole: [-1, -0.6, -0.2] }, L: D.L,
    anim: (t, ph) => ({ R: [0, 0.008 * wave(t, 2.6, ph), 0] }),
  },
};
// How the near hand carries a prop when the pose itself does not hold one.
const CARRY = {
  phone: { t: [-0.16, 1.0, 0.21], palm: [0.85, 0.5, 0], shape: 'hold', pole: [-0.6, -1, -0.5], hold: true },
  goldbar: { t: [-0.16, 1.0, 0.21], palm: [0.85, 0.4, 0.3], shape: 'pinch', pole: [-0.6, -1, -0.5], hold: true },
  receipts: { t: [-0.16, 1.0, 0.21], palm: [0.6, 0.7, 0], shape: 'pinch', pole: [-0.6, -1, -0.5], hold: true },
  coffee: { t: [-0.17, 1.02, 0.21], palm: [1, 0, 0], shape: 'hold', pole: [-0.6, -1, -0.5], hold: true, bend: 0 },
  coin: { t: [-0.16, 1.0, 0.21], palm: [0.6, 0.7, 0.2], shape: 'pinch', pole: [-0.6, -1, -0.5], hold: true },
  bag: { t: [-0.24, 0.9, 0.02], palm: [1, 0, 0], shape: 'hold', hold: true, bend: 0 },
  'shopping-bag': { t: [-0.24, 0.9, 0.02], palm: [1, 0, 0], shape: 'hold', hold: true, bend: 0 },
};
const POSE_DEFAULT_PROP = { phone: 'phone', 'phone-happy': 'phone', stressed: 'receipts', 'give-gift': 'giftbox', 'receive-gift': 'giftbox', 'hold-goldbar': 'goldbar' };
export function figurePoses() { return Object.fromEntries(Object.entries(POSES3D).map(([k, v]) => [k, v.label])); }

// Moods without faces: what the body does.
const MOODS = {
  neutral: {},
  happy: { tilt: -0.06, chest: -0.03, bounce: 0.004 },
  worried: { tilt: 0.12, shrug: 0.018, lean: -0.01 },
  surprised: { tilt: -0.12, lean: -0.05, shrug: 0.02 },
  calm: { roll: 0.06, breathe: 1.6 },
  proud: { tilt: -0.08, chest: -0.06 },
  thinking: { roll: 0.1, tilt: -0.06, turn: 0.08 },
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
        const g = new THREE.Group(); g.position.set((s === 'R' ? -1 : 1) * 0.085, 0.86, 0);
        const leg = track(new THREE.Mesh(capsule(0.066, 0.72), legMat)); leg.position.y = -0.42;
        g.add(leg); all.add(g); legs[s] = g;
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
    f.position.set((s === 'R' ? -1 : 1) * 0.088, 0, sit ? 0.5 : 0.04);
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
    hand.scale.setScalar(1.12);
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
    for (const s of [-1, 1]) { const ear = track(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), skin)); ear.scale.set(0.011, 0.025, 0.017); ear.position.set(s * HR.x * 0.97, hc.y - 0.004, hc.z - 0.008); head.add(ear); }
    // A soft nose ridge gives the head a direction in 3/4 views without drawing a face.
    const nose = track(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), skin)); nose.scale.set(0.012, 0.024, 0.014); nose.position.set(0, hc.y - 0.012, hc.z + HR.z * 0.93); head.add(nose);
  }
  // Optional minimal face: two small glossy eyes, nothing else (spec.face = 'minimal').
  const eyeMat = new THREE.MeshPhysicalMaterial({ color: '#17120F', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
  const addEyes = (centre, rx, ry, rz, dx, dy) => {
    for (const s of [-1, 1]) {
      const z = rz * Math.sqrt(Math.max(0, 1 - (dx / rx) ** 2 - (dy / ry) ** 2));
      const e = track(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), eyeMat));
      e.scale.set(0.0068, 0.0098, 0.0035); e.position.copy(centre).add(V(s * dx, dy, z - 0.0005));
      e.rotation.y = s * Math.asin(clamp(dx / rx * 0.9, -1, 1));
      head.add(e);
    }
  };
  if (input.face === 'minimal' && !veiled) addEyes(hc, HR.x, HR.y, HR.z, 0.031, 0.008);
  if (spec.beard && man) {
    const bg = new THREE.SphereGeometry(1, 40, 20, Math.PI * 0.1, Math.PI * 0.8, Math.PI * 0.7, Math.PI * 0.28); // jaw wedge centred on the front (+z)
    const p = bg.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = 1 - 0.2 * (-y) ** 1.6; p.setXYZ(i, p.getX(i) * HR.x * 1.035 * k, y * HR.y * 1.02, p.getZ(i) * HR.z * 1.035 * (1 - 0.12 * (-y) ** 1.6)); }
    bg.computeVertexNormals();
    // Close-cropped: the skin tone deepened towards the hair colour, so it reads as a groomed beard, not a mask.
    const beard = track(new THREE.Mesh(bg, hairMat(new THREE.Color((SKIN[spec.skin] || SKIN.medium).deep).lerp(new THREE.Color(spec.age === 'senior' ? HAIR.grey : HAIR.darkBrown), spec.age === 'senior' ? 0.7 : 0.42).getStyle())));
    beard.material.side = THREE.DoubleSide;
    beard.position.copy(hc).add(V(0, -0.006, 0.004));
    head.add(beard);
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
    const hg = new THREE.SphereGeometry(1, 64, 40);
    const hpz = hg.attributes.position;
    for (let i = 0; i < hpz.count; i++) {
      const x = hpz.getX(i), y = hpz.getY(i), z = hpz.getZ(i);
      const side = Math.abs(x) / (Math.hypot(x, z) || 1);
      const line = z > 0 ? 0.42 - 0.3 * side : 0.12 - 0.62 * (-z) ** 0.8 * (1 - side * 0.4);
      const k = smooth(line - 0.06, line + 0.02, y);
      const r = 0.94 + 0.12 * k + 0.02 * k * Math.max(0, y);
      hpz.setXYZ(i, x * r, y * r, z * r);
    }
    hg.computeVertexNormals();
    const hair = track(new THREE.Mesh(hg, hairMat(spec.hair)));
    hair.scale.set(HR.x, HR.y, HR.z); hair.position.copy(hc); head.add(hair);
  } else {
    // Hijab: one continuous drape from the crown over the shoulders, skinned to head and chest so it turns with the
    // head and settles on the shoulders. The face is a separate oval that meets the veil cleanly at the opening.
    const veilMat = fabric(spec.scarf, { satin: true, folds: 'scarf', normalScale: 0.35 });
    veilMat.side = THREE.DoubleSide;
    all.updateMatrixWorld(true);
    const hcw = hc.clone().applyMatrix4(head.matrixWorld).applyMatrix4(new THREE.Matrix4().copy(all.matrixWorld).invert());
    const w = slim;
    const hoodPts = spec.headwear === 'sheila' ? [[0.222 * w, 1.3], [0.22 * w, 1.34], [0.2 * w, 1.395], [0.152, 1.435], [0.106, 1.47],
      [0.093, hcw.y - 0.088], [0.1, hcw.y - 0.05], [0.108, hcw.y], [0.1, hcw.y + 0.055], [0.076, hcw.y + 0.1], [0.036, hcw.y + 0.124], [0.0, hcw.y + 0.13]]
      : [[0.196 * w, 1.37], [0.19 * w, 1.398], [0.162, 1.428], [0.12, 1.458], [0.1, 1.48], [0.093, hcw.y - 0.088], [0.1, hcw.y - 0.05], [0.108, hcw.y], [0.1, hcw.y + 0.055], [0.076, hcw.y + 0.1], [0.036, hcw.y + 0.124], [0.0, hcw.y + 0.13]];
    const hoodGeo = ovalLathe(profile(hoodPts, 72), {
      segments: 72,
      depth: (y) => mix(0.66, 1.1, smooth(1.43, 1.53, y)),
      ripple: (y, phi) => 0.018 * Math.sin(phi * 7 + 0.6) * smooth(1.44, 1.32, y),
    });
    const hp = hoodGeo.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
      const cf = Math.max(0, z) / Math.hypot(x, z || 1e-6);
      // The front hangs lower over the chest; the head part sits forward over the face.
      const dy = -(spec.headwear === 'sheila' ? 0.09 : 0.075) * cf * cf * smooth(1.44, 1.37, y);
      hp.setXYZ(i, x, y + dy, z + (hcw.z - 0.012) * smooth(1.44, 1.54, y));
    }
    hoodGeo.computeVertexNormals();
    weigh(hoodGeo, (x, y) => (y > hcw.y - 0.06 ? [1, 1, 0, 0] : y < 1.46 ? [0, 1, 1, 0] : [1, smooth(1.46, hcw.y - 0.06, y), 0, 1 - smooth(1.46, hcw.y - 0.06, y)]));
    const hood = new THREE.SkinnedMesh(hoodGeo, veilMat);
    hood.frustumCulled = false;
    all.add(track(hood));
    hood.bind(new THREE.Skeleton([chest, head]));
    const face = track(new THREE.Mesh(headGeometry(0.068, 0.092, 0.062, 0.26), skin)); face.position.copy(hc).add(V(0, -0.006, 0.06)); head.add(face);
    const ring = track(new THREE.Mesh(new THREE.TorusGeometry(1, 0.075, 10, 64), veilMat));
    ring.scale.set(0.069, 0.094, 0.06); ring.position.copy(face.position).add(V(0, 0.002, 0.012)); head.add(ring);
    if (input.face === 'minimal') addEyes(face.position, 0.068, 0.092, 0.062, 0.024, 0.012);
    const fnose = track(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), skin)); fnose.scale.set(0.01, 0.021, 0.012); fnose.position.copy(face.position).add(V(0, -0.006, 0.056)); head.add(fnose);
  }

  // Dishdasha collar band and furakha tassel.
  if (spec.outfit === 'dishdasha') {
    const collar = track(new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.0045, 8, 40), new THREE.MeshPhysicalMaterial({ color: spec.robe, roughness: 0.6, sheen: 0.6, sheenColor: new THREE.Color('#FFFFFF') })));
    collar.rotation.x = Math.PI / 2 - 0.25; collar.scale.set(1, 0.86, 1); collar.position.set(0, 1.494 - 1.25, 0.008); chest.add(collar);
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
  const chestInv = new THREE.Matrix4(), tmpM = new THREE.Matrix4(), rootInv = new THREE.Matrix4();
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qp = new THREE.Quaternion();
  const mx = (a) => (mirror ? [-a[0], a[1], a[2]] : a);

  function armTarget(side, d, extra) {
    // Mirror: the authored R arm becomes the L arm and x flips.
    return { t: V(...mx(d.t)).add(extra), palm: V(...mx(d.palm || [0, 0, 1])), pole: V(...mx(d.pole || (side === (mirror ? 'L' : 'R') ? [-1, -0.4, -0.7] : [1, -0.4, -0.7]))), shape: d.shape || 'relax', bend: d.bend ?? 0.12, hold: d.hold };
  }

  function solveArm(side, target, shrug, tap, roll) {
    const sh = shoulders[side], el = elbows[side];
    sh.position.y = SHOULDER.y - 1.25 + shrug;
    // Everything in chest space.
    const S = sh.position.clone();
    const T = target.t.clone().applyMatrix4(chestInv);
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
    // Hand: fingers continue the forearm, bent towards the palm, palm turned as asked.
    const f = W.clone().sub(E).normalize();
    const n = palm.clone().sub(f.clone().multiplyScalar(palm.dot(f))).normalize();
    const fb = f.clone().multiplyScalar(Math.cos(target.bend)).addScaledVector(n, Math.sin(target.bend)).normalize();
    const hp = handPivots[side];
    hp.position.copy(W);
    basis(fb, palm, qp);
    if (roll) qp.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), roll));
    hp.quaternion.copy(qp);
    hands[side].userData.set(target.shape, tap);
  }

  function update(t = 0) {
    const P = POSES3D[spec.pose];
    const a = P.anim ? P.anim(t, ph) : {};
    const breathe = Math.sin((t / (3.6 * (mood.breathe || 1))) * TAU + ph);
    const sway = Math.sin((t / 5.2) * TAU + ph * 1.3);
    // Body
    const walk = P.walk;
    const wp = walk ? (t / 1.1) * TAU : 0;
    base.position.set(sway * 0.004, (a.dy || 0) + (mood.bounce ? mood.bounce * Math.abs(Math.sin(t * Math.PI * 1.6 + ph)) : 0) + (walk ? 0.012 * Math.abs(Math.sin(wp)) : 0) - (P.sit ? 0.42 : 0), 0);
    hip.rotation.set((P.lean || 0) + (mood.lean || 0) + (spec.age === 'senior' ? 0.05 : 0) + (walk ? 0.03 : 0), walk ? 0.06 * Math.sin(wp) : 0.01 * sway, 0.012 * sway * (mirror ? -1 : 1));
    chest.rotation.set((P.chest || 0) + (mood.chest || 0) + breathe * 0.008 + (spec.age === 'senior' ? 0.06 : 0), walk ? -0.08 * Math.sin(wp) : 0, 0);
    chest.position.y = 0.3 + breathe * 0.0018;
    // Head
    const hd = P.head || {};
    const microT = 0.02 * Math.sin((t / 4.7) * TAU + ph * 2), microR = 0.015 * Math.sin((t / 6.3) * TAU + ph);
    neck.rotation.set(((hd.tilt || 0) + (mood.tilt || 0) + (a.headTilt || 0)) * 0.35, 0, 0);
    head.rotation.set(((hd.tilt || 0) + (mood.tilt || 0) + (a.headTilt || 0)) * 0.65 + microT, ((hd.turn || 0) + (mood.turn || 0) + (a.headTurn || 0)) * (mirror ? -1 : 1) + microR, ((hd.roll || 0) + (mood.roll || 0)) * (mirror ? -1 : 1));
    // Feet (walk cycle) and robe hem follow
    for (const s of ['R', 'L']) {
      const k = s === 'R' ? 1 : -1;
      if (walk) { feet[s].position.z = 0.04 + 0.11 * Math.sin(wp) * k; feet[s].position.y = 0.025 * Math.max(0, Math.cos(wp) * k); }
      if (legs[s]) legs[s].rotation.x = walk ? -0.3 * Math.sin(wp) * k : 0;
    }
    all.updateMatrixWorld(true);
    // Arms (in chest space)
    tmpM.copy(all.matrixWorld).invert();
    chestInv.copy(tmpM.multiply(chest.matrixWorld)).invert();
    // chestInv currently maps all-space → chest space; targets are authored in "all" space.
    const shrug = (P.shrug || 0) + (mood.shrug || 0) + (a.shrug || 0);
    const extra = (k) => V(...mx(a[k] || [0, 0, 0])).add(V(...(a.all || [0, 0, 0])));
    let Rdef = P.R, Ldef = P.L;
    if (propMode === 'hand' && !P.R.hold) Rdef = P.sit ? P.holdAt : CARRY[propName] || CARRY.phone;
    if (walk) {
      const sw = Math.sin(wp);
      if (!Rdef.hold) Rdef = { ...Rdef, t: [Rdef.t[0], Rdef.t[1] + 0.01 * Math.abs(sw), Rdef.t[2] - 0.13 * sw] };
      Ldef = { ...P.L, t: [P.L.t[0], P.L.t[1] + 0.01 * Math.abs(sw), P.L.t[2] + 0.13 * sw] };
    }
    const nearT = armTarget(near, Rdef, extra('R'));
    if (propMode === 'hand') nearT.shape = Rdef.shape && Rdef.hold ? Rdef.shape : GRIPS[propName].shape;
    solveArm(near, nearT, shrug, a.tap || 0, (a.handRoll || 0) * (mirror ? -1 : 1));
    solveArm(far, armTarget(far, Ldef, extra('L')), shrug, 0, 0);
    if (propMode === 'both') {
      const at = V(...mx(P.prop.at)).add(V(...(a.all || [0, 0, 0])));
      prop.position.copy(at.applyMatrix4(chestInv));
      prop.quaternion.setFromRotationMatrix(tmpM.extractRotation(chestInv));
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
