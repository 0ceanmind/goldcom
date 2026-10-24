// Shared DSP toolkit for the Goldcom audio module: seeded noise, filters, oscillators,
// reverb, dynamics, BS.1770 loudness metering and WAV I/O. Stereo Float32Array @ 48 kHz.
import fs from 'node:fs';
import path from 'node:path';

export const SR = 48000;
export const TAU = Math.PI * 2;
export const dbToGain = (db) => 10 ** (db / 20);
export const gainToDb = (g) => 20 * Math.log10(Math.max(Math.abs(g), 1e-12));
export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const toSamples = (s) => Math.max(0, Math.round(s * SR));

// ---------- randomness ----------

/** FNV-1a string hash → 32-bit seed. */
export function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Seeded PRNG (mulberry32) with small helpers. */
export function makeRng(seed = 1) {
  let s = (seed >>> 0) || 1;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    bi: () => next() * 2 - 1,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    gauss: () => Math.sqrt(-2 * Math.log(next() + 1e-12)) * Math.cos(TAU * next()),
  };
}

export const whiteNoise = (rng) => () => rng.next() * 2 - 1;

/** Pink noise (Paul Kellet's refined filter), roughly unit-variance. */
export function pinkNoise(rng) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  return () => {
    const w = rng.next() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    const p = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
    return p * 0.2;
  };
}

// ---------- buffers ----------

export const stereo = (n) => ({ L: new Float32Array(n), R: new Float32Array(n) });
export const lengthOf = (b) => b.L.length;
export const cloneBuf = (b) => ({ L: Float32Array.from(b.L), R: Float32Array.from(b.R) });

/** Equal-power pan gains, normalised so centre = 1 per side. */
export function panGains(pan = 0) {
  const a = (clamp(pan, -1, 1) + 1) * Math.PI / 4;
  return [Math.cos(a) * Math.SQRT2, Math.sin(a) * Math.SQRT2];
}

/** Mix src into dst at sample offset with gain and pan. Out-of-range parts are skipped. */
export function addInto(dst, src, offset = 0, gain = 1, pan = 0) {
  const [gl, gr] = panGains(pan);
  const n = lengthOf(dst), m = lengthOf(src);
  const s0 = Math.max(0, -offset), s1 = Math.min(m, n - offset);
  for (let i = s0; i < s1; i++) {
    dst.L[i + offset] += src.L[i] * gain * gl;
    dst.R[i + offset] += src.R[i] * gain * gr;
  }
}

export function scaleBuf(buf, g) {
  for (let i = 0; i < buf.L.length; i++) { buf.L[i] *= g; buf.R[i] *= g; }
  return buf;
}

export function peakOf(buf) {
  let p = 0;
  for (let i = 0; i < buf.L.length; i++) {
    const a = Math.abs(buf.L[i]), b = Math.abs(buf.R[i]);
    if (a > p) p = a;
    if (b > p) p = b;
  }
  return p;
}

export function normalizePeak(buf, db = -3) {
  const p = peakOf(buf);
  if (p > 0) scaleBuf(buf, dbToGain(db) / p);
  return buf;
}

/** Raised-cosine fade in / out (seconds). */
export function fadeEdges(buf, inSec = 0.002, outSec = 0.01) {
  const n = buf.L.length;
  const fi = Math.min(n, toSamples(inSec)), fo = Math.min(n, toSamples(outSec));
  for (let i = 0; i < fi; i++) {
    const g = 0.5 - 0.5 * Math.cos(Math.PI * i / fi);
    buf.L[i] *= g; buf.R[i] *= g;
  }
  for (let i = 0; i < fo; i++) {
    const g = 0.5 - 0.5 * Math.cos(Math.PI * i / fo);
    buf.L[n - 1 - i] *= g; buf.R[n - 1 - i] *= g;
  }
  if (n) { buf.L[n - 1] = 0; buf.R[n - 1] = 0; }
  return buf;
}

/** Fade the region [t0, t1] (seconds) to silence with a cosine curve; zero after t1. */
export function fadeOutRegion(buf, t0, t1, power = 1) {
  const n = buf.L.length, i0 = clamp(toSamples(t0), 0, n), i1 = clamp(toSamples(t1), i0, n);
  for (let i = i0; i < n; i++) {
    const u = i1 > i0 ? Math.min(1, (i - i0) / (i1 - i0)) : 1;
    const g = (0.5 + 0.5 * Math.cos(Math.PI * u)) ** power;
    buf.L[i] *= g; buf.R[i] *= g;
  }
}

/** Fast tanh (Padé 3/2, exact clamp beyond ±3): smooth, odd, ~1e-2 max error. */
export const ftanh = (x) => (x <= -3 ? -1 : x >= 3 ? 1 : x * (27 + x * x) / (27 + 9 * x * x));

/** Soft saturation with unity small-signal gain. */
export const softClip = (x, drive = 1) => ftanh(x * drive) / drive;

export function saturate(buf, drive = 1.5, mix = 1) {
  for (const ch of [buf.L, buf.R]) {
    for (let i = 0; i < ch.length; i++) ch[i] = ch[i] * (1 - mix) + mix * ftanh(ch[i] * drive) / drive;
  }
  return buf;
}

// ---------- filters ----------

/** RBJ-cookbook biquad (direct form I, safe under coefficient changes). */
export class Biquad {
  constructor(type = 'lowpass', freq = 1000, q = Math.SQRT1_2, gainDb = 0) {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.set(type, freq, q, gainDb);
  }
  set(type, freq, q = Math.SQRT1_2, gainDb = 0) {
    const w0 = TAU * clamp(freq, 5, SR * 0.49) / SR, cw = Math.cos(w0), sw = Math.sin(w0);
    const alpha = sw / (2 * q), A = 10 ** (gainDb / 40);
    let b0, b1, b2, a0, a1, a2;
    switch (type) {
      case 'lowpass': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'highpass': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'bandpass': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'notch': b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'allpass': b0 = 1 - alpha; b1 = -2 * cw; b2 = 1 + alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'peak': b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; break;
      case 'lowshelf': {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s);
        a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s;
        break;
      }
      case 'highshelf': {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s);
        a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s;
        break;
      }
      default: throw new Error(`unknown biquad type ${type}`);
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  tick(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
  run(arr) { for (let i = 0; i < arr.length; i++) arr[i] = this.tick(arr[i]); return arr; }
}

/** Apply a static biquad to both channels in place. */
export function filterBuf(buf, type, freq, q = Math.SQRT1_2, gainDb = 0) {
  new Biquad(type, freq, q, gainDb).run(buf.L);
  new Biquad(type, freq, q, gainDb).run(buf.R);
  return buf;
}

/** Topology-preserving state-variable filter (Simper); stable under fast modulation. */
export class SVF {
  constructor(freq = 1000, q = Math.SQRT1_2) { this.ic1 = this.ic2 = 0; this.lp = this.bp = this.hp = 0; this.set(freq, q); }
  set(freq, q = Math.SQRT1_2) {
    const g = Math.tan(Math.PI * clamp(freq, 8, SR * 0.45) / SR);
    this.k = 1 / q; this.a1 = 1 / (1 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2;
    return this;
  }
  tick(x) {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2; this.bp = v1 * this.k; this.hp = x - this.k * v1 - v2; // bp normalised to 0 dB peak
    return v2;
  }
}

/** One-pole smoother / filter. */
export class OnePole {
  constructor(freq = 1000) { this.y = 0; this.set(freq); }
  set(freq) { this.a = Math.exp(-TAU * clamp(freq, 0.01, SR * 0.49) / SR); return this; }
  lp(x) { this.y = x + this.a * (this.y - x); return this.y; }
  hp(x) { return x - this.lp(x); }
}

/** DC blocker + subsonic cleanup (2nd-order high-pass at `freq`). */
export const dcBlock = (buf, freq = 18) => filterBuf(buf, 'highpass', freq, 0.6);

// ---------- oscillators ----------

/** Band-limited sawtooth (PolyBLEP). */
export class Saw {
  constructor(freq = 220, phase = 0) { this.p = phase % 1; this.dt = freq / SR; }
  setFreq(f) { this.dt = f / SR; }
  tick() {
    const dt = this.dt, p = this.p;
    let y = 2 * p - 1;
    if (p < dt) { const t = p / dt; y -= t + t - t * t - 1; }
    else if (p > 1 - dt) { const t = (p - 1) / dt; y -= t * t + t + t + 1; }
    this.p += dt; if (this.p >= 1) this.p -= 1;
    return y;
  }
}

/** Integer/fractional delay line with power-of-two ring buffer. */
export class DelayLine {
  constructor(maxSamples) {
    let n = 16; while (n < maxSamples + 4) n <<= 1;
    this.buf = new Float32Array(n); this.mask = n - 1; this.w = 0;
  }
  write(x) { this.buf[this.w] = x; this.w = (this.w + 1) & this.mask; }
  readInt(d) { return this.buf[(this.w - d) & this.mask]; }
  read(d) {
    const r = this.w - d, i = Math.floor(r), f = r - i;
    const a = this.buf[i & this.mask], b = this.buf[(i + 1) & this.mask];
    return a + (b - a) * f;
  }
}

class Allpass {
  constructor(d, g) { this.dl = new Float32Array(Math.max(1, d)); this.i = 0; this.g = g; }
  tick(x) {
    const old = this.dl[this.i];
    const w = x + this.g * old;
    this.dl[this.i] = w;
    if (++this.i >= this.dl.length) this.i = 0;
    return old - this.g * w;
  }
}

// ---------- reverb ----------

/**
 * 8-line feedback delay network with input diffusion, damping and gentle modulation.
 * decay = RT60 seconds, damping = HF cutoff in the loop, size scales delay lengths.
 * Flat typed arrays + inlined loop: this runs over whole music beds.
 */
export class Reverb {
  constructor({ decay = 1.6, size = 1, damping = 6500, predelay = 0.012, diffusion = 0.62, lowcut = 140, width = 1, mod = 1, seed = 7 } = {}) {
    const rng = makeRng(seed);
    const base = [29.3, 33.7, 39.1, 43.9, 50.3, 57.1, 63.7, 71.9];
    this.d = Float64Array.from(base, (ms) => Math.round(ms * size * SR / 1000));
    this.len = 1; while (this.len < this.d[7] + 64) this.len <<= 1;
    this.mask = this.len - 1;
    this.lines = new Float32Array(this.len * 8);
    this.w = 0;
    this.g = Float64Array.from(this.d, (d) => 10 ** (-3 * d / (decay * SR)));
    this.da = Math.exp(-TAU * clamp(damping, 50, SR * 0.49) / SR);
    this.dz = new Float64Array(8);
    this.modDepth = mod * 7;
    // per-line quadrature LFOs advanced by rotation (cheaper than Math.sin per sample)
    const ph = Array.from(base, () => rng.next() * TAU), w = Array.from(base, () => TAU * rng.range(0.15, 0.6) / SR);
    this.lc = Float64Array.from(ph, Math.cos); this.ls = Float64Array.from(ph, Math.sin);
    this.wc = Float64Array.from(w, Math.cos); this.ws = Float64Array.from(w, Math.sin);
    this.tick = 0;
    const apMs = [[4.7, 0.7], [6.9, 0.66], [10.3, 0.6], [14.2, 0.55]];
    const k = diffusion / 0.62 * 0.9;
    this.apL = apMs.map(([ms, g]) => new Allpass(Math.round(ms * SR / 1000), g * k));
    this.apR = apMs.map(([ms, g]) => new Allpass(Math.round(ms * 1.13 * SR / 1000), g * k));
    this.pdN = Math.max(1, toSamples(predelay));
    this.pdL = new DelayLine(this.pdN + 2); this.pdR = new DelayLine(this.pdN + 2);
    this.hpL = new OnePole(lowcut); this.hpR = new OnePole(lowcut);
    this.width = width;
    this.y = new Float64Array(8);
  }
  /** Process whole arrays (wet only) into outL/outR; state persists across calls. */
  run(inL, inR, outL, outR) {
    const n = inL.length;
    const lines = this.lines, len = this.len, mask = this.mask, da = this.da, dz = this.dz, y = this.y;
    const d = this.d, g = this.g, lc = this.lc, ls = this.ls, wc = this.wc, ws = this.ws;
    const apL = this.apL, apR = this.apR, pdL = this.pdL, pdR = this.pdR, pdN = this.pdN, hpL = this.hpL, hpR = this.hpR;
    const md = this.modDepth * 0.5, width = this.width, s8 = 0.35355339059327373;
    let w = this.w, tick = this.tick;
    for (let k = 0; k < n; k++) {
      pdL.write(inL[k]); pdR.write(inR[k]);
      let xl = hpL.hp(pdL.readInt(pdN)), xr = hpR.hp(pdR.readInt(pdN));
      xl = apL[3].tick(apL[2].tick(apL[1].tick(apL[0].tick(xl))));
      xr = apR[3].tick(apR[2].tick(apR[1].tick(apR[0].tick(xr))));
      if ((++tick & 4095) === 0) { // keep LFO amplitudes at 1
        for (let i = 0; i < 8; i++) { const m = Math.hypot(lc[i], ls[i]); lc[i] /= m; ls[i] /= m; }
      }
      let l = 0, r = 0;
      for (let i = 0; i < 8; i++) {
        const c = lc[i], sn = ls[i];
        lc[i] = c * wc[i] - sn * ws[i];
        ls[i] = sn * wc[i] + c * ws[i];
        const pos = w - d[i] - md * (1 + sn);
        const ip = Math.floor(pos), f = pos - ip, off = i * len;
        const a = lines[off + (ip & mask)];
        const v0 = a + (lines[off + ((ip + 1) & mask)] - a) * f;
        const v = (dz[i] = v0 + da * (dz[i] - v0));
        y[i] = v;
        if (i & 1) l -= v; else l += v;
        if (i & 2) r -= v; else r += v;
      }
      // Hadamard-8 mixing (unrolled fast Walsh-Hadamard)
      const a0 = y[0] + y[1], a1 = y[0] - y[1], a2 = y[2] + y[3], a3 = y[2] - y[3];
      const a4 = y[4] + y[5], a5 = y[4] - y[5], a6 = y[6] + y[7], a7 = y[6] - y[7];
      const b0 = a0 + a2, b2 = a0 - a2, b1 = a1 + a3, b3 = a1 - a3;
      const b4 = a4 + a6, b6 = a4 - a6, b5 = a5 + a7, b7 = a5 - a7;
      const il = xl * 0.5, ir = xr * 0.5;
      lines[w] = (b0 + b4) * s8 * g[0] + il;
      lines[len + w] = (b1 + b5) * s8 * g[1] + ir;
      lines[2 * len + w] = (b2 + b6) * s8 * g[2] - il;
      lines[3 * len + w] = (b3 + b7) * s8 * g[3] - ir;
      lines[4 * len + w] = (b0 - b4) * s8 * g[4] + il;
      lines[5 * len + w] = (b1 - b5) * s8 * g[5] + ir;
      lines[6 * len + w] = (b2 - b6) * s8 * g[6] - il;
      lines[7 * len + w] = (b3 - b7) * s8 * g[7] - ir;
      w = (w + 1) & mask;
      l *= 0.5; r *= 0.5;
      const m = (l + r) * 0.5, sd = (l - r) * 0.5 * width;
      outL[k] = m + sd; outR[k] = m - sd;
    }
    this.w = w; this.tick = tick;
  }
}

/** In-place reverb: buf = dry*buf + wet*reverb(buf). */
export function applyReverb(buf, opts = {}, wet = 0.25, dry = 1) {
  const n = buf.L.length, oL = new Float32Array(n), oR = new Float32Array(n);
  new Reverb(opts).run(buf.L, buf.R, oL, oR);
  for (let i = 0; i < n; i++) { buf.L[i] = buf.L[i] * dry + oL[i] * wet; buf.R[i] = buf.R[i] * dry + oR[i] * wet; }
  return buf;
}

/** Early reflections: a few low-passed, cross-panned taps for small-room width. */
export function earlyReflections(buf, { seed = 3, taps = 6, maxMs = 28, gain = 0.25, lp = 5500 } = {}) {
  const rng = makeRng(seed);
  const n = buf.L.length;
  const src = cloneBuf(buf);
  const lpL = new OnePole(lp), lpR = new OnePole(lp);
  const fl = new Float32Array(n), fr = new Float32Array(n);
  for (let i = 0; i < n; i++) { fl[i] = lpL.lp(src.L[i]); fr[i] = lpR.lp(src.R[i]); }
  for (let k = 0; k < taps; k++) {
    const d = toSamples(rng.range(3, maxMs) / 1000);
    const g = gain * (1 - k / (taps + 1)) * (rng.chance(0.5) ? 1 : -1);
    const cross = k % 2 === 1;
    const inL = cross ? fr : fl, inR = cross ? fl : fr;
    const toLeft = rng.next() < 0.5;
    for (let i = d; i < n; i++) {
      if (toLeft) buf.L[i] += inL[i - d] * g; else buf.R[i] += inR[i - d] * g;
    }
  }
  return buf;
}

/** Stereo chorus: two modulated taps per channel in quadrature. */
export function chorus(buf, { rate = 0.33, depth = 0.003, delay = 0.012, mix = 0.35 } = {}) {
  const n = buf.L.length;
  const dlL = new DelayLine(toSamples(delay + depth * 2) + 8), dlR = new DelayLine(toSamples(delay + depth * 2) + 8);
  const base = delay * SR, dep = depth * SR, inc = TAU * rate / SR;
  const ci = Math.cos(inc), si = Math.sin(inc);
  const c21 = Math.cos(2.1), s21 = Math.sin(2.1), c37 = Math.cos(3.7), s37 = Math.sin(3.7);
  let sn = 0, cs = 1;
  for (let i = 0; i < n; i++) {
    dlL.write(buf.L[i]); dlR.write(buf.R[i]);
    const t = sn * ci + cs * si; cs = cs * ci - sn * si; sn = t;
    if ((i & 4095) === 0) { const m = Math.hypot(sn, cs); sn /= m; cs /= m; }
    const wl = 0.5 * (dlL.read(base + dep * sn) + dlR.read(base + dep * (sn * c21 + cs * s21)));
    const wr = 0.5 * (dlR.read(base + dep * cs) + dlL.read(base + dep * (sn * c37 + cs * s37)));
    buf.L[i] = buf.L[i] * (1 - mix * 0.5) + wl * mix;
    buf.R[i] = buf.R[i] * (1 - mix * 0.5) + wr * mix;
  }
  return buf;
}

// ---------- dynamics ----------

/** Stereo-linked feed-forward compressor with soft knee (RMS detector). */
export function compress(buf, { threshold = -18, ratio = 2, attack = 0.015, release = 0.18, knee = 6, makeup = 0, rmsMs = 8 } = {}) {
  const n = buf.L.length;
  const ar = Math.exp(-1 / (rmsMs / 1000 * SR));
  const aa = Math.exp(-1 / (attack * SR)), rr = Math.exp(-1 / (release * SR));
  let ms = 0, gr = 0, maxGr = 0;
  const mk = dbToGain(makeup);
  for (let i = 0; i < n; i++) {
    const l = buf.L[i], r = buf.R[i];
    ms = ar * ms + (1 - ar) * Math.max(l * l, r * r);
    const lv = 10 * Math.log10(ms + 1e-20);
    const over = lv - threshold;
    let want = 0;
    if (over > knee / 2) want = over * (1 - 1 / ratio);
    else if (over > -knee / 2) want = ((over + knee / 2) ** 2) / (2 * knee) * (1 - 1 / ratio);
    gr = want > gr ? aa * gr + (1 - aa) * want : rr * gr + (1 - rr) * want;
    if (gr > maxGr) maxGr = gr;
    const g = Math.exp(-gr * 0.11512925464970229) * mk; // 10^(-gr/20)
    buf.L[i] = l * g; buf.R[i] = r * g;
  }
  return maxGr;
}

// 4x oversampling interpolator taps for true-peak estimation (windowed sinc, 12 taps/phase)
const TP_TAPS = (() => {
  const phases = [];
  for (let p = 1; p < 4; p++) {
    const frac = p / 4, taps = [];
    let sum = 0;
    for (let k = -5; k <= 6; k++) {
      const x = frac - k;
      const sinc = Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      const w = 0.5 + 0.5 * Math.cos(Math.PI * x / 6.5);
      taps.push(sinc * w); sum += sinc * w;
    }
    phases.push(taps.map((t) => t / sum));
  }
  return phases;
})();

/**
 * Per-sample true-peak magnitude (max over both channels and the 3 inter-sample points after n).
 * Oversampling is skipped where both neighbours are below `floor` (inter-sample overs stay < ~+4 dB).
 */
export function truePeakTrace(buf, floor = 1e-5) {
  const n = buf.L.length, out = new Float32Array(n);
  const t0 = TP_TAPS[0], t1 = TP_TAPS[1], t2 = TP_TAPS[2];
  for (const src of [buf.L, buf.R]) {
    const ch = new Float32Array(n + 12); // zero-padded copy: 5 before, 7 after
    ch.set(src, 5);
    for (let i = 0; i < n; i++) {
      const c = ch[i + 5];
      let m = c < 0 ? -c : c;
      const nx = ch[i + 6];
      if (m > floor || nx > floor || nx < -floor) {
        let a = 0, b = 0, d = 0;
        for (let k = 0; k < 12; k++) { const v = ch[i + k]; a += v * t0[k]; b += v * t1[k]; d += v * t2[k]; }
        if (a < 0) a = -a; if (b < 0) b = -b; if (d < 0) d = -d;
        if (a > m) m = a; if (b > m) m = b; if (d > m) m = d;
      }
      if (m > out[i]) out[i] = m;
    }
  }
  return out;
}

/**
 * Look-ahead true-peak limiter (hold + box-smoothed gain, guaranteed below ceiling).
 * Returns max gain reduction in dB.
 */
export function limit(buf, { ceiling = -1.5, lookahead = 0.004, release = 0.12, trace = null, traceScale = 1 } = {}) {
  const n = buf.L.length;
  if (!n) return 0;
  const c = dbToGain(ceiling);
  const L = Math.max(2, toSamples(lookahead));
  const tp = trace || truePeakTrace(buf, c * 0.6); // a precomputed trace of buf/traceScale may be passed
  const req = new Float32Array(n + L);
  for (let i = 0; i < n; i++) { const v = tp[i] * traceScale; req[i] = v > c ? c / v : 1; }
  for (let i = n; i < n + L; i++) req[i] = 1;
  // sliding-window minimum over the last L samples (monotonic deque)
  const hold = new Float32Array(n + L);
  const dq = new Int32Array(n + L);
  let head = 0, tail = 0;
  for (let i = 0; i < n + L; i++) {
    while (tail > head && req[dq[tail - 1]] >= req[i]) tail--;
    dq[tail++] = i;
    if (dq[head] <= i - L) head++;
    hold[i] = req[dq[head]];
  }
  // release smoothing (never exceeds hold → still safe)
  const rc = 1 - Math.exp(-1 / (release * SR));
  let g = 1;
  for (let i = 0; i < n + L; i++) { g = Math.min(hold[i], g + (1 - g) * rc); hold[i] = g; }
  // box filter of length L (window prefilled with unity), applied to the signal delayed by L-1
  const box = new Float32Array(n + L);
  let acc = L, minG = 1;
  for (let i = 0; i < n + L; i++) { acc += hold[i] - (i >= L ? hold[i - L] : 1); box[i] = acc / L; }
  for (let i = 0; i < n; i++) {
    const gi = box[i + L - 1];
    if (gi < minG) minG = gi;
    buf.L[i] *= gi; buf.R[i] *= gi;
  }
  return -gainToDb(minG);
}

// ---------- loudness (ITU-R BS.1770-4 / EBU R128) ----------

/** Add K-weighted energy of one channel into per-hop sums. */
function kWeightInto(ch, sub, hop) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, u1 = 0, u2 = 0, z1 = 0, z2 = 0;
  for (let i = 0; i < ch.length; i++) {
    const x = ch[i];
    const y = 1.53512485958697 * x - 2.69169618940638 * x1 + 1.19839281085285 * x2 + 1.69065929318241 * y1 - 0.73248077421585 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    const z = y - 2 * u1 + u2 + 1.99004745483398 * z1 - 0.99007225036621 * z2;
    u2 = u1; u1 = y; z2 = z1; z1 = z;
    sub[(i / hop) | 0] += z * z;
  }
}

/** Integrated loudness, max momentary / short-term, true peak and sample peak. */
export function measureLoudness(buf, { peaks = true } = {}) {
  const n = buf.L.length, hop = SR / 10;
  const nHops = Math.max(4, Math.ceil(n / hop));
  const sub = new Float64Array(nHops);
  kWeightInto(buf.L, sub, hop); kWeightInto(buf.R, sub, hop);
  const lufs = (z) => -0.691 + 10 * Math.log10(z + 1e-30);
  const blocks = [];
  for (let j = 0; j + 4 <= nHops; j++) blocks.push((sub[j] + sub[j + 1] + sub[j + 2] + sub[j + 3]) / (4 * hop));
  let momentaryMax = -Infinity;
  for (const z of blocks) momentaryMax = Math.max(momentaryMax, lufs(z));
  let shortTermMax = -Infinity;
  for (let j = 0; j + 30 <= nHops || (j === 0 && nHops < 30); j++) {
    let s = 0; const w = Math.min(30, nHops);
    for (let k = 0; k < w; k++) s += sub[j + k];
    shortTermMax = Math.max(shortTermMax, lufs(s / (w * hop)));
    if (nHops < 30) break;
  }
  const abs = blocks.filter((z) => lufs(z) > -70);
  let integrated = -Infinity;
  if (abs.length) {
    const rel = lufs(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
    const gated = abs.filter((z) => lufs(z) > rel);
    if (gated.length) integrated = lufs(gated.reduce((a, b) => a + b, 0) / gated.length);
  }
  if (!peaks) return { integrated, momentaryMax, shortTermMax };
  const tp = truePeakTrace(buf, peakOf(buf) * 0.6);
  let tpMax = 0;
  for (let i = 0; i < n; i++) if (tp[i] > tpMax) tpMax = tp[i];
  return { integrated, momentaryMax, shortTermMax, truePeak: gainToDb(tpMax), samplePeak: gainToDb(peakOf(buf)) };
}

/**
 * Normalise to an integrated loudness target with a true-peak limiter.
 * Iterates gain → limit → measure so limiting losses are compensated.
 */
export function masterLoudness(buf, { lufs = -16, ceiling = -1.5, release = 0.12, iterations = 4 } = {}) {
  const base = cloneBuf(buf);
  const m0 = measureLoudness(base, { peaks: false }).integrated;
  if (!Number.isFinite(m0)) return { integrated: m0, gainDb: 0, limitDb: 0 };
  const trace = truePeakTrace(base, dbToGain(ceiling - 10.5 - (lufs - m0))); // gain is linear: one trace serves every iteration
  let gainDb = lufs - m0, limitDb = 0, best = null;
  for (let it = 0; it < iterations; it++) {
    const g = dbToGain(gainDb);
    for (let i = 0; i < base.L.length; i++) { buf.L[i] = base.L[i] * g; buf.R[i] = base.R[i] * g; }
    limitDb = limit(buf, { ceiling, release, trace, traceScale: g });
    const m = measureLoudness(buf, { peaks: false }).integrated;
    best = { gainDb, limitDb };
    const err = lufs - m;
    if (Math.abs(err) < 0.08) break;
    gainDb += err * (limitDb > 3 ? 1.25 : 1); // heavy limiting absorbs part of each step
  }
  return { ...measureLoudness(buf), gainDb: best.gainDb, limitDb: best.limitDb };
}

// ---------- analysis ----------

/** Quick sanity stats: finite check, DC, RMS, peaks, boundary samples. */
export function stats(buf) {
  const n = buf.L.length;
  let bad = 0, sumL = 0, sumR = 0, sq = 0, pk = 0;
  for (let i = 0; i < n; i++) {
    const l = buf.L[i], r = buf.R[i];
    if (!Number.isFinite(l) || !Number.isFinite(r)) { bad++; continue; }
    sumL += l; sumR += r; sq += l * l + r * r;
    pk = Math.max(pk, Math.abs(l), Math.abs(r));
  }
  const edge = (i) => Math.max(Math.abs(buf.L[i] || 0), Math.abs(buf.R[i] || 0));
  return {
    seconds: n / SR,
    nonFinite: bad,
    dc: Math.max(Math.abs(sumL / n), Math.abs(sumR / n)),
    rmsDb: gainToDb(Math.sqrt(sq / (2 * n))),
    peakDb: gainToDb(pk),
    first: edge(0),
    last: edge(n - 1),
  };
}

// ---------- WAV / PCM I/O ----------

/** Encode stereo float buffer as 16-bit PCM WAV with seeded TPDF dither. */
export function encodeWav16(buf, { seed = 12345 } = {}) {
  const n = buf.L.length, rng = makeRng(seed);
  const out = Buffer.alloc(44 + n * 4);
  out.write('RIFF', 0); out.writeUInt32LE(36 + n * 4, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
  out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(n * 4, 40);
  const pcm = new Int16Array(out.buffer, out.byteOffset + 44, n * 2);
  const q = (v) => {
    const d = v === 0 ? 0 : rng.next() - rng.next();
    const x = Math.round(v * 32767 + d);
    return x > 32767 ? 32767 : x < -32768 ? -32768 : x;
  };
  for (let i = 0; i < n; i++) { pcm[2 * i] = q(buf.L[i]); pcm[2 * i + 1] = q(buf.R[i]); }
  return out;
}

/** Atomic file write (tmp + rename) so concurrent readers never see partial files. */
export async function writeFileAtomic(file, data) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tmp, data);
  await fs.promises.rename(tmp, file);
}

export const writeWav = (file, buf, opts) => writeFileAtomic(file, encodeWav16(buf, opts));

/** Parse a PCM/float WAV. Returns { buf, sampleRate } or null if unsupported. */
export function decodeWav(data) {
  if (data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WAVE') return null;
  let off = 12, fmt = null, dataOff = -1, dataLen = 0;
  while (off + 8 <= data.length) {
    const id = data.toString('ascii', off, off + 4), len = data.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { format: data.readUInt16LE(off + 8), channels: data.readUInt16LE(off + 10), rate: data.readUInt32LE(off + 12), bits: data.readUInt16LE(off + 22) };
    if (id === 'data') { dataOff = off + 8; dataLen = Math.min(len, data.length - dataOff); break; }
    off += 8 + len + (len & 1);
  }
  if (!fmt || dataOff < 0) return null;
  const { channels, bits } = fmt;
  let { format } = fmt;
  if (format === 0xfffe) { // WAVE_FORMAT_EXTENSIBLE: real format code lives in the sub-format GUID
    const fo = data.indexOf('fmt ', 12);
    format = fo > 0 ? data.readUInt16LE(fo + 8 + 24) : 1;
  }
  const bps = bits / 8, frames = Math.floor(dataLen / (bps * channels));
  const buf = stereo(frames);
  const read = (p) => {
    if (format === 3 && bits === 32) return data.readFloatLE(p);
    if (format === 1 && bits === 16) return data.readInt16LE(p) / 32768;
    if (format === 1 && bits === 24) return data.readIntLE(p, 3) / 8388608;
    if (format === 1 && bits === 32) return data.readInt32LE(p) / 2147483648;
    return NaN;
  };
  if (!((format === 1 && [16, 24, 32].includes(bits)) || (format === 3 && bits === 32))) return null;
  for (let i = 0; i < frames; i++) {
    const p = dataOff + i * bps * channels;
    const l = read(p), r = channels > 1 ? read(p + bps) : l;
    buf.L[i] = l; buf.R[i] = r;
  }
  if (Number.isNaN(buf.L[0])) return null;
  return { buf, sampleRate: fmt.rate };
}

/** Interleave to little-endian float32 (ffmpeg -f f32le). */
export function toF32le(buf) {
  const n = buf.L.length, f = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { f[2 * i] = buf.L[i]; f[2 * i + 1] = buf.R[i]; }
  return Buffer.from(f.buffer);
}

export function fromF32le(data) {
  const n = Math.floor(data.length / 8), buf = stereo(n);
  const ab = data.byteOffset % 4 === 0 ? data : new Uint8Array(data); // Float32Array needs 4-byte alignment
  const f = new Float32Array(ab.buffer, ab.byteOffset, n * 2);
  for (let i = 0; i < n; i++) { buf.L[i] = f[2 * i]; buf.R[i] = f[2 * i + 1]; }
  return buf;
}
