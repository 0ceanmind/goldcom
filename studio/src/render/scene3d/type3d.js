// 3D type from the brand fonts: glyph outlines (opentype.js) extruded into bevelled geometry.
// Latin and digits use Inter Bold; Arabic uses IBM Plex Sans Arabic Bold (contextual forms applied by opentype.js).
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import opentype from 'opentype.js';
import interUrl from '@fontsource/inter/files/inter-latin-700-normal.woff?url';
import arabicUrl from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-700-normal.woff?url';

const fonts = {};
let loading = null;

export function loadType3d() {
  if (!loading) {
    loading = Promise.all([
      fetch(interUrl).then((r) => r.arrayBuffer()).then((b) => { fonts.latin = opentype.parse(b); }),
      fetch(arabicUrl).then((r) => r.arrayBuffer()).then((b) => { fonts.arabic = opentype.parse(b); }),
    ]).catch((e) => { loading = null; throw e; });
  }
  return loading;
}

export const type3dReady = () => !!(fonts.latin && fonts.arabic);

const isAr = (s) => /[؀-ۿ]/.test(s);
const cache = new Map();

/**
 * Extruded text geometry, centred on the origin, `size` world units tall (cap height ≈ 0.72 × size).
 * Returns null until the fonts have loaded (preload() waits for them).
 */
export function textGeometry(text, { size = 1, depth = 0.2, bevel = 0.02, bevelSegments = 4, curveSegments = 10, letterSpacing = 0, align = 'center' } = {}) {
  const font = isAr(text) ? fonts.arabic : fonts.latin;
  if (!font) return null;
  const key = JSON.stringify([text, size, depth, bevel, bevelSegments, curveSegments, letterSpacing, align]);
  if (cache.has(key)) return cache.get(key).clone();
  const unit = 100;
  const path = font.getPath(String(text), 0, 0, unit, { kerning: true, letterSpacing, features: { liga: true, rlig: true } });
  const sp = new THREE.ShapePath();
  for (const c of path.commands) {
    if (c.type === 'M') sp.moveTo(c.x, -c.y);
    else if (c.type === 'L') sp.lineTo(c.x, -c.y);
    else if (c.type === 'Q') sp.quadraticCurveTo(c.x1, -c.y1, c.x, -c.y);
    else if (c.type === 'C') sp.bezierCurveTo(c.x1, -c.y1, c.x2, -c.y2, c.x, -c.y);
    else if (c.type === 'Z') sp.currentPath?.closePath?.();
  }
  sp.color = new THREE.Color();
  const shapes = SVGLoader.createShapes(Object.assign(sp, { userData: { style: { fillRule: 'nonzero' } } }));
  const k = size / unit;
  const geo = new THREE.ExtrudeGeometry(shapes, { depth: depth / k, bevelEnabled: bevel > 0, bevelThickness: bevel / k, bevelSize: (bevel * 0.7) / k, bevelSegments, curveSegments });
  geo.scale(k, k, k);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const dx = align === 'center' ? -(bb.min.x + bb.max.x) / 2 : align === 'left' ? -bb.min.x : align === 'origin' ? 0 : -bb.max.x;
  // Latin sits on its cap height so separate glyphs share a baseline; Arabic words centre on their own box.
  const capH = font.tables?.os2?.sCapHeight ? (font.tables.os2.sCapHeight / font.unitsPerEm) * size : null;
  const dy = !isAr(text) && capH ? -capH / 2 : -(bb.min.y + bb.max.y) / 2;
  geo.translate(dx, dy, -(bb.min.z + bb.max.z) / 2);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  cache.set(key, geo);
  if (cache.size > 60) cache.delete(cache.keys().next().value);
  return geo.clone();
}

/** Per-glyph geometries (for staggered or odometer animation). Each entry: { geometry, x } in world units. */
export function glyphGeometries(text, opts = {}) {
  const font = isAr(text) ? fonts.arabic : fonts.latin;
  if (!font) return [];
  if (isAr(text)) return [{ geometry: textGeometry(text, opts), x: 0, char: text }];
  const size = opts.size || 1;
  const unit = 100;
  const glyphs = font.stringToGlyphs(String(text));
  const out = [];
  let x = 0;
  glyphs.forEach((g, i) => {
    const ch = String(text)[i] || '';
    const adv = (g.advanceWidth / font.unitsPerEm) * unit;
    if (ch.trim()) {
      const geo = textGeometry(ch, { ...opts, align: 'origin' });
      if (geo) out.push({ geometry: geo, x: (x * size) / unit, char: ch, advance: (adv * size) / unit });
    }
    x += adv + (i < glyphs.length - 1 && font.getKerningValue ? (font.getKerningValue(g, glyphs[i + 1]) / font.unitsPerEm) * unit : 0);
  });
  const total = (x * size) / unit;
  for (const o of out) o.x -= total / 2;
  return out;
}
