// Layout helpers shared by the slide templates and the production scenes.
import { layerDefaults, uid } from './schema.js';
import { TYPE, ARABIC_LH, DISCLAIMER, THEMES, isArabic } from './brand.js';

// ---------- layout helpers ----------
export function ctxHelpers(ctx) {
  const { W, H } = ctx;
  const s = Math.min(W, H) / 1080;
  const m = Math.round(80 * s);
  const rtl = ctx.lang === 'ar';
  const wide = W / H > 1.25;
  const tall = H / W > 1.6;
  const X = (x, w) => (rtl ? W - x - w : x);
  return { W, H, s, m, rtl, wide, tall, X, cw: W - 2 * m, theme: THEMES[ctx.theme] || THEMES.onyx };
}

/** Rough line estimate so text boxes hug their content. The renderer shrinks text to fit as a safety net. */
export function estimateText(text = '', role = 'body', width, s = 1, lang = 'en') {
  const t = TYPE[role] || TYPE.body;
  const ar = lang === 'ar';
  const size = t.size * s * (ar && t.arScale ? t.arScale : 1);
  const avg = (ar ? 0.5 : 0.5) * (t.weight >= 600 ? 1.03 : 1);
  const lh = size * t.lh * (ar ? ARABIC_LH : 1);
  const clean = String(text).replace(/\*/g, '');
  let lines = 0;
  for (const para of clean.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = 0;
    let n = words.length ? 1 : 1;
    for (const wd of words) {
      const ww = (wd.length + 1) * size * avg;
      if (line + ww > width && line > 0) { n++; line = ww; } else line += ww;
    }
    lines += n;
  }
  return { lines, h: Math.ceil(lines * lh + size * 0.15) };
}

export const L = (type, props) => ({ ...layerDefaults(type), ...props, id: uid('l') });
export const anim = (kind, delay, dur = 0.6) => ({ in: kind, delay, dur });

export function textLayer(h, { text, role, x, y, w, color = 'auto', align = 'start', valign = 'top', delay = 0, a = 'fade-up', lang, accent = 'auto', name }) {
  const est = estimateText(text, role, w, h.s, lang);
  // Latin-only text inside an Arabic design (a brand name, a URL) keeps left-to-right punctuation.
  const dir = lang === 'ar' && (isArabic(text) || !/[A-Za-z]/.test(text)) ? 'rtl' : 'ltr';
  const al = dir === 'ltr' && lang === 'ar' && align === 'start' ? 'end' : align; // still hugs the right edge
  return L('text', { name, text, role, x: h.X(x, w), y, w, h: est.h, color, accent, align: al, valign, dir, anim: anim(a, delay) });
}

export function logoLayer(h, { variant = 'horizontal', width, x, y, mode = 'auto', align = 'start' }) {
  const ratio = variant === 'horizontal' ? 541 / 1364 : variant === 'stacked' ? 842 / 876 : 540 / 427;
  const w = width;
  const hh = Math.round(w * ratio);
  const lx = align === 'center' ? (h.W - w) / 2 : h.X(x, w);
  return L('logo', { name: 'logo', variant, mode, x: lx, y, w, h: hh, anim: anim('fade', 0) });
}

export function pagerLayers(h, ctx, { y, style } = {}) {
  if (ctx.noPager) return [];
  const st = style || (ctx.index === 0 ? 'swipe' : 'dots');
  const w = Math.round((st === 'swipe' ? 300 : 260) * h.s);
  const ph = Math.round(40 * h.s);
  return [L('pager', { name: 'pager', style: st, x: h.X(h.m, w), y: y ?? h.H - h.m - ph, w, h: ph, anim: anim('none', 0) })];
}

export function disclaimerLayer(h, ctx, y) {
  const text = DISCLAIMER[ctx.lang] || DISCLAIMER.en;
  const est = estimateText(text, 'caption', h.cw, h.s, ctx.lang);
  return L('text', { name: 'disclaimer', text, role: 'caption', x: h.m, y: y - est.h, w: h.cw, h: est.h, color: 'fg2', align: 'start', dir: ctx.lang === 'ar' ? 'rtl' : 'ltr', anim: anim('fade', 0.6) });
}

export function deviceLayer(h, ctx, c, { x, y, w, maxH, delay = 0.3, center = true }) {
  const device = c.device || (c.screenshot ? 'phone' : 'phone');
  if (device === 'browser') {
    const bw = w;
    const bh = Math.min(Math.round(bw * 0.66), maxH ?? 9999);
    const realW = Math.round(bh / 0.66);
    return L('browser', { name: 'device', src: c.screenshot || '', url: c.url || 'goldcom.om', x: center ? (h.W - realW) / 2 : h.X(x, realW), y, w: realW, h: bh, anim: anim('fade-up', delay, 0.8) });
  }
  const ph = Math.min(maxH ?? 9999, Math.round(w / 0.484));
  const pw = Math.round(ph * 0.484);
  return L('phone', { name: 'device', src: c.screenshot || '', placeholder: c.placeholder || 'home', lang: ctx.lang, x: center ? (h.W - pw) / 2 : h.X(x, pw), y, w: pw, h: ph, rotation: c.tilt || 0, anim: anim('fade-up', delay, 0.8) });
}

export function visualLayer(h, ctx, c, box) {
  const v = c.visual || 'auto';
  if (v === 'none') return [];
  if (v === 'chart') {
    const ch = Math.min(box.h, Math.round(420 * h.s));
    return [L('chart', { name: 'visual', x: h.m, y: box.y + (box.h - ch) / 2, w: h.cw, h: ch, points: c.points || layerDefaults('chart').points, anim: anim('draw', 0.3, 1.4) })];
  }
  if (v === 'goldbar' || (v === 'auto' && !c.screenshot && !c.image && !c.device)) {
    const bh = Math.max(80 * h.s, Math.min(box.h, Math.round(520 * h.s)));
    const bw = Math.round(bh * 0.62);
    return [L('goldbar', { name: 'visual', label: c.barLabel || '1 g', sub: 'FINE GOLD\n999.9', x: (h.W - bw) / 2, y: box.y + (box.h - bh) / 2, w: bw, h: bh, rotation: c.tilt ?? -6, anim: anim('scale', 0.3, 0.8) })];
  }
  if (c.image && !c.screenshot && v !== 'device') {
    return [L('image', { name: 'image', src: c.image, x: box.x ?? h.m, y: box.y, w: box.w ?? h.cw, h: box.h, radius: Math.round(28 * h.s), facet: true, anim: anim('fade-up', 0.3, 0.8) })];
  }
  return [deviceLayer(h, ctx, c, { x: box.x ?? h.m, y: box.y, w: box.w ?? h.cw, maxH: box.bleed ? undefined : box.h, delay: 0.3 })];
}

