// Props in the same flat editorial style as the characters: 2–3 tones per material, light from the
// upper left, 45° chamfers as a quiet brand nod. Each prop draws in its own unit box (w × h).
import { COLORS, GRADIENTS, FONTS } from '../../../shared/brand.js';
import { TAU, clamp, lerp, mix, tone, rgba, rng, shade, groundShadow, rrect, facetRect, spline, wave, fitBox } from './util.js';
import { FABRIC, SET_THEMES, setTheme, brand } from './palette.js';

const L = { x: -0.8, y: -0.6 };

function lin(c, x0, y0, x1, y1, stops) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}
const P = (fn) => { const p = new Path2D(); fn(p); return p; };
const gem = (c, x, y, r, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); c.fill(); };
const light = (o) => !(setTheme(o.theme).dark);

// ---------------------------------------------------------------- phone
function phone(c, o, t) {
  const w = 50, h = 100;
  const body = P((p) => rrect(p, 0, 0, w, h, 9));
  shade(c, body, '#232325', { shadow: '#151516', depth: 2.4, hi: '#4A4A4C', hiDepth: 1.2, light: L });
  c.fillStyle = '#3A3A3C'; c.fillRect(w - 0.6, 22, 1.6, 12); c.fillRect(w - 0.6, 38, 1.6, 7);
  const sx = 3, sy = 3, sw = w - 6, sh = h - 6;
  const scr = P((p) => rrect(p, sx, sy, sw, sh, 7));
  c.save();
  c.clip(scr);
  c.fillStyle = COLORS.onyx; c.fillRect(sx, sy, sw, sh);
  // soft top light (Onyx Glow)
  c.fillStyle = (() => { const g = c.createRadialGradient(w / 2, sy, 0, w / 2, sy, sh * 0.7); g.addColorStop(0, rgba(COLORS.graphite, 0.95)); g.addColorStop(1, rgba(COLORS.onyx, 0)); return g; })();
  c.fillRect(sx, sy, sw, sh);
  // status row + greeting skeleton
  c.fillStyle = rgba(COLORS.white, 0.75); c.fillRect(sx + 4, sy + 4.5, 7, 1.6);
  c.fillStyle = rgba(COLORS.stone, 0.8); c.fillRect(sx + 4, sy + 11, 12, 1.8);
  c.fillStyle = COLORS.white; c.fillRect(sx + 4, sy + 15, 20, 3);
  // holdings card with a gold line hint
  c.fillStyle = COLORS.charcoal; c.beginPath(); c.roundRect(sx + 3, sy + 22, sw - 6, 30, 4); c.fill();
  c.fillStyle = rgba(COLORS.stone, 0.9); c.fillRect(sx + 7, sy + 26, 10, 1.6);
  c.fillStyle = COLORS.white; c.fillRect(sx + 7, sy + 30, 16, 3.4);
  c.strokeStyle = COLORS.gold; c.lineWidth = 1.3; c.lineJoin = 'round';
  c.beginPath();
  const pts = [0, 0.35, 0.2, 0.5, 0.42, 0.62, 0.55, 0.8];
  pts.forEach((v, i) => { const x = sx + 7 + i * ((sw - 14) / (pts.length - 1)); const y = sy + 48 - v * 10; if (i) c.lineTo(x, y); else c.moveTo(x, y); });
  c.stroke();
  // action tiles
  for (let i = 0; i < 4; i++) {
    c.fillStyle = COLORS.graphite; c.beginPath(); c.roundRect(sx + 3 + i * ((sw - 6) / 4) + 0.6, sy + 56, (sw - 6) / 4 - 1.6, 9, 2); c.fill();
    gem(c, sx + 3 + i * ((sw - 6) / 4) + (sw - 6) / 8, sy + 60.5, 1.6, COLORS.gold);
  }
  // list rows
  for (let i = 0; i < 2; i++) {
    c.fillStyle = COLORS.graphite; c.beginPath(); c.roundRect(sx + 3, sy + 68 + i * 8, sw - 6, 6.2, 2); c.fill();
    c.fillStyle = rgba(COLORS.white, 0.7); c.fillRect(sx + 6, sy + 70.4 + i * 8, 12, 1.4);
  }
  // tab bar + spark FAB with the gem
  c.fillStyle = COLORS.charcoal; c.fillRect(sx, sy + sh - 9, sw, 9);
  c.fillStyle = COLORS.spark; c.beginPath(); c.arc(w / 2, sy + sh - 9, 4.2, 0, TAU); c.fill();
  gem(c, w / 2, sy + sh - 9, 1.6, COLORS.ink);
  if (o.glow) { // gentle screen glow
    const g = 0.5 + 0.5 * Math.sin(t * 2.4);
    c.fillStyle = rgba(COLORS.spark, 0.05 + 0.05 * g); c.fillRect(sx, sy, sw, sh);
  }
  c.restore();
  // dynamic island
  c.fillStyle = '#0B0B0B'; c.beginPath(); c.roundRect(w / 2 - 7, sy + 2, 14, 3.4, 1.7); c.fill();
}

// ---------------------------------------------------------------- gold bar
function goldbar(c, o, t) {
  const w = 60, h = 96, d = 6; // d: 45° thickness
  const f = 9; // facet corner
  // thickness (extruded at 45°, bottom-right)
  const side = P((p) => { p.moveTo(w, f); p.lineTo(w + d, f + d); p.lineTo(w + d, h + d - 6); p.quadraticCurveTo(w + d, h + d, w + d - 6, h + d); p.lineTo(6 + d, h + d); p.lineTo(6, h); p.lineTo(w - 6, h); p.quadraticCurveTo(w, h, w, h - 6); p.closePath(); });
  c.fillStyle = lin(c, 0, 0, w, h, [[0, '#8A6B41'], [1, COLORS.bronzeDeep]]);
  c.fill(side);
  const face = P((p) => facetRect(p, 0, 0, w, h, 6, f));
  c.fillStyle = lin(c, 0, 0, w, h, [[0, COLORS.spark], [0.5, COLORS.gold], [1, COLORS.amber]]);
  c.fill(face);
  c.save();
  c.clip(face);
  // bevel: lit top-left rim, darker bottom-right rim
  c.strokeStyle = rgba('#FFFFFF', 0.45); c.lineWidth = 3;
  c.beginPath(); c.moveTo(1.5, h - 6); c.lineTo(1.5, 6); c.quadraticCurveTo(1.5, 1.5, 6, 1.5); c.lineTo(w - f - 0.5, 1.5); c.stroke();
  c.strokeStyle = rgba(COLORS.bronzeDeep, 0.35); c.lineWidth = 3;
  c.beginPath(); c.moveTo(w - 1.5, f + 1); c.lineTo(w - 1.5, h - 6); c.quadraticCurveTo(w - 1.5, h - 1.5, w - 6, h - 1.5); c.lineTo(6, h - 1.5); c.stroke();
  // stamp field
  c.strokeStyle = rgba(COLORS.bronzeDeep, 0.38); c.lineWidth = 1.4;
  c.beginPath(); facetRect(c, 7, 7, w - 14, h - 14, 4, 6); c.stroke();
  gem(c, w / 2, 24, 5.5, rgba(COLORS.bronzeDeep, 0.55));
  c.fillStyle = rgba(COLORS.espresso, 0.72);
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'ltr';
  c.font = `700 12.5px ${FONTS.latin}`;
  c.fillText('999.9', w / 2, 50);
  c.font = `600 7.5px ${FONTS.latin}`;
  c.fillText(o.label || 'FINE GOLD', w / 2, 63);
  c.fillRect(w / 2 - 12, 72, 24, 1.2);
  // animated gleam
  const gp = ((t / 3.2) % 1) * 2.2 - 0.6;
  if (gp > -0.4 && gp < 1.4) {
    const gx = gp * (w + h);
    c.fillStyle = lin(c, gx - 22, 0, gx + 22, 22, [[0, rgba('#FFFFFF', 0)], [0.5, rgba('#FFFFFF', 0.4)], [1, rgba('#FFFFFF', 0)]]);
    c.beginPath(); c.moveTo(gx - 30, 0); c.lineTo(gx - 8, 0); c.lineTo(gx - 8 - h, h); c.lineTo(gx - 30 - h, h); c.closePath(); c.fill();
  }
  c.restore();
}

// ---------------------------------------------------------------- coin
function coin(c, o, t) {
  const r = 40, cx = 42, cy = 40;
  c.fillStyle = lin(c, 0, 0, 84, 84, [[0, '#8A6B41'], [1, COLORS.bronzeDeep]]);
  c.beginPath(); c.arc(cx + 3.5, cy + 3.5, r, 0, TAU); c.fill();
  c.fillStyle = lin(c, cx - r, cy - r, cx + r, cy + r, [[0, COLORS.spark], [0.55, COLORS.gold], [1, COLORS.amber]]);
  c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill();
  c.strokeStyle = rgba(COLORS.bronzeDeep, 0.35); c.lineWidth = 1.2;
  for (let i = 0; i < 60; i++) { const a = (i / 60) * TAU; c.beginPath(); c.moveTo(cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1)); c.lineTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4)); c.stroke(); }
  c.strokeStyle = rgba(COLORS.bronzeDeep, 0.4); c.lineWidth = 1.6;
  c.beginPath(); c.arc(cx, cy, r - 8, 0, TAU); c.stroke();
  c.strokeStyle = rgba('#FFFFFF', 0.5); c.lineWidth = 2;
  c.beginPath(); c.arc(cx, cy, r - 2, Math.PI * 0.95, Math.PI * 1.45); c.stroke();
  // faceted gem in relief
  const g = 14;
  c.fillStyle = rgba(COLORS.spark, 0.9); c.beginPath(); c.moveTo(cx, cy - g); c.lineTo(cx, cy); c.lineTo(cx - g, cy); c.closePath(); c.fill();
  c.fillStyle = rgba(COLORS.gold, 0.95); c.beginPath(); c.moveTo(cx, cy - g); c.lineTo(cx + g, cy); c.lineTo(cx, cy); c.closePath(); c.fill();
  c.fillStyle = rgba(COLORS.amber, 0.95); c.beginPath(); c.moveTo(cx + g, cy); c.lineTo(cx, cy + g); c.lineTo(cx, cy); c.closePath(); c.fill();
  c.fillStyle = rgba(COLORS.bullion, 0.95); c.beginPath(); c.moveTo(cx, cy + g); c.lineTo(cx - g, cy); c.lineTo(cx, cy); c.closePath(); c.fill();
  const tw = 0.5 + 0.5 * Math.sin(t * 3);
  sparkle(c, cx - 22, cy - 22, 5 + 3 * tw, rgba('#FFFFFF', 0.6 + 0.4 * tw));
}

// ---------------------------------------------------------------- gift box (3/4, extruded at 45°)
function giftbox(c, o, t) {
  const W = 84, H = 64, D = 18; // front face, depth
  const x = 4, y = 38;
  const dark = o.color ? false : light(o) && !o.held;
  const base = o.color ? brand(o.color) : dark ? COLORS.charcoal : COLORS.cream;
  const front = base, sideC = tone(base, dark ? 0.08 : -0.12), topC = tone(base, dark ? 0.16 : 0.35);
  const rib = o.ribbon ? brand(o.ribbon) : COLORS.bullion, ribD = tone(rib, -0.18), ribL = tone(rib, 0.25);
  // body
  c.fillStyle = sideC; c.beginPath(); c.moveTo(x + W, y); c.lineTo(x + W + D, y - D); c.lineTo(x + W + D, y + H - D); c.lineTo(x + W, y + H); c.closePath(); c.fill();
  c.fillStyle = front; c.fillRect(x, y, W, H);
  c.fillStyle = rgba('#000000', 0.08); c.fillRect(x, y, W, 7);
  // lid (overhangs a little)
  const lx = x - 4, ly = y - 14, lw = W + 8, lh = 16;
  c.fillStyle = topC; c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + D, ly - D); c.lineTo(lx + lw + D, ly - D); c.lineTo(lx + lw, ly); c.closePath(); c.fill();
  c.fillStyle = tone(sideC, -0.02); c.beginPath(); c.moveTo(lx + lw, ly); c.lineTo(lx + lw + D, ly - D); c.lineTo(lx + lw + D, ly + lh - D); c.lineTo(lx + lw, ly + lh); c.closePath(); c.fill();
  c.fillStyle = tone(front, dark ? 0.05 : -0.03); c.fillRect(lx, ly, lw, lh);
  // ribbon: a cross band — horizontal round the front and side, vertical over the lid and top
  const rw = 10, rx = x + W / 2 - rw / 2;
  c.fillStyle = rib; c.fillRect(x, y + H / 2 - 4, W, 8);
  c.fillStyle = rgba('#000000', 0.12); c.fillRect(x, y + H / 2 + 2, W, 2);
  c.fillStyle = rib; c.fillRect(rx, ly, rw, H + 14 + (y - ly - 14));
  c.fillStyle = ribD; c.beginPath(); c.moveTo(x + W, y + H / 2 - 4); c.lineTo(x + W + D, y + H / 2 - 4 - D); c.lineTo(x + W + D, y + H / 2 + 4 - D); c.lineTo(x + W, y + H / 2 + 4); c.closePath(); c.fill();
  c.fillStyle = ribL; c.beginPath(); c.moveTo(rx, ly); c.lineTo(rx + D, ly - D); c.lineTo(rx + rw + D, ly - D); c.lineTo(rx + rw, ly); c.closePath(); c.fill();
  c.fillStyle = ribD; c.beginPath(); c.moveTo(lx + lw, ly + lh / 2 - 3); c.lineTo(lx + lw + D, ly + lh / 2 - 3 - D); c.lineTo(lx + lw + D, ly + lh / 2 + 3 - D); c.lineTo(lx + lw, ly + lh / 2 + 3); c.closePath(); c.fill();
  // bow on top
  const bx = rx + rw / 2 + D / 2, by = ly - D / 2;
  const loop = (s) => P((p) => { p.moveTo(bx, by); p.bezierCurveTo(bx + s * 8, by - 26, bx + s * 30, by - 22, bx + s * 22, by - 6); p.quadraticCurveTo(bx + s * 14, by + 2, bx, by); p.closePath(); });
  c.fillStyle = rib; c.fill(loop(-1)); c.fillStyle = ribD; c.fill(loop(1));
  c.fillStyle = rgba('#FFFFFF', 0.25); c.beginPath(); c.moveTo(bx - 4, by - 4); c.bezierCurveTo(bx - 8, by - 18, bx - 20, by - 18, bx - 18, by - 8); c.quadraticCurveTo(bx - 12, by - 8, bx - 4, by - 4); c.fill();
  c.fillStyle = ribD; c.beginPath(); c.moveTo(bx - 3, by); c.lineTo(bx - 12, by + 14); c.lineTo(bx - 6, by + 13); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(bx + 3, by); c.lineTo(bx + 10, by + 15); c.lineTo(bx + 15, by + 11); c.closePath(); c.fill();
  c.fillStyle = ribL; c.beginPath(); c.roundRect(bx - 5, by - 5, 10, 9, 3); c.fill();
}

// ---------------------------------------------------------------- shopping bag
function bag(c, o, t) {
  const W = 80, H = 92, D = 14, x = 4, y = 30;
  const base = o.color ? brand(o.color) : COLORS.sand;
  const front = base, sideC = tone(base, -0.16);
  // handles
  c.strokeStyle = COLORS.espresso; c.lineWidth = 3.4; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x + 22, y + 4); c.bezierCurveTo(x + 22, y - 30, x + 58, y - 30, x + 58, y + 4); c.stroke();
  c.strokeStyle = tone(COLORS.espresso, 0.2);
  c.beginPath(); c.moveTo(x + 28 + D * 0.4, y - 2); c.bezierCurveTo(x + 28 + D * 0.4, y - 28, x + 62 + D * 0.4, y - 28, x + 62 + D * 0.4, y - 4); c.stroke();
  c.fillStyle = sideC; c.beginPath(); c.moveTo(x + W, y); c.lineTo(x + W + D, y - 6); c.lineTo(x + W + D, y + H - 6); c.lineTo(x + W, y + H); c.closePath(); c.fill();
  c.fillStyle = front; c.fillRect(x, y, W, H);
  c.fillStyle = tone(base, -0.07); c.fillRect(x, y, W, 12);
  c.fillStyle = COLORS.espresso; c.beginPath(); c.arc(x + 22, y + 6, 2.4, 0, TAU); c.arc(x + 58, y + 6, 2.4, 0, TAU); c.fill();
  // small gem mark (generic, not the logo)
  gem(c, x + W / 2, y + 50, 9, tone(base, -0.3));
  gem(c, x + W / 2, y + 50, 5, tone(base, 0.25));
}

// ---------------------------------------------------------------- coffee (takeaway cup)
function coffee(c, o, t) {
  const top = 30, bot = 84, wt = 38, wb = 29, cx = 24;
  const cup = P((p) => { p.moveTo(cx - wt / 2, top); p.lineTo(cx + wt / 2, top); p.lineTo(cx + wb / 2, bot); p.lineTo(cx - wb / 2, bot); p.closePath(); });
  shade(c, cup, '#FFFFFF', { shadow: '#E3D8C6', depth: 6, light: L });
  c.strokeStyle = rgba(COLORS.stoneDark, 0.3); c.lineWidth = 1.2; c.stroke(cup);
  const sl = P((p) => { p.moveTo(cx - wt / 2 + 2.5, 46); p.lineTo(cx + wt / 2 - 2.5, 46); p.lineTo(cx + wt / 2 - 5, 67); p.lineTo(cx - wt / 2 + 5, 67); p.closePath(); });
  shade(c, sl, COLORS.bronze, { shadow: COLORS.bronzeDeep, depth: 4, light: L });
  gem(c, cx, 56.5, 3.6, COLORS.sand);
  c.fillStyle = COLORS.charcoal; c.beginPath(); c.roundRect(cx - wt / 2 - 2, top - 6, wt + 4, 8, 2.5); c.fill();
  c.fillStyle = COLORS.graphite; c.beginPath(); c.roundRect(cx - wt / 2 + 3, top - 11, wt - 6, 6, 2); c.fill();
  // steam (kept inside the prop box)
  const s = (t * 0.5) % 1;
  c.strokeStyle = rgba(COLORS.stone, 0.5 * (1 - s)); c.lineWidth = 2; c.lineCap = 'round';
  c.beginPath(); c.moveTo(cx - 2, top - 13 - s * 6); c.bezierCurveTo(cx - 7, top - 18 - s * 6, cx + 3, top - 22 - s * 6, cx - 1, top - 28 - s * 2); c.stroke();
}

// ---------------------------------------------------------------- receipts
function receipts(c, o, t) {
  const r = rng(o.seed || 7);
  const n = o.held ? 4 : 6;
  for (let i = 0; i < n; i++) {
    const w = 34 + r() * 10, h = 52 + r() * 26;
    const x = 18 + r() * (o.held ? 34 : 54), y = 18 + r() * (o.held ? 18 : 30);
    const a = (r() - 0.5) * (o.held ? 0.7 : 1.3);
    c.save();
    c.translate(x + w / 2, y + h / 2);
    c.rotate(a);
    const p = P((q) => {
      q.moveTo(-w / 2, -h / 2); q.lineTo(w / 2, -h / 2); q.lineTo(w / 2, h / 2);
      const teeth = 6;
      for (let k = 0; k < teeth; k++) { const xx = w / 2 - (k + 0.5) * (w / teeth); q.lineTo(xx, h / 2 - 3.5); q.lineTo(w / 2 - (k + 1) * (w / teeth), h / 2); }
      q.closePath();
    });
    c.fillStyle = rgba('#000000', 0.1); c.save(); c.translate(1.5, 2); c.fill(p); c.restore();
    shade(c, p, i % 3 === 1 ? '#F4EFE4' : '#FFFFFF', { shadow: '#E2DACB', depth: 3, light: L });
    c.fillStyle = rgba(COLORS.stoneDark, 0.55);
    const rows = Math.floor((h - 18) / 7);
    for (let k = 0; k < rows; k++) {
      const lw = (k === 0 ? 0.55 : 0.35 + r() * 0.5) * (w - 10);
      c.fillRect(-w / 2 + 5, -h / 2 + 7 + k * 7, lw, k === 0 ? 2.6 : 1.6);
      if (k > 0 && k < rows - 1) c.fillRect(w / 2 - 5 - 7, -h / 2 + 7 + k * 7, 7, 1.6);
    }
    c.fillStyle = rgba(COLORS.charcoal, 0.7); c.fillRect(w / 2 - 17, h / 2 - 12, 12, 2.6);
    c.restore();
  }
}

// ---------------------------------------------------------------- safe / vault
function safe(c, o, t) {
  const th = setTheme(o.theme);
  const base = th.dark ? COLORS.graphite : COLORS.charcoal;
  const W = 100, H = 104;
  const body = P((p) => facetRect(p, 0, 4, W, H, 10, 14));
  shade(c, body, base, { shadow: tone(base, -0.3), depth: 6, hi: tone(base, 0.12), hiDepth: 2, light: L });
  const door = P((p) => facetRect(p, 9, 13, W - 26, H - 18, 7, 10));
  shade(c, door, tone(base, 0.06), { shadow: tone(base, -0.18), depth: 3, light: { x: 0.8, y: 0.6 } });
  c.fillStyle = tone(base, -0.25); c.fillRect(W - 15, 26, 5, 14); c.fillRect(W - 15, H - 30, 5, 14);
  // dial
  const cx = 46, cy = 54;
  c.fillStyle = tone(base, -0.2); c.beginPath(); c.arc(cx + 1.5, cy + 2, 19, 0, TAU); c.fill();
  c.fillStyle = lin(c, cx - 18, cy - 18, cx + 18, cy + 18, [[0, COLORS.sand], [0.6, COLORS.gold], [1, COLORS.bronze]]);
  c.beginPath(); c.arc(cx, cy, 18, 0, TAU); c.fill();
  c.strokeStyle = rgba(COLORS.bronzeDeep, 0.6); c.lineWidth = 1.2;
  for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU + t * 0.4; c.beginPath(); c.moveTo(cx + Math.cos(a) * 13, cy + Math.sin(a) * 13); c.lineTo(cx + Math.cos(a) * (i % 6 ? 15.5 : 17), cy + Math.sin(a) * (i % 6 ? 15.5 : 17)); c.stroke(); }
  c.fillStyle = COLORS.bronzeDeep; c.beginPath(); c.arc(cx, cy, 6, 0, TAU); c.fill();
  // handle
  c.strokeStyle = COLORS.gold; c.lineWidth = 3.4; c.lineCap = 'round';
  for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * (TAU / 3) + 0.4; c.beginPath(); c.moveTo(cx, cy + 32); c.lineTo(cx + Math.cos(a) * 9, cy + 32 + Math.sin(a) * 9); c.stroke(); }
  c.fillStyle = COLORS.gold; c.beginPath(); c.arc(cx, cy + 32, 3, 0, TAU); c.fill();
  c.fillStyle = tone(base, -0.35); c.fillRect(8, H + 4, 14, 5); c.fillRect(W - 22, H + 4, 14, 5);
}

// ---------------------------------------------------------------- house (flat-roof Omani villa)
function house(c, o, t) {
  const th = setTheme(o.theme);
  const wall = th.dark ? '#4A453D' : '#F3E9D6', wallS = th.dark ? '#3A362F' : '#E1D3BA', glass = th.dark ? '#2A2C2E' : '#5A5A55';
  const wood = th.dark ? '#5A4330' : COLORS.bronze;
  // side block
  c.fillStyle = wallS; c.fillRect(82, 40, 42, 66);
  c.fillStyle = tone(wallS, -0.08); c.fillRect(80, 34, 46, 8);
  // main block
  c.fillStyle = wall; c.fillRect(6, 22, 80, 84);
  c.fillStyle = tone(wall, -0.06); c.fillRect(2, 14, 88, 10);
  // parapet notches
  c.fillStyle = tone(wall, -0.06);
  for (let i = 0; i < 8; i++) { const x = 4 + i * 11; c.beginPath(); c.moveTo(x, 15); c.lineTo(x, 11); c.lineTo(x + 2, 11); c.lineTo(x + 2, 7); c.lineTo(x + 6, 7); c.lineTo(x + 6, 11); c.lineTo(x + 8, 11); c.lineTo(x + 8, 15); c.closePath(); c.fill(); }
  c.fillStyle = rgba('#000000', 0.08); c.fillRect(6, 24, 80, 4);
  // arched windows
  const arch = (x, y, w, h) => P((p) => { p.moveTo(x, y + h); p.lineTo(x, y + w / 2); p.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); p.lineTo(x + w, y + h); p.closePath(); });
  for (const [x, y] of [[16, 36], [56, 36], [92, 52]]) {
    c.fillStyle = glass; c.fill(arch(x, y, 18, 26));
    c.fillStyle = rgba('#FFFFFF', th.dark ? 0.06 : 0.18); c.fillRect(x + 3, y + 12, 4, 12);
    c.fillStyle = tone(wall, -0.12); c.fillRect(x - 2, y + 26, 22, 3);
  }
  for (const [x, y] of [[16, 72], [92, 80]]) { c.fillStyle = glass; c.fillRect(x, y, 18, 18); c.fillStyle = tone(wall, -0.12); c.fillRect(x - 2, y + 18, 22, 3); }
  // door
  c.fillStyle = wood; c.fill(arch(50, 70, 24, 36));
  c.fillStyle = tone(wood, -0.2); c.fillRect(61, 80, 2, 26);
  c.fillStyle = COLORS.gold; c.beginPath(); c.arc(58, 92, 1.6, 0, TAU); c.arc(66, 92, 1.6, 0, TAU); c.fill();
  c.fillStyle = tone(wall, -0.15); c.fillRect(0, 104, 128, 4);
}

// ---------------------------------------------------------------- traditional souq gold shop
function shopfront(c, o, t) {
  const th = setTheme(o.theme);
  const stone = th.dark ? '#3A352D' : '#E6D6B8', stoneS = th.dark ? '#2E2A24' : '#D4C09C';
  const wood = th.dark ? '#4A3424' : '#7A5233', woodD = tone(wood, -0.25), woodL = tone(wood, 0.15);
  const inner = th.dark ? '#1B1A17' : '#3A2E24';
  const W = 200, H = 170;
  c.fillStyle = stone; c.fillRect(0, 0, W, H);
  // stone coursing
  c.strokeStyle = stoneS; c.lineWidth = 1.5;
  for (let y = 12; y < H; y += 16) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); for (let x = (y / 16) % 2 ? 0 : 20; x < W; x += 40) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 16); c.stroke(); } }
  // carved wooden arch frame
  const arch = (x, y, w, h) => P((p) => { p.moveTo(x, y + h); p.lineTo(x, y + w * 0.42); p.quadraticCurveTo(x, y, x + w / 2, y - w * 0.12); p.quadraticCurveTo(x + w, y, x + w, y + w * 0.42); p.lineTo(x + w, y + h); p.closePath(); });
  c.fillStyle = woodD; c.fill(arch(22, 30, 156, 140));
  c.fillStyle = wood; c.fill(arch(28, 36, 144, 134));
  c.fillStyle = inner; c.fill(arch(38, 48, 124, 122));
  // warm interior light
  c.save(); c.clip(arch(38, 48, 124, 122));
  const g = c.createRadialGradient(100, 70, 4, 100, 90, 110); g.addColorStop(0, rgba(COLORS.sand, 0.32)); g.addColorStop(1, rgba(COLORS.sand, 0)); c.fillStyle = g; c.fillRect(38, 30, 124, 140);
  // shelves with gold pieces (bangles, pendants)
  for (let s = 0; s < 3; s++) {
    const y = 84 + s * 26;
    c.fillStyle = woodL; c.fillRect(40, y + 12, 120, 3);
    for (let i = 0; i < 7; i++) {
      const x = 52 + i * 16;
      const tw = 0.5 + 0.5 * Math.sin(t * 2.2 + i * 1.3 + s * 2);
      if ((i + s) % 3 === 0) { c.strokeStyle = COLORS.gold; c.lineWidth = 2.2; c.beginPath(); c.ellipse(x, y + 4, 5.5, 7, 0, 0, TAU); c.stroke(); }
      else if ((i + s) % 3 === 1) { c.strokeStyle = COLORS.bullion; c.lineWidth = 1.4; c.beginPath(); c.arc(x, y - 4, 6, 0.2, Math.PI - 0.2); c.stroke(); gem(c, x, y + 4, 3, COLORS.gold); }
      else { c.fillStyle = COLORS.sand; c.fillRect(x - 4, y + 2, 8, 9); }
      if (tw > 0.92) sparkle(c, x + 4, y - 4, 4, rgba('#FFFFFF', 0.8));
    }
  }
  // glass counter front
  c.fillStyle = rgba(th.dark ? '#5A5040' : '#FFF8EA', 0.12); c.fillRect(38, 150, 124, 20);
  c.fillStyle = woodD; c.fillRect(38, 148, 124, 3);
  c.restore();
  // carved band with 45° pattern
  c.fillStyle = woodD; c.fillRect(10, 8, 180, 18);
  for (let i = 0; i < 15; i++) gem(c, 18 + i * 12, 17, 4.5, i % 2 ? woodL : COLORS.bullion);
  // hanging lanterns
  for (const lx of [14, 186]) {
    const sw = Math.sin(t * 1.4 + lx) * 1.5;
    c.strokeStyle = woodD; c.lineWidth = 1.2; c.beginPath(); c.moveTo(lx, 26); c.lineTo(lx + sw, 44); c.stroke();
    c.fillStyle = COLORS.bronze; c.beginPath(); c.moveTo(lx + sw - 6, 50); c.lineTo(lx + sw, 42); c.lineTo(lx + sw + 6, 50); c.lineTo(lx + sw + 5, 64); c.lineTo(lx + sw - 5, 64); c.closePath(); c.fill();
    c.fillStyle = rgba(COLORS.spark, 0.8 + 0.2 * Math.sin(t * 3 + lx)); c.fillRect(lx + sw - 3, 51, 6, 10);
  }
}

// ---------------------------------------------------------------- calendar
function calendar(c, o, t) {
  const W = 96, H = 96;
  const th = setTheme(o.theme);
  const card = th.dark ? COLORS.graphite : COLORS.white, ink = th.dark ? COLORS.stone : COLORS.mist;
  const body = P((p) => facetRect(p, 0, 8, W, H - 8, 10, 14));
  c.fillStyle = rgba('#000000', 0.12); c.save(); c.translate(2, 3); c.fill(body); c.restore();
  c.fillStyle = card; c.fill(body);
  c.save(); c.clip(body); c.fillStyle = o.color ? brand(o.color) : COLORS.bronze; c.fillRect(0, 0, W, 26); c.restore();
  c.fillStyle = COLORS.charcoal;
  for (const x of [26, 70]) { c.beginPath(); c.roundRect(x - 3, 0, 6, 16, 3); c.fill(); }
  for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) {
    const x = 9 + k * 13.5, y = 36 + r * 14;
    const hit = r === 2 && k === 3;
    c.fillStyle = hit ? COLORS.gold : ink;
    if (hit) gem(c, x + 4.5, y + 4, 6.5, COLORS.gold);
    else { c.beginPath(); c.roundRect(x, y, 9, 8, 2); c.fill(); }
  }
}

// ---------------------------------------------------------------- clock
function clock(c, o, t) {
  const cx = 50, cy = 50, r = 46;
  const th = setTheme(o.theme);
  const face = th.dark ? COLORS.graphite : COLORS.white, rim = th.dark ? COLORS.slate : COLORS.charcoal;
  c.fillStyle = rgba('#000000', 0.14); c.beginPath(); c.arc(cx + 2, cy + 3, r, 0, TAU); c.fill();
  c.fillStyle = rim; c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill();
  c.fillStyle = face; c.beginPath(); c.arc(cx, cy, r - 6, 0, TAU); c.fill();
  c.strokeStyle = th.dark ? COLORS.stone : COLORS.stoneDark;
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; c.lineWidth = i % 3 ? 1.6 : 3; c.beginPath(); c.moveTo(cx + Math.cos(a) * (r - 11), cy + Math.sin(a) * (r - 11)); c.lineTo(cx + Math.cos(a) * (r - (i % 3 ? 15 : 18)), cy + Math.sin(a) * (r - (i % 3 ? 15 : 18))); c.stroke(); }
  const sp = o.speed ?? 1;
  const m = (t * sp * 0.5) * TAU + 1.2, h = m / 12 + 2.4;
  c.lineCap = 'round';
  c.strokeStyle = th.dark ? COLORS.white : COLORS.charcoal; c.lineWidth = 4.5;
  c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(h - Math.PI / 2) * 20, cy + Math.sin(h - Math.PI / 2) * 20); c.stroke();
  c.lineWidth = 3; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(m - Math.PI / 2) * 30, cy + Math.sin(m - Math.PI / 2) * 30); c.stroke();
  c.fillStyle = COLORS.gold; c.beginPath(); c.arc(cx, cy, 4, 0, TAU); c.fill();
}

// ---------------------------------------------------------------- wallet
function wallet(c, o, t) {
  const base = o.color ? brand(o.color) : COLORS.bronzeDeep;
  // card peeking out
  c.save(); c.translate(30, 6); c.rotate(-0.12);
  c.fillStyle = COLORS.charcoal; c.beginPath(); c.roundRect(0, 0, 60, 38, 4); c.fill();
  c.fillStyle = COLORS.gold; c.beginPath(); c.roundRect(8, 10, 11, 8, 1.6); c.fill();
  c.fillStyle = rgba(COLORS.stone, 0.7); c.fillRect(8, 26, 30, 2.4);
  c.restore();
  const body = P((p) => rrect(p, 4, 22, 102, 62, 9));
  shade(c, body, base, { shadow: tone(base, -0.22), depth: 5, hi: tone(base, 0.15), hiDepth: 2, light: L });
  const flap = P((p) => { p.moveTo(56, 34); p.lineTo(106, 34); p.lineTo(106, 70); p.lineTo(56, 70); p.quadraticCurveTo(48, 52, 56, 34); p.closePath(); });
  shade(c, flap, tone(base, 0.08), { shadow: tone(base, -0.12), depth: 3, light: L });
  c.fillStyle = COLORS.gold; c.beginPath(); c.arc(64, 52, 4.5, 0, TAU); c.fill();
  c.setLineDash([3, 3]); c.strokeStyle = rgba(COLORS.sand, 0.55); c.lineWidth = 1.2;
  c.beginPath(); c.roundRect(9, 27, 92, 52, 6); c.stroke(); c.setLineDash([]);
}

// ---------------------------------------------------------------- chart card (no numbers)
function chartCard(c, o, t) {
  const W = 160, H = 108;
  const th = setTheme(o.theme);
  const card = th.dark ? COLORS.graphite : COLORS.white, sk = th.dark ? COLORS.slate : COLORS.mist;
  const lineC = th.dark ? COLORS.gold : COLORS.bronze;
  const body = P((p) => facetRect(p, 0, 0, W, H, 12, 14));
  c.fillStyle = rgba('#000000', th.dark ? 0.3 : 0.1); c.save(); c.translate(0, 4); c.fill(body); c.restore();
  c.fillStyle = card; c.fill(body);
  gem(c, 16, 17, 5, COLORS.gold);
  c.fillStyle = sk; c.beginPath(); c.roundRect(28, 13, 44, 7, 3.5); c.fill();
  c.fillStyle = th.dark ? COLORS.white : COLORS.charcoal; c.beginPath(); c.roundRect(12, 28, 62, 10, 4); c.fill();
  // pill segmented control
  for (let i = 0; i < 4; i++) { c.fillStyle = i === 2 ? COLORS.spark : sk; c.beginPath(); c.roundRect(92 + i * 15, 13, 12, 7, 3.5); c.fill(); }
  const pts = [0.3, 0.38, 0.33, 0.46, 0.42, 0.55, 0.5, 0.58, 0.66, 0.6, 0.72];
  const x0 = 12, x1 = W - 12, y0 = 92, y1 = 50;
  const X = (i) => x0 + (i / (pts.length - 1)) * (x1 - x0);
  const Y = (i) => y0 - (pts[i] + Math.sin(t * 1.4 + i) * 0.02 * (i / pts.length)) * (y0 - y1) * 1.2;
  c.beginPath(); c.moveTo(X(0), Y(0)); for (let i = 1; i < pts.length; i++) c.lineTo(X(i), Y(i)); c.lineTo(x1, y0 + 6); c.lineTo(x0, y0 + 6); c.closePath();
  c.fillStyle = lin(c, 0, y1, 0, y0 + 6, [[0, rgba(th.dark ? COLORS.spark : COLORS.bronze, 0.28)], [1, rgba(th.dark ? COLORS.spark : COLORS.bronze, 0)]]); c.fill();
  c.beginPath(); c.moveTo(X(0), Y(0)); for (let i = 1; i < pts.length; i++) c.lineTo(X(i), Y(i));
  c.strokeStyle = lineC; c.lineWidth = 2.6; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke();
  const e = pts.length - 1;
  c.fillStyle = rgba(lineC, 0.25); c.beginPath(); c.arc(X(e), Y(e), 6 + Math.sin(t * 3) * 1.5, 0, TAU); c.fill();
  c.fillStyle = lineC; c.beginPath(); c.arc(X(e), Y(e), 3.2, 0, TAU); c.fill();
}

// ---------------------------------------------------------------- sofa
function sofa(c, o, t) {
  const th = setTheme(o.theme);
  const f = o.color ? brand(o.color) : th.fabric, fS = tone(f, -0.12), fD = tone(f, -0.22), fH = tone(f, 0.12);
  const W = 230, H = 112;
  c.fillStyle = th.wood2; c.fillRect(22, H - 10, 8, 10); c.fillRect(W - 30, H - 10, 8, 10);
  // back
  const back = P((p) => facetRect(p, 14, 6, W - 28, 62, 12, 0));
  shade(c, back, fS, { shadow: fD, depth: 6, light: L });
  for (const x of [28, 118]) { const cu = P((p) => rrect(p, x, 14, 84, 52, 12)); shade(c, cu, f, { shadow: fS, depth: 6, light: L }); }
  // seat
  const seat = P((p) => rrect(p, 18, 62, W - 36, 26, 9));
  shade(c, seat, fH, { shadow: fS, depth: 6, light: L });
  c.strokeStyle = fS; c.lineWidth = 2; c.beginPath(); c.moveTo(W / 2, 64); c.lineTo(W / 2, 86); c.stroke();
  const base = P((p) => rrect(p, 10, 82, W - 20, 20, 6));
  shade(c, base, fS, { shadow: fD, depth: 5, light: L });
  // arms with 45° chamfered tops
  for (const x of [0, W - 34]) { const a = P((p) => facetRect(p, x, 36, 34, 66, 10, 10)); shade(c, a, f, { shadow: fS, depth: 6, light: L }); }
  // cushion accent
  const pc = P((p) => { p.moveTo(150, 38); p.lineTo(178, 30); p.lineTo(186, 58); p.lineTo(156, 64); p.closePath(); });
  shade(c, pc, th.dark ? '#5A4A33' : COLORS.sand, { shadow: th.dark ? '#46392A' : '#D6B860', depth: 4, light: L });
}

// ---------------------------------------------------------------- plant
function plant(c, o, t) {
  const th = setTheme(o.theme);
  const g1 = th.plant, g2 = th.plant2;
  const sway = Math.sin(t * 1.1) * 0.02;
  const leaves = [[-0.55, 92, 13], [-0.25, 116, 15], [0.05, 128, 16], [0.32, 110, 14], [0.6, 86, 12], [-0.85, 66, 10], [0.88, 62, 10]];
  leaves.forEach(([a, l, w], i) => {
    c.save();
    c.translate(40, 98);
    c.rotate(a + sway * (i % 2 ? 1 : -1));
    const p = P((q) => { q.moveTo(0, 0); q.quadraticCurveTo(w, -l * 0.45, 0, -l); q.quadraticCurveTo(-w, -l * 0.45, 0, 0); q.closePath(); });
    c.fillStyle = i % 2 ? g2 : g1; c.fill(p);
    c.strokeStyle = tone(i % 2 ? g2 : g1, -0.15); c.lineWidth = 1.4; c.beginPath(); c.moveTo(0, -4); c.lineTo(0, -l * 0.9); c.stroke();
    c.restore();
  });
  // chamfered pot
  const pot = P((p) => { p.moveTo(18, 98); p.lineTo(62, 98); p.lineTo(58, 140); p.lineTo(22, 140); p.closePath(); });
  shade(c, pot, th.pot, { shadow: tone(th.pot, -0.15), depth: 6, light: L });
  c.fillStyle = tone(th.pot, -0.1); c.fillRect(16, 94, 48, 8);
}

// ---------------------------------------------------------------- window with Muscat skyline
function windowMuscat(c, o, t) {
  const th = setTheme(o.theme);
  const W = 160, H = 210;
  const frame = th.dark ? '#3A3630' : '#FFFDF7', frameS = th.dark ? '#2C2925' : '#E9DFCB';
  const arch = (x, y, w, h) => P((p) => { p.moveTo(x, y + h); p.lineTo(x, y + w * 0.5); p.quadraticCurveTo(x, y, x + w / 2, y - w * 0.08); p.quadraticCurveTo(x + w, y, x + w, y + w * 0.5); p.lineTo(x + w, y + h); p.closePath(); });
  c.fillStyle = frameS; c.fill(arch(0, 14, W, H - 14));
  c.fillStyle = frame; c.fill(arch(4, 18, W - 8, H - 22));
  const glass = arch(14, 28, W - 28, H - 46);
  c.save();
  c.clip(glass);
  // warm Muscat sky
  const sky = lin(c, 0, 20, 0, 150, [[0, th.sky], [1, th.skyLow]]);
  c.fillStyle = sky; c.fillRect(0, 0, W, H);
  // low sun
  const g = c.createRadialGradient(108, 118, 0, 108, 118, 60); g.addColorStop(0, rgba(COLORS.sand, th.dark ? 0.35 : 0.6)); g.addColorStop(1, rgba(COLORS.sand, 0)); c.fillStyle = g; c.fillRect(0, 0, W, H);
  // Hajar mountains (two layers)
  c.fillStyle = th.mountain2;
  c.beginPath(); c.moveTo(0, 130); c.lineTo(18, 108); c.lineTo(34, 118); c.lineTo(56, 92); c.lineTo(74, 110); c.lineTo(96, 96); c.lineTo(120, 116); c.lineTo(142, 100); c.lineTo(W, 112); c.lineTo(W, 150); c.lineTo(0, 150); c.closePath(); c.fill();
  c.fillStyle = th.mountain;
  c.beginPath(); c.moveTo(0, 142); c.lineTo(26, 124); c.lineTo(44, 134); c.lineTo(70, 116); c.lineTo(90, 132); c.lineTo(116, 122); c.lineTo(W, 138); c.lineTo(W, 160); c.lineTo(0, 160); c.closePath(); c.fill();
  // dome + minaret silhouette (generic)
  const sil = th.dark ? '#22221F' : '#B8AA92';
  c.fillStyle = sil;
  c.beginPath(); c.moveTo(48, 150); c.lineTo(48, 140); c.quadraticCurveTo(48, 122, 62, 120); c.quadraticCurveTo(76, 122, 76, 140); c.lineTo(76, 150); c.closePath(); c.fill();
  c.fillRect(61, 112, 2, 9);
  c.fillRect(34, 138, 56, 14);
  c.fillRect(90, 96, 6, 56); c.beginPath(); c.moveTo(89, 98); c.lineTo(93, 88); c.lineTo(97, 98); c.closePath(); c.fill(); c.fillRect(88, 108, 10, 3);
  // sea
  c.fillStyle = th.sea; c.fillRect(0, 150, W, 60);
  c.strokeStyle = rgba('#FFFFFF', th.dark ? 0.08 : 0.35); c.lineWidth = 1.4;
  for (let i = 0; i < 5; i++) { const y = 158 + i * 7; const s = Math.sin(t * 0.8 + i) * 6; c.beginPath(); c.moveTo(24 + s + i * 9, y); c.lineTo(52 + s + i * 9, y); c.stroke(); }
  c.restore();
  // mullions
  c.fillStyle = frame; c.fillRect(W / 2 - 2.5, 20, 5, H - 40); c.fillRect(14, 120, W - 28, 5);
  c.fillStyle = frameS; c.fillRect(-4, H - 18, W + 8, 10);
  c.fillStyle = tone(frameS, -0.08); c.fillRect(-4, H - 9, W + 8, 4);
}

// ---------------------------------------------------------------- car
function car(c, o, t) {
  const th = setTheme(o.theme);
  const body = o.color ? brand(o.color) : th.dark ? COLORS.slate : COLORS.stone;
  const W = 210, H = 86;
  const shell = P((p) => { p.moveTo(8, 66); p.lineTo(6, 50); p.quadraticCurveTo(8, 40, 26, 38); p.lineTo(58, 34); p.lineTo(84, 12); p.lineTo(150, 12); p.lineTo(176, 34); p.quadraticCurveTo(200, 38, 204, 50); p.lineTo(204, 64); p.quadraticCurveTo(204, 70, 196, 70); p.lineTo(14, 70); p.quadraticCurveTo(8, 70, 8, 66); p.closePath(); });
  shade(c, shell, body, { shadow: tone(body, -0.18), depth: 6, hi: tone(body, 0.2), hiDepth: 2, light: L });
  c.fillStyle = th.dark ? '#24272A' : '#3D3E3A';
  c.beginPath(); c.moveTo(66, 36); c.lineTo(88, 18); c.lineTo(114, 18); c.lineTo(114, 36); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(120, 36); c.lineTo(120, 18); c.lineTo(146, 18); c.lineTo(166, 36); c.closePath(); c.fill();
  c.strokeStyle = tone(body, -0.22); c.lineWidth = 1.6; c.beginPath(); c.moveTo(117, 38); c.lineTo(117, 66); c.stroke();
  c.beginPath(); c.moveTo(12, 52); c.lineTo(200, 52); c.stroke();
  c.fillStyle = COLORS.sand; c.fillRect(194, 44, 10, 5);
  c.fillStyle = rgba(COLORS.lossLight, 0.6); c.fillRect(6, 44, 6, 5);
  for (const x of [52, 160]) {
    c.fillStyle = '#1C1C1B'; c.beginPath(); c.arc(x, 70, 16, 0, TAU); c.fill();
    c.fillStyle = th.dark ? '#5A5A55' : '#C9C3B6'; c.beginPath(); c.arc(x, 70, 7.5, 0, TAU); c.fill();
  }
}

// ---------------------------------------------------------------- jewelry box
function jewelryBox(c, o, t) {
  const wood = o.color ? brand(o.color) : COLORS.bronzeDeep, woodS = tone(wood, -0.2), woodL = tone(wood, 0.14);
  const velvet = COLORS.espresso;
  // open lid (tilted back)
  const lid = P((p) => { p.moveTo(10, 46); p.lineTo(18, 8); p.lineTo(102, 8); p.lineTo(110, 46); p.closePath(); });
  shade(c, lid, woodS, { shadow: tone(woodS, -0.15), depth: 4, light: L });
  const lidIn = P((p) => { p.moveTo(18, 44); p.lineTo(24, 14); p.lineTo(96, 14); p.lineTo(102, 44); p.closePath(); });
  c.fillStyle = tone(velvet, 0.1); c.fill(lidIn);
  // box
  const box = P((p) => facetRect(p, 6, 46, 108, 44, 6, 0));
  shade(c, box, wood, { shadow: woodS, depth: 5, hi: woodL, hiDepth: 2, light: L });
  c.fillStyle = velvet; c.fillRect(14, 46, 92, 12);
  // gold pieces resting on velvet
  c.strokeStyle = COLORS.gold; c.lineWidth = 3; c.beginPath(); c.ellipse(40, 46, 14, 6, 0, Math.PI, TAU); c.stroke();
  c.strokeStyle = COLORS.sand; c.lineWidth = 2.4; c.beginPath(); c.ellipse(76, 47, 11, 5, 0, Math.PI, TAU); c.stroke();
  gem(c, 76, 40, 4, COLORS.gold);
  c.fillStyle = COLORS.gold; c.fillRect(56, 64, 8, 8); c.fillStyle = COLORS.bullion; c.fillRect(6, 64, 108, 2);
  const tw = 0.5 + 0.5 * Math.sin(t * 3.1);
  sparkle(c, 30, 36, 4 + 3 * tw, rgba('#FFFFFF', 0.5 + 0.5 * tw));
  sparkle(c, 88, 34, 3 + 2 * (1 - tw), rgba(COLORS.spark, 0.9));
}

// ---------------------------------------------------------------- question cloud (speech bubble with a 45° tail)
function questionCloud(c, o, t) {
  const th = setTheme(o.theme);
  const fill = o.color ? brand(o.color) : th.dark ? COLORS.graphite : COLORS.white;
  const ink = th.dark ? COLORS.spark : COLORS.bronze;
  const b = P((p) => { facetRect(p, 6, 4, 104, 72, 18, 0); });
  c.fillStyle = rgba('#000000', th.dark ? 0.3 : 0.08); c.save(); c.translate(0, 3); c.fill(b); c.restore();
  c.fillStyle = fill; c.fill(b);
  c.beginPath(); c.moveTo(26, 72); c.lineTo(26, 92); c.lineTo(46, 72); c.closePath(); c.fill();
  // the question mark as shapes
  const bob = Math.sin(t * 2) * 1.5;
  c.strokeStyle = ink; c.lineWidth = 8; c.lineCap = 'round';
  c.beginPath(); c.arc(58, 30 + bob, 12, Math.PI * 1.05, Math.PI * 2.3); c.quadraticCurveTo(58, 44 + bob, 58, 50 + bob); c.stroke();
  c.fillStyle = ink; c.beginPath(); c.arc(58, 62 + bob, 4.6, 0, TAU); c.fill();
}

// ---------------------------------------------------------------- badges (gem-styled, 45°)
function badge(c, o, t, kind) {
  const cx = 50, cy = 50, r = 46;
  const ok = kind === 'check';
  const th = setTheme(o.theme);
  const cols = o.color ? [tone(brand(o.color), 0.25), brand(o.color), tone(brand(o.color), -0.15), tone(brand(o.color), -0.05)]
    : ok ? [COLORS.spark, COLORS.gold, COLORS.amber, COLORS.bullion]
      : th.dark ? ['#F68A86', COLORS.lossDark, '#C94A47', '#DE5753'] : ['#D9534D', COLORS.lossLight, '#9E2B25', '#B23029'];
  const pulse = 1 + Math.sin(t * 2.4) * 0.015;
  c.save(); c.translate(cx, cy); c.scale(pulse, pulse); c.translate(-cx, -cy);
  // four facets of the gem
  const tri = (a, b, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(cx, cy); c.lineTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.closePath(); c.fill(); };
  const T = [cx, cy - r], R = [cx + r, cy], B = [cx, cy + r], Lp = [cx - r, cy];
  // rounded diamond base
  c.fillStyle = cols[1];
  c.beginPath(); c.moveTo(cx, cy - r); c.lineTo(cx + r, cy); c.lineTo(cx, cy + r); c.lineTo(cx - r, cy); c.closePath(); c.fill();
  tri(Lp, T, cols[0]); tri(T, R, cols[1]); tri(R, B, cols[2]); tri(B, Lp, cols[3]);
  // mark
  c.strokeStyle = ok ? COLORS.ink : COLORS.white; c.lineWidth = 8; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath();
  if (ok) { c.moveTo(cx - 16, cy + 1); c.lineTo(cx - 5, cy + 12); c.lineTo(cx + 17, cy - 11); }
  else { c.moveTo(cx - 12, cy - 12); c.lineTo(cx + 12, cy + 12); c.moveTo(cx + 12, cy - 12); c.lineTo(cx - 12, cy + 12); }
  c.stroke();
  c.restore();
  if (ok) { const tw = 0.5 + 0.5 * Math.sin(t * 3.3); sparkle(c, cx - 30, cy - 30, 5 + 4 * tw, rgba('#FFFFFF', 0.4 + 0.6 * tw)); }
}

// ---------------------------------------------------------------- sweat drop
function sweatDrop(c, o, t) {
  const bob = Math.sin(t * 3) * 2;
  const p = P((q) => { q.moveTo(30, 6 + bob); q.bezierCurveTo(40, 26 + bob, 54, 40 + bob, 54, 54 + bob); q.arc(30, 54 + bob, 24, 0, Math.PI); q.bezierCurveTo(6, 40 + bob, 20, 26 + bob, 30, 6 + bob); q.closePath(); });
  shade(c, p, '#E8F0F2', { shadow: '#A9C6D1', depth: 6, light: L });
  c.fillStyle = rgba('#FFFFFF', 0.9); c.beginPath(); c.ellipse(22, 54 + bob, 4, 7, 0.3, 0, TAU); c.fill();
}

// ---------------------------------------------------------------- sparkle burst
export function sparkle(c, x, y, r, col) {
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r); c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r);
  c.fill();
}
function sparkleBurst(c, o, t) {
  const pts = [[60, 60, 30, 0], [24, 30, 13, 1.3], [98, 28, 15, 2.1], [100, 92, 11, 0.7], [22, 94, 9, 2.8], [62, 12, 7, 3.5], [112, 60, 7, 4.2], [8, 62, 6, 1.9]];
  for (const [x, y, r, ph] of pts) {
    const tw = 0.5 + 0.5 * Math.sin(t * 4 + ph * 2);
    const rr = r * (0.65 + 0.35 * tw);
    sparkle(c, x, y, rr, r > 20 ? COLORS.spark : r > 10 ? COLORS.gold : COLORS.sand);
    if (r > 20) sparkle(c, x, y, rr * 0.45, rgba('#FFFFFF', 0.85));
  }
  gem(c, 84, 76, 4, COLORS.gold); gem(c, 38, 52, 3, COLORS.sand);
}

// ---------------------------------------------------------------- heart (faceted)
function heart(c, o, t) {
  const base = o.color ? brand(o.color) : COLORS.gold;
  const beat = 1 + Math.max(0, Math.sin(t * 5)) ** 8 * 0.06;
  c.save(); c.translate(50, 46); c.scale(beat, beat); c.translate(-50, -46);
  const p = P((q) => { q.moveTo(50, 86); q.bezierCurveTo(20, 66, 4, 48, 4, 30); q.bezierCurveTo(4, 14, 16, 4, 30, 4); q.bezierCurveTo(40, 4, 47, 10, 50, 18); q.bezierCurveTo(53, 10, 60, 4, 70, 4); q.bezierCurveTo(84, 4, 96, 14, 96, 30); q.bezierCurveTo(96, 48, 80, 66, 50, 86); q.closePath(); });
  shade(c, p, base, { shadow: tone(base, -0.18), depth: 8, hi: tone(base, 0.3), hiDepth: 4, light: L });
  c.save(); c.clip(p); c.fillStyle = rgba('#FFFFFF', 0.18); c.beginPath(); c.moveTo(50, 18); c.lineTo(50, 86); c.lineTo(0, 36); c.lineTo(10, 10); c.closePath(); c.fill(); c.restore();
  c.restore();
}

// ---------------------------------------------------------------- lock
function lock(c, o, t) {
  const th = setTheme(o.theme);
  const base = o.color ? brand(o.color) : COLORS.gold;
  c.strokeStyle = th.dark ? COLORS.stone : COLORS.stoneDark; c.lineWidth = 9; c.lineCap = 'butt';
  c.beginPath(); c.moveTo(22, 50); c.lineTo(22, 30); c.arc(42, 30, 20, Math.PI, 0); c.lineTo(62, 50); c.stroke();
  const body = P((p) => facetRect(p, 4, 44, 76, 56, 10, 12));
  c.fillStyle = lin(c, 4, 44, 80, 100, [[0, COLORS.spark], [0.55, base], [1, COLORS.amber]]);
  c.fill(body);
  c.fillStyle = COLORS.bronzeDeep; c.beginPath(); c.arc(42, 66, 7, 0, TAU); c.fill(); c.fillRect(39, 68, 6, 16);
  c.strokeStyle = rgba('#FFFFFF', 0.45); c.lineWidth = 2.5; c.beginPath(); c.moveTo(10, 94); c.lineTo(10, 54); c.stroke();
}

// ---------------------------------------------------------------- queue (people waiting) — drawn with the character system
let drawCharacterRef = null;
export function _setCharacterDrawer(fn) { drawCharacterRef = fn; }
function queue(c, o, t) {
  if (!drawCharacterRef) return;
  const facing = o.flip ? 'left' : 'right';
  const people = [
    { gender: 'man', skin: 'tan', pose: 'stand', mood: 'neutral', headwear: 'kumma', seed: 4 },
    { gender: 'woman', skin: 'light', pose: 'phone', mood: 'neutral', headwear: 'hijab', seed: 5 },
    { gender: 'man', skin: 'deep', age: 'senior', pose: 'stand', mood: 'worried', headwear: 'massar', seed: 6 },
    { gender: 'man', skin: 'medium', age: 'young', outfit: 'casual', pose: 'phone', mood: 'neutral', seed: 8 },
  ];
  const n = Math.min(people.length, o.count || 4);
  const H = 150;
  for (let i = n - 1; i >= 0; i--) {
    const x = 240 - 38 - i * 50;
    c.save();
    drawCharacterRef(c, { ...people[i], facing }, { x: x - 30, y: H - 140 + (i % 2) * 2, w: 60, h: 140 - i * 1.5 }, t + i * 0.7);
    c.restore();
  }
}

// ---------------------------------------------------------------- registry
export const PROPS = {
  phone: { w: 50, h: 100, draw: phone, label: 'Modern dark phone with an illustrative Goldcom-style UI (gold accents, no prices)' },
  goldbar: { w: 66, h: 102, draw: goldbar, label: 'Stamped 999.9 gold bar with 45° facet corner and gleam (opts.label sets the small line)' },
  coin: { w: 86, h: 86, draw: coin, label: 'Gold coin with a faceted gem relief' },
  giftbox: { w: 112, h: 104, draw: giftbox, label: 'Gift box with ribbon and bow (opts.color box token, opts.ribbon)' },
  'shopping-bag': { w: 98, h: 126, draw: bag, ground: true, label: 'Paper shopping bag with rope handles (opts.color)' },
  bag: { w: 98, h: 126, draw: bag, ground: true, label: 'Alias of shopping-bag' },
  coffee: { w: 48, h: 86, draw: coffee, label: 'Takeaway coffee cup' },
  receipts: { w: 110, h: 110, draw: receipts, label: 'Messy pile of paper receipts (opts.seed)' },
  safe: { w: 100, h: 112, draw: safe, ground: true, label: 'Vault safe with gold dial and handle' },
  house: { w: 128, h: 108, draw: house, ground: true, label: 'Flat-roof Omani house with arched windows' },
  shopfront: { w: 200, h: 170, draw: shopfront, ground: true, label: 'Traditional souq gold shop: carved arch, lanterns, gold on shelves (no names)' },
  calendar: { w: 96, h: 96, draw: calendar, label: 'Calendar card, one day marked with a gem (no numbers)' },
  clock: { w: 100, h: 100, draw: clock, label: 'Wall clock; hands move with t (opts.speed)' },
  wallet: { w: 110, h: 86, draw: wallet, label: 'Leather wallet with a card peeking out' },
  'chart-card': { w: 160, h: 112, draw: chartCard, label: 'UI card with a gold line chart, no numbers' },
  sofa: { w: 230, h: 112, draw: sofa, ground: true, label: 'Modern sofa with chamfered arms' },
  plant: { w: 80, h: 140, draw: plant, ground: true, label: 'Potted plant in muted tones' },
  'window-muscat': { w: 160, h: 210, draw: windowMuscat, label: 'Arched window: Muscat mountains, dome + minaret, sea' },
  car: { w: 210, h: 88, draw: car, ground: true, label: 'Simple modern car, side view (opts.color)' },
  'jewelry-box': { w: 120, h: 92, draw: jewelryBox, ground: true, label: 'Open jewellery box with gold pieces' },
  'question-cloud': { w: 116, h: 94, draw: questionCloud, label: 'Speech bubble with a question mark' },
  'check-badge': { w: 100, h: 100, draw: (c, o, t) => badge(c, o, t, 'check'), label: 'Gold gem badge with a check' },
  'cross-badge': { w: 100, h: 100, draw: (c, o, t) => badge(c, o, t, 'cross'), label: 'Loss-colour gem badge with a cross' },
  'sweat-drop': { w: 60, h: 80, draw: sweatDrop, label: 'Sweat drop (worry accent)' },
  'sparkle-burst': { w: 120, h: 120, draw: sparkleBurst, label: 'Twinkling gold glints' },
  queue: { w: 240, h: 150, draw: queue, ground: true, label: 'Four small people waiting in line (opts.flip to face left, opts.count)' },
  heart: { w: 100, h: 90, draw: heart, label: 'Faceted gold heart with a soft beat' },
  lock: { w: 84, h: 102, draw: lock, label: 'Gold padlock (security)' },
};

export const PROP_ASPECT = Object.fromEntries(Object.entries(PROPS).map(([k, v]) => [k, v.w / v.h]));

/** Draw a prop into an explicit rect (used by held props). */
export function drawPropShape(c, name, x, y, w, h, opts = {}, t = 0) {
  const def = PROPS[name];
  if (!def) return;
  c.save();
  c.translate(x, y);
  c.scale(w / def.w, h / def.h);
  def.draw(c, opts, t);
  c.restore();
}

/** Public: draw a prop fitted inside box (keeps aspect; ground props sit on the box bottom with a soft shadow). */
export function drawProp(c, name, box, opts = {}, t = 0) {
  const def = PROPS[name];
  if (!def || !box) return;
  const f = fitBox(box, def.w / def.h, def.ground ? 'bottom' : 'center');
  c.save();
  if (def.ground && opts.shadow !== false) {
    const th = setTheme(opts.theme);
    groundShadow(c, f.x + f.w / 2, f.y + f.h, f.w * 0.55, f.h * 0.06 + 2, th.dark ? 0.4 : 0.18, th.shadow);
  }
  if (opts.flip && name !== 'queue') { c.translate(f.x + f.w, f.y); c.scale(-1, 1); c.translate(-f.x, -f.y); }
  drawPropShape(c, name, f.x, f.y, f.w, f.h, opts, t);
  c.restore();
}
