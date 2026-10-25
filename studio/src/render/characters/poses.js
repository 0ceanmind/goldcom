// Pose library. Coordinates are model units (standing height 1000, feet at y = 0, y up is negative),
// authored for a 3/4 view facing right (+x = the way the person faces). `front` overrides the
// arm targets for the front view. Targets are torso-relative so they ride along with breathing/lean.
//
// arm: { t:[x,y] wrist target | chin:[dx,dy] wrist relative to the head centre | grip:[u,v] the hand
//        holds the pose's prop at that point (prop-normalised, −0.5…0.5) with hand kind `hand`,
//        hand, ang (deg, 0 = facing direction, 90 = down), mir (±1) or thumb:[x,y] (thumb side),
//        z: 'back'|'reach'|'mid'|'front', pref:[x,y] elbow direction, len:[upper, fore] foreshortening }
// prop: { name, at:[x,y], ang (deg), size (model units, longest side), hold }
// anim(t, ph, view, ns): gesture layer on top of the rig's idle motion. Gestures are irregular
// events with eased in/out and holds (no metronome loops); the hand trails the forearm slightly.
import { TAU, lerp, smooth, easeInOut, holdNoise, events, hash } from './util.js';

const hang = (x) => ({ t: [x, -474], hand: 'relax', ang: 92, thumb: [1, 0] });
const hangFront = { near: { t: [-100, -474], hand: 'relax', ang: 94, thumb: [1, 0] }, far: { t: [100, -474], hand: 'relax', ang: 86, thumb: [-1, 0] } };

/** 0 → 1 (ease a s) → hold h s → 0 (ease b s). */
function pulse(age, a, h, b) {
  if (age < 0) return 0;
  if (age < a) return easeInOut(age / a);
  if (age < a + h) return 1;
  if (age < a + h + b) return 1 - easeInOut((age - a - h) / b);
  return 0;
}
/** A quick gesture: anticipation dip, fast rise with a little overshoot, settle, hold, ease back. */
function snap(age, hold = 0.5) {
  if (age < 0) return 0;
  if (age < 0.1) return -0.18 * Math.sin((age / 0.1) * Math.PI / 2);
  if (age < 0.24) return lerp(-0.18, 1.12, easeInOut((age - 0.1) / 0.14));
  if (age < 0.4) return lerp(1.12, 1, smooth((age - 0.24) / 0.16));
  if (age < 0.4 + hold) return 1;
  return Math.max(0, 1 - easeInOut((age - 0.4 - hold) / 0.45));
}

export const POSES = {
  stand: {
    label: 'Standing, relaxed, arms at the sides',
    mood: 'neutral',
    arms: { near: { ...hang(-70), z: 'front' }, far: { ...hang(64), z: 'back', ang: 88 } },
    front: { arms: hangFront },
  },

  phone: {
    label: 'Looking down at a phone held at chest height (one hand), thumb scrolling',
    mood: 'neutral',
    idle: 0.6,
    lookHold: 0.25,
    prop: { name: 'phone', at: [40, -704], ang: -10, size: 92, hold: 'near' },
    head: { tilt: 13, look: [0.6, 1] },
    arms: {
      near: { hand: 'phone', grip: [0, 0], mir: -1, z: 'front', pref: [-0.2, 1], len: [1, 0.62] },
      far: { ...hang(64), z: 'back', ang: 88 },
    },
    front: {
      prop: { at: [-12, -676], ang: 0 },
      head: { tilt: 10, look: [-0.3, 1] },
      arms: { near: { pref: [-0.6, 1], len: [0.95, 0.62] }, far: hangFront.far },
    },
    anim(t, ph, view, ns) {
      const sw = events(t, ns + 11, 0.9, 2.3, 0.35); // thumb swipes at irregular moments
      const g = events(t, ns + 12, 3.6, 6.4, 1.4); // now and then a glance up from the screen
      const glance = pulse(g.age, 0.32, 0.8 + hash(g.k + ns) * 0.9, 0.42);
      return {
        thumbTap: pulse(sw.age, 0.12, 0.06, 0.22),
        headTilt: -10 * glance, look: [0.6 * (1 - glance) + (view === 'front' ? -0.9 : 0), lerp(1, -0.6, glance)],
        prop: [holdNoise(t, ns + 13, 2.7) * 1.6, holdNoise(t, ns + 14, 3.2) * 1.4 - glance * 2], propAng: holdNoise(t, ns + 15, 3.6) * 2.2,
      };
    },
  },

  'phone-happy': {
    label: 'Smiling at good news on the phone, free hand in a small fist pump',
    mood: 'happy',
    idle: 0.7,
    lookHold: 0.3,
    prop: { name: 'phone', at: [44, -720], ang: -14, size: 92, hold: 'near' },
    head: { tilt: 9, look: [0.6, 0.8] },
    arms: {
      near: { hand: 'phone', grip: [0, 0], mir: -1, z: 'front', pref: [-0.2, 1], len: [1, 0.62] },
      far: { t: [100, -728], hand: 'fist', ang: -84, z: 'reach', pref: [0.3, 1], thumb: [-1, 0], len: [0.97, 0.72] },
    },
    front: {
      prop: { at: [-22, -704], ang: 0 },
      head: { tilt: 7, look: [-0.4, 0.8] },
      arms: { near: { pref: [-0.6, 1], len: [0.95, 0.62] }, far: { t: [86, -740], ang: -96, pref: [0.6, 1], z: 'front', len: [0.97, 0.72] } },
    },
    anim(t, ph, view, ns) {
      const e = events(t, ns + 21, 1.9, 3.3, 0.25);
      const p = snap(e.age, 0.35) + 0.55 * Math.max(0, snap(e.age - 0.42, 0.1));
      const pl = snap(e.age - 0.05, 0.35) + 0.55 * Math.max(0, snap(e.age - 0.47, 0.1)); // the hand trails the forearm
      return { dy: -3 * p, far: [0, -20 * p], farAng: -10 * pl, prop: [0, -1.5 * p], headTilt: -2.5 * pl };
    },
  },

  stressed: {
    label: 'Worried, holding a messy handful of receipts, head down',
    mood: 'worried',
    fx: 'sweat',
    idle: 0.6,
    lookHold: 0.4,
    prop: { name: 'receipts', at: [90, -636], ang: 4, size: 112, hold: 'both' },
    head: { tilt: 12, look: [0.6, 1] },
    lean: 2,
    arms: {
      near: { hand: 'pinch', grip: [-0.12, 0.36], mir: -1, z: 'front', pref: [-0.3, 1], len: [0.95, 0.7] },
      far: { hand: 'pinch', grip: [0.3, 0.12], mir: 1, z: 'reach', pref: [0.1, 1], len: [0.9, 0.62] },
    },
    front: {
      prop: { at: [0, -628], ang: 2 },
      head: { tilt: 9, look: [0, 1] },
      arms: { near: { pref: [-0.6, 1], len: [0.95, 0.6] }, far: { pref: [0.6, 1], len: [0.95, 0.6] } },
    },
    anim(t, ph, view, ns) {
      // nervous: papers shift in small jolts, small uneasy head movements
      const e = events(t, ns + 31, 0.8, 1.9, 0.2);
      const j = pulse(e.age, 0.08, 0.06, 0.3) * (hash(e.k * 1.7 + ns) * 2 - 1);
      return {
        prop: [j * 3, -Math.abs(j) * 2], propAng: j * 3,
        headTurn: holdNoise(t, ns + 32, 1.4, 0.5) * 0.12, headTilt: holdNoise(t, ns + 33, 2.1) * 1.8,
        look: [0.6 + holdNoise(t, ns + 34, 1.7, 0.2) * 0.3, 1],
      };
    },
  },

  thinking: {
    label: 'Thinking: hand at the chin, other arm across the waist, eyes up',
    mood: 'thinking',
    free: 'far',
    idle: 0.7,
    lookHold: 0.3,
    head: { tilt: -6, look: [0.6, -1] },
    arms: {
      near: { chin: [2, 112], hand: 'chin', ang: -80, z: 'front', pref: [0.12, 1], thumb: [1, 0], len: [0.84, 1] },
      far: { t: [40, -640], under: ['near', 44, 16], hand: 'present', ang: 184, z: 'mid', pref: [0.5, 1], thumb: [0, -1], len: [0.8, 0.86] },
    },
    front: {
      head: { tilt: -4, look: [0.5, -1] },
      arms: { near: { chin: [-8, 110], ang: -86, pref: [-0.2, 1], len: [0.8, 1] }, far: { t: [-40, -640], under: ['near', 44, 14], ang: 182, pref: [0.5, 1], thumb: [0, -1] } },
    },
    anim(t, ph, view, ns) {
      const e = events(t, ns + 41, 1.3, 2.8, 0.6);
      const tap = pulse(e.age, 0.1, 0.06, 0.2);
      return {
        near: [0, 2.5 * tap], nearAng: -2 * tap,
        headTilt: holdNoise(t, ns + 42, 3.4, 0.4) * 2.6,
        look: [0.6 + holdNoise(t, ns + 43, 2.2, 0.2) * 0.5, -1 + holdNoise(t, ns + 44, 3, 0.2) * 0.25],
      };
    },
  },

  celebrate: {
    label: 'Celebrating with both arms up, small bounce',
    mood: 'happy',
    idle: 0.5,
    head: { tilt: -8, look: [0.4, -0.4] },
    arms: {
      near: { t: [-112, -1000], hand: 'fist', ang: -100, z: 'front', pref: [-1, 0.2], thumb: [1, 0] },
      far: { t: [118, -1014], hand: 'fist', ang: -80, z: 'back', pref: [1, 0.2], thumb: [-1, 0] },
    },
    front: { arms: { near: { t: [-160, -990], ang: -104, pref: [-1, 0.1] }, far: { t: [160, -990], ang: -76, pref: [1, 0.1], z: 'front' } } },
    anim(t, ph, view, ns) {
      // bursts of two small hops with a squash before each, arms lagging the body; calm sway between
      const e = events(t, ns + 51, 1.5, 2.4, 0);
      const hop = (a) => (a < 0 ? 0 : a < 0.06 ? -0.25 * Math.sin((a / 0.06) * Math.PI) : a < 0.42 ? Math.sin(((a - 0.06) / 0.36) * Math.PI) : 0);
      const h = hop(e.age) + 0.7 * hop(e.age - 0.44);
      const hl = hop(e.age - 0.06) + 0.7 * hop(e.age - 0.5);
      const sway = holdNoise(t, ns + 52, 1.6, 0.5);
      return {
        dy: -15 * h, near: [sway * 5, -12 * hl], far: [sway * 5, -12 * hl + 3 * h], headTilt: -3 * hl + sway * 1.5,
        nearAng: 6 * hl, farAng: -6 * hl,
      };
    },
  },

  'give-gift': {
    label: 'Offering a gift box forward with both hands',
    mood: 'happy',
    idle: 0.8,
    prop: { name: 'giftbox', at: [168, -640], ang: 0, size: 136, hold: 'both' },
    head: { tilt: 6, look: [1, 0.5] },
    lean: 3,
    arms: {
      near: { hand: 'support', grip: [-0.3, 0.48], mir: -1, z: 'front', pref: [-0.2, 1] },
      far: { hand: 'support', grip: [0.14, 0.48], mir: -1, z: 'reach', pref: [0.1, 1] },
    },
    front: {
      prop: { at: [0, -626], ang: 0 },
      head: { tilt: 6, look: [0, 0.6] },
      arms: { near: { pref: [-0.7, 1], len: [0.95, 0.62] }, far: { mir: 1, z: 'front', pref: [0.7, 1], len: [0.95, 0.62] } },
    },
    anim(t, ph, view, ns) {
      const e = events(t, ns + 61, 2.6, 4.4, 0.5);
      const push = pulse(e.age, 0.55, 0.9, 0.75);
      return { prop: [6 * push + holdNoise(t, ns + 62, 2.8) * 1.5, -3 * push], lean: 1.2 * push, headTilt: 2 * push };
    },
  },

  'receive-gift': {
    label: 'Receiving: both palms up and forward, a gift box resting on them',
    mood: 'surprised',
    idle: 0.8,
    prop: { name: 'giftbox', at: [164, -686], ang: 0, size: 124, hold: 'both' },
    head: { tilt: 8, look: [1, 0.6] },
    arms: {
      near: { hand: 'support', grip: [-0.3, 0.48], mir: -1, z: 'front', pref: [-0.3, 1] },
      far: { hand: 'support', grip: [0.14, 0.48], mir: -1, z: 'reach', pref: [0.1, 1] },
    },
    front: {
      prop: { at: [0, -676], ang: 0 },
      head: { tilt: 7, look: [0, 0.8] },
      arms: { near: { pref: [-0.8, 1], len: [0.95, 0.62] }, far: { mir: 1, z: 'front', pref: [0.8, 1], len: [0.95, 0.62] } },
    },
    anim(t, ph, view, ns) { return { prop: [holdNoise(t, ns + 63, 3.1) * 1.5, holdNoise(t, ns + 64, 2.4) * 2] }; },
  },

  wave: {
    label: 'Friendly wave with the forward hand raised beside the head',
    mood: 'happy',
    head: { tilt: -2, look: [1, 0] },
    arms: {
      near: { ...hang(-70), z: 'front' },
      far: { t: [150, -952], hand: 'open', ang: -84, z: 'back', pref: [1, 0.7], thumb: [-1, 0] },
    },
    front: { arms: { near: hangFront.near, far: { t: [178, -940], ang: -80, pref: [1, 0.6], z: 'front', thumb: [-1, 0] } } },
    anim(t, ph, view, ns) {
      // waves come in short bursts; the hand rocks from the elbow and the palm follows a beat later
      const e = events(t, ns + 71, 2.3, 3.6, 0);
      const env = (a) => smooth(a / 0.16) * (1 - smooth((a - 0.9) / 0.26));
      const osc = (a) => (a < 0 || a > 1.2 ? 0 : Math.sin((a / 0.38) * TAU) * env(a));
      return { far: [10 * osc(e.age), -3 * Math.abs(osc(e.age))], farAng: 15 * osc(e.age - 0.06) };
    },
  },

  point: {
    label: 'Pointing forward / at something on the facing side',
    mood: 'neutral',
    head: { tilt: 0, look: [1, 0] },
    lookHold: 0.3,
    arms: {
      near: { ...hang(-70), z: 'front' },
      far: { t: [300, -800], hand: 'point', ang: -4, z: 'back', pref: [0, 1], thumb: [0, 1] },
    },
    front: { arms: { near: hangFront.near, far: { t: [300, -806], ang: -4, pref: [0.2, 1], z: 'front', thumb: [0, 1] } }, head: { look: [1, 0] } },
    anim(t, ph, view, ns) {
      const e = events(t, ns + 81, 1.7, 3.1, 0.4);
      const k = pulse(e.age, 0.12, 0.12, 0.4), kl = pulse(e.age - 0.05, 0.12, 0.12, 0.4);
      return { far: [6 * k, 1.5 * k], farAng: -4 * kl, headTilt: 1.5 * k };
    },
  },

  shrug: {
    label: 'Shrugging: forearms out, palms up, shoulders raised (unsure)',
    mood: 'surprised',
    head: { tilt: 4, look: [0.6, 0] },
    shoulders: -10,
    arms: {
      near: { t: [-168, -664], hand: 'present', ang: 196, z: 'front', pref: [0.1, 1], thumb: [0, -1] },
      far: { t: [168, -676], hand: 'present', ang: -16, z: 'back', pref: [-0.1, 1], thumb: [0, -1] },
    },
    front: { arms: { near: { t: [-200, -668], ang: 196, pref: [-0.2, 1] }, far: { t: [200, -668], ang: -16, pref: [0.2, 1], z: 'front' } } },
    anim(t, ph, view, ns) {
      const e = events(t, ns + 91, 2.3, 3.7, 0.2);
      const s = pulse(e.age, 0.24, 0.6, 0.65), sl = pulse(e.age - 0.05, 0.24, 0.6, 0.65);
      return { shoulders: -7 * s, dy: -1.5 * s, near: [0, -8 * sl], far: [0, -8 * sl], nearAng: 6 * sl, farAng: -6 * sl, headTilt: 3 * s };
    },
  },

  walk: {
    label: 'Walking towards the facing side (loops every 1.1 s)',
    mood: 'neutral',
    walk: true,
    idle: 0.4,
    head: { tilt: 0, look: [1, 0] },
    arms: {
      near: { ...hang(-60), z: 'front' },
      far: { ...hang(56), z: 'back', ang: 88 },
    },
    front: { arms: hangFront },
  },

  sit: {
    label: 'Seated on a low cushion, hands resting on the knees (add prop phone/coffee/goldbar to hold it)',
    mood: 'neutral',
    sit: true,
    arms: {
      near: { t: [150, -560], hand: 'relax', ang: 34, z: 'front', pref: [-0.6, 1], thumb: [0, -1] },
      far: { t: [176, -566], hand: 'relax', ang: 28, z: 'back', pref: [-0.4, 1], thumb: [0, -1] },
    },
    front: { arms: { near: { t: [-66, -562], ang: 84, pref: [-1, 0.6], len: [1, 0.7] }, far: { t: [66, -562], ang: 96, pref: [1, 0.6], z: 'front', len: [1, 0.7] } } },
  },

  'hold-goldbar': {
    label: 'Proudly holding up a gold bar in front of the chest',
    mood: 'proud',
    prop: { name: 'goldbar', at: [86, -768], ang: -8, size: 86, hold: 'near' },
    head: { tilt: 2, look: [1, 0.4] },
    arms: {
      near: { hand: 'phone', grip: [0, 0], mir: -1, z: 'front', pref: [-0.2, 1], len: [0.95, 0.8] },
      far: { ...hang(64), z: 'back', ang: 88 },
    },
    front: {
      prop: { at: [-24, -758], ang: 0 },
      head: { look: [-0.4, 0.4] },
      arms: { near: { pref: [-1, 0.6], len: [0.95, 0.7] }, far: hangFront.far },
    },
    anim(t, ph, view, ns) { return { prop: [holdNoise(t, ns + 103, 3.3) * 1.5, holdNoise(t, ns + 101, 2.7) * 2.5], propAng: holdNoise(t, ns + 102, 3.5) * 3 }; },
  },

  present: {
    label: 'Presenting: open palm extended to the facing side, showing something',
    mood: 'happy',
    head: { tilt: 0, look: [1, 0.2] },
    arms: {
      near: { ...hang(-70), z: 'front' },
      far: { t: [232, -640], hand: 'present', ang: -8, z: 'back', pref: [-0.2, 1], thumb: [0, -1] },
    },
    front: { arms: { near: hangFront.near, far: { t: [238, -650], ang: -10, pref: [0.2, 1], z: 'front' } }, head: { look: [1, 0.2] } },
    anim(t, ph, view, ns) {
      const e = events(t, ns + 111, 2.4, 4, 0.6);
      const k = pulse(e.age, 0.3, 0.6, 0.6), kl = pulse(e.age - 0.06, 0.3, 0.6, 0.6);
      return { far: [holdNoise(t, ns + 112, 2.6) * 3 + 6 * k, -4 * k], farAng: -5 * kl + holdNoise(t, ns + 113, 3.1) * 3 };
    },
  },
};

// How each prop is held when it replaces a pose's own prop (spec.prop on a pose that holds something).
// at = anchor on the prop (normalised), mir = which way the thumb faces; single = one-handed.
export const PROP_GRIPS = {
  phone: { hand: 'phone', at: [0, 0], mir: -1, single: true },
  goldbar: { hand: 'phone', at: [0, 0], mir: -1, single: true },
  coffee: { hand: 'cup', at: [-0.34, 0.2], mir: -1, single: true },
  bag: { hand: 'bag', at: [-0.09, -0.44], mir: 1, single: true },
  giftbox: { hand: 'support', at: [-0.3, 0.48], mir: -1, at2: [0.14, 0.48], mir2: -1, mir2Front: 1 },
  receipts: { hand: 'pinch', at: [-0.12, 0.36], mir: -1, at2: [0.3, 0.12], mir2: 1, mir2Front: 1 },
};

const isHang = (a) => a && !a.grip && a.hand === 'relax' && (a.ang ?? 90) > 60 && (a.ang ?? 90) < 120;
/** Bring a hanging arm up to hold something at the waist (side / front targets per arm). */
const atWaist = (side, front) => (free, view, cur) => (isHang(cur)
  ? { t: (view === 'front' ? front : side)[free], z: view === 'front' ? 'front' : free === 'far' ? 'reach' : 'front', pref: view === 'front' ? [free === 'near' ? -0.25 : 0.25, 1] : [-0.4, 1], len: view === 'front' ? [1, 0.62] : [1, 0.9] }
  : {});

// Default grip for a prop the pose itself does not hold (goes into a free hand).
export const HAND_PROPS = {
  phone: { size: 88, hand: 'phone', at: [0, 0], mir: -1, pAng: -6, arm: atWaist({ near: [6, -612], far: [92, -620] }, { near: [-64, -612], far: [64, -612] }) },
  coffee: { size: 76, hand: 'cup', at: [-0.34, 0.2], mir: -1, mirFront: 1, pAng: 0, arm: atWaist({ near: [8, -588], far: [96, -596] }, { near: [-78, -596], far: [78, -596] }) },
  goldbar: { size: 70, hand: 'phone', at: [0, 0], mir: -1, pAng: -6, arm: atWaist({ near: [6, -616], far: [92, -624] }, { near: [-64, -620], far: [64, -620] }) },
  receipts: { size: 92, hand: 'pinch', at: [-0.12, 0.36], mir: -1, pAng: 0, arm: atWaist({ near: [0, -600], far: [86, -606] }, { near: [-70, -604], far: [70, -604] }) },
  giftbox: { size: 96, hand: 'support', at: [-0.24, 0.48], mir: -1, mirFront: 1, pAng: 0, arm: atWaist({ near: [10, -590], far: [96, -598] }, { near: [-84, -596], far: [84, -596] }) },
  bag: { size: 128, hand: 'bag', at: [-0.09, -0.44], mir: 1, hang: true },
};

/** Stand / sit with a prop: placed in front of the body and held properly. */
export const STAND_HOLDS = {
  phone: {
    prop: { name: 'phone', at: [42, -664], ang: -8, size: 90, hold: 'near' }, look: true,
    near: { hand: 'phone', grip: [0, 0], mir: -1, z: 'front', pref: [-0.2, 1], len: [0.95, 0.7] },
    frontAt: [-22, -650], frontNear: { pref: [-0.4, 1], len: [1, 0.55] },
  },
  coffee: {
    prop: { name: 'coffee', at: [62, -640], ang: 0, size: 78, hold: 'near' },
    near: { hand: 'cup', grip: [-0.34, 0.2], mir: -1, z: 'front', pref: [-0.2, 1], len: [0.95, 0.75] },
    frontAt: [-46, -652], frontNear: { pref: [-0.4, 1], len: [1, 0.45] },
  },
  goldbar: {
    prop: { name: 'goldbar', at: [62, -684], ang: -6, size: 76, hold: 'near' }, look: true,
    near: { hand: 'phone', grip: [0, 0], mir: -1, z: 'front', pref: [-0.2, 1], len: [0.95, 0.75] },
    frontAt: [-30, -690], frontNear: { pref: [-0.4, 1], len: [1, 0.5] },
  },
  giftbox: {
    prop: { name: 'giftbox', at: [100, -604], ang: 0, size: 110, hold: 'both' },
    near: { hand: 'support', grip: [-0.3, 0.48], mir: -1, z: 'front', pref: [-0.2, 1], len: [0.95, 0.7] },
    far: { hand: 'support', grip: [0.14, 0.48], mir: -1, z: 'reach', pref: [0.1, 1], len: [0.9, 0.62] },
    frontAt: [0, -596], frontNear: { pref: [-0.6, 1], len: [0.95, 0.6] }, frontFar: { mir: 1, z: 'front', pref: [0.6, 1], len: [0.95, 0.6] },
  },
  receipts: {
    prop: { name: 'receipts', at: [86, -640], ang: 2, size: 100, hold: 'both' }, look: true,
    near: { hand: 'pinch', grip: [-0.12, 0.36], mir: -1, z: 'front', pref: [-0.3, 1], len: [0.95, 0.7] },
    far: { hand: 'pinch', grip: [0.3, 0.12], mir: 1, z: 'reach', pref: [0.1, 1], len: [0.9, 0.62] },
    frontAt: [0, -632], frontNear: { pref: [-0.6, 1], len: [0.95, 0.6] }, frontFar: { z: 'front', pref: [0.6, 1], len: [0.95, 0.6] },
  },
};
