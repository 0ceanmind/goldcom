// Pose library. Coordinates are model units (standing height 1000, feet at y = 0, y up is negative),
// authored for a 3/4 view facing right (+x = the way the person faces). `front` overrides the
// arm targets for the front view. Targets are torso-relative so they ride along with breathing/lean.
//
// arm: { t:[x,y] wrist target | rel:[dx,dy] relative to the held prop, hand, ang (deg, 0 = facing
//        direction, 90 = down), z: 'back'|'mid'|'front', pref:[x,y] elbow direction, thumb:[x,y] }
// prop: { name, at:[x,y], ang (deg), size (model units, longest side), hold }
import { wave, TAU } from './util.js';

const hang = (x) => ({ t: [x, -474], hand: 'relax', ang: 92, thumb: [1, 0] });

export const POSES = {
  stand: {
    label: 'Standing, relaxed, arms at the sides',
    mood: 'neutral',
    arms: { near: { ...hang(-70), z: 'front' }, far: { ...hang(64), z: 'back', ang: 88 } },
    front: { arms: { near: { t: [-100, -474], ang: 94, thumb: [1, 0] }, far: { t: [100, -474], ang: 86, thumb: [-1, 0] } } },
  },

  phone: {
    label: 'Looking down at a phone held at chest height (one hand), thumb scrolling',
    mood: 'neutral',
    prop: { name: 'phone', at: [36, -708], ang: -12, size: 92, hold: 'near' },
    head: { tilt: 13, look: [0.6, 1] },
    arms: {
      near: { rel: [-4, 40], hand: 'phone', ang: -84, z: 'front', pref: [-0.2, 1], thumb: [-1, 0], len: [1, 0.6] },
      far: { ...hang(64), z: 'back', ang: 88 },
    },
    front: {
      prop: { at: [-14, -676], ang: 0 },
      head: { tilt: 10, look: [-0.3, 1] },
      arms: { near: { rel: [-2, 40], pref: [-0.6, 1], len: [0.95, 0.62] }, far: { t: [100, -474], ang: 86, thumb: [-1, 0] } },
    },
    anim(t, ph) {
      const glance = Math.max(0, wave(t, 3.2, ph)) ** 3; // occasionally looks up from the screen
      return { headTilt: -12 * glance, look: [0, -1.4 * glance], prop: [0, wave(t, 2.1, ph) * 1.5], thumbTap: (Math.sin(t * TAU * 1.6) > 0.55 ? 1 : 0) };
    },
  },

  'phone-happy': {
    label: 'Smiling at good news on the phone, free hand in a small fist pump',
    mood: 'happy',
    prop: { name: 'phone', at: [42, -724], ang: -16, size: 92, hold: 'near' },
    head: { tilt: 9, look: [0.6, 0.8] },
    arms: {
      near: { rel: [-4, 40], hand: 'phone', ang: -84, z: 'front', pref: [-0.2, 1], thumb: [-1, 0], len: [1, 0.6] },
      far: { t: [104, -722], hand: 'fist', ang: -80, z: 'reach', pref: [0.3, 1], thumb: [-1, 0], len: [0.97, 0.72] },
    },
    front: {
      prop: { at: [-22, -704], ang: 0 },
      head: { tilt: 7, look: [-0.4, 0.8] },
      arms: { near: { rel: [-2, 40], pref: [-0.6, 1], len: [0.95, 0.62] }, far: { t: [86, -736], ang: -96, pref: [0.6, 1], z: 'front', len: [0.97, 0.72] } },
    },
    anim(t, ph) {
      const pump = Math.max(0, Math.sin(t * TAU / 1.4 + ph)) ** 2;
      return { dy: -4 * pump, far: [0, -18 * pump], prop: [0, -2 * pump] };
    },
  },

  stressed: {
    label: 'Worried, holding a messy handful of receipts, head down',
    mood: 'worried',
    fx: 'sweat',
    prop: { name: 'receipts', at: [92, -626], ang: 6, size: 112, hold: 'both' },
    head: { tilt: 12, look: [0.6, 1] },
    lean: 2,
    arms: {
      near: { rel: [-40, 22], hand: 'grip', ang: -40, z: 'front', pref: [-0.3, 1], thumb: [0, -1], len: [0.95, 0.7] },
      far: { rel: [40, 16], hand: 'grip', ang: -130, z: 'reach', pref: [0.1, 1], thumb: [0, -1], len: [0.9, 0.62] },
    },
    front: {
      prop: { at: [0, -622], ang: 4 },
      head: { tilt: 9, look: [0, 1] },
      arms: { near: { rel: [-46, 18], ang: -60, pref: [-0.6, 1], len: [0.95, 0.6] }, far: { rel: [46, 18], ang: -120, pref: [0.6, 1], len: [0.95, 0.6] } },
    },
    anim(t, ph) {
      // nervous fidget: papers shuffle, small head shakes
      return { prop: [wave(t, 0.45, ph) * 2.2, wave(t, 0.7, ph) * 1.2], propAng: wave(t, 0.9, ph) * 2.5, headTurn: wave(t, 2.6, ph) * 0.12, headTilt: wave(t, 1.3, ph) * 1.5 };
    },
  },

  thinking: {
    label: 'Thinking: hand at the chin, other arm across the waist, eyes up',
    mood: 'thinking',
    free: 'far',
    head: { tilt: -6, look: [0.6, -1] },
    arms: {
      near: { t: [-2, -812], hand: 'chin', ang: -70, z: 'front', pref: [0.25, 1], thumb: [1, 0] },
      far: { t: [-6, -664], hand: 'fist', ang: 206, z: 'mid', pref: [0.6, 0.8], thumb: [0, -1], len: [1, 0.8] },
    },
    front: {
      head: { tilt: -4, look: [0.5, -1] },
      arms: { near: { t: [-14, -820], ang: -76, pref: [0.1, 1] }, far: { t: [-62, -656], ang: 180, pref: [0.5, 1] } },
    },
    anim(t, ph) {
      const tap = Math.max(0, Math.sin(t * TAU / 1.8 + ph)) ** 6;
      return { near: [0, 3 * tap], headTilt: wave(t, 4.5, ph) * 2, look: [wave(t, 3.1, ph) * 0.5, -1] };
    },
  },

  celebrate: {
    label: 'Celebrating with both arms up, small bounce',
    mood: 'happy',
    fx: 'sparkle',
    head: { tilt: -8, look: [0.4, -0.4] },
    arms: {
      near: { t: [-112, -1000], hand: 'fist', ang: -100, z: 'front', pref: [-1, 0.2], thumb: [1, 0] },
      far: { t: [118, -1014], hand: 'fist', ang: -80, z: 'back', pref: [1, 0.2], thumb: [-1, 0] },
    },
    front: { arms: { near: { t: [-160, -990], ang: -104, pref: [-1, 0.1] }, far: { t: [160, -990], ang: -76, pref: [1, 0.1], z: 'front' } } },
    anim(t, ph) {
      const b = Math.abs(Math.sin(t * Math.PI / 0.55));
      return { dy: -16 * b, near: [0, -14 * b], far: [0, -14 * (1 - b)], headTilt: -3 * b };
    },
  },

  'give-gift': {
    label: 'Offering a gift box forward with both hands',
    mood: 'happy',
    prop: { name: 'giftbox', at: [168, -640], ang: 0, size: 136, hold: 'both' },
    head: { tilt: 6, look: [1, 0.5] },
    lean: 3,
    arms: {
      near: { rel: [-46, 70], hand: 'open-up', ang: -4, z: 'front', pref: [-0.2, 1], thumb: [0, -1] },
      far: { rel: [62, 22], hand: 'grip', ang: -156, z: 'reach', pref: [0.1, 1], thumb: [0, -1] },
    },
    front: {
      prop: { at: [0, -626], ang: 0 },
      head: { tilt: 6, look: [0, 0.6] },
      arms: { near: { rel: [-64, 26], ang: -50, pref: [-0.7, 1], len: [0.95, 0.62] }, far: { rel: [64, 26], ang: -130, pref: [0.7, 1], z: 'front', len: [0.95, 0.62] } },
    },
    anim(t, ph) { return { prop: [wave(t, 3, ph) * 3, wave(t, 2.2, ph) * 2] }; },
  },

  'receive-gift': {
    label: 'Receiving: both palms up and forward, a gift box resting on them',
    mood: 'surprised',
    prop: { name: 'giftbox', at: [166, -686], ang: 0, size: 124, hold: 'both' },
    head: { tilt: 8, look: [1, 0.6] },
    arms: {
      near: { rel: [-56, 62], hand: 'open-up', ang: 4, z: 'front', pref: [-0.3, 1], thumb: [0, -1] },
      far: { rel: [6, 62], hand: 'open-up', ang: -4, z: 'reach', pref: [0.1, 1], thumb: [0, -1] },
    },
    front: {
      prop: { at: [0, -676], ang: 0 },
      head: { tilt: 7, look: [0, 0.8] },
      arms: { near: { rel: [-52, 60], ang: 24, hand: 'open-up', pref: [-0.8, 1], len: [0.95, 0.62] }, far: { rel: [52, 60], ang: 156, pref: [0.8, 1], z: 'front', len: [0.95, 0.62] } },
    },
    anim(t, ph) { return { prop: [0, wave(t, 2.4, ph) * 2] }; },
  },

  wave: {
    label: 'Friendly wave with the forward hand raised beside the head',
    mood: 'happy',
    head: { tilt: -2, look: [1, 0] },
    arms: {
      near: { ...hang(-70), z: 'front' },
      far: { t: [150, -952], hand: 'open', ang: -84, z: 'back', pref: [1, 0.7], thumb: [-1, 0] },
    },
    front: { arms: { near: { t: [-100, -474], ang: 94, thumb: [1, 0] }, far: { t: [178, -940], ang: -80, pref: [1, 0.6], z: 'front', thumb: [-1, 0] } } },
    anim(t) {
      const w = Math.sin(t * TAU / 0.7);
      return { far: [w * 10, Math.abs(w) * -3], farAng: w * 16 };
    },
  },

  point: {
    label: 'Pointing forward / at something on the facing side',
    mood: 'neutral',
    head: { tilt: 0, look: [1, 0] },
    arms: {
      near: { ...hang(-70), z: 'front' },
      far: { t: [300, -800], hand: 'point', ang: -4, z: 'back', pref: [0, 1], thumb: [0, -1] },
    },
    front: { arms: { near: { t: [-100, -474], ang: 94, thumb: [1, 0] }, far: { t: [300, -806], ang: -4, pref: [0.2, 1], z: 'front', thumb: [0, -1] } }, head: { look: [1, 0] } },
    anim(t, ph) { return { far: [wave(t, 1.6, ph) * 4, 0] }; },
  },

  shrug: {
    label: 'Shrugging: forearms out, palms up, shoulders raised (unsure)',
    mood: 'surprised',
    head: { tilt: 4, look: [0.6, 0] },
    shoulders: -10,
    arms: {
      near: { t: [-168, -664], hand: 'open-up', ang: 196, z: 'front', pref: [0.1, 1], thumb: [0, -1] },
      far: { t: [168, -676], hand: 'open-up', ang: -16, z: 'back', pref: [-0.1, 1], thumb: [0, -1] },
    },
    front: { arms: { near: { t: [-200, -668], ang: 196, pref: [-0.2, 1] }, far: { t: [200, -668], ang: -16, pref: [0.2, 1], z: 'front' } } },
    anim(t, ph) {
      const s = Math.max(0, Math.sin(t * TAU / 2.2 + ph)) ** 2;
      return { shoulders: -6 * s, near: [0, -6 * s], far: [0, -6 * s], headTilt: 3 * s };
    },
  },

  walk: {
    label: 'Walking towards the facing side (loops every 1.1 s)',
    mood: 'neutral',
    walk: true,
    head: { tilt: 0, look: [1, 0] },
    arms: {
      near: { ...hang(-60), z: 'front' },
      far: { ...hang(56), z: 'back', ang: 88 },
    },
    front: { arms: { near: { t: [-100, -474], ang: 94, thumb: [1, 0] }, far: { t: [100, -474], ang: 86, thumb: [-1, 0] } } },
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
    prop: { name: 'goldbar', at: [84, -770], ang: -8, size: 86, hold: 'near' },
    head: { tilt: 2, look: [1, 0.4] },
    arms: {
      near: { rel: [-30, 40], hand: 'grip', ang: -54, z: 'front', pref: [-0.2, 1], thumb: [0, -1], len: [0.95, 0.8] },
      far: { ...hang(64), z: 'back', ang: 88 },
    },
    front: {
      prop: { at: [-26, -760], ang: 0 },
      head: { look: [-0.4, 0.4] },
      arms: { near: { rel: [-30, 40], ang: -60, pref: [-1, 0.6], len: [0.95, 0.7] }, far: { t: [100, -474], ang: 86, thumb: [-1, 0] } },
    },
    anim(t, ph) { return { prop: [0, wave(t, 2.8, ph) * 2.5], propAng: wave(t, 3.4, ph) * 2 }; },
  },

  present: {
    label: 'Presenting: open palm extended to the facing side, showing something',
    mood: 'happy',
    head: { tilt: 0, look: [1, 0.2] },
    arms: {
      near: { ...hang(-70), z: 'front' },
      far: { t: [232, -640], hand: 'open-up', ang: -8, z: 'back', pref: [-0.2, 1], thumb: [0, -1] },
    },
    front: { arms: { near: { t: [-100, -474], ang: 94, thumb: [1, 0] }, far: { t: [238, -650], ang: -10, pref: [0.2, 1], z: 'front' } }, head: { look: [1, 0.2] } },
    anim(t, ph) { return { far: [wave(t, 2.4, ph) * 4, wave(t, 2.4, ph + 0.25) * 2] }; },
  },
};

// Default grip for a prop the pose itself does not hold (goes into a free, hanging hand).
export const HAND_PROPS = {
  phone: { size: 88, hand: 'phone', off: [8, 44], ang: 0 },
  coffee: { size: 76, hand: 'grip', off: [16, 30], ang: 0 },
  bag: { size: 128, hand: 'fist', off: [0, 74], ang: 0 },
  goldbar: { size: 70, hand: 'grip', off: [10, 34], ang: 0 },
  receipts: { size: 90, hand: 'grip', off: [8, 40], ang: 0 },
  giftbox: { size: 96, hand: 'grip', off: [0, 52], ang: 0 },
};

/** Poses whose 'stand' variant should hold a given prop in front of the body instead of hanging it. */
export const STAND_HOLDS = {
  phone: { prop: { name: 'phone', at: [40, -620], ang: -8, size: 90, hold: 'near' }, near: { rel: [-4, 40], hand: 'phone', ang: -88, z: 'front', pref: [-0.2, 1], thumb: [-1, 0], len: [0.95, 0.7] }, frontAt: [-24, -620] },
  coffee: { prop: { name: 'coffee', at: [56, -620], ang: 0, size: 78, hold: 'near' }, near: { rel: [-24, 27], hand: 'cup', ang: -8, z: 'front', pref: [-0.2, 1], thumb: [0, -1], len: [0.95, 0.75] }, frontAt: [-62, -642], frontLen: [1, 0.3] },
  goldbar: { prop: { name: 'goldbar', at: [60, -640], ang: -6, size: 76, hold: 'near' }, near: { rel: [-24, 34], hand: 'grip', ang: -50, z: 'front', pref: [-0.2, 1], thumb: [0, -1], len: [0.95, 0.75] }, frontAt: [-40, -660], frontLen: [1, 0.4] },
  giftbox: { prop: { name: 'giftbox', at: [96, -590], ang: 0, size: 110, hold: 'both' }, near: { rel: [-52, 26], hand: 'grip', ang: -30, z: 'front', pref: [-0.2, 1], thumb: [0, -1], len: [0.95, 0.7] }, far: { rel: [52, 20], hand: 'grip', ang: -150, z: 'reach', pref: [0.1, 1], thumb: [0, -1], len: [0.9, 0.62] }, frontAt: [0, -590] },
  receipts: { prop: { name: 'receipts', at: [84, -612], ang: 4, size: 100, hold: 'both' }, near: { rel: [-38, 20], hand: 'grip', ang: -40, z: 'front', pref: [-0.3, 1], thumb: [0, -1], len: [0.95, 0.7] }, far: { rel: [38, 14], hand: 'grip', ang: -130, z: 'reach', pref: [0.1, 1], thumb: [0, -1], len: [0.9, 0.62] }, frontAt: [0, -620] },
};
