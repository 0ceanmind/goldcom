// Heads, faces and headwear (kumma, massar, hijab, sheila) in head-local units.
// Head origin = centre of the skull; crown at y ≈ -68, chin at y ≈ +64. +x = facing side.
import { shade, tube, clamp, lerp, rgba, mix, TAU } from './util.js';

// ---------- head silhouette ----------
export function headPath(turn, woman) {
  const p = new Path2D();
  const tw = turn;
  const cx = 5 * tw; // chin drifts towards the facing side in 3/4
  const R = 47 - 2 * tw; // facing-side cheek is slightly flatter in 3/4
  const Lw = 48 + 2 * tw; // back of the skull fuller
  const jaw = woman ? 0.9 : 1;
  p.moveTo(-2 * tw, -68);
  p.bezierCurveTo(26, -69, R, -50, R, -12);
  p.bezierCurveTo(R, 18 * jaw, 38 * jaw, 46, 15 + cx, 61);
  p.quadraticCurveTo(4 + cx, 67, -7 + cx, 61);
  p.bezierCurveTo(-36 * jaw, 46, -Lw, 18 * jaw, -Lw, -12);
  p.bezierCurveTo(-Lw, -52, -28, -69, -2 * tw, -68);
  p.closePath();
  return p;
}

function earPath(x, turn) {
  const p = new Path2D();
  const s = x < 0 ? -1 : 1;
  p.moveTo(x - s * 3, -5);
  p.bezierCurveTo(x + s * 7, -9, x + s * 9.5, 5, x + s * 6.5, 13);
  p.bezierCurveTo(x + s * 4.5, 21, x - s * 0.5, 23, x - s * 3, 19);
  p.closePath();
  return p;
}

// ---------- features ----------
// Editorial flat faces: small solid eyes under a fine upper lid, tapered brows, a minimal nose and a
// short tapered mouth line. Moods live in brows, lids and the mouth's curve and tilt; all subtle.
//   bi/bo   brow inner / outer lift        arch  brow arch      knit  inner brow ends drawn together
//   lidT    upper lid coverage (− = lifted) lidB  lower lid push (cheeks)   es  eye scale
//   mw/mc   mouth half-width / curve (+ smile)  mt  tilt (+ raises the facing-side corner)
//   mo      mouth opening                   ms   mouth shift towards the facing side
const MOODS = {
  neutral: { bi: 0, bo: 0, arch: 1.6, knit: 0, lidT: 0.06, lidB: 0, es: 1, mw: 7.4, mc: 1.9, mt: 0, mo: 0, ms: 0 },
  happy: { bi: 1.4, bo: 0.6, arch: 2.4, knit: 0, lidT: 0.04, lidB: 0.17, es: 1, mw: 9.2, mc: 4.4, mt: 0.2, mo: 0, ms: 0, dimple: 1 },
  worried: { bi: 5.4, bo: -1.8, arch: 0.4, knit: 1.6, lidT: 0.1, lidB: 0, es: 1.03, mw: 6.4, mc: -2.2, mt: -1, mo: 0, ms: -0.6, lowLip: 0.5 },
  surprised: { bi: 5, bo: 4.6, arch: 3.6, knit: 0, lidT: -0.14, lidB: 0, es: 1.13, mw: 4.8, mc: 0, mt: 0, mo: 3.8, ms: 0 },
  calm: { bi: -0.4, bo: -0.6, arch: 1.4, knit: 0, lidT: 0.38, lidB: 0.06, es: 1, mw: 7.4, mc: 2.8, mt: 0, mo: 0, ms: 0 },
  proud: { bi: 0.2, bo: 1.8, arch: 1.8, knit: 0, lidT: 0.2, lidB: 0.1, es: 1, mw: 8.4, mc: 3.2, mt: 1.5, mo: 0, ms: 0.4, dimple: 0.6 },
  thinking: { bi: 0.6, bo: 1.6, arch: 1.8, knit: 0, lidT: 0.14, lidB: 0, es: 1, mw: 5.8, mc: -0.4, mt: 1.8, mo: 0, ms: 3, asym: 1 },
};

function pathEye(ex, ey, rx, ry) { const p = new Path2D(); p.ellipse(ex, ey, rx, ry, 0, 0, TAU); return p; }

/**
 * Draw facial features. f = { mood, turn, blink (0..1), look: {x,y}, skin, ink, woman, senior, brow, L }
 */
export function drawFeatures(c, f) {
  const m = MOODS[f.mood] || MOODS.neutral;
  const turn = f.turn;
  const cx = 9 * turn;
  const spread = 18.5 - 2.6 * turn;
  const eyeY = 4;
  const ink = f.ink;
  const look = f.look || { x: 0, y: 0 };
  const lx = clamp(look.x, -1.2, 1.2), ly = clamp(look.y, -1.4, 1.4);
  const eyes = [
    { x: cx - spread, k: 1, side: -1 },
    { x: cx + spread, k: 1 - 0.24 * turn, side: 1 },
  ];
  const woman = f.woman;
  c.lineCap = 'round';
  c.lineJoin = 'round';

  // ---- brows: blunt inner end, tapering to a point outside ----
  c.fillStyle = f.brow || ink;
  for (const e of eyes) {
    const k = e.k;
    const up = m.asym ? (e.side > 0 ? 2.4 : -0.8) : 0; // thinking: the facing-side brow lifts
    const yb = eyeY - 12.6 - (m.es - 1) * 6 - up;
    const ix = e.x - e.side * (5.6 - m.knit) * k, ox = e.x + e.side * 9.4 * k;
    const iy = yb - m.bi, oy = yb + 0.5 - m.bo;
    const mx = lerp(ix, ox, 0.55), my = Math.min(iy, oy) - m.arch - (up > 0 ? 0.8 : 0);
    const t0 = woman ? 3.2 : 4.4; // inner thickness
    const p = new Path2D();
    p.moveTo(ix, iy - t0 * 0.5);
    p.quadraticCurveTo(mx, my - t0 * 0.55, ox, oy);
    p.quadraticCurveTo(mx, my + t0 * 0.5, ix, iy + t0 * 0.55);
    p.quadraticCurveTo(ix - e.side * 1.2, iy, ix, iy - t0 * 0.5);
    p.closePath();
    c.fill(p);
  }

  // ---- eyes: solid iris under a fine upper lid ----
  const blink = clamp(f.blink || 0);
  for (const e of eyes) {
    const k = e.k;
    const ex = e.x + lx * 1.6 * k, ey = eyeY + ly * 1.3;
    const rx = (woman ? 4.4 : 4.3) * k * m.es, ry = (woman ? 5.6 : 5.5) * m.es;
    const lidT = lerp(m.lidT, 1.04, blink); // 0 = lid at the top of the iris, 1 = closed
    const lidB = m.lidB * (1 - blink);
    const ix = e.x - e.side * 5.6 * k, ox = e.x + e.side * 6.4 * k; // corners (lid stays put; iris moves)
    if (lidT >= 0.97) {
      // closed: a soft downward arc
      c.strokeStyle = ink; c.lineWidth = woman ? 2.1 : 1.9;
      c.beginPath(); c.moveTo(ix, eyeY + 0.6); c.quadraticCurveTo(e.x, eyeY + 3.4, ox, eyeY + 0.2); c.stroke();
      if (woman) { c.lineWidth = 1.5; c.beginPath(); c.moveTo(ox, eyeY + 0.2); c.lineTo(ox + e.side * 2.4 * k, eyeY - 1.6); c.stroke(); }
      continue;
    }
    const top = eyeY - (woman ? 5.6 : 5.5) * m.es; // resting lid height
    const lidY = top + Math.max(0, lidT) * 2 * ry; // lid line at the iris centre
    const lift = Math.min(0, lidT) * 2 * ry; // surprised: lid raised off the iris
    const botY = eyeY + ry - lidB * 2 * ry;
    // iris clipped by the lids
    c.save();
    const clip = new Path2D();
    clip.moveTo(ix - e.side * 4, lidY + 2.4);
    clip.quadraticCurveTo(e.x, lidY - 2.2, ox + e.side * 4, lidY + 1.6);
    clip.lineTo(ox + e.side * 4, botY + 1.2);
    clip.quadraticCurveTo(e.x, botY - (lidB > 0 ? 3 : -1.5), ix - e.side * 4, botY + 1.2);
    clip.closePath();
    c.clip(clip);
    c.fillStyle = ink;
    c.fill(pathEye(ex, ey, rx, ry));
    // a tiny warm catch-light keeps the eye alive at close range
    c.fillStyle = rgba('#FFFFFF', 0.55);
    c.beginPath(); c.arc(ex - 1.2 * k, ey - ry * 0.42, 0.95, 0, TAU); c.fill();
    c.restore();
    // upper lid line: hugs the top of the iris and runs a little past the outer corner
    const ly0 = lidY + lift;
    c.strokeStyle = ink;
    c.lineWidth = woman ? 2.2 : 1.8;
    c.beginPath();
    c.moveTo(ix, ly0 + 2.4);
    c.quadraticCurveTo(e.x - e.side * 0.6, ly0 - 1.9 + Math.max(0, lidT) * 1.2, ox, ly0 + 1.2);
    if (woman) c.quadraticCurveTo(ox + e.side * 1.4 * k, ly0 + 1, ox + e.side * 2.6 * k, ly0 - 0.2); // a short soft wing
    else c.lineTo(ox + e.side * 1.2 * k, ly0 + 1.6);
    c.stroke();
    if (lidB > 0.05) { // cheeks pushing up: a faint lower lid
      c.strokeStyle = rgba(f.skin.deep, 0.5 * clamp(lidB * 3));
      c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(ix + e.side * 1 * k, botY + 1.6); c.quadraticCurveTo(e.x, botY - 0.8, ox - e.side * 0.6 * k, botY + 1.2); c.stroke();
    }
  }

  // ---- nose: a soft shadow plane and the underside, no outline ----
  const shSide = (f.L && f.L.x > 0) ? -1 : 1; // which side of the nose faces away from the light
  const nx = cx + 3.6 * turn;
  c.fillStyle = f.skin.shade;
  if (turn > 0.5) {
    // 3/4: the far side of the nose and its tip project towards the facing side
    const tx = nx + 7.4, ty = 24.6;
    const p = new Path2D();
    if (shSide > 0) {
      p.moveTo(nx + 3.6, 12.5);
      p.quadraticCurveTo(tx + 0.6, 18, tx + 0.4, ty - 0.6);
      p.quadraticCurveTo(tx - 0.6, ty + 3, tx - 5.6, ty + 2.6);
      p.quadraticCurveTo(tx - 2.4, ty + 0.8, tx - 2, ty - 2.6);
      p.quadraticCurveTo(tx - 2.2, 17.5, nx + 3.6, 12.5);
    } else {
      p.moveTo(tx - 1.6, ty - 3);
      p.quadraticCurveTo(tx + 0.8, ty + 1.6, tx - 3, ty + 2.8);
      p.quadraticCurveTo(tx - 8, ty + 3.6, tx - 10.4, ty + 0.8);
      p.quadraticCurveTo(tx - 6.6, ty + 1.2, tx - 1.6, ty - 3);
    }
    c.fill(p);
    c.fillStyle = rgba(f.skin.deep, 0.75);
    c.beginPath(); c.ellipse(tx - 4.4, ty + 1.3, 1.9, 1, -0.25, 0, TAU); c.fill();
  } else {
    const p = new Path2D();
    const x0 = nx + shSide * 1.6;
    p.moveTo(x0, 11);
    p.quadraticCurveTo(x0 + shSide * 3.4, 19, x0 + shSide * 3.6, 23.4);
    p.quadraticCurveTo(x0 + shSide * 2.6, 26.6, nx - shSide * 0.6, 26.4);
    p.quadraticCurveTo(nx - shSide * 4.6, 26, nx - shSide * 5, 24);
    p.quadraticCurveTo(nx, 25, x0 + shSide * 1.4, 22.6);
    p.quadraticCurveTo(x0 + shSide * 1.6, 17, x0, 11);
    c.fill(p);
  }

  // ---- mouth: a short tapered line; curve and tilt carry the mood ----
  const my = f.beard ? 40.8 : 40.4, mx = cx + 1.8 * turn + m.ms * (0.4 + 0.6 * turn);
  const wl = m.mw * (1 + 0.12 * turn), wr = m.mw * (1 - 0.16 * turn);
  const L0 = { x: mx - wl, y: my - m.mc * 0.45 + m.mt * 0.5 }, R0 = { x: mx + wr, y: my - m.mc * 0.45 - m.mt * 0.5 };
  const midY = my + m.mc * 0.55;
  const lipCol = mix(f.skin.lip, ink, f.beard ? (f.beardLight ? 0.6 : 0.3) : 0.5); // keep the mouth readable against the beard
  if (m.mo > 0) {
    // slightly parted lips: a small dark lens, wider than tall
    const o = m.mo + (f.talk || 0);
    c.fillStyle = mix(f.skin.lip, ink, 0.62);
    c.beginPath();
    c.moveTo(L0.x + 1, L0.y + 0.6);
    c.quadraticCurveTo(mx, my - o * 0.45, R0.x - 1, R0.y + 0.6);
    c.quadraticCurveTo(mx, my + o * 1.1, L0.x + 1, L0.y + 0.6);
    c.fill();
  } else {
    const th = woman ? 2.5 : 2.8;
    c.fillStyle = lipCol;
    c.beginPath();
    c.moveTo(L0.x, L0.y);
    c.quadraticCurveTo(mx, midY - th * 0.65, R0.x, R0.y);
    c.quadraticCurveTo(mx, midY + th * 0.75, L0.x, L0.y);
    c.fill();
    if (m.dimple) { // the smile lifting the corners
      c.strokeStyle = rgba(f.skin.deep, 0.55 * m.dimple); c.lineWidth = 1.3;
      for (const [q, s] of [[L0, -1], [R0, 1]]) { c.beginPath(); c.moveTo(q.x + s * 0.6, q.y - 1.6); c.quadraticCurveTo(q.x + s * 2.2, q.y - 0.2, q.x + s * 1.2, q.y + 1.6); c.stroke(); }
    }
  }
  // lower lip: a soft shadow beneath (fuller and faintly tinted for women)
  c.fillStyle = woman ? rgba(f.skin.lip, 0.34) : rgba(f.skin.shade, 0.75);
  const lw = (wl + wr) * (woman ? 0.32 : 0.26), lyp = midY + (m.mo > 0 ? m.mo * 1.1 + 2.2 : 3.4) + (m.lowLip || 0);
  c.beginPath();
  c.moveTo(mx - lw, lyp - 1);
  c.quadraticCurveTo(mx, lyp + (woman ? 3.2 : 2.4), mx + lw, lyp - 1);
  c.quadraticCurveTo(mx, lyp + 0.6, mx - lw, lyp - 1);
  c.fill();

  // ---- age ----
  if (f.senior) {
    c.strokeStyle = rgba(f.skin.deep, 0.42);
    c.lineWidth = 1.4;
    for (const e of eyes) { // under-eye
      c.beginPath(); c.moveTo(e.x - 3.4 * e.k, eyeY + 7.6); c.quadraticCurveTo(e.x, eyeY + 9.4, e.x + 3.6 * e.k * e.side, eyeY + 7.8); c.stroke();
    }
    c.beginPath(); c.moveTo(cx - 11, 29); c.quadraticCurveTo(cx - 14.6, 36, cx - 12.4, 43); c.stroke();
    c.beginPath(); c.moveTo(cx + 14 - 4 * turn, 29); c.quadraticCurveTo(cx + 17 - 4 * turn, 36, cx + 15 - 4 * turn, 42); c.stroke();
  }
}

function drawGlasses(c, turn, col) {
  // thin rounded frames centred on the eyes; the far lens narrows with the turn
  const cx = 9 * turn, spread = 18.5 - 2.6 * turn;
  c.strokeStyle = col;
  c.lineWidth = 2;
  const lens = [[cx - spread, 1], [cx + spread, 1 - 0.24 * turn]];
  for (const [x, k] of lens) {
    c.beginPath();
    c.roundRect(x - 9.6 * k, -3.4, 19.2 * k, 14, 5.5 * k);
    c.stroke();
  }
  c.beginPath(); c.moveTo(lens[0][0] + 9.6, 1.4); c.quadraticCurveTo(cx, -1.4, lens[1][0] - 9.6 * lens[1][1], 1.4); c.stroke();
  c.beginPath(); c.moveTo(lens[0][0] - 9.6, 0.6); c.lineTo(-44, -2.4); c.stroke();
}

// ---------- hair & beard ----------
function hairCap(turn, young) {
  // Short, neat hair with a side part and a soft fringe.
  const p = new Path2D();
  const o = 6 * turn;
  p.moveTo(-50 - 2 * turn, 2);
  p.bezierCurveTo(-60, -44, -36, -84, 2, -83);
  p.bezierCurveTo(38, -83, 56 - 3 * turn, -60, 50 - 3 * turn, -28);
  p.quadraticCurveTo(48 - 3 * turn, -22, 46 - 3 * turn, -18);
  p.quadraticCurveTo(42, -44, 20 + o, young ? -50 : -47);
  p.quadraticCurveTo(0 + o, -50, -12 + o, -42);
  p.quadraticCurveTo(-28, -52, -38 - turn, -32);
  p.lineTo(-42 - 2 * turn, 2);
  p.closePath();
  return p;
}

function beardPath(turn, full) {
  const p = new Path2D();
  const cx = 5 * turn;
  const R = 47 - 2 * turn, Lw = 48 + 2 * turn;
  const top = full ? 0 : 10;
  const k = full ? 1 : 0.6; // jaw strip thickness
  p.moveTo(-Lw + 1, top);
  p.bezierCurveTo(-Lw, 26, -36, 52, -8 + cx, 66);
  p.quadraticCurveTo(4 + cx, 72, 16 + cx, 66);
  p.bezierCurveTo(38, 52, R, 26, R - 1, top);
  p.lineTo(R - 1 - 7 * k, top);
  p.bezierCurveTo(R - 2 - 7 * k, 22, 30 + cx, 42, 17 + cx, 48);
  p.quadraticCurveTo(cx + 1, 52, -14 + cx, 48);
  p.bezierCurveTo(-30, 42, -Lw + 2 + 7 * k, 22, -Lw + 1 + 7 * k, top);
  p.closePath();
  // moustache: a flat, full band over the upper lip, centred on the mouth (not an arch, which reads as a frown)
  const mc = 10.8 * turn, w0 = 13 - 1 * turn, w1 = 13 - 3.8 * turn;
  p.moveTo(mc - w0, 35.8);
  p.bezierCurveTo(mc - w0 * 0.7, 33.4, mc - w0 * 0.4, 32.2, mc, 32.4);
  p.bezierCurveTo(mc + w1 * 0.4, 32.2, mc + w1 * 0.7, 33.4, mc + w1, 35.6);
  p.bezierCurveTo(mc + w1 * 0.6, 34.8, mc + w1 * 0.3, 35, mc, 35.4);
  p.bezierCurveTo(mc - w0 * 0.3, 35, mc - w0 * 0.6, 34.8, mc - w0, 35.8);
  p.closePath();
  return p;
}

// ---------- headwear ----------
function kummaPath(turn) {
  const p = new Path2D();
  const o = 3 * turn;
  p.moveTo(-54 + o, -37);
  p.quadraticCurveTo(o, -24, 54 + o, -37);
  p.lineTo(51 + o, -79);
  p.quadraticCurveTo(o, -90, -51 + o, -79);
  p.closePath();
  return p;
}

function drawKumma(c, turn, base, emb, emb2, L) {
  const p = kummaPath(turn);
  const o = 3 * turn;
  shade(c, p, base.base, { shadow: base.shade, depth: 9, light: L });
  c.save();
  c.clip(p);
  // Embroidery follows the cylinder: rows parallel to the rim, columns compressed towards the edges.
  const R = 54;
  const rowY = (y, x) => y + 14 * (1 - (x / R) * (x / R)); // rim curvature
  // bottom band of 45° diamonds
  c.fillStyle = emb;
  const n = 15;
  for (let i = 0; i < n; i++) {
    const th = -Math.PI / 2 + (i + 0.5) * (Math.PI / n);
    const x = Math.sin(th) * R + o;
    const k = Math.cos(th);
    const y = rowY(-45, x - o);
    const s = 5.2;
    c.beginPath();
    c.moveTo(x, y - s); c.lineTo(x + s * k, y); c.lineTo(x, y + s); c.lineTo(x - s * k, y);
    c.closePath(); c.fill();
  }
  // thin rules above and below the band
  c.strokeStyle = emb;
  c.lineWidth = 1.8;
  for (const yy of [-53, -37.5]) {
    c.beginPath();
    for (let i = 0; i <= 16; i++) { const x = -R + (i / 16) * 2 * R; const y = rowY(yy, x); if (i) c.lineTo(x + o, y); else c.moveTo(x + o, y); }
    c.stroke();
  }
  // vertical stitch columns with dots
  c.fillStyle = emb2;
  const cols = 11;
  for (let i = 0; i < cols; i++) {
    const th = -Math.PI / 2 + (i + 0.5) * (Math.PI / cols);
    const x = Math.sin(th) * (R - 1) + o;
    const k = Math.cos(th);
    for (let j = 0; j < 3; j++) {
      const y = rowY(-60 - j * 7, x - o);
      c.beginPath(); c.ellipse(x, y, 1.6 * k + 0.4, 1.7, 0, 0, TAU); c.fill();
    }
  }
  // top crown band
  c.strokeStyle = emb;
  c.lineWidth = 2.2;
  c.beginPath();
  c.moveTo(-52 + o, -75); c.quadraticCurveTo(o, -85, 52 + o, -75);
  c.stroke();
  c.restore();
}

function massarPath(turn) {
  const p = new Path2D();
  const o = 3 * turn;
  p.moveTo(-62 + o, -36);
  p.quadraticCurveTo(o, -22, 62 + o, -38);
  p.bezierCurveTo(70 + o, -62, 66 + o, -94, 42 + o, -104);
  p.quadraticCurveTo(o, -114, -44 + o, -102);
  p.bezierCurveTo(-68 + o, -92, -70 + o, -60, -62 + o, -36);
  p.closePath();
  return p;
}

function drawMassar(c, turn, fab, stripe, stripe2, L) {
  const p = massarPath(turn);
  const o = 3 * turn;
  const fx = o + 6 * turn; // the front crossing sits towards the facing side in 3/4
  shade(c, p, fab.base, { shadow: fab.shade, depth: 10, light: L });
  c.save();
  c.clip(p);
  // wraps cross at the front: soft chevrons, alternating light/shade bands
  for (let i = 0; i < 6; i++) {
    const y = -24 - i * 14.5;
    const band = new Path2D();
    band.moveTo(-90 + o, y - 26);
    band.quadraticCurveTo(-30 + fx, y - 12, fx, y + 2);
    band.quadraticCurveTo(34 + fx, y - 14, 90 + o, y - 26);
    band.lineTo(90 + o, y - 34);
    band.quadraticCurveTo(34 + fx, y - 22, fx, y - 6);
    band.quadraticCurveTo(-30 + fx, y - 20, -90 + o, y - 34);
    band.closePath();
    c.save();
    c.globalAlpha *= i % 2 ? 0.9 : 0.5;
    c.fillStyle = i % 2 ? fab.shade : fab.hi;
    c.fill(band);
    c.restore();
    // woven pattern: a fine line and small 45° motifs in the accent colours
    c.strokeStyle = i % 2 ? stripe : stripe2;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(-90 + o, y - 30); c.quadraticCurveTo(-30 + fx, y - 16, fx, y - 2); c.quadraticCurveTo(34 + fx, y - 18, 90 + o, y - 30);
    c.stroke();
    if (i % 2 === 0) {
      c.fillStyle = stripe;
      for (let k = -3; k <= 3; k++) {
        if (k === 0) continue;
        const x = fx + k * 15;
        const t = Math.abs(k) / 6;
        const yy = y - 4 - t * 24 - (k < 0 ? 0 : 1);
        c.beginPath(); c.moveTo(x, yy - 2.6); c.lineTo(x + 2.6, yy); c.lineTo(x, yy + 2.6); c.lineTo(x - 2.6, yy); c.closePath(); c.fill();
      }
    }
  }
  // the tucked end on top
  const tuck = new Path2D();
  tuck.moveTo(-26 + o, -100); tuck.quadraticCurveTo(o, -112, 26 + o, -101); tuck.lineTo(14 + o, -88); tuck.quadraticCurveTo(o - 2, -96, -14 + o, -88); tuck.closePath();
  c.fillStyle = fab.deep; c.fill(tuck);
  c.restore();
}

// Hijab (snug) and sheila (loose) hoods. They are drawn in two layers: the back (before the face)
// and the frame (after the face, covering forehead and cheeks, wrapping under the chin).
function hoodOuter(turn, loose) {
  const p = new Path2D();
  const tw = turn;
  const b = loose ? 5 : 0;
  const back = 57 + 7 * tw + b, front = 55 - 6 * tw + b;
  const top = -80 - b;
  p.moveTo(-4 * tw, top);
  p.bezierCurveTo(34, top, front, -58, front, -18);
  p.bezierCurveTo(front, 20, front - 3, 54, front - 13, 84);
  p.lineTo(front - 15, 134);
  p.lineTo(-back + 15, 134);
  p.lineTo(-back + 11, 88);
  p.bezierCurveTo(-back - 4, 56, -back - 1, 22, -back - 1, -12);
  p.bezierCurveTo(-back - 6 * tw, -52, -40, top, -4 * tw, top);
  p.closePath();
  return p;
}

function faceOpening(turn, loose) {
  const p = new Path2D();
  const cx = 8 * turn;
  const rx = (loose ? 42 : 40) - 3 * turn;
  const top = loose ? -53 : -50;
  p.moveTo(cx, top);
  p.bezierCurveTo(cx + rx * 0.66, top, cx + rx, -32, cx + rx, -4);
  p.bezierCurveTo(cx + rx, 28, cx + rx * 0.62, 58, cx + 2, 71);
  p.bezierCurveTo(cx - rx * 0.6, 58, cx - rx - 2, 28, cx - rx - 2, -4);
  p.bezierCurveTo(cx - rx - 2, -32, cx - rx * 0.66, top, cx, top);
  p.closePath();
  return p;
}

// ---------- the head ----------
/**
 * Draws neck→head→headwear in head-local space (call with the context already at the head centre).
 * layer: 'back' (hood back, before neck), 'head' (face + features + headwear).
 */
export function drawHead(c, h, layer) {
  const { turn, woman, skin, L } = h;
  const hood = h.headwear === 'hijab' || h.headwear === 'sheila';
  const loose = h.headwear === 'sheila';
  if (layer === 'back') {
    if (hood) {
      const outer = hoodOuter(turn, loose);
      shade(c, outer, h.scarf.base, { shadow: h.scarf.shade, depth: 12, light: L });
    }
    return;
  }

  const head = headPath(turn, woman);
  // ears (behind the face edge)
  if (!hood) {
    const ex = turn > 0.5 ? -41 : -46;
    shade(c, earPath(ex, turn), skin.base, { shadow: skin.shade, depth: 4, light: L });
    if (turn < 0.5) shade(c, earPath(46, turn), skin.base, { shadow: skin.shade, depth: 4, light: L });
  }
  // face
  shade(c, head, skin.base, { shadow: skin.shade, depth: 9, light: L });

  // hair under caps (sideburns / nape) or a full cap of hair
  if (!hood) {
    c.fillStyle = h.hair;
    if (h.headwear === 'none') {
      const hp = hairCap(turn, h.age === 'young');
      c.save(); c.clip(new Path2D('M-200,-200 H200 V200 H-200 Z')); c.fill(hp); c.restore();
      // subtle sheen on hair
      c.save(); c.clip(hp); c.fillStyle = rgba('#FFFFFF', 0.07); c.beginPath(); c.ellipse(-12, -66, 26, 9, -0.2, 0, TAU); c.fill(); c.restore();
    } else {
      c.save();
      c.clip(head);
      const sb = new Path2D();
      const sx = -48 - 2 * turn;
      sb.moveTo(sx, -40); sb.lineTo(sx + 9, -40); sb.quadraticCurveTo(sx + 9, -14, sx + 6, 4); sb.lineTo(sx, 4); sb.closePath();
      if (turn < 0.5) { sb.moveTo(48, -40); sb.lineTo(39, -40); sb.quadraticCurveTo(39, -14, 42, 4); sb.lineTo(48, 4); sb.closePath(); }
      c.fill(sb);
      c.restore();
    }
    if (h.beard) {
      c.save();
      c.clip(new Path2D('M-120,-40 H120 V120 H-120 Z'));
      c.fillStyle = h.beardColor;
      c.fill(beardPath(turn, h.beardFull));
      c.restore();
    }
  }

  drawFeatures(c, {
    mood: h.mood, turn, blink: h.blink, look: h.look, skin, ink: h.ink, woman, senior: h.age === 'senior',
    brow: h.beard || h.headwear === 'none' ? mix(h.hair, h.ink, 0.5) : mix(h.ink, h.hair, 0.25), talk: h.talk, L, beard: h.beard, beardLight: h.age === 'senior',
  });
  if (h.glasses) drawGlasses(c, turn, h.ink);

  // headwear front layer
  if (hood) {
    const outer = hoodOuter(turn, loose);
    const open = faceOpening(turn, loose);
    const frame = new Path2D();
    frame.addPath(outer);
    frame.addPath(open);
    c.save();
    c.fillStyle = h.scarf.base;
    c.fill(frame, 'evenodd');
    // shading: back of the hood falls into shadow, a fold sweeps from temple to under the chin
    c.clip(frame, 'evenodd');
    c.fillStyle = h.scarf.shade;
    const sh = new Path2D();
    const back = 70 + 8 * turn;
    sh.moveTo(70, -60); sh.bezierCurveTo(70, 0, 60, 60, 40, 140); sh.lineTo(140, 140); sh.lineTo(140, -60); sh.closePath();
    const a0 = c.globalAlpha;
    c.globalAlpha = a0 * 0.9;
    c.fill(sh);
    c.globalAlpha = a0;
    // inner edge band (underscarf) framing the face
    c.strokeStyle = h.scarf.deep;
    c.lineWidth = 5;
    c.stroke(open);
    // folds
    c.strokeStyle = h.scarf.deep;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(-back + 18, -30); c.bezierCurveTo(-back + 14, 20, -40, 70, -6 + 8 * turn, 92);
    c.stroke();
    c.beginPath();
    c.moveTo(8 * turn - 30, 86); c.quadraticCurveTo(8 * turn, 98, 8 * turn + 32, 84);
    c.stroke();
    c.lineWidth = 2.4;
    c.strokeStyle = h.scarf.hi;
    c.globalAlpha *= 0.5;
    c.beginPath();
    c.moveTo(-34, -78); c.quadraticCurveTo(-58, -50, -60, -16);
    c.stroke();
    c.restore();
  } else if (h.headwear === 'kumma') {
    drawKumma(c, turn, h.capFabric, h.accent, h.accent2, L);
  } else if (h.headwear === 'massar') {
    drawMassar(c, turn, h.capFabric, h.accent, h.accent2, L);
  }
}

/** Neck from the head down into the collar (model space; the caller supplies endpoints). */
export function neckPath(top, bottom, r) {
  const p = new Path2D();
  tube(p, top, bottom, r, r * 1.08, 'round', 'flat');
  return p;
}
