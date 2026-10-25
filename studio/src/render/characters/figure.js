// The person: spec resolution, a small 2D rig (torso / neck / head, two-bone arms, legs), layered idle
// motion, and the drawing of robes, sleeves, hands, feet and held props in correct z-order.
import {
  TAU, DEG, clamp, lerp, smooth, easeInOut, rng, mix, tone, rgba, add, sub, scl, len, norm, rot, mid, ik, tube,
  shade, groundShadow, spline, pk, holdNoise, blinkAt,
} from './util.js';
import { SKIN, FEATURE, HAIR, FABRIC, SHOE, LIGHT, brand, COLORS } from './palette.js';
import { drawHead } from './face.js';
import { handShape, drawHandParts, palmTone, handFromProp, propFromHand, GRIPS, BAG_GRIP } from './hands.js';
import { POSES, HAND_PROPS, STAND_HOLDS, PROP_GRIPS } from './poses.js';
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
  man: { sw: 114, ww: 98, hw: 104, hem: 130, hemY: -34, neck: 22.5, sleeve: [27, 23.5, 18] },
  woman: { sw: 100, ww: 92, hw: 106, hem: 146, hemY: -22, neck: 18, sleeve: [25.5, 25.5, 30] },
};
const CASUAL_SLEEVE = { man: [23, 20, 16.5], woman: [23, 21, 17.5] };

// ---------- rig ----------
const HAND_K = { man: 1, woman: 0.93 };
function propDims(name, size) {
  const asp = PROP_ASPECT[name] || 1;
  return asp >= 1 ? { w: size, h: size / asp } : { w: size * asp, h: size };
}
function propSize(name, fallback) { return { phone: 90, giftbox: 112, goldbar: 80, receipts: 104, bag: 128, coffee: 78 }[name] || fallback; }
const saltOf = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997; return h; };
const rotv = (q, a) => rot(q, a);

/** Walk cycle for one leg. q in [0,1): 0 = heel strike. Returns the foot origin (ankle at the sole) and angle. */
const ST = 0.62, STRIDE = 100, HEEL = 20, TOE = 62;
function stanceFoot(q) {
  const hx = STRIDE - (2 * STRIDE / ST) * q; // heel of the planted foot slides back at walking speed
  if (q < 0.1) { // heel strike: toe lowering, pivot on the heel
    const th = -0.26 * (1 - smooth(q / 0.1));
    return { x: hx + HEEL * Math.cos(th), y: HEEL * Math.sin(th), ang: th };
  }
  if (q < 0.42) return { x: hx + HEEL, y: 0, ang: 0 };
  const th = 0.52 * smooth((q - 0.42) / (ST - 0.42)); // heel rising, pivot on the toe
  const tx = hx + HEEL + TOE;
  return { x: tx - TOE * Math.cos(th), y: -TOE * Math.sin(th), ang: th };
}
function walkFoot(q) {
  q = ((q % 1) + 1) % 1;
  if (q < ST) return { ...stanceFoot(q), swing: 0 };
  const s = (q - ST) / (1 - ST);
  const a = stanceFoot(ST - 1e-6), b = stanceFoot(0);
  const lift = 38 * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.1)), 0.8);
  return { x: lerp(a.x, b.x, easeInOut(s)), y: lerp(a.y, b.y, s) - lift, ang: 0.52 * (1 - s) ** 2 - 0.26 * s * s, swing: Math.sin(Math.PI * s) };
}

export function buildRig(S, t) {
  const base = POSES[S.pose];
  const view = S.facing === 'front' ? 'front' : 'side';
  const fr = view === 'front' ? base.front || {} : {};
  const r = rng(S.seed * 3.7 + 11);
  const ph = r();
  const ns = S.seed * 7.13 + (S.man ? 0 : 3.3) + saltOf(S.pose) * 0.37; // noise seed
  const HK = HAND_K[S.gender];
  let prop = base.prop ? { ...base.prop, ...(fr.prop || {}) } : null;
  const arms = {
    near: { ...base.arms.near, ...(fr.arms?.near || {}) },
    far: { ...base.arms.far, ...(fr.arms?.far || {}) },
  };
  const headDef = { ...(base.head || {}), ...(fr.head || {}) };

  // ---- props requested by the spec ----
  let handProp = null; // a prop carried by a free hand rather than placed by the pose
  if (S.prop === null) { if (prop) prop = { ...prop, hidden: true }; } // keep the grip pose, draw nothing
  else if (S.prop) {
    if (prop) {
      if (prop.name !== S.prop) {
        // the pose's own hold, re-gripped for the new prop
        const g = PROP_GRIPS[S.prop] || PROP_GRIPS.receipts;
        prop = { ...prop, name: S.prop, size: propSize(S.prop, prop.size), ang: (prop.ang || 0) * 0.5 };
        const holder = arms.near.grip ? 'near' : 'far';
        const other = holder === 'near' ? 'far' : 'near';
        arms[holder] = { ...arms[holder], hand: g.hand, grip: g.at, mir: g.mir };
        if (g.single) { if (arms[other].grip) arms[other] = hangArm(other, view); prop.hold = holder; }
        else if (arms[other].grip) arms[other] = { ...arms[other], hand: g.hand, grip: g.at2, mir: view === 'front' ? g.mir2Front : g.mir2 };
        else prop.hold = holder;
      }
    } else if ((S.pose === 'stand' || S.pose === 'sit') && STAND_HOLDS[S.prop]) {
      const h = STAND_HOLDS[S.prop];
      prop = { ...h.prop };
      if (view === 'front') prop.at = h.frontAt;
      if (S.pose === 'sit') prop.at = [prop.at[0] + (view === 'front' ? 0 : 30), prop.at[1] + 10];
      arms.near = { ...h.near, ...(view === 'front' ? h.frontNear || {} : {}) };
      if (h.far) arms.far = { ...h.far, ...(view === 'front' ? h.frontFar || {} : {}) };
      if (h.look) { headDef.tilt = (headDef.tilt || 0) + 11; headDef.look = view === 'front' ? [-0.3, 1] : [0.6, 1]; }
    } else {
      const free = base.free || (!arms.near.grip && arms.near.hand === 'relax' ? 'near' : !arms.far.grip && arms.far.hand === 'relax' ? 'far' : 'near');
      const hp = HAND_PROPS[S.prop] || HAND_PROPS.receipts;
      const ov = hp.arm ? hp.arm(free, view, arms[free]) : {};
      handProp = { name: S.prop, side: free, ...hp, mirEff: view === 'front' && free === 'far' && hp.mirFront ? hp.mirFront : hp.mir };
      arms[free] = { ...arms[free], ...ov, hand: hp.hand, grip: null };
    }
  }

  // ---- motion: pose gesture + layered idle (breathing, weight shifts, head, eyes, blinks) ----
  const A = base.anim ? base.anim(t, ph, view, ns) || {} : {};
  const idle = (base.idle ?? 1) * (A.idle ?? 1);
  const breath = Math.sin(TAU * (t / 4.3 + ph) + 0.5 * Math.sin(t * 0.41 + ph * 6));
  const shift = holdNoise(t, ns + 1, 4.3, 0.42) * idle;
  const nod = holdNoise(t, ns + 2, 3.1, 0.36) * idle;
  const turnN = holdNoise(t, ns + 5, 3.7, 0.3) * idle;
  const lookN = holdNoise(t, ns + 4, 2.3, 0.16);
  const lookV = holdNoise(t, ns + 6, 2.9, 0.2);
  const blink = blinkAt(t, ns);
  const body = { dx: shift * 3 + (A.dx || 0), dy: -1.5 * (breath + 1) + (A.dy || 0), lean: (base.lean || 0) + (A.lean || 0) + shift * 0.55 };
  if (S.age === 'senior') body.lean += 2.5;
  const sit = !!base.sit;
  const walk = !!base.walk;
  let wk = null;
  if (walk) {
    const p = (((t / 1.1) + ph) % 1 + 1) % 1;
    wk = { p, ph: p * TAU };
    body.dy += 4.4 * Math.cos(4 * Math.PI * (p - 0.08)) - 3; // two bobs a cycle: low after each heel strike
    body.lean += 3;
    if (view === 'front') body.dx += 3.5 * Math.sin(TAU * (p - 0.1));
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

  // ---- head (before the arms: a hand may rest on the chin) ----
  const ht = (A.headTurn || 0) + turnN * 0.14;
  const turn = view === 'side' ? 1 - Math.abs(ht) * 0.25 : clamp(ht, -0.3, 0.3);
  const tilt = ((headDef.tilt || 0) + (A.headTilt || 0) + nod * 2.2 + (S.age === 'senior' ? 3 : 0) + (S.mood === 'proud' ? -5 : 0)) * DEG;
  const neckTop = T(view === 'side' ? 4 : 0, -866);
  const headRot = lean + tilt;
  const headC = add(neckTop, rot({ x: view === 'side' ? 6 : 0, y: -62 }, headRot));
  const lk = A.look || headDef.look || [0, 0];
  const lookHold = A.lookHold ?? base.lookHold ?? 1;
  const look = { x: lk[0] + lookN * 0.45 * lookHold, y: lk[1] + lookV * 0.25 * lookHold };
  const HS = 1.05; // head scale
  const chinAt = (dx, dy) => add(headC, rot({ x: dx * HS, y: dy * HS }, headRot));

  // ---- prop placement (torso-relative) ----
  let P = null;
  if (prop) {
    const at = T(prop.at[0] + (A.prop?.[0] || 0), prop.at[1] + (A.prop?.[1] || 0));
    const d = propDims(prop.name, prop.size);
    P = { name: prop.name, x: at.x, y: at.y, ang: ((prop.ang || 0) + (A.propAng || 0) + body.lean) * DEG, size: prop.size, w: d.w, h: d.h, hold: prop.hold, hidden: !!prop.hidden };
  }

  // ---- arms ----
  const armOut = {};
  for (const side of ['near', 'far']) {
    const a = arms[side];
    const Sp = T(SH[side][0], SH[side][1] + shoulderLift);
    let W, ang, mir, hand = a.hand || 'relax', pw = 0, phh = 0;
    if (a.grip && P) {
      const hf = handFromProp(P, hand, [a.grip[0] * P.w, a.grip[1] * P.h], a.mir ?? -1, P.w, P.h, HK);
      W = hf.W; ang = hf.ang; mir = a.mir ?? -1; pw = P.w; phh = P.h;
      if (P.hidden) hand = hand === 'support' ? 'present' : hand === 'phone' ? 'pinch' : 'fist';
    } else {
      const tt = a.t || (a.chin ? [0, -900] : hangArm(side, view).t);
      let tx = tt[0], ty = tt[1];
      if (woman) tx *= 0.94;
      ang = ((a.ang ?? 90) + body.lean + (A[side + 'Ang'] || 0)) * DEG;
      if (walk && view === 'side') {
        // arms swing opposite the legs; forward swing bends the elbow; the hand trails the forearm
        const sw = -Math.cos(TAU * (wk.p - 0.03)) * (side === 'near' ? 1 : -1);
        const swl = -Math.cos(TAU * (wk.p - 0.12)) * (side === 'near' ? 1 : -1);
        tx += 62 * sw;
        ty -= 20 * Math.max(0, sw) ** 1.5 + 6 * Math.abs(sw);
        ang += (-16 * swl) * DEG;
      }
      if (walk && view === 'front') {
        const sw = Math.sin(TAU * (wk.p - 0.03)) * (side === 'near' ? 1 : -1);
        ty -= 12 * Math.max(0, sw); tx += (side === 'near' ? 1 : -1) * 6 * Math.max(0, sw);
      }
      if (a.chin) W = chinAt(a.chin[0], a.chin[1]);
      else if (a.under && armOut[a.under[0]]) W = add(armOut[a.under[0]].E, { x: a.under[1], y: a.under[2] });
      else W = T(tx, ty);
      const th = a.thumb ? { x: a.thumb[0], y: a.thumb[1] } : { x: 1, y: 0 };
      // local +y in world = (-sin, cos); flip the hand if that points away from the requested thumb side
      mir = a.mir ?? ((-Math.sin(ang) * th.x + Math.cos(ang) * th.y) < 0 ? -1 : 1);
    }
    const ao = A[side];
    if (ao && !(a.grip && P)) W = add(W, { x: ao[0], y: ao[1] });
    const k1 = a.len ? a.len[0] : 1, k2 = a.len ? a.len[1] : 1;
    const s1 = ik(Sp, W, L1 * k1, L2 * k2, 1), s2 = ik(Sp, W, L1 * k1, L2 * k2, -1);
    const pref = a.pref ? { x: a.pref[0], y: a.pref[1] } : view === 'side' ? { x: -0.35, y: 1 } : { x: side === 'near' ? -0.5 : 0.5, y: 1 };
    const m = { x: (Sp.x + W.x) / 2, y: (Sp.y + W.y) / 2 };
    const d1 = (s1.elbow.x - m.x) * pref.x + (s1.elbow.y - m.y) * pref.y;
    const d2 = (s2.elbow.x - m.x) * pref.x + (s2.elbow.y - m.y) * pref.y;
    const sol = d1 >= d2 ? s1 : s2;
    // a short reach leaves the hand where it was asked to be (the wrist bends rather than detaching)
    armOut[side] = { S: Sp, E: sol.elbow, W: sol.wrist, ang, mir, hand, pw, ph: phh, k: HK, z: a.z || (side === 'near' ? 'front' : 'back') };
  }
  // in the front view both arms are on the outside of the torso; nothing hides behind it
  if (view === 'front') for (const side of ['near', 'far']) { if (armOut[side].z === 'back') armOut[side].z = 'front'; else if (armOut[side].z === 'reach') armOut[side].z = 'mid'; }

  if (handProp) {
    const a = armOut[handProp.side];
    const d = propDims(handProp.name, handProp.size);
    const flipAt = view === 'front' && handProp.side === 'far' && handProp.mirFront;
    const anchor = [(flipAt ? -handProp.at[0] : handProp.at[0]) * d.w, handProp.at[1] * d.h];
    a.mir = handProp.hang ? a.mir : handProp.mirEff;
    if (handProp.pAng != null && !handProp.hang) a.ang = ((handProp.pAng || 0) - 90 - a.mir * GRIPS[handProp.hand].up) * DEG + lean * 0.5;
    let q = propFromHand(a.W, a.ang, a.mir, handProp.hand, anchor, d.w, d.h, HK);
    if (handProp.hang) {
      // a bag hangs plumb from the fist with a little lagging swing
      const ct = add(a.W, rotv({ x: BAG_GRIP.x * HK, y: BAG_GRIP.y * a.mir * HK }, a.ang));
      const pa = (Math.sin(t * 2.3 + ph * 5) * 2.5 + (walk ? -Math.cos(TAU * (wk.p - 0.18)) * 5 * (handProp.side === 'near' ? 1 : -1) : 0)) * DEG;
      const an = rotv({ x: anchor[0], y: anchor[1] }, pa);
      q = { x: ct.x - an.x, y: ct.y - an.y, ang: pa };
    }
    a.pw = d.w; a.ph = d.h;
    P = { name: handProp.name, x: q.x, y: q.y, ang: q.ang, size: handProp.size, w: d.w, h: d.h, hold: handProp.side, hanging: true };
  }

  return {
    view, turn, T, body, sit, walk, wk, t, ph, ns,
    arms: armOut, prop: P,
    head: { c: headC, rot: headRot, neckTop, look, blink, thumbTap: A.thumbTap || 0 },
  };
}

function hangArm(side, view) {
  if (view === 'front') return side === 'near' ? { t: [-100, -474], hand: 'relax', ang: 94, thumb: [1, 0], z: 'front' } : { t: [100, -474], hand: 'relax', ang: 86, thumb: [-1, 0], z: 'front' };
  return side === 'near' ? { t: [-70, -474], hand: 'relax', ang: 92, thumb: [1, 0], z: 'front' } : { t: [64, -474], hand: 'relax', ang: 88, thumb: [1, 0], z: 'back' };
}

// ---------- hands ----------
function lightFor(flip) { return { x: flip ? -LIGHT.x : LIGHT.x, y: LIGHT.y }; }

function drawHand(c, arm, skin, L, layer, tap = 0) {
  const shp = handShape(arm.hand, arm.pw, arm.ph, arm.hand === 'phone' ? tap : 0);
  const parts = layer === 'back' ? shp.back : shp.front;
  if (!parts.length) return;
  c.save();
  c.translate(arm.W.x, arm.W.y);
  c.rotate(arm.ang);
  c.scale(arm.k, arm.k * arm.mir);
  const ca = Math.cos(-arm.ang), sa = Math.sin(-arm.ang);
  const ll = { x: L.x * ca - L.y * sa, y: (L.x * sa + L.y * ca) * arm.mir };
  drawHandParts(c, parts, skin, ll, palmTone(skin));
  c.restore();
}

// ---------- arms: one sleeve outline with a real elbow ----------
function sleeveRadii(S) { return S.outfit === 'casual' ? CASUAL_SLEEVE[S.gender] : DIMS[S.gender].sleeve; }

function sleeveFabric(S, front) {
  // Sleeves in front of an abaya get a touch more light so arms stay readable over the dark robe.
  if (front && S.outfit === 'abaya') { const f = S.robe; return { ...f, base: mix(f.base, f.hi, 0.3), shade: mix(f.shade, f.base, 0.2) }; }
  return S.robe;
}

function lineHit(p1, d1, p2, d2) {
  const den = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(den) < 1e-6) return null;
  const tt = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / den;
  const uu = ((p2.x - p1.x) * d1.y - (p2.y - p1.y) * d1.x) / den;
  return { x: p1.x + d1.x * tt, y: p1.y + d1.y * tt, t: tt, u: uu };
}

/**
 * Geometry of a sleeved arm: a single outline from the shoulder round a defined elbow corner to the
 * cuff, back along the inside through the elbow crease. Strongly folded arms are drawn as an upper
 * arm with the forearm lying over it.
 */
function armGeom(arm, rr) {
  if (arm.geom) return arm.geom;
  const s = arm.S, e = arm.E, w = arm.W;
  const l1 = len(sub(e, s)) || 1, l2 = len(sub(w, e)) || 1;
  const u1 = scl(sub(e, s), 1 / l1), u2 = scl(sub(w, e), 1 / l2);
  const pu1 = { x: -u1.y, y: u1.x }, pu2 = { x: -u2.y, y: u2.x };
  const turnS = pu1.x * u2.x + pu1.y * u2.y; // >0: the forearm turns towards +perp
  const bend = Math.acos(clamp(u1.x * u2.x + u1.y * u2.y, -1, 1));
  const sIn = turnS >= 0 ? 1 : -1;
  const o1 = scl(pu1, -sIn), o2 = scl(pu2, -sIn); // outer normals (away from the bend)
  const [r0, r1, r2] = rr;
  const g = { u1, u2, o1, o2, bend, l1, l2, r: rr };
  const cuffO = add(w, scl(o2, r2)), cuffI = add(w, scl(o2, -r2));
  if (bend < 1.95) {
    const A0 = add(s, scl(o1, r0)), A1 = add(s, scl(o1, -r0));
    let X = lineHit(A0, u1, add(e, scl(o2, r1)), u2);
    if (!X || bend < 0.06 || X.t < 0 || X.u > l2) X = add(e, scl(add(o1, o2), r1 * 0.5));
    let Y = lineHit(A1, u1, add(e, scl(o2, -r1)), u2);
    if (!Y || bend < 0.06) Y = add(e, scl(add(o1, o2), -r1 * 0.5));
    else {
      // keep the crease on both segments
      const tt = clamp(Y.t, l1 * 0.35, l1 + r1 * 0.2), uu = clamp(Y.u, -r1 * 0.2, l2 * 0.6);
      Y = Y.t !== tt || Y.u !== uu ? mid(add(A1, scl(u1, tt)), add(add(e, scl(o2, -r1)), scl(u2, uu))) : Y;
    }
    const bn = clamp(bend / 1.6);
    const rc = Math.min(r1 * lerp(1.2, 0.5, bn), len(sub(X, A0)) * 0.6, len(sub(cuffO, X)) * 0.5);
    const B = sub(X, scl(u1, rc)), C = add(X, scl(u2, rc));
    const p = new Path2D();
    p.moveTo(A0.x, A0.y);
    p.lineTo(B.x, B.y);
    p.quadraticCurveTo(X.x, X.y, C.x, C.y);
    p.lineTo(cuffO.x, cuffO.y);
    p.lineTo(cuffI.x, cuffI.y);
    p.lineTo(Y.x, Y.y);
    p.lineTo(A1.x, A1.y);
    const k = r0 * 1.33;
    p.bezierCurveTo(A1.x - u1.x * k, A1.y - u1.y * k, A0.x - u1.x * k, A0.y - u1.y * k, A0.x, A0.y);
    p.closePath();
    Object.assign(g, { path: p, X, Y, A0, A1, folded: false });
  } else {
    // folded: upper arm, then the forearm lying across it; the elbow point continues the upper arm
    const up = new Path2D();
    tube(up, s, e, r0, r1);
    const td = norm(sub(u1, u2));
    const tip = add(e, scl(td, r1 * 1.06));
    const fo = new Path2D();
    const a1 = add(add(e, scl(o2, r1)), scl(u2, r1 * 0.55));
    const b1 = add(add(e, scl(o2, -r1)), scl(u2, r1 * 0.35));
    const back = sub(e, scl(u2, r1 * 1.15));
    fo.moveTo(a1.x, a1.y);
    fo.lineTo(cuffO.x, cuffO.y);
    fo.lineTo(cuffI.x, cuffI.y);
    fo.lineTo(b1.x, b1.y);
    fo.quadraticCurveTo(back.x - o2.x * r1 * 0.2, back.y - o2.y * r1 * 0.2, mid(back, tip).x, mid(back, tip).y);
    fo.quadraticCurveTo(tip.x, tip.y, mid(tip, a1).x, mid(tip, a1).y);
    fo.quadraticCurveTo(a1.x + o2.x * r1 * 0.1, a1.y + o2.y * r1 * 0.1, a1.x, a1.y);
    fo.closePath();
    const all = new Path2D(); all.addPath(up); all.addPath(fo);
    Object.assign(g, { up, fo, path: all, X: tip, Y: e, folded: true });
  }
  // loose sleeves hang below a raised or reaching forearm
  const dn = o2.y >= 0 ? o2 : scl(o2, -1);
  g.dn = dn;
  const pad = Math.max(r0, r1, r2) * 3 + 40;
  const xs = [s.x, e.x, w.x], ys = [s.y, e.y, w.y];
  g.box = { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 };
  arm.geom = g;
  return g;
}
const boxRect = (q, b) => { q.rect(b.x, b.y, b.w, b.h); return q; };

// tapered fold strip from a to b (width w0 → w1), appended to path p
function foldStrip(p, a, b, w0, w1, bow = 0) {
  const d = sub(b, a), L0 = len(d) || 1, n = { x: -d.y / L0, y: d.x / L0 };
  const m = add(mid(a, b), scl(n, bow));
  p.moveTo(a.x + n.x * w0 / 2, a.y + n.y * w0 / 2);
  p.quadraticCurveTo(m.x + n.x * w1 * 0.4, m.y + n.y * w1 * 0.4, b.x + n.x * w1 / 2, b.y + n.y * w1 / 2);
  p.lineTo(b.x - n.x * w1 / 2, b.y - n.y * w1 / 2);
  p.quadraticCurveTo(m.x - n.x * w1 * 0.4, m.y - n.y * w1 * 0.4, a.x - n.x * w0 / 2, a.y - n.y * w0 / 2);
  p.closePath();
  return p;
}

function shadeArmPath(c, p, f, arm, L, fadeShoulder = true) {
  c.fillStyle = f.base;
  c.fill(p);
  c.save();
  c.clip(p);
  const crescent = (dx, dy, col) => {
    const q = new Path2D();
    boxRect(q, arm.geom.box);
    q.addPath(p, new DOMMatrix().translateSelf(dx, dy));
    if (fadeShoulder) {
      // form shading fades out towards the shoulder so the sleeve cap melts into the robe
      const a = arm.S, b = mid(arm.S, arm.E, 0.6);
      const gr = c.createLinearGradient(a.x, a.y, b.x, b.y);
      gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(0.45, rgba(col, 0)); gr.addColorStop(1, rgba(col, 1));
      c.fillStyle = gr;
    } else c.fillStyle = col;
    c.fill(q, 'evenodd');
  };
  crescent(L.x * 9, L.y * 9, f.shade);
  c.restore();
}

/**
 * Draw a sleeved arm. opts.front: in front of the torso (lighter abaya sleeve, edge line, cast
 * shadow). opts.clip: 'outer' redraws only the part away from the shoulder (pass 2, over the
 * head and scarf), 'fore' only the forearm side of the elbow (an arm reaching from behind).
 */
function drawArm(c, S, arm, L, opts = {}) {
  const rr = sleeveRadii(S);
  const g = armGeom(arm, rr);
  const f = sleeveFabric(S, opts.front);
  const abaya = S.outfit === 'abaya';
  c.save();
  if (opts.clip === 'outer') {
    const q = new Path2D();
    boxRect(q, g.box);
    q.arc(arm.S.x, arm.S.y, rr[0] * 2.3, 0, TAU);
    c.clip(q, 'evenodd');
  } else if (opts.clip === 'fore') {
    // half-plane beyond a line through the elbow, square to the upper arm
    const n = g.u1, e = arm.E;
    const back = sub(e, scl(n, rr[1] * 0.4));
    const t1 = { x: -n.y, y: n.x };
    const q = new Path2D();
    const D = 1200;
    q.moveTo(back.x + t1.x * D, back.y + t1.y * D);
    q.lineTo(back.x + t1.x * D + n.x * D, back.y + t1.y * D + n.y * D);
    q.lineTo(back.x - t1.x * D + n.x * D, back.y - t1.y * D + n.y * D);
    q.lineTo(back.x - t1.x * D, back.y - t1.y * D);
    q.closePath();
    c.clip(q);
  }
  if (opts.castOn) {
    // the arm's shadow on the body behind it
    c.save();
    c.clip(opts.castOn);
    const sx = new Path2D(); // not round the shoulder: the sleeve cap grows out of the robe there
    boxRect(sx, g.box);
    sx.arc(arm.S.x, arm.S.y, rr[0] * 2.4, 0, TAU);
    c.clip(sx, 'evenodd');
    c.translate(-L.x * 10, -L.y * 10 + 2);
    c.fillStyle = abaya ? rgba('#000000', 0.32) : rgba(S.robe.deep, S.outfit === 'casual' ? 0.45 : 0.55);
    c.fill(g.path);
    c.restore();
  }
  if (S.outfit !== 'casual') drawSleeveSag(c, S, arm, g, f, rr);
  if (g.folded) {
    shadeArmPath(c, g.up, f, arm, L);
    // the forearm's shadow on the upper arm
    c.save(); c.clip(g.up); c.translate(-L.x * 6, -L.y * 6); c.fillStyle = rgba(f.deep, 0.6); c.fill(g.fo); c.restore();
    shadeArmPath(c, g.fo, f, arm, L, false);
    if (opts.front) { c.strokeStyle = rgba(S.robe.deep, abaya ? 0.9 : 0.35); c.lineWidth = 2; c.stroke(g.fo); }
  } else {
    shadeArmPath(c, g.path, f, arm, L);
    if (opts.front) {
      // thin same-hue edge, but not round the shoulder cap (it would read as a shoulder pad)
      c.save();
      const ex = new Path2D();
      boxRect(ex, g.box);
      ex.arc(arm.S.x, arm.S.y, rr[0] * 1.9, 0, TAU);
      c.clip(ex, 'evenodd');
      c.strokeStyle = rgba(S.robe.deep, abaya ? 0.9 : 0.35); c.lineWidth = 2; c.stroke(g.path);
      c.restore();
    }
  }
  drawSleeveDetail(c, S, arm, g, f, rr, abaya);
  c.restore();
}

function drawSleeveSag(c, S, arm, g, f, rr) {
  const h = Math.abs(g.u2.x); // how horizontal the forearm is
  const sag = (S.outfit === 'abaya' ? 0.7 : 0.32) * h * rr[2];
  if (sag < 2 || g.l2 < 60) return;
  const e = arm.E, w = arm.W, dn = g.dn, u2 = g.u2;
  const A = add(add(e, scl(dn, rr[1] * 0.9)), scl(u2, rr[1] * 0.4));
  const B = sub(add(w, scl(dn, rr[2] * 1.02)), scl(u2, 3));
  const M = add(mid(e, w, 0.66), scl(dn, (rr[1] + rr[2]) / 2 + sag * 1.6));
  const p = new Path2D();
  p.moveTo(A.x, A.y);
  p.quadraticCurveTo(M.x, M.y, B.x, B.y);
  p.lineTo(w.x, w.y);
  p.lineTo(e.x, e.y);
  p.closePath();
  c.fillStyle = mix(f.shade, f.deep, 0.35);
  c.fill(p);
}

function drawSleeveDetail(c, S, arm, g, f, rr, abaya) {
  const { u1, u2, o1, o2, bend } = g;
  const e = arm.E, w = arm.W;
  const foldCol = abaya ? rgba(f.hi, 0.32) : rgba(f.deep, S.outfit === 'casual' ? 0.75 : 0.8);
  const folds = new Path2D();
  const bn = clamp(bend / 1.4);
  if (!g.folded) {
    if (bend > 0.22) {
      // creases radiating from the inside of the elbow
      const Y = g.Y;
      foldStrip(folds, add(Y, scl(u2, 2)), add(add(e, scl(u2, rr[1] * (1.1 + bn * 0.5))), scl(o2, rr[1] * 0.35)), 3.2 * bn + 1, 0.6, 2);
      foldStrip(folds, sub(Y, scl(u1, 2)), add(sub(e, scl(u1, rr[1] * (0.9 + bn * 0.5))), scl(o1, rr[1] * 0.3)), 2.8 * bn + 1, 0.6, -2);
      if (bend > 0.7) foldStrip(folds, add(Y, scl(u2, rr[1] * 0.5)), add(add(e, scl(u2, rr[1] * 1.9)), scl(o2, -rr[1] * 0.1)), 2.2, 0.5, 1);
    } else {
      // a nearly straight sleeve: fabric breaks softly across the elbow
      const a = add(sub(e, scl(u1, rr[1] * 0.4)), scl(o1, -rr[1] * 0.95));
      const b = add(add(e, scl(u2, rr[1] * 0.9)), scl(o2, rr[1] * 0.4));
      foldStrip(folds, a, b, 2.6, 0.6, 3);
    }
    // a long drape line down the forearm of a loose sleeve
    if (S.outfit !== 'casual' && g.l2 > 90) {
      const a = add(add(e, scl(u2, g.l2 * 0.3)), scl(o2, rr[1] * 0.55));
      const b = add(sub(w, scl(u2, 16)), scl(o2, -rr[2] * 0.35));
      foldStrip(folds, a, b, 0.6, 2.4, 2);
    }
  } else {
    const a = add(e, scl(u2, rr[1] * 1.1)), b = add(add(e, scl(u2, rr[1] * 2.4)), scl(o2, -rr[1] * 0.4));
    foldStrip(folds, a, b, 2.4, 0.6, 1);
  }
  c.save();
  c.clip(g.path);
  c.fillStyle = foldCol;
  c.fill(folds);
  // cuff: hem line and (dishdasha / abaya) a fine embroidered band
  const n = { x: -u2.y, y: u2.x };
  const cuff = abaya ? 15 : S.outfit === 'casual' ? 10 : 11;
  const cw = rr[2] + 2;
  const a = sub(w, scl(u2, cuff));
  c.strokeStyle = f.deep;
  c.lineWidth = 2.4;
  c.beginPath(); c.moveTo(a.x + n.x * cw, a.y + n.y * cw); c.lineTo(a.x - n.x * cw, a.y - n.y * cw); c.stroke();
  if (S.outfit !== 'casual') {
    c.strokeStyle = abaya ? S.accent : mix(S.robe.deep, S.accent, 0.35);
    c.lineWidth = abaya ? 3 : 1.6;
    const b = sub(w, scl(u2, cuff - 5));
    c.beginPath(); c.moveTo(b.x + n.x * cw, b.y + n.y * cw); c.lineTo(b.x - n.x * cw, b.y - n.y * cw); c.stroke();
  }
  // the opening: a sliver of the sleeve's lining at the cuff edge
  c.strokeStyle = abaya ? rgba('#000000', 0.55) : rgba(f.deep, 0.9);
  c.lineWidth = abaya ? 4 : 2.6;
  c.beginPath(); c.moveTo(w.x + n.x * cw, w.y + n.y * cw); c.lineTo(w.x - n.x * cw, w.y - n.y * cw); c.stroke();
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

// ---------- feet layout ----------
// Side view: foot origins (ankle at the sole) with angle. x matches the robe code's foot reference.
function feetLayout(R) {
  if (R.view === 'front') return null;
  if (R.walk) {
    const mk = (q) => { const f = walkFoot(q); return { ox: f.x - 10, oy: f.y, ang: f.ang, x: f.x + 6, lift: -f.y, swing: f.swing }; };
    return { near: mk(R.wk.p), far: mk(R.wk.p + 0.5) };
  }
  return { near: { ox: -34, oy: 0, ang: 0, x: -18, lift: 0 }, far: { ox: 16, oy: 0, ang: 0, x: 32, lift: 0 } };
}

function legIK(hip, ank, side) {
  if (!side) return add(mid(hip, ank), { x: Math.sign(hip.x) * 3, y: 0 }); // front view: the knee bends towards the viewer
  const a = ik(hip, ank, 236, 226, 1), b = ik(hip, ank, 236, 226, -1);
  return a.elbow.x > b.elbow.x ? a.elbow : b.elbow; // knees point the way the person faces
}

// ---------- held props ----------
function drawHeld(c, R, S, flip) {
  const P = R.prop;
  if (!P || P.hidden) return;
  c.save();
  c.translate(P.x, P.y);
  c.rotate(P.ang);
  if (flip) c.scale(-1, 1); // keep printed marks (999.9) readable when the figure is mirrored
  drawPropShape(c, P.name, -P.w / 2, -P.h / 2, P.w, P.h, { held: true, flip, theme: S.theme, accent: S.accent, glow: false }, R.t);
  c.restore();
}

// ---------- effects ----------
function drawFx(c, R, S) {
  // Only the sweat drop remains (sparkles are retired by the brand); it is small, translucent and slow.
  if (S.fx !== 'sweat') return;
  const t = R.t;
  const h = R.head;
  c.save();
  c.translate(h.c.x, h.c.y);
  c.rotate(h.rot);
  const k = ((t * 0.32 + R.ph) % 1);
  const y = -26 + smooth(k) * 14, a = k < 0.15 ? k / 0.15 : k < 0.75 ? 1 : (1 - k) / 0.25;
  c.globalAlpha *= a * 0.85;
  c.translate(R.view === 'side' ? 40 : -34, y - 6);
  c.scale(0.62, 0.62);
  c.fillStyle = '#EAF2F4';
  c.beginPath(); c.moveTo(0, -16); c.bezierCurveTo(6, -6, 10, 0, 10, 5); c.arc(0, 5, 10, 0, Math.PI); c.bezierCurveTo(-10, 0, -6, -6, 0, -16); c.fill();
  c.fillStyle = rgba('#9FC3D3', 0.7);
  c.beginPath(); c.arc(2.5, 6, 4.5, 0, Math.PI * 2); c.fill();
  c.restore();
}

// ---------- main ----------
export function drawFigure(c, S, R, flip) {
  const L = lightFor(flip);
  const D = DIMS[S.gender];
  const skin = SKIN[S.skin];
  const woman = S.gender === 'woman';
  const casual = S.outfit === 'casual';
  const side = R.view === 'side';
  const feet = feetLayout(R);
  const hemY = casual && !woman ? -470 : D.hemY;

  // ground shadow
  groundShadow(c, R.sit ? -20 : 8, 0, R.sit ? 220 : 170, 24, 0.24, '#1A120B');
  if (R.sit) drawSeat(c, R, S, L);

  const arms = R.arms;
  const order = ['far', 'near'];
  const holdsAlone = (s) => R.prop && R.prop.hold === s;
  const tapOf = (s) => (s === 'near' ? R.head.thumbTap : 0);

  // 1. arms behind the torso (whole arm), and the reaching arm's upper half
  for (const s of order) {
    const a = arms[s];
    if (a.z === 'reach') { drawArm(c, S, a, L); continue; }
    if (a.z !== 'back') continue;
    drawHand(c, a, skin, L, 'back');
    drawArm(c, S, a, L);
    if (holdsAlone(s)) drawHeld(c, R, S, flip);
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
    for (const nm of ['far', 'near']) {
      const f = feet[nm];
      if (casual && !woman) {
        const hip = R.T(nm === 'near' ? -22 : 24, -500);
        const ank = add({ x: f.ox, y: f.oy }, rot({ x: 12, y: -40 }, f.ang));
        legTube(c, hip, legIK(hip, ank, true), ank, S, L, rLeg);
      }
      footSide(c, f.ox, f.oy + (nm === 'near' ? 2 : -2), f.ang, S, L);
    }
  } else {
    // front view: the swing foot lifts and tucks in a little under the body; the hip over it drops
    const lift = R.walk ? (s) => 24 * Math.max(0, Math.sin(R.wk.ph + (s > 0 ? Math.PI : 0))) ** 1.2 : () => 0;
    for (const sd of [-1, 1]) {
      const tuck = -sd * lift(sd) * 0.22;
      if (casual && !woman) {
        const hip = add(R.T(sd * 40, -500), { x: 0, y: lift(sd) * 0.18 }), ank = { x: sd * 44 + tuck, y: -40 - lift(sd) };
        legTube(c, hip, legIK(hip, ank, false), ank, S, L, rLeg);
      }
      footFront(c, sd * 34 + tuck, -lift(sd), sd, S, L);
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
    c.save(); c.clip(np); c.fillStyle = skin.shade;
    c.beginPath(); c.ellipse(H.c.x + (side ? 10 : 0), H.c.y + 64, 46, 22, H.rot, 0, TAU); c.fill(); c.restore();
  }

  // 4. robe / clothing body
  const bodyPath = drawClothes(c, R, S, D, L, feet, hemY);

  // 5. arms in front of the torso. An arm (and hand) clear of the head and scarf is drawn complete
  // here; one that reaches over them gets a first pass now and its outer part again after the head.
  const H0 = R.head;
  const nearHead = (a) => {
    const rr = sleeveRadii(S);
    const hx = H0.c.x, hy = H0.c.y + (woman ? 40 : 10), hr = woman ? 150 : 120;
    const hit = (q, r) => Math.hypot(q.x - hx, q.y - hy) < hr + r;
    const hw = add(a.W, rot({ x: 44 * a.k, y: 0 }, a.ang));
    return hit(a.E, rr[1]) || hit(a.W, rr[2] + 10) || hit(hw, 40) || hit(mid(a.E, a.W), rr[1]);
  };
  for (const s of order) {
    const a = arms[s];
    if (a.z === 'back' || a.z === 'reach') continue;
    a.twoPass = nearHead(a);
    if (!a.twoPass) drawHand(c, a, skin, L, 'back', tapOf(s));
    drawArm(c, S, a, L, { front: true, castOn: bodyPath });
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

  // 7. hands and forearms over the head (second pass), the held prop between the hand layers
  const fronts = order.filter((s) => arms[s].z !== 'back');
  for (const s of fronts) {
    const a = arms[s];
    if (a.z !== 'reach' && !a.twoPass) continue;
    drawHand(c, a, skin, L, 'back', tapOf(s));
    drawArm(c, S, a, L, { front: true, clip: a.z === 'reach' ? 'fore' : 'outer' });
  }
  const backOnly = R.prop && ((R.prop.hold === 'far' && arms.far.z === 'back') || (R.prop.hold === 'near' && arms.near.z === 'back'));
  if (R.prop && !backOnly) drawHeld(c, R, S, flip);
  for (const s of fronts) drawHand(c, arms[s], skin, L, 'front', tapOf(s));

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
    return tun;
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
    return shirt;
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
  return body;
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
