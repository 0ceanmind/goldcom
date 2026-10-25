// Machine-readable option lists for the AI director. Every allowed value has a one-line description.
import { POSES } from './poses.js';
import { PROPS } from './props.js';
import { SCENES } from './scenes.js';

export const CHARACTER_OPTIONS = {
  gender: { man: 'Omani man (default outfit dishdasha + kumma)', woman: 'Omani woman (default outfit abaya + hijab; always wears a headscarf)' },
  age: { young: 'Young adult (20s): slimmer, no beard by default', adult: 'Adult (30s–40s), default', senior: 'Senior (60+): grey hair/beard, slight stoop, sometimes glasses' },
  skin: { light: 'Light warm skin tone', medium: 'Medium warm skin tone (default)', tan: 'Tan / olive-brown skin tone', deep: 'Deep brown skin tone' },
  outfit: {
    dishdasha: 'Men: long collarless robe (white or pale) with the furakha tassel at the neckline',
    abaya: 'Women: long warm-black robe with fine gold trim at the front and cuffs',
    casual: 'Modest modern clothes: men an overshirt + long trousers + sneakers; women a long tunic over a long skirt, with hijab',
  },
  headwear: {
    kumma: 'Men: embroidered round Omani cap (default for men)',
    massar: 'Men: wrapped patterned turban (formal)',
    none: 'Men only: short neat hair, no cap (women always keep a headscarf)',
    hijab: 'Women: snug headscarf covering hair and neck, face visible (default for women)',
    sheila: 'Women: looser long scarf with one end falling over the shoulder',
  },
  accent: { _: 'Brand colour token for embroidery, trims and the tassel: gold, bullion (default), bronze, amber, sand, spark, bronzeDeep, espresso' },
  pose: Object.fromEntries(Object.entries(POSES).map(([k, v]) => [k, v.label])),
  // 3D figures are faceless by design: moods are body language (head, shoulders, chest, rhythm).
  mood: {
    neutral: 'Relaxed, attentive', happy: 'Head up, chest open, a light bounce', worried: 'Head down, shoulders raised (stress, confusion)',
    surprised: 'Head back, leaning back a touch', calm: 'Slow breathing, head softly tilted (reassured)', proud: 'Chest lifted, chin up',
    thinking: 'Head tilted and turned, chin up',
  },
  facing: { right: '3/4 view looking to the right (default)', left: '3/4 view looking to the left (mirrored, light stays consistent)', front: 'Facing the viewer' },
  prop: {
    null: 'Nothing in the hands (use null explicitly to remove a pose\'s default prop)',
    phone: 'Dark phone with an illustrative Goldcom-style screen', giftbox: 'Gift box with ribbon', goldbar: 'Stamped 999.9 gold bar',
    receipts: 'A messy handful of paper receipts', bag: 'Paper shopping bag hanging from the hand', coffee: 'Takeaway coffee cup',
  },
  beard: { true: 'Neat short beard + moustache (men; default for adult/senior)', false: 'Clean-shaven' },
  seed: { _: 'Integer for small stable variations (robe shade, scarf colour, hair, beard default). seed 1 = white dishdasha' },
  // optional extras
  robe: { _: 'Optional fabric override: white, ivory, pearl, oat, mist, abaya, sandstone, taupe, stone, mocha, olive, denim, graphite, slate, espresso, bronzeDeep, bronze, black, cream' },
  scarf: { _: 'Optional headscarf fabric override (same list as robe)' },
  glasses: { true: 'Thin glasses', false: 'No glasses' },
  seat: { cushion: "For pose 'sit': draws a low ottoman (default)", none: "For pose 'sit': no seat (place a sofa prop behind instead)" },
  fx: { sweat: 'Animated sweat drop by the temple (default for stressed)', sparkle: 'Gold glints around the head (default for celebrate)', false: 'No effect' },
};

export const PROP_NAMES = Object.keys(PROPS);
export const SCENE_NAMES = Object.keys(SCENES);
export const PROP_OPTIONS = Object.fromEntries(Object.entries(PROPS).map(([k, v]) => [k, v.label]));
export const SCENE_OPTIONS = Object.fromEntries(Object.entries(SCENES).map(([k, v]) => [k, v.label]));
export const SCENE_THEMES = { onyx: 'Dark, desaturated set for Onyx slides', cream: 'Light airy set for Cream slides', bullion: 'Warm bronze set for Bullion campaign slides', sand: 'Light gold set for Sand slides' };
