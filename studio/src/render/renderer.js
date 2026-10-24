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
    if (role === 'overline') return themeId === 'bullion' && layer && layer.y + layer.h / 2 < H * 0.62 ? COLORS.espresso : COLORS[th.accent];
    if (HEADING_ROLES.has(role)) return COLORS[th.heading];
    return COLORS[th.fg];
  }
  if (themeId === 'bullion' && layer && layer.y + layer.h / 2 < H * 0.42 && (token === 'fg' || token === 'fg2' || token === 'heading')) return token === 'fg2' ? '#E9D9C4' : COLORS.white;
  if (themeId === 'bullion' && layer && layer.y + layer.h / 2 < H * 0.42 && token === 'accent') return COLORS.spark;
  // Bullion mid band (about 42–62% height) is a mid-tone gold: only Espresso reads there.
  if (themeId === 'bullion' && layer && (token === 'accent' || token === 'fg2') && layer.y + layer.h / 2 < H * 0.62) return COLORS.espresso;
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

function drawBackground(c, slide, W, H, s, images, lt = 0, live = false) {
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
    if (img) {
      const z = slide.bgMotion === 'zoom' && live ? 1 + 0.06 * Math.min(1, lt / (Number(slide.duration) || 4)) : 1;
      c.save(); c.translate(W / 2, H / 2); c.scale(z, z); c.translate(-W / 2, -H / 2);
      drawImageFit(c, img, 0, 0, W, H, 'cover');
      c.restore();
    }
    c.fillStyle = gradient(c, [[0, 'rgba(21,21,19,0.15)'], [0.55, 'rgba(21,21,19,0.35)'], [1, 'rgba(21,21,19,0.88)']], 0, 0, 0, H);
    c.fillRect(0, 0, W, H);
  }
  if (slide.pattern && slide.pattern !== 'none') {
    const col = COLORS[th.pattern] || COLORS.spark;
    if (slide.bgMotion === 'drift' && live) {
      // The facet pattern drifts along the brand's 45° axis.
      const tw = 120 * s * 1.25, thh = 140 * s * 1.25;
      const big = patternCanvas(W + Math.ceil(tw), H + Math.ceil(thh), s, col, th.patternOpacity, 'full');
      const d = (lt * 14 * s) % tw;
      const dy = ((lt * 14 * s) % thh);
      const tmp = off(9, W, H); const tc = tmp.getContext('2d');
      tc.setTransform(1, 0, 0, 1, 0, 0); tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, W, H);
      tc.drawImage(big, -tw + d, -thh + dy);
      if (slide.pattern === 'top') { tc.globalCompositeOperation = 'destination-in'; tc.fillStyle = gradient(tc, [[0, 'rgba(0,0,0,1)'], [0.7, 'rgba(0,0,0,0)']], 0, 0, 0, H); tc.fillRect(0, 0, W, H); tc.globalCompositeOperation = 'source-over'; }
      c.drawImage(tmp, 0, 0, W, H);
    } else {
      c.drawImage(patternCanvas(W, H, s, col, th.patternOpacity, slide.pattern), 0, 0);
    }
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
  // Never break between a number and its unit, or between "لا" and the word it negates.
  const UNIT = /^(g|kg|oz|K|%|OMR|جرام|جم|غرام|ر\.ع\.?|عيار)$/;
  const merged = [];
  for (const t of out) {
    const prev = merged[merged.length - 1];
    if (prev && !prev.br && !t.br && !t.glue && prev.em === t.em && ((/^[\d.,+−-]+$/.test(prev.w) && UNIT.test(t.w)) || (/^(OMR|عيار)$/.test(prev.w) && /^\d/.test(t.w)) || prev.w === 'لا')) {
      prev.w = `${prev.w}\u00A0${t.w}`;
      continue;
    }
    merged.push({ ...t });
  }
  return merged;
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
  const last = lines[lines.length - 1];
  const prev = lines[lines.length - 2];
  if (last && prev && last.tokens.length === 1 && prev.tokens.length >= 3 && !last.tokens[0].glue) {
    const moved = prev.tokens.pop();
    prev.width -= moved.width + space;
    last.tokens.unshift(moved);
    last.width += moved.width + space;
    if (last.width > maxW) { last.tokens.shift(); last.width -= moved.width + space; prev.tokens.push(moved); prev.width += moved.width + space; }
  }
  const res = { lines, space };
  if (wrapCache.size > 800) wrapCache.clear();
  wrapCache.set(key, res);
  return res;
}

const isRtlWord = (w) => isArabic(w);
const isLtrStrong = (w) => /[A-Za-z0-9]/.test(w) && !isArabic(w);

function drawLine(c, line, x, y, w, align, rtl, space, colors, fx) {
  // Arabic lines with numbers take the run-based path, so "99.9%" never flips to "%99.9" in canvas bidi.
  const plain = !fx && !line.tokens.some((t) => t.em) && !(rtl && line.tokens.some((t) => /\d/.test(t.w)));
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
  const put = (t, k, px) => {
    c.fillStyle = t.em ? colors.accent : colors.base;
    if (!fx) { c.fillText(t.w, px, y); return; }
    const f = fx(k);
    if (f.a <= 0.001) return;
    c.save(); c.globalAlpha *= f.a; c.fillText(t.w, px, y + f.dy); c.restore();
  };
  if (!rtl) {
    let cx = left;
    line.tokens.forEach((t, k) => { if (k && !t.glue) cx += space; c.direction = isRtlWord(t.w) ? 'rtl' : 'ltr'; put(t, k, cx); cx += t.width; });
    return;
  }
  // RTL: group consecutive LTR-strong tokens into runs, lay runs out right-to-left.
  const runs = [];
  line.tokens.forEach((t, k) => {
    const dir = isLtrStrong(t.w) ? 'ltr' : 'rtl';
    const last = runs[runs.length - 1];
    if (last && last.dir === dir && dir === 'ltr') last.tokens.push([t, k]); else runs.push({ dir, tokens: [[t, k]] });
  });
  let cursor = left + line.width;
  let first = true;
  for (const run of runs) {
    if (run.dir === 'rtl') {
      for (const [t, k] of run.tokens) { if (!first && !t.glue) cursor -= space; first = false; cursor -= t.width; c.direction = 'rtl'; put(t, k, cursor); }
    } else {
      if (!first && !run.tokens[0][0].glue) cursor -= space;
      first = false;
      const rw = run.tokens.reduce((acc, [t], j) => acc + t.width + (j && !t.glue ? space : 0), 0);
      cursor -= rw;
      let cx = cursor;
      // Punctuation that ends the Latin run ("99.99%)." ) belongs to the Arabic sentence: draw it at the run's left, mirrored.
      const [lastT, lastK] = run.tokens[run.tokens.length - 1];
      const tail = /^(.*[A-Za-z0-9%])([^A-Za-z0-9%]+)$/.exec(lastT.w);
      if (tail) {
        const tw = c.measureText(tail[2]).width;
        c.direction = 'rtl'; put({ ...lastT, w: tail[2] }, lastK, cx);
        cx += tw;
      }
      run.tokens.forEach(([t, k], j) => {
        if (j && !t.glue) cx += space;
        c.direction = 'ltr';
        if (tail && k === lastK) { put({ ...t, w: tail[1] }, k, cx); return; }
        put(t, k, cx); cx += t.width;
      });
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

/** Uppercase for overlines. A line that names Goldcom keeps its case: "WHY Goldcom" reads as a mistake (brand §2). */
function upperKeepBrand(text) {
  const str = String(text);
  if (/goldcom/i.test(str)) return str;
  // Web addresses and units after a number ("1 g", "10 kg", "1 oz") keep their spelling.
  return str.replace(/(\d\s?)(g|kg|oz|mg)\b/g, '$1\u0000$2').replace(/\S+/g, (w) => (/\.om\b|\.com\b|@|\u0000/i.test(w) ? w : w.toUpperCase())).replace(/\u0000/g, '');
}

function tickText(text, lt, amount = 1) {
  // A live price that keeps moving: jitter the first decimal number by a few units in its last place.
  return String(text).replace(/(\d[\d,]*\.(\d+))/, (num, _w, decs) => {
    const v = parseFloat(num.replace(/,/g, ''));
    if (!isFinite(v)) return num;
    const unit = Math.pow(10, -decs.length);
    const n = Math.round((Math.sin(lt * 1.3) * 9 + Math.sin(lt * 3.1 + 1) * 5 + Math.sin(lt * 0.47 + 2) * 12) * amount);
    return (v + n * unit).toFixed(decs.length);
  });
}

function layoutText(c, layer, s, text) {
  const t = TYPE[layer.role] || TYPE.body;
  const rtl = layer.dir === 'rtl' || (layer.dir !== 'ltr' && isArabic(text));
  const upper = t.upper && !rtl && layer.upper !== false;
  const str = upper ? upperKeepBrand(text) : text;
  let size = (layer.size || t.size * (rtl && t.arScale ? t.arScale : 1)) * s;
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
  const kind = layer.anim?.in;
  const animating = raw < 1;
  if (kind === 'count' && animating) text = countText(text, easeOut(raw));
  else if (layer.loop?.type === 'tick' && ctx.live) text = tickText(text, ctx.lt, layer.loop.amount ?? 1);
  const lay = layoutText(c, layer, ctx.s, layer.text || '');
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
  if (text !== (layer.text || '')) {
    // Re-wrap the changing string with the settled font size so the layout does not jump.
    lines = wrapText(c, (TYPE[layer.role]?.upper && !lay.rtl && layer.upper !== false) ? upperKeepBrand(text) : text, layer.w, lay.font, lay.ls).lines;
  }
  let budget = Infinity;
  if (kind === 'type' && animating) budget = Math.floor(String(layer.text).length * raw);
  const nWords = lines.reduce((acc, l) => acc + l.tokens.length, 0);
  let wordBase = 0;
  lines.forEach((line, li) => {
    let ln = line;
    if (budget !== Infinity) {
      const chars = line.tokens.reduce((acc, t) => acc + t.w.length + 1, 0);
      if (budget <= 0) { budget = -1; return; }
      if (budget < chars) {
        const toks = []; let bgt = budget;
        for (const t of line.tokens) { if (bgt <= 0) break; const w = t.w.slice(0, bgt); toks.push({ ...t, w, width: c.measureText(w).width }); bgt -= t.w.length + 1; }
        ln = { tokens: toks, width: line.width };
      }
      budget -= chars;
    }
    const baseline = y + lay.lh * 0.5 + lay.size * 0.36;
    let fx = null;
    if (kind === 'words' && animating) {
      const off = wordBase;
      const span = 1 + Math.max(0, nWords - 1) * 0.22;
      fx = (k) => { const q = easeOut(clamp(raw * span - (off + k) * 0.22)); return { a: q, dy: (1 - q) * lay.size * 0.35 }; };
    }
    if (kind === 'rise' && animating) {
      const n = lines.length;
      const q = easeOut(clamp(raw * (1 + (n - 1) * 0.3) - li * 0.3));
      c.save();
      c.beginPath(); c.rect(layer.x - lay.size, y - lay.lh * 0.15, layer.w + lay.size * 2, lay.lh * 1.15); c.clip();
      c.translate(0, (1 - q) * lay.lh);
      drawLine(c, ln, layer.x, baseline, layer.w, layer.align || 'start', lay.rtl, lay.space, { base, accent });
      c.restore();
    } else {
      drawLine(c, ln, layer.x, baseline, layer.w, layer.align || 'start', lay.rtl, lay.space, { base, accent }, fx);
    }
    wordBase += line.tokens.length;
    y += lay.lh;
  });
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
function drawLogo(c, layer, ctx, raw = 1) {
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
  const asm = layer.anim?.in === 'assemble' && raw < 1;
  // Assemble: roof drops in, the G rises, the gem pops, then the wordmark settles.
  const seg = (a, b) => (asm ? easeOut(clamp((raw - a) / (b - a))) : 1);
  const back = (q) => (q <= 0 ? 0 : 1 + 2.2 * Math.pow(q - 1, 3) + 1.2 * Math.pow(q - 1, 2));
  const pRoof = seg(0, 0.4), pG = seg(0.15, 0.55), pGem = seg(0.4, 0.75), pInk = seg(0.55, 1);
  c.save(); c.translate(ox, oy); c.scale(k, k);
  if (parts.ink && pInk > 0) {
    c.save(); c.globalAlpha *= pInk; c.translate(parts.ink[0] + (1 - pInk) * (ctx.rtl ? -40 : 40), parts.ink[1]); c.scale(parts.ink[2], parts.ink[2]);
    c.fillStyle = col[0]; c.fill(path2d(LOGO_INK), 'evenodd'); c.restore();
  }
  c.save(); c.translate(parts.symbol[0], parts.symbol[1]); c.scale(parts.symbol[2], parts.symbol[2]);
  if (pRoof > 0) { c.save(); c.globalAlpha *= pRoof; c.translate(0, -(1 - pRoof) * 160); c.fillStyle = col[1]; c.fill(path2d(SYMBOL_ROOF)); c.restore(); }
  if (pG > 0) { c.save(); c.globalAlpha *= pG; c.translate(0, (1 - pG) * 160); c.fillStyle = col[2]; c.fill(path2d(SYMBOL_G)); c.restore(); }
  if (pGem > 0) { const sc = asm ? back(pGem) : 1; c.save(); c.globalAlpha *= Math.min(1, pGem * 2); c.translate(213.5, 483); c.scale(sc, sc); c.translate(-213.5, -483); c.fillStyle = col[2]; c.fill(path2d(SYMBOL_GEM)); c.restore(); }
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
    live: [light ? COLORS.charcoal : 'rgba(21,21,19,0.75)', COLORS.white],
  };
  const [bg, fg] = map[layer.variant] || map.spark;
  if (layer.variant === 'live') {
    // LIVE pill with a pulsing Spark dot.
    rr(c, layer.x, layer.y, layer.w, layer.h, layer.h / 2); c.fillStyle = bg; c.fill();
    c.strokeStyle = hexA(COLORS.spark, 0.35); c.lineWidth = Math.max(1, 2 * ctx.s); c.stroke();
    const rtl2 = layer.dir === 'rtl' || (layer.dir !== 'ltr' && isArabic(layer.text));
    const fs2 = layer.h * 0.42;
    c.font = `700 ${fs2}px ${rtl2 ? FONTS.arabic : FONTS.latin}`;
    c.letterSpacing = rtl2 ? '0px' : `${fs2 * 0.08}px`;
    const label = rtl2 ? layer.text : String(layer.text || '').toUpperCase();
    const tw2 = c.measureText(label).width;
    const dot = layer.h * 0.22, gap2 = layer.h * 0.22;
    const x0 = layer.x + (layer.w - (tw2 + dot * 2 + gap2)) / 2;
    const pulse = ctx.live ? 0.5 + 0.5 * Math.sin(ctx.lt * 5) : 1;
    const dx = rtl2 ? x0 + tw2 + gap2 + dot : x0 + dot;
    c.fillStyle = hexA(COLORS.spark, 0.25 * pulse); c.beginPath(); c.arc(dx, layer.y + layer.h / 2, dot * (1.2 + 0.8 * pulse), 0, Math.PI * 2); c.fill();
    c.fillStyle = COLORS.spark; c.beginPath(); c.arc(dx, layer.y + layer.h / 2, dot, 0, Math.PI * 2); c.fill();
    c.fillStyle = fg; c.textAlign = 'left'; c.direction = rtl2 ? 'rtl' : 'ltr'; c.textBaseline = 'middle';
    c.fillText(label, rtl2 ? x0 : x0 + dot * 2 + gap2, layer.y + layer.h / 2 + fs2 * 0.05);
    c.textBaseline = 'alphabetic'; c.letterSpacing = '0px';
    return;
  }
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
  let pts = (layer.points && layer.points.filter((v) => Number.isFinite(Number(v))).length > 1 ? layer.points.filter((v) => Number.isFinite(Number(v))) : [40, 42, 41, 44, 43, 42, 45, 44, 46, 45, 47, 46, 48]).map(Number);
  const liveChart = layer.loop?.type === 'live' && ctx.live;
  if (liveChart) {
    // Live data: the series breathes and the newest point keeps updating.
    const range = (Math.max(...pts) - Math.min(...pts)) || 1;
    pts = pts.map((v, i) => v + Math.sin(i * 0.9 + ctx.lt * 1.6) * range * 0.035 * (i / pts.length));
    pts[pts.length - 1] += Math.sin(ctx.lt * 2.3) * range * 0.06 + Math.sin(ctx.lt * 5.1) * range * 0.02;
  }
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
  const halo = liveChart ? 14 + 10 * (0.5 + 0.5 * Math.sin(ctx.lt * 4)) : 14;
  c.fillStyle = hexA(up ? COLORS.spark : COLORS.lossDark, liveChart ? 0.18 + 0.12 * Math.cos(ctx.lt * 4) : 0.25); c.beginPath(); c.arc(ex, ey, halo * ctx.s, 0, Math.PI * 2); c.fill();
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
// It shows no prices (brand §11: mock-ups must not look like live quotes) and carries an "Illustrative screen" tag.
function drawAppScreen(c, x, y, w, h, kind, lang) {
  const k = w / 300;
  const rtl = lang === 'ar';
  const X = (px, pw = 0) => (rtl ? x + w - (px + pw) * k : x + px * k);
  const T = (txt, px, py, size, col, weight = 600, align = 'start') => {
    c.font = `${weight} ${size * k}px ${rtl ? FONTS.arabic : FONTS.latin}`; c.fillStyle = col; c.direction = rtl ? 'rtl' : 'ltr';
    c.textAlign = align === 'end' ? (rtl ? 'left' : 'right') : align === 'center' ? 'center' : rtl ? 'right' : 'left';
    c.fillText(txt, rtl ? x + w - px * k : x + px * k, y + py * k);
  };
  c.fillStyle = COLORS.onyx; c.fillRect(x, y, w, h);
  c.font = `600 ${11 * k}px ${FONTS.latin}`; c.fillStyle = COLORS.white; c.textAlign = 'left'; c.direction = 'ltr';
  c.fillText('9:41', x + 24 * k, y + 22 * k);
  // "Illustrative screen" tag under the status bar
  const tag = rtl ? 'شاشة توضيحية' : 'Illustrative screen';
  c.font = `600 ${8.5 * k}px ${rtl ? FONTS.arabic : FONTS.latin}`;
  const tw = c.measureText(tag).width + 14 * k;
  c.fillStyle = 'rgba(154,150,140,0.18)'; rr(c, X(300 - 16 - tw / k, tw / k), y + 32 * k, tw, 15 * k, 7.5 * k); c.fill();
  c.fillStyle = COLORS.stone; c.textAlign = 'center'; c.direction = rtl ? 'rtl' : 'ltr';
  c.fillText(tag, X(300 - 16 - tw / k, tw / k) + tw / 2, y + 42.5 * k);
  if (kind === 'browse') {
    T(rtl ? 'تصفّح' : 'Browse', 16, 72, 20, COLORS.white, 700);
    T(rtl ? 'سبائك عيار 24' : '24K bars', 16, 90, 11, COLORS.stone, 500);
    const items = ['1 g', '2.5 g', '5 g', '10 g'];
    items.forEach((g, i) => {
      const cx = 12 + (i % 2) * 142, cy = 104 + Math.floor(i / 2) * 196;
      c.fillStyle = COLORS.charcoal; rr(c, X(cx, 134), y + cy * k, 134 * k, 184 * k, 14 * k); c.fill();
      const gx = X(cx + 8, 118) + 59 * k;
      const gimg = c.createRadialGradient(gx, y + (cy + 50) * k, 0, gx, y + (cy + 60) * k, 80 * k);
      gimg.addColorStop(0, '#4a4033'); gimg.addColorStop(1, '#262521');
      c.fillStyle = gimg; rr(c, X(cx + 8, 118), y + (cy + 8) * k, 118 * k, 110 * k, 10 * k); c.fill();
      drawGoldBar(c, { x: X(cx + 46, 42), y: y + (cy + 26) * k, w: 42 * k, h: 70 * k, label: g, sub: '999.9' }, {}, 0);
      T(rtl ? `سبيكة ${g.replace(/\s*g$/, '')} جرام` : `Gold bar · ${g}`, cx + 10, cy + 140, 11, COLORS.white, 600);
      T(rtl ? 'عيار 24 · معتمدة' : '24K · certified', cx + 10, cy + 160, 9.5, COLORS.stone, 500);
    });
  } else {
    T(rtl ? 'مساء الخير' : 'Good evening', 16, 70, 11, COLORS.stone, 500);
    T(rtl ? 'محمود' : 'Mahmood', 16, 88, 15, COLORS.white, 700);
    c.fillStyle = COLORS.charcoal; rr(c, x + 12 * k, y + 102 * k, 276 * k, 214 * k, 16 * k); c.fill();
    T(rtl ? 'ذهبي' : 'My gold', 26, 126, 11, COLORS.stone, 500);
    c.font = `700 ${28 * k}px ${rtl ? FONTS.arabic : FONTS.latin}`; c.fillStyle = COLORS.white; c.direction = rtl ? 'rtl' : 'ltr'; c.textAlign = rtl ? 'right' : 'left';
    c.fillText(rtl ? '12.5 جرام' : '12.5 g', rtl ? x + w - 26 * k : x + 26 * k, y + 158 * k);
    T(rtl ? 'عيار 24 · 3 سبائك' : '24K · 3 bars', 26, 176, 10.5, COLORS.stone, 500);
    // Holdings, not a chart: a mock screen should not suggest that gold only goes up (brand §11.2).
    const rows = rtl ? [['سبيكة 5 جرام', '× 2'], ['سبيكة 2.5 جرام', '× 1']] : [['5 g bar', '× 2'], ['2.5 g bar', '× 1']];
    rows.forEach(([name, qty], i) => {
      const ry = 196 + i * 52;
      c.fillStyle = COLORS.graphite; rr(c, X(22, 256), y + ry * k, 256 * k, 42 * k, 10 * k); c.fill();
      drawGoldBar(c, { x: X(32, 16), y: y + (ry + 8) * k, w: 16 * k, h: 26 * k, label: '', sub: '' }, {}, 0);
      T(name, 58, ry + 26, 11.5, COLORS.white, 600);
      T(qty, 266, ry + 26, 11.5, COLORS.stone, 500, 'end');
    });
    const acts = rtl ? ['شراء', 'بيع', 'إهداء', 'استلام'] : ['Buy', 'Sell', 'Gift', 'Collect'];
    const icn = ['buy', 'sell', 'gift', 'pin'];
    acts.forEach((a, i) => {
      const ax = 22 + i * 68;
      c.fillStyle = COLORS.graphite; rr(c, X(ax, 48), y + 332 * k, 48 * k, 48 * k, 12 * k); c.fill();
      drawIconPath(c, icn[i], X(ax, 48) + 13 * k, y + 345 * k, 22 * k, COLORS.gold);
      T(a, ax + 24, 398, 10.5, COLORS.stone, 500, 'center');
    });
    c.fillStyle = COLORS.graphite; rr(c, x + 12 * k, y + 414 * k, 276 * k, 64 * k, 16 * k); c.fill();
    drawIconPath(c, 'gift', X(28, 26), y + 433 * k, 26 * k, COLORS.gold);
    T(rtl ? 'أهدِ الذهب لمن تحب' : 'Send gold as a gift', 68, 442, 12, COLORS.white, 700);
    T(rtl ? 'اختر الوزن وأضف رسالتك' : 'Choose a weight, add a message', 68, 460, 10, COLORS.stone, 500);
  }
  // tab bar + FAB
  const tb = y + h - 64 * k;
  c.fillStyle = COLORS.charcoal; c.fillRect(x, tb, w, 64 * k);
  const tabs = ['home', 'layers', null, 'cart', 'user'];
  const active = kind === 'browse' ? 1 : 0;
  tabs.forEach((ic, i) => { if (ic) drawIconPath(c, ic, X(i * 60 + 21, 18), tb + 14 * k, 18 * k, i === active ? COLORS.spark : COLORS.stone); });
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

function scrollOffset(layer, ctx, img, vw, vh) {
  // Long screenshots scroll gently up and down, like someone using the app.
  if (layer.loop?.type !== 'scroll' || !ctx.live) return 0;
  const max = vw * img.height / img.width - vh;
  if (max <= 0) return 0;
  const period = 9 / (layer.loop.speed || 1);
  return max * (0.5 - 0.5 * Math.cos((2 * Math.PI * ctx.lt) / period));
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
    c.drawImage(img, sx, sy + band - scrollOffset(layer, ctx, img, sw, sh - band), sw, sw * img.height / img.width);
  } else if (img) { const off2 = scrollOffset(layer, ctx, img, sw, sh); if (off2) c.drawImage(img, sx, sy - off2, sw, sw * img.height / img.width); else drawImageFit(c, img, sx, sy, sw, sh, 'cover', 'top'); }
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
  if (img) c.drawImage(img, x, y + bar - scrollOffset(layer, ctx, img, w, h - bar), w, w * img.height / img.width);
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

// ---------- live & interactive layers ----------
const FONT = (w, px, rtl) => `${w} ${px}px ${rtl ? FONTS.arabic : FONTS.latin}`;
const rtlOf = (layer, text) => layer.dir === 'rtl' || (layer.dir !== 'ltr' && isArabic(text || ''));

function fitFont(c, text, weight, size, maxW, rtl, min = 0.5) {
  let sz = size;
  c.font = FONT(weight, sz, rtl);
  while (c.measureText(text).width > maxW && sz > size * min) { sz *= 0.94; c.font = FONT(weight, sz, rtl); }
  return sz;
}

function drawTicker(c, layer, ctx) {
  const { x, y, w, h } = layer;
  const light = isLightTheme(ctx.theme);
  c.save();
  c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.fillStyle = light ? COLORS.white : 'rgba(29,29,31,0.92)'; c.fillRect(x, y, w, h);
  c.fillStyle = light ? COLORS.mist : COLORS.slate; c.fillRect(x, y, w, Math.max(1, 2 * ctx.s)); c.fillRect(x, y + h - Math.max(1, 2 * ctx.s), w, Math.max(1, 2 * ctx.s));
  const items = (layer.items || []).filter((i) => String(i).trim());
  if (!items.length) { c.restore(); return; }
  const rtl = rtlOf(layer, items.join(' '));
  const fs = h * 0.36;
  const gap = h * 0.9;
  c.font = FONT(600, fs, rtl);
  const widths = items.map((it) => c.measureText(it).width);
  const cycle = widths.reduce((acc, v) => acc + v + gap, 0);
  const speed = (layer.speed || 90) * ctx.s;
  let offset = ctx.live ? (ctx.lt * speed) % cycle : 0;
  const fg = light ? COLORS.charcoal : COLORS.white;
  const cy = y + h / 2;
  c.textBaseline = 'middle';
  for (let rep = -1; rep * cycle < w + cycle; rep++) {
    let px = rtl ? x + w - rep * cycle + offset : x + rep * cycle - offset;
    items.forEach((it, i) => {
      const iw = widths[i];
      const left = rtl ? px - iw : px;
      if (left < x + w && left + iw > x) {
        const m = it.match(/([▲▼].*)$/);
        c.direction = rtl ? 'rtl' : 'ltr'; c.textAlign = 'left';
        if (m) {
          const head = it.slice(0, m.index);
          const hw = c.measureText(head).width;
          c.fillStyle = fg;
          if (rtl) { c.fillText(head, left + iw - hw, cy); c.fillStyle = m[1].startsWith('▲') ? (light ? COLORS.gainLight : COLORS.gainDark) : (light ? COLORS.lossLight : COLORS.lossDark); c.direction = 'ltr'; c.fillText(m[1], left, cy); }
          else { c.fillText(head, left, cy); c.fillStyle = m[1].startsWith('▲') ? (light ? COLORS.gainLight : COLORS.gainDark) : (light ? COLORS.lossLight : COLORS.lossDark); c.fillText(m[1], left + hw, cy); }
        } else { c.fillStyle = fg; c.fillText(it, left, cy); }
      }
      // gem separator
      const gx = rtl ? left - gap / 2 : left + iw + gap / 2;
      const g = h * 0.13;
      c.save(); c.translate(gx, cy); c.rotate(Math.PI / 4); c.fillStyle = COLORS.gold; c.fillRect(-g / 2, -g / 2, g, g); c.restore();
      px = rtl ? px - iw - gap : px + iw + gap;
    });
  }
  c.textBaseline = 'alphabetic';
  c.restore();
}

function appIcon(c, x, y, size) {
  rr(c, x, y, size, size, size * 0.24); c.fillStyle = COLORS.onyx; c.fill();
  const k = (size * 0.62) / 540;
  c.save(); c.translate(x + (size - 427 * k) / 2, y + size * 0.19); c.scale(k, k);
  c.fillStyle = COLORS.amber; c.fill(path2d(SYMBOL_ROOF)); c.fillStyle = COLORS.gold; c.fill(path2d(SYMBOL_G)); c.fill(path2d(SYMBOL_GEM));
  c.restore();
}

function drawNotification(c, layer, ctx) {
  const { x, y, w, h } = layer;
  const light = isLightTheme(ctx.theme);
  const rtl = rtlOf(layer, `${layer.title} ${layer.body}`);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 40 * ctx.s; c.shadowOffsetY = 14 * ctx.s;
  rr(c, x, y, w, h, Math.min(h * 0.22, 40 * ctx.s)); c.fillStyle = light ? COLORS.white : '#2A2B28'; c.fill();
  if (light) { c.save(); c.shadowColor = 'transparent'; c.strokeStyle = COLORS.mist; c.lineWidth = Math.max(1, 2 * ctx.s); c.stroke(); c.restore(); }
  c.restore();
  const pad = h * 0.14;
  const icon = Math.min(h * 0.34, 64 * ctx.s * 1.4);
  const ix = rtl ? x + w - pad - icon : x + pad;
  appIcon(c, ix, y + pad, icon);
  const tx = rtl ? x + pad : x + pad * 2 + icon;
  const tw = w - pad * 3 - icon;
  const fg = light ? COLORS.charcoal : COLORS.white;
  const fg2 = light ? COLORS.stoneDark : '#C9C5BB';
  c.textBaseline = 'alphabetic';
  // app name + time
  c.font = FONT(600, h * 0.11, false); c.fillStyle = fg2; c.direction = 'ltr';
  c.textAlign = rtl ? 'right' : 'left';
  const app = !layer.app || (rtl && /^goldcom$/i.test(layer.app)) ? (rtl ? 'جولدكم' : 'Goldcom') : String(layer.app);
  c.font = FONT(600, h * 0.11, isArabic(app)); c.direction = isArabic(app) ? 'rtl' : 'ltr';
  c.fillText(app, rtl ? tx + tw : tx, y + pad + h * 0.1);
  c.font = FONT(500, h * 0.11, rtl); c.textAlign = rtl ? 'left' : 'right'; c.direction = rtl ? 'rtl' : 'ltr';
  c.fillText(layer.time || '', rtl ? tx : tx + tw, y + pad + h * 0.1);
  // title + body
  c.textAlign = rtl ? 'right' : 'left';
  const ts = fitFont(c, layer.title || '', 700, h * 0.16, tw, rtl);
  c.font = FONT(700, ts, rtl); c.fillStyle = fg; c.direction = rtl ? 'rtl' : 'ltr';
  c.fillText(layer.title || '', rtl ? tx + tw : tx, y + pad + h * 0.33);
  const bs = fitFont(c, layer.body || '', 400, h * 0.14, tw, rtl, 0.6);
  c.font = FONT(400, bs, rtl); c.fillStyle = fg2;
  c.fillText(layer.body || '', rtl ? tx + tw : tx, y + pad + h * 0.55);
}

function drawSticker(c, layer, ctx, p, raw) {
  const { x, y, w, h } = layer;
  if (layer.guide) {
    // Space for a native Instagram sticker: visible while editing, never exported.
    if (!ctx.guides) return;
    const rtlG = rtlOf(layer, layer.question || '');
    c.save();
    c.setLineDash([14 * ctx.s, 10 * ctx.s]); c.strokeStyle = hexA(COLORS.info, 0.9); c.lineWidth = 3 * ctx.s;
    rr(c, x, y, w, h, 28 * ctx.s); c.stroke(); c.setLineDash([]);
    c.fillStyle = hexA(COLORS.info, 0.08); c.fill();
    const names = { poll: ['Instagram poll sticker', 'ملصق تصويت من إنستغرام'], quiz: ['Instagram quiz sticker', 'ملصق اختبار من إنستغرام'], slider: ['Instagram emoji slider', 'ملصق شريط التفاعل من إنستغرام'], question: ['Instagram questions sticker', 'ملصق الأسئلة من إنستغرام'], countdown: ['Instagram countdown sticker', 'ملصق العد التنازلي من إنستغرام'] };
    const [en, ar] = names[layer.kind] || names.poll;
    c.fillStyle = COLORS.info; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = FONT(700, 30 * ctx.s, rtlG); c.direction = rtlG ? 'rtl' : 'ltr';
    c.fillText(rtlG ? ar : en, x + w / 2, y + h / 2 - 22 * ctx.s);
    c.font = FONT(500, 22 * ctx.s, rtlG);
    c.fillText(rtlG ? 'أضفه هنا عند النشر · لا يظهر في التصدير' : 'Add it here when posting · not exported', x + w / 2, y + h / 2 + 22 * ctx.s);
    if (layer.question) { c.font = FONT(600, 24 * ctx.s, rtlG); c.fillText(`“${layer.question}”`, x + w / 2, y + h / 2 + 62 * ctx.s); }
    c.restore();
    return;
  }
  const rtl = rtlOf(layer, `${layer.question} ${(layer.options || []).join(' ')}`);
  const r = Math.min(36 * ctx.s, h * 0.12);
  const k = w / 640;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.3)'; c.shadowBlur = 36 * ctx.s; c.shadowOffsetY = 12 * ctx.s;
  rr(c, x, y, w, h, r); c.fillStyle = COLORS.cream; c.fill();
  c.restore();
  const pad = 32 * k;
  const kind = layer.kind || 'poll';
  // gold header band with the question
  const head = kind === 'countdown' ? h * 0.3 : Math.min(h * 0.36, 120 * k);
  c.save(); rr(c, x, y, w, h, r); c.clip();
  c.fillStyle = gradient(c, GRADIENTS.goldLeaf, x, y, x + w, y + head); c.fillRect(x, y, w, head);
  c.restore();
  const q = layer.question || '';
  const qs = fitFont(c, q, 700, 34 * k, w - pad * 2, rtl, 0.55);
  c.font = FONT(700, qs, rtl); c.fillStyle = COLORS.espresso; c.textAlign = 'center'; c.direction = rtl ? 'rtl' : 'ltr'; c.textBaseline = 'middle';
  c.fillText(q, x + w / 2, y + head / 2);
  c.textBaseline = 'alphabetic';
  const body = { x: x + pad, y: y + head + pad * 0.8, w: w - pad * 2, h: h - head - pad * 1.6 };
  const show = raw >= 1 ? 1 : easeOut(clamp((raw - 0.35) / 0.65));
  if (kind === 'poll' || kind === 'quiz') {
    const opts = (layer.options || []).slice(0, kind === 'quiz' ? 4 : 2);
    const n = Math.max(1, opts.length);
    const gap = 14 * k;
    const rowH = Math.min(84 * k, (body.h - gap * (n - 1)) / n);
    const results = layer.result || [];
    const best = results.indexOf(Math.max(...results));
    opts.forEach((o, i) => {
      const ry = body.y + i * (rowH + gap);
      rr(c, body.x, ry, body.w, rowH, rowH / 2); c.fillStyle = COLORS.white; c.fill();
      c.strokeStyle = COLORS.mist; c.lineWidth = Math.max(1, 2 * k); c.stroke();
      const showRes = kind === 'quiz' ? layer.reveal === true || layer.reveal === 'yes' : layer.showResults !== false && results.length > 0;
      const pct = !showRes ? 0 : kind === 'quiz' ? (i === (layer.correct ?? 0) ? 100 : 0) : Number(results[i] || 0);
      const fw = body.w * (pct / 100) * show;
      if (fw > 0) {
        c.save(); rr(c, body.x, ry, body.w, rowH, rowH / 2); c.clip();
        const fx = rtl ? body.x + body.w - fw : body.x;
        c.fillStyle = kind === 'quiz' ? hexA(COLORS.gainLight, 0.18) : (i === best ? gradient(c, GRADIENTS.goldLeaf, fx, ry, fx + fw, ry) : hexA(COLORS.stone, 0.25));
        c.fillRect(fx, ry, fw, rowH);
        c.restore();
      }
      const os = fitFont(c, o, 700, 28 * k, body.w * 0.62, rtl, 0.6);
      c.font = FONT(700, os, rtl); c.fillStyle = COLORS.charcoal; c.direction = rtl ? 'rtl' : 'ltr'; c.textBaseline = 'middle';
      c.textAlign = rtl ? 'right' : 'left';
      const label = kind === 'quiz' ? `${'ABCD'[i]}  ${o}` : o;
      c.fillText(label, rtl ? body.x + body.w - rowH * 0.45 : body.x + rowH * 0.45, ry + rowH / 2);
      if (showRes && show > 0.05) {
        c.globalAlpha *= show;
        c.font = FONT(700, 26 * k, false); c.direction = 'ltr'; c.textAlign = rtl ? 'left' : 'right';
        const tail = kind === 'quiz' ? (i === (layer.correct ?? 0) ? '✓' : '') : `${Math.round(pct * show)}%`;
        c.fillStyle = kind === 'quiz' ? COLORS.gainLight : COLORS.charcoal;
        c.fillText(tail, rtl ? body.x + rowH * 0.45 : body.x + body.w - rowH * 0.45, ry + rowH / 2);
        c.globalAlpha /= show;
      }
      c.textBaseline = 'alphabetic';
    });
  } else if (kind === 'slider') {
    const ty = body.y + body.h * 0.55;
    const th = 18 * k;
    rr(c, body.x, ty - th / 2, body.w, th, th / 2); c.fillStyle = COLORS.mist; c.fill();
    const v = clamp(Number(layer.value ?? 0.8)) * (raw >= 1 ? 1 : easeOut(clamp(raw * 1.4 - 0.2)));
    const fw = body.w * v;
    const fx = rtl ? body.x + body.w - fw : body.x;
    c.fillStyle = gradient(c, GRADIENTS.goldLeaf, fx, ty, fx + fw, ty); rr(c, fx, ty - th / 2, Math.max(th, fw), th, th / 2); c.fill();
    const kx = rtl ? body.x + body.w - fw : body.x + fw;
    c.font = `${70 * k}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'ltr';
    const bob = ctx.live ? Math.sin(ctx.lt * 3) * 4 * k : 0;
    c.fillText(layer.emoji || '✨', kx, ty + bob);
    c.textBaseline = 'alphabetic';
  } else if (kind === 'question') {
    rr(c, body.x, body.y + body.h * 0.15, body.w, body.h * 0.7, 24 * k); c.fillStyle = COLORS.white; c.fill();
    c.strokeStyle = COLORS.mist; c.lineWidth = Math.max(1, 2 * k); c.stroke();
    c.font = FONT(500, 26 * k, rtl); c.fillStyle = COLORS.stone; c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = rtl ? 'rtl' : 'ltr';
    const ph = layer.placeholder || (rtl ? 'اكتب سؤالك…' : 'Type your question…');
    const caret = ctx.live && Math.floor(ctx.lt * 2) % 2 === 0 ? '|' : ' ';
    c.fillText(`${ph}${caret}`, body.x + body.w / 2, body.y + body.h / 2);
    c.textBaseline = 'alphabetic';
  } else if (kind === 'countdown') {
    drawCountdown(c, { days: 25, hours: 6, minutes: 30, seconds: 12, ...layer, x: body.x, y: body.y, w: body.w, h: body.h, compact: true }, ctx);
  }
}

const CD_LABELS = { en: ['days', 'hours', 'min', 'sec'], ar: ['أيام', 'ساعات', 'دقائق', 'ثوانٍ'] };
function drawCountdown(c, layer, ctx) {
  const { x, y, w, h } = layer;
  const rtl = layer.dir === 'rtl' || (layer.dir !== 'ltr' && ctx.rtl);
  const labels = layer.labels && layer.labels !== 'auto' ? String(layer.labels).split(',') : CD_LABELS[rtl ? 'ar' : 'en'];
  let total = ((Number(layer.days) || 0) * 86400) + ((Number(layer.hours) || 0) * 3600) + ((Number(layer.minutes) || 0) * 60) + (Number(layer.seconds) || 0);
  const elapsed = layer.live !== false && ctx.live ? ctx.lt : 0;
  const now = Math.max(0, total - Math.floor(elapsed));
  const frac = elapsed - Math.floor(elapsed);
  const parts = [Math.floor(now / 86400), Math.floor((now % 86400) / 3600), Math.floor((now % 3600) / 60), now % 60];
  const prevS = Math.max(0, total - Math.floor(elapsed) + 1);
  const prev = [Math.floor(prevS / 86400), Math.floor((prevS % 86400) / 3600), Math.floor((prevS % 3600) / 60), prevS % 60];
  const light = isLightTheme(ctx.theme) || layer.compact;
  const n = 4, gap = w * 0.03;
  const bw = (w - gap * (n - 1)) / n;
  const bh = layer.compact ? h * 0.78 : h * 0.72;
  const order = rtl ? [3, 2, 1, 0] : [0, 1, 2, 3];
  order.forEach((pi, col) => {
    const bx = x + col * (bw + gap);
    rr(c, bx, y, bw, bh, Math.min(bw, bh) * 0.16); c.fillStyle = light ? COLORS.white : COLORS.graphite; c.fill();
    if (light) { c.strokeStyle = COLORS.mist; c.lineWidth = Math.max(1, 2 * ctx.s); c.stroke(); }
    c.save(); rr(c, bx, y, bw, bh, Math.min(bw, bh) * 0.16); c.clip();
    const val = String(parts[pi]).padStart(2, '0');
    const old = String(prev[pi]).padStart(2, '0');
    const rolling = ctx.live && layer.live !== false && val !== old && frac < 0.3;
    const q = rolling ? easeOut(frac / 0.3) : 1;
    c.font = `700 ${Math.min(bh * 0.55, bw * 0.46)}px ${FONTS.latin}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'ltr';
    c.fillStyle = light ? COLORS.charcoal : COLORS.white;
    c.letterSpacing = `${-bh * 0.01}px`;
    if (rolling) { c.globalAlpha *= 1 - q; c.fillText(old, bx + bw / 2, y + bh / 2 + q * bh * 0.6); c.globalAlpha /= Math.max(0.001, 1 - q); c.globalAlpha *= q; }
    c.fillText(val, bx + bw / 2, y + bh / 2 - (1 - q) * bh * 0.6);
    c.restore();
    c.letterSpacing = '0px';
    c.font = FONT(500, Math.min(bh * 0.16, 26 * ctx.s * (layer.compact ? 0.9 : 1.2)), rtl); c.fillStyle = layer.compact ? COLORS.stoneDark : resolveColor('fg2', ctx.theme, { layer, H: ctx.H }); c.direction = rtl ? 'rtl' : 'ltr';
    c.textBaseline = 'alphabetic'; c.textAlign = 'center';
    c.fillText(labels[pi] || '', bx + bw / 2, y + bh + (h - bh) * 0.7);
  });
  c.textBaseline = 'alphabetic';
}

function drawProgress(c, layer, ctx, p) {
  const { x, y, w, h } = layer;
  const light = isLightTheme(ctx.theme);
  const v = clamp(Number(layer.value) || 0) * p;
  const rtl = rtlOf(layer, `${layer.label} ${layer.sub}`);
  if (layer.style === 'bar') {
    const th = Math.max(10 * ctx.s, h * 0.22);
    const ty = y + h - th;
    rr(c, x, ty, w, th, th / 2); c.fillStyle = light ? COLORS.mist : COLORS.graphite; c.fill();
    const fw = Math.max(th * (v > 0 ? 1 : 0), w * v);
    const fx = rtl ? x + w - fw : x;
    if (fw > 0) { rr(c, fx, ty, fw, th, th / 2); c.fillStyle = gradient(c, GRADIENTS.goldLeaf, fx, ty, fx + fw, ty); c.fill(); }
    const fs = Math.min(h - th - 8 * ctx.s, 32 * ctx.s) * 0.95;
    c.textBaseline = 'alphabetic';
    c.font = FONT(600, fs, rtl); c.fillStyle = light ? COLORS.charcoal : COLORS.white; c.direction = rtl ? 'rtl' : 'ltr'; c.textAlign = rtl ? 'right' : 'left';
    c.fillText(layer.label || '', rtl ? x + w : x, ty - th * 0.6);
    c.font = FONT(700, fs, false); c.textAlign = rtl ? 'left' : 'right'; c.direction = 'ltr'; c.fillStyle = light ? COLORS.bronze : COLORS.gold;
    c.fillText(layer.sub || '', rtl ? x : x + w, ty - th * 0.6);
    return;
  }
  const d = Math.min(w, h);
  const cx = x + w / 2, cy = y + h / 2;
  const lw = d * 0.085;
  const r = d / 2 - lw / 2;
  c.lineCap = 'round';
  c.strokeStyle = light ? COLORS.mist : COLORS.graphite; c.lineWidth = lw;
  c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
  if (v > 0) {
    c.strokeStyle = gradient(c, GRADIENTS.goldLeaf, cx - r, cy - r, cx + r, cy + r);
    const a0 = -Math.PI / 2;
    c.beginPath();
    if (rtl) c.arc(cx, cy, r, a0, a0 - v * Math.PI * 2, true); else c.arc(cx, cy, r, a0, a0 + v * Math.PI * 2);
    c.stroke();
  }
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const ls = fitFont(c, layer.label || '', 700, d * 0.2, d * 0.62, rtl);
  c.font = FONT(700, ls, rtl); c.fillStyle = light ? COLORS.charcoal : COLORS.white; c.direction = rtl ? 'rtl' : 'ltr';
  c.fillText(layer.label || '', cx, cy - d * 0.04);
  c.font = FONT(500, d * 0.075, rtl); c.fillStyle = light ? COLORS.stoneDark : COLORS.stone;
  c.fillText(layer.sub || '', cx, cy + d * 0.12);
  c.textBaseline = 'alphabetic';
}

function drawChat(c, layer, ctx, p, raw) {
  const { x, y, w, h } = layer;
  const msgs = (layer.messages || []).filter((m) => m && String(m.text || '').trim());
  if (!msgs.length) return;
  const light = isLightTheme(ctx.theme);
  const rtl = rtlOf(layer, msgs.map((m) => m.text).join(' '));
  const fs = 34 * ctx.s;
  const lh = fs * (rtl ? 1.55 : 1.4);
  const pad = fs * 0.75;
  const maxW = w * 0.78;
  const font = FONT(400, fs, rtl);
  // Messages appear one after another; a typing indicator shows before each incoming one.
  const n = msgs.length;
  const animating = raw < 1;
  const slot = 1 / n;
  const bubbles = msgs.map((m) => {
    const wr = wrapText(c, m.text, maxW - pad * 2, font, 0);
    const bw = Math.min(maxW, Math.max(...wr.lines.map((l) => l.width)) + pad * 2);
    return { m, wr, bw, bh: wr.lines.length * lh + pad * 1.3 };
  });
  const gap = fs * 0.55;
  let visible = n;
  let typing = false;
  let lastP = 1;
  if (animating) {
    const pos = raw * n;
    visible = Math.min(n, Math.floor(pos) + 1);
    const frac = pos - Math.floor(pos);
    const cur = msgs[visible - 1];
    typing = cur && cur.from !== 'me' && frac < 0.45;
    lastP = typing ? 0 : easeOut(clamp((frac - (cur?.from !== 'me' ? 0.45 : 0)) / 0.35));
  }
  void slot;
  const shown = bubbles.slice(0, visible);
  let totalH = shown.reduce((acc, b, i) => acc + (i === visible - 1 && typing ? fs * 2.2 : b.bh) + gap, 0);
  c.save(); c.beginPath(); c.rect(x - 20, y, w + 40, h); c.clip();
  let cy = y + Math.min(0, h - totalH);
  shown.forEach((b, i) => {
    const me = b.m.from === 'me';
    const right = me !== rtl; // outgoing bubbles sit on the reading end
    const isLast = i === visible - 1;
    if (isLast && typing) {
      const tw = fs * 3.2, th = fs * 2.2;
      const tx = right ? x + w - tw : x;
      rr(c, tx, cy, tw, th, th / 2); c.fillStyle = light ? COLORS.white : COLORS.slate; c.fill();
      if (light) { c.strokeStyle = COLORS.mist; c.lineWidth = Math.max(1, 2 * ctx.s); c.stroke(); }
      for (let d = 0; d < 3; d++) {
        const ph = ctx.live ? (Math.sin(ctx.lt * 7 - d * 0.9) + 1) / 2 : 0.5;
        c.fillStyle = hexA(light ? COLORS.stoneDark : COLORS.stone, 0.4 + 0.6 * ph);
        c.beginPath(); c.arc(tx + tw * (0.3 + d * 0.2), cy + th / 2 - ph * fs * 0.12, fs * 0.13, 0, Math.PI * 2); c.fill();
      }
      return;
    }
    const q = isLast ? lastP : 1;
    if (q <= 0) return;
    c.save();
    c.globalAlpha *= q;
    const bx = right ? x + w - b.bw : x;
    c.translate(0, (1 - q) * fs);
    const rad = Math.min(b.bh / 2, fs * 1.1);
    rr(c, bx, cy, b.bw, b.bh, rad);
    // Brand replies: graphite with a gold edge (Spark is kept for the main action only, brand §4).
    c.fillStyle = me ? COLORS.graphite : light ? COLORS.white : COLORS.slate; c.fill();
    if (me) { c.strokeStyle = COLORS.gold; c.lineWidth = Math.max(1, 2.5 * ctx.s); c.stroke(); }
    else if (light) { c.strokeStyle = COLORS.mist; c.lineWidth = Math.max(1, 2 * ctx.s); c.stroke(); }
    c.font = font; c.fillStyle = me ? COLORS.white : light ? COLORS.charcoal : COLORS.white;
    b.wr.lines.forEach((ln, li) => drawLine(c, ln, bx + pad, cy + pad * 0.65 + li * lh + lh * 0.5 + fs * 0.36, b.bw - pad * 2, 'start', rtl, b.wr.space, { base: c.fillStyle, accent: COLORS.bronze }));
    c.restore();
    cy += b.bh + gap;
  });
  c.restore();
  void totalH;
}

function drawTap(c, layer, ctx) {
  if (!ctx.live) return; // a tap ripple only makes sense in motion
  const cx = layer.x + layer.w / 2, cy = layer.y + layer.h / 2;
  const R = Math.min(layer.w, layer.h) / 2;
  const period = 1.4;
  const ph = ctx.live ? (ctx.lt % period) / period : 0.4;
  for (let i = 0; i < 2; i++) {
    const q = (ph + i * 0.5) % 1;
    c.strokeStyle = hexA(COLORS.white, 0.7 * (1 - q)); c.lineWidth = Math.max(1.5, R * 0.06);
    c.beginPath(); c.arc(cx, cy, R * (0.35 + 0.65 * q), 0, Math.PI * 2); c.stroke();
  }
  c.save(); c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = R * 0.4;
  c.fillStyle = hexA(COLORS.white, 0.92); c.beginPath(); c.arc(cx, cy, R * 0.3, 0, Math.PI * 2); c.fill();
  c.restore();
}

function rand(seed) { let x = Math.sin(seed * 9301 + 49297) * 233280; return x - Math.floor(x); }
function drawSparkles(c, layer, ctx) {
  const n = Math.max(0, Math.min(120, Number(layer.count) || 20));
  const seed = Number(layer.seed) || 1;
  for (let i = 0; i < n; i++) {
    const px = layer.x + rand(seed + i * 3.1) * layer.w;
    const py = layer.y + rand(seed + i * 7.7) * layer.h;
    const size = (6 + rand(seed + i * 1.9) * 16) * ctx.s;
    if ((ctx.avoid || []).some((r) => px > r.x - size && px < r.x + r.w + size && py > r.y - size && py < r.y + r.h + size)) continue;
    const phase = rand(seed + i * 5.3) * Math.PI * 2;
    const tw = ctx.live ? Math.abs(Math.sin(ctx.lt * (0.8 + rand(seed + i) * 1.4) + phase)) : 0.35 + 0.65 * Math.abs(Math.sin(phase));
    const drift = ctx.live ? Math.sin(ctx.lt * 0.6 + phase) * 6 * ctx.s : 0;
    const sz = size * (0.3 + 0.7 * tw);
    c.save();
    c.translate(px, py - drift);
    c.globalAlpha *= 0.25 + 0.75 * tw;
    c.fillStyle = i % 3 === 0 ? COLORS.spark : COLORS.gold;
    c.beginPath();
    c.moveTo(0, -sz); c.quadraticCurveTo(0, 0, sz, 0); c.quadraticCurveTo(0, 0, 0, sz); c.quadraticCurveTo(0, 0, -sz, 0); c.quadraticCurveTo(0, 0, 0, -sz);
    c.fill();
    c.restore();
  }
}

// ---------- layer dispatch & animation ----------
const backOut = (p) => 1 + 2.4 * Math.pow(p - 1, 3) + 1.4 * Math.pow(p - 1, 2);
const TEXT_ONLY = new Set(['words', 'rise']);

function animState(layer, ctx) {
  const t = ctx.t, s = ctx.s, rtl = ctx.rtl;
  const a = layer.anim || {};
  const st = { alpha: 1, dx: 0, dy: 0, sc: 1, p: 1, raw: 1, blur: 0, rot: 0, sheen: -1 };
  const finite = Number.isFinite(t);
  if (a.in && a.in !== 'none' && finite) {
    const raw = clamp((t - (a.delay || 0)) / (a.dur || 0.6));
    const p = easeOut(raw);
    st.raw = raw;
    let kind = a.in;
    if (TEXT_ONLY.has(kind) && layer.type !== 'text') kind = 'fade-up';
    switch (kind) {
      case 'fade': st.alpha = p; break;
      case 'fade-up': st.alpha = p; st.dy = (1 - p) * 48 * s; break;
      case 'fade-down': st.alpha = p; st.dy = -(1 - p) * 48 * s; break;
      case 'slide-start': st.alpha = p; st.dx = (rtl ? 1 : -1) * (1 - p) * 120 * s; break;
      case 'slide-end': st.alpha = p; st.dx = (rtl ? -1 : 1) * (1 - p) * 120 * s; break;
      case 'scale': st.alpha = p; st.sc = 0.9 + 0.1 * p; break;
      case 'pop': st.alpha = clamp(raw * 3); st.sc = raw <= 0 ? 0.6 : 0.6 + 0.4 * backOut(raw); break;
      case 'blur': st.alpha = p; st.blur = (1 - p) * 18 * s; st.sc = 1.04 - 0.04 * p; break;
      case 'drop': st.alpha = clamp(raw * 3); st.dy = -(1 - (raw <= 0 ? 0 : backOut(raw))) * 140 * s; break;
      case 'words': case 'rise': st.alpha = raw > 0 ? 1 : 0; break;
      case 'draw': st.alpha = clamp(raw * 4); st.p = easeInOut(raw); break;
      case 'count': st.alpha = clamp(raw * 5); break;
      case 'type': st.alpha = clamp(raw * 8); break;
      case 'assemble': st.alpha = raw > 0 ? 1 : 0; break;
      case 'gleam': st.alpha = clamp(raw * 3); break;
      default: break;
    }
  }
  // Exit before the slide ends (video, reels and animated exports).
  if (a.out && a.out !== 'none' && finite && Number.isFinite(ctx.dur)) {
    const od = a.outDur || 0.45;
    const q = easeInOut(clamp((t - (ctx.dur - od - 0.05)) / od));
    if (q > 0) {
      st.alpha *= 1 - q;
      if (a.out === 'fade-down') st.dy += q * 50 * s;
      if (a.out === 'fade-up') st.dy -= q * 50 * s;
      if (a.out === 'scale') st.sc *= 1 - 0.12 * q;
    }
  }
  // Continuous loop motion.
  const lp = layer.loop?.type;
  if (lp && lp !== 'none' && ctx.live) {
    const lt = ctx.lt, sp = layer.loop.speed || 1, amt = layer.loop.amount ?? 1;
    if (lp === 'float') st.dy += Math.sin((lt * 2 * Math.PI * sp) / 3.2) * 12 * s * amt;
    if (lp === 'pulse') st.sc *= 1 + 0.035 * amt * Math.sin((lt * 2 * Math.PI * sp) / 1.6);
    if (lp === 'breathe') st.alpha *= 0.72 + 0.28 * (0.5 + 0.5 * Math.sin((lt * 2 * Math.PI * sp) / 2.4));
    if (lp === 'spin') st.rot += lt * 24 * sp;
    if (lp === 'zoom') st.sc *= 1 + 0.06 * amt * Math.min(1, lt / (Number.isFinite(ctx.dur) ? ctx.dur : 6));
    if (lp === 'shimmer') { const per = 3.2 / sp; const ph = (lt % per) / per; st.sheen = ph < 0.45 ? ph / 0.45 : -1; }
  }
  return st;
}

function drawLayerBody(c, layer, ctx, st, images) {
  const gleamP = layer.anim?.in === 'gleam' && Number.isFinite(ctx.t) ? clamp((ctx.t - (layer.anim.delay || 0) - (layer.anim.dur || 0.6) * 0.3) / 1.2) : 0;
  switch (layer.type) {
    case 'text': drawText(c, layer, ctx, st.p, st.raw); break;
    case 'list': drawList(c, layer, ctx, st.p, st.raw); break;
    case 'logo': drawLogo(c, layer, ctx, st.raw); break;
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
    case 'ticker': drawTicker(c, layer, ctx); break;
    case 'notification': drawNotification(c, layer, ctx); break;
    case 'sticker': drawSticker(c, layer, ctx, st.p, st.raw); break;
    case 'countdown': drawCountdown(c, layer, ctx); break;
    case 'progress': drawProgress(c, layer, ctx, layer.anim?.in === 'draw' ? st.p : 1); break;
    case 'chat': drawChat(c, layer, ctx, st.p, st.raw); break;
    case 'tap': drawTap(c, layer, ctx); break;
    case 'sparkles': drawSparkles(c, layer, ctx); break;
    default: break;
  }
}

/** Light sweep across whatever a layer drew (logo, bars, buttons, headlines). */
function sheenPass(c, layer, st, ctx, images) {
  const m = c.getTransform();
  const margin = Math.max(layer.w, layer.h) * 0.15;
  const bx = layer.x - margin, by = layer.y - margin, bw = layer.w + margin * 2, bh = layer.h + margin * 2;
  const pw = Math.max(1, Math.ceil(bw * m.a)), ph = Math.max(1, Math.ceil(bh * m.d));
  const cv = off(8, pw, ph);
  const oc = cv.getContext('2d');
  oc.setTransform(1, 0, 0, 1, 0, 0); oc.globalCompositeOperation = 'source-over'; oc.globalAlpha = 1; oc.filter = 'none'; oc.clearRect(0, 0, pw, ph);
  oc.setTransform(m.a, 0, 0, m.d, -bx * m.a, -by * m.d);
  drawLayerBody(oc, layer, ctx, st, images);
  oc.globalCompositeOperation = 'source-atop';
  const gx = bx - bw * 0.3 + st.sheen * bw * 1.6;
  const g = oc.createLinearGradient(gx - bw * 0.18, by, gx + bw * 0.18, by + bh * 0.35);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,248,220,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  oc.fillStyle = g; oc.fillRect(bx, by, bw, bh);
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(cv, Math.round(bx * m.a + m.e), Math.round(by * m.d + m.f));
  c.restore();
}

export function drawLayer(c, layer, ctx, images) {
  if (layer.hidden) return;
  const st = animState(layer, ctx);
  if (st.alpha <= 0.001) return;
  c.save();
  c.globalAlpha *= (layer.opacity ?? 1) * st.alpha;
  if (st.blur > 0.3) c.filter = `blur(${st.blur * (c.getTransform().a || 1)}px)`;
  const cx = layer.x + layer.w / 2, cy = layer.y + layer.h / 2;
  c.translate(cx + st.dx, cy + st.dy);
  const rot = (layer.type !== 'logo' ? layer.rotation || 0 : 0) + st.rot;
  if (rot) c.rotate((rot * Math.PI) / 180);
  if (st.sc !== 1) c.scale(st.sc, st.sc);
  c.translate(-cx, -cy);
  const m = c.getTransform();
  if (st.sheen >= 0 && !m.b && !m.c) sheenPass(c, layer, st, ctx, images);
  else drawLayerBody(c, layer, ctx, st, images);
  c.restore();
}

/** Draw one slide at local time t (seconds since the slide started; Infinity = final state). */
export function renderSlide(c, doc, index, opts = {}) {
  const { t = Infinity, images, scale = 1 } = opts;
  const slide = doc.slides[index];
  const W = doc.width, H = doc.height;
  c.save();
  c.setTransform(scale, 0, 0, scale, 0, 0);
  c.clearRect(0, 0, W, H);
  if (!slide) { c.restore(); return; }
  const s = Math.min(W, H) / 1080;
  const rtl = (slide.content?.lang || doc.lang) === 'ar';
  const live = Number.isFinite(t);
  const avoid = slide.layers.filter((l) => !l.hidden && ['text', 'list', 'button', 'badge', 'notification', 'sticker', 'countdown', 'chat', 'logo', 'progress'].includes(l.type)).map((l) => ({ x: l.x, y: l.y, w: l.w, h: l.h }));
  const ctx = { W, H, s, theme: slide.theme, index, total: doc.slides.length, rtl, t, lt: live ? t : 0, live, dur: Number(slide.duration) || 4, avoid, guides: !!opts.guides };
  drawBackground(c, slide, W, H, s, images, ctx.lt, live);
  for (const layer of slide.layers) drawLayer(c, layer, ctx, images);
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
  // Outgoing slide keeps its loops running (continuous time) instead of freezing.
  renderSlide(a.getContext('2d'), doc, index - 1, { t: (Number(doc.slides[index - 1].duration) || 4) + local, images, scale });
  renderSlide(b.getContext('2d'), doc, index, { t: local, images, scale });
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, W, H);
  const rtl = doc.lang === 'ar';
  if (tr === 'slide') {
    const dir = rtl ? 1 : -1;
    c.drawImage(a, dir * p * W, 0);
    c.drawImage(b, dir * (p - 1) * W, 0);
  } else if (tr === 'zoom') {
    c.save(); c.globalAlpha = Math.max(0, 1 - p * 1.4);
    const za = 1 + 0.25 * p; c.translate(W / 2, H / 2); c.scale(za, za); c.translate(-W / 2, -H / 2); c.drawImage(a, 0, 0); c.restore();
    c.save(); c.globalAlpha = Math.min(1, p * 1.6);
    const zb = 0.92 + 0.08 * p; c.translate(W / 2, H / 2); c.scale(zb, zb); c.translate(-W / 2, -H / 2); c.drawImage(b, 0, 0); c.restore();
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
