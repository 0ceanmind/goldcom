// Goldcom brand system for the studio. Mirrors brand/tokens/tokens.json (the source of truth).

export const COLORS = {
  amber: '#CD864B',
  gold: '#DBA761',
  ink: '#000000',
  espresso: '#3B2A1C',
  bronzeDeep: '#62422A',
  bronze: '#8A5A2B',
  bullion: '#C8943D',
  sand: '#E8CC73',
  spark: '#F2D46B',
  onyx: '#151513',
  charcoal: '#1D1D1F',
  graphite: '#2D2E2B',
  slate: '#3D3E3A',
  stone: '#9A968C',
  stoneDark: '#6B675F',
  mist: '#E9E1CF',
  cream: '#FFF8EA',
  white: '#FFFFFF',
  gainDark: '#3DBE84',
  lossDark: '#F0605D',
  gainLight: '#1E7F52',
  lossLight: '#C2362F',
  info: '#3AA8E8',
};

export const COLOR_LABELS = {
  amber: 'Amber', gold: 'Gold', ink: 'Ink', espresso: 'Espresso', bronzeDeep: 'Bronze Deep', bronze: 'Bronze',
  bullion: 'Bullion', sand: 'Sand', spark: 'Spark', onyx: 'Onyx', charcoal: 'Charcoal', graphite: 'Graphite',
  slate: 'Slate', stone: 'Stone', stoneDark: 'Stone Dark', mist: 'Mist', cream: 'Cream', white: 'White',
  gainDark: 'Gain (dark)', lossDark: 'Loss (dark)', gainLight: 'Gain (light)', lossLight: 'Loss (light)', info: 'Info',
};

/** Resolve a colour token or pass through a hex value. */
export function color(token, fallback = COLORS.white) {
  if (!token) return fallback;
  if (token.startsWith('#') || token.startsWith('rgb')) return token;
  return COLORS[token] || fallback;
}

export const GRADIENTS = {
  bullion: [[0, '#62422A'], [0.38, '#8A6B41'], [0.74, '#D0B366'], [1, '#EDD175']],
  goldLeaf: [[0, '#F2D46B'], [0.55, '#DBA761'], [1, '#CD864B']],
};

export const FONTS = {
  latin: '"Inter", "SF Pro Text", "Segoe UI", Roboto, Arial, sans-serif',
  arabic: '"IBM Plex Sans Arabic", "Noto Sans Arabic", "Segoe UI", Tahoma, sans-serif',
  mono: '"JetBrains Mono", "SF Mono", Menlo, monospace',
};

// Type roles at the 1080 px reference width. Sizes scale with canvas width.
export const TYPE = {
  display: { size: 104, lh: 1.08, weight: 700, track: -0.02 },
  h1: { size: 80, lh: 1.12, weight: 700, track: -0.015 },
  h2: { size: 60, lh: 1.15, weight: 700, track: -0.01 },
  h3: { size: 44, lh: 1.25, weight: 600, track: 0 },
  'body-lg': { size: 38, lh: 1.45, weight: 400, track: 0 },
  body: { size: 32, lh: 1.5, weight: 400, track: 0 },
  small: { size: 26, lh: 1.45, weight: 400, track: 0 },
  caption: { size: 20, lh: 1.4, weight: 500, track: 0.01 },
  overline: { size: 24, lh: 1.3, weight: 600, track: 0.08, upper: true },
  stat: { size: 200, lh: 1, weight: 700, track: -0.03 },
  price: { size: 72, lh: 1.1, weight: 700, track: -0.01, tnum: true },
  mono: { size: 26, lh: 1.6, weight: 400, track: 0, mono: true },
};
export const ARABIC_LH = 1.18; // Arabic needs taller line-height

export const FORMATS = {
  'feed-portrait': { label: 'Feed portrait 4:5', w: 1080, h: 1350 },
  square: { label: 'Square 1:1', w: 1080, h: 1080 },
  story: { label: 'Story / Reel 9:16', w: 1080, h: 1920 },
  linkedin: { label: 'LinkedIn 1.91:1', w: 1200, h: 627 },
  video: { label: 'Video 16:9', w: 1920, h: 1080 },
  appstore: { label: 'App Store 6.7"', w: 1290, h: 2796 },
};

export const THEMES = {
  onyx: {
    label: 'Onyx (dark)', bg: 'onyx', fg: 'white', fg2: 'stone', accent: 'spark', heading: 'white',
    surface: 'graphite', onSurface: 'white', border: 'slate', logo: 'reversed', button: 'spark', pattern: 'spark', patternOpacity: 0.06,
  },
  charcoal: {
    label: 'Charcoal', bg: 'charcoal', fg: 'white', fg2: 'stone', accent: 'gold', heading: 'white',
    surface: 'graphite', onSurface: 'white', border: 'slate', logo: 'reversed', button: 'spark', pattern: 'spark', patternOpacity: 0.05,
  },
  bullion: {
    // Dark bronze at the top, light gold at the bottom: headlines live in the lower half in Espresso.
    label: 'Bullion (campaign)', bg: 'bullion', fg: 'espresso', fg2: 'bronzeDeep', accent: 'bronzeDeep', heading: 'espresso',
    topFg: 'white', surface: 'onyx', onSurface: 'white', border: 'bronzeDeep', logo: 'mono-white', button: 'charcoal', pattern: 'espresso', patternOpacity: 0.07,
  },
  cream: {
    label: 'Cream (light)', bg: 'cream', fg: 'charcoal', fg2: 'stoneDark', accent: 'bronze', heading: 'charcoal',
    surface: 'white', onSurface: 'charcoal', border: 'mist', logo: 'primary', button: 'charcoal', pattern: 'bullion', patternOpacity: 0.1,
  },
  sand: {
    label: 'Sand (light gold)', bg: 'sand', fg: 'espresso', fg2: 'bronzeDeep', accent: 'bronzeDeep', heading: 'espresso',
    surface: 'cream', onSurface: 'espresso', border: 'bullion', logo: 'mono-black', button: 'charcoal', pattern: 'espresso', patternOpacity: 0.07,
  },
};

export const ANIMATIONS = {
  none: 'None',
  fade: 'Fade',
  'fade-up': 'Fade up',
  'fade-down': 'Fade down',
  'slide-start': 'Slide from start',
  'slide-end': 'Slide from end',
  scale: 'Scale in',
  draw: 'Draw (charts, lines)',
  count: 'Count up (numbers)',
  type: 'Typewriter',
  gleam: 'Gleam (success only)',
};

export const TRANSITIONS = { fade: 'Fade', slide: 'Slide', wipe: 'Facet wipe (45°)', none: 'Cut' };

export const DISCLAIMER = {
  en: 'Gold prices change and the value of your holdings can go down as well as up. Prices shown are indicative; the final price is confirmed at checkout. This is not financial advice.',
  ar: 'أسعار الذهب متغيرة، وقد ترتفع قيمة مقتنياتك أو تنخفض. الأسعار المعروضة استرشادية، ويُثبَّت السعر النهائي عند إتمام الشراء. هذا المحتوى ليس نصيحة مالية.',
};

export const BRAND = {
  name: { en: 'Goldcom', ar: 'جولدكم' },
  legal: 'Golden Platform for Technology and Investment LLC',
  web: 'goldcom.om',
  email: 'support@goldcom.om',
  promise: { en: 'Real gold, from your phone.', ar: 'ذهب حقيقي، من جوالك' },
};

export const isArabic = (s = '') => /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(s);
