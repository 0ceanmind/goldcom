// Heads, faces and headwear (kumma, massar, hijab, sheila) in head-local units.
// Head origin = centre of the skull; crown at y ≈ -68, chin at y ≈ +64. +x = facing side.
import { shade, tube, clamp, lerp, rgba, mix, tone, TAU } from './util.js';

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
const MOODS = {
  //        brow inner lift, outer lift, arch, eye kind, mouth kind
  neutral: { bi: 0, bo: 0, arch: 2, eye: 'dot', mouth: 'flat', bh: 0 },
  happy: { bi: 2, bo: 1, arch: 4, eye: 'smile', mouth: 'open-smile', bh: -2 },
  worried: { bi: 7, bo: -3, arch: 0, eye: 'dot-wide', mouth: 'wobble', bh: -2 },
  surprised: { bi: 6, bo: 6, arch: 6, eye: 'round', mouth: 'o', bh: -6 },
  calm: { bi: -1, bo: 0, arch: 3, eye: 'closed', mouth: 'soft-smile', bh: 1 },
  proud: { bi: 0, bo: 2, arch: 4, eye: 'smile', mouth: 'smile', bh: -2 },
  thinking: { bi: 3, bo: 0, arch: 2, eye: 'dot-up', mouth: 'side', bh: -1, asym: 5 },
};

/**
 * Draw facial features. f = { mood, turn, blink (0..1), look: {x,y}, skin, ink, woman, talk }
 */
export function drawFeatures(c, f) {
  const m = MOODS[f.mood] || MOODS.neutral;
  const turn = f.turn;
  const cx = 9 * turn;
  const spread = 18.5 - 2.5 * turn;
  const eyeY = 4;
  const ink = f.ink;
  const look = f.look || { x: 0, y: 0 };
  const eyes = [
    { x: cx - spread, k: 1, side: -1 },
    { x: cx + spread, k: 1 - 0.22 * turn, side: 1 },
  ];
  c.lineCap = 'round';
  c.lineJoin = 'round';

  // brows
  c.strokeStyle = f.brow || ink;
  c.lineWidth = f.woman ? 3.6 : 4.6;
  for (const e of eyes) {
    const w = 15 * e.k;
    const inner = e.x - e.side * 3;
    const outer = e.x + e.side * (w - 3);
    const asym = m.asym && e.side > 0 ? -m.asym : 0;
    const yb = eyeY - 17 + m.bh + asym;
    const yi = yb - m.bi;
    const yo = yb - m.bo + 1;
    c.beginPath();
    c.moveTo(inner, yi);
    c.quadraticCurveTo((inner + outer) / 2, Math.min(yi, yo) - m.arch, outer, yo);
    c.stroke();
  }

  // eyes
  const blink = clamp(f.blink || 0);
  c.fillStyle = ink;
  c.strokeStyle = ink;
  for (const e of eyes) {
    const ex = e.x + look.x * 2.2, ey = eyeY + look.y * 2;
    let kind = m.eye;
    if (blink > 0.5 && kind !== 'closed' && kind !== 'smile') kind = 'blink';
    c.lineWidth = 3.4;
    if (kind === 'dot' || kind === 'dot-wide' || kind === 'dot-up' || kind === 'round') {
      const ry = kind === 'round' ? 6.2 : kind === 'dot-wide' ? 5.6 : 5.2;
      const rx = (kind === 'round' ? 5.4 : 4.3) * e.k;
      const oy = kind === 'dot-up' ? -2 : 0;
      c.beginPath();
      c.ellipse(ex, ey + oy, rx, ry * (1 - blink * 0.8), 0, 0, TAU);
      c.fill();
      if (f.woman) { // a single elegant lash flick at the outer corner
        c.lineWidth = 2.2;
        c.beginPath();
        c.moveTo(ex + e.side * rx * 0.7, ey - ry * 0.55 + oy);
        c.lineTo(ex + e.side * (rx + 3.2), ey - ry - 0.5 + oy);
        c.stroke();
      }
      if (kind === 'round' || kind === 'dot-wide') {
        c.fillStyle = rgba('#FFFFFF', 0.85);
        c.beginPath(); c.arc(ex - 1.4, ey - 1.8 + oy, 1.2, 0, TAU); c.fill();
        c.fillStyle = ink;
      }
    } else if (kind === 'smile') { // closed, happy crescents ( ^ ^ )
      c.beginPath();
      c.moveTo(ex - 5.5 * e.k, ey + 1.5);
      c.quadraticCurveTo(ex, ey - 5.5, ex + 5.5 * e.k, ey + 1.5);
      c.stroke();
    } else if (kind === 'closed' || kind === 'blink') { // serene lids ( ‿ ‿ )
      c.beginPath();
      c.moveTo(ex - 5.5 * e.k, ey - 0.5);
      c.quadraticCurveTo(ex, ey + 4, ex + 5.5 * e.k, ey - 0.5);
      c.stroke();
      if (f.woman) {
        c.lineWidth = 2;
        c.beginPath(); c.moveTo(ex + e.side * 5.2 * e.k, ey - 0.5); c.lineTo(ex + e.side * 8 * e.k, ey - 3); c.stroke();
      }
    } else if (kind === 'lid') { // half-closed, content
      c.beginPath();
      c.ellipse(ex, ey + 1, 4.5 * e.k, 3.6, 0, 0, Math.PI);
      c.fill();
      c.lineWidth = 3;
      c.beginPath(); c.moveTo(ex - 5.5 * e.k, ey); c.lineTo(ex + 5.5 * e.k, ey); c.stroke();
    }
  }

  // nose: a small soft shadow on the side away from the light, plus the underside
  const nx = cx + 3 + 4 * turn;
  c.fillStyle = f.skin.deep;
  c.beginPath();
  c.moveTo(nx + 1.5, 12);
  c.quadraticCurveTo(nx + 5, 22, nx + 2.5, 26);
  c.quadraticCurveTo(nx - 2.5, 28.5, nx - 6.5, 25.5);
  c.quadraticCurveTo(nx - 1.5, 25, nx + 0.2, 21.5);
  c.quadraticCurveTo(nx + 1, 17, nx + 1.5, 12);
  c.fill();

  // mouth
  const my = 41, mx = cx + 1.5 * turn;
  const lip = f.lip || f.skin.lip;
  c.strokeStyle = mix(lip, ink, 0.45);
  c.fillStyle = mix(lip, ink, 0.55);
  c.lineWidth = 3.4;
  const talk = f.talk || 0;
  switch (m.mouth) {
    case 'open-smile': {
      c.beginPath();
      c.moveTo(mx - 10, my - 2);
      c.quadraticCurveTo(mx, my - 0.5, mx + 10, my - 2);
      c.quadraticCurveTo(mx + 7, my + 9 + talk, mx, my + 9 + talk);
      c.quadraticCurveTo(mx - 7, my + 9 + talk, mx - 10, my - 2);
      c.fill();
      c.fillStyle = rgba('#FFFFFF', 0.9);
      c.beginPath();
      c.moveTo(mx - 8, my - 1.2); c.quadraticCurveTo(mx, my + 0.4, mx + 8, my - 1.2); c.lineTo(mx + 6.5, my + 1.8); c.quadraticCurveTo(mx, my + 3, mx - 6.5, my + 1.8);
      c.fill();
      break;
    }
    case 'smile':
      c.beginPath(); c.moveTo(mx - 9, my - 1); c.quadraticCurveTo(mx, my + 7, mx + 9, my - 2); c.stroke();
      break;
    case 'soft-smile':
      c.beginPath(); c.moveTo(mx - 7, my); c.quadraticCurveTo(mx, my + 4.5, mx + 7, my - 0.5); c.stroke();
      break;
    case 'wobble':
      c.beginPath(); c.moveTo(mx - 8, my + 3); c.quadraticCurveTo(mx - 4, my - 1.5, mx, my + 1); c.quadraticCurveTo(mx + 4, my + 3.5, mx + 8, my + 1); c.stroke();
      break;
    case 'o':
      c.beginPath(); c.ellipse(mx, my + 2, 4.6, 6 + talk, 0, 0, TAU); c.fill();
      break;
    case 'side':
      c.beginPath(); c.moveTo(mx - 6, my + 1); c.quadraticCurveTo(mx + 1, my + 2, mx + 8, my - 2); c.stroke();
      break;
    default:
      c.beginPath(); c.moveTo(mx - 7, my); c.quadraticCurveTo(mx, my + 1.5, mx + 7, my); c.stroke();
  }

  // cheeks: soft warmth for positive moods
  if (f.mood === 'happy' || f.mood === 'proud' || f.mood === 'calm') {
    c.fillStyle = rgba(f.skin.blush, f.woman ? 0.32 : 0.22);
    for (const e of eyes) { c.beginPath(); c.ellipse(e.x + e.side * 4, eyeY + 19, 7.5 * e.k, 4.5, 0, 0, TAU); c.fill(); }
  }

  // age lines
  if (f.senior) {
    c.strokeStyle = rgba(f.skin.deep, 0.75);
    c.lineWidth = 2;
    for (const e of eyes) {
      c.beginPath(); c.moveTo(e.x + e.side * 9 * e.k, eyeY + 2); c.lineTo(e.x + e.side * 12 * e.k, eyeY + 5); c.stroke();
    }
    c.beginPath(); c.moveTo(cx - 14, 30); c.quadraticCurveTo(cx - 17, 38, cx - 14, 44); c.stroke();
    c.beginPath(); c.moveTo(cx + 16 - 3 * turn, 30); c.quadraticCurveTo(cx + 19 - 3 * turn, 38, cx + 16 - 3 * turn, 44); c.stroke();
  }
}

function drawGlasses(c, turn, col) {
  const cx = 9 * turn, spread = 18.5 - 2.5 * turn;
  c.strokeStyle = col;
  c.lineWidth = 2.6;
  for (const [x, k] of [[cx - spread, 1], [cx + spread, 1 - 0.22 * turn]]) {
    c.beginPath();
    c.roundRect(x - 10 * k, -4, 20 * k, 15, 5);
    c.stroke();
  }
  c.beginPath(); c.moveTo(cx - spread + 10, 1); c.quadraticCurveTo(cx, -2, cx + spread - 10, 1); c.stroke();
  c.beginPath(); c.moveTo(cx - spread - 10, 0); c.lineTo(-44, -3); c.stroke();
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
  // moustache
  p.moveTo(-13 + cx, 37.5);
  p.quadraticCurveTo(cx + 1, 29, 15 + cx, 37.5);
  p.quadraticCurveTo(cx + 1, 34, -13 + cx, 37.5);
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
    brow: h.beard || h.headwear === 'none' ? mix(h.hair, h.ink, 0.5) : h.ink, talk: h.talk,
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
