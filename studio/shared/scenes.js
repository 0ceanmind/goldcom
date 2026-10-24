// Production scenes: motion-designed building blocks for Reels, Stories and carousels.
// Each scene is a template (same contract as templates.js) whose layout may also return a camera move.
// Scenes are built for 9:16 first and adapt to 4:5, 1:1 and 16:9.
import { DISCLAIMER } from './brand.js';
import { ctxHelpers, estimateText, L, anim, textLayer, logoLayer, pagerLayers, disclaimerLayer } from './layout.js';

const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d);
const list = (v) => (Array.isArray(v) ? v : String(v || '').split('\n')).map((x) => String(x).trim()).filter(Boolean);
const out = (layer, ctx, t = 0.45) => ({ ...layer, anim: { ...layer.anim, out: ctx.seq ? 'fade' : 'none', outDur: t } });

// ---------- footage helpers ----------
/** Footage time map for a scene: short hold on the first frame, then play `from`→`to`, speeding up if it is too long. */
export function footagePlan(c, dur) {
  const from = num(c.from, 0);
  const to = Math.max(from + 0.2, num(c.to, from + dur));
  const lead = num(c.lead, 0.45); // seconds the first frame holds while the title lands
  const tail = 0.35; // hold the last frame before the cut
  const avail = Math.max(0.5, dur - lead - tail);
  const rate = Math.min(3, Math.max(1, (to - from) / avail));
  const playEnd = lead + (to - from) / rate;
  const vmap = [[0, from], [lead, from], [playEnd, to], [Math.max(playEnd + 0.01, dur + 1), to]];
  return { from, to, rate, lead, vmap, toSlide: (ft) => lead + (ft - from) / rate };
}

/**
 * Camera that eases towards each tap on the phone screen and back out. The tap is framed in the lower-middle of the
 * picture (below the fixed title) and pulled towards the phone's centre line so the device never leaves the frame.
 */
export function framePoint(fx, fy, { W, H, z, phoneCx, phoneW = 0, frameY = 0.6, pull = 0.55 }) {
  const px = W / 2 + (fx - phoneCx) * (1 - pull) * z * 0.5;
  const py = H * frameY;
  let cx = fx - (px - W / 2) / z, cy = fy - (py - H / 2) / z;
  // When the zoomed phone still fits the width, keep it centred and only move vertically (calmer, no cropping).
  if (phoneW && phoneW * z <= W * 0.97) cx = phoneCx;
  const hw = W / (2 * z), hh = H / (2 * z);
  cx = Math.min(W - hw, Math.max(hw, cx));
  cy = Math.min(H - hh, Math.max(hh, cy));
  return { x: cx, y: cy };
}

function tapCamera(taps, screen, ctx, { zoom = 1.35, dur } = {}) {
  if (!taps.length) return null;
  const W = ctx.W, H = ctx.fullH;
  const phoneCx = screen.x + screen.w / 2;
  const keys = [{ t: 0, x: W / 2, y: H / 2, zoom: 1 }];
  let last = 0;
  taps.forEach((tp, i) => {
    const z = zoom;
    const f = framePoint(screen.x + tp.x * screen.w, screen.y + tp.y * screen.h, { W, H, z, phoneCx, phoneW: screen.w * 1.1 });
    const tIn = Math.max(last + 0.05, tp.t - 0.75);
    const tHit = Math.max(tIn + 0.35, tp.t - 0.05);
    const next = taps[i + 1];
    const prev = keys[keys.length - 1];
    keys.push({ t: tIn, x: prev.x, y: prev.y, zoom: prev.zoom, ease: 'smooth' });
    keys.push({ t: tHit, x: f.x, y: f.y, zoom: z, ease: 'smooth' });
    const hold = next ? Math.min(next.t - 0.8, tp.t + 0.9) : Math.min(dur - 0.7, tp.t + 1.0);
    if (hold > tHit) keys.push({ t: hold, x: f.x, y: f.y, zoom: z, ease: 'linear' });
    if (!next || next.t - tp.t > 2.4) { const back = Math.min(dur - 0.05, Math.max(hold, tHit) + 0.7); keys.push({ t: back, x: W / 2, y: H / 2, zoom: 1, ease: 'smooth' }); last = back; }
    else last = Math.max(hold, tHit);
  });
  return keys.filter((k, i, a) => !i || k.t > a[i - 1].t);
}

/** Phone geometry centred horizontally, top at y, width w (9:16 screen). */
function phoneBox(h, { w, y, frame = 'iphone', x }) {
  const ratio = frame === 'android' ? 0.4705 : 0.4844;
  const pw = Math.round(w), ph = Math.round(w / ratio);
  return { x: x ?? Math.round((h.W - pw) / 2), y: Math.round(y), w: pw, h: ph };
}
function screenOf(box, frame = 'iphone') {
  const sp = frame === 'android' ? { rim: 0.009, bezel: 0.028 } : { rim: 0.011, bezel: 0.036 };
  const inset = box.w * (sp.rim + sp.bezel);
  return { x: box.x + inset, y: box.y + inset, w: box.w - 2 * inset, h: box.h - 2 * inset, r: Math.max(0, box.w * (frame === 'android' ? 0.105 : 0.165) - inset) };
}

/** A phone layer that shows footage (video or screenshot) with its time map, taps and a tap hint for stills. */
function footagePhone(h, ctx, c, box, { delay = 0.15, enter = 'rise', tilt = null } = {}) {
  const frame = c.frame || 'iphone';
  const src = c.footage || c.screenshot || '';
  const video = /\.(mp4|webm|mov)$|\/video/.test(src);
  const plan = footagePlan(c, ctx.dur);
  // A tap in the last moments of a clip belongs to the next step: leave it out so the ripple never gives it away.
  const taps = video ? (c.taps || []).filter((tp) => tp.t >= plan.from - 0.05 && tp.t <= plan.to - 0.35).map((tp) => ({ t: +plan.toSlide(tp.t).toFixed(3), x: tp.x, y: tp.y })) : [];
  // Stills show this step's own tap (inside its footage range), never a tap from another step of the recording.
  const next = video ? (c.taps || []).find((tp) => tp.t >= plan.from - 0.05 && tp.t <= plan.to + 0.3) : (c.taps || [])[0];
  // A manual "x,y" overrides it; anything that is not two numbers (e.g. a sentence) falls back to the recorded tap.
  const manual = String(c.hint || '').split(',').map((v) => (v.trim() === '' ? NaN : Number(v)));
  const hint = c.hint === 'none' ? null : manual.length === 2 && manual.every(Number.isFinite) ? manual : next ? [next.x, next.y] : null;
  const keys = [];
  if (ctx.seq && enter === 'rise') {
    keys.push({ t: delay, y: box.y + Math.round(260 * h.s), opacity: 0 });
    keys.push({ t: delay + 0.9, y: box.y, opacity: 1, ease: 'expoOut' });
  }
  const layer = L('phone', {
    name: 'device', src, frame, statusBar: video || c.statusBar === 'no' ? false : true, lang: ctx.lang, placeholder: c.placeholder || 'home',
    x: box.x, y: box.y, w: box.w, h: box.h, tilt: tilt || undefined, shadow: 'floating',
    vmap: video ? plan.vmap : undefined, poster: video ? num(c.poster, plan.from + Math.min(0.4, (plan.to - plan.from) / 2)) : undefined,
    taps, tapHint: !ctx.seq && hint ? { x: hint[0], y: hint[1] } : null,
    keys: keys.length ? keys : undefined, anim: keys.length ? anim('none', 0) : anim('fade-up', delay, 0.8),
  });
  return { layer, taps, plan };
}

/** Fixed backdrop behind a title block: solid down to the text, then a soft fade, so zoomed footage slides under it. */
function plateLayer(h, textBottom) {
  const top = -Math.round(400 * h.s);
  const solidTo = textBottom + Math.round(24 * h.s);
  const height = solidTo + Math.round(150 * h.s) - top;
  return L('shape', { name: 'plate', shape: 'rect', fill: 'fade-down', solid: (solidTo - top) / height, x: 0, y: top, w: h.W, h: height, fixed: true, anim: anim('none', 0) });
}

const stepLabel = (lang, n, total) => (lang === 'ar' ? `الخطوة ${n}${total ? ` من ${total}` : ''}` : `Step ${n}${total ? ` of ${total}` : ''}`);

// ---------- characters ----------
const PERSONS = {
  man: { gender: 'man', outfit: 'dishdasha', headwear: 'kumma', age: 'adult', beard: true },
  'young-man': { gender: 'man', outfit: 'dishdasha', headwear: 'kumma', age: 'young', beard: false },
  'senior-man': { gender: 'man', outfit: 'dishdasha', headwear: 'massar', age: 'senior', beard: true },
  'casual-man': { gender: 'man', outfit: 'casual', headwear: 'none', age: 'young', beard: false },
  woman: { gender: 'woman', outfit: 'abaya', headwear: 'hijab', age: 'adult' },
  'young-woman': { gender: 'woman', outfit: 'abaya', headwear: 'sheila', age: 'young' },
  'senior-woman': { gender: 'woman', outfit: 'abaya', headwear: 'hijab', age: 'senior' },
  'casual-woman': { gender: 'woman', outfit: 'casual', headwear: 'hijab', age: 'young' },
};
export const PERSON_IDS = Object.keys(PERSONS);
export const POSES = ['stand', 'phone', 'phone-happy', 'stressed', 'thinking', 'celebrate', 'give-gift', 'receive-gift', 'wave', 'point', 'shrug', 'walk', 'sit', 'hold-goldbar', 'present'];
export const MOODS = ['neutral', 'happy', 'worried', 'surprised', 'calm', 'proud'];
export const PROPS = ['none', 'phone', 'giftbox', 'goldbar', 'receipts', 'bag', 'coffee'];
export const SETS = ['studio', 'room', 'night-room', 'souq', 'office', 'outdoor-muscat'];

function personSpec(c, prefix, defaults = {}) {
  const g = (k) => c[`${prefix}${k}`];
  const base = PERSONS[g('person') || defaults.person || 'man'] || PERSONS.man;
  const prop = g('prop') || defaults.prop;
  return {
    ...base,
    skin: g('skin') || defaults.skin || 'medium',
    pose: g('pose') || defaults.pose || 'stand',
    mood: g('mood') || defaults.mood || 'neutral',
    prop: prop && prop !== 'none' ? prop : null,
    accent: g('accent') || defaults.accent || 'gold',
    facing: defaults.facing || 'front',
    seed: defaults.seed || 1,
  };
}

function characterLayer(h, spec, box, { delay = 0.2, name = 'character', from = 'up' } = {}) {
  const k = from === 'side' ? anim('slide-start', delay, 0.8) : anim('fade-up', delay, 0.8);
  return L('character', { name, spec, x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h), anim: k });
}

// ---------- scenes ----------
export const SCENES = {
  hook: {
    name: 'Hook (kinetic opener)',
    group: 'production',
    description: 'The first 1.5–3 s of a Reel: one bold line that lands word by word, a gold underline, optional kicker and a visual (phone rising from the bottom, gold bar, or a character). Use exactly one per Reel, first.',
    fields: [
      { key: 'kicker', label: 'Kicker', type: 'text' },
      { key: 'title', label: 'Hook line (≤ 7 words, *accent*)', type: 'textarea' },
      { key: 'subtitle', label: 'Second line (optional)', type: 'textarea' },
      { key: 'visual', label: 'Visual', type: 'select', options: ['none', 'phone', 'goldbar', 'character'] },
      { key: 'footage', label: 'Phone footage / screenshot', type: 'asset' },
      { key: 'from', label: 'Footage start (s)', type: 'text' },
      { key: 'b_person', label: 'Character', type: 'select', options: PERSON_IDS },
      { key: 'b_pose', label: 'Pose', type: 'select', options: POSES },
      { key: 'b_mood', label: 'Mood', type: 'select', options: MOODS },
    ],
    example: { kicker: 'In 60 seconds', title: 'Buy *real gold* from your phone', visual: 'phone' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const res = [];
      const tall = ctx.fullH / ctx.W > 1.5;
      const hasVisual = c.visual && c.visual !== 'none';
      res.push(L('glow', { name: 'glow', x: -h.W * 0.25, y: (tall ? 0.18 : 0.05) * ctx.H, w: h.W * 1.5, h: h.W * 1.2, color: 'gold', intensity: 0.22, bleed: false, anim: anim('fade', 0, 1.2), loop: { type: 'breathe', speed: 0.6 } }));
      const blocks = [];
      if (c.kicker) blocks.push(textLayer(h, { name: 'kicker', text: c.kicker, role: 'overline', x: h.m, y: 0, w: h.cw, color: 'accent', lang: ctx.lang, delay: 0.05, a: 'fade' }));
      const title = textLayer(h, { name: 'title', text: c.title || '', role: 'display', x: h.m, y: 0, w: h.cw, lang: ctx.lang, delay: 0.15, a: 'words' });
      title.anim.dur = 0.9;
      blocks.push(title);
      if (c.subtitle) blocks.push(textLayer(h, { name: 'subtitle', text: c.subtitle, role: 'body-lg', x: h.m, y: 0, w: h.cw, color: 'fg2', lang: ctx.lang, delay: 0.9 }));
      const gap = Math.round(26 * h.s);
      const textH = blocks.reduce((a, l) => a + l.h, 0) + gap * (blocks.length - 1);
      let y = hasVisual ? Math.round(tall ? 120 * h.s : 80 * h.s) : Math.round((ctx.H - textH) * 0.42);
      for (const l of blocks) { l.y = y; y += l.h + gap; }
      // Gold rule under the headline, drawn left-to-right (right-to-left in Arabic).
      const ruleW = Math.round(Math.min(h.cw * 0.42, 360 * h.s));
      const rule = L('shape', { name: 'rule', shape: 'rect', fill: 'goldLeaf', radius: 3 * h.s, x: h.X(h.m, ruleW), y: title.y + title.h + Math.round(10 * h.s), w: ruleW, h: Math.max(4, Math.round(6 * h.s)), anim: anim('none', 0) });
      rule.keys = [{ t: 0.55, w: 0, x: h.rtl ? h.m + ruleW : h.m }, { t: 1.15, w: ruleW, x: h.X(h.m, ruleW), ease: 'expoOut' }];
      if (c.subtitle) { const sub = blocks[blocks.length - 1]; sub.y += Math.round(30 * h.s); }
      // Slow push-in on the headline keeps the frame alive.
      title.keys = [{ t: 0, scale: 1.04 }, { t: ctx.dur, scale: 1, ease: 'out' }];
      res.push(...blocks.map((l) => out(l, ctx)), out(rule, ctx));
      const below = y + Math.round(80 * h.s);
      if (c.visual === 'phone') {
        const box = phoneBox(h, { w: h.W * (tall ? 0.62 : 0.5), y: below + (tall ? 30 * h.s : 0) });
        const { layer } = footagePhone(h, ctx, { ...c, to: num(c.from, 0) + ctx.dur }, box, { delay: 0.35 });
        res.splice(1, 0, layer);
      } else if (c.visual === 'goldbar') {
        const bh = Math.min(ctx.H - below - 40 * h.s, 640 * h.s), bw = bh * 0.62;
        const bar = L('goldbar', { name: 'visual', label: c.barLabel || '1 g', sub: 'FINE GOLD\n999.9', x: (h.W - bw) / 2, y: below + (ctx.H - below - bh) / 2, w: bw, h: bh, rotation: -8, anim: anim('scale', 0.4, 0.9), loop: { type: 'float', speed: 0.7 } });
        bar.keys = [{ t: 0.4, rotation: -14 }, { t: ctx.dur, rotation: 4, ease: 'inOut' }];
        res.push(bar, L('sparkles', { name: 'sparkles', x: bar.x - bw, y: bar.y - bh * 0.2, w: bw * 3, h: bh * 1.4, count: 18, seed: 3, anim: anim('fade', 0.8, 1) }));
      } else if (c.visual === 'character') {
        const ch = Math.min(ctx.H - below + 40 * h.s, h.W * 1.1);
        res.push(characterLayer(h, personSpec(c, 'b_', { person: 'woman', pose: 'phone-happy', mood: 'happy', prop: 'phone' }), { x: (h.W - ch * 0.5) / 2, y: ctx.H - ch, w: ch * 0.5, h: ch }, { delay: 0.45 }));
      }
      return res;
    },
  },

  'app-step': {
    name: 'App step (real footage)',
    group: 'production',
    description: 'One step of a how-to: step badge, short instruction, and the real app screen recording playing inside a phone. The camera zooms to each tap and tap ripples show where to press. For carousels it shows a still with a tap hint.',
    fields: [
      { key: 'step', label: 'Step number', type: 'text' },
      { key: 'total', label: 'Total steps (optional)', type: 'text' },
      { key: 'title', label: 'Instruction (≤ 6 words, *accent*)', type: 'textarea' },
      { key: 'body', label: 'Helper line', type: 'textarea' },
      { key: 'footage', label: 'Footage (recording or screenshot)', type: 'asset' },
      { key: 'from', label: 'Footage start (s)', type: 'text' },
      { key: 'to', label: 'Footage end (s)', type: 'text' },
      { key: 'zoom', label: 'Camera zoom on taps', type: 'select', options: ['1.35', '1.2', '1.6', '1'] },
      { key: 'frame', label: 'Phone', type: 'select', options: ['iphone', 'android'] },
      { key: 'hint', label: 'Tap ring position on stills as "x,y" fractions of the screen (empty = the recorded tap; "none" = no ring)', type: 'text' },
      { key: 'placeholder', label: 'Mock screen when no footage', type: 'select', options: ['home', 'browse'] },
    ],
    example: { step: '1', title: 'Open *Browse*', body: 'Bars start from one gram.', placeholder: 'browse' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const res = [];
      const tall = ctx.fullH / ctx.W > 1.5;
      const wide = h.wide;
      const badge = Math.round(96 * h.s);
      const textW = wide ? Math.round(h.cw * 0.48) : h.cw;
      let y = wide ? Math.round(ctx.H * 0.22) : h.m;
      const step = L('step', { name: 'step', text: String(c.step || '1'), x: h.X(h.m, badge), y, w: badge, h: badge, fixed: true, anim: anim('pop', 0.05, 0.6) });
      const label = textLayer(h, { name: 'kicker', text: stepLabel(ctx.lang, c.step || 1, c.total), role: 'overline', x: h.m + badge + Math.round(28 * h.s), y: y + Math.round((badge - 30 * h.s) / 2), w: textW - badge - 28 * h.s, color: 'accent', lang: ctx.lang, delay: 0.1, a: 'fade' });
      if (h.rtl) label.x = h.W - h.m - badge - Math.round(28 * h.s) - label.w;
      y += badge + Math.round(34 * h.s);
      const title = textLayer(h, { name: 'title', text: c.title || '', role: tall ? 'h1' : 'h2', x: h.m, y, w: textW, lang: ctx.lang, delay: 0.15, a: 'rise' });
      y += title.h + Math.round(14 * h.s);
      const body = c.body ? textLayer(h, { name: 'body', text: c.body, role: 'body-lg', x: h.m, y, w: textW, color: 'fg2', lang: ctx.lang, delay: 0.3 }) : null;
      if (body) y += body.h;
      const textBottom = y;
      // Phone: big, bleeding off the bottom on tall formats so the screen fills the frame.
      let box;
      if (wide) box = phoneBox(h, { w: ctx.H * 0.47, y: h.m * 0.6, x: h.rtl ? h.m * 1.5 : h.W - h.m * 1.5 - ctx.H * 0.47 });
      else if (tall) box = phoneBox(h, { w: h.W * 0.66, y: textBottom + Math.round(70 * h.s) });
      else box = phoneBox(h, { w: h.W * 0.56, y: textBottom + Math.round(56 * h.s) });
      let { layer, taps } = footagePhone(h, ctx, { ...c, frame: c.frame || 'iphone' }, box, { delay: 0.2 });
      // On a still the phone may bleed off the bottom, but never past the button the viewer is told to tap.
      if (!ctx.seq && !wide && layer.tapHint) {
        const limit = ctx.H - Math.round(80 * h.s);
        const hintY = (b) => { const sc = screenOf(b, layer.frame); return sc.y + layer.tapHint.y * sc.h; };
        let w = box.w;
        while (hintY(box) > limit && w > h.W * 0.38) { w -= h.W * 0.02; box = phoneBox(h, { w, y: box.y }); }
        ({ layer, taps } = footagePhone(h, ctx, { ...c, frame: c.frame || 'iphone' }, box, { delay: 0.2 }));
      }
      res.push(layer);
      // Dark plate behind the text so zoomed footage slides under it cleanly.
      res.push(plateLayer(h, textBottom));
      res.push(...[step, label, title, body].filter(Boolean).map((l) => ({ ...out(l, ctx), fixed: true })));
      // Segmented progress (like Stories): earlier steps full, this one fills while it plays, later ones dim.
      const total = Math.min(10, Math.max(0, Math.round(num(c.total, 0))));
      const cur = Math.round(num(c.step, 1));
      if (total > 1 && cur >= 1 && cur <= total) {
        const gap = Math.round(8 * h.s), bw = (h.cw - gap * (total - 1)) / total, bh = Math.max(4, Math.round(6 * h.s));
        const by = Math.round(h.m * 0.35);
        for (let i = 1; i <= total; i++) {
          const bx = h.rtl ? h.W - h.m - i * bw - (i - 1) * gap : h.m + (i - 1) * (bw + gap);
          res.push(L('shape', { name: `progress${i}`, shape: 'rect', fill: 'slate', radius: bh / 2, x: bx, y: by, w: bw, h: bh, fixed: true, opacity: 0.9, anim: anim('none', 0) }));
          if (i <= cur) {
            const fill = L('shape', { name: `progress-fill${i}`, shape: 'rect', fill: 'spark', radius: bh / 2, x: bx, y: by, w: bw, h: bh, fixed: true, anim: anim('none', 0) });
            if (i === cur && ctx.seq) fill.keys = h.rtl ? [{ t: 0, x: bx + bw, w: 0 }, { t: ctx.dur, x: bx, w: bw, ease: 'linear' }] : [{ t: 0, w: 0 }, { t: ctx.dur, w: bw, ease: 'linear' }];
            res.push(fill);
          }
        }
      }
      const zoom = num(c.zoom, 1.35);
      const screen = screenOf(layer, layer.frame);
      const camera = ctx.seq && zoom > 1.01 ? tapCamera(taps, { ...screen, y: screen.y + ctx.top }, ctx, { zoom, dur: ctx.dur }) : null;
      return { layers: res, camera, cameraAbsolute: true };
    },
  },

  'app-hero': {
    name: 'App hero (3D phone)',
    group: 'production',
    description: 'Campaign shot: a 3D-tilted phone (or two) that slowly turns, with a headline. Like the App Store creatives. Best on the Bullion theme, or Onyx.',
    fields: [
      { key: 'kicker', label: 'Kicker', type: 'text' },
      { key: 'title', label: 'Headline (*accent*)', type: 'textarea' },
      { key: 'subtitle', label: 'Subtitle', type: 'textarea' },
      { key: 'footage', label: 'Screen (recording or screenshot)', type: 'asset' },
      { key: 'footage2', label: 'Second phone screen (optional)', type: 'asset' },
      { key: 'from', label: 'Footage start (s)', type: 'text' },
      { key: 'frame', label: 'Phone', type: 'select', options: ['iphone', 'android'] },
      { key: 'placeholder', label: 'Mock screen when no footage', type: 'select', options: ['browse', 'home'] },
    ],
    example: { title: 'Shop with *confidence*', subtitle: 'Certified 24K bars from one gram.', placeholder: 'browse' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const res = [];
      const tall = ctx.fullH / ctx.W > 1.5;
      const bullion = ctx.theme === 'bullion';
      const blocks = [];
      if (c.kicker) blocks.push(textLayer(h, { name: 'kicker', text: c.kicker, role: 'overline', x: h.m, y: 0, w: h.cw, color: 'accent', lang: ctx.lang, delay: 0.5, a: 'fade' }));
      blocks.push(textLayer(h, { name: 'title', text: c.title || '', role: tall ? 'display' : 'h1', x: h.m, y: 0, w: h.cw, lang: ctx.lang, delay: 0.6, a: 'rise', align: 'center' }));
      if (c.subtitle) blocks.push(textLayer(h, { name: 'subtitle', text: c.subtitle, role: 'body-lg', x: h.m, y: 0, w: h.cw, color: 'fg2', lang: ctx.lang, delay: 0.85, align: 'center' }));
      blocks.forEach((b) => { b.align = 'center'; });
      const gap = Math.round(20 * h.s);
      const textH = blocks.reduce((a, l) => a + l.h, 0) + gap * (blocks.length - 1);
      // Bullion: headline in the light lower band; Onyx: headline on top.
      const textTop = bullion ? ctx.H - h.m - textH : h.m + Math.round(40 * h.s);
      let y = textTop;
      for (const l of blocks) { l.y = y; y += l.h + gap; }
      const areaTop = bullion ? h.m * 0.5 : y + Math.round(60 * h.s);
      const areaBottom = bullion ? textTop - Math.round(70 * h.s) : ctx.H;
      const pw = Math.min(h.W * (tall ? 0.56 : 0.42), (areaBottom - areaTop) * 0.47);
      const pair = !!c.footage2;
      const box = phoneBox(h, { w: pw, y: areaTop + Math.max(0, (areaBottom - areaTop - pw / 0.4844) / 2), x: pair ? (h.W - pw) / 2 - pw * 0.28 : undefined });
      const tilt0 = { rx: 10, ry: h.rtl ? 30 : -30, rz: h.rtl ? 7 : -7 };
      const tilt1 = { rx: 8, ry: h.rtl ? 18 : -18, rz: h.rtl ? 4 : -4 };
      const mk = (src, b, delay, flip) => {
        const { layer } = footagePhone(h, ctx, { ...c, footage: src, to: num(c.from, 0) + ctx.dur }, b, { delay, enter: 'none', tilt: tilt0 });
        layer.keys = [
          { t: 0, rx: tilt0.rx, ry: flip ? -tilt0.ry : tilt0.ry, y: b.y + 120 * h.s, opacity: 0 },
          { t: delay + 0.9, y: b.y, opacity: 1, ease: 'expoOut' },
          { t: ctx.dur, rx: tilt1.rx, ry: flip ? -tilt1.ry : tilt1.ry, ease: 'inOut' },
        ];
        layer.anim = anim('none', 0);
        layer.loop = { type: 'float', speed: 0.5, amount: 0.6 };
        return layer;
      };
      if (pair) res.push(mk(c.footage2, { ...box, x: box.x + pw * 0.62, y: box.y + pw * 0.12, w: Math.round(pw * 0.92), h: Math.round(pw * 0.92 / 0.4844) }, 0.3, false));
      res.push(mk(c.footage, box, 0.1, false));
      res.push(L('sparkles', { name: 'sparkles', x: 0, y: areaTop, w: h.W, h: areaBottom - areaTop, count: 14, seed: 11, anim: anim('fade', 1, 1) }));
      res.push(...blocks.map((l) => out(l, ctx)));
      return res;
    },
  },

  split: {
    name: 'Split: without vs with',
    group: 'production',
    description: 'Comparison of two people or two ways: side A (without Goldcom, the old way) and side B (with Goldcom). Each side has an illustrated person in a setting, a label and one short line. Top/bottom on 9:16, left/right on 4:5 and 1:1.',
    fields: [
      { key: 'title', label: 'Title (optional)', type: 'textarea' },
      { key: 'a_label', label: 'A label', type: 'text' },
      { key: 'a_text', label: 'A line', type: 'textarea' },
      { key: 'a_person', label: 'A person', type: 'select', options: PERSON_IDS },
      { key: 'a_pose', label: 'A pose', type: 'select', options: POSES },
      { key: 'a_mood', label: 'A mood', type: 'select', options: MOODS },
      { key: 'a_prop', label: 'A prop', type: 'select', options: PROPS },
      { key: 'a_scene', label: 'A setting', type: 'select', options: SETS },
      { key: 'b_label', label: 'B label', type: 'text' },
      { key: 'b_text', label: 'B line', type: 'textarea' },
      { key: 'b_person', label: 'B person', type: 'select', options: PERSON_IDS },
      { key: 'b_pose', label: 'B pose', type: 'select', options: POSES },
      { key: 'b_mood', label: 'B mood', type: 'select', options: MOODS },
      { key: 'b_prop', label: 'B prop', type: 'select', options: PROPS },
      { key: 'b_scene', label: 'B setting', type: 'select', options: SETS },
    ],
    example: { a_label: 'Without Goldcom', a_text: 'Three shops, three prices, one long afternoon.', a_person: 'man', a_pose: 'stressed', a_mood: 'worried', a_prop: 'receipts', a_scene: 'souq', b_label: 'With Goldcom', b_text: 'One gram, bought from the sofa in a minute.', b_person: 'woman', b_pose: 'phone-happy', b_mood: 'happy', b_prop: 'phone', b_scene: 'room' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const res = [];
      const vertical = ctx.fullH / ctx.W > 1.1; // stacked halves on 9:16 and 4:5
      const stacked = ctx.fullH / ctx.W > 1.5;
      let top = 0;
      if (c.title) {
        const t = textLayer(h, { name: 'title', text: c.title, role: 'h2', x: h.m, y: h.m * 0.6, w: h.cw, lang: ctx.lang, delay: 0, a: 'rise', align: 'center' });
        t.align = 'center';
        res.push(out(t, ctx));
        top = t.y + t.h + Math.round(36 * h.s);
      }
      const W = h.W;
      // On 9:16 the lower panel may run into the bottom interface zone a little: it is only background there.
      const H = stacked ? ctx.H + Math.min(Math.round(150 * h.s), Math.max(0, ctx.fullH - ctx.H - ctx.top)) : ctx.H;
      const halves = stacked
        ? [{ x: 0, y: top, w: W, h: (H - top) / 2 }, { x: 0, y: top + (H - top) / 2, w: W, h: (H - top) / 2 }]
        : vertical && !stacked
          ? [{ x: 0, y: top, w: W / 2, h: H - top }, { x: W / 2, y: top, w: W / 2, h: H - top }]
          : [{ x: 0, y: top, w: W / 2, h: H - top }, { x: W / 2, y: top, w: W / 2, h: H - top }];
      if (h.rtl && !stacked) halves.reverse();
      // Side A (the old way) sits in a dim set, side B (with Goldcom) in a warm light one: the contrast tells the story.
      const sides = [
        ['a_', { person: 'man', pose: 'stressed', mood: 'worried', prop: 'receipts', seed: 2 }, 'souq', 0.1, 'onyx'],
        ['b_', { person: 'woman', pose: 'phone-happy', mood: 'happy', prop: 'phone', seed: 5 }, 'room', ctx.seq ? 1.0 : 0.2, 'cream'],
      ];
      sides.forEach(([p, def, set, delay, setTheme], i) => {
        const r = halves[i];
        const pad = Math.round(22 * h.s);
        const inner = { x: r.x + pad / (stacked ? 1 : 2), y: r.y + pad / 2, w: r.w - pad * (stacked ? 2 : 1), h: r.h - pad };
        const light = setTheme === 'cream';
        res.push(L('set', { name: `${p}set`, set: c[`${p}scene`] || set, setTheme, mood: light ? 'warm' : 'dim', scrimH: 0.42, scrimSide: stacked ? ((i === 0) !== h.rtl ? 'right' : 'left') : null, x: inner.x, y: inner.y, w: inner.w, h: inner.h, radius: Math.round(28 * h.s), facet: i === 1, anim: anim(i === 0 ? 'fade' : 'scale', delay, 0.7) }));
        const spec = personSpec(c, p, def);
        const chH = stacked ? inner.h * 0.94 : inner.h * 0.7;
        const chW = chH * 0.5;
        let chX = stacked ? (i === 0 ? inner.x + inner.w * 0.06 : inner.x + inner.w * 0.94 - chW) : inner.x + (inner.w - chW) / 2;
        if (h.rtl && stacked) chX = W - chX - chW;
        spec.facing = stacked ? ((chX + chW / 2 < W / 2) ? 'right' : 'left') : (i === 0) !== h.rtl ? 'right' : 'left';
        res.push(characterLayer(h, spec, { x: chX, y: inner.y + inner.h - chH - inner.h * 0.03, w: chW, h: chH }, { delay: delay + 0.15 }));
        // Label chip + one line on the open side of the panel, coloured for the set behind it.
        const tw = stacked ? inner.w * 0.5 : inner.w - pad * 2;
        let tx = stacked ? (chX + chW / 2 < W / 2 ? inner.x + inner.w * 0.46 : inner.x + pad * 1.5) : inner.x + pad;
        if (h.rtl && !stacked) tx = inner.x + inner.w - pad - tw;
        const label = c[`${p}label`] || (i === 0 ? (ctx.lang === 'ar' ? 'بدون جولدكم' : 'Without Goldcom') : (ctx.lang === 'ar' ? 'مع جولدكم' : 'With Goldcom'));
        const chipW = Math.round(Math.min(tw, Math.max(170 * h.s, (label.length * (ctx.lang === 'ar' ? 13 : 15) + (i === 1 ? 90 : 60)) * h.s)));
        const chip = L('badge', { name: `${p}label`, text: label, variant: light ? 'gold' : 'muted', gem: i === 1, x: h.rtl ? tx + tw - chipW : tx, y: inner.y + pad * 1.4, w: chipW, h: Math.round(56 * h.s), dir: ctx.lang === 'ar' ? 'rtl' : 'ltr', anim: anim('fade-up', delay + 0.25) });
        res.push(chip);
        if (c[`${p}text`]) {
          const line = textLayer(h, { name: `${p}text`, text: c[`${p}text`], role: stacked ? 'h3' : 'body-lg', x: 0, y: chip.y + chip.h + Math.round(20 * h.s), w: tw, lang: ctx.lang, delay: delay + 0.4, color: light ? 'charcoal' : 'white' });
          line.x = tx;
          line.weight = 600;
          res.push(line);
        }
      });
      // Divider with the gem in the middle.
      if (stacked) {
        const yMid = top + (H - top) / 2;
        res.push(L('gem', { name: 'divider-gem', x: W / 2 - 26 * h.s, y: yMid - 26 * h.s, w: 52 * h.s, h: 52 * h.s, anim: anim('pop', ctx.seq ? 0.85 : 0.2, 0.6) }));
      }
      return res.map((l) => (l.name === 'title' ? l : l));
    },
  },

  cast: {
    name: 'Cast (meet the people)',
    group: 'production',
    description: 'Introduces one or two illustrated people with name tags, e.g. "Salim buys gold the old way · Aisha uses Goldcom". Use at the start of a story carousel or Reel.',
    fields: [
      { key: 'kicker', label: 'Kicker', type: 'text' },
      { key: 'title', label: 'Title (*accent*)', type: 'textarea' },
      { key: 'a_name', label: 'Person A name', type: 'text' },
      { key: 'a_note', label: 'Person A note', type: 'text' },
      { key: 'a_person', label: 'Person A', type: 'select', options: PERSON_IDS },
      { key: 'a_pose', label: 'A pose', type: 'select', options: POSES },
      { key: 'a_mood', label: 'A mood', type: 'select', options: MOODS },
      { key: 'b_name', label: 'Person B name (optional)', type: 'text' },
      { key: 'b_note', label: 'Person B note', type: 'text' },
      { key: 'b_person', label: 'Person B', type: 'select', options: PERSON_IDS },
      { key: 'b_pose', label: 'B pose', type: 'select', options: POSES },
      { key: 'b_mood', label: 'B mood', type: 'select', options: MOODS },
      { key: 'scene', label: 'Setting', type: 'select', options: SETS },
    ],
    example: { kicker: 'Two neighbours', title: 'Same goal, *different way*', a_name: 'Salim', a_note: 'Buys gold the old way', a_person: 'man', b_name: 'Aisha', b_note: 'Uses Goldcom', b_person: 'woman', scene: 'studio' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const res = [];
      const blocks = [];
      if (c.kicker) blocks.push(textLayer(h, { name: 'kicker', text: c.kicker, role: 'overline', x: h.m, y: 0, w: h.cw, color: 'accent', lang: ctx.lang, delay: 0, a: 'fade' }));
      if (c.title) blocks.push(textLayer(h, { name: 'title', text: c.title, role: 'h1', x: h.m, y: 0, w: h.cw, lang: ctx.lang, delay: 0.1, a: 'rise' }));
      let y = h.m;
      for (const l of blocks) { l.y = y; y += l.h + Math.round(18 * h.s); l.align = 'center'; }
      res.push(...blocks.map((l) => out(l, ctx)));
      const stageTop = y + Math.round(40 * h.s);
      const tall = ctx.fullH / ctx.W > 1.5;
      const below = tall ? Math.max(0, ctx.fullH - ctx.H - ctx.top) : 0;
      // On 9:16 the stage runs off the bottom edge; names stay inside the safe area.
      res.push(L('set', { name: 'set', set: c.scene || 'studio', setTheme: ['cream', 'sand'].includes(ctx.theme) ? 'cream' : 'onyx', mood: 'warm', scrim: false, x: tall ? 0 : h.m * 0.5, y: stageTop, w: tall ? h.W : h.W - h.m, h: ctx.H - stageTop - (tall ? -below : h.m * 0.5), radius: tall ? 0 : Math.round(32 * h.s), anim: anim('fade', 0, 0.8) }));
      const two = !!c.b_name;
      const chH = (ctx.H - stageTop) * 0.74;
      const chW = chH * 0.5;
      const people = two ? [['a_', 0.27, 'right', { person: 'man', pose: 'stand', mood: 'neutral' }], ['b_', 0.73, 'left', { person: 'woman', pose: 'wave', mood: 'happy' }]] : [['a_', 0.5, 'front', { person: 'man', pose: 'wave', mood: 'happy' }]];
      people.forEach(([p, fx, facing, def], i) => {
        const cx = (h.rtl ? 1 - fx : fx) * h.W;
        const spec = personSpec(c, p, { ...def, facing: h.rtl && facing !== 'front' ? (facing === 'left' ? 'right' : 'left') : facing, seed: i + 3 });
        const setH = tall ? ctx.H - stageTop + below : ctx.H - stageTop - h.m * 0.5;
        const by = Math.min(ctx.H - Math.round(150 * h.s), stageTop + setH * 0.8) - chH;
        res.push(characterLayer(h, spec, { x: cx - chW / 2, y: by, w: chW, h: chH }, { delay: 0.3 + i * 0.35 }));
        const tagW = Math.round(Math.min(h.W * 0.42, 420 * h.s));
        const name = textLayer(h, { name: `${p}name`, text: c[`${p}name`] || '', role: 'h3', x: 0, y: by + chH + Math.round(18 * h.s), w: tagW, lang: ctx.lang, delay: 0.55 + i * 0.35, a: 'fade-up' });
        name.x = cx - tagW / 2; name.align = 'center';
        res.push(name);
        if (c[`${p}note`]) {
          const note = textLayer(h, { name: `${p}note`, text: c[`${p}note`], role: 'small', x: 0, y: name.y + name.h, w: tagW, color: 'fg2', lang: ctx.lang, delay: 0.65 + i * 0.35, a: 'fade' });
          note.x = cx - tagW / 2; note.align = 'center';
          res.push(note);
        }
      });
      return res;
    },
  },

  moment: {
    name: 'Story moment (character)',
    group: 'production',
    description: 'One illustrated person in a setting with a headline and a line of narration, optionally a speech bubble. Use for story beats ("Saturday, 4 pm: Salim is still queuing").',
    fields: [
      { key: 'kicker', label: 'Kicker (time/place)', type: 'text' },
      { key: 'title', label: 'Headline (*accent*)', type: 'textarea' },
      { key: 'body', label: 'Narration', type: 'textarea' },
      { key: 'bubble', label: 'Speech bubble (optional)', type: 'text' },
      { key: 'b_person', label: 'Person', type: 'select', options: PERSON_IDS },
      { key: 'b_pose', label: 'Pose', type: 'select', options: POSES },
      { key: 'b_mood', label: 'Mood', type: 'select', options: MOODS },
      { key: 'b_prop', label: 'Prop', type: 'select', options: PROPS },
      { key: 'scene', label: 'Setting', type: 'select', options: SETS },
      { key: 'props', label: 'Extra props (comma list)', type: 'text' },
    ],
    example: { kicker: 'Eid morning', title: 'A gift that *lasts*', body: 'Aisha sends her niece 1 gram of 24K gold.', b_person: 'woman', b_pose: 'give-gift', b_mood: 'happy', b_prop: 'giftbox', scene: 'room' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const res = [];
      const tall = ctx.fullH / ctx.W > 1.5;
      const setH = tall ? ctx.H * 0.6 : ctx.H * 0.56;
      const setY = ctx.H - setH;
      // The set runs to the bottom edge of the frame; people stand on its floor (about 80% down the set).
      const below = Math.max(0, ctx.fullH - ctx.H - ctx.top);
      const setTotal = setH + below;
      const floorY = setY + setTotal * 0.81;
      res.push(L('set', { name: 'set', set: c.scene || 'room', setTheme: ['cream', 'sand'].includes(ctx.theme) ? 'cream' : 'onyx', mood: /worried|stressed/.test(String(c.b_mood) + String(c.b_pose)) ? 'dim' : 'warm', scrim: false, x: 0, y: setY, w: h.W, h: setTotal, radius: 0, anim: anim('fade', 0, 0.9) }));
      const spec = personSpec(c, 'b_', { person: 'woman', pose: 'stand', mood: 'calm', facing: h.rtl ? 'right' : 'left', seed: 7 });
      const chH = Math.min(setH * 1.02, floorY - setY + setH * 0.12);
      const chW = chH * 0.5;
      const cx = h.rtl ? h.W * 0.32 : h.W * 0.68;
      const ch = characterLayer(h, spec, { x: cx - chW / 2, y: floorY - chH, w: chW, h: chH }, { delay: 0.25 });
      ch.keys = [{ t: 0, scale: 1.02 }, { t: ctx.dur, scale: 1, ease: 'out' }];
      for (const [i, pr] of list(String(c.props || '').split(',')).entries()) {
        const ps = Math.round(setH * 0.22);
        res.push(L('prop', { name: `prop${i}`, prop: pr, x: h.rtl ? h.W * 0.62 + i * ps * 0.7 : h.W * 0.1 + i * ps * 0.7, y: floorY - ps, w: ps, h: ps, anim: anim('pop', 0.6 + i * 0.15, 0.6) }));
      }
      res.push(ch);
      if (c.bubble) {
        const bw = Math.round(h.W * 0.46);
        const t = textLayer(h, { name: 'bubble', text: c.bubble, role: 'body', x: 0, y: setY + setH * 0.06, w: bw - 48 * h.s, lang: ctx.lang, delay: 0.9, a: 'type', color: 'charcoal' });
        const bx = h.rtl ? cx + chW * 0.15 : cx - chW * 0.15 - bw;
        res.push(L('bubble', { name: 'bubble-bg', x: bx, y: t.y - 24 * h.s, w: bw, h: t.h + 48 * h.s, tail: h.rtl ? 'start' : 'end', anim: anim('pop', 0.8, 0.5) }));
        t.x = bx + 24 * h.s;
        res.push(t);
      }
      const blocks = [];
      if (c.kicker) blocks.push(textLayer(h, { name: 'kicker', text: c.kicker, role: 'overline', x: h.m, y: 0, w: h.cw, color: 'accent', lang: ctx.lang, delay: 0, a: 'fade' }));
      blocks.push(textLayer(h, { name: 'title', text: c.title || '', role: tall ? 'h1' : 'h2', x: h.m, y: 0, w: h.cw, lang: ctx.lang, delay: 0.1, a: 'rise' }));
      if (c.body) blocks.push(textLayer(h, { name: 'body', text: c.body, role: 'body-lg', x: h.m, y: 0, w: h.cw, color: 'fg2', lang: ctx.lang, delay: 0.35 }));
      let y = h.m;
      for (const l of blocks) { l.y = y; y += l.h + Math.round(20 * h.s); }
      res.push(...blocks.map((l) => out(l, ctx)));
      return res;
    },
  },

  checklist: {
    name: 'Checklist',
    group: 'production',
    description: 'Title and 2–5 short items that tick in one by one with gem checks. For "what you need", "why it is simpler", recaps.',
    fields: [
      { key: 'kicker', label: 'Kicker', type: 'text' },
      { key: 'title', label: 'Title (*accent*)', type: 'textarea' },
      { key: 'items', label: 'Items (one per line)', type: 'list' },
    ],
    example: { kicker: 'Recap', title: 'Your first gram in *four taps*', items: ['Open Browse', 'Pick a 1 g bar', 'Lock the price', 'Pay and own it'] },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const res = [];
      const items = list(c.items).slice(0, 6);
      const blocks = [];
      if (c.kicker) blocks.push(textLayer(h, { name: 'kicker', text: c.kicker, role: 'overline', x: h.m, y: 0, w: h.cw, color: 'accent', lang: ctx.lang, delay: 0, a: 'fade' }));
      blocks.push(textLayer(h, { name: 'title', text: c.title || '', role: 'h1', x: h.m, y: 0, w: h.cw, lang: ctx.lang, delay: 0.1, a: 'rise' }));
      const tall = ctx.fullH / ctx.W > 1.5;
      const role = tall ? 'h2' : 'h3';
      const rowGap = Math.round((tall ? 30 : 22) * h.s);
      const rows = items.map((it, i) => {
        const est = estimateText(it, role, h.cw - 130 * h.s, h.s, ctx.lang);
        return { it, i, h: Math.max(Math.round((tall ? 128 : 96) * h.s), est.h + Math.round(44 * h.s)) };
      });
      const listH = rows.reduce((a, r) => a + r.h + rowGap, 0);
      const headH = blocks.reduce((a, l) => a + l.h + 20 * h.s, 0);
      let y = Math.max(h.m, Math.round((ctx.H - headH - listH - 60 * h.s) * 0.45));
      for (const l of blocks) { l.y = y; y += l.h + Math.round(20 * h.s); }
      y += Math.round(40 * h.s);
      res.push(...blocks.map((l) => out(l, ctx)));
      const step = Math.min(0.45, (ctx.dur - 1.6) / Math.max(1, rows.length));
      rows.forEach((r) => {
        const d = 0.6 + r.i * step;
        res.push(L('shape', { name: `row${r.i}`, shape: 'rect', fill: 'surface', radius: Math.round(20 * h.s), facet: false, x: h.m, y, w: h.cw, h: r.h, anim: anim('slide-start', d, 0.6) }));
        const g = Math.round((tall ? 52 : 40) * h.s);
        res.push(L('check', { name: `check${r.i}`, x: h.X(h.m + 32 * h.s, g), y: y + (r.h - g) / 2, w: g, h: g, anim: anim('draw', d + 0.2, 0.5) }));
        const t = textLayer(h, { name: `item${r.i}`, text: r.it, role, x: h.m + Math.round(112 * h.s), y: y + (r.h - estimateText(r.it, role, h.cw - 150 * h.s, h.s, ctx.lang).h) / 2, w: h.cw - Math.round(150 * h.s), lang: ctx.lang, delay: d + 0.1, a: 'fade' });
        if (h.rtl) t.x = h.W - h.m - Math.round(112 * h.s) - t.w;
        res.push(t);
        y += r.h + rowGap;
      });
      return [...res, ...pagerLayers(h, ctx)];
    },
  },

  'ui-zoom': {
    name: 'UI close-up (spotlight)',
    group: 'production',
    description: 'Explains one part of a real app screen: the phone screen with a spotlight on a region (e.g. the locked price) and a callout. The camera pushes in on the region.',
    fields: [
      { key: 'kicker', label: 'Kicker', type: 'text' },
      { key: 'title', label: 'Title (*accent*)', type: 'textarea' },
      { key: 'callout', label: 'Callout text', type: 'text' },
      { key: 'footage', label: 'Footage / screenshot', type: 'asset' },
      { key: 'from', label: 'Footage time (s)', type: 'text' },
      { key: 'region', label: 'Region "x,y,w,h" (0–1 of the screen)', type: 'text' },
      { key: 'frame', label: 'Phone', type: 'select', options: ['iphone', 'android'] },
      { key: 'placeholder', label: 'Mock screen when no footage', type: 'select', options: ['home', 'browse'] },
    ],
    example: { title: 'Know your price *before* you pay', callout: 'Price locked at checkout', region: '0.06,0.18,0.88,0.2', placeholder: 'home' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const res = [];
      const tall = ctx.fullH / ctx.W > 1.5;
      const blocks = [];
      if (c.kicker) blocks.push(textLayer(h, { name: 'kicker', text: c.kicker, role: 'overline', x: h.m, y: 0, w: h.cw, color: 'accent', lang: ctx.lang, delay: 0, a: 'fade' }));
      blocks.push(textLayer(h, { name: 'title', text: c.title || '', role: tall ? 'h1' : 'h2', x: h.m, y: 0, w: h.cw, lang: ctx.lang, delay: 0.1, a: 'rise' }));
      let y = h.m;
      for (const l of blocks) { l.y = y; y += l.h + Math.round(18 * h.s); }
      const box = phoneBox(h, { w: h.W * (tall ? 0.64 : 0.52), y: y + Math.round(60 * h.s) });
      const from = num(c.from, 0.5);
      const { layer } = footagePhone(h, ctx, { ...c, from, to: from + 0.04, poster: from, hint: 'none' }, box, { delay: 0.15 });
      res.push(layer);
      const sc = screenOf(box, layer.frame);
      const [rx, ry, rw, rh] = (String(c.region || '0.06,0.2,0.88,0.18').split(',').map(Number).concat([0, 0, 0, 0])).slice(0, 4);
      const reg = { x: sc.x + rx * sc.w, y: sc.y + ry * sc.h, w: Math.max(20, rw * sc.w), h: Math.max(20, rh * sc.h) };
      // The dim stays inside the phone screen, so the slide around the phone keeps its theme.
      res.push(L('focus', { name: 'focus', x: reg.x, y: reg.y, w: reg.w, h: reg.h, radius: Math.round(18 * h.s), dim: 0.62, clip: { x: sc.x, y: sc.y, w: sc.w, h: sc.h, r: sc.r }, anim: anim('fade', 1.0, 0.6) }));
      if (c.callout) {
        const cw = Math.round(Math.min(h.cw, 640 * h.s));
        const t = textLayer(h, { name: 'callout', text: c.callout, role: 'h3', x: 0, y: reg.y + reg.h + Math.round(30 * h.s), w: cw, lang: ctx.lang, delay: 1.35, a: 'fade-up' });
        t.x = (h.W - cw) / 2; t.align = 'center'; t.plate = true;
        res.push(t);
      }
      res.push(plateLayer(h, y));
      res.push(...blocks.map((l) => ({ ...out(l, ctx), fixed: true })));
      const z = Math.min(1.45, Math.max(1.1, (h.W * 0.82) / reg.w));
      const f = framePoint(reg.x + reg.w / 2, reg.y + reg.h / 2 + ctx.top, { W: h.W, H: ctx.fullH, z, phoneCx: sc.x + sc.w / 2, phoneW: sc.w * 1.1, frameY: 0.56 });
      const camera = ctx.seq ? [{ t: 0, x: h.W / 2, y: ctx.fullH / 2, zoom: 1 }, { t: 0.9, x: h.W / 2, y: ctx.fullH / 2, zoom: 1 }, { t: 2.1, x: f.x, y: f.y, zoom: z, ease: 'smooth' }] : null;
      return { layers: res, camera, cameraAbsolute: true };
    },
  },

  'title-card': {
    name: 'Title card',
    group: 'production',
    description: 'A short chapter card between parts of a Reel or carousel: big number or word, one line under it.',
    fields: [
      { key: 'big', label: 'Big text (number or 1–2 words)', type: 'text' },
      { key: 'title', label: 'Line (*accent*)', type: 'textarea' },
    ],
    example: { big: '02', title: 'Lock your *price*' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const big = textLayer(h, { name: 'big', text: c.big || '', role: 'stat', x: h.m, y: 0, w: h.cw, lang: ctx.lang, delay: 0, a: 'blur', color: 'accent' });
      big.align = 'center';
      const t = textLayer(h, { name: 'title', text: c.title || '', role: 'h1', x: h.m, y: 0, w: h.cw, lang: ctx.lang, delay: 0.25, a: 'rise' });
      t.align = 'center';
      const total = big.h + t.h + 30 * h.s;
      big.y = Math.round((ctx.H - total) / 2);
      t.y = big.y + big.h + Math.round(30 * h.s);
      big.keys = [{ t: 0, scale: 1.12 }, { t: 0.9, scale: 1, ease: 'expoOut' }];
      return [out(big, ctx), out(t, ctx), ...pagerLayers(h, ctx)];
    },
  },

  outro: {
    name: 'Outro (logo + CTA)',
    group: 'production',
    description: 'Closing card: the logo reveal, a tagline, where to get the app, and the disclaimer when prices/saving are mentioned. Use last.',
    fields: [
      { key: 'title', label: 'Tagline (*accent*)', type: 'textarea' },
      { key: 'subtitle', label: 'Where to get it', type: 'text' },
      { key: 'button', label: 'Button', type: 'text' },
      { key: 'disclaimer', label: 'Show disclaimer', type: 'select', options: ['no', 'yes'] },
    ],
    example: { title: 'Real gold, *from your phone*', subtitle: 'On the App Store and Google Play', button: 'Download Goldcom' },
    layout(c, ctx) {
      const h = ctxHelpers(ctx);
      const res = [];
      const lw = Math.round(Math.min(h.W * 0.62, 640 * h.s));
      const logo = logoLayer(h, { variant: 'horizontal', width: lw, x: 0, y: 0, align: 'center' });
      logo.anim = anim('assemble', 0.1, 1.4);
      const blocks = [logo];
      if (c.title) { const t = textLayer(h, { name: 'title', text: c.title, role: 'h2', x: h.m, y: 0, w: h.cw, lang: ctx.lang, delay: 1.2, a: 'rise' }); t.align = 'center'; blocks.push(t); }
      if (c.subtitle) { const t = textLayer(h, { name: 'subtitle', text: c.subtitle, role: 'body-lg', x: h.m, y: 0, w: h.cw, color: 'fg2', lang: ctx.lang, delay: 1.45 }); t.align = 'center'; blocks.push(t); }
      if (c.button) {
        const bw = Math.round(Math.min(h.cw, 520 * h.s)), bh = Math.round(108 * h.s);
        blocks.push(L('button', { name: 'button', text: c.button, x: (h.W - bw) / 2, y: 0, w: bw, h: bh, anim: anim('pop', 1.7, 0.6), loop: { type: 'pulse', speed: 0.8, amount: 0.6 }, dir: ctx.lang === 'ar' ? 'rtl' : 'ltr' }));
      }
      const gaps = blocks.map((b, i) => (i === 0 ? 0 : b.type === 'button' ? 56 : 30) * h.s);
      const total = blocks.reduce((a, b, i) => a + b.h + gaps[i], 0);
      const disc = c.disclaimer === 'yes';
      let y = Math.round((ctx.H - total - (disc ? 180 * h.s : 0)) / 2);
      blocks.forEach((b, i) => { y += gaps[i]; b.y = y; y += b.h; });
      res.push(L('glow', { name: 'glow', x: -h.W * 0.2, y: logo.y - h.W * 0.45, w: h.W * 1.4, h: h.W * 1.1, color: 'gold', intensity: 0.2, anim: anim('fade', 0.4, 1.2) }));
      res.push(...blocks);
      res.push(L('sparkles', { name: 'sparkles', x: 0, y: logo.y - 200 * h.s, w: h.W, h: 600 * h.s, count: 16, seed: 21, anim: anim('fade', 0.9, 1) }));
      if (disc) res.push(disclaimerLayer(h, ctx, ctx.H - h.m * 0.6));
      return res;
    },
  },
};
