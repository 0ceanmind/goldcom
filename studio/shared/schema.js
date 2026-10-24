// Document model shared by the editor, the HTTP server and the MCP server.
import { FORMATS, THEMES } from './brand.js';

export const SCHEMA_VERSION = 1;

export const uid = (p = 'l') => `${p}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;

export const LAYER_TYPES = {
  text: 'Text',
  list: 'List',
  logo: 'Logo',
  image: 'Image',
  phone: 'Phone mockup',
  browser: 'Browser mockup',
  code: 'Code card',
  goldbar: 'Gold bar',
  chart: 'Price chart',
  button: 'Button',
  badge: 'Badge',
  icon: 'Icon',
  gem: 'Gem',
  shape: 'Shape',
  pager: 'Carousel pager',
  ticker: 'Price ticker',
  notification: 'Push notification',
  sticker: 'Story sticker',
  countdown: 'Countdown',
  progress: 'Progress',
  chat: 'Chat',
  tap: 'Tap indicator',
  sparkles: 'Gold sparkles',
  character: 'Person (illustration)',
  prop: 'Prop (illustration)',
  set: 'Setting (illustration)',
  glow: 'Glow',
  step: 'Step number',
  check: 'Check mark',
  focus: 'Spotlight',
  bubble: 'Speech bubble',
};

/** Default properties for each layer type, relative to a 1080 px wide canvas. */
export function layerDefaults(type) {
  const base = { id: uid('l'), type, x: 80, y: 80, w: 400, h: 120, rotation: 0, opacity: 1, anim: { in: 'fade-up', delay: 0, dur: 0.6 } };
  switch (type) {
    case 'text': return { ...base, w: 920, h: 160, text: 'Real gold, from your phone', role: 'h2', color: 'auto', accent: 'auto', align: 'start', valign: 'top', dir: 'auto', fit: true };
    case 'list': return { ...base, w: 920, h: 360, items: ['Start from one gram', 'Live indicative prices', 'Send gold as a gift'], bullet: 'gem', role: 'body-lg', color: 'auto', dir: 'auto' };
    case 'logo': return { ...base, w: 320, h: 127, variant: 'horizontal', mode: 'auto', anim: { in: 'fade', delay: 0, dur: 0.6 } };
    case 'image': return { ...base, w: 600, h: 600, src: '', fit: 'cover', radius: 24, facet: false };
    case 'phone': return { ...base, w: 420, h: 868, src: '', placeholder: 'home', lang: 'en', statusBar: true, anim: { in: 'fade-up', delay: 0.15, dur: 0.8 } };
    case 'browser': return { ...base, w: 920, h: 620, src: '', url: 'goldcom.om', anim: { in: 'fade-up', delay: 0.15, dur: 0.8 } };
    case 'code': return { ...base, w: 920, h: 420, code: "const gold = await goldcom.buy({\n  grams: 1,\n  purity: '999.9',\n});", lang: 'js', title: 'buy.js' };
    case 'goldbar': return { ...base, w: 220, h: 355, label: '1 g', sub: 'FINE GOLD\n999.9', anim: { in: 'scale', delay: 0.1, dur: 0.7 } };
    case 'button': return { ...base, w: 360, h: 104, text: 'Buy gold', variant: 'auto', dir: 'auto' };
    case 'badge': return { ...base, w: 260, h: 56, text: 'Verified', variant: 'spark', gem: true, dir: 'auto' };
    case 'icon': return { ...base, w: 120, h: 120, icon: 'gift', color: 'auto', tile: true };
    case 'gem': return { ...base, w: 48, h: 48, fill: 'goldLeaf', anim: { in: 'scale', delay: 0, dur: 0.5 } };
    case 'shape': return { ...base, w: 600, h: 400, shape: 'rect', fill: 'graphite', radius: 32, stroke: '', facet: false, anim: { in: 'fade', delay: 0, dur: 0.5 } };
    case 'pager': return { ...base, w: 300, h: 40, style: 'dots', anim: { in: 'none', delay: 0, dur: 0.4 } };
    case 'ticker': return { ...base, x: 0, w: 1080, h: 96, items: ['24K · 1 g  31.204 ▲ +0.42%', '24K · 10 g  312.040 ▲ +0.42%', '24K · 1 oz  970.552 ▲ +0.42%'], speed: 90, dir: 'auto', anim: { in: 'fade', delay: 0.2, dur: 0.5 }, loop: { type: 'live' } };
    case 'notification': return { ...base, w: 920, h: 190, app: 'Goldcom', title: 'Your gold gift has arrived', body: 'Aisha sent you 2.5 g of 24K gold.', time: 'now', dir: 'auto', anim: { in: 'drop', delay: 0.3, dur: 0.7 } };
    case 'sticker': return { ...base, w: 640, h: 360, kind: 'poll', question: 'Gold or cash for Eid?', options: ['Gold', 'Cash'], result: [], showResults: false, reveal: false, correct: 0, emoji: '✨', value: 0.8, placeholder: '', days: 25, hours: 6, minutes: 30, seconds: 12, dir: 'auto', anim: { in: 'pop', delay: 0.3, dur: 0.6 } };
    case 'countdown': return { ...base, w: 920, h: 240, days: 25, hours: 6, minutes: 30, seconds: 12, labels: 'auto', live: true, dir: 'auto', anim: { in: 'fade-up', delay: 0.2, dur: 0.6 } };
    case 'progress': return { ...base, w: 460, h: 460, style: 'ring', value: 0.62, label: '6.2 g', sub: 'of 10 g', anim: { in: 'draw', delay: 0.2, dur: 1.4 } };
    case 'chat': return { ...base, w: 920, h: 640, messages: [{ from: 'them', text: 'Can I send gold to my sister in Sohar?' }, { from: 'me', text: 'Yes. Pick a weight, add her number, and she gets it right away.' }], dir: 'auto', anim: { in: 'type', delay: 0.2, dur: 3 } };
    case 'tap': return { ...base, w: 140, h: 140, anim: { in: 'fade', delay: 0.8, dur: 0.3 }, loop: { type: 'pulse' } };
    case 'sparkles': return { ...base, x: 0, y: 0, w: 1080, h: 1080, count: 26, seed: 7, anim: { in: 'fade', delay: 0, dur: 1 }, loop: { type: 'shimmer' } };
    case 'character': return { ...base, w: 360, h: 720, spec: { gender: 'woman', outfit: 'abaya', headwear: 'hijab', pose: 'phone-happy', mood: 'happy', prop: 'phone', skin: 'medium', facing: 'front' }, anim: { in: 'fade-up', delay: 0.2, dur: 0.8 } };
    case 'prop': return { ...base, w: 240, h: 240, prop: 'giftbox', anim: { in: 'pop', delay: 0.3, dur: 0.6 } };
    case 'set': return { ...base, x: 0, y: 0, w: 1080, h: 1080, set: 'room', mood: 'warm', radius: 0, anim: { in: 'fade', delay: 0, dur: 0.8 } };
    case 'glow': return { ...base, x: -200, y: 0, w: 1480, h: 1200, color: 'gold', intensity: 0.2, anim: { in: 'fade', delay: 0, dur: 1.2 } };
    case 'step': return { ...base, w: 96, h: 96, text: '1', anim: { in: 'pop', delay: 0, dur: 0.6 } };
    case 'check': return { ...base, w: 44, h: 44, anim: { in: 'draw', delay: 0.2, dur: 0.5 } };
    case 'focus': return { ...base, w: 600, h: 160, radius: 18, dim: 0.62, anim: { in: 'fade', delay: 0.6, dur: 0.6 } };
    case 'bubble': return { ...base, w: 480, h: 160, tail: 'end', anim: { in: 'pop', delay: 0.6, dur: 0.5 } };
    case 'chart': return { ...base, w: 920, h: 360, points: [44, 45.5, 44.2, 43.1, 44.8, 46, 45.1, 43.9, 44.6, 45.8, 45.2, 44.5, 45.6], trend: 'auto', area: true, grid: true, anim: { in: 'draw', delay: 0.2, dur: 1.2 } };
    default: return base;
  }
}

export function createSlide(partial = {}) {
  return {
    id: uid('s'),
    template: null,
    content: null,
    extras: null,
    theme: 'onyx',
    pattern: 'top',
    bgMotion: 'none',
    bg: null,
    duration: 4,
    transition: 'fade',
    custom: false,
    layers: [],
    ...partial,
  };
}

export function createDocument({ name = 'Untitled', format = 'feed-portrait', kind = 'carousel', lang = 'ar', slides = [], source = null, caption = null } = {}) {
  const f = FORMATS[format] || FORMATS['feed-portrait'];
  const now = new Date().toISOString();
  return {
    version: SCHEMA_VERSION,
    id: uid('doc'),
    name,
    format: FORMATS[format] ? format : 'feed-portrait',
    width: f.w,
    height: f.h,
    kind,
    lang,
    fps: 30,
    source,
    caption: caption || { text: '', hashtags: [] },
    createdAt: now,
    updatedAt: now,
    slides,
  };
}

/** Fill in missing fields so older or partial documents are always renderable. */
export function normalizeDocument(doc) {
  const f = FORMATS[doc.format] || { w: doc.width || 1080, h: doc.height || 1350 };
  const out = {
    version: SCHEMA_VERSION,
    kind: 'carousel',
    lang: 'ar',
    fps: 30,
    source: null,
    ...doc,
    caption: { text: '', hashtags: [], ...(doc.caption || {}) },
    width: doc.width || f.w,
    height: doc.height || f.h,
  };
  out.slides = (doc.slides || []).map((s) => {
    const slide = createSlide({ ...s, id: s.id || uid('s') });
    const dur = Number(slide.duration);
    slide.duration = Number.isFinite(dur) ? Math.min(60, Math.max(0.5, dur)) : 4;
    if (!THEMES[slide.theme]) slide.theme = 'onyx';
    slide.layers = (s.layers || []).map((l) => ({ ...layerDefaults(l.type), ...l, id: l.id || uid('l'), anim: { ...layerDefaults(l.type).anim, ...(l.anim || {}) } }));
    return slide;
  });
  return out;
}

/** Total running time of a document in seconds (video mode). */
export function docDuration(doc) {
  return doc.slides.reduce((t, s) => t + (Number(s.duration) || 4), 0);
}

/** Map a global time to { index, local } within the slide sequence. */
export function slideAt(doc, t) {
  let acc = 0;
  for (let i = 0; i < doc.slides.length; i++) {
    const d = Number(doc.slides[i].duration) || 4;
    if (t < acc + d || i === doc.slides.length - 1) return { index: i, local: Math.max(0, t - acc), start: acc, dur: d };
    acc += d;
  }
  return { index: 0, local: 0, start: 0, dur: 4 };
}

export const clone = (o) => JSON.parse(JSON.stringify(o));
