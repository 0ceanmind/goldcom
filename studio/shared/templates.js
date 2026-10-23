// On-brand slide templates. A template turns semantic content ({ title, body, items, screenshot, ... })
// into positioned layers for any format and language. Used by the editor and by Claude Code (MCP).
import { layerDefaults, uid } from './schema.js';
import { TYPE, ARABIC_LH, DISCLAIMER, THEMES } from './brand.js';

// ---------- layout helpers ----------
function ctxHelpers(ctx) {
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
  const size = t.size * s;
  const ar = lang === 'ar';
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

const L = (type, props) => ({ ...layerDefaults(type), ...props, id: uid('l') });
const anim = (kind, delay, dur = 0.6) => ({ in: kind, delay, dur });

function textLayer(h, { text, role, x, y, w, color = 'auto', align = 'start', valign = 'top', delay = 0, a = 'fade-up', lang, accent = 'auto', name }) {
  const est = estimateText(text, role, w, h.s, lang);
  return L('text', { name, text, role, x: h.X(x, w), y, w, h: est.h, color, accent, align, valign, dir: lang === 'ar' ? 'rtl' : 'ltr', anim: anim(a, delay) });
}

function logoLayer(h, { variant = 'horizontal', width, x, y, mode = 'auto', align = 'start' }) {
  const ratio = variant === 'horizontal' ? 541 / 1364 : variant === 'stacked' ? 842 / 876 : 540 / 427;
  const w = width;
  const hh = Math.round(w * ratio);
  const lx = align === 'center' ? (h.W - w) / 2 : h.X(x, w);
  return L('logo', { name: 'logo', variant, mode, x: lx, y, w, h: hh, anim: anim('fade', 0) });
}

function pagerLayers(h, ctx, { y, style } = {}) {
  if (ctx.kind === 'video' || ctx.total <= 1 || ctx.format === 'appstore') return [];
  const st = style || (ctx.index === 0 ? 'swipe' : 'dots');
  const w = Math.round((st === 'swipe' ? 300 : 260) * h.s);
  const ph = Math.round(40 * h.s);
  return [L('pager', { name: 'pager', style: st, x: h.X(h.m, w), y: y ?? h.H - h.m - ph, w, h: ph, anim: anim('none', 0) })];
}

function disclaimerLayer(h, ctx, y) {
  const text = DISCLAIMER[ctx.lang] || DISCLAIMER.en;
  const est = estimateText(text, 'caption', h.cw, h.s, ctx.lang);
  return L('text', { name: 'disclaimer', text, role: 'caption', x: h.m, y: y - est.h, w: h.cw, h: est.h, color: 'fg2', align: 'start', dir: ctx.lang === 'ar' ? 'rtl' : 'ltr', anim: anim('fade', 0.6) });
}

function deviceLayer(h, ctx, c, { x, y, w, maxH, delay = 0.3, center = true }) {
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

function visualLayer(h, ctx, c, box) {
  const v = c.visual || 'auto';
  if (v === 'none') return [];
  if (v === 'chart') {
    const ch = Math.min(box.h, Math.round(420 * h.s));
    return [L('chart', { name: 'visual', x: h.m, y: box.y + (box.h - ch) / 2, w: h.cw, h: ch, points: c.points || layerDefaults('chart').points, anim: anim('draw', 0.3, 1.4) })];
  }
  if (v === 'goldbar' || (v === 'auto' && !c.screenshot && !c.image && !c.device)) {
    const bh = Math.max(80 * h.s, Math.min(box.h, Math.round(520 * h.s)));
    const bw = Math.round(bh * 0.62);
    return [L('goldbar', { name: 'visual', label: c.barLabel || '1g', sub: 'FINE GOLD\n999.9', x: (h.W - bw) / 2, y: box.y + (box.h - bh) / 2, w: bw, h: bh, rotation: c.tilt ?? -6, anim: anim('scale', 0.3, 0.8) })];
  }
  if (c.image && !c.screenshot && v !== 'device') {
    return [L('image', { name: 'image', src: c.image, x: box.x ?? h.m, y: box.y, w: box.w ?? h.cw, h: box.h, radius: Math.round(28 * h.s), facet: true, anim: anim('fade-up', 0.3, 0.8) })];
  }
  return [deviceLayer(h, ctx, c, { x: box.x ?? h.m, y: box.y, w: box.w ?? h.cw, maxH: box.bleed ? undefined : box.h, delay: 0.3 })];
}

// ---------- templates ----------
export const TEMPLATES = {
  cover: {
    name: 'Cover',
    description: 'First slide: logo, kicker, big headline, subtitle and a hero visual (phone/browser screenshot, image, gold bar or chart).',
    fields: [
      { key: 'kicker', label: 'Kicker', type: 'text' },
      { key: 'title', label: 'Headline (*word* = accent)', type: 'textarea' },
      { key: 'subtitle', label: 'Subtitle', type: 'textarea' },
      { key: 'visual', label: 'Visual', type: 'select', options: ['auto', 'device', 'goldbar', 'chart', 'none'] },
      { key: 'device', label: 'Device', type: 'select', options: ['phone', 'browser'] },
      { key: 'screenshot', label: 'Screenshot', type: 'asset' },
      { key: 'image', label: 'Image', type: 'asset' },
      { key: 'url', label: 'Browser URL', type: 'text' },
    ],
    example: { kicker: 'New on Goldcom', title: 'Real gold, *from your phone*', subtitle: 'Start from one gram. Track, gift, sell or collect.', visual: 'device', device: 'phone' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const out = [];
      const bullion = ctx.theme === 'bullion';
      out.push(logoLayer(h, { width: Math.round(250 * h.s), x: h.m, y: h.m }));
      if (h.wide) {
        const colW = Math.round(h.cw * 0.52);
        let y = h.m + Math.round(170 * h.s);
        if (c.kicker) { const t = textLayer(h, { name: 'kicker', text: c.kicker, role: 'overline', x: h.m, y, w: colW, color: 'accent', lang: ctx.lang, delay: 0 }); out.push(t); y += t.h + 16 * h.s; }
        const tt = textLayer(h, { text: c.title || '', role: 'display', x: h.m, y, w: colW, lang: ctx.lang, delay: 0.1, name: 'title' }); out.push(tt); y += tt.h + 24 * h.s;
        if (c.subtitle) out.push(textLayer(h, { name: 'subtitle', text: c.subtitle, role: 'body-lg', x: h.m, y, w: colW, color: 'fg2', lang: ctx.lang, delay: 0.25 }));
        const vx = h.m + colW + 60 * h.s;
        out.push(...visualLayer(h, ctx, c, { x: h.rtl ? h.m : vx, y: h.m + 40 * h.s, w: h.cw - colW - 60 * h.s, h: h.H - 2 * h.m, bleed: false }).map((l) => ({ ...l, x: h.rtl ? h.m + (h.cw - colW - 60 * h.s - l.w) / 2 : vx + (h.cw - colW - 60 * h.s - l.w) / 2 })));
        out.push(...pagerLayers(h, ctx));
        return out;
      }
      const textW = h.cw;
      const blocks = [];
      if (c.kicker) blocks.push(['kicker', textLayer(h, { name: 'kicker', text: c.kicker, role: 'overline', x: h.m, y: 0, w: textW, color: 'accent', lang: ctx.lang, delay: 0 })]);
      blocks.push(['title', textLayer(h, { text: c.title || '', role: 'display', x: h.m, y: 0, w: textW, lang: ctx.lang, delay: 0.1, name: 'title' })]);
      if (c.subtitle) blocks.push(['subtitle', textLayer(h, { name: 'subtitle', text: c.subtitle, role: 'body-lg', x: h.m, y: 0, w: textW, color: 'fg2', lang: ctx.lang, delay: 0.25 })]);
      const gap = Math.round(20 * h.s);
      const textH = blocks.reduce((a, [, l]) => a + l.h, 0) + gap * (blocks.length - 1);
      const pagerSpace = ctx.kind === 'video' ? 0 : Math.round(90 * h.s);
      if (bullion) {
        // Dark top for the visual, light bottom for the Espresso headline.
        let y = h.H - h.m - pagerSpace - textH;
        for (const [, l] of blocks) { l.y = y; y += l.h + gap; }
        const top = h.m + Math.round(170 * h.s);
        out.push(...visualLayer(h, ctx, c, { y: top, h: h.H - h.m - pagerSpace - textH - top - 50 * h.s }));
      } else {
        let y = h.m + Math.round(190 * h.s);
        for (const [, l] of blocks) { l.y = y; y += l.h + gap; }
        const vy = y + Math.round(50 * h.s);
        const isDevice = c.screenshot || c.device || c.visual === 'device';
        out.push(...visualLayer(h, ctx, c, { y: vy, h: h.H - vy - (isDevice ? 0 : pagerSpace + h.m), bleed: isDevice }));
      }
      out.push(...blocks.map(([, l]) => l));
      out.push(...pagerLayers(h, ctx));
      return out;
    },
  },

  statement: {
    name: 'Statement',
    description: 'One bold idea or problem statement, vertically centred, with optional kicker and supporting line.',
    fields: [
      { key: 'kicker', label: 'Kicker', type: 'text' },
      { key: 'title', label: 'Statement (*word* = accent)', type: 'textarea' },
      { key: 'body', label: 'Supporting line', type: 'textarea' },
    ],
    example: { kicker: 'The problem', title: 'Buying gold should not feel *complicated*.', body: 'Prices change, purity is hard to judge and storage is inconvenient.' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const w = h.wide ? Math.round(h.cw * 0.75) : h.cw;
      const items = [];
      items.push(L('gem', { name: 'gem', x: h.X(h.m, 44 * h.s), y: 0, w: 44 * h.s, h: 44 * h.s, anim: anim('scale', 0) }));
      if (c.kicker) items.push(textLayer(h, { name: 'kicker', text: c.kicker, role: 'overline', x: h.m, y: 0, w, color: 'accent', lang: ctx.lang, delay: 0.05 }));
      items.push(textLayer(h, { text: c.title || '', role: 'h1', x: h.m, y: 0, w, lang: ctx.lang, delay: 0.15, name: 'title' }));
      if (c.body) items.push(textLayer(h, { name: 'body', text: c.body, role: 'body-lg', x: h.m, y: 0, w, color: 'fg2', lang: ctx.lang, delay: 0.3 }));
      const gap = Math.round(32 * h.s);
      const total = items.reduce((a, l) => a + l.h, 0) + gap * (items.length - 1);
      let y = ctx.theme === 'bullion' ? h.H - h.m - Math.round(100 * h.s) - total : Math.round((h.H - total) / 2);
      for (const l of items) { l.y = y; y += l.h + gap; }
      return [...items, ...pagerLayers(h, ctx)];
    },
  },

  feature: {
    name: 'Feature',
    description: 'One feature: icon, title, body and an optional screenshot (phone/browser) or image underneath.',
    fields: [
      { key: 'icon', label: 'Icon', type: 'icon' },
      { key: 'kicker', label: 'Kicker', type: 'text' },
      { key: 'title', label: 'Title', type: 'textarea' },
      { key: 'body', label: 'Body', type: 'textarea' },
      { key: 'device', label: 'Device', type: 'select', options: ['none', 'phone', 'browser'] },
      { key: 'screenshot', label: 'Screenshot', type: 'asset' },
      { key: 'image', label: 'Image', type: 'asset' },
    ],
    example: { icon: 'gift', kicker: 'Gifting', title: 'Send real gold in seconds', body: 'Choose a weight, add a message and your gift arrives instantly.', device: 'phone' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const out = [];
      const hasVisual = c.screenshot || c.image || (c.device && c.device !== 'none');
      const colW = h.wide && hasVisual ? Math.round(h.cw * 0.5) : h.cw;
      let y = h.m + (h.wide ? Math.round(60 * h.s) : 0);
      const tile = Math.round(112 * h.s);
      out.push(L('icon', { name: 'icon', icon: c.icon || 'sparkle', tile: true, x: h.X(h.m, tile), y, w: tile, h: tile, anim: anim('scale', 0) }));
      y += tile + Math.round(40 * h.s);
      if (c.kicker) { const k = textLayer(h, { name: 'kicker', text: c.kicker, role: 'overline', x: h.m, y, w: colW, color: 'accent', lang: ctx.lang, delay: 0.05 }); out.push(k); y += k.h + 14 * h.s; }
      const t = textLayer(h, { text: c.title || '', role: 'h1', x: h.m, y, w: colW, lang: ctx.lang, delay: 0.12, name: 'title' }); out.push(t); y += t.h + 20 * h.s;
      if (c.body) { const b = textLayer(h, { name: 'body', text: c.body, role: 'body-lg', x: h.m, y, w: colW, color: 'fg2', lang: ctx.lang, delay: 0.24 }); out.push(b); y += b.h; }
      if (hasVisual) {
        const cc = { ...c, device: c.device === 'none' ? undefined : c.device, visual: c.image && !c.screenshot ? undefined : 'device' };
        if (h.wide) {
          const vx = h.m + colW + 60 * h.s;
          const vis = visualLayer(h, ctx, cc, { x: vx, y: h.m, w: h.cw - colW - 60 * h.s, h: h.H - 2 * h.m });
          vis.forEach((l) => { l.x = h.rtl ? h.m + (h.cw - colW - 60 * h.s - l.w) / 2 : vx + (h.cw - colW - 60 * h.s - l.w) / 2; });
          out.push(...vis);
        } else {
          const vy = y + Math.round(60 * h.s);
          out.push(...visualLayer(h, ctx, cc, { y: vy, h: h.H - vy - (c.image && !c.screenshot ? h.m + 90 * h.s : 0), bleed: !(c.image && !c.screenshot) }));
        }
      }
      out.push(...pagerLayers(h, ctx));
      return out;
    },
  },

  screenshot: {
    name: 'Screenshot',
    description: 'A live product screenshot in a phone or browser mockup, with a short title and caption. Use for real app/web screens.',
    fields: [
      { key: 'title', label: 'Title', type: 'textarea' },
      { key: 'caption', label: 'Caption', type: 'textarea' },
      { key: 'device', label: 'Device', type: 'select', options: ['phone', 'browser'] },
      { key: 'screenshot', label: 'Screenshot', type: 'asset' },
      { key: 'url', label: 'Browser URL', type: 'text' },
      { key: 'label', label: 'Show "Illustrative screen" label', type: 'select', options: ['no', 'yes'] },
    ],
    example: { title: 'Live prices, always in view', caption: 'Indicative prices update throughout the day.', device: 'phone', label: 'yes' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const out = [];
      let y = h.m;
      const t = textLayer(h, { text: c.title || '', role: 'h2', x: h.m, y, w: h.cw, align: 'center', lang: ctx.lang, delay: 0, name: 'title' });
      out.push(t); y += t.h + 12 * h.s;
      if (c.caption) { const cap = textLayer(h, { name: 'caption', text: c.caption, role: 'body', x: h.m, y, w: h.cw, align: 'center', color: 'fg2', lang: ctx.lang, delay: 0.12 }); out.push(cap); y += cap.h; }
      y += Math.round(48 * h.s);
      const bottom = h.H - (ctx.kind === 'video' ? h.m : h.m + 80 * h.s) - (c.label === 'yes' ? 40 * h.s : 0);
      const dev = deviceLayer(h, ctx, c, { x: h.m, y, w: c.device === 'browser' ? h.cw : h.cw * 0.6, maxH: bottom - y, delay: 0.25 });
      out.push(dev);
      if (c.label === 'yes') {
        const text = ctx.lang === 'ar' ? 'شاشة توضيحية' : 'Illustrative screen';
        out.push(textLayer(h, { text, role: 'caption', x: h.m, y: dev.y + dev.h + 14 * h.s, w: h.cw, align: 'center', color: 'fg2', lang: ctx.lang, delay: 0.5, a: 'fade' }));
      }
      out.push(...pagerLayers(h, ctx));
      return out;
    },
  },

  steps: {
    name: 'Steps',
    description: 'How it works: kicker, title and 3–5 numbered steps.',
    fields: [
      { key: 'kicker', label: 'Kicker', type: 'text' },
      { key: 'title', label: 'Title', type: 'textarea' },
      { key: 'items', label: 'Steps (one per line)', type: 'list' },
    ],
    example: { kicker: 'How it works', title: 'Own gold in three steps', items: ['Choose a certified bar from 1 g', 'Lock the price at checkout', 'Hold, gift, sell or collect'] },
    layout(c, ctx) { return listLayout(c, ctx, 'number'); },
  },

  list: {
    name: 'Checklist',
    description: 'Title plus a short list of benefits or facts with gem or check bullets.',
    fields: [
      { key: 'kicker', label: 'Kicker', type: 'text' },
      { key: 'title', label: 'Title', type: 'textarea' },
      { key: 'items', label: 'Items (one per line)', type: 'list' },
      { key: 'bullet', label: 'Bullet', type: 'select', options: ['gem', 'check'] },
    ],
    example: { kicker: 'Why Goldcom', title: 'Built for real ownership', items: ['Certified 24K bars and coins', 'Live indicative prices', 'Arabic and English', 'Sharia advisory by Eltizam'], bullet: 'gem' },
    layout(c, ctx) { return listLayout(c, ctx, c.bullet || 'gem'); },
  },

  stat: {
    name: 'Big number',
    description: 'One striking number (counts up when animated) with a label and context line.',
    fields: [
      { key: 'kicker', label: 'Kicker', type: 'text' },
      { key: 'stat', label: 'Number', type: 'text' },
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'body', label: 'Context', type: 'textarea' },
    ],
    example: { kicker: 'Start small', stat: '1 g', label: 'is all you need to own real gold', body: 'Certified 24K bars from one gram.' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const items = [];
      if (c.kicker) items.push(textLayer(h, { name: 'kicker', text: c.kicker, role: 'overline', x: h.m, y: 0, w: h.cw, color: 'accent', lang: ctx.lang, delay: 0 }));
      items.push({ ...textLayer(h, { text: c.stat || '0', role: 'stat', x: h.m, y: 0, w: h.cw, color: 'accent', lang: ctx.lang, delay: 0.1, a: 'count', name: 'stat' }), anim: anim('count', 0.1, 1.2) });
      if (c.label) items.push(textLayer(h, { name: 'label', text: c.label, role: 'h2', x: h.m, y: 0, w: h.cw, lang: ctx.lang, delay: 0.3 }));
      if (c.body) items.push(textLayer(h, { name: 'body', text: c.body, role: 'body-lg', x: h.m, y: 0, w: h.cw, color: 'fg2', lang: ctx.lang, delay: 0.45 }));
      const gap = Math.round(28 * h.s);
      const total = items.reduce((a, l) => a + l.h, 0) + gap * (items.length - 1);
      let y = ctx.theme === 'bullion' ? h.H - h.m - Math.round(100 * h.s) - total : Math.round((h.H - total) / 2);
      for (const l of items) { l.y = y; y += l.h + gap; }
      return [...items, ...pagerLayers(h, ctx)];
    },
  },

  quote: {
    name: 'Quote',
    description: 'A testimonial or memorable line with attribution.',
    fields: [
      { key: 'quote', label: 'Quote', type: 'textarea' },
      { key: 'author', label: 'Author', type: 'text' },
      { key: 'role', label: 'Role / context', type: 'text' },
    ],
    example: { quote: 'I bought my first gram for my daughter. It took less than a minute.', author: 'Aisha', role: 'Sample testimonial' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const items = [];
      const markW = Math.round(140 * h.s);
      items.push(L('text', { name: 'mark', text: ctx.lang === 'ar' ? '”' : '“', role: 'stat', x: h.X(h.m - 8 * h.s, markW), y: 0, w: markW, h: Math.round(150 * h.s), color: 'accent', anim: anim('scale', 0), dir: 'ltr', align: 'start' }));
      items.push(textLayer(h, { text: c.quote || '', role: 'h2', x: h.m, y: 0, w: h.cw, lang: ctx.lang, delay: 0.12, name: 'quote' }));
      const who = [c.author, c.role].filter(Boolean).join(' · ');
      if (who) items.push(textLayer(h, { name: 'author', text: who, role: 'body', x: h.m, y: 0, w: h.cw, color: 'fg2', lang: ctx.lang, delay: 0.3 }));
      const gap = Math.round(28 * h.s);
      const total = items.reduce((a, l) => a + l.h, 0) + gap * (items.length - 1);
      let y = Math.round((h.H - total) / 2);
      for (const l of items) { l.y = y; y += l.h + gap; }
      return [...items, ...pagerLayers(h, ctx)];
    },
  },

  comparison: {
    name: 'Before / After',
    description: 'Two cards contrasting the old way and the new way.',
    fields: [
      { key: 'title', label: 'Title', type: 'textarea' },
      { key: 'beforeLabel', label: 'Left label', type: 'text' },
      { key: 'before', label: 'Left items (one per line)', type: 'list' },
      { key: 'afterLabel', label: 'Right label', type: 'text' },
      { key: 'after', label: 'Right items (one per line)', type: 'list' },
    ],
    example: { title: 'Gold, the old way vs Goldcom', beforeLabel: 'Before', before: ['Visit several shops', 'Unclear pricing', 'Store it at home'], afterLabel: 'With Goldcom', after: ['Buy from your phone', 'Live indicative prices', 'Hold, gift or collect'] },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const out = [];
      let y = h.m;
      const t = textLayer(h, { text: c.title || '', role: 'h2', x: h.m, y, w: h.cw, lang: ctx.lang, delay: 0, name: 'title' }); out.push(t);
      y += t.h + Math.round(56 * h.s);
      const stacked = !h.wide && h.H / h.W > 1.5;
      const gap = Math.round(28 * h.s);
      const bottom = h.H - h.m - (ctx.kind === 'video' ? 0 : 90 * h.s);
      const cards = [
        { label: c.beforeLabel || (ctx.lang === 'ar' ? 'قبل' : 'Before'), items: c.before || [], fill: 'surface', bullet: 'dash', fg: 'fg2' },
        { label: c.afterLabel || (ctx.lang === 'ar' ? 'مع جولدكم' : 'With Goldcom'), items: c.after || [], fill: 'surface', bullet: 'check', fg: 'auto', accent: true },
      ];
      const cw = stacked ? h.cw : (h.cw - gap) / 2;
      const ch = stacked ? (bottom - y - gap) / 2 : bottom - y;
      cards.forEach((card, i) => {
        const cx = stacked ? h.m : h.m + i * (cw + gap);
        const cy = stacked ? y + i * (ch + gap) : y;
        const pad = Math.round(40 * h.s);
        out.push(L('shape', { name: `card${i}`, shape: 'rect', fill: card.fill, stroke: card.accent ? 'accent' : '', radius: Math.round(28 * h.s), facet: !!card.accent, x: h.X(cx, cw), y: cy, w: cw, h: ch, anim: anim('fade-up', 0.15 + i * 0.15) }));
        out.push(textLayer(h, { text: card.label, role: 'overline', x: cx + pad, y: cy + pad, w: cw - 2 * pad, color: card.accent ? 'accent' : 'fg2', lang: ctx.lang, delay: 0.2 + i * 0.15 }));
        out.push(L('list', { name: `list${i}`, items: card.items, bullet: card.bullet, role: 'body', color: card.fg, x: h.X(cx + pad, cw - 2 * pad), y: cy + pad + 60 * h.s, w: cw - 2 * pad, h: ch - 2 * pad - 60 * h.s, dir: ctx.lang === 'ar' ? 'rtl' : 'ltr', anim: anim('fade-up', 0.3 + i * 0.15) }));
      });
      out.push(...pagerLayers(h, ctx));
      return out;
    },
  },

  code: {
    name: 'Code',
    description: 'A code snippet card with title and caption. Great for showcasing a developer project built with Claude Code.',
    fields: [
      { key: 'kicker', label: 'Kicker', type: 'text' },
      { key: 'title', label: 'Title', type: 'textarea' },
      { key: 'code', label: 'Code', type: 'code' },
      { key: 'filename', label: 'File name', type: 'text' },
      { key: 'caption', label: 'Caption', type: 'textarea' },
    ],
    example: { kicker: 'Under the hood', title: 'One call to buy a gram', code: "const order = await goldcom.buy({\n  grams: 1,\n  purity: '999.9',\n});", filename: 'buy.ts', caption: 'Illustrative code sample.' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const out = [];
      let y = h.m;
      if (c.kicker) { const k = textLayer(h, { name: 'kicker', text: c.kicker, role: 'overline', x: h.m, y, w: h.cw, color: 'accent', lang: ctx.lang, delay: 0 }); out.push(k); y += k.h + 14 * h.s; }
      const t = textLayer(h, { text: c.title || '', role: 'h2', x: h.m, y, w: h.cw, lang: ctx.lang, delay: 0.1, name: 'title' }); out.push(t); y += t.h + 48 * h.s;
      const lines = String(c.code || '').split('\n').length;
      const codeH = Math.min(h.H - y - h.m - 160 * h.s, Math.round((lines * 26 * 1.6 + 150) * h.s));
      out.push(L('code', { name: 'code', code: c.code || '', title: c.filename || 'index.ts', x: h.m, y, w: h.cw, h: codeH, anim: anim('type', 0.25, 1.6) }));
      y += codeH + 28 * h.s;
      if (c.caption) out.push(textLayer(h, { name: 'caption', text: c.caption, role: 'small', x: h.m, y, w: h.cw, color: 'fg2', lang: ctx.lang, delay: 0.5 }));
      out.push(...pagerLayers(h, ctx));
      return out;
    },
  },

  price: {
    name: 'Price card',
    description: 'Gold price card: label, indicative price, change badge and chart. Adds the mandatory disclaimer.',
    fields: [
      { key: 'title', label: 'Title', type: 'textarea' },
      { key: 'label', label: 'Price label', type: 'text' },
      { key: 'price', label: 'Price (OMR, 3 decimals)', type: 'text' },
      { key: 'change', label: 'Change (e.g. +0.42%)', type: 'text' },
      { key: 'time', label: 'Timestamp', type: 'text' },
    ],
    example: { title: 'Know your price before you buy', label: 'Gold 24K · per gram', price: 'OMR 31.204', change: '+0.42%', time: 'Indicative · 14:05' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const out = [];
      let y = h.m;
      const t = textLayer(h, { text: c.title || '', role: 'h1', x: h.m, y, w: h.cw, lang: ctx.lang, delay: 0, name: 'title' }); out.push(t);
      y += t.h + 56 * h.s;
      const pad = Math.round(44 * h.s);
      const cardH = Math.min(Math.round(760 * h.s), h.H - y - h.m - 200 * h.s);
      out.push(L('shape', { name: 'card', shape: 'rect', fill: 'surface', radius: Math.round(32 * h.s), x: h.m, y, w: h.cw, h: cardH, anim: anim('fade-up', 0.1) }));
      const ix = h.m + pad;
      const iw = h.cw - 2 * pad;
      out.push(textLayer(h, { text: c.label || '', role: 'small', x: ix, y: y + pad, w: iw * 0.6, color: 'fg2', lang: ctx.lang, delay: 0.2 }));
      out.push(textLayer(h, { text: c.time || '', role: 'caption', x: ix + iw * 0.5, y: y + pad + 4 * h.s, w: iw * 0.5, align: 'end', color: 'fg2', lang: ctx.lang, delay: 0.2 }));
      const pr = textLayer(h, { text: c.price || '', role: 'price', x: ix, y: y + pad + 56 * h.s, w: iw * 0.68, lang: 'en', delay: 0.25, name: 'price' });
      pr.anim = anim('count', 0.25, 1.1); pr.dir = 'ltr'; pr.x = h.X(ix, iw * 0.68); out.push(pr);
      const up = !String(c.change || '').trim().startsWith('-') && !String(c.change || '').trim().startsWith('−');
      const bw = Math.round(200 * h.s);
      out.push(L('badge', { name: 'change', text: `${up ? '▲' : '▼'} ${c.change || ''}`, variant: up ? 'gain' : 'loss', gem: false, x: h.X(ix + iw - bw, bw), y: y + pad + 70 * h.s, w: bw, h: Math.round(56 * h.s), dir: 'ltr', anim: anim('fade', 0.5) }));
      const chY = y + pad + 200 * h.s;
      out.push(L('chart', { name: 'chart', trend: up ? 'up' : 'down', x: ix, y: chY, w: iw, h: y + cardH - pad - chY, anim: anim('draw', 0.4, 1.4) }));
      out.push(disclaimerLayer(h, ctx, h.H - h.m - (ctx.kind === 'video' ? 0 : 70 * h.s)));
      out.push(...pagerLayers(h, ctx));
      return out;
    },
  },

  image: {
    name: 'Full image',
    description: 'Full-bleed photo with a scrim and headline at the bottom.',
    fields: [
      { key: 'image', label: 'Image', type: 'asset' },
      { key: 'kicker', label: 'Kicker', type: 'text' },
      { key: 'title', label: 'Headline', type: 'textarea' },
    ],
    example: { kicker: 'Eid gifting', title: 'A gift that lasts' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const out = [L('image', { name: 'image', src: c.image || '', x: 0, y: 0, w: h.W, h: h.H, radius: 0, scrim: true, anim: anim('scale', 0, 1.2) })];
      const items = [];
      if (c.kicker) items.push(textLayer(h, { name: 'kicker', text: c.kicker, role: 'overline', x: h.m, y: 0, w: h.cw, color: 'spark', lang: ctx.lang, delay: 0.2 }));
      items.push(textLayer(h, { text: c.title || '', role: 'display', x: h.m, y: 0, w: h.cw, color: 'white', lang: ctx.lang, delay: 0.3, name: 'title' }));
      const gap = Math.round(18 * h.s);
      const total = items.reduce((a, l) => a + l.h, 0) + gap * (items.length - 1);
      let y = h.H - h.m - (ctx.kind === 'video' ? 0 : 90 * h.s) - total;
      for (const l of items) { l.y = y; y += l.h + gap; }
      out.push(...items);
      out.push(logoLayer(h, { width: Math.round(220 * h.s), x: h.m, y: h.m, mode: 'mono-white' }));
      out.push(...pagerLayers(h, ctx));
      return out;
    },
  },

  cta: {
    name: 'Call to action',
    description: 'Closing slide: headline, supporting line, one button, link/handle and the logo. Optional disclaimer.',
    fields: [
      { key: 'title', label: 'Headline', type: 'textarea' },
      { key: 'subtitle', label: 'Supporting line', type: 'textarea' },
      { key: 'button', label: 'Button', type: 'text' },
      { key: 'link', label: 'Link / handle', type: 'text' },
      { key: 'disclaimer', label: 'Disclaimer', type: 'select', options: ['no', 'yes'] },
    ],
    example: { title: 'Start your gold story today', subtitle: 'Download Goldcom on the App Store and Google Play.', button: 'Download the app', link: 'goldcom.om', disclaimer: 'yes' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const items = [];
      const lw = Math.round((h.wide ? 220 : 300) * h.s);
      const logo = logoLayer(h, { variant: 'stacked', width: lw, align: 'center', y: 0 });
      items.push(logo);
      items.push(textLayer(h, { text: c.title || '', role: 'h1', x: h.m, y: 0, w: h.cw, align: 'center', lang: ctx.lang, delay: 0.15, name: 'title' }));
      if (c.subtitle) items.push(textLayer(h, { name: 'subtitle', text: c.subtitle, role: 'body-lg', x: h.m, y: 0, w: h.cw, align: 'center', color: 'fg2', lang: ctx.lang, delay: 0.3 }));
      if (c.button) {
        const bw = Math.min(h.cw, Math.round((c.button.length * 22 + 140) * h.s));
        items.push(L('button', { name: 'button', text: c.button, x: (h.W - bw) / 2, y: 0, w: bw, h: Math.round(104 * h.s), dir: ctx.lang === 'ar' ? 'rtl' : 'ltr', anim: anim('fade-up', 0.45) }));
      }
      if (c.link) items.push(textLayer(h, { name: 'link', text: c.link, role: 'body', x: h.m, y: 0, w: h.cw, align: 'center', color: 'accent', lang: ctx.lang, delay: 0.55 }));
      const gaps = Math.round(36 * h.s);
      const total = items.reduce((a, l) => a + l.h, 0) + gaps * (items.length - 1);
      const discSpace = c.disclaimer === 'yes' ? 170 * h.s : 0;
      let y = Math.max(h.m, Math.round((h.H - discSpace - total) / 2));
      for (const l of items) { l.y = y; y += l.h + gaps; }
      const out = [...items];
      if (c.disclaimer === 'yes') out.push(disclaimerLayer(h, ctx, h.H - h.m - (ctx.kind === 'video' ? 0 : 70 * h.s)));
      out.push(...pagerLayers(h, ctx));
      return out;
    },
  },
};

function listLayout(c, ctx, bullet) {
  const h = ctxHelpers(ctx);
  const out = [];
  let y = h.m + (h.wide ? 0 : Math.round(40 * h.s));
  if (c.kicker) { const k = textLayer(h, { name: 'kicker', text: c.kicker, role: 'overline', x: h.m, y, w: h.cw, color: 'accent', lang: ctx.lang, delay: 0 }); out.push(k); y += k.h + 14 * h.s; }
  const t = textLayer(h, { text: c.title || '', role: 'h1', x: h.m, y, w: h.cw, lang: ctx.lang, delay: 0.1, name: 'title' }); out.push(t);
  y += t.h + Math.round(64 * h.s);
  const items = Array.isArray(c.items) ? c.items : String(c.items || '').split('\n').filter(Boolean);
  out.push(L('list', { name: 'items', items, bullet, role: items.length > 4 ? 'body' : 'body-lg', x: h.m, y, w: h.cw, h: h.H - y - h.m - (ctx.kind === 'video' ? 0 : 90 * h.s), dir: ctx.lang === 'ar' ? 'rtl' : 'ltr', anim: anim('fade-up', 0.25) }));
  out.push(...pagerLayers(h, ctx));
  return out;
}

export const TEMPLATE_IDS = Object.keys(TEMPLATES);

/** Build layers for a slide from its template + content. */
export function applyTemplate(slide, doc, index, total) {
  const tpl = TEMPLATES[slide.template];
  if (!tpl) return slide;
  const content = { ...(slide.content || {}) };
  const ctx = { W: doc.width, H: doc.height, lang: content.lang || doc.lang || 'ar', theme: slide.theme, index, total, kind: doc.kind, format: doc.format };
  let layers = tpl.layout(content, ctx).map((l) => ({ ...l, x: Math.round(l.x), y: Math.round(l.y), w: Math.round(l.w), h: Math.round(l.h) }));
  // Keep the pager clear of devices or images that bleed off the bottom: move it to the top-end corner.
  const pager = layers.find((l) => l.type === 'pager');
  if (pager && layers.some((l) => l !== pager && ['phone', 'browser', 'image', 'goldbar'].includes(l.type) && l.y + l.h > pager.y - 10 && l.x < pager.x + pager.w && l.x + l.w > pager.x)) {
    const m = Math.round(80 * Math.min(doc.width, doc.height) / 1080);
    const rtl = ctx.lang === 'ar';
    const logo = layers.find((l) => l.type === 'logo' && l.y < m * 2.5);
    const y = logo ? Math.round(logo.y + (logo.h - pager.h) / 2) : m;
    layers = layers.map((l) => (l === pager ? { ...l, x: rtl ? m : doc.width - m - l.w, y, align: 'end' } : l));
  }
  return { ...slide, layers, custom: false };
}

/** Re-apply templates to every template-based slide that has not been hand-edited. */
export function applyAllTemplates(doc, { force = false } = {}) {
  const total = doc.slides.length;
  return { ...doc, slides: doc.slides.map((s, i) => (s.template && (force || !s.custom) ? applyTemplate(s, doc, i, total) : s)) };
}

/** A compact, model-friendly description of every template. */
export function templateCatalog() {
  return TEMPLATE_IDS.map((id) => ({
    id,
    name: TEMPLATES[id].name,
    description: TEMPLATES[id].description,
    fields: TEMPLATES[id].fields.map((f) => ({ key: f.key, type: f.type, label: f.label, options: f.options })),
    example: TEMPLATES[id].example,
  }));
}

/** Update the text/media of a hand-edited slide without re-running the layout. */
export function patchContent(slide, content) {
  const listOf = (v) => (Array.isArray(v) ? v : String(v || '').split('\n').filter(Boolean));
  const layers = slide.layers.map((l) => {
    switch (l.name) {
      case 'device': return { ...l, src: content.screenshot ?? l.src, url: content.url ?? l.url };
      case 'image': return { ...l, src: content.image ?? l.src };
      case 'code': return { ...l, code: content.code ?? l.code, title: content.filename ?? l.title };
      case 'button': return { ...l, text: content.button ?? l.text };
      case 'items': return content.items !== undefined ? { ...l, items: listOf(content.items) } : l;
      case 'list0': return content.before !== undefined ? { ...l, items: listOf(content.before) } : l;
      case 'list1': return content.after !== undefined ? { ...l, items: listOf(content.after) } : l;
      default:
        if (l.type === 'text' && l.name && content[l.name] !== undefined && typeof content[l.name] !== 'object') return { ...l, text: String(content[l.name]) };
        return l;
    }
  });
  return { ...slide, content, layers };
}

export const EXAMPLES_AR = {
  cover: { kicker: 'جديد من جولدكم', title: 'ذهب حقيقي، *من جوالك*', subtitle: 'ابدأ من جرام واحد. تابع ذهبك، أهدِه، بِعه أو استلمه.', visual: 'device', device: 'phone' },
  statement: { kicker: 'التحدي', title: 'شراء الذهب لا يجب أن يكون *معقدًا*.', body: 'الأسعار تتغير، والتحقق من النقاء صعب، والتخزين غير مريح.' },
  feature: { icon: 'gift', kicker: 'الإهداء', title: 'أهدِ ذهبًا حقيقيًا في ثوانٍ', body: 'اختر الوزن، أضف رسالتك، وتصل هديتك فورًا.', device: 'phone' },
  screenshot: { title: 'تصفح أسعار الذهب الفورية', caption: 'أسعار استرشادية تتحدث على مدار اليوم.', device: 'phone', label: 'yes' },
  steps: { kicker: 'كيف تعمل', title: 'امتلك الذهب في ثلاث خطوات', items: ['اختر سبيكة معتمدة من 1 جرام', 'ثبّت السعر عند الشراء', 'احتفظ بها، أهدِها، بِعها أو استلمها'] },
  list: { kicker: 'لماذا جولدكم', title: 'صُمّم للملكية الحقيقية', items: ['سبائك وعملات ذهبية معتمدة عيار 24', 'أسعار مباشرة استرشادية', 'بالعربية والإنجليزية', 'بإشراف استشاري شرعي من التزام'], bullet: 'gem' },
  stat: { kicker: 'ابدأ بخطوة صغيرة', stat: '1', label: 'جرام واحد يكفي لتمتلك ذهبًا حقيقيًا', body: 'سبائك معتمدة عيار 24 تبدأ من جرام واحد.' },
  quote: { quote: 'اشتريت أول جرام لابنتي، واستغرق الأمر أقل من دقيقة.', author: 'عائشة', role: 'شهادة توضيحية' },
  comparison: { title: 'الذهب بالطريقة التقليدية مقابل جولدكم', beforeLabel: 'قبل', before: ['زيارة عدة محلات', 'أسعار غير واضحة', 'تخزينه في المنزل'], afterLabel: 'مع جولدكم', after: ['اشترِ من جوالك', 'أسعار مباشرة استرشادية', 'احتفظ به، أهدِه أو استلمه'] },
  code: { kicker: 'خلف الكواليس', title: 'جرام واحد بطلب واحد', code: "const order = await goldcom.buy({\n  grams: 1,\n  purity: '999.9',\n});", filename: 'buy.ts', caption: 'مثال برمجي توضيحي.' },
  price: { title: 'اعرف سعرك قبل أن تشتري', label: 'ذهب عيار 24 · للجرام', price: 'OMR 31.204', change: '+0.42%', time: 'استرشادي · 14:05' },
  image: { kicker: 'هدايا العيد', title: 'هدية تدوم' },
  cta: { title: 'ابدأ قصتك مع الذهب اليوم', subtitle: 'حمّل جولدكم من App Store و Google Play.', button: 'حمّل التطبيق', link: 'goldcom.om', disclaimer: 'yes' },
};

export const exampleFor = (id, lang) => (lang === 'ar' ? EXAMPLES_AR[id] : null) || TEMPLATES[id]?.example || {};
