// Layer drawers for production scenes: glow, step badge, check mark, spotlight, speech bubble and the
// illustration layers (person, prop, setting) whose artwork comes from ./characters.
import { COLORS, GRADIENTS, FONTS, THEMES, color as tokenColor, isArabic } from '../../shared/brand.js';
import { EASE, clamp } from './motion.js';

import * as artwork from './characters/index.js';

let illustrator = artwork;
/** The illustration module registers itself here (keeps the renderer usable while artwork loads). */
export function registerIllustrator(mod) { illustrator = mod; }

const isLight = (theme) => theme === 'cream' || theme === 'sand';

function rr(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function chamfer(c, x, y, w, h, k) {
  c.beginPath();
  c.moveTo(x + k, y); c.lineTo(x + w, y); c.lineTo(x + w, y + h - k); c.lineTo(x + w - k, y + h); c.lineTo(x, y + h); c.lineTo(x, y + k);
  c.closePath();
}

export function drawGlow(c, layer, ctx) {
  // Elliptical radial glow filling the layer box.
  const n = parseInt(tokenColor(layer.color || 'gold', COLORS.gold).replace('#', ''), 16);
  const rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  const k = (layer.intensity ?? 0.2) * (isLight(ctx.theme) ? 0.6 : 1);
  c.save();
  c.translate(layer.x + layer.w / 2, layer.y + layer.h / 2);
  c.scale(1, layer.h / layer.w);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, layer.w / 2);
  g.addColorStop(0, `rgba(${rgb},${k})`);
  g.addColorStop(0.5, `rgba(${rgb},${k * 0.3})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g; c.fillRect(-layer.w / 2, -layer.w / 2, layer.w, layer.w);
  c.restore();
}

/** Step number in a gold-edged chamfered tile. */
export function drawStep(c, layer, ctx) {
  const { x, y, w, h } = layer;
  const k = w * 0.22;
  const light = isLight(ctx.theme);
  chamfer(c, x, y, w, h, k);
  c.fillStyle = light ? COLORS.charcoal : 'rgba(45,46,43,0.92)'; c.fill();
  const g = c.createLinearGradient(x, y, x + w, y + h);
  for (const [o, col] of GRADIENTS.goldLeaf) g.addColorStop(o, col);
  c.strokeStyle = g; c.lineWidth = Math.max(2, w * 0.04);
  chamfer(c, x + c.lineWidth / 2, y + c.lineWidth / 2, w - c.lineWidth, h - c.lineWidth, k * 0.9); c.stroke();
  const txt = String(layer.text || '1');
  c.font = `700 ${h * (txt.length > 2 ? 0.36 : 0.48)}px ${FONTS.latin}`;
  c.fillStyle = COLORS.spark; c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'ltr';
  c.fillText(txt, x + w / 2, y + h / 2 + h * 0.03);
  c.textBaseline = 'alphabetic';
}

/** Gem check: diamond tile with a check stroke that draws on. */
export function drawCheck(c, layer, ctx, p = 1) {
  const s = Math.min(layer.w, layer.h);
  const cx = layer.x + layer.w / 2, cy = layer.y + layer.h / 2;
  c.save();
  c.translate(cx, cy); c.rotate(Math.PI / 4);
  const g = c.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
  for (const [o, col] of GRADIENTS.goldLeaf) g.addColorStop(o, col);
  c.fillStyle = g; const q = s / Math.SQRT2; c.fillRect(-q / 2, -q / 2, q, q);
  c.restore();
  const pts = [[-0.2, 0.02], [-0.05, 0.16], [0.22, -0.13]].map(([a, b]) => [cx + a * s, cy + b * s]);
  const seg1 = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]), seg2 = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
  const len = (seg1 + seg2) * clamp(p);
  c.strokeStyle = COLORS.ink; c.lineWidth = s * 0.1; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(...pts[0]);
  if (len <= seg1) c.lineTo(pts[0][0] + (pts[1][0] - pts[0][0]) * (len / seg1), pts[0][1] + (pts[1][1] - pts[0][1]) * (len / seg1));
  else { c.lineTo(...pts[1]); const r = (len - seg1) / seg2; c.lineTo(pts[1][0] + (pts[2][0] - pts[1][0]) * r, pts[1][1] + (pts[2][1] - pts[1][1]) * r); }
  c.stroke();
}

/** Dim everything except a rounded region, ring the region in Spark. */
export function drawFocus(c, layer, ctx) {
  const pad = 12 * ctx.s;
  const x = layer.x - pad, y = layer.y - pad, w = layer.w + pad * 2, h = layer.h + pad * 2;
  const r = (layer.radius ?? 18) * 1;
  c.save();
  if (layer.clip) { const k = layer.clip; rr(c, k.x, k.y, k.w, k.h, k.r || 0); c.clip(); }
  c.beginPath();
  c.rect(-ctx.W, -ctx.H, ctx.W * 3, ctx.H * 3);
  c.moveTo(x + r, y); c.arcTo(x, y, x, y + h, r); c.arcTo(x, y + h, x + w, y + h, r); c.arcTo(x + w, y + h, x + w, y, r); c.arcTo(x + w, y, x, y, r); c.closePath();
  c.fillStyle = `rgba(10,10,9,${layer.dim ?? 0.62})`;
  c.fill('evenodd');
  if (layer.clip) { c.restore(); c.save(); }
  rr(c, x, y, w, h, r);
  c.strokeStyle = COLORS.spark; c.lineWidth = 4 * ctx.s; c.shadowColor = 'rgba(242,212,107,0.55)'; c.shadowBlur = 22 * ctx.s; c.stroke();
  c.restore();
}

export function drawBubble(c, layer, ctx) {
  const { x, y, w, h } = layer;
  const r = Math.min(h / 2, 34 * ctx.s);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.25)'; c.shadowBlur = 30 * ctx.s; c.shadowOffsetY = 10 * ctx.s;
  rr(c, x, y, w, h, r); c.fillStyle = COLORS.cream; c.fill();
  // Tail towards the speaker.
  const tx = layer.tail === 'start' ? x + w * 0.18 : x + w * 0.82;
  c.beginPath(); c.moveTo(tx - 18 * ctx.s, y + h - 2); c.lineTo(tx + (layer.tail === 'start' ? -26 : 26) * ctx.s, y + h + 34 * ctx.s); c.lineTo(tx + 18 * ctx.s, y + h - 2); c.closePath(); c.fill();
  c.restore();
}

/**
 * One plate behind text lines (captions over footage or busy sets). Lines touch, so a multi-line caption reads as
 * a single stepped shape; only the outer corners are rounded and the shape is filled once (no darker seams).
 */
export function drawPlates(c, rects, ctx) {
  if (!rects.length) return;
  c.save();
  c.fillStyle = isLight(ctx.theme) ? 'rgba(255,248,234,0.9)' : 'rgba(21,21,19,0.8)';
  const R = Math.min(rects[0].h / 2, 18 * ctx.s);
  const rows = rects.map((r, i) => ({ ...r }));
  for (let i = 1; i < rows.length; i++) { const mid = (rows[i - 1].y + rows[i - 1].h + rows[i].y) / 2; rows[i - 1].h = mid - rows[i - 1].y; rows[i].h += rows[i].y - mid; rows[i].y = mid; }
  c.beginPath();
  rows.forEach((r, i) => {
    const prev = rows[i - 1], next = rows[i + 1];
    const wider = (o) => !o || r.x < o.x - 1 || r.x + r.w > o.x + o.w + 1;
    const top = wider(prev) ? R : 0, bottom = wider(next) ? R : 0;
    if (c.roundRect) c.roundRect(r.x, r.y, r.w, r.h + (next ? 0.5 : 0), [top, top, bottom, bottom]);
    else c.rect(r.x, r.y, r.w, r.h + (next ? 0.5 : 0));
  });
  c.fill('nonzero');
  c.restore();
}

// ---------- illustrations ----------
function placeholderPerson(c, layer) {
  // Simple silhouette until the illustration module is available.
  const { x, y, w, h } = layer;
  c.save();
  c.fillStyle = 'rgba(232,204,115,0.25)';
  c.beginPath(); c.arc(x + w / 2, y + h * 0.1, h * 0.065, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.moveTo(x + w * 0.3, y + h * 0.2); c.lineTo(x + w * 0.7, y + h * 0.2); c.lineTo(x + w * 0.82, y + h); c.lineTo(x + w * 0.18, y + h); c.closePath(); c.fill();
  c.restore();
}

export function drawCharacter(c, layer, ctx) {
  if (illustrator?.drawCharacter) illustrator.drawCharacter(c, layer.spec || {}, { x: layer.x, y: layer.y, w: layer.w, h: layer.h }, ctx.live ? ctx.lt : 0.8);
  else placeholderPerson(c, layer);
}

export function drawProp(c, layer, ctx) {
  if (illustrator?.drawProp) illustrator.drawProp(c, layer.prop, { x: layer.x, y: layer.y, w: layer.w, h: layer.h }, layer.opts || {}, ctx.live ? ctx.lt : 0.8);
}

export function drawSet(c, layer, ctx) {
  const { x, y, w, h } = layer;
  c.save();
  if (layer.radius) {
    const r = layer.radius, k = layer.facet ? 26 * ctx.s : 0;
    c.beginPath();
    c.moveTo(x + r, y);
    if (k) { c.lineTo(x + w - k, y); c.lineTo(x + w, y + k); } else c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r);
    c.closePath(); c.clip();
  }
  if (illustrator?.drawScene) illustrator.drawScene(c, layer.set || 'studio', { x, y, w, h }, { theme: layer.setTheme || ctx.theme, mood: layer.mood }, ctx.live ? ctx.lt : 0.8);
  else {
    const th = THEMES[ctx.theme] || THEMES.onyx;
    c.fillStyle = layer.mood === 'dim' ? '#1b1b19' : isLight(ctx.theme) ? COLORS.mist : COLORS.graphite;
    c.fillRect(x, y, w, h);
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x, y + h * 0.78, w, h * 0.22);
    void th;
  }
  if (layer.mood === 'dim' && (layer.setTheme || ctx.theme) !== 'cream') { c.fillStyle = 'rgba(12,12,11,0.18)'; c.fillRect(x, y, w, h); }
  // Top scrim keeps the panel's caption readable over busy sets.
  const light = (layer.setTheme || ctx.theme) === 'cream' || (layer.setTheme || ctx.theme) === 'sand';
  const sh = layer.scrimH ?? 0.42;
  const tint = (a) => (light ? `rgba(255,248,234,${a})` : `rgba(14,14,13,${a})`);
  if (layer.scrim !== false && layer.scrimSide) {
    // Side scrim: the caption column stays clean, the person's side of the set stays untouched.
    const fromLeft = layer.scrimSide === 'left';
    const g = c.createLinearGradient(fromLeft ? x : x + w, 0, fromLeft ? x + w * 0.72 : x + w * 0.28, 0);
    g.addColorStop(0, tint(0.9)); g.addColorStop(0.55, tint(0.82)); g.addColorStop(1, tint(0));
    c.fillStyle = g; c.fillRect(x, y, w, h);
  } else if (layer.scrim !== false) {
    const g = c.createLinearGradient(0, y, 0, y + h * sh);
    g.addColorStop(0, tint(0.82)); g.addColorStop(1, tint(0));
    c.fillStyle = g; c.fillRect(x, y, w, h * sh);
  }
  c.restore();
}

export { EASE, isArabic };
