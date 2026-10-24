// Background sets that sit behind characters. Each scene fills its box ("cover") and returns
// layout hints: { floorY, slots: [{x, w}], theme } so callers can stand people on the floor.
import { COLORS } from '../../../shared/brand.js';
import { TAU, clamp, mix, tone, rgba, rng, groundShadow, wave } from './util.js';
import { setTheme } from './palette.js';
import { drawProp } from './props.js';

function lin(c, x0, y0, x1, y1, stops) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}

const DEFAULT_THEME = { room: 'cream', souq: 'cream', office: 'cream', 'night-room': 'onyx', studio: 'cream', 'outdoor-muscat': 'cream' };

// soft pool of light (window light / lamp) — kept subtle and warm
function lightPool(c, x, y, r, col, a) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, a));
  g.addColorStop(1, rgba(col, 0));
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}

function wallAndFloor(c, b, th, floorY, { wall = th.wall, wall2 = th.wall2, floor = th.floor } = {}) {
  c.fillStyle = lin(c, 0, b.y, 0, floorY, [[0, wall2], [1, wall]]);
  c.fillRect(b.x, b.y, b.w, floorY - b.y);
  c.fillStyle = lin(c, 0, floorY, 0, b.y + b.h, [[0, th.floorHi], [1, floor]]);
  c.fillRect(b.x, floorY, b.w, b.y + b.h - floorY);
  // skirting
  c.fillStyle = th.trim;
  c.fillRect(b.x, floorY - b.h * 0.012, b.w, b.h * 0.012);
  c.fillStyle = rgba(th.shadow, th.dark ? 0.25 : 0.06);
  c.fillRect(b.x, floorY, b.w, b.h * 0.01);
}

// ------------------------------------------------------------ scenes
function room(c, b, th, o, t) {
  const floorY = b.y + b.h * 0.78;
  wallAndFloor(c, b, th, floorY);
  const u = Math.min(b.h / 1000, b.w / 760);
  // window with the Muscat view, light falling into the room
  const ww = 290 * u, wh = ww * 210 / 160;
  const wxF = o.windowX ?? 0.62;
  const wx = b.x + b.w * wxF - ww / 2, wy = floorY - wh - 170 * u;
  drawProp(c, 'window-muscat', { x: wx, y: wy, w: ww, h: wh }, { theme: o.theme }, t);
  c.save();
  c.globalAlpha *= th.dark ? 0.5 : 1;
  c.fillStyle = rgba(th.dark ? COLORS.gold : COLORS.sand, th.dark ? 0.06 : 0.16);
  c.beginPath(); c.moveTo(wx + ww * 0.1, floorY); c.lineTo(wx + ww * 0.9, floorY); c.lineTo(wx + ww * 0.5 + 260 * u, b.y + b.h); c.lineTo(wx - 120 * u, b.y + b.h); c.closePath(); c.fill();
  c.restore();
  // shelf with a small vase (45° chamfered), framed art
  const ax = b.x + b.w * (wxF < 0.5 ? 0.86 : 0.14) - 75 * u, ay = floorY - 560 * u;
  c.fillStyle = th.trim; c.fillRect(ax, ay, 150 * u, 190 * u);
  c.fillStyle = th.dark ? th.wall2 : '#FFFDF7'; c.fillRect(ax + 12 * u, ay + 12 * u, 126 * u, 166 * u);
  c.fillStyle = th.accentSoft; c.beginPath(); c.moveTo(ax + 30 * u, ay + 150 * u); c.lineTo(ax + 75 * u, ay + 60 * u); c.lineTo(ax + 120 * u, ay + 150 * u); c.closePath(); c.fill();
  c.fillStyle = th.accent; c.beginPath(); c.moveTo(ax + 75 * u, ay + 60 * u); c.lineTo(ax + 120 * u, ay + 150 * u); c.lineTo(ax + 75 * u, ay + 150 * u); c.closePath(); c.globalAlpha *= 0.6; c.fill(); c.globalAlpha /= 0.6;
  // plant in the corner
  if (o.plant !== false) drawProp(c, 'plant', { x: b.x + b.w * (wxF < 0.5 ? 0.1 : 0.88) - 80 * u, y: floorY - 300 * u, w: 160 * u, h: 300 * u }, { theme: o.theme }, t);
  if (o.sofa) drawProp(c, 'sofa', { x: b.x + b.w * 0.1, y: floorY - 150 * u, w: 360 * u, h: 175 * u }, { theme: o.theme }, t);
  lightPool(c, wx + ww / 2, wy + wh * 0.6, ww * 1.6, th.dark ? COLORS.gold : COLORS.sand, th.dark ? 0.05 : 0.12);
  return { floorY, slots: [{ x: b.x + b.w * 0.3, w: b.w * 0.34 }, { x: b.x + b.w * 0.66, w: b.w * 0.3 }] };
}

function nightRoom(c, b, th, o, t) {
  const r = room(c, b, th, { ...o, plant: o.plant }, t);
  // dim vignette + a warm lamp pool, the mood of a late, worried evening
  const g = c.createRadialGradient(b.x + b.w * 0.5, b.y + b.h * 0.55, b.h * 0.1, b.x + b.w * 0.5, b.y + b.h * 0.55, b.h * 0.85);
  g.addColorStop(0, rgba('#000000', 0));
  g.addColorStop(1, rgba('#000000', th.dark ? 0.55 : 0.25));
  c.fillStyle = g; c.fillRect(b.x, b.y, b.w, b.h);
  const u = Math.min(b.h / 1000, b.w / 760);
  const lx = b.x + b.w * ((o.windowX ?? 0.62) < 0.5 ? 0.66 : 0.33), ly = r.floorY;
  c.fillStyle = th.dark ? '#2E2B26' : '#8A7A62'; c.fillRect(lx - 3 * u, ly - 330 * u, 6 * u, 330 * u); c.fillRect(lx - 34 * u, ly - 8 * u, 68 * u, 8 * u);
  c.fillStyle = th.dark ? '#5C4E38' : COLORS.sand; c.beginPath(); c.moveTo(lx - 50 * u, ly - 330 * u); c.lineTo(lx - 30 * u, ly - 400 * u); c.lineTo(lx + 30 * u, ly - 400 * u); c.lineTo(lx + 50 * u, ly - 330 * u); c.closePath(); c.fill();
  const flick = 0.92 + 0.08 * Math.sin(t * 7.3) * Math.sin(t * 3.1);
  lightPool(c, lx, ly - 340 * u, 360 * u, COLORS.sand, 0.22 * flick);
  return r;
}

function souq(c, b, th, o, t) {
  const floorY = b.y + b.h * 0.8;
  const u = Math.min(b.h / 1000, b.w / 760);
  // sky strip at the top of the lane, stone walls, arcade arches
  c.fillStyle = lin(c, 0, b.y, 0, floorY, [[0, th.skyLow], [1, th.stoneWall]]);
  c.fillRect(b.x, b.y, b.w, floorY - b.y);
  const archW = 300 * u, archH = 560 * u, top = floorY - archH;
  const n = Math.ceil(b.w / archW) + 1;
  const ox = b.x - ((b.w * 0.5) % archW) * 0;
  // back wall of the arcade
  c.fillStyle = th.stoneWall; c.fillRect(b.x, b.y + b.h * 0.08, b.w, floorY - b.y - b.h * 0.08);
  c.fillStyle = tone(th.stoneWall, th.dark ? 0.04 : -0.04);
  for (let y = b.y + b.h * 0.1; y < floorY; y += 34 * u) c.fillRect(b.x, y, b.w, 2 * u);
  // arcade piers and arches (pointed arches, 45° spirit)
  for (let i = 0; i < n; i++) {
    const x = ox + i * archW;
    c.fillStyle = th.arch;
    c.beginPath();
    c.moveTo(x + 30 * u, floorY); c.lineTo(x + 30 * u, top + 140 * u);
    c.quadraticCurveTo(x + 30 * u, top + 10 * u, x + archW / 2, top - 30 * u);
    c.quadraticCurveTo(x + archW - 30 * u, top + 10 * u, x + archW - 30 * u, top + 140 * u);
    c.lineTo(x + archW - 30 * u, floorY); c.closePath();
    c.fillStyle = th.dark ? '#1C1B18' : tone(th.stoneWall, -0.1);
    c.fill();
  }
  // piers in front
  for (let i = 0; i <= n; i++) {
    const x = ox + i * archW;
    c.fillStyle = tone(th.stoneWall, th.dark ? 0.06 : 0.04);
    c.fillRect(x - 30 * u, b.y + b.h * 0.08, 60 * u, floorY - b.y - b.h * 0.08);
    c.fillStyle = tone(th.stoneWall, th.dark ? -0.08 : -0.08);
    c.fillRect(x + 18 * u, b.y + b.h * 0.08, 12 * u, floorY - b.y - b.h * 0.08);
  }
  // wooden beam along the top with 45° carving
  c.fillStyle = th.wood; c.fillRect(b.x, b.y + b.h * 0.06, b.w, 40 * u);
  c.fillStyle = th.accentSoft;
  for (let x = b.x + 14 * u; x < b.x + b.w; x += 28 * u) { c.beginPath(); c.moveTo(x, b.y + b.h * 0.06 + 20 * u); c.lineTo(x + 8 * u, b.y + b.h * 0.06 + 12 * u); c.lineTo(x + 16 * u, b.y + b.h * 0.06 + 20 * u); c.lineTo(x + 8 * u, b.y + b.h * 0.06 + 28 * u); c.closePath(); c.fill(); }
  // floor: worn stone tiles
  c.fillStyle = lin(c, 0, floorY, 0, b.y + b.h, [[0, th.floorHi], [1, th.floor]]);
  c.fillRect(b.x, floorY, b.w, b.y + b.h - floorY);
  c.strokeStyle = rgba(th.shadow, th.dark ? 0.35 : 0.08); c.lineWidth = 2 * u;
  for (let i = 0; i < 4; i++) { const y = floorY + (b.y + b.h - floorY) * (i / 4) ** 1.4; c.beginPath(); c.moveTo(b.x, y); c.lineTo(b.x + b.w, y); c.stroke(); }
  // the gold shop
  const sw = Math.min(b.w * 0.6, 640 * u), sh = sw * 170 / 200;
  const sx = o.shopX != null ? b.x + b.w * o.shopX - sw / 2 : b.x + b.w * 0.5 - sw / 2;
  drawProp(c, 'shopfront', { x: sx, y: floorY - sh, w: sw, h: sh }, { theme: o.theme, shadow: false }, t);
  // hanging lamps across the lane
  for (let i = 0; i < 3; i++) {
    const lx = b.x + b.w * (0.18 + i * 0.32), ly = b.y + b.h * 0.1 + 40 * u;
    const sway = Math.sin(t * 1.2 + i) * 3 * u;
    c.strokeStyle = th.wood2; c.lineWidth = 2 * u; c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + sway, ly + 70 * u); c.stroke();
    c.fillStyle = COLORS.bronze; c.beginPath(); c.moveTo(lx + sway - 16 * u, ly + 84 * u); c.lineTo(lx + sway, ly + 66 * u); c.lineTo(lx + sway + 16 * u, ly + 84 * u); c.lineTo(lx + sway + 12 * u, ly + 116 * u); c.lineTo(lx + sway - 12 * u, ly + 116 * u); c.closePath(); c.fill();
    c.fillStyle = rgba(COLORS.spark, 0.9); c.fillRect(lx + sway - 7 * u, ly + 86 * u, 14 * u, 24 * u);
    lightPool(c, lx + sway, ly + 100 * u, 200 * u, COLORS.sand, th.dark ? 0.12 : 0.18);
  }
  if (th.dark) { c.fillStyle = rgba('#000000', 0.18); c.fillRect(b.x, b.y, b.w, b.h); }
  return { floorY, slots: [{ x: b.x + b.w * 0.2, w: b.w * 0.3 }, { x: b.x + b.w * 0.8, w: b.w * 0.3 }] };
}

function office(c, b, th, o, t) {
  const floorY = b.y + b.h * 0.78;
  wallAndFloor(c, b, th, floorY);
  const u = Math.min(b.h / 1000, b.w / 760);
  // large window band with Muscat skyline (simplified, wide)
  const wx = b.x + b.w * 0.08, wy = b.y + b.h * 0.14, ww = b.w * 0.84, wh = b.h * 0.42;
  c.fillStyle = th.trim; c.fillRect(wx - 10 * u, wy - 10 * u, ww + 20 * u, wh + 20 * u);
  c.fillStyle = lin(c, 0, wy, 0, wy + wh, [[0, th.sky], [1, th.skyLow]]); c.fillRect(wx, wy, ww, wh);
  c.fillStyle = th.mountain2;
  c.beginPath(); c.moveTo(wx, wy + wh * 0.72);
  for (let i = 0; i <= 12; i++) c.lineTo(wx + (ww * i) / 12, wy + wh * (0.56 + 0.12 * Math.abs(Math.sin(i * 1.7))));
  c.lineTo(wx + ww, wy + wh); c.lineTo(wx, wy + wh); c.closePath(); c.fill();
  c.fillStyle = th.mountain;
  c.beginPath(); c.moveTo(wx, wy + wh * 0.86);
  for (let i = 0; i <= 8; i++) c.lineTo(wx + (ww * i) / 8, wy + wh * (0.76 + 0.08 * Math.abs(Math.sin(i * 2.3 + 1))));
  c.lineTo(wx + ww, wy + wh); c.lineTo(wx, wy + wh); c.closePath(); c.fill();
  c.fillStyle = th.trim; for (let i = 1; i < 4; i++) c.fillRect(wx + (ww * i) / 4 - 4 * u, wy, 8 * u, wh);
  // desk with a monitor showing a chart card, chamfered corner
  const dx = b.x + b.w * 0.56, dy = floorY - 300 * u, dw = b.w * 0.38;
  c.fillStyle = th.wood; c.fillRect(dx, dy, dw, 22 * u);
  c.fillStyle = th.wood2; c.fillRect(dx + 16 * u, dy + 22 * u, 14 * u, 280 * u); c.fillRect(dx + dw - 30 * u, dy + 22 * u, 14 * u, 280 * u);
  const mw = Math.min(dw * 0.7, 300 * u), mh = mw * 112 / 160;
  drawProp(c, 'chart-card', { x: dx + dw / 2 - mw / 2, y: dy - mh - 30 * u, w: mw, h: mh }, { theme: th.dark ? 'onyx' : 'cream' }, t);
  c.fillStyle = th.dark ? COLORS.slate : COLORS.stoneDark; c.fillRect(dx + dw / 2 - 6 * u, dy - 30 * u, 12 * u, 30 * u); c.fillRect(dx + dw / 2 - 50 * u, dy - 6 * u, 100 * u, 6 * u);
  drawProp(c, 'plant', { x: b.x + b.w * 0.04, y: floorY - 260 * u, w: 140 * u, h: 260 * u }, { theme: o.theme }, t);
  return { floorY, slots: [{ x: b.x + b.w * 0.32, w: b.w * 0.3 }] };
}

function studio(c, b, th, o, t) {
  // plain brand backdrop: a seamless sweep with soft top light and a floor shadow
  const floorY = b.y + b.h * 0.82;
  c.fillStyle = lin(c, 0, b.y, 0, b.y + b.h, [[0, th.wall2], [0.8, th.wall], [1, th.floor]]);
  c.fillRect(b.x, b.y, b.w, b.h);
  const g = c.createRadialGradient(b.x + b.w * 0.5, b.y, 0, b.x + b.w * 0.5, b.y, b.h * 0.9);
  g.addColorStop(0, rgba(th.dark ? COLORS.graphite : '#FFFFFF', th.dark ? 0.9 : 0.6));
  g.addColorStop(1, rgba(th.dark ? COLORS.graphite : '#FFFFFF', 0));
  c.fillStyle = g; c.fillRect(b.x, b.y, b.w, b.h);
  // quiet 45° facet lines (≤ 10% opacity)
  c.save();
  c.beginPath(); c.rect(b.x, b.y, b.w, floorY - b.y); c.clip();
  c.strokeStyle = rgba(th.dark ? COLORS.spark : COLORS.bullion, th.dark ? 0.05 : 0.08); c.lineWidth = Math.max(1, b.h * 0.0015);
  const step = b.h * 0.08;
  for (let x = b.x - b.h; x < b.x + b.w + b.h; x += step) { c.beginPath(); c.moveTo(x, b.y); c.lineTo(x + b.h, b.y + b.h); c.stroke(); }
  c.restore();
  groundShadow(c, b.x + b.w / 2, floorY, b.w * 0.42, b.h * 0.035, th.dark ? 0.5 : 0.12, th.shadow);
  return { floorY, slots: [{ x: b.x + b.w * 0.3, w: b.w * 0.36 }, { x: b.x + b.w * 0.7, w: b.w * 0.36 }] };
}

function outdoorMuscat(c, b, th, o, t) {
  const horizon = b.y + b.h * 0.6, floorY = b.y + b.h * 0.84;
  const u = Math.min(b.h / 1000, b.w / 760);
  c.fillStyle = lin(c, 0, b.y, 0, horizon, [[0, th.sky], [1, th.skyLow]]);
  c.fillRect(b.x, b.y, b.w, horizon - b.y + 2);
  // low sun
  const sx = b.x + b.w * 0.72, sy = horizon - b.h * 0.16;
  lightPool(c, sx, sy, b.h * 0.45, COLORS.sand, th.dark ? 0.2 : 0.45);
  c.fillStyle = rgba(th.dark ? COLORS.gold : '#FFFFFF', th.dark ? 0.35 : 0.7); c.beginPath(); c.arc(sx, sy, 46 * u, 0, TAU); c.fill();
  // mountains (Hajar) — two layers, angular
  c.fillStyle = th.mountain2;
  c.beginPath(); c.moveTo(b.x, horizon - 60 * u);
  const r = rng(3);
  for (let i = 0; i <= 14; i++) c.lineTo(b.x + (b.w * i) / 14, horizon - (120 + r() * 170) * u);
  c.lineTo(b.x + b.w, horizon); c.lineTo(b.x, horizon); c.closePath(); c.fill();
  c.fillStyle = th.mountain;
  c.beginPath(); c.moveTo(b.x, horizon - 30 * u);
  for (let i = 0; i <= 9; i++) c.lineTo(b.x + (b.w * i) / 9, horizon - (40 + r() * 110) * u);
  c.lineTo(b.x + b.w, horizon); c.lineTo(b.x, horizon); c.closePath(); c.fill();
  // sea
  c.fillStyle = th.sea; c.fillRect(b.x, horizon, b.w, floorY - horizon);
  c.strokeStyle = rgba('#FFFFFF', th.dark ? 0.07 : 0.3); c.lineWidth = 2 * u;
  for (let i = 0; i < 8; i++) { const y = horizon + (floorY - horizon) * ((i + 1) / 9); const s = Math.sin(t * 0.6 + i * 1.7) * 20 * u; c.beginPath(); c.moveTo(b.x + b.w * 0.1 + s + i * 37 * u, y); c.lineTo(b.x + b.w * 0.1 + s + i * 37 * u + 80 * u, y); c.stroke(); }
  // corniche: low white wall with a dome and minaret silhouette at the end
  const sil = th.dark ? '#22221F' : '#C9BBA2';
  const mx = b.x + b.w * 0.18;
  c.fillStyle = sil;
  c.beginPath(); c.moveTo(mx - 90 * u, horizon); c.lineTo(mx - 90 * u, horizon - 40 * u); c.quadraticCurveTo(mx - 90 * u, horizon - 120 * u, mx, horizon - 128 * u); c.quadraticCurveTo(mx + 90 * u, horizon - 120 * u, mx + 90 * u, horizon - 40 * u); c.lineTo(mx + 90 * u, horizon); c.closePath(); c.fill();
  c.fillRect(mx - 3 * u, horizon - 160 * u, 6 * u, 34 * u);
  c.fillRect(mx - 150 * u, horizon - 46 * u, 300 * u, 46 * u);
  const mn = mx + 150 * u;
  c.fillRect(mn - 10 * u, horizon - 260 * u, 20 * u, 260 * u);
  c.beginPath(); c.moveTo(mn - 12 * u, horizon - 258 * u); c.lineTo(mn, horizon - 300 * u); c.lineTo(mn + 12 * u, horizon - 258 * u); c.closePath(); c.fill();
  c.fillRect(mn - 18 * u, horizon - 200 * u, 36 * u, 8 * u);
  // promenade
  c.fillStyle = lin(c, 0, floorY, 0, b.y + b.h, [[0, th.floorHi], [1, th.floor]]);
  c.fillRect(b.x, floorY, b.w, b.y + b.h - floorY);
  c.fillStyle = th.trim; c.fillRect(b.x, floorY - 14 * u, b.w, 14 * u);
  c.fillStyle = rgba(th.shadow, th.dark ? 0.3 : 0.08);
  for (let x = b.x; x < b.x + b.w; x += 120 * u) c.fillRect(x, floorY + 6 * u, 2 * u, b.y + b.h - floorY);
  // a date palm
  const px = b.x + b.w * 0.9, py = floorY - 4 * u;
  c.strokeStyle = th.wood; c.lineWidth = 16 * u; c.lineCap = 'round';
  c.beginPath(); c.moveTo(px, py); c.quadraticCurveTo(px - 20 * u, py - 200 * u, px - 10 * u, py - 400 * u); c.stroke();
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i - 3.5) * 0.42 + Math.sin(t * 0.9 + i) * 0.03;
    c.strokeStyle = i % 2 ? th.plant : th.plant2; c.lineWidth = 12 * u;
    c.beginPath(); c.moveTo(px - 10 * u, py - 400 * u);
    c.quadraticCurveTo(px - 10 * u + Math.cos(a) * 110 * u, py - 400 * u + Math.sin(a) * 110 * u - 30 * u, px - 10 * u + Math.cos(a) * 190 * u, py - 400 * u + Math.sin(a) * 190 * u + 40 * u);
    c.stroke();
  }
  if (th.dark) { c.fillStyle = rgba('#000000', 0.15); c.fillRect(b.x, b.y, b.w, b.h); }
  return { floorY, slots: [{ x: b.x + b.w * 0.35, w: b.w * 0.3 }, { x: b.x + b.w * 0.65, w: b.w * 0.3 }] };
}

export const SCENES = {
  room: { draw: room, label: 'Calm living room: wall, floor line, Muscat window, plant, soft light (opts.sofa adds a sofa, opts.windowX 0..1 moves the window, opts.plant=false)' },
  souq: { draw: souq, label: 'Souq lane with stone arcade, hanging lamps and a traditional gold shop (opts.shopX 0..1)' },
  office: { draw: office, label: 'Bright office with a wide skyline window, desk and chart screen' },
  'night-room': { draw: nightRoom, label: 'The living room at night: dim vignette and a warm lamp (worried mood)' },
  studio: { draw: studio, label: 'Plain brand backdrop: seamless sweep, top light, faint 45° lines, floor shadow' },
  'outdoor-muscat': { draw: outdoorMuscat, label: 'Muscat corniche at golden hour: mountains, sea, dome and minaret, a date palm' },
};

/** Draw a background set filling box. Returns { floorY, slots, theme } for placing characters. */
export function drawScene(c, name, box, opts = {}, t = 0) {
  const def = SCENES[name] || SCENES.studio;
  const theme = opts.theme || DEFAULT_THEME[name] || 'cream';
  const th = setTheme(theme);
  c.save();
  c.beginPath(); c.rect(box.x, box.y, box.w, box.h); c.clip();
  const res = def.draw(c, box, th, { ...opts, theme }, t) || {};
  c.restore();
  return { ...res, theme };
}
