// Hand library: designed silhouettes in hand-local units.
//   origin = wrist centre, +x = towards the fingertips, +y = thumb side.
//   A man's hand is ~64 units from wrist to fingertip (about chin → brow on the 1.05-scaled head).
// Each shape is { back: Part[], front: Part[] }. `back` parts are drawn before a held prop, `front`
// parts (thumb on a screen, fingertips curling round an edge) after it, so props are visibly held.
// Part = { d: Path2D, palm?: bool (palm-side tone), shadow?: bool (soft contact shadow on what is
// underneath), creases?: Path2D (thin lines clipped to the part) }.
//
// Grips say where a held prop sits in the hand: c = prop centre in hand-local units, up = direction
// of the prop's "up" (−y in prop space) in hand-local degrees. The rig derives the wrist and hand
// angle from the prop (or the prop from the hand), so hand and prop always stay in contact.
import { shade, rgba, mix, clamp } from './util.js';

const cache = new Map();
const P = (d) => new Path2D(d);

function part(d, o = {}) { return { d: typeof d === 'string' ? P(d) : d, ...o }; }
function lines(...segs) { return P(segs.join(' ')); }

/**
 * Tapered finger from (x1,y1) radius r1 to (x2,y2) radius r2, appended to path p. Winds clockwise on
 * screen like every hand-drawn outline here, so unions of outline + fingers fill without holes.
 */
function finger(p, x1, y1, x2, y2, r1, r2) {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 0.001;
  const ang = Math.atan2(dy, dx);
  const off = Math.asin(clamp((r1 - r2) / L, -0.95, 0.95));
  const a0 = ang + Math.PI / 2 - off, a1 = ang - Math.PI / 2 + off; // tangent normals
  p.moveTo(x1 + Math.cos(a1) * r1, y1 + Math.sin(a1) * r1);
  p.lineTo(x2 + Math.cos(a1) * r2, y2 + Math.sin(a1) * r2);
  p.arc(x2, y2, r2, a1, a0, false);
  p.lineTo(x1 + Math.cos(a0) * r1, y1 + Math.sin(a0) * r1);
  p.arc(x1, y1, r1, a0, a1 + Math.PI * 2, false);
  p.closePath();
  return p;
}

// ------------------------------------------------------------------ shapes
function nail(p, x, y, ang, r) { p.ellipse(x, y, r * 0.9, r * 0.62, ang, 0, Math.PI * 2); return p; }

function relax() {
  // Hanging hand seen from the thumb side: fingers together in a soft curl (narrower than the palm),
  // thumb resting along the front of the palm.
  const back = part('M -8 -11.6 C 6 -12.8 20 -15.4 30 -15.6 C 40 -15.8 50 -13.6 56.4 -9.4 C 61.4 -6.2 63.2 -0.8 61.4 3.4 C 59.8 7 55.6 8 52.4 6.4 C 48.8 4.6 44.4 3.8 40 5.4 C 33.4 7.8 22 14.4 10 15.2 C 3 15.6 -3 14.2 -8 12.6 Z', {
    creases: lines('M 40 -6.8 C 47 -5.8 54.6 -3.6 61.4 0.4'),
  });
  const thumb = part('M 3 8.6 C 11 8.4 20 10.4 27.6 13.8 C 33 16.2 36.4 19 35.2 22 C 34 24.8 29.6 24.6 24.6 22.6 C 17 19.6 9 17.4 2 15.6 Z', { shadow: true });
  return { back: [back, thumb], front: [] };
}

function open() {
  // Open hand, palm to the viewer (wave): fingers close together with a sliver of space, thumb out.
  const p = P('M -7 -11.4 C 4 -12.4 14 -15 24 -15.4 C 28 -15.4 30 -14 30.6 -12 L 31 11.6 C 22 14.6 11 15.6 1 13.2 C -2 12.6 -4.6 12 -7 11.4 Z');
  finger(p, 26, -11.2, 50.6, -13.4, 3.9, 3.1);
  finger(p, 27, -3.9, 58.6, -5.2, 4.1, 3.3);
  finger(p, 27, 3.3, 61.6, 3.2, 4.2, 3.4);
  finger(p, 25.6, 10.2, 56.6, 12.2, 4, 3.2);
  const palm = part(p, {
    palm: true,
    creases: lines('M 51 -9.2 L 41 -8.2', 'M 58.4 -0.9 L 45 -0.4', 'M 56.6 7.8 L 44 7', 'M 26 8.8 C 19 7.6 12.6 5 7.6 0.6'),
  });
  const th = P('M 3 6.6 C 9.4 8.4 15.6 12.4 20.6 17.6 C 24.4 21.6 28.2 24.2 31 25.2 C 34.2 26.4 34 30.4 30.4 30.8 C 25.6 31.2 20.6 28 16 23.8 C 11.2 19.4 6.4 15.8 2 13.8 Z');
  return { back: [palm, part(th, { palm: true, shadow: true })], front: [] };
}

function fist() {
  // Closed fist from the thumb side: knuckle corner, the curled index wrapping into the palm, thumb across it.
  const body = part('M -7 -12.2 C 5 -13.8 15 -15.8 24 -16.8 C 30 -17.4 34.6 -15.8 37.4 -12.2 C 40.4 -8.2 41 -1 40.2 4.6 C 39.4 10.4 35.6 14 29.6 14.6 C 20 15.6 8 15 -7 12.8 Z', {
    creases: lines('M 25 -16.4 C 31 -13.6 34.6 -8.6 34.6 -2.6 C 34.6 1.6 32.8 4.4 30.4 5.6', 'M 35.6 -13.6 C 38 -11.4 39.6 -8.4 40.4 -5'),
  });
  const th = part('M 3.6 7.6 C 11 5.4 20 3.8 28.4 3.8 C 33.6 3.8 37 6.6 35.8 10 C 34.6 13 30 14 24 14.2 C 16 14.4 9 14.2 3 14 Z', { shadow: true, nail: nail(new Path2D(), 33.2, 8.6, -0.1, 3.2) });
  return { back: [body, th], front: [] };
}

function point() {
  // Index finger straight out, the other fingers curled under it, thumb resting on the curl.
  const p = P('M -7 -12.4 C 5 -14 15 -15.2 23 -15 C 28 -14.8 31 -12.8 33 -10 C 36.6 -6.6 37.6 -1 36 3.4 C 34.4 8.4 30 11.6 24 12.6 C 15 14 4 14 -7 12.6 Z');
  finger(p, 22, -10.2, 63, -8.6, 5, 3.7);
  const body = part(p, { creases: lines('M 33.4 -4.4 C 30.6 -3.2 28 -0.6 27 2.6') });
  const th = part('M 3 8 C 11 8.6 20 7.6 27 4.8 C 31.6 3 35.8 3.6 36.2 6.8 C 36.6 9.8 32 12.2 26 13.4 C 18 15 9 14.8 2 14.4 Z', { shadow: true });
  return { back: [body, th], front: [] };
}

function chin() {
  // Thinking: index finger softly bent along the jaw, thumb across under the chin, the rest curled.
  const p = P('M -7 -12.4 C 4 -14.4 14 -15.6 21 -15.4 C 28 -15.2 33 -11.6 34.4 -5.6 C 35.6 0.4 33.4 5.6 28.4 7.8 C 19 11.6 6 13.4 -7 12.6 Z');
  finger(p, 22, -3.6, 45, -2.4, 5, 4.3);
  finger(p, 45, -2.4, 55.6, 1.6, 4.3, 3.7);
  const body = part(p, { creases: lines('M 33.8 -6.4 C 30.6 -6.6 27.6 -5.4 25.8 -3.6', 'M 33 2.6 C 30 2.4 27.4 3.2 25.6 4.6') });
  const th = part('M 6 7.2 C 12.4 9.6 17.4 14.4 20.6 20.4 C 22.6 24.4 24.6 28.6 23.4 31.6 C 22.2 34.4 18.6 33.8 17 30.6 C 14.6 25.6 10.4 20.2 3 15.6 Z', { shadow: true, nail: nail(new Path2D(), 21.4, 30.6, 1.35, 3) });
  return { back: [body, th], front: [] };
}

function present() {
  // Palm up seen from the thumb side: relaxed fingers lifting slightly at the tips, thumb on top.
  const back = part('M -8 -11.4 C 4 -12.4 16 -12.2 27 -11 C 38 -9.8 48.4 -8.6 55.6 -6 C 60.6 -4.2 63.2 -0.8 62.2 2.2 C 61.2 5.2 57.4 5.6 53 4.6 C 46 3 38 3.6 30 5.4 C 20 7.6 6 10.4 -8 10.6 Z', {
    creases: lines('M 46.6 -1.2 C 51.6 -0.6 56.6 0.6 61.6 2'),
  });
  const th = part('M 2 4.8 C 9.6 4.6 17.6 6.2 24.4 9.2 C 28.2 10.8 29.4 14.6 26.6 16 C 22.8 17.6 16.6 15.4 11 13.4 C 6.4 11.8 3.4 10.8 1 10.2 Z', { shadow: true });
  return { back: [back, th], front: [] };
}

// ---- grips (the prop's outline is known, so contact points are exact) ----
// Phone held in one hand, screen to the viewer: palm behind, thumb on the screen, fingertips round
// the far edge. The phone sits diagonally across the palm (up = 42° towards the thumb).
const PHONE_UP = 42;
function phoneGrip(w, h, tap = 0) {
  const ua = PHONE_UP * Math.PI / 180;
  const up = { x: Math.cos(ua), y: Math.sin(ua) }, side = { x: Math.sin(ua), y: -Math.cos(ua) }; // side → far edge
  const c = phoneCentre(w, h);
  const Q = (u, v, o = 0) => ({ x: c.x + side.x * (u * w + o) + up.x * v * h, y: c.y + side.y * (u * w + o) + up.y * v * h });
  const back = P('M -8 -12.4 C 4 -13.8 16 -15 26 -15.4 L 38 -14 L 40 8 C 34 13 24 16 12 16.4 C 3 16.6 -3 15 -8 13 Z');
  // fingers run behind the phone and curl round its far long edge (only the knuckles show)
  const tips = [];
  for (let i = 0; i < 4; i++) {
    const v = -0.02 - i * 0.135;
    const q = Q(0.5, v, 3.2);
    const r = [4, 4.3, 4.2, 3.8][i];
    finger(back, q.x - side.x * 10 - up.x * 3, q.y - side.y * 10 - up.y * 3, q.x, q.y, r, r - 0.2);
    if (i < 3) tips.push({ ...Q(0.5, v - 0.012, -3.4), r: r - 0.6 });
  }
  const front = [];
  // thumb: from beside the near edge, over it and onto the screen
  const tb = Q(-0.5, -0.38, -7), tj = Q(-0.44, -0.2, 0), tt = Q(-0.2 + tap * 0.07, -0.04 + tap * 0.05, 0);
  const th = new Path2D();
  finger(th, tb.x, tb.y, tj.x, tj.y, 6.6, 5.4);
  finger(th, tj.x, tj.y, tt.x, tt.y, 5.4, 4.4);
  const na = Math.atan2(tt.y - tj.y, tt.x - tj.x);
  front.push(part(th, { shadow: true, nail: nail(new Path2D(), tt.x - Math.cos(na) * 1.6, tt.y - Math.sin(na) * 1.6, na, 3.6) }));
  const ft = new Path2D();
  for (const q of tips) ft.ellipse(q.x, q.y, q.r * 1.05, q.r * 0.86, Math.atan2(side.y, side.x), 0, Math.PI * 2);
  front.push(part(ft, { shadow: true }));
  return { back: [part(back)], front };
}
export function phoneCentre(w, h) {
  const ua = PHONE_UP * Math.PI / 180;
  // the phone's bottom edge rests in the heel of the palm
  return { x: 12 + Math.cos(ua) * (h / 2 - 8) + Math.sin(ua) * 4, y: 1 + Math.sin(ua) * (h / 2 - 8) - Math.cos(ua) * 4 };
}

// Thin flat things (the base of a bunch of receipts): fingers behind, thumb pressing on the front.
function pinch() {
  const back = P('M -8 -11.6 C 6 -12.8 20 -15.2 30 -15.4 C 40 -15.6 49 -13.2 54.6 -8.6 C 59 -5 59.6 0.4 56.4 3.4 C 53.4 6.2 48.6 5.6 44.6 5.2 C 38 4.6 30 8 20 12.6 C 12 15.8 2 15.6 -8 12.6 Z');
  const th = P('M 2 8 C 10 7.4 19 6 26.6 3.2 C 31.6 1.4 37 0 40.8 0.6 C 44.8 1.2 45.6 5.4 42.4 7.2 C 36.8 10.4 27.4 13.4 17.4 15.4 C 10 16.8 4.6 16.8 1.4 15.8 Z');
  return { back: [part(back)], front: [part(th, { shadow: true, nail: nail(new Path2D(), 40.6, 3.6, -0.2, 3.4) })] };
}

// Palm-up support under an object (gift box): flat hand, fingertips curling up its front, thumb on
// its side. The object rests on the palm (thumb side = up).
function support() {
  const back = P('M -8 -11.6 C 4 -12.2 18 -11.4 30 -10 C 42 -8.6 52 -7.4 58 -4.6 C 62.4 -2.4 63.6 1.6 61.2 4.4 L 58 8.6 C 56 10.6 53 10.4 52 8 C 51 5.4 47 4.6 40 4.4 L 24 4.6 C 14 6.4 4 9.6 -8 10.8 Z');
  const th = P('M 2 4.2 C 9.4 4.2 16.6 5.6 22.8 8.4 C 26.6 10 27.8 13.8 25 15.2 C 21.4 17 15.4 15.2 9.8 13.2 C 5.6 11.8 2.6 10.8 0.6 10.2 Z');
  return { back: [part(back)], front: [part(th, { shadow: true, nail: nail(new Path2D(), 23.4, 11.6, 0.5, 3.2) })] };
}

// Takeaway cup: back of the hand on the near side, four fingers wrapped across the front of the cup.
function cup(w) {
  const back = P('M -8 -12.6 C 0 -14.4 8 -15.6 15 -15.4 C 19 -15.2 21.4 -12 21.4 -8 L 21.4 10 C 21.4 13.6 18 15.4 14 15.4 C 6 15.4 0 14.6 -8 13 Z');
  const fr = new Path2D();
  const len = Math.max(20, w * 0.6);
  for (const [y, l, r] of [[-11.2, 0.84, 3.9], [-3.8, 1, 4.1], [3.6, 0.97, 4.1], [10.8, 0.82, 3.8]]) finger(fr, 9, y, 9 + len * l - r, y + 0.6, r + 0.2, r - 0.1);
  return { back: [part(back)], front: [part(fr, { shadow: true, creases: lines('M 13 -7.4 L 15 -7.4', 'M 13 -0.1 L 15 -0.1', 'M 13 7.2 L 15 7.2') })] };
}

// Fist round a bag's rope handles: the handles pass between palm and curled fingers.
function bagFist() {
  const body = P('M -7 -12.6 C 5 -14.6 17 -16.6 27 -16.2 C 35 -15.8 39.4 -10.6 39.6 -3 C 39.8 5.6 36.4 12 28.6 13.8 C 18.6 15.8 6 15 -7 12.8 Z');
  const fr = P('M 24 -15.6 C 30 -16.4 36 -13 38.6 -7 C 40.6 -1.6 40 5.4 36.6 10 C 34 13.4 29.6 14 27.6 11 C 25.6 7.6 25.2 -4 24 -15.6 Z');
  const th = part('M 6 8.6 C 13.6 6.4 22 5.6 28.6 7.2 C 32.8 8.2 33.4 12.4 29.8 13.6 C 22.6 15.6 13 15.6 5 14.6 Z', { shadow: true });
  return { back: [part(body), th], front: [part(fr, { creases: lines('M 30.6 -8.6 C 34 -8.4 37 -7.4 38.8 -6', 'M 31 -1.6 C 34.6 -1.6 37.6 -0.8 39.6 0.4', 'M 30.4 5 C 33.6 5.2 36.2 6 37.8 7') })] };
}
export const BAG_GRIP = { x: 32, y: 0 }; // where the handles pass through the fist (hand-local)

// Grip table: contact = point of the hand that touches the prop's anchor (hand-local units);
// up = the prop's up direction in hand-local degrees (90 = towards the thumb side).
export const GRIPS = {
  phone: { up: PHONE_UP, contact: (w, h) => phoneCentre(w, h) },
  pinch: { up: 30, contact: () => ({ x: 33, y: 4 }) },
  support: { up: 90, contact: () => ({ x: 30, y: 4.6 }) },
  cup: { up: 90, contact: () => ({ x: 13, y: 0 }) },
  bag: { up: 180, contact: () => BAG_GRIP },
};
const D2R = Math.PI / 180;
const rotv = (x, y, a) => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) });

/** Prop pose for a hand: W (wrist), ang (hand angle, rad), mir (±1), anchor (prop-local units). */
export function propFromHand(W, ang, mir, kind, anchor, w, h, k = 1) {
  const g = GRIPS[kind];
  const ct = g.contact(w, h);
  const pAng = ang + (mir * g.up + 90) * D2R;
  const cw = rotv(ct.x * k, ct.y * mir * k, ang);
  const an = rotv(anchor[0], anchor[1], pAng);
  return { x: W.x + cw.x - an.x, y: W.y + cw.y - an.y, ang: pAng };
}

/** Wrist and hand angle that grip prop pose P at anchor (inverse of propFromHand). */
export function handFromProp(P, kind, anchor, mir, w, h, k = 1) {
  const g = GRIPS[kind];
  const ct = g.contact(w, h);
  const ang = P.ang - (90 + mir * g.up) * D2R;
  const an = rotv(anchor[0], anchor[1], P.ang);
  const cw = rotv(ct.x * k, ct.y * mir * k, ang);
  return { W: { x: P.x + an.x - cw.x, y: P.y + an.y - cw.y }, ang };
}

function build(kind, a = 0, b = 0, tap = 0) {
  switch (kind) {
    case 'open': return open();
    case 'fist': return fist();
    case 'point': return point();
    case 'chin': return chin();
    case 'present': case 'open-up': return present();
    case 'phone': return phoneGrip(a || 46, b || 92, tap);
    case 'pinch': case 'grip': return pinch();
    case 'support': return support();
    case 'cup': return cup(a || 34);
    case 'bag': return bagFist();
    default: return relax();
  }
}

/** A hand shape. a, b = held prop width / height (model units) for grips that wrap a prop. */
export function handShape(kind, a = 0, b = 0, tap = 0) {
  const key = kind + ':' + Math.round(a) + ':' + Math.round(b) + ':' + Math.round(tap * 8);
  let s = cache.get(key);
  if (!s) { s = build(kind, a, b, Math.round(tap * 8) / 8); cache.set(key, s); }
  return s;
}

/** Palm-side tone: a little lighter and pinker than the back of the hand (most visible on deep skin). */
export function palmTone(skin) { return skin.palm || mix(skin.base, '#F3CDB6', 0.18); }

/**
 * Draw one layer of a hand. The context must already be in hand-local space.
 * light = vector towards the light in hand space.
 */
export function drawHandParts(c, parts, skin, light, palm) {
  for (const pt of parts) {
    if (pt.shadow) {
      // soft contact shadow under the part (on the palm, a prop or the robe)
      c.save();
      c.translate(-light.x * 2.4, -light.y * 2.4);
      c.fillStyle = rgba(skin.deep, 0.32);
      c.fill(pt.d);
      c.restore();
    }
    const base = pt.palm ? palm : skin.base;
    shade(c, pt.d, base, { shadow: pt.palm ? mix(skin.shade, palm, 0.35) : skin.shade, depth: 4.5, light });
    if (pt.nail) { c.fillStyle = rgba(mix(base, '#FFF4EA', 0.5), 0.7); c.fill(pt.nail); }
    if (pt.creases) {
      c.save();
      c.clip(pt.d);
      c.strokeStyle = rgba(skin.deep, 0.62);
      c.lineWidth = 1.5;
      c.lineCap = 'round';
      c.stroke(pt.creases);
      c.restore();
    }
  }
}
