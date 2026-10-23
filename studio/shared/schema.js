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
    case 'goldbar': return { ...base, w: 220, h: 355, label: '1g', sub: 'FINE GOLD\n999.9', anim: { in: 'scale', delay: 0.1, dur: 0.7 } };
    case 'chart': return { ...base, w: 920, h: 360, points: [30, 34, 31, 38, 36, 44, 41, 49, 46, 54, 52, 60, 64], trend: 'auto', area: true, grid: true, anim: { in: 'draw', delay: 0.2, dur: 1.2 } };
    case 'button': return { ...base, w: 360, h: 104, text: 'Buy gold', variant: 'auto', dir: 'auto' };
    case 'badge': return { ...base, w: 260, h: 56, text: 'Verified', variant: 'spark', gem: true, dir: 'auto' };
    case 'icon': return { ...base, w: 120, h: 120, icon: 'gift', color: 'auto', tile: true };
    case 'gem': return { ...base, w: 48, h: 48, fill: 'goldLeaf', anim: { in: 'scale', delay: 0, dur: 0.5 } };
    case 'shape': return { ...base, w: 600, h: 400, shape: 'rect', fill: 'graphite', radius: 32, stroke: '', facet: false, anim: { in: 'fade', delay: 0, dur: 0.5 } };
    case 'pager': return { ...base, w: 300, h: 40, style: 'dots', anim: { in: 'none', delay: 0, dur: 0.4 } };
    default: return base;
  }
}

export function createSlide(partial = {}) {
  return {
    id: uid('s'),
    template: null,
    content: null,
    theme: 'onyx',
    pattern: 'top',
    bg: null,
    duration: 4,
    transition: 'fade',
    custom: false,
    layers: [],
    ...partial,
  };
}

export function createDocument({ name = 'Untitled', format = 'feed-portrait', kind = 'carousel', lang = 'ar', slides = [], source = null } = {}) {
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
    width: doc.width || f.w,
    height: doc.height || f.h,
  };
  out.slides = (doc.slides || []).map((s) => {
    const slide = createSlide({ ...s, id: s.id || uid('s') });
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
