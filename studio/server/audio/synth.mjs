// Goldcom SFX library: offline pure-JS synthesis (48 kHz stereo, seeded, deterministic),
// cached as 16-bit WAV. Palette: soft air, glassy UI ticks, warm low hits, refined chimes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  SR, TAU, clamp, toSamples, mtof, hashSeed, makeRng, pinkNoise, stereo, panGains,
  Biquad, SVF, OnePole, applyReverb, earlyReflections, dcBlock, fadeEdges, normalizePeak, writeWav, filterBuf,
} from './dsp.mjs';
import { feltPiano, renderPad, chime, marimba, sparkle, stereoNoise, writeMono } from './instruments.mjs';

/** Bump when shared DSP behaviour changes in a way the source hash would not catch. */
export const SFX_VERSION = 1;
const PEAK_DB = -3;

const smooth = (u) => u * u * (3 - 2 * u);
const monoToStereo = (buf, mono, pan = 0, gain = 1) => writeMono(buf, 0, mono, pan, gain);

// ---------- building blocks ----------

/** Band-passed noise pass with a doppler-like centre sweep, airy top layer and pan motion. */
function whoosh(buf, rng, o) {
  const n = buf.L.length;
  const src = stereoNoise(rng, 0.5);
  const fL = new SVF(), fR = new SVF(), wL = new SVF(), wR = new SVF();
  const aL = new SVF(o.air, 0.7), aR = new SVF(o.air * 1.07, 0.7);
  for (let i = 0; i < n; i++) {
    const u = i / SR / o.body;
    if (u >= 1) break;
    const e = u < o.peak
      ? Math.sin(Math.PI / 2 * u / o.peak) ** 2
      : (0.5 + 0.5 * Math.cos(Math.PI * (u - o.peak) / (1 - o.peak))) ** 1.6;
    const s = u < o.peak ? (u / o.peak) ** 0.85 : ((u - o.peak) / (1 - o.peak)) ** 0.7;
    const fc = u < o.peak ? o.fLow * (o.fHigh / o.fLow) ** s : o.fHigh * (o.fEnd / o.fHigh) ** s;
    const q = o.q * (0.75 + 0.5 * e);
    fL.set(fc, q); fR.set(fc * 1.05, q);
    const [nl, nr] = src();
    fL.tick(nl); fR.tick(nr); aL.tick(nl); aR.tick(nr);
    let l = fL.bp, r = fR.bp;
    const ea = e * e;
    l += o.airAmt * aL.hp * ea; r += o.airAmt * aR.hp * ea;
    if (o.whistle) { // narrow resonant band for a quicker, whip-like swish
      wL.set(fc * 1.6, 7); wR.set(fc * 1.62, 7);
      wL.tick(nl); wR.tick(nr);
      l += o.whistle * wL.bp; r += o.whistle * wR.bp;
    }
    const [gl, gr] = panGains(o.panFrom + (o.panTo - o.panFrom) * smooth(clamp(u / (o.peak * 2), 0, 1)));
    const env = e ** 1.25;
    buf.L[i] = l * env * gl; buf.R[i] = r * env * gr;
  }
  // keep pink-noise rumble out of the pass (4th order)
  filterBuf(buf, 'highpass', o.hp ?? 140, 0.7); filterBuf(buf, 'highpass', o.hp ?? 140, 0.7);
}

/** Glassy UI tick: tuned partials, tiny body tone and a filtered contact click. */
function tick(buf, t0, rng, { f = 1100, partials = [[1, 0.8, 0.011], [2.71, 0.32, 0.0045], [4.93, 0.1, 0.002]], body = [230, 0.2, 0.01], click = [0.22, 0.0012, 2600], drop = 0.12, attack = 0.0003, gain = 1, pan = 0 } = {}) {
  const len = toSamples(0.09);
  const mono = new Float64Array(len);
  const hp = new Biquad('highpass', click[2], 0.7);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const s = i / SR;
    ph += TAU * f * (1 + drop * Math.exp(-s / 0.004)) / SR;
    let v = 0;
    for (const [ratio, a, tau] of partials) v += a * Math.sin(ph * ratio) * Math.exp(-s / tau);
    v += body[1] * Math.sin(TAU * body[0] * s) * Math.exp(-s / body[2]);
    v += click[0] * hp.tick(rng.bi()) * Math.exp(-s / click[1]);
    const a = Math.min(1, s / attack);
    mono[i] = v * a * a;
  }
  writeMono(buf, toSamples(t0), mono, pan, gain);
  filterBuf(buf, 'highpass', 120, 0.7); // removes the net-area LF of phase-0 decaying sines
}

/** Keyboard tick: plastic key resonances, contact click and a softer bottom-out. */
function keyTick(buf, t0, rng, { vel = 1, pitch = 1, pan = 0, space = false } = {}) {
  const len = toSamples(0.04);
  const mono = new Float64Array(len);
  const bp = new Biquad('bandpass', 3600 * pitch * (space ? 0.7 : 1), 1.1);
  const bp2 = new Biquad('bandpass', 2600 * pitch, 1.4);
  const lp = new Biquad('lowpass', 9000, 0.7);
  const bottom = (space ? 0.009 : 0.0065) * (2 - pitch);
  const f1 = 420 * pitch * (space ? 0.75 : 1), f2 = 1380 * pitch;
  for (let i = 0; i < len; i++) {
    const s = i / SR;
    const nz = rng.bi();
    let v = 0.9 * bp.tick(nz) * Math.exp(-s / 0.0016)
      + 0.45 * Math.sin(TAU * f1 * s) * Math.exp(-s / 0.006)
      + 0.22 * Math.sin(TAU * f2 * s) * Math.exp(-s / 0.0035);
    const b2 = bp2.tick(nz), sb = s - bottom;
    if (sb >= 0) v += 0.4 * b2 * Math.exp(-sb / 0.0011);
    mono[i] = lp.tick(v) * Math.min(1, s / 0.0002);
  }
  const hp = new Biquad('highpass', 160, 0.7);
  hp.run(mono);
  writeMono(buf, toSamples(t0), mono, pan, vel * (space ? 1.1 : 1));
}

/** Warm low hit: pitch-dropping sub, low-passed body noise, felt knock and soft transient. */
function lowHit(buf, rng, { gain = 1, sub = 0.6, body = 0.6, knock = 0.55, transient = 0.18, subDecay = 0.2 } = {}) {
  const n = buf.L.length;
  const pnL = pinkNoise(rng), pnR = pinkNoise(rng);
  const lpL = new SVF(480, 0.7), lpR = new SVF(500, 0.7), tl = new OnePole(2000);
  let ph = 0, pk = 0;
  for (let i = 0; i < n; i++) {
    const s = i / SR;
    ph += TAU * (56 + 44 * Math.exp(-s / 0.05)) / SR;
    pk += TAU * (118 + 30 * Math.exp(-s / 0.02)) / SR;
    const att = Math.min(1, s / 0.003);
    // driven sub adds 2nd/3rd harmonics so the hit still reads on phone speakers
    const sv = Math.tanh(2.4 * sub * Math.sin(ph) * Math.exp(-s / subDecay) * att) / 2.4;
    const kn = knock * Math.sin(pk) * Math.exp(-s / 0.09) * att;
    const be = body * Math.exp(-s / 0.08) * att;
    const tr = transient * tl.lp(rng.bi()) * Math.exp(-s / 0.002);
    buf.L[i] += gain * (sv + kn + tr + be * lpL.tick(pnL()));
    buf.R[i] += gain * (sv + kn + tr + be * lpR.tick(pnR()));
  }
}

/** Filtered-noise + gliding detuned tone build that peaks at `hit` seconds, then cuts softly. */
function riser(buf, rng, { hit, f0 = 260, f1 = 7500, toneFrom = 146.83, toneTo = 587.33, toneAmt = 0.13 }) {
  const n = buf.L.length;
  const src = stereoNoise(rng, 0.3);
  const fL = new SVF(), fR = new SVF(), aL = new SVF(6500, 0.7), aR = new SVF(6800, 0.7);
  const saws = [-9, 0, 8].map((c) => ({ c, p: rng.next(), lp: new SVF(1000, 0.8) }));
  let trem = 0;
  for (let i = 0; i < n; i++) {
    const s = i / SR;
    const u = Math.min(1, s / hit);
    const env = s <= hit ? u ** 2.2 : Math.exp(-(s - hit) / 0.022);
    const fc = f0 * (f1 / f0) ** (u ** 1.5);
    const q = 0.9 + 0.9 * u;
    fL.set(fc, q); fR.set(fc * 1.06, q);
    const [nl, nr] = src();
    fL.tick(nl); fR.tick(nr); aL.tick(nl); aR.tick(nr);
    let l = fL.bp + 0.4 * u * u * aL.hp, r = fR.bp + 0.4 * u * u * aR.hp;
    // tone: three detuned saws gliding up two octaves, tracked low-pass, quickening flutter
    const ft = toneFrom * (toneTo / toneFrom) ** (u ** 1.8);
    trem += TAU * (3 + 11 * u * u) / SR;
    let tone = 0;
    for (const v of saws) {
      v.p += ft * 2 ** (v.c / 1200) / SR; if (v.p >= 1) v.p -= 1;
      if ((i & 15) === 0) v.lp.set(ft * 3, 0.8);
      tone += v.lp.tick(2 * v.p - 1);
    }
    tone *= toneAmt * (1 - 0.25 * u * (0.5 + 0.5 * Math.sin(trem)));
    // width opens as it builds
    const m = (l + r) * 0.5, sd = (l - r) * 0.5 * (0.3 + 0.7 * u);
    buf.L[i] = (m + sd + tone) * env;
    buf.R[i] = (m - sd + tone) * env;
  }
  filterBuf(buf, 'highpass', 110, 0.7);
}

/** Paper handling: Poisson crinkle events (heavy-tailed amplitudes) over friction noise. */
function paper(buf, rng) {
  const n = buf.L.length, dur = n / SR;
  const gestures = [[0.01, 0.22, 320], [0.24, 0.46, 240]];
  const gEnv = (s) => {
    let e = 0;
    for (const [a, b] of gestures) if (s >= a && s <= b) e = Math.max(e, Math.sin(Math.PI * (s - a) / (b - a)) ** 1.5);
    return e;
  };
  // continuous friction rustle
  const src = stereoNoise(rng, 0.4);
  const fL = new SVF(1900, 0.6), fR = new SVF(2100, 0.6), lL = new SVF(320, 0.7), lR = new SVF(340, 0.7);
  for (let i = 0; i < n; i++) {
    const e = gEnv(i / SR);
    const [nl, nr] = src();
    fL.tick(nl); fR.tick(nr); lL.tick(nl); lR.tick(nr);
    buf.L[i] += e * (0.08 * fL.bp + 0.012 * lL.lp);
    buf.R[i] += e * (0.08 * fR.bp + 0.012 * lR.lp);
  }
  // crinkles (thinning of a Poisson process)
  const maxRate = 320;
  let s = 0;
  while (true) {
    s += -Math.log(1 - rng.next()) / maxRate;
    if (s > dur - 0.03) break;
    if (rng.next() > gEnv(s)) continue;
    const len = toSamples(0.012), mono = new Float64Array(len);
    const bp = new Biquad('bandpass', rng.range(1200, 7500), rng.range(0.8, 3));
    const tau = rng.range(0.0006, 0.0035), amp = rng.next() ** 2.6;
    for (let i = 0; i < len; i++) mono[i] = bp.tick(rng.bi()) * Math.exp(-i / SR / tau) * Math.min(1, i / 6);
    writeMono(buf, toSamples(s), mono, rng.bi() * 0.45, amp * 1.6);
  }
  filterBuf(buf, 'highpass', 260, 0.7); filterBuf(buf, 'highpass', 260, 0.7);
}

// ---------- the library ----------

const DEFS = [
  {
    name: 'whoosh-soft', duration: 0.6, hit: 0.27, level: 0.4,
    description: 'Gentle air pass for slide transitions (left to right).',
    render(buf, rng) {
      whoosh(buf, rng, { body: 0.54, peak: 0.5, fLow: 220, fHigh: 2000, fEnd: 420, q: 0.95, air: 4800, airAmt: 0.3, panFrom: -0.55, panTo: 0.55 });
      applyReverb(buf, { decay: 0.8, damping: 7000, predelay: 0.006, seed: 11 }, 0.28);
    },
  },
  {
    name: 'whoosh-fast', duration: 0.35, hit: 0.13, level: 0.42,
    description: 'Quicker swipe/whip transition (right to left).',
    render(buf, rng) {
      whoosh(buf, rng, { body: 0.3, peak: 0.42, fLow: 380, fHigh: 3200, fEnd: 750, q: 1.1, air: 6200, airAmt: 0.42, whistle: 0.12, panFrom: 0.6, panTo: -0.6, hp: 200 });
      applyReverb(buf, { decay: 0.5, damping: 8000, predelay: 0.004, seed: 12 }, 0.2);
    },
  },
  {
    name: 'swipe', duration: 0.25, hit: 0.07, level: 0.34,
    description: 'Phone swipe / scroll: short soft friction swish.',
    render(buf, rng) {
      whoosh(buf, rng, { body: 0.22, peak: 0.32, fLow: 1300, fHigh: 4200, fEnd: 2800, q: 1.3, air: 7500, airAmt: 0.3, panFrom: 0.25, panTo: -0.25, hp: 450 });
      earlyReflections(buf, { seed: 4, taps: 5, maxMs: 16, gain: 0.2 });
    },
  },
  {
    name: 'tap', duration: 0.08, hit: 0, level: 0.72,
    description: 'Clean UI tap on glass.',
    render(buf, rng) {
      tick(buf, 0, rng, {});
      earlyReflections(buf, { seed: 5, taps: 4, maxMs: 9, gain: 0.16, lp: 7000 });
    },
    fadeIn: 0.0002, fadeOut: 0.01,
  },
  {
    name: 'click-soft', duration: 0.06, hit: 0, level: 0.62,
    description: 'Subtler tick for list items or words appearing.',
    render(buf, rng) {
      tick(buf, 0, rng, { f: 1750, partials: [[1, 0.7, 0.006], [2.62, 0.22, 0.003]], body: [380, 0.25, 0.007], click: [0.14, 0.0008, 3500], drop: 0.06, attack: 0.0005 });
      earlyReflections(buf, { seed: 6, taps: 3, maxMs: 7, gain: 0.12, lp: 7000 });
    },
    fadeIn: 0.0003, fadeOut: 0.008,
  },
  {
    name: 'pop', duration: 0.15, hit: 0.005, level: 0.5,
    description: 'Soft rounded pop for stickers and badges appearing.',
    render(buf, rng) {
      const n = toSamples(0.15), mono = new Float64Array(n);
      const lp = new OnePole(3000);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const s = i / SR;
        ph += TAU * (340 + 470 * (1 - Math.exp(-s / 0.011))) / SR;
        const a = Math.min(1, s / 0.0012);
        mono[i] = a * ((Math.sin(ph) + 0.1 * Math.sin(2 * ph)) * Math.exp(-s / 0.03)
          + 0.28 * Math.sin(TAU * 165 * s) * Math.exp(-s / 0.016)
          + 0.16 * lp.lp(rng.bi()) * Math.exp(-s / 0.0015));
      }
      monoToStereo(buf, mono);
      earlyReflections(buf, { seed: 7, taps: 5, maxMs: 14, gain: 0.18 });
      applyReverb(buf, { decay: 0.45, predelay: 0.004, seed: 13 }, 0.12);
    },
    fadeIn: 0.0005, fadeOut: 0.02,
  },
  {
    name: 'type-tick', duration: 0.04, hit: 0, level: 0.48,
    description: 'Very soft keyboard tick for one typed character.',
    render(buf, rng) { keyTick(buf, 0.0005, rng, {}); },
    fadeIn: 0.0003, fadeOut: 0.006,
  },
  {
    name: 'typing', duration: 1.5, hit: 0.02, level: 0.46,
    description: 'Natural run of soft key ticks with jittered timing and word gaps.',
    render(buf, rng) {
      let t = 0.02, chars = 0, word = rng.int(3, 6);
      while (t < 1.4) {
        keyTick(buf, t, rng, { vel: rng.range(0.55, 1), pitch: rng.range(0.93, 1.07), pan: rng.bi() * 0.15 });
        if (++chars >= word) {
          t += rng.range(0.15, 0.22);
          if (t < 1.4) keyTick(buf, t, rng, { vel: 0.75, pitch: 0.95, space: true });
          t += rng.range(0.1, 0.15); chars = 0; word = rng.int(3, 7);
        } else t += Math.exp(Math.log(0.092) + rng.gauss() * 0.28);
      }
      earlyReflections(buf, { seed: 8, taps: 5, maxMs: 12, gain: 0.14 });
    },
    fadeOut: 0.05,
  },
  {
    name: 'notification', duration: 0.9, hit: 0, level: 0.62,
    description: 'Friendly two-note rising-fifth notification chime.',
    render(buf) {
      chime(buf, 0.001, mtof(81), { vel: 0.75, pan: -0.12, decay: 0.75, tine: 0.75, octave: 0.12 });
      chime(buf, 0.116, mtof(88), { vel: 0.85, pan: 0.12, decay: 0.75, tine: 0.7, octave: 0.1 });
      applyReverb(buf, { decay: 1.0, damping: 7500, predelay: 0.012, seed: 14 }, 0.26);
    },
    fadeOut: 0.12,
  },
  {
    name: 'success', duration: 1.4, hit: 0, level: 0.7,
    description: 'Refined success chime: D-major bell arpeggio with a shimmer tail (purchase complete).',
    render(buf, rng) {
      const notes = [74, 78, 81, 86];
      notes.forEach((m, k) => chime(buf, 0.001 + k * 0.07, mtof(m), { vel: 0.68 + k * 0.06, pan: -0.25 + k * 0.17, decay: 1.05 + (k === 3 ? 0.15 : 0), tine: 0.8, octave: 0.13 }));
      // warm body underneath: soft D4 + A4 sines
      const n = buf.L.length, w1 = TAU * mtof(62) / SR, w2 = TAU * mtof(69) / SR;
      for (let i = 0; i < n; i++) {
        const s = i / SR, e = Math.min(1, s / 0.04) * Math.exp(-s / 0.4) * 0.045;
        const v = e * (Math.sin(w1 * i) + 0.7 * Math.sin(w2 * i));
        buf.L[i] += v; buf.R[i] += v;
      }
      sparkle(buf, 0.22, 1.0, { rng, count: 14, freqs: [2349.3, 2960, 3520, 4698.6], gain: 0.16, density: (u) => (1 - u) ** 1.5 });
      applyReverb(buf, { decay: 1.6, damping: 8000, predelay: 0.014, seed: 15 }, 0.3);
    },
    fadeOut: 0.3,
  },
  {
    name: 'shimmer', duration: 1.6, hit: 0.3, level: 0.3,
    description: 'Subtle gold sparkle: high airy granular glints.',
    render(buf, rng) {
      const dens = (u) => (u < 0.18 ? u / 0.18 : (1 - (u - 0.18) / 0.82) ** 1.4);
      sparkle(buf, 0.01, 1.3, { rng, count: 70, freqs: [2349.3, 2637, 2960, 3520, 3951, 4698.6, 5920], gain: 0.5, density: dens });
      const src = stereoNoise(rng, 0.2), hL = new SVF(7500, 0.7), hR = new SVF(7900, 0.7);
      for (let i = 0; i < buf.L.length; i++) {
        const u = i / SR / 1.3, e = u < 1 ? dens(u) * 0.05 : 0;
        const [l, r] = src();
        hL.tick(l); hR.tick(r);
        buf.L[i] += hL.hp * e; buf.R[i] += hR.hp * e;
      }
      applyReverb(buf, { decay: 1.3, damping: 10000, predelay: 0.01, seed: 16 }, 0.4);
    },
    fadeOut: 0.25,
  },
  {
    name: 'riser', duration: 1.5, hit: 1.38, level: 0.45,
    description: 'Soft filtered noise + tone rise that peaks at 1.38 s into a reveal.',
    render(buf, rng) {
      riser(buf, rng, { hit: 1.38 });
      applyReverb(buf, { decay: 1.1, damping: 6000, predelay: 0.01, seed: 17 }, 0.22);
    },
    fadeIn: 0.05, fadeOut: 0.06,
  },
  {
    name: 'riser-short', duration: 0.8, hit: 0.72, level: 0.48,
    description: 'Short riser that peaks at 0.72 s.',
    render(buf, rng) {
      riser(buf, rng, { hit: 0.72, f0: 380, toneFrom: 220, toneTo: 587.33, toneAmt: 0.12 });
      applyReverb(buf, { decay: 0.8, damping: 6500, predelay: 0.008, seed: 18 }, 0.2);
    },
    fadeIn: 0.03, fadeOut: 0.05,
  },
  {
    name: 'impact-soft', duration: 1.2, hit: 0, level: 0.7,
    description: 'Warm, deep, gentle cinematic low hit with a dark tail (logo reveal, big statement).',
    render(buf, rng) {
      lowHit(buf, rng, {});
      applyReverb(buf, { decay: 1.8, size: 1.3, damping: 2400, predelay: 0.008, lowcut: 180, seed: 19 }, 0.55);
      filterBuf(buf, 'highpass', 32, 0.7);
    },
    fadeIn: 0.0008, fadeOut: 0.35,
  },
  {
    name: 'logo-sting', duration: 2.2, hit: 0, level: 0.75,
    description: 'Brand outro sting: soft low impact, warm Dadd9 chord bloom and light shimmer.',
    render(buf, rng) {
      const n = buf.L.length;
      lowHit(buf, rng, { gain: 0.42, body: 0.35, transient: 0.1, subDecay: 0.3 });
      const voicing = [50, 57, 64, 66, 69];
      const bloom = (t) => (t < 0.35 ? Math.sin(Math.PI / 2 * t / 0.35) ** 2 : 0.35 + 0.65 * Math.exp(-(t - 0.35) / 0.5));
      const pad = renderPad(n, voicing.map((m) => ({ t: 0.01, dur: 1.15, midi: m, vel: 0.7 })), {
        rng, voices: 3, detune: 8, attack: 0.12, release: 0.9, sine: 0.5, cutoff: (t) => 450 + 2600 * bloom(t), q: 0.7,
      });
      filterBuf(pad, 'highpass', 120, 0.7);
      for (let i = 0; i < n; i++) { buf.L[i] += pad.L[i] * 0.24; buf.R[i] += pad.R[i] * 0.24; }
      [50, 57, 62, 64, 66, 69].forEach((m, k) => feltPiano(buf, 0.02 + k * 0.013, m, { vel: 0.5 + k * 0.03, dur: 1.7, pan: -0.3 + k * 0.12, rng, gain: 0.9 }));
      chime(buf, 0.06, mtof(81), { vel: 0.32, decay: 1.6, pan: 0.15, tine: 0.5 });
      chime(buf, 0.095, mtof(86), { vel: 0.22, decay: 1.5, pan: -0.15, tine: 0.4 });
      sparkle(buf, 0.25, 1.7, { rng, count: 24, freqs: [2349.3, 2960, 3520, 4698.6, 5920], gain: 0.15, density: (u) => (1 - u) ** 1.2 });
      applyReverb(buf, { decay: 2.4, damping: 6000, predelay: 0.02, seed: 20 }, 0.34);
    },
    fadeIn: 0.0008, fadeOut: 0.7,
  },
  {
    name: 'count-tick', duration: 0.05, hit: 0, level: 0.56,
    description: 'Crisp short tick for counting numbers.',
    render(buf, rng) {
      tick(buf, 0, rng, { f: 2300, partials: [[1, 0.6, 0.004], [0.5, 0.4, 0.006]], body: [520, 0.15, 0.005], click: [0.2, 0.0007, 4000], drop: 0.04, attack: 0.00025 });
      earlyReflections(buf, { seed: 9, taps: 3, maxMs: 6, gain: 0.1, lp: 8000 });
    },
    fadeIn: 0.0002, fadeOut: 0.006,
  },
  {
    name: 'paper', duration: 0.5, hit: 0.05, level: 0.62,
    description: 'Paper / receipt rustle (for "without Goldcom" stress scenes).',
    render(buf, rng) {
      paper(buf, rng);
      earlyReflections(buf, { seed: 10, taps: 6, maxMs: 20, gain: 0.2 });
    },
    fadeOut: 0.03,
  },
  {
    name: 'error-soft', duration: 0.5, hit: 0, level: 0.5,
    description: 'Gentle descending minor-third "not quite" (calm, never alarming).',
    render(buf, rng) {
      marimba(buf, 0.001, mtof(69), { vel: 0.7, decay: 0.42, mallet: 0.35, pan: -0.08, rng });
      marimba(buf, 0.14, mtof(66), { vel: 0.66, decay: 0.36, mallet: 0.3, pan: 0.08, rng });
      filterLow(buf, 3600);
      applyReverb(buf, { decay: 0.6, damping: 6000, predelay: 0.01, seed: 21 }, 0.18);
    },
    fadeOut: 0.08,
  },
];

function filterLow(buf, f) {
  const a = new Biquad('lowpass', f, 0.7), b = new Biquad('lowpass', f, 0.7);
  a.run(buf.L); b.run(buf.R);
}

const BY_NAME = new Map(DEFS.map((d) => [d.name, d]));

/** Public catalogue. `hit` = seconds from file start to the main transient/peak; `level` = mix trim. */
export const SFX_LIBRARY = DEFS.map(({ name, description, duration, hit, level }) => ({ name, description, duration, hit, level }));

/** Render one sound to a stereo Float32 buffer (peak-normalised to -3 dBFS, edges faded). */
export function renderSfx(name) {
  const def = BY_NAME.get(name);
  if (!def) throw new Error(`unknown sfx "${name}"`);
  const buf = stereo(toSamples(def.duration));
  def.render(buf, makeRng(hashSeed(`goldcom-sfx:${name}`)));
  dcBlock(buf);
  fadeEdges(buf, def.fadeIn ?? 0.001, def.fadeOut ?? 0.015);
  for (let i = 0; i < buf.L.length; i++) if (!Number.isFinite(buf.L[i]) || !Number.isFinite(buf.R[i])) throw new Error(`sfx ${name}: non-finite sample at ${i}`);
  return normalizePeak(buf, PEAK_DB);
}

let sharedHash = null;
function cacheKey(def) {
  if (!sharedHash) {
    const h = crypto.createHash('sha1');
    for (const f of ['./dsp.mjs', './instruments.mjs', './synth.mjs']) {
      try { h.update(fs.readFileSync(new URL(f, import.meta.url))); } catch { /* bundled elsewhere */ }
    }
    sharedHash = h.digest('hex');
  }
  return crypto.createHash('sha1').update(`${SFX_VERSION}|${sharedHash}|${def.duration}|${def.fadeIn}|${def.fadeOut}|${def.render.toString()}`).digest('hex').slice(0, 16);
}

/**
 * Render any missing or stale WAVs into dir. Returns { [name]: absolutePath }.
 * Staleness = SFX_VERSION + hash of this module and the shared DSP sources.
 */
export async function ensureSfx(dir) {
  dir = path.resolve(dir);
  await fs.promises.mkdir(dir, { recursive: true });
  const manifestPath = path.join(dir, 'sfx-manifest.json');
  let manifest = {};
  try { manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8')); } catch { /* first run */ }
  const out = {};
  let changed = false;
  for (const def of DEFS) {
    const file = path.join(dir, `${def.name}.wav`);
    const key = cacheKey(def);
    if (manifest[def.name] !== key || !fs.existsSync(file)) {
      await writeWav(file, renderSfx(def.name), { seed: hashSeed(def.name) });
      manifest[def.name] = key;
      changed = true;
    }
    out[def.name] = file;
  }
  if (changed) {
    const tmp = `${manifestPath}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(manifest, null, 2));
    await fs.promises.rename(tmp, manifestPath);
  }
  return out;
}

export const sfxInfo = (name) => SFX_LIBRARY.find((s) => s.name === name) || null;
