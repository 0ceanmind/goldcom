// Goldcom canvas renderer: draws a slide (or a video frame) from the document model.
import { COLORS, GRADIENTS, FONTS, TYPE, ARABIC_LH, THEMES, color as tokenColor, isArabic } from '../../shared/brand.js';
import { LOGO_INK, SYMBOL_ROOF, SYMBOL_G, SYMBOL_GEM, LOGO_BOX, LOGO_PARTS } from '../../shared/logo.js';
import { ICONS } from '../../shared/icons.js';
import { slideAt } from '../../shared/schema.js';

// ---------- fonts & images ----------
export async function loadFonts() {
  const specs = [];
  for (const w of [400, 500, 600, 700]) {
    specs.push(`${w} 40px "Inter"`, `${w} 40px "IBM Plex Sans Arabic"`);
  }
  specs.push('400 40px "JetBrains Mono"', '500 40px "JetBrains Mono"');
  await Promise.all(specs.map((s) => document.fonts.load(s, 'Aa جولدكم 0123').catch(() => null)));
  await document.fonts.ready;
}

export class ImageCache {
  constructor(onLoad) { this.map = new Map(); this.onLoad = onLoad; }
  get(src) {
    if (!src) return null;
    let e = this.map.get(src);
    if (!e) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      e = { img, ok: false, err: false, p: null };
      e.p = new Promise((res) => {
        img.onload = () => { e.ok = true; res(img); this.onLoad?.(src); };
        img.onerror = () => { e.err = true; res(null); };
      });
      img.src = src;
      this.map.set(src, e);
    }
    return e.ok ? e.img : null;
  }
  async preload(doc) {
    const srcs = [];
    for (const s of doc.slides) {
      if (s.bg?.src) srcs.push(s.bg.src);
      for (const l of s.layers) if (l.src) srcs.push(l.src);
    }
    for (const src of srcs) this.get(src);
    await Promise.all(srcs.map((s) => this.map.get(s)?.p));
  }
}

// ---------- math & easing ----------
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

function hexA(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function rr(c, x, y, w, h, r, facet = 0, rtl = false) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  if (facet > 0) {
    // 45° chamfer on the top-end corner (top-right LTR, top-left RTL)
    if (!rtl) {
      c.moveTo(x + r, y); c.lineTo(x + w - facet, y); c.lineTo(x + w, y + facet); c.lineTo(x + w, y + h - r);
      c.arcTo(x + w, y + h, x + w - r, y + h, r); c.lineTo(x + r, y + h); c.arcTo(x, y + h, x, y + h - r, r); c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r);
    } else {
      c.moveTo(x + facet, y); c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r); c.lineTo(x + w, y + h - r);
      c.arcTo(x + w, y + h, x + w - r, y + h, r); c.lineTo(x + r, y + h); c.arcTo(x, y + h, x, y + h - r, r); c.lineTo(x, y + facet);
    }
    c.closePath();
    return;
  }
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function gradient(c, stops, x0, y0, x1, y1) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}

const P = new Map();
const path2d = (d) => { let p = P.get(d); if (!p) { p = new Path2D(d); P.set(d, p); } return p; };

// ---------- theme colours ----------
const HEADING_ROLES = new Set(['display', 'h1', 'h2', 'stat', 'price']);
const isLightTheme = (theme) => theme === 'cream' || theme === 'sand';

function resolveColor(token, themeId, { role, layer, H } = {}) {
  const th = THEMES[themeId] || THEMES.onyx;
  if (!token || token === 'auto') {
    if (themeId === 'bullion' && layer && layer.y + layer.h / 2 < H * 0.42) return COLORS[th.topFg];
    if (role === 'overline') return COLORS[th.accent];
    if (HEADING_ROLES.has(role)) return COLORS[th.heading];
    return COLORS[th.fg];
  }
  if (themeId === 'bullion' && layer && layer.y + layer.h / 2 < H * 0.42 && (token === 'fg' || token === 'fg2' || token === 'heading')) return token === 'fg2' ? '#E9D9C4' : COLORS.white;
  if (themeId === 'bullion' && layer && layer.y + layer.h / 2 < H * 0.42 && token === 'accent') return COLORS.spark;
  if (th[token]) return COLORS[th[token]] || th[token];
  return tokenColor(token, COLORS.white);
}

// ---------- background ----------
const patternCache = new Map();
function patternCanvas(W, H, s, col, opacity, mode) {
  const key = `${W}x${H}:${s}:${col}:${opacity}:${mode}`;
  if (patternCache.has(key)) return patternCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const k = 0.12 * s * 1.25;
  const tw = 120 * s * 1.25, th = 140 * s * 1.25;
  c.fillStyle = col;
  c.globalAlpha = opacity;
  for (let row = -1; row * th / 2 < H + th; row++) {
    for (let col2 = -1; col2 * tw < W + tw; col2++) {
      const ox = col2 * tw + (row % 2 ? tw / 2 : 0) + tw / 2 - 213.5 * k;
      const oy = row * th / 2 + 4 * s;
      c.save(); c.translate(ox, oy); c.scale(k, k);
      c.fill(path2d(SYMBOL_ROOF)); c.fill(path2d(SYMBOL_G)); c.fill(path2d(SYMBOL_GEM));
      c.restore();
    }
  }
  if (mode === 'top') {
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'destination-in';
    c.fillStyle = gradient(c, [[0, 'rgba(0,0,0,1)'], [0.7, 'rgba(0,0,0,0)']], 0, 0, 0, H);
    c.fillRect(0, 0, W, H);
  }
  if (patternCache.size > 40) patternCache.clear();
  patternCache.set(key, cv);
  return cv;
}

function drawBackground(c, slide, W, H, s, images) {
  const th = THEMES[slide.theme] || THEMES.onyx;
  const bg = slide.bg;
  if (bg?.type === 'color' && bg.color) {
    c.fillStyle = tokenColor(bg.color); c.fillRect(0, 0, W, H);
  } else {
    switch (th.bg) {
      case 'bullion':
        c.fillStyle = gradient(c, GRADIENTS.bullion, 0, 0, 0, H); c.fillRect(0, 0, W, H); break;
      case 'onyx': {
        c.fillStyle = COLORS.onyx; c.fillRect(0, 0, W, H);
        const g = c.createRadialGradient(W / 2, 0, 0, W / 2, 0, Math.max(W, H) * 0.75);
        g.addColorStop(0, '#2D2E2B'); g.addColorStop(1, 'rgba(21,21,19,0)');
        c.fillStyle = g; c.fillRect(0, 0, W, H); break;
      }
      case 'sand':
        c.fillStyle = gradient(c, [[0, '#EDD175'], [1, '#E2C268']], 0, 0, 0, H); c.fillRect(0, 0, W, H); break;
      default:
        c.fillStyle = COLORS[th.bg] || COLORS.onyx; c.fillRect(0, 0, W, H);
    }
  }
  if (bg?.type === 'image' && bg.src) {
    const img = images?.get(bg.src);
    if (img) drawImageFit(c, img, 0, 0, W, H, 'cover');
    c.fillStyle = gradient(c, [[0, 'rgba(21,21,19,0.15)'], [0.55, 'rgba(21,21,19,0.35)'], [1, 'rgba(21,21,19,0.88)']], 0, 0, 0, H);
    c.fillRect(0, 0, W, H);
  }
  if (slide.pattern && slide.pattern !== 'none') {
    c.drawImage(patternCanvas(W, H, s, COLORS[th.pattern] || COLORS.spark, th.patternOpacity, slide.pattern), 0, 0);
  }
}

function drawImageFit(c, img, x, y, w, h, fit = 'cover', align = 'center') {
  const ir = img.width / img.height, br = w / h;
  let dw, dh;
  if ((fit === 'cover') === ir > br) { dh = h; dw = h * ir; } else { dw = w; dh = w / ir; }
  if (fit === 'width') { dw = w; dh = w / ir; }
  const dx = x + (w - dw) / 2;
  const dy = align === 'top' ? y : y + (h - dh) / 2;
  c.drawImage(img, dx, dy, dw, dh);
}

// ---------- text ----------
const wrapCache = new Map();
function fontFor(role, size, rtl, weight, mono) {
  const t = TYPE[role] || TYPE.body;
  const fam = mono || t.mono ? FONTS.mono : rtl ? FONTS.arabic : FONTS.latin;
  return `${weight || t.weight} ${size}px ${fam}`;
}

function tokenize(text) {
  // Split into words, keeping *emphasis* spans. `glue` marks a word that touches the previous one (e.g. "*word*.").
  const out = [];
  let em = false;
  let gap = true;
  for (const raw of String(text).split(/(\*)/)) {
    if (raw === '*') { em = !em; continue; }
    for (const p of raw.split(/(\n| +)/)) {
      if (p === '') continue;
      if (p === '\n') { out.push({ br: true }); gap = true; }
      else if (/^ +$/.test(p)) gap = true;
      else { out.push({ w: p, em, glue: !gap && out.length > 0 && !out[out.length - 1].br }); gap = false; }
    }
  }
  return out;
}

function wrapText(c, text, maxW, font, letterSpacing) {
  const key = `${font}|${maxW}|${letterSpacing}|${text}`;
  if (wrapCache.has(key)) return wrapCache.get(key);
  c.font = font;
  const space = c.measureText(' ').width;
  const lines = [];
  let line = [];
  let lw = 0;
  const flush = () => { lines.push({ tokens: line, width: lw }); line = []; lw = 0; };
  for (const t of tokenize(text)) {
    if (t.br) { flush(); continue; }
    const ww = c.measureText(t.w).width + letterSpacing * t.w.length;
    const add = line.length && !t.glue ? space + ww : ww;
    if (line.length && !t.glue && lw + add > maxW) { flush(); line.push({ ...t, glue: false, width: ww }); lw = ww; } else { line.push({ ...t, width: ww }); lw += add; }
  }
  flush();
  const res = { lines, space };
  if (wrapCache.size > 800) wrapCache.clear();
  wrapCache.set(key, res);
  return res;
}

const isRtlWord = (w) => isArabic(w);
const isLtrStrong = (w) => /[A-Za-z0-9]/.test(w) && !isArabic(w);

function drawLine(c, line, x, y, w, align, rtl, space, colors) {
  const plain = !line.tokens.some((t) => t.em);
  let left;
  if (align === 'center') left = x + (w - line.width) / 2;
  else if ((align === 'start') !== rtl) left = x; // start+ltr or end+rtl → left edge
  else left = x + w - line.width;
  if (plain) {
    c.fillStyle = colors.base;
    c.direction = rtl ? 'rtl' : 'ltr';
    c.textAlign = 'left';
    c.fillText(line.tokens.map((t, k) => (k && !t.glue ? ' ' : '') + t.w).join(''), left, y);
    return;
  }
  c.textAlign = 'left';
  if (!rtl) {
    let cx = left;
    line.tokens.forEach((t, k) => { if (k && !t.glue) cx += space; c.direction = isRtlWord(t.w) ? 'rtl' : 'ltr'; c.fillStyle = t.em ? colors.accent : colors.base; c.fillText(t.w, cx, y); cx += t.width; });
    return;
  }
  // RTL with emphasis: group consecutive LTR-strong tokens into runs, lay runs out right-to-left.
  const runs = [];
  for (const t of line.tokens) {
    const dir = isLtrStrong(t.w) ? 'ltr' : 'rtl';
    const last = runs[runs.length - 1];
    if (last && last.dir === dir && dir === 'ltr') last.tokens.push(t); else runs.push({ dir, tokens: [t] });
  }
  let cursor = left + line.width;
  let first = true;
  for (const run of runs) {
    if (run.dir === 'rtl') {
      for (const t of run.tokens) { if (!first && !t.glue) cursor -= space; first = false; cursor -= t.width; c.direction = 'rtl'; c.fillStyle = t.em ? colors.accent : colors.base; c.fillText(t.w, cursor, y); }
    } else {
      if (!first && !run.tokens[0].glue) cursor -= space;
      first = false;
      const rw = run.tokens.reduce((a, t, k) => a + t.width + (k && !t.glue ? space : 0), 0);
      cursor -= rw;
      let cx = cursor;
      run.tokens.forEach((t, k) => { if (k && !t.glue) cx += space; c.direction = 'ltr'; c.fillStyle = t.em ? colors.accent : colors.base; c.fillText(t.w, cx, y); cx += t.width; });
    }
  }
}

function countText(text, p) {
  // Interpolate the first number in the string, keeping its decimals and separators.
  return String(text).replace(/(\d[\d,]*\.?\d*)/, (num) => {
    const clean = num.replace(/,/g, '');
    const target = parseFloat(clean);
    if (!isFinite(target)) return num;
    const dec = (clean.split('.')[1] || '').length;
    const v = target * p;
    let s = v.toFixed(dec);
    if (num.includes(',')) s = Number(s).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    return s;
  });
}

function layoutText(c, layer, s, text) {
  const t = TYPE[layer.role] || TYPE.body;
  const rtl = layer.dir === 'rtl' || (layer.dir !== 'ltr' && isArabic(text));
  const upper = t.upper && !rtl;
  const str = upper ? text.toUpperCase() : text;
  let size = (layer.size || t.size) * s;
  const weight = layer.weight || t.weight;
  const minSize = size * 0.35;
  let res, lh, font, ls;
  for (let i = 0; i < 40; i++) {
    font = fontFor(layer.role, size, rtl, weight);
    ls = rtl ? 0 : (t.track || 0) * size;
    lh = size * (layer.lineHeight || t.lh) * (rtl ? ARABIC_LH : 1);
    res = wrapText(c, str, layer.w, font, ls);
    const total = res.lines.length * lh;
    const widest = Math.max(...res.lines.map((l) => l.width));
    if (!layer.fit || ((total <= layer.h + 1 || size <= minSize) && (widest <= layer.w + 1 || size <= minSize))) break;
    size *= 0.95;
  }
  return { ...res, lh, font, ls, rtl, size };
}

function drawText(c, layer, ctx, p, raw) {
  let text = layer.text || '';
  if (layer.anim?.in === 'count' && raw < 1) text = countText(text, easeOut(raw));
  const lay = layoutText(c, layer, ctx.s, layer.anim?.in === 'count' ? layer.text || '' : text);
  c.font = lay.font;
  c.letterSpacing = `${lay.ls}px`;
  c.textBaseline = 'alphabetic';
  const base = resolveColor(layer.color, ctx.theme, { role: layer.role, layer, H: ctx.H });
  const accent = resolveColor(layer.accent && layer.accent !== 'auto' ? layer.accent : 'accent', ctx.theme, { layer, H: ctx.H });
  const total = lay.lines.length * lay.lh;
  let y = layer.y;
  if (layer.valign === 'middle') y += (layer.h - total) / 2;
  else if (layer.valign === 'bottom') y += layer.h - total;
  let lines = lay.lines;
  if (layer.anim?.in === 'count' && raw < 1) {
    // Re-wrap the animated string with the settled font size so the layout does not jump.
    lines = wrapText(c, (TYPE[layer.role]?.upper && !lay.rtl) ? text.toUpperCase() : text, layer.w, lay.font, lay.ls).lines;
  }
  let budget = Infinity;
  if (layer.anim?.in === 'type' && raw < 1) budget = Math.floor(String(layer.text).length * raw);
  for (const line of lines) {
    let ln = line;
    if (budget !== Infinity) {
      const chars = line.tokens.reduce((a, t) => a + t.w.length + 1, 0);
      if (budget <= 0) break;
      if (budget < chars) {
        const toks = []; let b = budget;
        for (const t of line.tokens) { if (b <= 0) break; const w = t.w.slice(0, b); toks.push({ ...t, w, width: c.measureText(w).width }); b -= t.w.length + 1; }
        ln = { tokens: toks, width: line.width };
      }
      budget -= chars;
    }
    drawLine(c, ln, layer.x, y + lay.lh * 0.5 + lay.size * 0.36, layer.w, layer.align || 'start', lay.rtl, lay.space, { base, accent });
    y += lay.lh;
  }
  c.letterSpacing = '0px';
}

function drawList(c, layer, ctx, p, raw) {
  const items = (layer.items || []).filter((i) => String(i).trim());
  if (!items.length) return;
  const rtl = layer.dir === 'rtl' || (layer.dir !== 'ltr' && isArabic(items.join(' ')));
  const t = TYPE[layer.role] || TYPE['body-lg'];
  let size = t.size * ctx.s;
  const base = resolveColor(layer.color, ctx.theme, { role: layer.role, layer, H: ctx.H });
  const accent = resolveColor('accent', ctx.theme, { layer, H: ctx.H });
  let lay;
  for (let i = 0; i < 30; i++) {
    const bullet = size * (layer.bullet === 'number' ? 1.5 : 1.1);
    const font = fontFor(layer.role, size, rtl, layer.bullet === 'number' ? 500 : t.weight);
    const lh = size * t.lh * (rtl ? ARABIC_LH : 1);
    const gap = size * (layer.bullet === 'number' ? 1.0 : 0.75);
    const tw = layer.w - bullet - size * 0.6;
    const wrapped = items.map((it) => wrapText(c, String(it), tw, font, 0));
    const total = wrapped.reduce((a, w) => a + Math.max(w.lines.length * lh, layer.bullet === 'number' ? bullet : 0), 0) + gap * (items.length - 1);
    lay = { bullet, font, lh, gap, tw, wrapped };
    if (total <= layer.h || size < t.size * ctx.s * 0.45) break;
    size *= 0.94;
  }
  let y = layer.y;
  items.forEach((it, i) => {
    const local = clamp((raw * (layer.anim?.dur || 0.6) - i * 0.12) / (layer.anim?.dur || 0.6));
    const ip = layer.anim?.in === 'none' || raw >= 1 ? 1 : easeOut(local);
    const w = lay.wrapped[i];
    const blockH = Math.max(w.lines.length * lay.lh, layer.bullet === 'number' ? lay.bullet : 0);
    c.save();
    c.globalAlpha *= ip;
    c.translate(0, (1 - ip) * 24 * ctx.s);
    const bx = rtl ? layer.x + layer.w - lay.bullet : layer.x;
    const cy = y + Math.min(lay.lh, blockH) / 2;
    if (layer.bullet === 'number') {
      const d = lay.bullet;
      c.fillStyle = COLORS.spark;
      if (isLightTheme(ctx.theme)) c.fillStyle = COLORS.charcoal;
      c.beginPath(); c.arc(bx + d / 2, y + d / 2, d / 2, 0, Math.PI * 2); c.fill();
      c.fillStyle = isLightTheme(ctx.theme) ? COLORS.spark : COLORS.ink;
      c.font = `700 ${size * 0.8}px ${FONTS.latin}`; c.textAlign = 'center'; c.direction = 'ltr';
      c.fillText(String(i + 1), bx + d / 2, y + d / 2 + size * 0.29);
    } else if (layer.bullet === 'check') {
      drawIconPath(c, 'check', bx + lay.bullet * 0.05, cy - lay.bullet * 0.45, lay.bullet * 0.9, accent);
    } else if (layer.bullet === 'dash') {
      c.fillStyle = resolveColor('fg2', ctx.theme, { layer, H: ctx.H });
      c.fillRect(bx + lay.bullet * 0.2, cy - size * 0.05, lay.bullet * 0.5, size * 0.1);
    } else {
      const g = size * 0.42;
      c.save(); c.translate(bx + lay.bullet * 0.45, cy); c.rotate(Math.PI / 4);
      c.fillStyle = gradient(c, GRADIENTS.goldLeaf, -g / 2, -g / 2, g / 2, g / 2);
      c.fillRect(-g / 2, -g / 2, g, g); c.restore();
    }
    c.font = lay.font;
    const tx = rtl ? layer.x : layer.x + lay.bullet + size * 0.6;
    const ty0 = layer.bullet === 'number' ? y + (lay.bullet - Math.min(blockH, lay.lh)) / 2 : y;
    w.lines.forEach((line, li) => drawLine(c, line, tx, ty0 + li * lay.lh + lay.lh * 0.5 + size * 0.36, lay.tw, 'start', rtl, w.space, { base, accent }));
    c.restore();
    y += blockH + lay.gap;
  });
}

// ---------- components ----------
function drawLogo(c, layer, ctx) {
  const v = LOGO_BOX[layer.variant] ? layer.variant : 'horizontal';
  const box = LOGO_BOX[v];
  const k = Math.min(layer.w / box.w, layer.h / box.h);
  const ox = layer.x + (layer.w - box.w * k) / 2;
  const oy = layer.y + (layer.h - box.h * k) / 2;
  let mode = layer.mode === 'auto' || !layer.mode ? (THEMES[ctx.theme] || THEMES.onyx).logo : layer.mode;
  if (ctx.theme === 'bullion' && (layer.mode === 'auto' || !layer.mode) && layer.y + layer.h / 2 > ctx.H * 0.55) mode = 'mono-black';
  const col = {
    primary: [COLORS.ink, COLORS.amber, COLORS.gold],
    reversed: [COLORS.white, COLORS.amber, COLORS.gold],
    'mono-black': [COLORS.ink, COLORS.ink, COLORS.ink],
    'mono-white': [COLORS.white, COLORS.white, COLORS.white],
  }[mode] || [COLORS.white, COLORS.amber, COLORS.gold];
  const parts = LOGO_PARTS[v];
  c.save(); c.translate(ox, oy); c.scale(k, k);
  if (parts.ink) {
    c.save(); c.translate(parts.ink[0], parts.ink[1]); c.scale(parts.ink[2], parts.ink[2]);
    c.fillStyle = col[0]; c.fill(path2d(LOGO_INK), 'evenodd'); c.restore();
  }
  c.save(); c.translate(parts.symbol[0], parts.symbol[1]); c.scale(parts.symbol[2], parts.symbol[2]);
  c.fillStyle = col[1]; c.fill(path2d(SYMBOL_ROOF));
  c.fillStyle = col[2]; c.fill(path2d(SYMBOL_G)); c.fill(path2d(SYMBOL_GEM));
  c.restore();
  c.restore();
}

function drawIconPath(c, name, x, y, size, col, lw) {
  const paths = ICONS[name] || ICONS.sparkle;
  c.save();
  c.translate(x, y); c.scale(size / 24, size / 24);
  c.strokeStyle = col; c.lineWidth = lw || 1.75; c.lineCap = 'round'; c.lineJoin = 'round';
  for (const d of paths) c.stroke(path2d(d));
  c.restore();
}

function drawIcon(c, layer, ctx) {
  const light = isLightTheme(ctx.theme);
  if (layer.tile) {
    c.fillStyle = light ? COLORS.white : COLORS.graphite;
    rr(c, layer.x, layer.y, layer.w, layer.h, layer.w * 0.26); c.fill();
    if (light) { c.strokeStyle = COLORS.mist; c.lineWidth = 2 * ctx.s; c.stroke(); }
  }
  const col = layer.color && layer.color !== 'auto' ? resolveColor(layer.color, ctx.theme) : light ? COLORS.bronze : COLORS.gold;
  const sz = layer.tile ? layer.w * 0.5 : layer.w;
  drawIconPath(c, layer.icon, layer.x + (layer.w - sz) / 2, layer.y + (layer.h - sz) / 2, sz, col, layer.tile ? 1.75 : 1.6);
}

function drawGem(c, layer) {
  const g = Math.min(layer.w, layer.h) / Math.SQRT2;
  c.save(); c.translate(layer.x + layer.w / 2, layer.y + layer.h / 2); c.rotate(Math.PI / 4);
  c.fillStyle = layer.fill === 'goldLeaf' || !layer.fill ? gradient(c, GRADIENTS.goldLeaf, -g / 2, -g / 2, g / 2, g / 2) : tokenColor(layer.fill);
  c.fillRect(-g / 2, -g / 2, g, g); c.restore();
}

function drawShape(c, layer, ctx) {
  const fill = layer.fill ? resolveColor(layer.fill, ctx.theme, { layer, H: ctx.H }) : null;
  const stroke = layer.stroke ? resolveColor(layer.stroke, ctx.theme, { layer, H: ctx.H }) : null;
  if (layer.shape === 'circle') { c.beginPath(); c.ellipse(layer.x + layer.w / 2, layer.y + layer.h / 2, layer.w / 2, layer.h / 2, 0, 0, Math.PI * 2); }
  else if (layer.shape === 'line') { c.beginPath(); c.moveTo(layer.x, layer.y + layer.h / 2); c.lineTo(layer.x + layer.w, layer.y + layer.h / 2); c.strokeStyle = stroke || fill || COLORS.slate; c.lineWidth = Math.max(1, layer.h); c.stroke(); return; }
  else rr(c, layer.x, layer.y, layer.w, layer.h, (layer.radius ?? 0) * 1, layer.facet ? 22 * ctx.s : 0, ctx.rtl);
  if (fill) {
    if (isLightTheme(ctx.theme) && layer.fill === 'surface') { c.save(); c.shadowColor = 'rgba(59,42,28,0.12)'; c.shadowBlur = 40 * ctx.s; c.shadowOffsetY = 12 * ctx.s; c.fillStyle = fill; c.fill(); c.restore(); }
    else { c.fillStyle = fill; c.fill(); }
  }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = 3 * ctx.s; c.stroke(); }
}

function drawButton(c, layer, ctx) {
  const v = layer.variant === 'auto' || !layer.variant ? (THEMES[ctx.theme] || THEMES.onyx).button : layer.variant;
  const r = layer.h * 0.25;
  rr(c, layer.x, layer.y, layer.w, layer.h, r);
  let fg;
  if (v === 'spark') { c.fillStyle = COLORS.spark; c.fill(); fg = COLORS.ink; }
  else if (v === 'charcoal') { c.fillStyle = COLORS.charcoal; c.fill(); fg = COLORS.spark; }
  else { c.strokeStyle = resolveColor('fg', ctx.theme); c.lineWidth = 3 * ctx.s; c.stroke(); fg = resolveColor('fg', ctx.theme); }
  const rtl = layer.dir === 'rtl' || (layer.dir !== 'ltr' && isArabic(layer.text));
  c.font = `600 ${layer.h * 0.34}px ${rtl ? FONTS.arabic : FONTS.latin}`;
  c.fillStyle = fg; c.textAlign = 'center'; c.direction = rtl ? 'rtl' : 'ltr'; c.textBaseline = 'middle';
  c.fillText(layer.text || '', layer.x + layer.w / 2, layer.y + layer.h / 2 + layer.h * 0.02);
  c.textBaseline = 'alphabetic';
}

function drawBadge(c, layer, ctx) {
  const light = isLightTheme(ctx.theme);
  const map = {
    spark: light ? [hexA(COLORS.bronze, 0.12), COLORS.bronze] : [hexA(COLORS.spark, 0.16), COLORS.spark],
    gain: light ? [hexA(COLORS.gainLight, 0.12), COLORS.gainLight] : [hexA(COLORS.gainDark, 0.16), COLORS.gainDark],
    loss: light ? [hexA(COLORS.lossLight, 0.12), COLORS.lossLight] : [hexA(COLORS.lossDark, 0.16), COLORS.lossDark],
    info: [COLORS.info, COLORS.white],
    outline: [null, resolveColor('fg', ctx.theme)],
  };
  const [bg, fg] = map[layer.variant] || map.spark;
  rr(c, layer.x, layer.y, layer.w, layer.h, layer.h / 2);
  if (bg) { c.fillStyle = bg; c.fill(); } else { c.strokeStyle = fg; c.lineWidth = 2 * ctx.s; c.stroke(); }
  const rtl = layer.dir === 'rtl' || (layer.dir !== 'ltr' && isArabic(layer.text));
  const fs = layer.h * 0.44;
  c.font = `600 ${fs}px ${rtl ? FONTS.arabic : FONTS.latin}`;
  const tw = c.measureText(layer.text || '').width;
  const gw = layer.gem ? fs * 0.9 : 0;
  const total = tw + gw;
  let x = layer.x + (layer.w - total) / 2;
  if (layer.gem) {
    const g = fs * 0.5;
    const gx = rtl ? x + tw + gw * 0.5 : x + g * 0.7;
    c.save(); c.translate(gx, layer.y + layer.h / 2); c.rotate(Math.PI / 4); c.fillStyle = fg; c.fillRect(-g / 2, -g / 2, g, g); c.restore();
    if (!rtl) x += gw;
  }
  c.fillStyle = fg; c.textAlign = 'left'; c.direction = rtl ? 'rtl' : 'ltr'; c.textBaseline = 'middle';
  c.fillText(layer.text || '', x, layer.y + layer.h / 2 + fs * 0.04);
  c.textBaseline = 'alphabetic';
}

function drawGoldBar(c, layer, ctx, gleamP) {
  const { x, y, w, h } = layer;
  const r = w * 0.07;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = w * 0.16; c.shadowOffsetY = w * 0.08;
  rr(c, x, y, w, h, r); c.fillStyle = gradient(c, GRADIENTS.goldLeaf, x, y, x + w, y + h); c.fill();
  c.restore();
  // bevel
  c.save(); rr(c, x, y, w, h, r); c.clip();
  c.fillStyle = gradient(c, [[0, 'rgba(255,255,255,0.35)'], [0.4, 'rgba(255,255,255,0)'], [1, 'rgba(98,66,42,0.35)']], x, y, x, y + h);
  c.fillRect(x, y, w, h);
  if (gleamP > 0 && gleamP < 1) {
    const gx = x - w + gleamP * (w * 3);
    const g = c.createLinearGradient(gx - w * 0.4, y, gx + w * 0.4, y + h * 0.3);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(x, y, w, h);
  }
  c.restore();
  c.strokeStyle = 'rgba(98,66,42,0.35)'; c.lineWidth = Math.max(1, w * 0.008);
  rr(c, x + w * 0.07, y + w * 0.07, w - w * 0.14, h - w * 0.14, r * 0.6); c.stroke();
  c.fillStyle = 'rgba(59,42,28,0.78)'; c.textAlign = 'center'; c.direction = 'ltr';
  c.font = `700 ${w * 0.26}px ${FONTS.latin}`;
  c.fillText(layer.label || '', x + w / 2, y + h * 0.46);
  c.font = `700 ${w * 0.075}px ${FONTS.latin}`;
  c.letterSpacing = `${w * 0.006}px`;
  String(layer.sub || '').split('\n').forEach((ln, i) => c.fillText(ln, x + w / 2, y + h * 0.58 + i * w * 0.1));
  c.letterSpacing = '0px';
}

function drawChart(c, layer, ctx, p) {
  const pts = (layer.points && layer.points.length > 1 ? layer.points : [30, 34, 31, 38, 36, 44, 41, 49, 46, 54, 52, 60, 64]).map(Number);
  const up = layer.trend === 'up' || (layer.trend !== 'down' && pts[pts.length - 1] >= pts[0]);
  const light = isLightTheme(ctx.theme);
  const lineCol = up ? (light ? COLORS.bronze : COLORS.gold) : light ? COLORS.lossLight : COLORS.lossDark;
  const min = Math.min(...pts), max = Math.max(...pts);
  const pad = layer.h * 0.08;
  const X = (i) => layer.x + (i / (pts.length - 1)) * layer.w;
  const Y = (v) => layer.y + pad + (1 - (v - min) / (max - min || 1)) * (layer.h - 2 * pad);
  if (layer.grid) {
    c.strokeStyle = light ? hexA(COLORS.mist, 1) : hexA(COLORS.slate, 0.6); c.lineWidth = Math.max(1, 1.5 * ctx.s);
    for (let i = 1; i <= 3; i++) { const gy = layer.y + (layer.h * i) / 4; c.beginPath(); c.moveTo(layer.x, gy); c.lineTo(layer.x + layer.w, gy); c.stroke(); }
  }
  c.save();
  c.beginPath(); c.rect(layer.x - 20, layer.y - 20, (layer.w + 40) * p, layer.h + 40); c.clip();
  if (layer.area) {
    c.beginPath(); c.moveTo(X(0), Y(pts[0]));
    pts.forEach((v, i) => c.lineTo(X(i), Y(v)));
    c.lineTo(X(pts.length - 1), layer.y + layer.h); c.lineTo(X(0), layer.y + layer.h); c.closePath();
    const base = up ? (light ? COLORS.bronze : COLORS.spark) : light ? COLORS.lossLight : COLORS.lossDark;
    c.fillStyle = gradient(c, [[0, hexA(base, up ? 0.28 : 0.32)], [1, hexA(base, 0)]], 0, layer.y, 0, layer.y + layer.h);
    c.fill();
  }
  c.beginPath(); c.moveTo(X(0), Y(pts[0])); pts.forEach((v, i) => c.lineTo(X(i), Y(v)));
  c.strokeStyle = lineCol; c.lineWidth = Math.max(2, 4 * ctx.s); c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke();
  c.restore();
  // End point
  const fi = (pts.length - 1) * p;
  const i0 = Math.floor(fi), i1 = Math.min(pts.length - 1, i0 + 1);
  const ex = X(fi), ey = Y(pts[i0] + (pts[i1] - pts[i0]) * (fi - i0));
  c.fillStyle = hexA(up ? COLORS.spark : COLORS.lossDark, 0.25); c.beginPath(); c.arc(ex, ey, 14 * ctx.s, 0, Math.PI * 2); c.fill();
  c.fillStyle = up ? (light ? COLORS.bronze : COLORS.spark) : lineCol; c.beginPath(); c.arc(ex, ey, 7 * ctx.s, 0, Math.PI * 2); c.fill();
}

function drawImageLayer(c, layer, ctx, images) {
  const img = images?.get(layer.src);
  c.save();
  rr(c, layer.x, layer.y, layer.w, layer.h, layer.radius || 0, layer.facet ? 24 * ctx.s : 0, ctx.rtl);
  c.clip();
  if (img) drawImageFit(c, img, layer.x, layer.y, layer.w, layer.h, layer.fit || 'cover');
  else drawPlaceholder(c, layer, ctx, 'Add image');
  if (layer.scrim) {
    c.fillStyle = gradient(c, [[0, 'rgba(21,21,19,0.1)'], [0.5, 'rgba(21,21,19,0.25)'], [1, 'rgba(21,21,19,0.9)']], 0, layer.y, 0, layer.y + layer.h);
    c.fillRect(layer.x, layer.y, layer.w, layer.h);
  }
  c.restore();
}

function drawPlaceholder(c, layer, ctx, label) {
  c.fillStyle = isLightTheme(ctx.theme) ? COLORS.mist : COLORS.graphite;
  c.fillRect(layer.x, layer.y, layer.w, layer.h);
  c.save();
  c.globalAlpha = 0.5;
  drawIconPath(c, 'layers', layer.x + layer.w / 2 - 28 * ctx.s, layer.y + layer.h / 2 - 50 * ctx.s, 56 * ctx.s, COLORS.stone);
  c.font = `500 ${24 * ctx.s}px ${FONTS.latin}`; c.fillStyle = COLORS.stone; c.textAlign = 'center'; c.direction = 'ltr';
  c.fillText(label, layer.x + layer.w / 2, layer.y + layer.h / 2 + 34 * ctx.s);
  c.restore();
}

// Vector placeholder app screen (dark Goldcom UI) used when a phone has no screenshot.
function drawAppScreen(c, x, y, w, h, kind, lang) {
  const k = w / 300;
  const rtl = lang === 'ar';
  const X = (px, pw = 0) => (rtl ? x + w - (px + pw) * k : x + px * k);
  const T = (txt, px, py, size, col, weight = 600, align = 'start') => {
    c.font = `${weight} ${size * k}px ${rtl ? FONTS.arabic : FONTS.latin}`; c.fillStyle = col; c.direction = rtl ? 'rtl' : 'ltr';
    c.textAlign = align === 'end' ? (rtl ? 'left' : 'right') : align === 'center' ? 'center' : rtl ? 'right' : 'left';
    c.fillText(txt, align === 'center' ? x + px * k : rtl ? x + w - px * k : x + px * k, y + py * k);
  };
  c.fillStyle = COLORS.onyx; c.fillRect(x, y, w, h);
  c.font = `600 ${11 * k}px ${FONTS.latin}`; c.fillStyle = COLORS.white; c.textAlign = 'left'; c.direction = 'ltr';
  c.fillText('9:41', x + 24 * k, y + 22 * k);
  if (kind === 'browse') {
    T(rtl ? 'تصفّح' : 'Browse', 16, 64, 20, COLORS.white, 700);
    T(rtl ? '4 نتائج' : '4 results', 16, 82, 11, COLORS.stone, 500);
    const items = [['1g', '31.950'], ['2.5g', '79.120'], ['5g', '156.020'], ['10g', '310.400']];
    items.forEach(([g, pr], i) => {
      const cx = 12 + (i % 2) * 142, cy = 100 + Math.floor(i / 2) * 200;
      c.fillStyle = COLORS.charcoal; rr(c, X(cx, 134), y + cy * k, 134 * k, 188 * k, 14 * k); c.fill();
      const gimg = c.createRadialGradient(X(cx, 134) + 67 * k, y + (cy + 50) * k, 0, X(cx, 134) + 67 * k, y + (cy + 60) * k, 80 * k);
      gimg.addColorStop(0, '#4a4033'); gimg.addColorStop(1, '#262521');
      c.fillStyle = gimg; rr(c, X(cx + 8, 118), y + (cy + 8) * k, 118 * k, 110 * k, 10 * k); c.fill();
      drawGoldBar(c, { x: X(cx + 46, 42), y: y + (cy + 26) * k, w: 42 * k, h: 70 * k, label: g, sub: '999.9' }, {}, 0);
      T(rtl ? `سبيكة ذهب · ${g.replace('g', '')} جرام` : `Gold bar · ${g}`, cx + 10, cy + 140, 11, COLORS.white, 600);
      T(rtl ? `${pr} ر.ع.` : `OMR ${pr}`, cx + 10, cy + 172, 12.5, COLORS.white, 700);
    });
  } else {
    T(rtl ? 'مساء الخير' : 'Good evening', 16, 58, 11, COLORS.stone, 500);
    T(rtl ? 'محمود' : 'Mahmood', 16, 76, 15, COLORS.white, 700);
    c.fillStyle = COLORS.charcoal; rr(c, x + 12 * k, y + 92 * k, 276 * k, 220 * k, 16 * k); c.fill();
    T(rtl ? 'ذهب عيار 24 · للجرام' : 'Gold 24K · per gram', 26, 116, 11, COLORS.stone, 500);
    c.font = `700 ${28 * k}px ${FONTS.latin}`; c.fillStyle = COLORS.white; c.direction = 'ltr'; c.textAlign = rtl ? 'right' : 'left';
    c.fillText(rtl ? '31.204 ر.ع.' : 'OMR 31.204', rtl ? x + w - 26 * k : x + 26 * k, y + 150 * k);
    c.fillStyle = hexA(COLORS.gainDark, 0.16); rr(c, X(206, 66), y + 132 * k, 66 * k, 22 * k, 11 * k); c.fill();
    c.font = `600 ${11 * k}px ${FONTS.latin}`; c.fillStyle = COLORS.gainDark; c.textAlign = 'center';
    c.fillText('▲ +0.42%', X(206, 66) + 33 * k, y + 147 * k);
    drawChart(c, { x: x + 26 * k, y: y + 176 * k, w: 248 * k, h: 120 * k, area: true, grid: true, trend: 'up' }, { s: k * 0.4, theme: 'onyx' }, 1);
    const acts = rtl ? ['شراء', 'بيع', 'إهداء', 'استلام'] : ['Buy', 'Sell', 'Gift', 'Collect'];
    const icn = ['buy', 'sell', 'gift', 'pin'];
    acts.forEach((a, i) => {
      const ax = 22 + i * 68;
      c.fillStyle = COLORS.graphite; rr(c, X(ax, 48), y + 330 * k, 48 * k, 48 * k, 12 * k); c.fill();
      drawIconPath(c, icn[i], X(ax, 48) + 13 * k, y + 343 * k, 22 * k, COLORS.gold);
      T(a, ax + 24, 396, 10.5, COLORS.stone, 500, 'center');
    });
    c.fillStyle = COLORS.graphite; rr(c, x + 12 * k, y + 414 * k, 276 * k, 70 * k, 16 * k); c.fill();
    drawGoldBar(c, { x: X(26, 30), y: y + 426 * k, w: 30 * k, h: 46 * k, label: '', sub: '' }, {}, 0);
    T(rtl ? 'ذهبي' : 'My gold', 68, 444, 12.5, COLORS.white, 700);
    T(rtl ? '12.5 جرام · عيار 24' : '12.5 g · 24K · 3 bars', 68, 464, 10.5, COLORS.stone, 500);
  }
  // tab bar + FAB
  const tb = y + h - 64 * k;
  c.fillStyle = COLORS.charcoal; c.fillRect(x, tb, w, 64 * k);
  [0, 1, 3, 4].forEach((i) => drawIconPath(c, ['home', 'layers', 'cart', 'user', 'user'][i], x + (i * 60 + 21) * k, tb + 14 * k, 18 * k, i === (kind === 'browse' ? (rtl ? 3 : 1) : rtl ? 4 : 0) ? COLORS.spark : COLORS.stone));
  c.fillStyle = 'rgba(242,212,107,0.14)'; c.beginPath(); c.arc(x + w / 2, tb + 4 * k, 34 * k, 0, Math.PI * 2); c.fill();
  c.fillStyle = COLORS.spark; c.beginPath(); c.arc(x + w / 2, tb + 4 * k, 26 * k, 0, Math.PI * 2); c.fill();
  c.save(); c.translate(x + w / 2, tb + 4 * k); c.rotate(Math.PI / 4); c.fillStyle = COLORS.ink; c.fillRect(-6 * k, -6 * k, 12 * k, 12 * k); c.restore();
}

const topColors = new WeakMap();
function topColor(img) {
  if (topColors.has(img)) return topColors.get(img);
  let rgb = [21, 21, 19];
  try {
    const cv = document.createElement('canvas'); cv.width = 1; cv.height = 1;
    const x = cv.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, img.width, Math.max(1, Math.round(img.height * 0.01)), 0, 0, 1, 1);
    rgb = [...x.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  } catch { /* cross-origin image: keep Onyx */ }
  topColors.set(img, rgb);
  return rgb;
}

function drawPhone(c, layer, ctx, images) {
  const { x, y, w, h } = layer;
  const r = w * 0.15;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = w * 0.18; c.shadowOffsetY = w * 0.09;
  rr(c, x, y, w, h, r); c.fillStyle = '#0b0b0a'; c.fill();
  c.restore();
  c.strokeStyle = '#3a3a37'; c.lineWidth = Math.max(1, w * 0.004); rr(c, x, y, w, h, r); c.stroke();
  const inset = w * 0.033;
  const sx = x + inset, sy = y + inset, sw = w - 2 * inset, sh = h - 2 * inset;
  c.save(); rr(c, sx, sy, sw, sh, r - inset); c.clip();
  const img = images?.get(layer.src);
  if (img && layer.statusBar !== false) {
    // Captured screenshots have no status bar: add one so the camera island never covers content.
    const band = sw * 0.12;
    const [r, g, b] = topColor(img);
    c.fillStyle = `rgb(${r},${g},${b})`; c.fillRect(sx, sy, sw, sh);
    const light = 0.2126 * r + 0.7152 * g + 0.0722 * b > 140;
    c.fillStyle = light ? '#000' : '#fff';
    c.font = `600 ${sw * 0.04}px ${FONTS.latin}`; c.textAlign = 'left'; c.direction = 'ltr';
    c.fillText('9:41', sx + sw * 0.1, sy + band * 0.52);
    c.fillRect(sx + sw * 0.8, sy + band * 0.36, sw * 0.07, sw * 0.03);
    drawImageFit(c, img, sx, sy + band, sw, sh - band, 'width', 'top');
  } else if (img) drawImageFit(c, img, sx, sy, sw, sh, 'cover', 'top');
  else drawAppScreen(c, sx, sy, sw, sh, layer.placeholder || 'home', layer.lang || 'en');
  c.restore();
  // Dynamic island
  c.fillStyle = '#000'; rr(c, x + w / 2 - w * 0.13, sy + w * 0.025, w * 0.26, w * 0.068, w * 0.034); c.fill();
}

function drawBrowser(c, layer, ctx, images) {
  const { x, y, w, h } = layer;
  const r = 18 * ctx.s;
  const bar = Math.max(36 * ctx.s, h * 0.075);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 60 * ctx.s; c.shadowOffsetY = 26 * ctx.s;
  rr(c, x, y, w, h, r); c.fillStyle = COLORS.charcoal; c.fill();
  c.restore();
  c.strokeStyle = isLightTheme(ctx.theme) ? 'rgba(0,0,0,0.08)' : COLORS.slate; c.lineWidth = Math.max(1, 1.5 * ctx.s); rr(c, x, y, w, h, r); c.stroke();
  [COLORS.lossDark, COLORS.spark, COLORS.gainDark].forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.arc(x + bar * 0.6 + i * bar * 0.45, y + bar / 2, bar * 0.13, 0, Math.PI * 2); c.fill(); });
  const uw = Math.min(w * 0.5, 520 * ctx.s);
  c.fillStyle = COLORS.graphite; rr(c, x + (w - uw) / 2, y + bar * 0.2, uw, bar * 0.6, bar * 0.3); c.fill();
  drawIconPath(c, 'lock', x + (w - uw) / 2 + bar * 0.3, y + bar * 0.33, bar * 0.34, COLORS.stone, 2);
  c.font = `500 ${bar * 0.3}px ${FONTS.latin}`; c.fillStyle = COLORS.stone; c.textAlign = 'center'; c.direction = 'ltr';
  c.fillText(layer.url || '', x + w / 2, y + bar * 0.6);
  c.save(); rr(c, x, y + bar, w, h - bar, 0); c.clip();
  c.beginPath(); c.moveTo(x, y + bar); c.lineTo(x + w, y + bar); c.lineTo(x + w, y + h - r); c.arcTo(x + w, y + h, x + w - r, y + h, r); c.lineTo(x + r, y + h); c.arcTo(x, y + h, x, y + h - r, r); c.closePath(); c.clip();
  const img = images?.get(layer.src);
  if (img) drawImageFit(c, img, x, y + bar, w, h - bar, 'width', 'top');
  else drawPlaceholder(c, { x, y: y + bar, w, h: h - bar }, ctx, 'Add a screenshot');
  c.restore();
}

const KW = /\b(const|let|var|function|return|await|async|import|from|export|default|if|else|for|while|class|new|def|fn|pub|type|interface|extends|true|false|null|undefined|self|this|use|struct|impl|package|func)\b/;
function highlight(line) {
  const out = [];
  const re = /(\/\/.*$|#.*$|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b|\s+|.)/g;
  let m;
  while ((m = re.exec(line))) {
    const t = m[0];
    let col = COLORS.white;
    if (/^(\/\/|#)/.test(t)) col = COLORS.stone;
    else if (/^['"`]/.test(t)) col = COLORS.gold;
    else if (/^\d/.test(t)) col = COLORS.amber;
    else if (KW.test(t) && t.match(KW)[0] === t) col = COLORS.spark;
    else if (/^[{}()[\];,.:=<>+\-*/!?&|]$/.test(t)) col = '#C9C5BB';
    out.push([t, col]);
  }
  return out;
}

function drawCode(c, layer, ctx, p, raw) {
  const { x, y, w, h } = layer;
  const s = ctx.s;
  rr(c, x, y, w, h, 24 * s); c.fillStyle = COLORS.charcoal; c.fill();
  c.strokeStyle = COLORS.slate; c.lineWidth = Math.max(1, 1.5 * s); c.stroke();
  const head = 64 * s;
  [COLORS.lossDark, COLORS.spark, COLORS.gainDark].forEach((col, i) => { c.fillStyle = hexA(col, 0.9); c.beginPath(); c.arc(x + 36 * s + i * 24 * s, y + head / 2, 7 * s, 0, Math.PI * 2); c.fill(); });
  c.font = `500 ${20 * s}px ${FONTS.mono}`; c.fillStyle = COLORS.stone; c.textAlign = 'left'; c.direction = 'ltr';
  c.fillText(layer.title || '', x + 120 * s, y + head / 2 + 7 * s);
  c.fillStyle = COLORS.slate; c.fillRect(x, y + head, w, Math.max(1, 1.5 * s));
  const lines = String(layer.code || '').split('\n');
  const pad = 36 * s;
  let size = Math.min(26 * s, (h - head - pad * 2) / (lines.length * 1.6));
  const gutter = size * 2.4;
  c.font = `400 ${size}px ${FONTS.mono}`;
  const maxLen = Math.max(...lines.map((l) => c.measureText(l).width));
  if (maxLen > w - pad * 2 - gutter) { size *= (w - pad * 2 - gutter) / maxLen; c.font = `400 ${size}px ${FONTS.mono}`; }
  let budget = raw < 1 && layer.anim?.in === 'type' ? Math.floor(String(layer.code).length * raw) : Infinity;
  c.save(); c.beginPath(); c.rect(x, y + head, w, h - head); c.clip();
  lines.forEach((ln, i) => {
    const ly = y + head + pad + size * 1.6 * i + size;
    c.fillStyle = COLORS.stoneDark; c.textAlign = 'right';
    c.fillText(String(i + 1), x + pad + gutter - size * 0.9, ly);
    c.textAlign = 'left';
    let cx = x + pad + gutter;
    for (const [tok, col] of highlight(ln)) {
      if (budget <= 0) break;
      const vis = tok.slice(0, budget);
      budget -= tok.length;
      c.fillStyle = col; c.fillText(vis, cx, ly); cx += c.measureText(vis).width;
    }
    budget -= 1;
  });
  c.restore();
}

function drawPager(c, layer, ctx) {
  const total = ctx.total, idx = ctx.index;
  const accent = resolveColor('accent', ctx.theme, { layer, H: ctx.H });
  const dim = resolveColor('fg2', ctx.theme, { layer, H: ctx.H });
  const s = ctx.s;
  const rtl = ctx.rtl;
  const right = rtl !== (layer.align === 'end'); // which edge the pager hugs
  if (layer.style === 'count') {
    c.font = `600 ${22 * s}px ${FONTS.latin}`; c.fillStyle = dim; c.direction = 'ltr'; c.textAlign = right ? 'right' : 'left';
    c.fillText(`${String(idx + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, right ? layer.x + layer.w : layer.x, layer.y + layer.h * 0.7);
    return;
  }
  if (layer.style === 'swipe') {
    const label = rtl ? 'اسحب للمزيد' : 'Swipe';
    c.font = `600 ${24 * s}px ${rtl ? FONTS.arabic : FONTS.latin}`; c.fillStyle = accent; c.direction = rtl ? 'rtl' : 'ltr';
    const tw = c.measureText(label).width;
    const iz = 30 * s, gap = 14 * s;
    const total2 = tw + gap + iz;
    const x0 = right ? layer.x + layer.w - total2 : layer.x;
    c.textAlign = 'left';
    if (rtl) {
      // arrow (pointing left) then label, reading right-to-left
      c.fillText(label, x0 + iz + gap, layer.y + layer.h * 0.72);
      c.save(); c.translate(x0 + iz, layer.y + (layer.h - iz) / 2); c.scale(-1, 1); drawIconPath(c, 'arrow', 0, 0, iz, accent, 2.2); c.restore();
    } else {
      c.fillText(label, x0, layer.y + layer.h * 0.72);
      drawIconPath(c, 'arrow', x0 + tw + gap, layer.y + (layer.h - iz) / 2, iz, accent, 2.2);
    }
    return;
  }
  const d = 10 * s, gap = 12 * s, act = 34 * s;
  const width = (total - 1) * (d + gap) + act;
  let cx = right ? layer.x + layer.w - width : layer.x;
  const order = [...Array(total).keys()];
  if (rtl) order.reverse();
  for (const i of order) {
    const on = i === idx;
    c.fillStyle = on ? accent : hexA(dim.startsWith('#') ? dim : '#9A968C', 0.5);
    rr(c, cx, layer.y + (layer.h - d) / 2, on ? act : d, d, d / 2); c.fill();
    cx += (on ? act : d) + gap;
  }
}

// ---------- layer dispatch & animation ----------
function animState(layer, t, s, rtl) {
  const a = layer.anim || {};
  if (!a.in || a.in === 'none' || t === Infinity) return { alpha: 1, dx: 0, dy: 0, sc: 1, p: 1, raw: 1 };
  const raw = clamp((t - (a.delay || 0)) / (a.dur || 0.6));
  const p = easeOut(raw);
  const st = { alpha: 1, dx: 0, dy: 0, sc: 1, p: 1, raw };
  switch (a.in) {
    case 'fade': st.alpha = p; break;
    case 'fade-up': st.alpha = p; st.dy = (1 - p) * 48 * s; break;
    case 'fade-down': st.alpha = p; st.dy = -(1 - p) * 48 * s; break;
    case 'slide-start': st.alpha = p; st.dx = (rtl ? 1 : -1) * (1 - p) * 120 * s; break;
    case 'slide-end': st.alpha = p; st.dx = (rtl ? -1 : 1) * (1 - p) * 120 * s; break;
    case 'scale': st.alpha = p; st.sc = 0.9 + 0.1 * p; break;
    case 'draw': st.alpha = clamp(raw * 4); st.p = easeInOut(raw); break;
    case 'count': st.alpha = clamp(raw * 5); break;
    case 'type': st.alpha = clamp(raw * 8); break;
    case 'gleam': st.alpha = clamp(raw * 3); break;
    default: break;
  }
  return st;
}

export function drawLayer(c, layer, ctx, t, images) {
  if (layer.hidden) return;
  const st = animState(layer, t, ctx.s, ctx.rtl);
  if (st.alpha <= 0.001) return;
  c.save();
  c.globalAlpha *= (layer.opacity ?? 1) * st.alpha;
  const cx = layer.x + layer.w / 2, cy = layer.y + layer.h / 2;
  c.translate(cx + st.dx, cy + st.dy);
  if (layer.rotation && layer.type !== 'logo') c.rotate((layer.rotation * Math.PI) / 180);
  if (st.sc !== 1) c.scale(st.sc, st.sc);
  c.translate(-cx, -cy);
  const gleamP = layer.anim?.in === 'gleam' && t !== Infinity ? clamp((t - (layer.anim.delay || 0) - (layer.anim.dur || 0.6) * 0.3) / 1.2) : 0;
  switch (layer.type) {
    case 'text': drawText(c, layer, ctx, st.p, st.raw); break;
    case 'list': drawList(c, layer, ctx, st.p, st.raw); break;
    case 'logo': drawLogo(c, layer, ctx); break;
    case 'image': drawImageLayer(c, layer, ctx, images); break;
    case 'phone': drawPhone(c, layer, ctx, images); break;
    case 'browser': drawBrowser(c, layer, ctx, images); break;
    case 'code': drawCode(c, layer, ctx, st.p, st.raw); break;
    case 'goldbar': drawGoldBar(c, layer, ctx, gleamP); break;
    case 'chart': drawChart(c, layer, ctx, st.p); break;
    case 'button': drawButton(c, layer, ctx); break;
    case 'badge': drawBadge(c, layer, ctx); break;
    case 'icon': drawIcon(c, layer, ctx); break;
    case 'gem': drawGem(c, layer, ctx); break;
    case 'shape': drawShape(c, layer, ctx); break;
    case 'pager': drawPager(c, layer, ctx); break;
    default: break;
  }
  c.restore();
}

/** Draw one slide at local time t (seconds since the slide started; Infinity = final state). */
export function renderSlide(c, doc, index, { t = Infinity, images, scale = 1 } = {}) {
  const slide = doc.slides[index];
  const W = doc.width, H = doc.height;
  c.save();
  c.setTransform(scale, 0, 0, scale, 0, 0);
  c.clearRect(0, 0, W, H);
  if (!slide) { c.restore(); return; }
  const s = Math.min(W, H) / 1080;
  const rtl = (slide.content?.lang || doc.lang) === 'ar';
  const ctx = { W, H, s, theme: slide.theme, index, total: doc.slides.length, rtl };
  drawBackground(c, slide, W, H, s, images);
  for (const layer of slide.layers) drawLayer(c, layer, ctx, t, images);
  c.restore();
}

const offscreen = [];
function off(i, w, h) {
  if (!offscreen[i]) offscreen[i] = document.createElement('canvas');
  const cv = offscreen[i];
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  return cv;
}

export const TRANSITION_DUR = 0.6;

/** Draw a video frame at global time t, including slide transitions. */
export function renderFrame(c, doc, t, { images, scale = 1 } = {}) {
  const { index, local } = slideAt(doc, t);
  const W = Math.round(doc.width * scale), H = Math.round(doc.height * scale);
  const slide = doc.slides[index];
  const tr = slide?.transition || 'fade';
  if (index === 0 || tr === 'none' || local >= TRANSITION_DUR) { renderSlide(c, doc, index, { t: local, images, scale }); return; }
  const p = easeInOut(clamp(local / TRANSITION_DUR));
  const a = off(0, W, H), b = off(1, W, H);
  renderSlide(a.getContext('2d'), doc, index - 1, { t: Infinity, images, scale });
  renderSlide(b.getContext('2d'), doc, index, { t: local, images, scale });
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, W, H);
  const rtl = doc.lang === 'ar';
  if (tr === 'slide') {
    const dir = rtl ? 1 : -1;
    c.drawImage(a, dir * p * W, 0);
    c.drawImage(b, dir * (p - 1) * W, 0);
  } else if (tr === 'wipe') {
    c.drawImage(a, 0, 0);
    c.save();
    const reach = (W + H) * p;
    c.beginPath();
    if (rtl) { c.moveTo(W, 0); c.lineTo(W - reach, 0); c.lineTo(W, reach); }
    else { c.moveTo(0, 0); c.lineTo(reach, 0); c.lineTo(0, reach); }
    c.closePath(); c.clip();
    c.drawImage(b, 0, 0);
    c.restore();
  } else {
    // Incoming slide underneath (its layers animate in), outgoing slide fades out quickly on top.
    c.drawImage(b, 0, 0);
    c.globalAlpha = Math.max(0, 1 - p * 1.6);
    c.drawImage(a, 0, 0);
  }
  c.restore();
}
