// Palette for the illustration system: brand colours plus a small, fixed set of skin tones
// and fabric neutrals. Nothing else is allowed into the drawings.
import { COLORS } from '../../../shared/brand.js';
import { mix, tone } from './util.js';

export { COLORS };

/** Resolve a brand token (or hex) to a hex colour. */
export function brand(token, fallback = COLORS.gold) {
  if (!token) return fallback;
  if (typeof token === 'string' && token.startsWith('#')) return token;
  return COLORS[token] || fallback;
}

// Skin: base, shade (form shadow), deep (creases, nostril), lip, blush (unused by faces), palm (palm side of the hand).
export const SKIN = {
  light: { base: '#EDCBA9', shade: '#D8AE8A', deep: '#BF9070', lip: '#B9786A', blush: '#E6A48E', palm: '#F0CDB0' },
  medium: { base: '#D2A47D', shade: '#BB8963', deep: '#A0704E', lip: '#A0614F', blush: '#D08A6E', palm: '#DDB08F' },
  tan: { base: '#B07D56', shade: '#986642', deep: '#7F5235', lip: '#844C3B', blush: '#B8704F', palm: '#C69472' },
  deep: { base: '#7A533A', shade: '#64422E', deep: '#4F3322', lip: '#55311F', blush: '#86513A', palm: '#A57A5E' },
};

export const FEATURE = { light: '#2E231C', medium: '#2B201A', tan: '#261C16', deep: '#1B1410' };

export const HAIR = {
  black: '#211A16',
  darkBrown: '#36281E',
  grey: '#ABA69C',
  white: '#DAD6CD',
};

// Fabric neutrals. Each entry: base, shade, deep (fold), hi (lit edge).
function fabric(base, shadeAmt = -0.12, deepAmt = -0.22, hiAmt = 0.25) {
  return { base, shade: tone(base, shadeAmt), deep: tone(base, deepAmt), hi: tone(base, hiAmt) };
}
export const FABRIC = {
  // Dishdasha neutrals (white is the default)
  white: { base: '#F7F4EE', shade: '#E0D9CC', deep: '#CBC2B1', hi: '#FFFFFF' },
  ivory: { base: '#F1EADC', shade: '#DBD1BE', deep: '#C5B9A2', hi: '#FBF7EF' },
  pearl: { base: '#E4E2DC', shade: '#CDCAC2', deep: '#B6B2A8', hi: '#F3F2EE' },
  oat: { base: '#E3D6BF', shade: '#CCBDA3', deep: '#B5A588', hi: '#F1E8D8' },
  mist: { base: COLORS.mist, shade: '#D3C9B4', deep: '#BDB29B', hi: '#F5F0E5' },
  // Abaya darks: warm charcoal, never pure black so it separates from Onyx sets.
  abaya: { base: '#272523', shade: '#1A1918', deep: '#121110', hi: '#4A453E' },
  // Headscarf and casual neutrals
  black: fabric('#2A2826', -0.25, -0.4, 0.12),
  espresso: fabric(COLORS.espresso, -0.2, -0.35, 0.14),
  mocha: fabric('#6A5242', -0.16, -0.3, 0.16),
  taupe: fabric('#9C8775', -0.13, -0.25, 0.2),
  sandstone: fabric('#CDB99A', -0.11, -0.22, 0.25),
  stone: fabric(COLORS.stone, -0.13, -0.25, 0.22),
  slate: fabric(COLORS.slate, -0.22, -0.38, 0.14),
  graphite: fabric(COLORS.graphite, -0.25, -0.4, 0.12),
  bronzeDeep: fabric(COLORS.bronzeDeep, -0.18, -0.32, 0.14),
  bronze: fabric(COLORS.bronze, -0.16, -0.3, 0.16),
  olive: fabric('#6E6A55', -0.16, -0.3, 0.16),
  denim: fabric('#4A4E57', -0.18, -0.32, 0.14),
  cream: { base: COLORS.cream, shade: '#EDE3CF', deep: '#D9CDB5', hi: '#FFFFFF' },
};

export const SHOE = { sandal: '#5A3F2C', sandalDark: '#3E2B1E', flat: '#1E1C1B', sneaker: '#F4F1EA', sole: '#D6CFC1' };

export const LIGHT = { x: -0.8, y: -0.6 }; // towards the key light: upper left (brand §7.2)

/** Theme-aware set palettes. Dark onyx sets are desaturated and low-key; cream sets are airy. */
export const SET_THEMES = {
  onyx: {
    dark: true,
    wall: '#24231F', wall2: '#1E1D1A', wallHi: '#2D2C28', floor: '#191816', floorHi: '#22211E', line: '#34332E',
    trim: '#3A3832', window: '#2A2C2E', sky: '#31353A', skyLow: '#4A4136', sea: '#2B3036', mountain: '#262A2E', mountain2: '#30343A',
    accent: COLORS.gold, accentSoft: '#6B5A3E', wood: '#3A2E24', wood2: '#2E241C', fabric: '#33302B', fabric2: '#2A2824',
    plant: '#3E4636', plant2: '#323A2D', pot: '#3A3631', glow: COLORS.gold, shadow: '#000000', shadowA: 0.42,
    paper: '#CFC8BA', stoneWall: '#2B2925', arch: '#1A1917', lamp: '#E8CC73',
  },
  cream: {
    dark: false,
    wall: '#F6EEDD', wall2: '#EFE5D0', wallHi: '#FFF9EE', floor: '#E7D9BF', floorHi: '#EEE3CD', line: '#DCCDB0',
    trim: '#E5D8BF', window: '#DDE3E2', sky: '#E9EDEA', skyLow: '#F4E3C6', sea: '#C9D5D6', mountain: '#D6D3C9', mountain2: '#C7C3B8',
    accent: COLORS.bronze, accentSoft: '#D9BE8C', wood: '#B79B78', wood2: '#9F8363', fabric: '#D9C7A8', fabric2: '#C8B391',
    plant: '#8C9471', plant2: '#747C5C', pot: '#CDB898', glow: COLORS.sand, shadow: '#62422A', shadowA: 0.16,
    paper: '#FFFFFF', stoneWall: '#E9DCC3', arch: '#D8C6A5', lamp: '#E8CC73',
  },
  bullion: {
    dark: true,
    wall: '#5A3F29', wall2: '#4C3523', wallHi: '#6E5033', floor: '#3E2C1E', floorHi: '#4A3524', line: '#7A5B3A',
    trim: '#735537', window: '#6E5A40', sky: '#8C7148', skyLow: '#C8A866', sea: '#7C6A4C', mountain: '#6A5236', mountain2: '#7C6140',
    accent: COLORS.sand, accentSoft: '#A88A55', wood: '#4A3322', wood2: '#3E2B1D', fabric: '#6E5236', fabric2: '#5E452D',
    plant: '#5F5A3A', plant2: '#4E4A30', pot: '#7A5D3E', glow: COLORS.spark, shadow: '#1A120B', shadowA: 0.35,
    paper: '#F1E6CF', stoneWall: '#634630', arch: '#43301F', lamp: '#F2D46B',
  },
  sand: {
    dark: false,
    wall: '#EFD98F', wall2: '#E6CC7A', wallHi: '#F6E6AA', floor: '#D9B866', floorHi: '#E2C47A', line: '#C9A659',
    trim: '#DCBF72', window: '#F3E7BE', sky: '#F6EDCB', skyLow: '#F2DC98', sea: '#D9CFA4', mountain: '#DCC88A', mountain2: '#CDB676',
    accent: COLORS.bronzeDeep, accentSoft: '#B8964F', wood: '#A47E46', wood2: '#8C6A3A', fabric: '#C9A75E', fabric2: '#B8954F',
    plant: '#7C7C4C', plant2: '#66663E', pot: '#C29E5A', glow: COLORS.cream, shadow: '#62422A', shadowA: 0.2,
    paper: '#FFF8EA', stoneWall: '#E5CB80', arch: '#C9A65A', lamp: '#FFF8EA',
  },
};
export function setTheme(name) { return SET_THEMES[name] || SET_THEMES.cream; }

/** Slight variation of a colour for seeded diversity (stays inside the neutral family). */
export const vary = (hex, amt) => (amt >= 0 ? mix(hex, '#FFFFFF', amt) : mix(hex, '#000000', -amt));
