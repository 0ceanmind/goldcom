// The person: spec resolution, a small 2D rig (torso / neck / head, two-bone arms, legs) and the
// layered drawing of robes, sleeves, hands, feet and held props in correct z-order.
import {
  TAU, DEG, clamp, lerp, wave, rng, mix, tone, rgba, add, sub, scl, len, norm, rot, ik, tube,
  shade, groundShadow, spline, pk, rrect,
} from './util.js';
import { SKIN, FEATURE, HAIR, FABRIC, SHOE, LIGHT, brand, COLORS } from './palette.js';
import { drawHead } from './face.js';
import { handShape } from './hands.js';
import { POSES, HAND_PROPS, STAND_HOLDS } from './poses.js';
import { drawPropShape, PROP_ASPECT } from './props.js';

export const FRAME_H = 1090; // model units mapped to the box height (standing height = 1000)
export const GROUND_PAD = 22; // room under the feet for the soft ground shadow

const L1 = 168, L2 = 152; // upper arm, forearm (to wrist)

// ---------- spec ----------
const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

export function resolveSpec(spec = {}) {
  const gender = spec.gender === 'woman' ? 'woman' : 'man';
  const man = gender === 'man';
  const age = ['young', 'adult', 'senior'].includes(spec.age) ? spec.age : 'adult';
  const skin = SKIN[spec.skin] ? spec.skin : 'medium';
  let outfit = ['dishdasha', 'abaya', 'casual'].includes(spec.outfit) ? spec.outfit : man ? 'dishdasha' : 'abaya';
  if (man && outfit === 'abaya') outfit = 'dishdasha';
  if (!man && outfit === 'dishdasha') outfit = 'abaya';
  let headwear = spec.headwear;
  if (man) {
    if (!['kumma', 'massar', 'none'].includes(headwear)) headwear = outfit === 'casual' && age === 'young' ? 'none' : 'kumma';
  } else if (!['hijab', 'sheila'].includes(headwear)) headwear = 'hijab'; // modest dress: women always wear a headscarf
  const pose = POSES[spec.pose] ? spec.pose : 'stand';
  const P = POSES[pose];
  const mood = ['neutral', 'happy', 'worried', 'surprised', 'calm', 'proud', 'thinking'].includes(spec.mood) ? spec.mood : P.mood || 'neutral';
  const facing = ['left', 'right', 'front'].includes(spec.facing) ? spec.facing : 'right';
  const seed = Number.isFinite(Number(spec.seed)) ? Number(spec.seed) : 1;
  const r = rng(seed * 7.31 + (man ? 0 : 3));
  const beard = man ? (typeof spec.beard === 'boolean' ? spec.beard : age === 'young' ? false : r() < 0.8) : false;
  const accent = brand(spec.accent || 'bullion', COLORS.bullion);
  const prop = spec.prop === undefined ? undefined : spec.prop;
  // colours (seeded but stable)
  const robeName = spec.robe && FABRIC[spec.robe] ? spec.robe
    : outfit === 'dishdasha' ? (seed === 1 ? 'white' : pick(r, ['white', 'white', 'ivory', 'pearl', 'oat', 'white']))
      : outfit === 'abaya' ? 'abaya'
        : man ? pick(r, ['sandstone', 'stone', 'oat', 'olive', 'denim', 'taupe']) : pick(r, ['sandstone', 'taupe', 'mist', 'stone', 'oat']);
  const scarfName = spec.scarf && FABRIC[spec.scarf] ? spec.scarf
    : pick(r, outfit === 'abaya' ? ['mocha', 'taupe', 'sandstone', 'espresso', 'bronzeDeep', 'stone'] : ['black', 'espresso', 'mocha', 'slate', 'bronzeDeep']);
  const lowerName = man ? pick(r, ['graphite', 'slate', 'espresso', 'taupe']) : pick(r, ['graphite', 'espresso', 'slate', 'black']);
  const capName = headwear === 'massar' ? pick(r, ['sandstone', 'oat', 'taupe', 'mocha']) : 'white';
  const glasses = typeof spec.glasses === 'boolean' ? spec.glasses : age === 'senior' && r() < 0.5;
  const seat = spec.seat === 'none' ? 'none' : 'cushion';
  return {
    gender, man, age, skin, outfit, headwear, pose, mood, facing, seed, beard, accent, prop, glasses, seat,
    robe: FABRIC[robeName], robeName, scarf: FABRIC[scarfName], lower: FABRIC[lowerName], cap: FABRIC[capName],
    fx: spec.fx === false ? null : (spec.fx || P.fx || null),
  };
}

// ---------- dimensions ----------
const DIMS = {
  man: { sw: 114, ww: 98, hw: 104, hem: 130, hemY: -34, neck: 22.5, sleeve: [27, 24.5, 21] },
  woman: { sw: 100, ww: 92, hw: 106, hem: 146, hemY: -22, neck: 18, sleeve: [26, 27, 35] },
};
const CASUAL_SLEEVE = { man: [24, 21, 18], woman: [24, 22, 20] };

// ---------- rig ----------
function propSize(name, fallback) { return { phone: 90, giftbox: 112, goldbar: 80, receipts: 104, bag: 130, coffee: 78 }[name] || fallback; }

export function buildRig(S, t) {
  const base = POSES[S.pose];
  const view = S.facing === 'front' ? 'front' : 'side';
  const fr = view === 'front' ? base.front || {} : {};
  const r = rng(S.seed * 3.7 + 11);
  const ph = r();
  let prop = base.prop ? { ...base.prop, ...(fr.prop || {}) } : null;
  const arms = {
    near: { ...base.arms.near, ...(fr.arms?.near || {}) },
    far: { ...base.arms.far, ...(fr.arms?.far || {}) },
  };
  const headDef = { ...(base.head || {}), ...(fr.head || {}) };

  // ---- props requested by the spec ----
  let handProp = null; // a prop attached to a free hand rather than placed by the pose
  if (S.prop === null) { if (prop) prop = { ...prop, hidden: true }; } // keep the grip pose, draw nothing
  else if (S.prop) {
    if (prop) {
      if (prop.name !== S.prop) {
        const k = propSize(S.prop, prop.size) / prop.size;
        for (const a of [arms.near, arms.far]) if (a.rel) a.rel = [a.rel[0] * k, a.rel[1] * k];
        if (S.prop === 'phone' && prop.hold !== 'both') arms.near.hand = 'phone';
        else if (arms.near.rel && arms.near.hand === 'phone') arms.near.hand = 'grip';
        prop = { ...prop, name: S.prop, size: propSize(S.prop, prop.size) };
      }
    } else if ((S.pose === 'stand' || S.pose === 'sit') && STAND_HOLDS[S.prop]) {
      const h = STAND_HOLDS[S.prop];
      prop = { ...h.prop };
      if (view === 'front') prop.at = h.frontAt;
      if (S.pose === 'sit') prop.at = [prop.at[0] + 30, prop.at[1] - 10];
      // in the front view forearms come towards the viewer: foreshorten them and keep elbows down
      arms.near = { ...h.near, ...(view === 'front' ? { pref: [-0.4, 1], len: h.frontLen || [1, 0.55] } : {}) };
      if (h.far) arms.far = { ...h.far, ...(view === 'front' ? { pref: [0.4, 1], z: 'front', len: [1, 0.55] } : {}) };
      if (S.prop === 'phone' || S.prop === 'receipts' || S.prop === 'goldbar') { headDef.tilt = (headDef.tilt || 0) + 11; headDef.look = view === 'front' ? [-0.3, 1] : [0.6, 1]; }
    } else {
      const free = base.free || (arms.near.hand === 'relax' && !arms.near.rel ? 'near' : arms.far.hand === 'relax' && !arms.far.rel ? 'far' : 'near');
      const hp = HAND_PROPS[S.prop] || HAND_PROPS.receipts;
      handProp = { name: S.prop, side: free, ...hp };
      arms[free] = { ...arms[free], hand: hp.hand };
    }
  }

  // ---- idle + pose motion ----
  const A = base.anim ? base.anim(t, ph, view) || {} : {};
  const breath = wave(t, 3.8, ph);
  const sway = wave(t, 5.6, ph + 0.3);
  const blinkCycle = ((t + ph * 3.1) % 3.9) / 3.9;
  const blink = blinkCycle > 0.965 ? Math.sin(((blinkCycle - 0.965) / 0.035) * Math.PI) : 0;
  const body = { dx: sway * 2 + (A.dx || 0), dy: -1.8 * (breath + 1) + (A.dy || 0), lean: (base.lean || 0) + (A.lean || 0) };
  if (S.age === 'senior') body.lean += 2.5;
  const sit = !!base.sit;
  const walk = !!base.walk;
  let wk = null;
  if (walk) {
    const phw = (t / 1.1) * TAU + ph * TAU;
    wk = { ph: phw };
    body.dy += -5 * Math.cos(2 * phw) - 3;
    body.lean += 2;
  }
  const off = sit ? { x: view === 'front' ? 0 : -28, y: 232 } : { x: 0, y: 0 };
  const lean = body.lean * DEG;
  const cl = Math.cos(lean), sl = Math.sin(lean);
  const piv = { x: 0, y: -500 };
  const T = (x, y) => {
    const dx = x - piv.x, dy = y - piv.y;
    return { x: piv.x + dx * cl - dy * sl + off.x + body.dx, y: piv.y + dx * sl + dy * cl + off.y + body.dy };
  };

  const woman = S.gender === 'woman';
  const sk = woman ? 0.88 : 1;
  const shoulderLift = (base.shoulders || 0) + (A.shoulders || 0) - breath * 1.2;
  const SH = view === 'side' ? { near: [-62 * sk, -790], far: [52 * sk, -792] } : { near: [-84 * sk, -790], far: [84 * sk, -790] };

  // prop placement (torso-relative)
  let P = null;
  if (prop) {
    const at = T(prop.at[0] + (A.prop?.[0] || 0), prop.at[1] + (A.prop?.[1] || 0));
    P = { name: prop.name, x: at.x, y: at.y, ang: ((prop.ang || 0) + (A.propAng || 0) + body.lean) * DEG, size: prop.size, hold: prop.hold, hidden: !!prop.hidden };
  }

  const armOut = {};
  for (const side of ['near', 'far']) {
    const a = arms[side];
    const Sp = T(SH[side][0], SH[side][1] + shoulderLift);
    let W;
    if (a.rel && P) W = add({ x: P.x, y: P.y }, rot({ x: a.rel[0], y: a.rel[1] }, P.ang));
    else {
      let tx = a.t[0], ty = a.t[1];
      if (woman && !a.rel) tx *= side === 'near' ? 0.94 : 0.94;
      if (walk && view === 'side') tx += (side === 'near' ? -1 : 1) * 72 * Math.sin(wk.ph);
      if (walk && view === 'front') ty += (side === 'near' ? -1 : 1) * 10 * Math.sin(wk.ph);
      W = T(tx, ty);
    }
    const ao = A[side];
    if (ao) W = add(W, { x: ao[0], y: ao[1] });
    const k1 = a.len ? a.len[0] : 1, k2 = a.len ? a.len[1] : 1;
    const s1 = ik(Sp, W, L1 * k1, L2 * k2, 1), s2 = ik(Sp, W, L1 * k1, L2 * k2, -1);
    const pref = a.pref ? { x: a.pref[0], y: a.pref[1] } : view === 'side' ? { x: -0.35, y: 1 } : { x: side === 'near' ? -0.5 : 0.5, y: 1 };
    const m = { x: (Sp.x + W.x) / 2, y: (Sp.y + W.y) / 2 };
    const d1 = (s1.elbow.x - m.x) * pref.x + (s1.elbow.y - m.y) * pref.y;
    const d2 = (s2.elbow.x - m.x) * pref.x + (s2.elbow.y - m.y) * pref.y;
    const sol = d1 >= d2 ? s1 : s2;
    let ang = ((a.ang ?? 90) + body.lean + (A[side + 'Ang'] || 0)) * DEG;
    const th = a.thumb ? { x: a.thumb[0], y: a.thumb[1] } : { x: 1, y: 0 };
    // local +y in world = (-sin, cos); flip the hand if that points away from the requested thumb side
    const mir = (-Math.sin(ang) * th.x + Math.cos(ang) * th.y) < 0 ? -1 : 1;
    let hand = a.hand || 'relax';
    if (P && P.hidden && a.rel) hand = hand === 'open-up' ? 'open-up' : hand === 'phone' ? 'relax' : 'fist';
    armOut[side] = { S: Sp, E: sol.elbow, W: sol.wrist, ang, mir, hand, z: a.z || (side === 'near' ? 'front' : 'back') };
  }
  // in the front view both arms are on the outside of the torso; nothing hides behind it
  if (view === 'front') for (const side of ['near', 'far']) { if (armOut[side].z === 'back') armOut[side].z = 'front'; else if (armOut[side].z === 'reach') armOut[side].z = 'mid'; }

  if (handProp) {
    const a = armOut[handProp.side];
    const o = rot({ x: handProp.off[0], y: handProp.off[1] * a.mir }, a.ang);
    P = { name: handProp.name, x: a.W.x + o.x, y: a.W.y + o.y, ang: a.ang - Math.PI / 2 + (handProp.ang || 0) * DEG, size: handProp.size, hold: handProp.side, hanging: true };
    if (handProp.name === 'bag' || handProp.name === 'coffee') P.ang = 0;
  }

  // head
  const turn = view === 'side' ? 1 - Math.abs(A.headTurn || 0) * 0.2 : clamp(A.headTurn || 0, -0.3, 0.3);
  const tilt = ((headDef.tilt || 0) + (A.headTilt || 0) + (S.age === 'senior' ? 3 : 0) + (S.mood === 'proud' ? -5 : 0)) * DEG;
  const neckTop = T(view === 'side' ? 4 : 0, -866);
  const headRot = lean + tilt;
  const headC = add(neckTop, rot({ x: view === 'side' ? 6 : 0, y: -62 }, headRot));
  const look = A.look || headDef.look || [0, 0];

  return {
    view, turn, T, body, sit, walk, wk, t, ph,
    arms: armOut, prop: P,
    head: { c: headC, rot: headRot, neckTop, look: { x: look[0], y: look[1] }, blink, thumbTap: A.thumbTap || 0 },
  };
}

// ---------- drawing helpers ----------
function lightFor(flip) { return { x: flip ? -LIGHT.x : LIGHT.x, y: LIGHT.y }; }

function drawHand(c, arm, skin, L, layer, tap = 0) {
  const shp = handShape(arm.hand, arm.hand === 'phone' ? tap : 0);
  c.save();
  c.translate(arm.W.x, arm.W.y);
  c.rotate(arm.ang);
  c.scale(1, arm.mir);
  // light in hand space
  const ca = Math.cos(-arm.ang), sa = Math.sin(-arm.ang);
  const ll = { x: L.x * ca - L.y * sa, y: (L.x * sa + L.y * ca) * arm.mir };
  if (layer === 'back') {
    shade(c, shp.back, skin.base, { shadow: skin.shade, depth: 5, light: ll });
    if (shp.lines.length) {
      c.strokeStyle = skin.shade; c.lineWidth = 2; c.lineCap = 'round';
      for (const [x1, y1, x2, y2] of shp.lines) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
    }
  } else if (shp.front) {
    shade(c, shp.front, skin.base, { shadow: skin.shade, depth: 3.5, light: ll });
    c.strokeStyle = rgba(skin.deep, 0.5); c.lineWidth = 1.6;
    c.stroke(shp.front);
  }
  c.restore();
}

function sleeveRadii(S) { return S.outfit === 'casual' ? CASUAL_SLEEVE[S.gender] : DIMS[S.gender].sleeve; }

function upperArmPath(arm, rr) {
  const p = new Path2D();
  tube(p, arm.S, arm.E, rr[0], rr[1]);
  return p;
}
function forearmPath(arm, rr) {
  const p = new Path2D();
  tube(p, arm.E, arm.W, rr[1], rr[2], 'round', 'flat');
  return p;
}

function sleeveFabric(S) {
  // Sleeves in front of an abaya get a touch more light so arms stay readable over the dark robe.
  if (S.outfit === 'abaya') { const f = S.robe; return { ...f, base: mix(f.base, f.hi, 0.3), shade: mix(f.shade, f.base, 0.2) }; }
  return S.robe;
}

function drawUpperArm(c, S, arm, L, front = false) {
  const rr = sleeveRadii(S);
  const f = front ? sleeveFabric(S) : S.robe;
  const p = upperArmPath(arm, rr);
  // Form shading fades out towards the shoulder so the sleeve cap melts into the robe's shoulder
  // (a hard crescent round the cap reads as a shoulder pad). The tube has no self-overlap, so an
  // even-odd "outside the shifted shape" crescent is safe here.
  c.fillStyle = f.base;
  c.fill(p);
  const g = (col) => {
    const a = arm.S, b = { x: lerp(arm.S.x, arm.E.x, 0.55), y: lerp(arm.S.y, arm.E.y, 0.55) };
    const gr = c.createLinearGradient(a.x, a.y, b.x, b.y);
    gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(0.45, rgba(col, 0)); gr.addColorStop(1, rgba(col, 1));
    return gr;
  };
  const crescent = (dx, dy, col) => {
    const q = new Path2D();
    q.rect(-1e4, -1e4, 2e4, 2e4);
    q.addPath(p, new DOMMatrix().translateSelf(dx, dy));
    c.fillStyle = g(col);
    c.fill(q, 'evenodd');
  };
  c.save();
  c.clip(p);
  crescent(L.x * 9, L.y * 9, f.shade);
  if (S.outfit === 'abaya') crescent(-L.x * 3.5, -L.y * 3.5, f.hi);
  c.restore();
  if (front) {
    // thin same-hue edge, but not round the shoulder cap (it would read as a shoulder pad)
    c.save();
    const ex = new Path2D();
    ex.rect(-1e4, -1e4, 2e4, 2e4);
    ex.arc(arm.S.x, arm.S.y, rr[0] * 1.9, 0, TAU);
    c.clip(ex, 'evenodd');
    c.strokeStyle = rgba(S.robe.deep, S.outfit === 'abaya' ? 0.9 : 0.35); c.lineWidth = 2; c.stroke(p);
    c.restore();
  }
}

function drawForearm(c, S, arm, L, front = false) {
  const rr = sleeveRadii(S);
  const f = front ? sleeveFabric(S) : S.robe;
  const p = forearmPath(arm, rr);
  shade(c, p, f.base, { shadow: f.shade, depth: 8, hi: f.hi, hiDepth: S.outfit === 'abaya' ? 3.5 : 0, light: L });
  if (front) { c.strokeStyle = rgba(S.robe.deep, S.outfit === 'abaya' ? 0.9 : 0.35); c.lineWidth = 2; c.stroke(p); }
  // elbow crease + cuff
  const u = norm(sub(arm.W, arm.E));
  const n = { x: -u.y, y: u.x };
  c.save();
  c.clip(p);
  c.strokeStyle = f.deep;
  c.lineWidth = 2.6;
  c.lineCap = 'round';
  const cuff = S.outfit === 'abaya' ? 14 : 9;
  const cw = rr[2] + 2;
  const a = add(arm.W, scl(u, -cuff));
  c.beginPath();
  c.moveTo(a.x + n.x * cw, a.y + n.y * cw);
  c.lineTo(a.x - n.x * cw, a.y - n.y * cw);
  c.stroke();
  if (S.outfit === 'abaya' || (S.outfit === 'dishdasha')) {
    c.strokeStyle = S.outfit === 'abaya' ? S.accent : mix(S.robe.deep, S.accent, 0.35);
    c.lineWidth = S.outfit === 'abaya' ? 3 : 1.8;
    const b = add(arm.W, scl(u, -cuff + 5));
    c.beginPath(); c.moveTo(b.x + n.x * cw, b.y + n.y * cw); c.lineTo(b.x - n.x * cw, b.y - n.y * cw); c.stroke();
  }
  c.restore();
}

// ---------- feet & legs ----------
function footSide(c, x, y, ang, S, L, k = 1) {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  const skin = SKIN[S.skin];
  if (S.outfit === 'casual') { // sneaker
    const p = new Path2D('M -20 -26 C -6 -30 16 -26 30 -18 C 48 -12 62 -8 64 0 L 64 3 L -22 3 C -26 -6 -26 -20 -20 -26 Z');
    shade(c, p, SHOE.sneaker, { shadow: SHOE.sole, depth: 5, light: L });
    c.fillStyle = SHOE.sole; c.fillRect(-23, -3, 88, 6);
    c.strokeStyle = SHOE.sole; c.lineWidth = 2; c.beginPath(); c.moveTo(4, -24); c.lineTo(22, -14); c.stroke();
  } else if (S.gender === 'woman') { // closed flat shoe
    const p = new Path2D('M -18 -18 C -2 -21 24 -16 40 -10 C 54 -6 60 -3 60 1 L -20 2 C -24 -6 -24 -14 -18 -18 Z');
    shade(c, p, SHOE.flat, { shadow: '#0E0D0C', depth: 4, light: L });
    c.fillStyle = mix(SHOE.flat, S.accent, 0.4); c.fillRect(-20, -1, 80, 3);
  } else { // bare foot in a leather sandal (na'al)
    const foot = new Path2D('M -16 -20 C -2 -22 14 -18 26 -13 C 42 -8 58 -6 60 -1 C 61 2 56 3 50 3 L -18 3 C -24 1 -24 -14 -16 -20 Z');
    shade(c, foot, skin.base, { shadow: skin.shade, depth: 4, light: L });
    c.fillStyle = SHOE.sandal;
    c.beginPath(); c.moveTo(-22, 0); c.lineTo(62, 0); c.quadraticCurveTo(64, 5, 58, 6); c.lineTo(-20, 6); c.quadraticCurveTo(-25, 4, -22, 0); c.fill();
    c.fillStyle = SHOE.sandalDark;
    c.beginPath(); c.moveTo(14, -17); c.quadraticCurveTo(26, -16, 36, -9); c.lineTo(30, -4); c.quadraticCurveTo(22, -9, 10, -10); c.closePath(); c.fill();
  }
  c.restore();
}

function footFront(c, x, y, side, S, L) {
  c.save();
  c.translate(x, y);
  c.rotate(side * 0.12);
  const skin = SKIN[S.skin];
  if (S.outfit === 'casual') {
    const p = new Path2D('M -19 -2 C -21 -18 -14 -30 0 -30 C 14 -30 21 -18 19 -2 L 19 4 L -19 4 Z');
    shade(c, p, SHOE.sneaker, { shadow: SHOE.sole, depth: 5, light: L });
    c.fillStyle = SHOE.sole; c.fillRect(-20, -2, 40, 6);
  } else if (S.gender === 'woman') {
    const p = new Path2D('M -17 2 C -19 -10 -12 -18 0 -18 C 12 -18 19 -10 17 2 Z');
    shade(c, p, SHOE.flat, { shadow: '#0E0D0C', depth: 4, light: L });
  } else {
    const p = new Path2D('M -16 2 C -18 -12 -11 -22 0 -22 C 11 -22 18 -12 16 2 Z');
    shade(c, p, skin.base, { shadow: skin.shade, depth: 4, light: L });
    c.fillStyle = SHOE.sandal; c.fillRect(-19, 0, 38, 5);
    c.fillStyle = SHOE.sandalDark; c.beginPath(); c.moveTo(-15, -12); c.quadraticCurveTo(0, -6, 15, -12); c.lineTo(15, -6); c.quadraticCurveTo(0, 0, -15, -6); c.closePath(); c.fill();
  }
  c.restore();
}

function legTube(c, hip, knee, ankle, S, L, rr = [30, 24, 20]) {
  const p = new Path2D();
  tube(p, hip, knee, rr[0], rr[1]);
  tube(p, knee, ankle, rr[1], rr[2], 'round', 'flat');
  shade(c, p, S.lower.base, { shadow: S.lower.shade, depth: 9, light: L });
}

// ---------- body silhouettes ----------
function feetLayout(R, S) {
  if (R.view === 'front') return null;
  if (R.walk) {
    const ph = R.wk.ph;
    const A = 84;
    const f = (p) => ({ x: 10 + A * Math.sin(p), lift: 30 * Math.max(0, Math.cos(p)) ** 1.5, ang: -0.18 * Math.max(0, Math.cos(p)) + 0.16 * Math.max(0, -Math.sin(p)) * Math.max(0, Math.cos(p + 0.6)) });
    return { near: f(ph), far: f(ph + Math.PI) };
  }
  return { near: { x: -18, lift: 0, ang: 0 }, far: { x: 32, lift: 0, ang: 0 } };
}

function robePathSide(R, S, D, feet, hemY, hemK = 1) {
  const T = R.T;
  const sw = D.sw, ww = D.ww, hw = D.hw;
  let hb = -D.hem * 0.92, hf = D.hem * 0.92;
  let kneeB = null, kneeF = null;
  if (R.walk && hemY > -200) {
    const xs = [feet.near.x, feet.far.x];
    const fwd = Math.max(...xs), bwd = Math.min(...xs);
    hf = Math.max(hf * 0.82, fwd + 74);
    hb = Math.min(hb * 0.86, bwd - 54);
    kneeF = { x: lerp(hw * 0.9, hf, 0.55) + 6, y: -280 };
    kneeB = { x: lerp(-hw, hb, 0.5) - 4, y: -270 };
  }
  const hemMid = R.walk && hemY > -200 ? (hb + hf) / 2 : 6;
  const pts = [
    pk(T(-22, -854)),
    pk(T(-sw * 0.6, -836)),
    pk(T(-sw * 0.86, -802)),
    pk(T(-sw * 0.9, -740)),
    pk(T(-ww * 0.95, -622)),
    pk(T(-hw * 0.97, -506)),
  ];
  if (kneeB) pts.push(pk(kneeB));
  pts.push([hb, hemY - 26, 1], [hb - 1, hemY, 0.25], [hemMid, hemY + 7 * hemK, 1], [hf, hemY, 0.25], [hf - 1, hemY - 26, 1]);
  if (kneeF) pts.push(pk(kneeF));
  pts.push(
    pk(T(hw * 0.9, -506)),
    pk(T(ww * 0.88, -616)),
    pk(T(ww * 0.99, -716)),
    pk(T(sw * 0.74, -800)),
    pk(T(sw * 0.4, -834)),
    pk(T(30, -842), 0.6),
    pk(T(6, -826)),
  );
  const p = new Path2D();
  spline(p, pts);
  return { path: p, hb, hf };
}

function robePathFront(R, S, D, hemY) {
  const T = R.T;
  const sw = D.sw, ww = D.ww, hw = D.hw, hem = D.hem;
  const pts = [
    pk(T(-30, -850)),
    pk(T(-sw * 0.62, -836)),
    pk(T(-sw, -800)),
    pk(T(-sw * 0.98, -742)),
    pk(T(-ww, -620)),
    pk(T(-hw, -506)),
    [-hem, hemY - 26, 1], [-hem - 1, hemY, 0.25], [0, hemY + 8, 1], [hem + 1, hemY, 0.25], [hem, hemY - 26, 1],
    pk(T(hw, -506)),
    pk(T(ww, -620)),
    pk(T(sw * 0.98, -742)),
    pk(T(sw, -800)),
    pk(T(sw * 0.62, -836)),
    pk(T(30, -850), 0.6),
    pk(T(0, -824)),
  ];
  const p = new Path2D();
  spline(p, pts);
  return { path: p, hb: -hem, hf: hem };
}

function robePathSit(R, S, D, front) {
  const T = R.T;
  const sw = D.sw, ww = D.ww;
  const p = new Path2D();
  if (front) {
    const pts = [
      pk(T(-30, -850)), pk(T(-sw * 0.62, -836)), pk(T(-sw, -800)), pk(T(-sw * 0.98, -742)), pk(T(-ww, -630)),
      [-ww - 14, -336, 1], [-ww - 24, -298, 0.6], [-ww - 16, -262, 0.8], [-ww - 8, -120, 1], [-ww - 12, D.hemY - 2, 0.25], [0, D.hemY + 6, 1],
      [ww + 12, D.hemY - 2, 0.25], [ww + 8, -120, 1], [ww + 16, -262, 0.8], [ww + 24, -298, 0.6], [ww + 14, -336, 1],
      pk(T(ww, -630)), pk(T(sw * 0.98, -742)), pk(T(sw, -800)), pk(T(sw * 0.62, -836)), pk(T(30, -850), 0.6), pk(T(0, -824)),
    ];
    spline(p, pts);
    return p;
  }
  const hy = D.hemY;
  const pts = [
    pk(T(-22, -854)), pk(T(-sw * 0.6, -836)), pk(T(-sw * 0.86, -802)), pk(T(-sw * 0.9, -740)), pk(T(-ww * 0.95, -622)),
    [-124, -300, 1], [-118, -262, 0.5], // over the seat
    [70, -258, 0.7], [104, -214, 1], [118, hy - 4, 0.3], // under the thigh, down the back of the calves
    [hy > -30 ? 214 : 208, hy - 2, 0.3], [204, -150, 1], [198, -276, 0.9], [176, -314, 1], // shin drape and knee
    [110, -334, 1],
    pk(T(ww * 0.86, -616)), pk(T(ww * 0.99, -716)), pk(T(sw * 0.74, -800)), pk(T(sw * 0.4, -834)), pk(T(30, -842), 0.6), pk(T(6, -826)),
  ];
  spline(p, pts);
  return p;
}

// folds: long tapered strips in the shade tone
function drawFolds(c, clip, folds, col, alpha = 1) {
  c.save();
  c.clip(clip);
  c.fillStyle = col;
  c.globalAlpha *= alpha;
  for (const f of folds) {
    const [x0, y0, x1, y1, w0, w1] = f;
    const p = new Path2D();
    p.moveTo(x0 - w0 / 2, y0);
    p.quadraticCurveTo((x0 + x1) / 2 - w1 * 0.3, (y0 + y1) / 2, x1 - w1 / 2, y1);
    p.lineTo(x1 + w1 / 2, y1);
    p.quadraticCurveTo((x0 + x1) / 2 + w1 * 0.3, (y0 + y1) / 2, x0 + w0 / 2, y0);
    p.closePath();
    c.fill(p);
  }
  c.restore();
}

function drawSeat(c, R, S, L) {
  if (S.seat === 'none') return;
  const f = FABRIC.taupe;
  // a low modern pouf with a seam and a soft top light
  const x0 = R.view === 'front' ? -150 : -158, x1 = R.view === 'front' ? 150 : 76, top = -262;
  const body = new Path2D();
  body.moveTo(x0 + 6, -4);
  body.lineTo(x0, top + 46);
  body.quadraticCurveTo(x0, top, x0 + 50, top - 2);
  body.lineTo(x1 - 50, top - 2);
  body.quadraticCurveTo(x1, top, x1, top + 46);
  body.lineTo(x1 - 6, -4);
  body.quadraticCurveTo((x0 + x1) / 2, 4, x0 + 6, -4);
  body.closePath();
  shade(c, body, f.base, { shadow: f.shade, depth: 16, hi: f.hi, hiDepth: 4, light: L });
  c.save(); c.clip(body);
  c.strokeStyle = f.deep; c.lineWidth = 2.5;
  c.beginPath(); c.moveTo(x0, top + 54); c.quadraticCurveTo((x0 + x1) / 2, top + 64, x1, top + 54); c.stroke();
  c.fillStyle = rgba(f.deep, 0.35);
  for (let i = 1; i < 6; i++) { const x = lerp(x0, x1, i / 6); c.beginPath(); c.moveTo(x, top + 64); c.lineTo(x + 6, top + 74); c.lineTo(x, top + 84); c.lineTo(x - 6, top + 74); c.closePath(); c.fill(); }
  c.restore();
}

// ---------- held props ----------
function drawHeld(c, R, S, flip) {
  const P = R.prop;
  if (!P || P.hidden) return;
  c.save();
  c.translate(P.x, P.y);
  c.rotate(P.ang);
  if (flip) c.scale(-1, 1); // keep printed marks (999.9) readable when the figure is mirrored
  const asp = PROP_ASPECT[P.name] || 1;
  const w = asp >= 1 ? P.size : P.size * asp, h = asp >= 1 ? P.size / asp : P.size;
  drawPropShape(c, P.name, -w / 2, -h / 2, w, h, { held: true, flip, theme: S.theme, accent: S.accent, glow: P.name === 'phone' }, R.t);
  c.restore();
}

// ---------- effects ----------
function drawFx(c, R, S) {
  if (!S.fx) return;
  const t = R.t;
  if (S.fx === 'sweat') {
    const h = R.head;
    c.save();
    c.translate(h.c.x, h.c.y);
    c.rotate(h.rot);
    const k = ((t * 0.6 + R.ph) % 1);
    const y = -30 + k * 18, a = k < 0.8 ? 1 : (1 - k) / 0.2;
    const a0 = c.globalAlpha;
    c.globalAlpha = a0 * a;
    c.translate(R.view === 'side' ? 36 : -30, y - 8);
    c.scale(0.8, 0.8);
    c.fillStyle = '#E9F1F4';
    c.beginPath(); c.moveTo(0, -16); c.bezierCurveTo(6, -6, 10, 0, 10, 5); c.arc(0, 5, 10, 0, Math.PI); c.bezierCurveTo(-10, 0, -6, -6, 0, -16); c.fill();
    c.fillStyle = '#9FC3D3'; c.globalAlpha = a0 * a * 0.8;
    c.beginPath(); c.arc(2.5, 6, 4.5, 0, Math.PI * 2); c.fill();
    c.restore();
  } else if (S.fx === 'sparkle') {
    const pts = [[-170, -1080, 1], [190, -1060, 0.8], [-200, -880, 0.6], [220, -900, 0.7], [0, -1140, 0.9]];
    pts.forEach(([x, y, s], i) => {
      const tw = 0.5 + 0.5 * Math.sin(t * 5 + i * 1.7 + R.ph * 6);
      const r = (12 + 10 * tw) * s;
      c.save();
      c.translate(x, y);
      c.fillStyle = i % 2 ? COLORS.spark : COLORS.gold;
      c.globalAlpha *= 0.45 + 0.55 * tw;
      c.beginPath();
      c.moveTo(0, -r); c.quadraticCurveTo(0, 0, r, 0); c.quadraticCurveTo(0, 0, 0, r); c.quadraticCurveTo(0, 0, -r, 0); c.quadraticCurveTo(0, 0, 0, -r);
      c.fill();
      c.restore();
    });
  }
}

// ---------- main ----------
export function drawFigure(c, S, R, flip) {
  const L = lightFor(flip);
  const D = DIMS[S.gender];
  const skin = SKIN[S.skin];
  const robe = S.robe;
  const woman = S.gender === 'woman';
  const casual = S.outfit === 'casual';
  const side = R.view === 'side';
  const feet = feetLayout(R, S);
  const hemY = casual && !woman ? -470 : D.hemY;

  // ground shadow
  groundShadow(c, R.sit ? -20 : 8, 0, R.sit ? 220 : 170, 24, 0.24, '#1A120B');

  if (R.sit) drawSeat(c, R, S, L);

  // 1. arms that sit behind the torso
  const arms = R.arms;
  const order = ['far', 'near'];
  const holding = (side) => R.prop && (R.prop.hold === side || R.prop.hold === 'both');
  for (const s of order) {
    const a = arms[s];
    if (a.z === 'reach') { drawUpperArm(c, S, a, L); continue; }
    if (a.z !== 'back') continue;
    drawUpperArm(c, S, a, L);
    drawForearm(c, S, a, L);
    drawHand(c, a, skin, L, 'back');
    if (R.prop && R.prop.hold === s && !holding(s === 'near' ? 'far' : 'near')) drawHeld(c, R, S, flip);
    drawHand(c, a, skin, L, 'front');
  }

  // 2. legs and feet
  const rLeg = woman ? [26, 22, 19] : [35, 29, 25];
  if (R.sit) {
    if (casual && !woman) {
      if (side) {
        const hip = R.T(-10, -505), knee = { x: 176, y: -292 }, ank = { x: 172, y: -44 };
        const hip2 = R.T(20, -505), knee2 = { x: 198, y: -298 }, ank2 = { x: 196, y: -48 };
        legTube(c, hip2, knee2, ank2, S, L, rLeg);
        footSide(c, ank2.x - 4, -4, 0, S, L);
        legTube(c, hip, knee, ank, S, L, rLeg);
        footSide(c, ank.x - 8, 0, 0, S, L);
      } else {
        for (const sd of [-1, 1]) {
          const hip = R.T(sd * 46, -505), knee = { x: sd * 58, y: -300 }, ank = { x: sd * 56, y: -40 };
          const p = new Path2D(); tube(p, knee, ank, rLeg[1], rLeg[2], 'round', 'flat');
          const th = new Path2D(); tube(th, hip, knee, rLeg[0] + 2, rLeg[1] + 4);
          shade(c, th, S.lower.base, { shadow: S.lower.shade, depth: 9, light: L });
          shade(c, p, S.lower.base, { shadow: S.lower.shade, depth: 9, light: L });
          footFront(c, sd * 58, 0, sd, S, L);
        }
      }
    } else if (side) {
      footSide(c, 172, -4, 0, S, L);
      footSide(c, 150, 0, 0, S, L);
    } else {
      footFront(c, 40, 0, 1, S, L);
      footFront(c, -40, 0, -1, S, L);
    }
  } else if (side) {
    const fs = [['far', feet.far], ['near', feet.near]];
    for (const [nm, f] of fs) {
      const ay = -f.lift;
      if (casual && !woman) {
        const hip = R.T(nm === 'near' ? -22 : 24, -500);
        const ank = { x: f.x - 4, y: ay - 40 };
        const k = ik(hip, ank, 236, 226, 1), k2 = ik(hip, ank, 236, 226, -1);
        const knee = k.elbow.x > k2.elbow.x ? k.elbow : k2.elbow;
        legTube(c, hip, knee, ank, S, L, rLeg);
      }
      footSide(c, f.x - 16, ay + (nm === 'near' ? 2 : -2), f.ang, S, L);
    }
  } else {
    const lift = R.walk ? (s) => 14 * Math.max(0, Math.sin(R.wk.ph + (s > 0 ? Math.PI : 0))) : () => 0;
    for (const sd of [-1, 1]) {
      if (casual && !woman) {
        const hip = R.T(sd * 40, -500), ank = { x: sd * 44, y: -40 - lift(sd) };
        const k = ik(hip, ank, 236, 226, 1), k2 = ik(hip, ank, 236, 226, -1);
        legTube(c, hip, Math.abs(k.elbow.x) > Math.abs(k2.elbow.x) ? k2.elbow : k.elbow, ank, S, L, rLeg);
      }
      footFront(c, sd * 34, -lift(sd), sd, S, L);
    }
  }

  // 3. neck (men; a headscarf covers it for women)
  const H = R.head;
  if (!woman) {
    const nb = R.T(side ? 2 : 0, -830);
    const nt = add(H.neckTop, rot({ x: 0, y: -6 }, H.rot));
    const np = new Path2D();
    tube(np, nt, nb, D.neck, D.neck * 1.05, 'round', 'flat');
    shade(c, np, skin.base, { shadow: skin.shade, depth: 7, light: L });
    // soft shadow cast by the chin
    c.save(); c.clip(np); c.fillStyle = skin.shade;
    c.beginPath(); c.ellipse(H.c.x + (side ? 10 : 0), H.c.y + 64, 46, 22, H.rot, 0, TAU); c.fill(); c.restore();
  }

  // 4. robe / clothing body
  drawClothes(c, R, S, D, L, feet, hemY);

  // 5. upper arms for arms in front of the torso
  for (const s of order) {
    const a = arms[s];
    if (a.z === 'back' || a.z === 'reach') continue;
    drawUpperArm(c, S, a, L, true);
  }

  // 6. headscarf drape over the shoulders, then the head
  if (woman) drawDrape(c, R, S, L);
  c.save();
  c.translate(H.c.x, H.c.y);
  c.rotate(H.rot);
  c.scale(1.05, 1.05);
  const hd = {
    turn: R.turn, woman, skin, L: rot(L, -H.rot), headwear: S.headwear, scarf: S.scarf, age: S.age,
    hair: S.age === 'senior' ? HAIR.grey : S.age === 'young' ? HAIR.black : (S.seed % 3 === 2 ? HAIR.darkBrown : HAIR.black),
    beard: S.beard, beardFull: S.age !== 'young', mood: S.mood, blink: H.blink, look: H.look, ink: FEATURE[S.skin], glasses: S.glasses,
    capFabric: S.cap, accent: S.accent, accent2: mix(S.accent, COLORS.espresso, 0.45),
  };
  hd.beardColor = S.age === 'senior' ? HAIR.grey : hd.hair;
  drawHead(c, hd, 'back');
  drawHead(c, hd, 'head');
  c.restore();

  // 7. forearms + hands (mid, then front), with the held prop between hand layers
  const mids = order.filter((s) => arms[s].z === 'mid' || arms[s].z === 'reach');
  const fronts = order.filter((s) => arms[s].z === 'front');
  for (const s of [...mids, ...fronts]) { drawForearm(c, S, arms[s], L, true); drawHand(c, arms[s], skin, L, 'back', s === 'near' ? H.thumbTap : 0); }
  const backOnly = R.prop && ((R.prop.hold === 'far' && arms.far.z === 'back') || (R.prop.hold === 'near' && arms.near.z === 'back'));
  if (R.prop && !backOnly) drawHeld(c, R, S, flip);
  for (const s of [...mids, ...fronts]) drawHand(c, arms[s], skin, L, 'front', s === 'near' ? H.thumbTap : 0);

  drawFx(c, R, S);
}

function drawClothes(c, R, S, D, L, feet, hemY) {
  const woman = S.gender === 'woman';
  const casual = S.outfit === 'casual';
  const side = R.view === 'side';
  const robe = S.robe;
  const T = R.T;

  if (casual && woman) {
    // long dark skirt/dress, then a knee-length tunic over it
    const inner = { ...S, robe: S.lower };
    const Ds = { ...D, hem: 116 };
    const sk = R.sit ? robePathSit(R, inner, Ds, !side) : side ? robePathSide(R, inner, Ds, feet, D.hemY).path : robePathFront(R, inner, Ds, D.hemY).path;
    shade(c, sk, S.lower.base, { shadow: S.lower.shade, depth: 18, light: L });
    const Dt = { ...D, hem: 120, hemY: -330 };
    const tun = R.sit ? robePathSit(R, S, { ...D, hemY: -250 }, !side) : side ? robePathSide(R, S, Dt, feet, -330, 0.5).path : robePathFront(R, S, Dt, -330).path;
    shade(c, tun, robe.base, { shadow: robe.shade, depth: 20, light: L });
    // open front edge of the tunic
    c.save(); c.clip(tun);
    c.strokeStyle = robe.deep; c.lineWidth = 3;
    const a = T(side ? 30 : 0, -826), b = side ? T(46, -360) : T(0, -360);
    c.beginPath(); c.moveTo(a.x, a.y); c.quadraticCurveTo((a.x + b.x) / 2 + (side ? 8 : 0), (a.y + b.y) / 2, b.x, b.y); c.stroke();
    c.restore();
    return;
  }

  if (casual) {
    // overshirt to the hip, trousers are drawn as legs
    const Dt = { ...D, hem: 112, hemY: -452 };
    const shirt = R.sit ? robePathSit(R, S, { ...D, hemY: -300 }, !side) : side ? robePathSide(R, S, Dt, feet, -452, 0.4).path : robePathFront(R, S, Dt, -452).path;
    if (R.sit) {
      c.save();
      c.clip(new Path2D('M -400 -2000 H 400 V -316 H -400 Z'));
      shade(c, shirt, robe.base, { shadow: robe.shade, depth: 18, light: L });
      c.restore();
    } else shade(c, shirt, robe.base, { shadow: robe.shade, depth: 18, light: L });
    c.save(); c.clip(shirt);
    c.strokeStyle = robe.deep; c.lineWidth = 3;
    const a = T(side ? 34 : 0, -820), b = T(side ? 44 : 0, -440);
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    c.fillStyle = robe.deep;
    for (let i = 0; i < 5; i++) { const q = T(side ? 36 + i * 1.8 : 0, -790 + i * 80); c.beginPath(); c.arc(q.x + (side ? 7 : 7), q.y, 3.2, 0, TAU); c.fill(); }
    // pocket
    const pc = T(side ? 64 : -54, -730);
    c.strokeStyle = robe.shade; c.lineWidth = 2.5; c.beginPath(); c.roundRect(pc.x - 18, pc.y - 18, 36, 40, 4); c.stroke();
    c.restore();
    // collar
    const n1 = T(side ? -16 : -30, -852), n2 = T(side ? 36 : 30, -846), nm = T(side ? 12 : 0, -808);
    c.fillStyle = robe.hi;
    c.beginPath(); c.moveTo(n1.x, n1.y); c.lineTo(nm.x - 6, nm.y); c.lineTo(nm.x - 20, n1.y + 8); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(n2.x, n2.y); c.lineTo(nm.x + 6, nm.y); c.lineTo(nm.x + 22, n2.y + 10); c.closePath(); c.fill();
    return;
  }

  // dishdasha / abaya
  let body;
  if (R.sit) body = robePathSit(R, S, D, !side);
  else body = (side ? robePathSide(R, S, D, feet, hemY) : robePathFront(R, S, D, hemY)).path;
  const abaya = S.outfit === 'abaya';
  shade(c, body, robe.base, { shadow: robe.shade, depth: abaya ? 22 : 24, hi: robe.hi, hiDepth: abaya ? 4 : 0, light: L });

  if (R.sit && !side) {
    // knees towards the viewer: a soft shadow where the robe breaks over them, fabric hanging between
    c.save();
    c.clip(body);
    c.fillStyle = robe.shade;
    const w2 = D.ww + 30;
    c.beginPath(); c.moveTo(-w2, -276); c.quadraticCurveTo(-50, -262, 0, -272); c.quadraticCurveTo(50, -262, w2, -276); c.lineTo(w2, -258); c.quadraticCurveTo(50, -244, 0, -254); c.quadraticCurveTo(-50, -244, -w2, -258); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(-5, -292); c.lineTo(5, -292); c.lineTo(22, D.hemY); c.lineTo(-22, D.hemY); c.closePath(); c.fill();
    c.restore();
  }

  // folds
  const folds = [];
  if (R.sit) {
    if (side) folds.push([186, -290, 160, D.hemY, 3, 14], [150, -250, 140, D.hemY, 2, 8], [40, -330, 140, -312, 3, 6]);
    else folds.push([-70, -250, -82, D.hemY, 3, 10], [70, -250, 82, D.hemY, 3, 10], [0, -620, 0, -340, 3, 6]);
  } else if (side) {
    const b0 = T(-40, -560), b1 = T(52, -560), b2 = T(-8, -500);
    if (R.walk) {
      const xs = [feet.near.x, feet.far.x];
      const mx = (xs[0] + xs[1]) / 2;
      folds.push([b2.x, b2.y + 40, mx, hemY + 2, 2, 16]);
      folds.push([b0.x, b0.y, Math.min(...xs) - 20, hemY + 2, 3, 12]);
    } else {
      folds.push([b0.x, b0.y, -56, hemY + 2, 3, 13], [b1.x, b1.y, 64, hemY + 2, 3, 14], [b2.x, b2.y + 40, 6, hemY + 4, 2, 9]);
    }
  } else {
    const a = T(-50, -560), b = T(50, -560), m = T(0, -520);
    folds.push([a.x, a.y, -70, hemY + 2, 3, 14], [b.x, b.y, 70, hemY + 2, 3, 14], [m.x, m.y, 0, hemY + 4, 2, 9]);
  }
  drawFolds(c, body, folds, abaya ? robe.deep : robe.shade, abaya ? 0.9 : 0.85);

  // neckline + front details
  c.save();
  c.clip(body);
  const cx = side ? 8 : 0;
  if (abaya) {
    // embroidered centre-front trim
    const a = T(cx + (side ? 8 : 0), -826), b = side ? { x: R.walk ? lerp(feet.near.x, feet.far.x, 0.5) + 30 : 40, y: hemY + 6 } : { x: 0, y: hemY + 8 };
    if (R.sit) { b.x = side ? 120 : 0; b.y = -300; }
    c.strokeStyle = S.accent; c.lineWidth = 3;
    c.beginPath(); c.moveTo(a.x, a.y); c.quadraticCurveTo(lerp(a.x, b.x, 0.5) + (side ? 12 : 0), lerp(a.y, b.y, 0.5), b.x, b.y); c.stroke();
    c.strokeStyle = rgba(S.accent, 0.45); c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(a.x + 7, a.y + 10); c.quadraticCurveTo(lerp(a.x, b.x, 0.5) + (side ? 19 : 7), lerp(a.y, b.y, 0.5), b.x + 7, b.y); c.stroke();
    // hem band
    c.strokeStyle = rgba(S.accent, 0.8); c.lineWidth = 2.5;
    if (!R.sit) { c.beginPath(); c.moveTo(-200, hemY - 12); c.quadraticCurveTo(0, hemY - 2, 200, hemY - 12); c.stroke(); }
  } else {
    // dishdasha: round neckline, short front slit with fine embroidery, the furakha tassel
    const n0 = T(cx - 26, -846), n1 = T(cx + 26, -842), nm = T(cx + 2, -822);
    c.strokeStyle = mix(robe.deep, S.accent, 0.55); c.lineWidth = 2.6;
    c.beginPath(); c.moveTo(n0.x, n0.y); c.quadraticCurveTo(nm.x - 8, nm.y + 4, nm.x, nm.y); c.quadraticCurveTo(nm.x + 8, nm.y + 4, n1.x, n1.y); c.stroke();
    const s0 = T(cx + 2, -822), s1 = T(cx + 4, -742);
    c.strokeStyle = robe.deep; c.lineWidth = 2.6;
    c.beginPath(); c.moveTo(s0.x, s0.y); c.lineTo(s1.x, s1.y); c.stroke();
    c.strokeStyle = mix(robe.shade, S.accent, 0.6); c.lineWidth = 1.5;
    for (const dx of [-6, 6]) { c.beginPath(); c.moveTo(s0.x + dx, s0.y + 4); c.lineTo(s1.x + dx * 0.8, s1.y); c.stroke(); }
  }
  c.restore();
  if (!abaya) drawFurakha(c, R, S);
}

function drawFurakha(c, R, S) {
  const side = R.view === 'side';
  const T = R.T;
  const top = T(side ? 16 : 7, -826);
  const sway = Math.sin(R.t * 2.1 + R.ph * 5) * 3 + (R.walk ? Math.sin(R.wk.ph * 2) * 5 : 0);
  const lean = R.body.lean * DEG;
  const len = 104;
  const end = { x: top.x + sway + Math.sin(-lean) * 4, y: top.y + len };
  const col = mix(S.robe.deep, S.accent, 0.7);
  c.strokeStyle = col;
  c.lineWidth = 2.6;
  c.lineCap = 'round';
  c.beginPath(); c.moveTo(top.x, top.y); c.quadraticCurveTo(top.x + sway * 0.4 + 2, top.y + len * 0.5, end.x, end.y); c.stroke();
  // tassel
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(end.x, end.y - 4);
  c.bezierCurveTo(end.x + 7, end.y + 2, end.x + 6, end.y + 18, end.x + 3, end.y + 24);
  c.lineTo(end.x - 3, end.y + 24);
  c.bezierCurveTo(end.x - 6, end.y + 18, end.x - 7, end.y + 2, end.x, end.y - 4);
  c.fill();
  c.fillStyle = S.accent;
  c.beginPath(); c.ellipse(end.x, end.y, 4, 4.5, 0, 0, TAU); c.fill();
}

function drawDrape(c, R, S, L) {
  const T = R.T;
  const side = R.view === 'side';
  const f = S.scarf;
  const loose = S.headwear === 'sheila';
  const p = new Path2D();
  const o = side ? 10 : 0; // drape centre drifts towards the facing side in 3/4
  const w = loose ? 74 : 64, low = loose ? -742 : -756;
  spline(p, [
    pk(T(o - 44, -906)), pk(T(o - w + 4, -858)), [...Object.values(T(o - w - 2, -806)), 0.8],
    pk(T(o - w + 14, -776)), pk(T(o - 4, low)), pk(T(o + w - 16, -778)),
    [...Object.values(T(o + w - (side ? 8 : 2), -806)), 0.8], pk(T(o + w - 6, -858)), pk(T(o + 42, -906)),
  ]);
  shade(c, p, f.base, { shadow: f.shade, depth: 12, hi: f.hi, hiDepth: 2.5, light: L });
  // folds radiating from under the chin
  c.save(); c.clip(p);
  c.strokeStyle = f.deep; c.lineWidth = 2.6; c.lineCap = 'round';
  const top = T(o, -846);
  for (const [x, y] of [[o - 40, -790], [o + 38, -790]]) {
    const q = T(x, y);
    c.beginPath(); c.moveTo(top.x + (q.x - top.x) * 0.25, top.y + (q.y - top.y) * 0.25); c.quadraticCurveTo((top.x + q.x) / 2 + 4, (top.y + q.y) / 2, q.x, q.y); c.stroke();
  }
  c.restore();
  if (loose) {
    // the long end of the sheila falling over the shoulder and down the back
    const tail = new Path2D();
    const sway = Math.sin(R.t * 1.9 + R.ph * 4) * 3;
    const bx = side ? -84 : -86;
    spline(tail, [
      pk(T(bx + 26, -872)), pk(T(bx - 18, -812)), [...Object.values(T(bx - 26 + sway, -640)), 0.5], [...Object.values(T(bx - 2 + sway, -604)), 0.3],
      [...Object.values(T(bx + 22 + sway, -640)), 0.6], pk(T(bx + 24, -790)), pk(T(bx + 44, -850)),
    ]);
    shade(c, tail, f.base, { shadow: f.shade, depth: 9, hi: f.hi, hiDepth: 2.5, light: L });
    c.save(); c.clip(tail); c.strokeStyle = f.deep; c.lineWidth = 2.4;
    const q0 = T(bx + 4, -800), q1 = T(bx + sway, -630);
    c.beginPath(); c.moveTo(q0.x, q0.y); c.lineTo(q1.x, q1.y); c.stroke();
    c.restore();
  }
}
