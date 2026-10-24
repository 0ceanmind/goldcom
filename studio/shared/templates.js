// On-brand slide templates. A template turns semantic content ({ title, body, items, screenshot, ... })
// into positioned layers for any format and language. Used by the editor and by Claude Code (MCP).
import { layerDefaults, uid } from './schema.js';
import { TYPE, ARABIC_LH, DISCLAIMER, THEMES, SAFE_ZONES } from './brand.js';

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
  if (ctx.noPager) return [];
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
    return [L('goldbar', { name: 'visual', label: c.barLabel || '1 g', sub: 'FINE GOLD\n999.9', x: (h.W - bw) / 2, y: box.y + (box.h - bh) / 2, w: bw, h: bh, rotation: c.tilt ?? -6, anim: anim('scale', 0.3, 0.8) })];
  }
  if (c.image && !c.screenshot && v !== 'device') {
    return [L('image', { name: 'image', src: c.image, x: box.x ?? h.m, y: box.y, w: box.w ?? h.cw, h: box.h, radius: Math.round(28 * h.s), facet: true, anim: anim('fade-up', 0.3, 0.8) })];
  }
  return [deviceLayer(h, ctx, c, { x: box.x ?? h.m, y: box.y, w: box.w ?? h.cw, maxH: box.bleed ? undefined : box.h, delay: 0.3 })];
}

// ---------- 3D scene registry ----------
// Scene modules live in studio/modules/scenes/. The server, the MCP server and the editor register their metadata
// here so the "scene" template knows where each scene leaves room for text.
let SCENES = {};
export function setSceneRegistry(list = []) { SCENES = Object.fromEntries((list || []).filter((m) => m && m.id).map((m) => [m.id, m])); }
export const sceneMeta = (id) => SCENES[id] || null;
export const sceneList = () => Object.values(SCENES);

// ---------- templates ----------
export const TEMPLATES = {
  scene: {
    name: '3D visual',
    description: 'Visual-first: one full-bleed 3D scene shows the idea, with at most one short line. Pick a scene module (see list_scenes / studio_guide) and set its params. Use this for most posts, Reels and Stories.',
    fields: [
      { key: 'scene', label: 'Scene', type: 'scene' },
      { key: 'params', label: 'Scene settings', type: 'scene-params' },
      { key: 'title', label: 'One line, optional (*word* = accent)', type: 'textarea' },
      { key: 'caption', label: 'Small print (date, "indicative", handle)', type: 'text' },
      { key: 'textZone', label: 'Text position', type: 'select', options: ['auto', 'top', 'bottom'] },
      { key: 'align', label: 'Align', type: 'select', options: ['auto', 'start', 'center'] },
      { key: 'disclaimer', label: 'Risk disclaimer', type: 'select', options: ['no', 'yes'] },
    ],
    example: { scene: 'bar-hero', params: { weight: '10 g' }, title: 'Real gold. *Yours.*' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const meta = sceneMeta(c.scene) || {};
      const zone = c.textZone && c.textZone !== 'auto' ? c.textZone : meta.textZone || 'top';
      const out = [L('scene3d', { name: 'scene', scene: c.scene || 'bar-hero', params: c.params || {}, x: 0, y: 0, w: h.W, h: ctx.H, bleed: 'full', focusY: Number.isFinite(Number(c.focusY)) && c.focusY !== '' ? Number(c.focusY) : meta.focusY ?? (zone === 'bottom' ? 0.44 : 0.6), seamless: c.seamless === 'yes' || ctx.kind === 'motion', anim: anim('none', 0) })];
      const title = String(c.title || '').trim();
      const align = c.align && c.align !== 'auto' ? c.align : zone === 'bottom' ? 'center' : 'start';
      const w = h.wide ? Math.round(h.cw * 0.6) : h.cw;
      const blocks = [];
      // One line, large: the scale contrast with the small print is what makes it read as designed.
      if (title) blocks.push(textLayer(h, { name: 'title', text: title, role: title.replace(/\*/g, '').length <= 20 ? 'display' : 'h1', x: h.m, y: 0, w, align, lang: ctx.lang, delay: 0.6, a: 'rise' }));
      if (c.caption) blocks.push(textLayer(h, { name: 'caption', text: c.caption, role: 'caption', x: h.m, y: 0, w, align, color: 'fg2', lang: ctx.lang, delay: 0.9, a: 'fade' }));
      const gap = Math.round(18 * h.s);
      const textH = blocks.reduce((a, l) => a + l.h, 0) + gap * Math.max(0, blocks.length - 1);
      const pagerSpace = ctx.noPager ? 0 : Math.round(90 * h.s);
      let bottom = ctx.H - h.m - pagerSpace;
      if (c.disclaimer === 'yes') { const d = disclaimerLayer(h, ctx, bottom); out.push(d); bottom = d.y - Math.round(28 * h.s); }
      let y = zone === 'bottom' ? bottom - textH : h.m + Math.round(30 * h.s);
      for (const l of blocks) { l.y = y; y += l.h + gap; }
      out.push(...blocks, ...pagerLayers(h, ctx));
      return out;
    },
  },
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
      const pagerSpace = ctx.noPager ? 0 : Math.round(90 * h.s);
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
      { key: 'placeholder', label: 'Mock screen when there is no screenshot', type: 'select', options: ['home', 'browse'] },
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
      const bottom = h.H - (ctx.noPager ? h.m : h.m + 80 * h.s) - (c.label === 'yes' ? 64 * h.s : 0);
      const dev = deviceLayer(h, ctx, c, { x: h.m, y, w: c.device === 'browser' ? h.cw : h.cw * 0.6, maxH: bottom - y, delay: 0.25 });
      out.push(dev);
      if (c.label === 'yes') {
        const text = ctx.lang === 'ar' ? 'شاشة توضيحية' : 'Illustrative screen';
        out.push(textLayer(h, { name: 'label', text, role: 'caption', x: h.m, y: dev.y + dev.h + 14 * h.s, w: h.cw, align: 'center', color: 'fg', lang: ctx.lang, delay: 0.5, a: 'fade' }));
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
      const bottom = h.H - h.m - (ctx.noPager ? 0 : 90 * h.s);
      const cards = [
        { label: c.beforeLabel || (ctx.lang === 'ar' ? 'قبل' : 'Before'), items: c.before || [], fill: 'surface', bullet: 'dash', fg: 'fg2' },
        { label: c.afterLabel || (ctx.lang === 'ar' ? 'مع جولدكم' : 'With Goldcom'), items: c.after || [], fill: 'surface', bullet: 'check', fg: 'auto', accent: true },
      ];
      const cw = stacked ? h.cw : (h.cw - gap) / 2;
      const need = Math.max(...cards.map((cd) => estimateList(cd.items, 'body', cw - 80 * h.s, h.s, ctx.lang, 'check'))) + 80 * h.s + 60 * h.s;
      const ch = Math.min(stacked ? (bottom - y - gap) / 2 : bottom - y, Math.max(need, 300 * h.s));
      cards.forEach((card, i) => {
        const cx = stacked ? h.m : h.m + i * (cw + gap);
        const cy = stacked ? y + i * (ch + gap) : y;
        const pad = Math.round(40 * h.s);
        out.push(L('shape', { name: `card${i}`, shape: 'rect', fill: card.fill, stroke: card.accent ? 'accent' : '', radius: Math.round(28 * h.s), facet: !!card.accent, x: h.X(cx, cw), y: cy, w: cw, h: ch, anim: anim('fade-up', 0.15 + i * 0.15) }));
        // Paired column labels share one case; one of them usually names Goldcom, which is never uppercased.
        out.push({ ...textLayer(h, { text: card.label, role: 'overline', x: cx + pad, y: cy + pad, w: cw - 2 * pad, color: card.accent ? 'accent' : 'fg2', lang: ctx.lang, delay: 0.2 + i * 0.15 }), upper: false });
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
    example: { title: 'Know your price before you buy', label: 'Gold 24K · per gram', price: 'OMR 31.204', change: '+0.42%', time: 'Indicative · 24 Oct 2026 · 14:05' },
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
      const tm = textLayer(h, { text: c.time || '', role: 'caption', x: ix + iw * 0.5, y: y + pad + 4 * h.s, w: iw * 0.5, align: 'end', color: 'fg2', lang: ctx.lang, delay: 0.2 }); out.push(tm);
      const pr = textLayer(h, { text: c.price || '', role: 'price', x: ix, y: y + pad + 56 * h.s, w: iw * 0.68, lang: 'en', delay: 0.25, name: 'price' });
      pr.anim = anim('count', 0.25, 1.1); pr.dir = ctx.lang === 'ar' ? 'rtl' : 'ltr'; pr.x = h.X(ix, iw * 0.68); out.push(pr);
      const up = !String(c.change || '').trim().startsWith('-') && !String(c.change || '').trim().startsWith('−');
      const bw = Math.round(200 * h.s);
      out.push(L('badge', { name: 'change', text: `${up ? '▲' : '▼'} ${c.change || ''}`, variant: up ? 'gain' : 'loss', gem: false, x: h.X(ix + iw - bw, bw), y: Math.max(y + pad + 70 * h.s, tm.y + tm.h + 14 * h.s), w: bw, h: Math.round(56 * h.s), dir: 'ltr', anim: anim('fade', 0.5) }));
      // A long time stamp wraps; the badge and chart move down with it instead of overlapping.
      const chY = Math.max(y + pad + 200 * h.s, tm.y + tm.h + 110 * h.s);
      out.push(L('chart', { name: 'chart', trend: up ? 'up' : 'down', x: ix, y: chY, w: iw, h: y + cardH - pad - chY, anim: anim('draw', 0.4, 1.4) }));
      out.push(disclaimerLayer(h, ctx, h.H - h.m - (ctx.noPager ? 0 : 70 * h.s)));
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
      let y = h.H - h.m - (ctx.noPager ? 0 : 90 * h.s) - total;
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
      if (c.disclaimer === 'yes') out.push(disclaimerLayer(h, ctx, h.H - h.m - (ctx.noPager ? 0 : 70 * h.s)));
      out.push(...pagerLayers(h, ctx));
      return out;
    },
  },
  'live-price': {
    name: 'Price board',
    description: 'Animated gold price board: Indicative badge, price that counts up, change, a drawing chart and a scrolling ticker. Adds the disclaimer.',
    fields: [
      { key: 'title', label: 'Title (optional)', type: 'text' },
      { key: 'live', label: 'Badge (default: Indicative)', type: 'text' },
      { key: 'label', label: 'Price label', type: 'text' },
      { key: 'price', label: 'Price (OMR, 3 decimals)', type: 'text' },
      { key: 'change', label: 'Change (e.g. +0.42%)', type: 'text' },
      { key: 'time', label: 'Timestamp', type: 'text' },
      { key: 'ticker', label: 'Ticker items (one per line)', type: 'list' },
    ],
    example: { label: 'Gold 24K · per gram', price: 'OMR 31.204', change: '+0.42%', time: '24 Oct 2026 · 14:05', ticker: ['24K · 1 g  OMR 31.204 ▲ +0.42%', '24K · 10 g  OMR 312.040 ▲ +0.42%', '24K · 1 oz  OMR 970.552 ▲ +0.42%'] },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const out = [];
      const lw = Math.round(220 * h.s);
      const logo = logoLayer(h, { width: lw, x: h.m, y: h.m });
      out.push(logo);
      const bw = Math.round(170 * h.s), bh = Math.round(60 * h.s);
      const animated = ['reel', 'story', 'motion', 'video'].includes(ctx.kind);
      // Always "Indicative": a posted price is a snapshot, never live (brand hard rule 7).
      out.push(L('badge', { name: 'live', variant: 'spark', gem: true, text: c.live && !/^(live|مباشر)$/i.test(String(c.live).trim()) ? c.live : (ctx.lang === 'ar' ? 'استرشادي' : 'Indicative'), x: h.X(h.W - h.m - bw, bw), y: logo.y + (logo.h - bh) / 2, w: bw, h: bh, dir: ctx.lang === 'ar' ? 'rtl' : 'ltr', anim: anim('pop', 0.1) }));
      let y = h.m + Math.round(190 * h.s);
      if (c.title) { const t = textLayer(h, { name: 'title', text: c.title, role: 'h2', x: h.m, y, w: h.cw, lang: ctx.lang, delay: 0.1, a: 'rise' }); out.push(t); y += t.h + 30 * h.s; }
      const lab = textLayer(h, { name: 'label', text: c.label || '', role: 'body', x: h.m, y, w: h.cw * 0.6, color: 'fg2', lang: ctx.lang, delay: 0.15 }); out.push(lab);
      out.push(textLayer(h, { name: 'time', text: c.time || '', role: 'caption', x: h.m + h.cw * 0.5, y: y + 6 * h.s, w: h.cw * 0.5, align: 'end', color: 'fg2', lang: ctx.lang, delay: 0.15 }));
      y += lab.h + 6 * h.s;
      const pw = Math.round(h.cw * 0.72);
      const price = L('text', { name: 'price', text: c.price || '', role: 'price', size: 128, x: h.X(h.m, pw), y, w: pw, h: Math.round(150 * h.s), dir: ctx.lang === 'ar' ? 'rtl' : 'ltr', align: 'start', fit: true, anim: anim('count', 0.25, 1.2) });
      out.push(price);
      const up = !/^[-−]/.test(String(c.change || '').trim());
      const cw2 = Math.round(220 * h.s);
      out.push(L('badge', { name: 'change', text: `${up ? '▲' : '▼'} ${c.change || ''}`, variant: up ? 'gain' : 'loss', gem: false, x: h.X(h.m + h.cw - cw2, cw2), y: y + 40 * h.s, w: cw2, h: Math.round(62 * h.s), dir: 'ltr', anim: anim('pop', 0.6) }));
      y += price.h + 40 * h.s;
      const tickerH = animated && (Array.isArray(c.ticker) ? c.ticker.length : String(c.ticker || '').trim()) ? Math.round(96 * h.s) : 0;
      const disc = disclaimerLayer(h, ctx, h.H - h.m);
      const tickerY = disc.y - tickerH - (tickerH ? 36 * h.s : 10 * h.s);
      out.push(L('chart', { name: 'chart', trend: up ? 'up' : 'down', x: h.m, y, w: h.cw, h: Math.max(120 * h.s, tickerY - y - 40 * h.s), anim: anim('draw', 0.4, 1.6), loop: { type: 'live' } }));
      const items = Array.isArray(c.ticker) ? c.ticker : String(c.ticker || '').split('\n').filter(Boolean);
      if (items.length && animated) out.push(L('ticker', { name: 'ticker', items, x: 0, y: tickerY, w: h.W, h: tickerH, dir: ctx.lang === 'ar' ? 'rtl' : 'ltr', anim: anim('fade', 0.8), loop: { type: 'live' } }));
      out.push(disc);
      out.push(...pagerLayers(h, ctx, { y: h.m }));
      return out;
    },
  },

  notification: {
    name: 'Notification',
    description: 'A push notification drops onto a phone, with a headline above. Shows a real moment in the app (gift received, price alert, order done).',
    fields: [
      { key: 'kicker', label: 'Kicker', type: 'text' },
      { key: 'title', label: 'Headline', type: 'textarea' },
      { key: 'body', label: 'Supporting line', type: 'textarea' },
      { key: 'notifTitle', label: 'Notification title', type: 'text' },
      { key: 'notifBody', label: 'Notification text', type: 'text' },
      { key: 'screenshot', label: 'Phone screenshot', type: 'asset' },
    ],
    example: { kicker: 'Gifting', title: 'The best kind of *notification*', body: 'Gold gifts arrive the moment they are sent.', notifTitle: 'You received a gold gift', notifBody: 'Aisha sent you 2.5 g of 24K gold.' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const out = [];
      let y = h.m;
      if (c.kicker) { const k = textLayer(h, { name: 'kicker', text: c.kicker, role: 'overline', x: h.m, y, w: h.cw, color: 'accent', lang: ctx.lang, delay: 0 }); out.push(k); y += k.h + 14 * h.s; }
      const t = textLayer(h, { name: 'title', text: c.title || '', role: 'h1', x: h.m, y, w: h.cw, lang: ctx.lang, delay: 0.1, a: 'rise' }); out.push(t); y += t.h + 18 * h.s;
      if (c.body) { const b = textLayer(h, { name: 'body', text: c.body, role: 'body-lg', x: h.m, y, w: h.cw, color: 'fg2', lang: ctx.lang, delay: 0.25 }); out.push(b); y += b.h; }
      const py = y + 70 * h.s;
      const phone = deviceLayer(h, ctx, { ...c, device: 'phone' }, { x: h.m, y: py, w: h.cw * 0.62, delay: 0.2 });
      out.push(phone);
      const nh = Math.round(200 * h.s);
      out.push(L('notification', { name: 'notif', title: c.notifTitle || '', body: c.notifBody || '', time: ctx.lang === 'ar' ? 'الآن' : 'now', x: h.m, y: py + phone.w * 0.2, w: h.cw, h: nh, dir: ctx.lang === 'ar' ? 'rtl' : 'ltr', anim: anim('drop', 0.9, 0.8), loop: { type: 'float', amount: 0.4 } }));
      out.push(L('tap', { name: 'tap', x: h.X(h.m + h.cw - 150 * h.s, 120 * h.s), y: py + phone.w * 0.2 + nh * 0.55, w: 120 * h.s, h: 120 * h.s, anim: anim('fade', 1.9, 0.3), loop: { type: 'pulse' } }));
      out.push(...pagerLayers(h, ctx));
      return out;
    },
  },

  sticker: {
    name: 'Story sticker',
    description: 'Instagram-style interactive sticker (poll, quiz, emoji slider, question box or countdown) under a short headline. Best for Stories.',
    fields: [
      { key: 'kicker', label: 'Kicker', type: 'text' },
      { key: 'title', label: 'Headline', type: 'textarea' },
      { key: 'sticker', label: 'Sticker', type: 'select', options: ['poll', 'quiz', 'slider', 'question', 'countdown'] },
      { key: 'question', label: 'Sticker question', type: 'text' },
      { key: 'options', label: 'Options (one per line)', type: 'list' },
      { key: 'result', label: 'Show poll results % (comma separated, leave empty before voting)', type: 'text' },
      { key: 'reveal', label: 'Reveal quiz answer', type: 'select', options: ['no', 'yes'] },
      { key: 'correct', label: 'Quiz correct option (1, 2, 3…)', type: 'text' },
      { key: 'emoji', label: 'Slider emoji', type: 'text' },
      { key: 'note', label: 'Note under sticker', type: 'text' },
      { key: 'native', label: 'Use Instagram\'s own sticker (marks the space, not exported)', type: 'select', options: ['no', 'yes'] },
    ],
    example: { kicker: 'Your turn', title: 'Eid gift: what would *you* pick?', sticker: 'poll', question: 'Gold or cash?', options: ['Gold', 'Cash'], note: 'Tap to vote' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const out = [L('sparkles', { name: 'sparkles', x: 0, y: 0, w: h.W, h: h.H * 0.55, count: 18, seed: 11, anim: anim('fade', 0, 1.2), loop: { type: 'shimmer' } })];
      let y = h.m + Math.round(40 * h.s);
      if (c.kicker) { const k = textLayer(h, { name: 'kicker', text: c.kicker, role: 'overline', x: h.m, y, w: h.cw, align: 'center', color: 'accent', lang: ctx.lang, delay: 0 }); out.push(k); y += k.h + 14 * h.s; }
      const t = textLayer(h, { name: 'title', text: c.title || '', role: 'h1', x: h.m, y, w: h.cw, align: 'center', lang: ctx.lang, delay: 0.1, a: 'words' }); out.push(t); y += t.h + 70 * h.s;
      const kind = c.sticker || 'poll';
      const sw = Math.round(h.cw * 0.86);
      const opts = Array.isArray(c.options) ? c.options : String(c.options || '').split('\n').filter(Boolean);
      const shH = Math.round((kind === 'quiz' ? 140 + Math.max(2, opts.length) * 98 : kind === 'countdown' ? 400 : kind === 'poll' ? 360 : 300) * h.s);
      const result = String(c.result || '').split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n));
      out.push(L('sticker', { name: 'sticker', guide: c.native === 'yes', kind, question: c.question || '', options: opts, result, showResults: result.length > 0, reveal: c.reveal === 'yes', correct: Math.max(0, (Number(c.correct) || 1) - 1), emoji: c.emoji || '✨', value: Number(c.value) || 0.82, x: (h.W - sw) / 2, y, w: sw, h: Math.min(shH, h.H - y - h.m - 120 * h.s), rotation: -2, dir: ctx.lang === 'ar' ? 'rtl' : 'ltr', anim: anim('pop', 0.45, 2.2), loop: { type: 'float', amount: 0.5 } }));
      if (c.note) out.push(textLayer(h, { name: 'note', text: c.note, role: 'body', x: h.m, y: y + shH + 40 * h.s, w: h.cw, align: 'center', color: 'fg2', lang: ctx.lang, delay: 0.9, a: 'fade' }));
      out.push(...pagerLayers(h, ctx));
      return out;
    },
  },

  countdown: {
    name: 'Countdown',
    description: 'Live countdown to an occasion or launch (National Day, Eid, a new feature). The seconds tick in videos.',
    fields: [
      { key: 'kicker', label: 'Kicker', type: 'text' },
      { key: 'title', label: 'Headline', type: 'textarea' },
      { key: 'days', label: 'Days', type: 'text' },
      { key: 'hours', label: 'Hours', type: 'text' },
      { key: 'minutes', label: 'Minutes', type: 'text' },
      { key: 'subtitle', label: 'Line under the countdown', type: 'textarea' },
    ],
    example: { kicker: 'Coming soon', title: 'Something *new* is on the way', days: '12', hours: '08', minutes: '45', subtitle: 'Turn on notifications so you hear it first.' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const items = [];
      const sym = Math.round(110 * h.s);
      items.push(L('logo', { name: 'symbol', variant: 'symbol', mode: 'auto', x: (h.W - sym * 0.79) / 2, y: 0, w: Math.round(sym * 0.79), h: sym, anim: anim('assemble', 0, 1.2), loop: { type: 'shimmer' } }));
      if (c.kicker) items.push(textLayer(h, { name: 'kicker', text: c.kicker, role: 'overline', x: h.m, y: 0, w: h.cw, align: 'center', color: 'accent', lang: ctx.lang, delay: 0.3 }));
      items.push(textLayer(h, { name: 'title', text: c.title || '', role: 'h1', x: h.m, y: 0, w: h.cw, align: 'center', lang: ctx.lang, delay: 0.4, a: 'rise' }));
      items.push(L('countdown', { name: 'countdown', days: Number(c.days) || 0, hours: Number(c.hours) || 0, minutes: Number(c.minutes) || 0, seconds: Number(c.seconds) || 59, x: h.m, y: 0, w: h.cw, h: Math.round(Math.min(260, h.cw * 0.3 / h.s) * h.s), dir: ctx.lang === 'ar' ? 'rtl' : 'ltr', anim: anim('fade-up', 0.6) }));
      if (c.subtitle) items.push(textLayer(h, { name: 'subtitle', text: c.subtitle, role: 'body-lg', x: h.m, y: 0, w: h.cw, align: 'center', color: 'fg2', lang: ctx.lang, delay: 0.8 }));
      const gap = Math.round(40 * h.s);
      const total = items.reduce((acc, l) => acc + l.h, 0) + gap * (items.length - 1);
      let y = ctx.theme === 'bullion' ? Math.max(h.m, Math.round(h.H - h.m - (ctx.noPager ? 0 : 80 * h.s) - total)) : Math.max(h.m, Math.round((h.H - total) / 2));
      for (const l of items) { l.y = y; y += l.h + gap; }
      if (ctx.theme === 'bullion') items[0].y = Math.min(items[0].y, Math.round(h.H * 0.2));
      return [L('sparkles', { name: 'sparkles', x: 0, y: 0, w: h.W, h: h.H, count: 22, seed: 4, anim: anim('fade', 0, 1.5), loop: { type: 'shimmer' } }), ...items, ...pagerLayers(h, ctx)];
    },
  },

  chat: {
    name: 'Chat',
    description: 'A short conversation that types itself out (customer question, gifting chat, support). Lines starting with ">" are Goldcom replies.',
    fields: [
      { key: 'kicker', label: 'Kicker', type: 'text' },
      { key: 'title', label: 'Headline', type: 'textarea' },
      { key: 'messages', label: 'Messages (one per line, ">" = Goldcom reply)', type: 'list' },
    ],
    example: { kicker: 'You asked', title: 'Two questions we hear every day', messages: ['What is the smallest amount I can buy?', '> One gram of 24K gold.', 'And can I hold the actual bar?', '> Yes. You can request collection in the app.'] },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const out = [];
      let y = h.m;
      if (c.kicker) { const k = textLayer(h, { name: 'kicker', text: c.kicker, role: 'overline', x: h.m, y, w: h.cw, color: 'accent', lang: ctx.lang, delay: 0 }); out.push(k); y += k.h + 14 * h.s; }
      const t = textLayer(h, { name: 'title', text: c.title || '', role: 'h2', x: h.m, y, w: h.cw, lang: ctx.lang, delay: 0.1, a: 'rise' }); out.push(t); y += t.h + 50 * h.s;
      const msgs = (Array.isArray(c.messages) ? c.messages : String(c.messages || '').split('\n')).filter((m) => (typeof m === 'string' ? m.trim() : m?.text)).map((m) => (typeof m === 'string' ? (m.trim().startsWith('>') ? { from: 'me', text: m.trim().slice(1).trim() } : { from: 'them', text: m.trim() }) : m));
      const bottom = h.H - h.m - (ctx.noPager ? 0 : 80 * h.s);
      // Size the panel to the conversation (same metrics as the chat renderer) so it never ends in empty space.
      const fs = 34 * h.s, pad = fs * 0.75, lh = fs * (ctx.lang === 'ar' ? 1.55 : 1.4), cw = h.cw - 40 * h.s;
      const need = msgs.reduce((acc, m) => acc + estimateText(m.text, 'body', cw * 0.78 - pad * 2, h.s, ctx.lang).lines * lh + pad * 1.3 + fs * 0.55, 0) + fs * 0.6;
      const chatH = Math.min(bottom - y - 40 * h.s, need);
      out.push(L('shape', { name: 'panel', shape: 'rect', fill: 'surface', radius: Math.round(36 * h.s), x: h.m - 20 * h.s, y: y - 30 * h.s, w: h.cw + 40 * h.s, h: chatH + 70 * h.s, facet: true, anim: anim('fade', 0.1) }));
      out.push(L('chat', { name: 'chat', messages: msgs, x: h.m + 20 * h.s, y, w: cw, h: chatH, dir: ctx.lang === 'ar' ? 'rtl' : 'ltr', anim: anim('type', 0.4, Math.max(2, msgs.length * 1.1)) }));
      out.push(...pagerLayers(h, ctx));
      return out;
    },
  },

  goal: {
    name: 'Savings goal',
    description: 'A progress ring that fills up (e.g. grams saved toward a goal), with a headline and short list.',
    fields: [
      { key: 'kicker', label: 'Kicker', type: 'text' },
      { key: 'title', label: 'Headline', type: 'textarea' },
      { key: 'value', label: 'Progress (0–100)', type: 'text' },
      { key: 'label', label: 'Ring label', type: 'text' },
      { key: 'sub', label: 'Ring sub-label', type: 'text' },
      { key: 'items', label: 'Points (one per line)', type: 'list' },
      { key: 'disclaimer', label: 'Risk disclaimer', type: 'select', options: ['no', 'yes'] },
    ],
    example: { kicker: 'A simple plan', title: 'Save toward a gift, *gram by gram*', value: '62', label: '6.2 g', sub: 'of 10 g', items: ['Pick a target weight', 'Buy a little at a time', 'Track it in your portfolio'] },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const out = [];
      let y = h.m;
      if (c.kicker) { const k = textLayer(h, { name: 'kicker', text: c.kicker, role: 'overline', x: h.m, y, w: h.cw, color: 'accent', lang: ctx.lang, delay: 0 }); out.push(k); y += k.h + 14 * h.s; }
      const t = textLayer(h, { name: 'title', text: c.title || '', role: 'h1', x: h.m, y, w: h.cw, lang: ctx.lang, delay: 0.1, a: 'rise' }); out.push(t); y += t.h + 50 * h.s;
      const items = Array.isArray(c.items) ? c.items : String(c.items || '').split('\n').filter(Boolean);
      const listH = items.length ? Math.round((items.length * 70 + 20) * h.s) : 0;
      const disc = c.disclaimer === 'yes' ? disclaimerLayer(h, ctx, h.H - h.m - (ctx.noPager ? 0 : 70 * h.s)) : null;
      if (disc) out.push(disc);
      const ring = Math.min(h.cw * 0.62, (disc ? disc.y - 30 * h.s : h.H - h.m - (ctx.noPager ? 0 : 90 * h.s)) - y - listH - 50 * h.s);
      out.push(L('progress', { name: 'ring', style: 'ring', value: Math.max(0, Math.min(100, Number(c.value) || 0)) / 100, label: c.label || '', sub: c.sub || '', x: (h.W - ring) / 2, y, w: ring, h: ring, dir: ctx.lang === 'ar' ? 'rtl' : 'ltr', anim: anim('draw', 0.3, 1.8), loop: { type: 'pulse', amount: 0.3 } }));
      y += ring + 50 * h.s;
      if (items.length) out.push(L('list', { name: 'items', items, bullet: 'gem', role: 'body-lg', x: h.m, y, w: h.cw, h: listH, dir: ctx.lang === 'ar' ? 'rtl' : 'ltr', anim: anim('fade-up', 0.9) }));
      out.push(...pagerLayers(h, ctx));
      return out;
    },
  },

  products: {
    name: 'Products',
    description: 'Grid of gold bars with weights and illustrative prices. Product showcase for posts and carousels.',
    fields: [
      { key: 'kicker', label: 'Kicker', type: 'text' },
      { key: 'title', label: 'Headline', type: 'textarea' },
      { key: 'products', label: 'Products (one per line: weight | price)', type: 'list' },
      { key: 'note', label: 'Note', type: 'text' },
      { key: 'disclaimer', label: 'Risk disclaimer', type: 'select', options: ['no', 'yes'] },
    ],
    example: { kicker: 'Choose your bar', title: 'From 1 g to 10 g', products: ['1 g | OMR 33.180', '2.5 g | OMR 81.910', '5 g | OMR 162.260', '10 g | OMR 321.400'], note: 'Illustrative prices. The live price is shown in the app.' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const out = [];
      let y = h.m;
      if (c.kicker) { const k = textLayer(h, { name: 'kicker', text: c.kicker, role: 'overline', x: h.m, y, w: h.cw, color: 'accent', lang: ctx.lang, delay: 0 }); out.push(k); y += k.h + 14 * h.s; }
      const t = textLayer(h, { name: 'title', text: c.title || '', role: 'h1', x: h.m, y, w: h.cw, lang: ctx.lang, delay: 0.1, a: 'rise' }); out.push(t); y += t.h + 46 * h.s;
      const rows = (Array.isArray(c.products) ? c.products : String(c.products || '').split('\n')).filter((r) => String(r).trim()).slice(0, 6).map((r) => String(r).split('|').map((x) => x.trim()));
      const cols = 2, gap = Math.round(24 * h.s);
      const nRows = Math.ceil(rows.length / cols) || 1;
      const disc = c.disclaimer === 'yes' ? disclaimerLayer(h, ctx, h.H - h.m - (ctx.noPager ? 0 : 70 * h.s)) : null;
      const bottom = (disc ? disc.y - 24 * h.s : h.H - h.m - (ctx.noPager ? 0 : 80 * h.s)) - (c.note ? 70 * h.s : 0);
      if (disc) out.push(disc);
      const cw = (h.cw - gap) / cols;
      const ch = Math.min(cw * 1.2, (bottom - y - gap * (nRows - 1)) / nRows);
      rows.forEach(([wgt, price], i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const cx = h.m + col * (cw + gap), cy = y + row * (ch + gap);
        const d = 0.2 + i * 0.12;
        out.push(L('shape', { name: `card${i}`, shape: 'rect', fill: 'surface', radius: Math.round(28 * h.s), x: h.X(cx, cw), y: cy, w: cw, h: ch, anim: anim('fade-up', d) }));
        const bh = ch * 0.5, bw = bh * 0.62;
        out.push(L('goldbar', { name: `bar${i}`, label: wgt, sub: '999.9', x: h.X(cx + (cw - bw) / 2, bw), y: cy + ch * 0.08, w: bw, h: bh, anim: anim('pop', d + 0.1, 0.7), loop: { type: 'shimmer', speed: 0.6 + (i % 3) * 0.15 } }));
        out.push(textLayer(h, { name: `w${i}`, text: ctx.lang === 'ar' ? `سبيكة ${wgt.replace(/\s*g$/i, '').replace(/\s*جرام$/, '')} جرام` : `Gold bar · ${wgt}`, role: 'h3', x: cx + 24 * h.s, y: cy + ch * 0.64, w: cw - 48 * h.s, align: 'center', lang: ctx.lang, delay: d + 0.2 }));
        if (price) out.push(L('text', { name: `p${i}`, text: price, role: 'body-lg', weight: 700, x: h.X(cx + 24 * h.s, cw - 48 * h.s), y: cy + ch * 0.8, w: cw - 48 * h.s, h: Math.round(56 * h.s), color: 'accent', align: 'center', dir: ctx.lang === 'ar' ? 'rtl' : 'ltr', fit: true, anim: anim('count', d + 0.25, 1) }));
      });
      if (c.note) out.push(textLayer(h, { name: 'note', text: c.note, role: 'caption', x: h.m, y: bottom + 24 * h.s, w: h.cw, color: 'fg2', lang: ctx.lang, delay: 0.8, a: 'fade' }));
      out.push(...pagerLayers(h, ctx));
      return out;
    },
  },

  kinetic: {
    name: 'Kinetic type',
    description: 'Big words that land line by line. A strong hook for the first seconds of a Reel, or a bold statement post.',
    fields: [
      { key: 'lines', label: 'Lines (one per line, *word* = accent)', type: 'list' },
      { key: 'caption', label: 'Small line at the bottom', type: 'text' },
    ],
    example: { lines: ['Real gold.', 'From your phone.', '*From one gram.*'], caption: 'Goldcom' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const lines = (Array.isArray(c.lines) ? c.lines : String(c.lines || '').split('\n')).filter((l) => String(l).trim()).slice(0, 5);
      const items = lines.map((ln, i) => {
        const l = textLayer(h, { name: `line${i}`, text: ln, role: 'display', x: h.m, y: 0, w: h.cw, lang: ctx.lang, delay: 0.15 + i * 0.55, a: 'words' });
        l.size = 120; const est = estimateText(ln, 'display', h.cw, h.s * 1.15, ctx.lang); l.h = Math.round(est.lines * 120 * h.s * (ctx.lang === 'ar' ? 1.25 : 1.08) + 8 * h.s);
        l.anim = { ...l.anim, dur: 0.7 };
        return l;
      });
      const gap = Math.round(4 * h.s);
      const total = items.reduce((acc, l) => acc + l.h, 0) + gap * Math.max(0, items.length - 1);
      let y = Math.round((h.H - total) / 2);
      for (const l of items) { l.y = y; y += l.h + gap; }
      const out = [...items];
      if (c.caption) out.push(textLayer(h, { name: 'caption', text: c.caption, role: 'overline', x: h.m, y: h.H - h.m - 40 * h.s - (ctx.noPager ? 0 : 70 * h.s), w: h.cw, color: 'accent', lang: ctx.lang, delay: 0.3 + lines.length * 0.55, a: 'fade' }));
      out.push(...pagerLayers(h, ctx));
      return out;
    },
  },

  'logo-sting': {
    name: 'Logo reveal',
    description: 'The Goldcom logo assembles piece by piece with a light sweep, then the tagline appears. Use as an intro or outro.',
    fields: [{ key: 'tagline', label: 'Tagline', type: 'text' }],
    example: { tagline: 'Real gold, from your phone' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const lw = Math.round((h.wide ? 300 : 440) * h.s);
      const logo = logoLayer(h, { variant: 'stacked', width: lw, align: 'center', y: 0 });
      logo.anim = anim('assemble', 0.1, 1.8); logo.loop = { type: 'shimmer', speed: 0.8 };
      const tag = c.tagline ? textLayer(h, { name: 'tagline', text: c.tagline, role: 'h3', x: h.m, y: 0, w: h.cw, align: 'center', color: 'fg2', lang: ctx.lang, delay: 1.7, a: 'rise' }) : null;
      const total = logo.h + (tag ? tag.h + 50 * h.s : 0);
      logo.y = Math.round((h.H - total) / 2);
      if (tag) tag.y = logo.y + logo.h + 50 * h.s;
      return [L('sparkles', { name: 'sparkles', x: 0, y: 0, w: h.W, h: h.H, count: 30, seed: 9, anim: anim('fade', 0.8, 1.5), loop: { type: 'shimmer' } }), logo, ...(tag ? [tag] : []), ...pagerLayers(h, ctx)];
    },
  },

  greeting: {
    name: 'Greeting',
    description: 'Occasion greeting (Eid, Ramadan, National Day, weddings) with sparkles, the gold symbol and the logo.',
    fields: [
      { key: 'kicker', label: 'Kicker', type: 'text' },
      { key: 'title', label: 'Greeting', type: 'textarea' },
      { key: 'body', label: 'Line', type: 'textarea' },
    ],
    example: { kicker: 'From all of us at Goldcom', title: 'Eid Mubarak', body: 'May your days be bright and your family close.' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const items = [];
      const sym = Math.round(150 * h.s);
      items.push(L('logo', { name: 'symbol', variant: 'symbol', mode: 'auto', x: (h.W - sym * 0.79) / 2, y: 0, w: Math.round(sym * 0.79), h: sym, anim: anim('assemble', 0, 1.4), loop: { type: 'float', amount: 0.6 } }));
      if (c.kicker) items.push(textLayer(h, { name: 'kicker', text: c.kicker, role: 'overline', x: h.m, y: 0, w: h.cw, align: 'center', color: 'accent', lang: ctx.lang, delay: 0.6 }));
      const t = textLayer(h, { name: 'title', text: c.title || '', role: 'display', x: h.m, y: 0, w: h.cw, align: 'center', lang: ctx.lang, delay: 0.8, a: 'blur' });
      t.anim = anim('blur', 0.8, 1.1); t.loop = { type: 'shimmer', speed: 0.5 };
      items.push(t);
      if (c.body) items.push(textLayer(h, { name: 'body', text: c.body, role: 'body-lg', x: h.m, y: 0, w: h.cw, align: 'center', color: 'fg2', lang: ctx.lang, delay: 1.3 }));
      const gap = Math.round(36 * h.s);
      const total = items.reduce((acc, l) => acc + l.h, 0) + gap * (items.length - 1);
      const logoSpace = 60 * h.s + (ctx.noPager ? 0 : 70 * h.s);
      let y = ctx.theme === 'bullion' ? Math.round(h.H - h.m - logoSpace - total) : Math.round((h.H - total) / 2) - Math.round(40 * h.s);
      for (const l of items) { l.y = y; y += l.h + gap; }
      if (ctx.theme === 'bullion') items[0].y = Math.min(items[0].y, Math.round(h.H * 0.18));
      // The symbol at the top is the brand mark here: no second logo (brand §3.4).
      return [L('sparkles', { name: 'sparkles', x: 0, y: 0, w: h.W, h: h.H, count: 40, seed: 3, anim: anim('fade', 0, 2), loop: { type: 'shimmer' } }), ...items, ...pagerLayers(h, ctx)];
    },
  },

  fact: {
    name: 'Fact',
    description: '"Did you know" card: a big fact, a plain explanation and a source line. Only use facts you can back up.',
    fields: [
      { key: 'kicker', label: 'Kicker', type: 'text' },
      { key: 'fact', label: 'The fact (big)', type: 'textarea' },
      { key: 'body', label: 'Explanation', type: 'textarea' },
      { key: 'source', label: 'Source / note', type: 'text' },
    ],
    example: { kicker: 'Did you know?', fact: '24K gold is at least *99.9%* pure', body: 'That is why bars and coins are 24K. Jewellery is usually 18K to 22K, mixed with other metals so it holds its shape.', source: 'Investment bars are often 999.9 fine (99.99%).' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const items = [];
      items.push(L('gem', { name: 'gem', x: h.X(h.m, 48 * h.s), y: 0, w: 48 * h.s, h: 48 * h.s, anim: anim('pop', 0), loop: { type: 'spin', speed: 0.4 } }));
      if (c.kicker) items.push(textLayer(h, { name: 'kicker', text: c.kicker, role: 'overline', x: h.m, y: 0, w: h.cw, color: 'accent', lang: ctx.lang, delay: 0.1 }));
      items.push(textLayer(h, { name: 'fact', text: c.fact || '', role: 'display', x: h.m, y: 0, w: h.cw, lang: ctx.lang, delay: 0.2, a: 'rise' }));
      if (c.body) items.push(textLayer(h, { name: 'body', text: c.body, role: 'body-lg', x: h.m, y: 0, w: h.cw, color: 'fg2', lang: ctx.lang, delay: 0.5 }));
      const gap = Math.round(34 * h.s);
      const total = items.reduce((acc, l) => acc + l.h, 0) + gap * (items.length - 1);
      let y = Math.round((h.H - total) / 2);
      for (const l of items) { l.y = y; y += l.h + gap; }
      const out = [...items];
      if (c.source) out.push(textLayer(h, { name: 'source', text: c.source, role: 'caption', x: h.m, y: h.H - h.m - 30 * h.s - (ctx.noPager ? 0 : 80 * h.s), w: h.cw, color: 'fg2', lang: ctx.lang, delay: 0.8, a: 'fade' }));
      out.push(...pagerLayers(h, ctx));
      return out;
    },
  },

  faq: {
    name: 'Q&A',
    description: 'One customer question and a clear, short answer. Good for FAQ carousels and Stories.',
    fields: [
      { key: 'kicker', label: 'Kicker', type: 'text' },
      { key: 'question', label: 'Question', type: 'textarea' },
      { key: 'answer', label: 'Answer', type: 'textarea' },
    ],
    example: { kicker: 'You asked', question: 'Can I collect my gold as a real bar?', answer: 'Yes. Request collection in the app and pick it up as a physical, certified bar.' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const out = [];
      let y = h.m + Math.round(30 * h.s);
      if (c.kicker) { const k = textLayer(h, { name: 'kicker', text: c.kicker, role: 'overline', x: h.m, y, w: h.cw, color: 'accent', lang: ctx.lang, delay: 0 }); out.push(k); y += k.h + 24 * h.s; }
      const q = textLayer(h, { name: 'question', text: c.question || '', role: 'h1', x: h.m, y, w: h.cw, lang: ctx.lang, delay: 0.1, a: 'words' }); out.push(q); y += q.h + 60 * h.s;
      const pad = Math.round(48 * h.s);
      const ans = textLayer(h, { name: 'answer', text: c.answer || '', role: 'body-lg', x: h.m + pad, y: y + pad, w: h.cw - pad * 2, lang: ctx.lang, delay: 0.7 });
      out.push(L('shape', { name: 'card', shape: 'rect', fill: 'surface', radius: Math.round(32 * h.s), facet: true, x: h.m, y, w: h.cw, h: ans.h + pad * 2, anim: anim('fade-up', 0.55) }));
      out.push(ans);
      out.push(...pagerLayers(h, ctx));
      return out;
    },
  },

  myth: {
    name: 'Myth vs fact',
    description: 'Clears up a common misconception: a myth card, then the fact card.',
    fields: [
      { key: 'title', label: 'Headline (optional)', type: 'text' },
      { key: 'myth', label: 'Myth', type: 'textarea' },
      { key: 'fact', label: 'Fact', type: 'textarea' },
    ],
    example: { title: 'Myth or fact?', myth: 'You need a lot of money to own gold.', fact: 'You can start with one gram and add more whenever you like.' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const out = [];
      const pad = Math.round(48 * h.s);
      const inner = h.cw - pad * 2;
      const cards = [['myth', c.myth, ctx.lang === 'ar' ? 'خرافة' : 'Myth', 'lossDark', 0.15], ['fact', c.fact, ctx.lang === 'ar' ? 'حقيقة' : 'Fact', 'gainDark', 0.9]].map(([key, text, label, col, d], i) => {
        const est = estimateText(text || '', 'h3', inner, h.s, ctx.lang);
        return { key, text, label, col, d, i, th: est.h, ch: pad * 2 + 90 * h.s + est.h };
      });
      const title = c.title ? textLayer(h, { name: 'title', text: c.title, role: 'h2', x: h.m, y: 0, w: h.cw, lang: ctx.lang, delay: 0, a: 'rise' }) : null;
      const gap = Math.round(30 * h.s);
      const total = (title ? title.h + 50 * h.s : 0) + cards.reduce((acc, cd) => acc + cd.ch, 0) + gap;
      const avail = h.H - h.m * 2 - (ctx.noPager ? 0 : 80 * h.s);
      let y = h.m + Math.max(0, (avail - total) * 0.42);
      if (title) { title.y = y; out.push(title); y += title.h + 50 * h.s; }
      for (const { key, text, label, col, d, i, th, ch } of cards) {
        out.push(L('shape', { name: `${key}Card`, shape: 'rect', fill: 'surface', stroke: i ? 'accent' : '', radius: Math.round(32 * h.s), facet: !!i, x: h.m, y, w: h.cw, h: ch, anim: anim(i ? 'pop' : 'fade-up', d) }));
        out.push(L('icon', { name: `${key}Icon`, icon: i ? 'check' : 'x', tile: false, color: col, x: h.X(h.m + pad, 56 * h.s), y: y + pad, w: 56 * h.s, h: 56 * h.s, anim: anim('pop', d + 0.1) }));
        out.push(textLayer(h, { name: `${key}Label`, text: label, role: 'overline', x: h.m + pad + 80 * h.s, y: y + pad + 14 * h.s, w: inner - 80 * h.s, color: i ? 'accent' : 'fg2', lang: ctx.lang, delay: d + 0.1 }));
        out.push(L('text', { name: key, text: text || '', role: 'h3', x: h.X(h.m + pad, inner), y: y + pad + 90 * h.s, w: inner, h: th, color: i ? 'auto' : 'fg2', dir: ctx.lang === 'ar' ? 'rtl' : 'ltr', fit: true, anim: anim('fade-up', d + 0.2) }));
        y += ch + gap;
      }
      out.push(...pagerLayers(h, ctx));
      return out;
    },
  },

  karat: {
    name: 'Karat guide',
    description: 'Gold purity explained with filling bars: karat, purity % and where it is used.',
    fields: [
      { key: 'kicker', label: 'Kicker', type: 'text' },
      { key: 'title', label: 'Headline', type: 'textarea' },
      { key: 'rows', label: 'Rows (one per line: karat | purity % | note)', type: 'list' },
    ],
    example: { kicker: 'Gold guide', title: 'What the karat number means', rows: ['24K | 99.9 | Bars and coins', '22K | 91.6 | Traditional jewellery', '21K | 87.5 | Everyday jewellery', '18K | 75.0 | Fine jewellery with stones'] },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const out = [];
      let y = h.m;
      if (c.kicker) { const k = textLayer(h, { name: 'kicker', text: c.kicker, role: 'overline', x: h.m, y, w: h.cw, color: 'accent', lang: ctx.lang, delay: 0 }); out.push(k); y += k.h + 14 * h.s; }
      const t = textLayer(h, { name: 'title', text: c.title || '', role: 'h1', x: h.m, y, w: h.cw, lang: ctx.lang, delay: 0.1, a: 'rise' }); out.push(t); y += t.h + 56 * h.s;
      const rows = (Array.isArray(c.rows) ? c.rows : String(c.rows || '').split('\n')).filter((r) => String(r).trim()).slice(0, 6).map((r) => String(r).split('|').map((x) => x.trim()));
      const bottom = h.H - h.m - (ctx.noPager ? 0 : 80 * h.s);
      const rowH = Math.min(190 * h.s, (bottom - y) / Math.max(1, rows.length));
      rows.forEach(([k, pct, note], i) => {
        const ry = y + i * rowH;
        out.push(L('progress', { name: `bar${i}`, style: 'bar', value: (Number(pct) || 0) / 100, label: k, sub: `${pct}%`, x: h.m, y: ry, w: h.cw, h: Math.round(rowH * 0.5), dir: ctx.lang === 'ar' ? 'rtl' : 'ltr', anim: anim('draw', 0.3 + i * 0.2, 1.2) }));
        if (note) out.push(textLayer(h, { name: `note${i}`, text: note, role: 'small', x: h.m, y: ry + rowH * 0.56, w: h.cw, color: 'fg2', lang: ctx.lang, delay: 0.5 + i * 0.2 }));
      });
      out.push(...pagerLayers(h, ctx));
      return out;
    },
  },
};

/** Height a list will need, so short lists can be centred instead of leaving a gap below. */
function estimateList(items, role, w, s, lang, bullet) {
  const t = TYPE[role] || TYPE.body;
  const size = t.size * s;
  const lh = size * t.lh * (lang === 'ar' ? ARABIC_LH : 1);
  const gap = size * (bullet === 'number' ? 1 : 0.75);
  const indent = size * (bullet === 'number' ? 2.1 : 1.7);
  return Math.ceil(items.reduce((acc, it) => acc + Math.max(estimateText(it, role, w - indent, s, lang).lines * lh, bullet === 'number' ? size * 1.5 : 0), 0) + gap * Math.max(0, items.length - 1) + size * 0.4);
}

function listLayout(c, ctx, bullet) {
  const h = ctxHelpers(ctx);
  const out = [];
  let y = h.m + (h.wide ? 0 : Math.round(40 * h.s));
  if (c.kicker) { const k = textLayer(h, { name: 'kicker', text: c.kicker, role: 'overline', x: h.m, y, w: h.cw, color: 'accent', lang: ctx.lang, delay: 0 }); out.push(k); y += k.h + 14 * h.s; }
  const t = textLayer(h, { text: c.title || '', role: 'h1', x: h.m, y, w: h.cw, lang: ctx.lang, delay: 0.1, name: 'title' }); out.push(t);
  y += t.h + Math.round(64 * h.s);
  const items = Array.isArray(c.items) ? c.items : String(c.items || '').split('\n').filter(Boolean);
  const role = items.length > 4 ? 'body' : 'body-lg';
  const avail = h.H - y - h.m - (ctx.noPager ? 0 : 90 * h.s);
  out.push(L('list', { name: 'items', items, bullet, role, x: h.m, y, w: h.cw, h: Math.min(avail, estimateList(items, role, h.cw, h.s, ctx.lang, bullet)), dir: ctx.lang === 'ar' ? 'rtl' : 'ltr', anim: anim('fade-up', 0.25) }));
  out.push(...pagerLayers(h, ctx));
  return out;
}

export const TEMPLATE_IDS = Object.keys(TEMPLATES);

/** Build layers for a slide from its template + content. */
const CENTERED = new Set(['list', 'steps', 'faq', 'feature', 'code', 'comparison', 'chat']);

export function applyTemplate(slide, doc, index, total, band = 0) {
  const tpl = TEMPLATES[slide.template];
  if (!tpl) return slide;
  const content = { ...(slide.content || {}) };
  const W = doc.width, H = doc.height;
  const noPager = doc.kind !== 'carousel' || total <= 1 || doc.format === 'appstore';
  // 9:16 Reels and Stories: lay out inside the Instagram safe area, then shift down.
  const tallIG = H / W > 1.7 && (doc.kind === 'reel' || doc.kind === 'story');
  const zone = tallIG ? SAFE_ZONES[doc.kind === 'reel' ? 'reel' : 'story'] : null;
  const k = Math.min(W, H) / 1080;
  const top = (zone ? Math.round(Math.max(0, zone.top * k - 80 * k)) : 0) + band;
  const bottom = zone ? Math.round(Math.max(0, zone.bottom * k - 80 * k)) : 0;
  const ctx = { W, H: H - top - bottom, lang: content.lang || doc.lang || 'ar', theme: slide.theme, index, total, kind: doc.kind, format: doc.format, noPager };
  let layers = tpl.layout(content, ctx).map((l) => {
    const full = l.bleed === 'full' || (l.x <= 0 && l.y <= 0 && l.w >= W && l.h >= ctx.H);
    const out = full ? { ...l, y: 0, h: H } : { ...l, y: l.y + top };
    return { ...out, x: Math.round(out.x), y: Math.round(out.y), w: Math.round(out.w), h: Math.round(out.h) };
  });
  // Keep the pager clear of devices or images that bleed off the bottom: move it to the top-end corner.
  const pager = layers.find((l) => l.type === 'pager');
  if (pager && layers.some((l) => l !== pager && ['phone', 'browser', 'image', 'goldbar'].includes(l.type) && l.y + l.h > pager.y - 10 && l.x < pager.x + pager.w && l.x + l.w > pager.x)) {
    const m = Math.round(80 * k);
    const rtl = ctx.lang === 'ar';
    const logo = layers.find((l) => l.type === 'logo' && l.y < m * 2.5);
    const y = logo ? Math.round(logo.y + (logo.h - pager.h) / 2) : m;
    layers = layers.map((l) => (l === pager ? { ...l, x: rtl ? m : W - m - l.w, y, align: 'end' } : l));
  }
  // Short content on text-led templates is centred on the canvas instead of hugging the top.
  if (CENTERED.has(slide.template) && !(slide.template === 'feature' && (content.screenshot || content.image || (content.device && content.device !== 'none')))) {
    const movable = layers.filter((l) => l.type !== 'pager' && l.type !== 'sparkles' && !(l.y <= 0 && l.h >= H));
    if (movable.length) {
      const y0 = Math.min(...movable.map((l) => l.y));
      const y1 = Math.max(...movable.map((l) => l.y + l.h));
      const safeTop = top + Math.round(80 * k), safeBottom = H - bottom - Math.round((noPager ? 80 : 160) * k);
      const used = y1 - y0;
      if (used < (safeBottom - safeTop) * 0.72) {
        const target = safeTop + (safeBottom - safeTop - used) * 0.42;
        const shift = Math.round(Math.max(0, target - y0));
        if (shift > 0) layers = layers.map((l) => (movable.includes(l) ? { ...l, y: l.y + shift } : l));
      }
    }
  }
  // Single posts, Story frames and animated posts carry a small logo so they are never unbranded in the feed.
  // Corner order follows the reading start (top-right in Arabic, brand §9.2); Reels and Stories keep it out of the UI zones.
  // Carousel covers too: the first slide is the tile on the profile grid.
  if ((['post', 'story', 'motion'].includes(doc.kind) || (doc.kind === 'carousel' && index === 0)) && slide.brandMark !== false && !layers.some((l) => l.type === 'logo')) {
    const m = Math.round(80 * k);
    const rtl = ctx.lang === 'ar';
    const zTop = zone ? Math.round(zone.top * k + 10 * k) : Math.round(m * 0.6);
    const zBot = zone ? H - Math.round(zone.bottom * k + 20 * k) : H - Math.round(m * 0.6);
    const hits = (r, pad) => layers.some((l) => l.type !== 'sparkles' && !(l.y <= 0 && l.h >= H) && l.x < r.x + r.w + pad && l.x + l.w > r.x - pad && l.y < r.y + r.h + pad && l.y + l.h > r.y - pad);
    const corners = (lw, lh, inset) => {
      const start = rtl ? W - inset - lw : inset, end = rtl ? inset : W - inset - lw;
      return [{ x: start, y: zTop }, { x: end, y: zTop }, { x: start, y: zBot - lh }, { x: end, y: zBot - lh }].map((p) => ({ ...p, w: lw, h: lh }));
    };
    const hw = Math.round(170 * k), hh = Math.round(hw * 541 / 1364);
    let spot = corners(hw, hh, m).find((r) => !hits(r, 20 * k));
    let variant = 'horizontal';
    // Crowded layouts: fall back to the symbol, tucked closer to the edge.
    if (!spot) { const sw = Math.round(56 * k), sh = Math.round(sw * 540 / 427); spot = corners(sw, sh, Math.round(m * 0.55)).find((r) => !hits(r, 8 * k)); variant = 'symbol'; }
    // Still nothing free: lay the slide out again with a band reserved at the top for the logo.
    if (!spot && !band) return applyTemplate(slide, doc, index, total, Math.round(hh + 40 * k));
    if (spot) layers.push({ ...layerDefaults('logo'), id: uid('l'), name: 'brandmark', variant, mode: 'auto', x: Math.round(spot.x), y: Math.round(spot.y), w: spot.w, h: spot.h, anim: { in: 'fade', delay: 0.4, dur: 0.6 } });
  }
  // Extra layers stored on the slide (relative coordinates) survive every re-layout.
  for (const e of slide.extras || []) {
    const base = layerDefaults(e.type);
    const rel = (v, dim) => (typeof v === 'number' && v <= 1.5 ? Math.round(v * dim) : v);
    const l = { ...base, ...e, id: uid('l'), x: rel(e.x ?? 0, W), y: rel(e.y ?? 0, H), w: rel(e.w ?? 1, W), h: rel(e.h ?? 1, H), extra: true };
    if (e.under) layers.unshift(l); else layers.push(l);
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
  scene: { scene: 'bar-hero', params: { weight: '10 g' }, title: 'ذهب حقيقي. *لك.*' },
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
  price: { title: 'اعرف سعرك قبل أن تشتري', label: 'ذهب عيار 24 · للجرام', price: '31.204 ر.ع.', change: '+0.42%', time: 'استرشادي · 24 أكتوبر 2026 · 14:05' },
  image: { kicker: 'هدايا العيد', title: 'هدية تدوم' },
  'live-price': { label: 'ذهب عيار 24 · للجرام', price: '31.204 ر.ع.', change: '+0.42%', time: '24 أكتوبر 2026 · 14:05', ticker: ['عيار 24 · 1 جرام  31.204 ر.ع. ▲ +0.42%', 'عيار 24 · 10 جرام  312.040 ر.ع. ▲ +0.42%', 'عيار 24 · 1 أونصة  970.552 ر.ع. ▲ +0.42%'] },
  notification: { kicker: 'الإهداء', title: 'أجمل *إشعار* قد يصلك', body: 'هدايا الذهب تصل لحظة إرسالها.', notifTitle: 'وصلتك هدية ذهب', notifBody: 'أرسلت لك عائشة 2.5 جرام ذهب عيار 24.' },
  sticker: { kicker: 'دورك', title: 'هدية العيد: ماذا *تختار*؟', sticker: 'poll', question: 'ذهب أم نقود؟', options: ['ذهب', 'نقود'], note: 'اضغط للتصويت' },
  countdown: { kicker: 'قريبًا', title: 'شيء *جديد* في الطريق', days: '12', hours: '08', minutes: '45', subtitle: 'فعّل الإشعارات لتكون أول من يعرف.' },
  chat: { kicker: 'سألتمونا', title: 'سؤالان يصلاننا كل يوم', messages: ['ما أقل كمية أستطيع شراءها؟', '> جرام واحد من ذهب عيار 24.', 'وهل أستطيع استلام السبيكة نفسها؟', '> نعم، اطلب الاستلام من التطبيق.'] },
  goal: { kicker: 'خطة بسيطة', title: 'ادّخر لهدية، *جرامًا بعد جرام*', value: '62', label: '6.2 جرام', sub: 'من 10 جرام', items: ['حدد الوزن الذي تريده', 'اشترِ على دفعات صغيرة', 'تابع ذهبك في محفظتك'] },
  products: { kicker: 'اختر سبيكتك', title: 'من 1 جرام إلى 10 جرام', products: ['1 g | OMR 33.180', '2.5 g | OMR 81.910', '5 g | OMR 162.260', '10 g | OMR 321.400'], note: 'أسعار توضيحية. السعر المباشر يظهر في التطبيق.' },
  kinetic: { lines: ['ذهب حقيقي.', 'من جوالك.', '*من جرام واحد.*'], caption: 'جولدكم' },
  'logo-sting': { tagline: 'ذهب حقيقي، من جوالك' },
  greeting: { kicker: 'من أسرة جولدكم', title: 'عيد مبارك', body: 'كل عام وأنتم بخير، وأيامكم عامرة بالفرح.' },
  fact: { kicker: 'هل تعلم؟', fact: 'نقاوة ذهب عيار 24 لا تقل عن *99.9%*', body: 'لهذا تُصنع السبائك والعملات من عيار 24، بينما تُخلط المجوهرات عادةً بمعادن أخرى لتحافظ على شكلها.', source: 'السبائك الاستثمارية غالبًا بنقاوة 999.9 (أي 99.99%).' },
  faq: { kicker: 'سألتمونا', question: 'هل أستطيع استلام ذهبي سبيكةً حقيقية؟', answer: 'نعم. اطلب الاستلام من التطبيق واستلمها سبيكة معتمدة.' },
  myth: { title: 'خرافة أم حقيقة؟', myth: 'امتلاك الذهب يحتاج إلى مبلغ كبير.', fact: 'تستطيع البدء بجرام واحد، والإضافة متى شئت.' },
  karat: { kicker: 'دليل الذهب', title: 'ماذا يعني رقم العيار؟', rows: ['عيار 24 | 99.9 | السبائك والعملات', 'عيار 22 | 91.6 | المشغولات التقليدية', 'عيار 21 | 87.5 | مجوهرات الاستخدام اليومي', 'عيار 18 | 75.0 | المجوهرات المرصّعة بالأحجار'] },
  cta: { title: 'ابدأ قصتك مع الذهب اليوم', subtitle: 'حمّل جولدكم من App Store و Google Play.', button: 'حمّل التطبيق', link: 'goldcom.om', disclaimer: 'yes' },
};

export const exampleFor = (id, lang) => (lang === 'ar' ? EXAMPLES_AR[id] : null) || TEMPLATES[id]?.example || {};
