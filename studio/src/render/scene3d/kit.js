// Scene kit: the building blocks every 3D scene module receives as `api.kit`.
// Modules never import anything. They get THREE and this kit, so Claude can write a new scene
// as a single file in studio/modules/scenes/ and it loads without rebuilding the studio.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { COLORS, FONTS, THEMES } from '../../../shared/brand.js';
import { SYMBOL_ROOF, SYMBOL_G, SYMBOL_GEM } from '../../../shared/logo.js';
import { textGeometry, glyphGeometries } from './type3d.js';
import { figure, figurePoses, prop3d } from './figure.js';
import { diorama, setNames } from './sets.js';

// ---------- motion ----------
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const mix = (a, b, p) => a + (b - a) * p;
/** Normalised progress of t through [a, b]. */
export const seg = (t, a, b) => clamp((t - a) / Math.max(1e-6, b - a));
/** CSS-style cubic-bezier easing (x1, y1, x2, y2), solved with Newton iterations. */
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (p) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let t = p;
    for (let i = 0; i < 8; i++) { const e = sx(t) - p; const d = dx(t); if (Math.abs(e) < 1e-5 || Math.abs(d) < 1e-6) break; t -= e / d; }
    return sy(clamp(t));
  };
}
// Motion tokens (knowledge/design-dna.md §2.5): gold is heavy, it arrives slowly and stops decisively.
const SETTLE = bezier(0.22, 1, 0.36, 1); // heavy object arrives, panel opens · 700–1100 ms
const LIFT = bezier(0.64, 0, 0.78, 0); // exits · 250–400 ms
const GLIDE = bezier(0.45, 0, 0.55, 1); // camera and light sweeps · whole loop
const SNAP = bezier(0.2, 0.9, 0.1, 1); // type, UI, numbers · 350–500 ms
export const ease = {
  settle: SETTLE, lift: LIFT, glide: GLIDE, snap: SNAP,
  /** Landing with weight: at most ~3% overshoot, then still. */
  weight: (p) => (p <= 0 ? 0 : p >= 1 ? 1 : 1 - Math.exp(-7 * p) * Math.cos(p * 5.2) * (1 - p)),
  linear: (p) => p,
  sineInOut: (p) => -(Math.cos(Math.PI * p) - 1) / 2,
  cubicOut: (p) => 1 - Math.pow(1 - p, 3),
  cubicInOut: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  quintOut: (p) => 1 - Math.pow(1 - p, 5),
  quintInOut: (p) => (p < 0.5 ? 16 * p ** 5 : 1 - Math.pow(-2 * p + 2, 5) / 2),
  expoOut: (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
  expoInOut: (p) => (p <= 0 ? 0 : p >= 1 ? 1 : p < 0.5 ? Math.pow(2, 20 * p - 10) / 2 : (2 - Math.pow(2, -20 * p + 10)) / 2),
  backOut: (p, s = 1.4) => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2),
  /** Critically damped-ish spring settling at 1, analytic so any frame can be rendered on its own. */
  spring: (p, bounce = 0.32) => (p <= 0 ? 0 : p >= 1 ? 1 : 1 - Math.exp(-6.5 * p) * Math.cos(p * Math.PI * (1.5 + bounce * 6)) * (1 - p * 0.2)),
  /** A dropped object: falls, then small decaying bounces. */
  drop: (p) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    const n = 7.5625, d = 2.75;
    if (p < 1 / d) return n * p * p;
    if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.92;
    if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.985;
    return n * (p -= 2.625 / d) * p + 0.998;
  },
};
/** Deterministic pseudo-random in [0, 1) for a seed. */
export const rand = (seed) => { const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
/** Smooth deterministic noise in [-1, 1]. */
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const a = rand(i + seed * 101.7) * 2 - 1, b = rand(i + 1 + seed * 101.7) * 2 - 1;
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}
/** A loop phase in [0, 1) that repeats every `period` seconds. */
export const phase = (t, period) => ((t % period) + period) % period / period;

// ---------- colour ----------
export const brand = { COLORS, THEMES, FONTS };
const BACKDROPS = {
  onyx: { top: '#262624', mid: '#151513', bottom: '#0B0B0A', floor: '#121211', fog: '#0F0F0E', light: false },
  charcoal: { top: '#2A2A2C', mid: '#1D1D1F', bottom: '#111112', floor: '#161617', fog: '#141415', light: false },
  bullion: { top: '#3B2A1C', mid: '#62422A', bottom: '#8A6B41', floor: '#3B2A1C', fog: '#4A3423', light: false },
  cream: { top: '#FFFDF7', mid: '#FFF8EA', bottom: '#EFE5D2', floor: '#F3EADA', fog: '#F6EFE2', light: true },
  sand: { top: '#F2DC8C', mid: '#E8CC73', bottom: '#D9B85E', floor: '#E2C46B', fog: '#E5C870', light: true },
};
export const backdropColors = (theme) => BACKDROPS[theme] || BACKDROPS.onyx;

// ---------- canvases & textures ----------
function canvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  return cv;
}

/** Background texture: soft vertical gradient with a light pool behind the subject. */
export function backdropTexture(theme, { aspect = 0.8, glowY = 0.42, glow = 1 } = {}) {
  const b = backdropColors(theme);
  const h = 1024, w = Math.max(64, Math.round(h * aspect));
  const cv = canvas(w, h);
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, b.top); g.addColorStop(0.55, b.mid); g.addColorStop(1, b.bottom);
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  if (glow > 0) {
    const r = c.createRadialGradient(w / 2, h * glowY, 0, w / 2, h * glowY, h * 0.62);
    r.addColorStop(0, b.light ? `rgba(255,255,255,${0.55 * glow})` : `rgba(219,167,97,${0.12 * glow})`);
    r.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = r; c.fillRect(0, 0, w, h);
  }
  // Fine noise kills gradient banding once the video is compressed.
  const img = c.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand(i * 0.37) - 0.5) * 3;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  c.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Radial alpha texture for contact shadows and light pools. */
export function radialTexture({ inner = 'rgba(0,0,0,0.9)', outer = 'rgba(0,0,0,0)', size = 256, stops } = {}) {
  const cv = canvas(size, size);
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  if (stops) for (const [o, col] of stops) g.addColorStop(o, col);
  else { g.addColorStop(0, inner); g.addColorStop(1, outer); }
  c.fillStyle = g; c.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Relief maps from a height drawing. `draw(c, w, h)` paints white where the surface is raised.
 * Returns { normalMap, roughnessMap, heightCanvas }: raised areas can be given a different finish
 * (`raisedRoughness`) so stamped text reads like a minted bar: polished field, frosted letters.
 */
export function reliefMaps(draw, { w = 1024, h = 1024, strength = 2.2, blur = 1.2, fieldRoughness = 0.16, raisedRoughness = 0.42, invertFinish = false } = {}) {
  const hc = canvas(w, h);
  const c = hc.getContext('2d');
  c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#fff'; c.strokeStyle = '#fff';
  draw(c, w, h);
  let src = hc;
  if (blur > 0) {
    const bc = canvas(w, h);
    const bx = bc.getContext('2d');
    bx.filter = `blur(${blur}px)`;
    bx.drawImage(hc, 0, 0);
    src = bc;
  }
  const hd = src.getContext('2d').getImageData(0, 0, w, h).data;
  const H = (x, y) => hd[((Math.min(h - 1, Math.max(0, y)) * w) + Math.min(w - 1, Math.max(0, x))) * 4] / 255;
  const nc = canvas(w, h);
  const nx = nc.getContext('2d');
  const out = nx.createImageData(w, h);
  const rc = canvas(w, h);
  const rx = rc.getContext('2d');
  const rout = rx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
      const hv = hd[i] / 255;
      const r = invertFinish ? mix(raisedRoughness, fieldRoughness, hv) : mix(fieldRoughness, raisedRoughness, hv);
      const v = Math.round(r * 255);
      rout.data[i] = v; rout.data[i + 1] = v; rout.data[i + 2] = v; rout.data[i + 3] = 255;
    }
  }
  nx.putImageData(out, 0, 0);
  rx.putImageData(rout, 0, 0);
  const normalMap = new THREE.CanvasTexture(nc);
  const roughnessMap = new THREE.CanvasTexture(rc);
  for (const t of [normalMap, roughnessMap]) { t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8; }
  return { normalMap, roughnessMap, heightCanvas: hc };
}

/** Draw text with the brand fonts. Arabic is shaped by the browser. */
export function drawText(c, text, x, y, { size = 64, weight = 700, align = 'center', font, letterSpacing = 0, baseline = 'middle', rtl } = {}) {
  const ar = rtl ?? /[؀-ۿ]/.test(text);
  c.font = `${weight} ${size}px ${font || (ar ? FONTS.arabic : FONTS.latin)}`;
  c.textAlign = align;
  c.textBaseline = baseline;
  c.direction = ar ? 'rtl' : 'ltr';
  if ('letterSpacing' in c) c.letterSpacing = `${letterSpacing}px`;
  c.fillText(text, x, y);
  if ('letterSpacing' in c) c.letterSpacing = '0px';
}

/** Paint the Goldcom symbol (roof, G, gem) into a 2D context, centred at x, y with height h. */
export function drawSymbol(c, x, y, h, parts = ['roof', 'g', 'gem']) {
  const k = h / 540;
  c.save();
  c.translate(x - (427 * k) / 2, y - h / 2);
  c.scale(k, k);
  const map = { roof: SYMBOL_ROOF, g: SYMBOL_G, gem: SYMBOL_GEM };
  for (const p of parts) c.fill(new Path2D(map[p]));
  c.restore();
}

/** A canvas texture you draw into, e.g. a phone screen. Call `tex.needsUpdate = true` after redrawing. */
export function canvasTexture(w, h, draw) {
  const cv = canvas(w, h);
  const c = cv.getContext('2d');
  if (draw) draw(c, w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.userData.canvas = cv;
  tex.userData.ctx = c;
  return tex;
}

// ---------- materials ----------
// 24K gold reflects roughly (1.0, 0.77, 0.34) in linear light; the brand gold is a touch warmer.
export const GOLD = { pure: '#FFD27A', warm: '#F4BE62', rose: '#E9A27A', deep: '#D99A3E', pale: '#FBE3A4' };
export const materials = {
  gold: ({ color = GOLD.pure, roughness = 0.2, normalMap, roughnessMap, normalScale = 1, envMapIntensity = 1.15, clearcoat = 0, anisotropy = 0 } = {}) => new THREE.MeshPhysicalMaterial({
    color, metalness: 1, roughness, normalMap: normalMap || null, roughnessMap: roughnessMap || null,
    normalScale: new THREE.Vector2(normalScale, normalScale), envMapIntensity, clearcoat, clearcoatRoughness: 0.08,
    // Anisotropy needs clean tangents; on rounded boxes it produces NaN pixels, so it is opt-in only.
    ...(anisotropy ? { anisotropy, anisotropyRotation: Math.PI / 2 } : {}),
  }),
  /** Satin / brushed gold for sides and backs. */
  satin: ({ color = GOLD.warm, roughness = 0.34 } = {}) => new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness, envMapIntensity: 1.05 }),
  /** Black lacquer / polished onyx. */
  lacquer: ({ color = '#0E0E0D', roughness = 0.28 } = {}) => new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.9 }),
  /** Soft-touch matte card or box. */
  matte: ({ color = '#1A1A19', roughness = 0.82 } = {}) => new THREE.MeshStandardMaterial({ color, metalness: 0, roughness, envMapIntensity: 0.6 }),
  /** Velvet lining (gift box, jewellery tray). */
  velvet: ({ color = '#2A1C14', sheenColor = '#C8943D' } = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.9, sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color(sheenColor), envMapIntensity: 0.5 }),
  /** Clear glass / acrylic. */
  glass: ({ color = '#FFFFFF', roughness = 0.04, thickness = 0.4, ior = 1.5, transmission = 1 } = {}) => new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness, transmission, thickness, ior, envMapIntensity: 1, transparent: true }),
  /** Unlit, for screens and glows. */
  emissive: ({ map, color = '#FFFFFF', intensity = 1 } = {}) => new THREE.MeshBasicMaterial({ map: map || null, color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: !map }),
};

// ---------- geometry ----------
export function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Cap UVs normalised to the shape's bounds, so a relief map covers the face exactly. */
function boundsUV(minX, minY, w, h) {
  return {
    generateTopUV(geometry, vertices, a, b, c) {
      const uv = (i) => new THREE.Vector2((vertices[i * 3] - minX) / w, (vertices[i * 3 + 1] - minY) / h);
      return [uv(a), uv(b), uv(c)];
    },
    generateSideWallUV(geometry, vertices, a, b, c, d) {
      const ax = vertices[a * 3], ay = vertices[a * 3 + 1], az = vertices[a * 3 + 2];
      const bx = vertices[b * 3], by = vertices[b * 3 + 1];
      const cz = vertices[c * 3 + 2];
      const dx = vertices[d * 3], dy = vertices[d * 3 + 1];
      if (Math.abs(ay - by) < Math.abs(ax - bx)) {
        return [new THREE.Vector2(ax / w, 1 - az), new THREE.Vector2(bx / w, 1 - az), new THREE.Vector2(bx / w, 1 - cz), new THREE.Vector2(dx / w, 1 - cz)];
      }
      return [new THREE.Vector2(ay / h, 1 - az), new THREE.Vector2(by / h, 1 - az), new THREE.Vector2(by / h, 1 - cz), new THREE.Vector2(dy / h, 1 - cz)];
    },
  };
}

/** Real minted-bar proportions (mm) by weight. Thin plates for small weights, thicker above 20 g. */
export const BAR_SIZES = {
  '1 g': [8.7, 15, 0.6], '2.5 g': [12, 20, 0.7], '5 g': [15, 25, 0.8], '10 g': [18, 31, 1.0],
  '20 g': [23, 39, 1.3], '1 oz': [25, 41, 1.7], '50 g': [27, 47, 2.2], '100 g': [31, 55, 3.0],
};

/** Minted gold bar: rounded plate with a soft bevel. Group 0 = faces, group 1 = edge. Centred, faces ±z. */
export function barGeometry({ w = 1, h = 1.72, d = 0.08, r = 0.07, bevel = 0.02 } = {}) {
  const shape = roundedRectShape(w - bevel * 2, h - bevel * 2, Math.max(0.001, r - bevel));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, d - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5, curveSegments: 18,
    UVGenerator: boundsUV(-w / 2, -h / 2, w, h),
  });
  g.translate(0, 0, -(d - bevel * 2) / 2);
  g.computeVertexNormals();
  return g;
}

/** Coin: a lathe profile with a raised rim. Faces at ±thickness/2 along y. */
export function coinGeometry({ r = 1, t = 0.12, rim = 0.08, segments = 96 } = {}) {
  const hT = t / 2, inner = hT * 0.62;
  const pts = [
    [0, inner], [r - rim, inner], [r - rim * 0.55, hT], [r - rim * 0.12, hT], [r, hT * 0.8],
    [r, -hT * 0.8], [r - rim * 0.12, -hT], [r - rim * 0.55, -hT], [r - rim, -inner], [0, -inner],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, segments);
  g.computeVertexNormals();
  return g;
}

/** Disc used to carry a coin face relief (sits on the inner field). */
export function discGeometry(r, segments = 96) {
  const g = new THREE.CircleGeometry(r, segments);
  return g;
}

/** The Goldcom symbol as 3D gold geometry. Returns { roof, g, gem } geometries centred on the full symbol, height 1. */
export function symbolGeometries({ depth = 0.14, bevel = 0.018 } = {}) {
  const parse = (d) => {
    const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
    const s = new THREE.Shape();
    for (let i = 0; i < nums.length; i += 2) {
      const x = (nums[i] - 213.5) / 540, y = -(nums[i + 1] - 270) / 540;
      if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
    }
    s.closePath();
    return s;
  };
  const opts = { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 4, curveSegments: 1 };
  const make = (d) => { const g = new THREE.ExtrudeGeometry(parse(d), opts); g.translate(0, 0, -depth / 2); g.computeVertexNormals(); return g; };
  return { roof: make(SYMBOL_ROOF), g: make(SYMBOL_G), gem: make(SYMBOL_GEM) };
}

export const roundedBox = (w, h, d, r = 0.04, seg = 4) => new RoundedBoxGeometry(w, h, d, seg, r);
export { mergeVertices };

// ---------- stamps (what is minted on a bar or a coin) ----------
/** Front face of a Goldcom minted bar: frame, symbol, weight, purity and an assay number. */
export function barStamp({ weight = '10 g', purity = '999.9', serial = 'GC 004217', lang = 'en', aspect = 1.72 } = {}) {
  const W = 1024, H = Math.round(1024 * aspect);
  return reliefMaps((c, w, h) => {
    const m = w * 0.075;
    // Raised border frame, like a mint die.
    c.lineWidth = w * 0.022;
    const r = w * 0.06;
    c.beginPath();
    c.roundRect(m, m, w - m * 2, h - m * 2, r);
    c.stroke();
    drawSymbol(c, w / 2, h * 0.24, h * 0.17);
    drawText(c, 'Goldcom', w / 2, h * 0.375, { size: w * 0.085, weight: 600, letterSpacing: w * 0.004 });
    c.fillRect(w * 0.3, h * 0.43, w * 0.4, w * 0.008);
    drawText(c, weight.replace(' ', ' '), w / 2, h * 0.53, { size: w * 0.22, weight: 700, letterSpacing: -w * 0.004 });
    drawText(c, 'FINE GOLD', w / 2, h * 0.645, { size: w * 0.075, weight: 600, letterSpacing: w * 0.02 });
    drawText(c, purity, w / 2, h * 0.73, { size: w * 0.115, weight: 700, letterSpacing: w * 0.006 });
    if (lang === 'ar') drawText(c, 'ذهب خالص عيار 24', w / 2, h * 0.815, { size: w * 0.06, weight: 600 });
    drawText(c, serial, w / 2, h * 0.875, { size: w * 0.042, weight: 500, letterSpacing: w * 0.01, font: FONTS.mono });
  }, { w: W, h: H, strength: 3.2, blur: 1.6, fieldRoughness: 0.14, raisedRoughness: 0.36 });
}

/** Coin face: symbol in the centre and a lettered ring. */
export function coinStamp({ top = 'GOLDCOM', bottom = '999.9 FINE GOLD', symbol = true } = {}) {
  return reliefMaps((c, w, h) => {
    const cx = w / 2, cy = h / 2;
    c.lineWidth = w * 0.012;
    c.beginPath(); c.arc(cx, cy, w * 0.43, 0, Math.PI * 2); c.stroke();
    if (symbol) drawSymbol(c, cx, cy, h * 0.38);
    const ring = (text, start, dir) => {
      c.save();
      c.translate(cx, cy);
      c.font = `600 ${w * 0.06}px ${FONTS.latin}`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      const chars = [...text];
      const step = 0.105;
      chars.forEach((ch, i) => {
        const a = start + (i - (chars.length - 1) / 2) * step * dir;
        c.save(); c.rotate(a); c.translate(0, -w * 0.37 * dir); if (dir < 0) c.rotate(Math.PI);
        c.fillText(ch, 0, 0); c.restore();
      });
      c.restore();
    };
    ring(top, 0, 1);
    ring(bottom, Math.PI, -1);
  }, { w: 1024, h: 1024, strength: 2.8, blur: 1.4, fieldRoughness: 0.12, raisedRoughness: 0.34 });
}

/** Reeded coin edge as a normal map (vertical ridges). */
export function reedingMap(count = 160) {
  return reliefMaps((c, w, h) => {
    const step = w / count;
    for (let i = 0; i < count; i++) c.fillRect(i * step, 0, step * 0.5, h);
  }, { w: 2048, h: 32, strength: 1.4, blur: 0.8, fieldRoughness: 0.24, raisedRoughness: 0.24 });
}

// ---------- environment & staging ----------
/** Product-photography studio as an environment map: dark room, long strip softboxes, warm bounce. */
export function studioEnvScene(variant = 'studio') {
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16), new THREE.MeshBasicMaterial({ color: variant === 'bright' ? '#3A3732' : '#0A0A0A', side: THREE.BackSide }));
  scene.add(room);
  const panel = (w, h, x, y, z, intensity, color = '#FFFFFF') => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    scene.add(m);
    return m;
  };
  if (variant === 'warm') {
    panel(2.2, 14, -9, 2, 4, 9, '#FFE9C7');
    panel(2.2, 14, 9, 2, 3, 6, '#FFF3E0');
    panel(16, 3, 0, 12, -2, 4, '#FFFFFF');
    panel(30, 6, 0, -9, 0, 0.9, '#C8943D');
  } else if (variant === 'bright') {
    panel(6, 14, -8, 3, 6, 6);
    panel(6, 14, 8, 3, 6, 6);
    panel(18, 6, 0, 12, 0, 5);
    panel(30, 6, 0, -9, 0, 1.2, '#E9D9C4');
  } else {
    // Two tall strips give the long specular lines premium metal is known for; the rest of the room stays dark
    // so the gold shows its colour between highlights.
    // Large diffusion panel behind the camera with a top-to-bottom falloff: a flat gold face shows a
    // smooth gradient at any angle instead of mirroring the dark room.
    const grad = document.createElement('canvas');
    grad.width = 8; grad.height = 256;
    const gc = grad.getContext('2d');
    const gg = gc.createLinearGradient(0, 0, 0, 256);
    gg.addColorStop(0, '#FFFFFF'); gg.addColorStop(0.5, '#BDB3A5'); gg.addColorStop(1, '#1E1B18');
    gc.fillStyle = gg; gc.fillRect(0, 0, 8, 256);
    const gtex = new THREE.CanvasTexture(grad);
    gtex.colorSpace = THREE.SRGBColorSpace;
    const front = new THREE.Mesh(new THREE.PlaneGeometry(22, 14), new THREE.MeshBasicMaterial({ map: gtex, color: new THREE.Color('#FFF1DC').multiplyScalar(1.25), side: THREE.DoubleSide }));
    front.position.set(-1.5, 3, 13);
    front.lookAt(0, 0, 0);
    scene.add(front);
    // Soft key from top-back: lights faces that tilt up (bars lying in a box, coins on a stack).
    panel(10, 5, 0, 9, -6, 1.3, '#FFF4E4');
    panel(0.9, 16, -7, 2, 6, 4.2, '#FFF6E8');
    panel(0.9, 16, 7.5, 2, 4.5, 2.6, '#FFFFFF');
    panel(10, 1.4, 0, 11, 2, 1.6, '#FFFFFF');
    panel(3, 8, 0, 3, -10, 0.9, '#FFE7C2');
    panel(30, 5, 0, -10, 0, 0.12, '#8A5A2B');
  }
  return scene;
}

/** Glossy black-stone floor with a real reflection that fades out with distance. */
export function reflectiveFloor({ size = 40, color = '#121211', strength = 0.42, falloff = 3.2, resolution = 1024, glow = '#000000', fadeStart = 3.5, fadeEnd = 11 } = {}) {
  const shader = {
    name: 'GoldcomFloor',
    uniforms: {
      color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
      base: { value: new THREE.Color(color) }, strength: { value: strength }, falloff: { value: falloff },
      glow: { value: new THREE.Color(glow) }, fadeStart: { value: fadeStart }, fadeEnd: { value: fadeEnd },
    },
    vertexShader: /* glsl */`
      uniform mat4 textureMatrix;
      varying vec4 vUv;
      varying vec2 vLocal;
      void main() {
        vUv = textureMatrix * vec4(position, 1.0);
        vLocal = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse;
      uniform vec3 base;
      uniform vec3 glow;
      uniform float strength;
      uniform float falloff;
      uniform float fadeStart;
      uniform float fadeEnd;
      varying vec4 vUv;
      varying vec2 vLocal;
      void main() {
        vec2 uv = vUv.xy / vUv.w;
        // Soft reflection: a small blur kernel reads as polished stone, not a mirror.
        vec2 px = vec2(0.0016, 0.0024);
        vec3 r = texture2D(tDiffuse, uv).rgb * 0.36;
        r += texture2D(tDiffuse, uv + vec2(px.x, 0.0)).rgb * 0.16;
        r += texture2D(tDiffuse, uv - vec2(px.x, 0.0)).rgb * 0.16;
        r += texture2D(tDiffuse, uv + vec2(0.0, px.y)).rgb * 0.16;
        r += texture2D(tDiffuse, uv - vec2(0.0, px.y)).rgb * 0.16;
        float d = length(vLocal);
        float fade = exp(-d * d / (falloff * falloff));
        vec3 col = base + r * strength * fade + glow * exp(-d * d / 2.2);
        // The floor dissolves into the backdrop: no horizon line.
        float a = 1.0 - smoothstep(fadeStart, fadeEnd, d);
        gl_FragColor = vec4(col * a, a);
      }`,
  };
  const floor = new Reflector(new THREE.PlaneGeometry(size, size), { textureWidth: resolution, textureHeight: resolution, clipBias: 0.002, shader, multisample: 4 });
  floor.material.transparent = true;
  floor.material.premultipliedAlpha = true;
  floor.material.blending = THREE.CustomBlending;
  floor.material.blendSrc = THREE.OneFactor;
  floor.material.blendDst = THREE.OneMinusSrcAlphaFactor;
  floor.rotation.x = -Math.PI / 2;
  return floor;
}

/** A soft contact shadow under an object (plane lying on the floor). */
export function contactShadow({ size = 2, opacity = 0.65, light = false } = {}) {
  const tex = radialTexture({ stops: [[0, light ? 'rgba(59,42,28,0.55)' : 'rgba(0,0,0,0.95)'], [0.45, light ? 'rgba(59,42,28,0.22)' : 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']] });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}

/**
 * Standard staging: themed background, matching fog, optional reflective floor and a key light.
 * Returns { floor, setGlow } so a scene can move the light pool.
 */
export function stage(scene, { theme = 'onyx', aspect = 0.8, floor = true, floorY = 0, reflect = true, glowY = 0.42, glow = 1, transparent = false, fog = true, fogNear = 9, fogFar = 26, lights = true } = {}) {
  const b = backdropColors(theme);
  if (!transparent) scene.background = backdropTexture(theme, { aspect, glowY, glow });
  if (fog && !transparent) scene.fog = new THREE.Fog(b.fog, fogNear, fogFar);
  let floorMesh = null;
  if (floor && !transparent) {
    floorMesh = reflect ? reflectiveFloor({ color: b.floor, strength: b.light ? 0.22 : 0.3, glow: b.light ? '#000000' : '#1A1206' }) : new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: b.floor, roughness: 0.6, metalness: 0 }));
    if (!reflect) floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = floorY;
    scene.add(floorMesh);
  }
  const key = new THREE.DirectionalLight('#FFF4E2', 1.4);
  key.position.set(-3, 6, 4);
  const rim = new THREE.DirectionalLight('#FFE2B0', 1.1);
  rim.position.set(4, 3, -5);
  if (lights) scene.add(key, rim);
  return { floor: floorMesh, key, rim, colors: b };
}

/**
 * Photographic cyclorama: floor that curves up into a back wall with no corner, so light falls off into a
 * seamless gradient. Receives shadows. Returns the mesh; set scene.background to the same colour.
 */
export function cyclorama({ color = '#151513', width = 30, depth = 9, height = 12, radius = 2.4, back = -3.2, roughness = 0.92 } = {}) {
  const pts = [];
  const front = depth;
  pts.push([front, 0]);
  for (let i = 0; i <= 24; i++) { const a = (i / 24) * (Math.PI / 2); pts.push([back + radius - Math.sin(a) * radius, radius - Math.cos(a) * radius]); }
  pts.push([back, height]);
  const shape = [];
  for (const [z, y] of pts) shape.push(new THREE.Vector2(z, y));
  const geo = new THREE.BufferGeometry();
  const cols = 2, pos = [], uv = [], idx = [];
  shape.forEach((p, j) => { for (let i = 0; i < cols; i++) { pos.push((i - 0.5) * width, p.y, p.x); uv.push(i, j / (shape.length - 1)); } });
  for (let j = 0; j < shape.length - 1; j++) { const a = j * cols, b = a + cols; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, envMapIntensity: 0.4 }));
  mesh.receiveShadow = true;
  return mesh;
}

/** Distance at which an object of `size` (world units, the larger of its width and height) fills `fill` of the frame. */
export function fitDistance(camera, size, aspect, fill = 0.7) {
  const vfov = (camera.fov * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  const fov = Math.min(vfov, hfov);
  return size / fill / (2 * Math.tan(fov / 2));
}

/** Distance at which a box of boxW × boxH (world units, facing the camera) fills at most fillW of the width and fillH of the height. */
export function fitBox(camera, boxW, boxH, aspect, { fillW = 0.6, fillH = 0.55 } = {}) {
  const v = Math.tan((camera.fov * Math.PI) / 360);
  return Math.max(boxH / fillH / (2 * v), boxW / fillW / (2 * v * aspect));
}

/** Orbit position helper: azimuth/elevation in radians around a target. */
export function orbit(camera, { target = new THREE.Vector3(), distance = 6, azimuth = 0, elevation = 0.2 }) {
  camera.position.set(
    target.x + distance * Math.cos(elevation) * Math.sin(azimuth),
    target.y + distance * Math.sin(elevation),
    target.z + distance * Math.cos(elevation) * Math.cos(azimuth),
  );
  camera.lookAt(target);
}

/** Particles helper: a Points cloud with round, soft sprites. */
export function softPoints(count, { size = 0.05, color = '#FFD27A', opacity = 1, additive = true } = {}) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(count).fill(1), 1));
  geo.setAttribute('scale', new THREE.BufferAttribute(new Float32Array(count).fill(1), 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { color: { value: new THREE.Color(color) }, size: { value: size }, opacity: { value: opacity }, scaleY: { value: 1000 } },
    vertexShader: /* glsl */`
      attribute float alpha; attribute float scale;
      uniform float size; uniform float scaleY;
      varying float vA;
      void main() {
        vA = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * scale * scaleY / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 color; uniform float opacity;
      varying float vA;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = dot(d, d) * 4.0;
        float a = exp(-r * 3.2) * vA * opacity;
        if (a < 0.003) discard;
        gl_FragColor = vec4(color * a, a);
      }`,
  });
  mat.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
  mat.premultipliedAlpha = true;
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

/** Sample points that cover the white area of a 2D drawing, mapped to world units (centred, height = `height`). */
export function samplePoints(draw, count, { w = 512, h = 512, height = 2, seed = 1 } = {}) {
  const cv = canvas(w, h);
  const c = cv.getContext('2d');
  c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#fff';
  draw(c, w, h);
  const d = c.getImageData(0, 0, w, h).data;
  const on = [];
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (d[(y * w + x) * 4] > 128) on.push([x, y]);
  const out = new Float32Array(count * 3);
  const k = height / h;
  for (let i = 0; i < count; i++) {
    const p = on.length ? on[Math.floor(rand(i * 7.13 + seed) * on.length)] : [w / 2, h / 2];
    out[i * 3] = (p[0] - w / 2 + (rand(i + 3.1) - 0.5) * 2) * k;
    out[i * 3 + 1] = -(p[1] - h / 2 + (rand(i + 5.7) - 0.5) * 2) * k;
    out[i * 3 + 2] = (rand(i * 1.7 + seed) - 0.5) * 0.04;
  }
  return out;
}

export const kit = {
  text3d: textGeometry, glyphs3d: glyphGeometries,
  clamp, mix, seg, ease, bezier, rand, noise1, phase, brand, backdropColors, backdropTexture, radialTexture, reliefMaps, drawText, drawSymbol,
  canvasTexture, GOLD, materials, roundedRectShape, BAR_SIZES, barGeometry, coinGeometry, discGeometry, symbolGeometries, roundedBox,
  mergeVertices, barStamp, coinStamp, reedingMap, studioEnvScene, reflectiveFloor, contactShadow, stage, fitDistance, fitBox, orbit, softPoints, samplePoints,
  figure, figurePoses, prop3d, cyclorama, diorama, setNames,
};
