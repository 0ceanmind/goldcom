// Instrument voices shared by the SFX library and the music beds. Each voice adds itself
// into a stereo buffer at time t (seconds); randomness always comes from a passed seeded rng.
import { SR, TAU, mtof, clamp, toSamples, panGains, stereo, Saw, SVF, OnePole, Biquad, DelayLine, makeRng, pinkNoise, ftanh } from './dsp.mjs';

const DEFAULT_RNG = makeRng(99);

/** Add a mono render into out at sample i0 with equal-power pan (clips to buffer). */
export function writeMono(out, i0, mono, pan = 0, gain = 1) {
  const [gl, gr] = panGains(pan);
  const n = out.L.length, j0 = Math.max(0, -i0), j1 = Math.min(mono.length, n - i0);
  for (let j = j0; j < j1; j++) { const v = mono[j] * gain; out.L[i0 + j] += v * gl; out.R[i0 + j] += v * gr; }
}

const attackCurve = (k, a) => (k >= a ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * k / a));

/**
 * Felt piano: additive stiff-string partials (inharmonicity, hammer-position comb,
 * per-partial two-stage decay, unison beating), velocity-dependent felt low-pass and thump.
 */
export function feltPiano(out, t, midi, { vel = 0.7, dur = 1.5, pan = 0, gain = 1, bright = 0, rng = DEFAULT_RNG } = {}) {
  const f0 = mtof(midi);
  const tau0 = clamp(2.6 * (220 / f0) ** 0.6, 0.6, 6);
  const relTau = 0.09;
  const len = toSamples(Math.min(dur + relTau * 7, tau0 * 4) + 0.01);
  if (len <= 0) return;
  const mono = new Float64Array(len);
  const B = 0.00011 * (f0 / 130) ** 1.1;
  const cutoff = (520 + 2400 * vel * vel) * (1 + bright);
  const tilt = 1.3 - 0.45 * vel;
  for (let p = 1; p <= 18; p++) {
    const fp = p * f0 * Math.sqrt(1 + B * p * p);
    if (fp > 11000) break;
    const amp = p ** -tilt / (1 + (fp / cutoff) ** 2) * (0.3 + 0.7 * Math.abs(Math.sin(Math.PI * p * 0.118)));
    const detune = 0.6 + rng.next() * 0.3; // drawn for every partial so the rng stream stays stable
    if (amp < 1.5e-3) continue; // below ~-56 dB: inaudible under the felt
    const ts = tau0 / (1 + 0.3 * (p - 1)) / (1 + fp / 5000), tf = ts * 0.2;
    // unequal unison weights: gentle beating that never fully cancels
    const strings = p <= 3 ? [[-0.4, 0.62], [detune * 0.8, 0.38]] : [[0, 1]];
    for (const [cents, w] of strings) {
      const wv = TAU * fp * 2 ** (cents / 1200) / SR, c2 = 2 * Math.cos(wv);
      let s1 = Math.sin(-wv), s2 = Math.sin(-2 * wv);
      const kf = Math.exp(-1 / (tf * SR)), ks = Math.exp(-1 / (ts * SR));
      let ef = 0.55 * amp * w, es = 0.45 * amp * w;
      for (let i = 0; i < len; i++) {
        const y = c2 * s1 - s2; s2 = s1; s1 = y;
        mono[i] += y * (ef + es);
        ef *= kf; es *= ks;
        if ((i & 255) === 0 && ef + es < 2e-5) break;
      }
    }
  }
  // felt hammer thump: short low-passed noise
  const lp = new OnePole(clamp(180 + f0 * 1.5, 200, 1400));
  const thumpN = toSamples(0.03), kt = Math.exp(-1 / (0.006 * SR));
  let et = 0.05 * vel;
  for (let i = 0; i < Math.min(thumpN, len); i++) { mono[i] += lp.lp(rng.bi()) * et; et *= kt; }
  // envelope: soft felt onset, damper release
  const att = toSamples(0.0015 + 0.005 * (1 - vel)), rel = toSamples(dur), kr = Math.exp(-1 / (relTau * SR));
  let g = 1;
  for (let i = 0; i < len; i++) {
    if (i >= rel) g *= kr;
    mono[i] *= attackCurve(i, att) * g;
  }
  writeMono(out, toSamples(t), mono, pan, gain * 0.32 * vel ** 1.4);
}

/**
 * Paraphonic analogue-style pad bus: detuned PolyBLEP saws (+ optional sine body) per note,
 * slow drift, stereo-spread voices, then one modulated state-variable low-pass.
 * notes: [{ t, dur, midi, vel }]. Returns a new stereo buffer of n samples.
 */
export function renderPad(n, notes, { voices = 3, detune = 10, attack = 0.9, release = 1.8, cutoff = () => 1500, q = 0.65, width = 0.75, sine = 0, gain = 1, rng = DEFAULT_RNG } = {}) {
  const bus = stereo(n);
  for (const nt of notes) {
    const i0 = toSamples(nt.t), f = mtof(nt.midi), A = toSamples(nt.attack ?? attack), rel = toSamples(nt.dur);
    const kr = Math.exp(-1 / ((nt.release ?? release) / 4.6 * SR));
    const end = Math.min(n, i0 + rel + toSamples((nt.release ?? release) * 1.1));
    const amp = (nt.vel ?? 0.7) * gain / Math.sqrt(voices);
    const att = new Float32Array(A);
    for (let k = 0; k < A; k++) att[k] = 0.5 - 0.5 * Math.cos(Math.PI * k / A);
    // all detuned voices of the note in one pass (one read-modify-write per sample)
    const V = voices, fv = new Float64Array(V), p = new Float64Array(V), dt = new Float64Array(V);
    const gl = new Float64Array(V), gr = new Float64Array(V), drR = new Float64Array(V), drP = new Float64Array(V);
    for (let v = 0; v < V; v++) {
      const x = V === 1 ? 0 : v / (V - 1) * 2 - 1;
      fv[v] = f * 2 ** (x * detune / 1200);
      [gl[v], gr[v]] = panGains(x * width);
      drR[v] = rng.range(0.07, 0.23); drP[v] = rng.next() * TAU;
      p[v] = rng.next(); dt[v] = fv[v] / SR;
    }
    let rg = 1;
    for (let i = Math.max(0, i0); i < end; i++) {
      const k = i - i0;
      if ((k & 63) === 0) for (let v = 0; v < V; v++) dt[v] = fv[v] * (1 + 0.0012 * Math.sin(drP[v] + TAU * drR[v] * k / SR)) / SR;
      let sl = 0, sr = 0;
      for (let v = 0; v < V; v++) {
        const pv = p[v], d = dt[v];
        let y = 2 * pv - 1; // inline PolyBLEP saw
        if (pv < d) { const u = pv / d; y -= u + u - u * u - 1; } else if (pv > 1 - d) { const u = (pv - 1) / d; y -= u * u + u + u + 1; }
        p[v] = pv + d >= 1 ? pv + d - 1 : pv + d;
        sl += y * gl[v]; sr += y * gr[v];
      }
      if (k > rel) rg *= kr;
      const e = amp * (k < A ? att[k] : 1) * rg;
      bus.L[i] += sl * e; bus.R[i] += sr * e;
    }
    if (sine > 0) { // sine body via a recursive oscillator
      const w = TAU * f / SR, c2 = 2 * Math.cos(w);
      let s1 = Math.sin(-w), s2 = Math.sin(-2 * w), rs = 1;
      const st = Math.max(0, i0);
      if (st > i0) { s1 = Math.sin(w * (st - i0 - 1)); s2 = Math.sin(w * (st - i0 - 2)); }
      for (let i = st; i < end; i++) {
        const k = i - i0;
        const y = c2 * s1 - s2; s2 = s1; s1 = y;
        if (k > rel) rs *= kr;
        const sv = y * amp * sine * (k < A ? att[k] : 1) * rs;
        bus.L[i] += sv; bus.R[i] += sv;
      }
    }
  }
  const fl = new SVF(), fr = new SVF();
  for (let i = 0; i < n; i++) {
    if ((i & 31) === 0) { const c = cutoff(i / SR); fl.set(c, q); fr.set(c, q); }
    bus.L[i] = fl.tick(bus.L[i]); bus.R[i] = fr.tick(bus.R[i]);
  }
  return bus;
}

/** Sub / pluck bass: sine + soft 2nd harmonic, gentle saturation, optional decay and saw tone. */
export function bass(out, t, midi, { vel = 0.8, dur = 1, gain = 1, attack = 0.012, release = 0.16, decay = 0, tone = 0, drive = 1.6, rng = DEFAULT_RNG } = {}) {
  const f = mtof(midi), len = toSamples(dur + release * 5);
  const mono = new Float64Array(len);
  const w = TAU * f / SR, A = toSamples(attack), rel = toSamples(dur);
  const kr = Math.exp(-1 / (release * SR)), kd = decay > 0 ? Math.exp(-1 / (decay * SR)) : 1;
  const saw = new Saw(f, rng.next() * 0.1), lp = new SVF(Math.min(900, f * 6), 0.7);
  let rg = 1, dg = 1;
  for (let i = 0; i < len; i++) {
    if (i > rel) rg *= kr;
    dg = dg * kd;
    const env = attackCurve(i, A) * rg * (decay > 0 ? 0.35 + 0.65 * dg : 1);
    const ph = w * i;
    let s = Math.sin(ph) + 0.22 * Math.sin(2 * ph + 0.3);
    if (tone > 0) s += tone * lp.tick(saw.tick()) * (0.3 + 0.7 * dg);
    mono[i] = ftanh(s * drive * env) / drive;
  }
  writeMono(out, toSamples(t), mono, 0, gain * vel);
}

/** Soft kick: sine with pitch envelope, gentle click, slight saturation. */
export function kick(out, t, { vel = 0.8, gain = 1, pitch = 50, punch = 85, decay = 0.26, click = 0.1, rng = DEFAULT_RNG } = {}) {
  const len = toSamples(decay * 4.6), clickLen = toSamples(0.012);
  const mono = new Float64Array(len);
  const lp = new OnePole(3500);
  const k1 = Math.exp(-1 / (0.03 * SR)), k2 = Math.exp(-1 / (0.004 * SR)), ka = Math.exp(-1 / (0.0007 * SR));
  const kd = Math.exp(-1 / (decay * SR)), kc = Math.exp(-1 / (0.0018 * SR));
  let e1 = 1, e2 = 1, ea = 1, ed = 1, ec = 1, ph = 0;
  for (let i = 0; i < len; i++) {
    ph += TAU * (pitch + punch * e1 + 120 * e2) / SR;
    const cl = i < clickLen ? click * lp.lp(rng.bi()) * ec : 0;
    mono[i] = ftanh((Math.sin(ph) * (1 - ea) * ed + cl) * 1.3) / 1.3;
    e1 *= k1; e2 *= k2; ea *= ka; ed *= kd; ec *= kc;
  }
  for (let i = 0; i < 480 && i < len; i++) mono[len - 1 - i] *= i / 480;
  writeMono(out, toSamples(t), mono, 0, gain * vel);
}

/** Clap: four quick band-passed noise bursts with a short diffuse tail, slightly wide. */
export function clap(out, t, { vel = 0.8, gain = 1, pan = 0, rng = DEFAULT_RNG } = {}) {
  const len = toSamples(0.35);
  const buf = stereo(len);
  const offs = [0, 0.0085, 0.0175, 0.027];
  for (let ch = 0; ch < 2; ch++) {
    const bp = new Biquad('bandpass', 1150, 0.9), hp = new Biquad('highpass', 450, 0.7);
    const arr = ch ? buf.R : buf.L;
    for (let i = 0; i < len; i++) {
      const s = i / SR;
      let env = 0;
      for (let k = 0; k < 4; k++) {
        const d = s - offs[k];
        if (d >= 0) env += k < 3 ? Math.exp(-d / 0.0032) : 0.8 * Math.exp(-d / 0.065);
      }
      arr[i] = hp.tick(bp.tick(rng.bi() * env));
    }
  }
  const [gl, gr] = panGains(pan);
  const i0 = toSamples(t), n = out.L.length;
  for (let i = 0; i < len && i0 + i < n; i++) { out.L[i0 + i] += buf.L[i] * gain * vel * gl * 1.6; out.R[i0 + i] += buf.R[i] * gain * vel * gr * 1.6; }
}

/** Hat / brush / shaker: filtered noise with adjustable onset and decay. */
export function hat(out, t, { vel = 0.6, gain = 1, pan = 0, decay = 0.045, tone = 8500, attack = 0.0006, q = 0.8, rng = DEFAULT_RNG } = {}) {
  const len = toSamples(attack + decay * 6);
  const mono = new Float64Array(len);
  const hp = new Biquad('highpass', tone * 0.6, 0.7), bp = new Biquad('bandpass', tone, q);
  const A = toSamples(attack), kd = Math.exp(-1 / (decay * SR));
  let e = 1;
  for (let i = 0; i < len; i++) {
    if (i >= A) e *= kd;
    mono[i] = bp.tick(hp.tick(rng.bi())) * attackCurve(i, A) * e;
  }
  writeMono(out, toSamples(t), mono, pan, gain * vel * 1.4);
}

/** Soft cross-stick / rim: two short tones plus a band-passed click. */
export function rim(out, t, { vel = 0.6, gain = 1, pan = 0, rng = DEFAULT_RNG } = {}) {
  const len = toSamples(0.08);
  const mono = new Float64Array(len);
  const bp = new Biquad('bandpass', 3000, 1.2);
  for (let i = 0; i < len; i++) {
    const s = i / SR;
    mono[i] = 0.55 * Math.sin(TAU * 1650 * s) * Math.exp(-s / 0.007) + 0.4 * Math.sin(TAU * 520 * s) * Math.exp(-s / 0.012)
      + 0.7 * bp.tick(rng.bi()) * Math.exp(-s / 0.0025);
    mono[i] *= attackCurve(i, 12);
  }
  writeMono(out, toSamples(t), mono, pan, gain * vel);
}

/** Synth pluck: two detuned saws through a state-variable low-pass with a filter envelope. */
export function pluck(out, t, midi, { vel = 0.8, gain = 1, pan = 0, decay = 0.22, cutoff = 2800, base = 260, detune = 4.5, q = 0.9, rng = DEFAULT_RNG } = {}) {
  const f = mtof(midi), len = toSamples(decay * 6 + 0.01);
  const mono = new Float64Array(len);
  const a = new Saw(f * 2 ** (-detune / 1200), rng.next()), b = new Saw(f * 2 ** (detune / 1200), rng.next());
  const flt = new SVF(base + cutoff, q);
  const kd = Math.exp(-1 / (decay * SR)), kf = Math.exp(-1 / (0.075 * SR)), A = toSamples(0.002);
  let e = 1, fe = 1;
  for (let i = 0; i < len; i++) {
    if ((i & 15) === 0) flt.set(base + cutoff * vel * fe, q);
    e *= kd; fe *= kf;
    mono[i] = flt.tick(a.tick() * 0.58 + b.tick() * 0.42) * e * attackCurve(i, A);
  }
  writeMono(out, toSamples(t), mono, pan, gain * vel);
}

/**
 * Karplus–Strong plucked string with paired courses and a resonant body EQ.
 * kind 'oud' (warm, woody) or 'kanun' (brighter, triple course, longer ring).
 */
export function ksPluck(out, t, midi, { vel = 0.7, gain = 1, pan = 0, kind = 'oud', decay = null, rng = DEFAULT_RNG } = {}) {
  const f = mtof(midi);
  const kanun = kind === 'kanun';
  const T60 = decay ?? (kanun ? 2.6 : 1.7) * clamp((300 / f) ** 0.35, 0.6, 1.5);
  const len = toSamples(T60 + 0.05);
  const mono = new Float64Array(len);
  const courses = kanun ? [[-1.8, 0.4], [0, 0.33], [2, 0.27]] : [[-1.4, 0.58], [1.6, 0.42]];
  const bright = kanun ? 0.85 : 0.55;
  for (const [cents, w] of courses) {
    const fc = f * 2 ** ((cents + rng.bi() * 0.6) / 1200);
    const N = SR / fc - 0.5;
    const dl = new DelayLine(Math.ceil(N) + 8);
    const g = 10 ** (-3 / (T60 * fc));
    // excitation: one period of low-passed noise with pluck-position comb
    const exN = Math.max(8, Math.round(N));
    const ex = new Float64Array(exN);
    const elp = new OnePole(800 + 7000 * bright * vel);
    for (let i = 0; i < exN; i++) ex[i] = elp.lp(rng.bi());
    const pp = Math.round(exN * (kanun ? 0.12 : 0.2));
    for (let i = exN - 1; i >= pp; i--) ex[i] -= ex[i - pp];
    for (let i = 0; i < len; i++) {
      const y = (i < exN ? ex[i] : 0) + g * 0.5 * (dl.read(N) + dl.read(N + 1));
      dl.write(y);
      mono[i] += y * w;
    }
  }
  // body resonances and gentle top roll-off
  const eq = kanun
    ? [new Biquad('peak', 240, 1.2, 2), new Biquad('peak', 2400, 1.5, 2.5), new Biquad('lowpass', 9000, 0.7)]
    : [new Biquad('peak', 150, 1.3, 4.5), new Biquad('peak', 420, 1.6, 2), new Biquad('peak', 1350, 2, 2.5), new Biquad('lowpass', 5200, 0.7)];
  const hp = new Biquad('highpass', 70, 0.7);
  // plectrum noise
  const pk = new OnePole(3000);
  const pN = toSamples(0.006);
  for (let i = 0; i < len; i++) {
    let v = mono[i] + (i < pN ? 0.08 * vel * (rng.bi() - pk.lp(rng.bi())) * (1 - i / pN) : 0);
    for (const b of eq) v = b.tick(v);
    mono[i] = hp.tick(v) * attackCurve(i, 24);
  }
  for (let i = 0; i < 480 && i < len; i++) mono[len - 1 - i] *= i / 480;
  writeMono(out, toSamples(t), mono, pan, gain * vel * 1.1);
}

/** Frame-drum strokes: 'doum' (deep centre) and 'tek' (rim), plus 'riq' jingles. */
export function frameDrum(out, t, stroke = 'doum', { vel = 0.7, gain = 1, pan = 0, rng = DEFAULT_RNG } = {}) {
  const len = toSamples(stroke === 'doum' ? 0.6 : stroke === 'riq' ? 0.3 : 0.12);
  const mono = new Float64Array(len);
  if (stroke === 'doum') {
    const lp = new OnePole(350);
    let ph1 = 0, ph2 = 0;
    for (let i = 0; i < len; i++) {
      const s = i / SR;
      const f = 78 + 34 * Math.exp(-s / 0.035);
      ph1 += TAU * f / SR; ph2 += TAU * f * 1.59 / SR;
      mono[i] = Math.sin(ph1) * Math.exp(-s / 0.2) + 0.3 * Math.sin(ph2) * Math.exp(-s / 0.07)
        + 0.35 * lp.lp(rng.bi()) * Math.exp(-s / 0.012);
      mono[i] *= attackCurve(i, 48);
    }
  } else if (stroke === 'tek') {
    const bp = new Biquad('bandpass', 2300, 1.3);
    for (let i = 0; i < len; i++) {
      const s = i / SR;
      mono[i] = 0.9 * bp.tick(rng.bi()) * Math.exp(-s / 0.011) + 0.3 * Math.sin(TAU * 720 * s) * Math.exp(-s / 0.018)
        + 0.15 * Math.sin(TAU * 1180 * s) * Math.exp(-s / 0.01);
      mono[i] *= attackCurve(i, 16);
    }
  } else {
    const bands = [5600, 7300, 9400, 11800].map((fq) => new Biquad('bandpass', fq * (1 + rng.bi() * 0.02), 9));
    const shake = 0.012 + rng.next() * 0.01;
    for (let i = 0; i < len; i++) {
      const s = i / SR;
      const n = rng.bi() * (Math.exp(-s / 0.004) + 0.5 * Math.exp(-Math.abs(s - shake) / 0.005));
      let v = 0;
      for (const b of bands) v += b.tick(n);
      mono[i] = v * 1.4 * Math.exp(-s / 0.07) * attackCurve(i, 24);
    }
  }
  writeMono(out, toSamples(t), mono, pan, gain * vel);
}

/**
 * Refined chime: FM tine (ratio 1) that settles into a pure tone, a soft octave partial
 * and a brief inharmonic strike partial. decay ≈ T60 in seconds.
 */
export function chime(out, t, freq, { vel = 0.8, gain = 1, pan = 0, decay = 1.2, tine = 0.9, octave = 0.16, strike = 0.18, strikeRatio = 2.76, attack = 0.0015 } = {}) {
  const len = toSamples(decay * 1.05 + 0.02);
  const mono = new Float64Array(len);
  const tau = decay / 6.9, A = toSamples(attack);
  const w = TAU * freq / SR;
  for (let i = 0; i < len; i++) {
    const s = i / SR, ph = w * i;
    const idx = tine * vel * Math.exp(-s / 0.06);
    const body = Math.sin(ph + idx * Math.sin(ph));
    const env = 0.72 * Math.exp(-s / tau) + 0.28 * Math.exp(-s / (tau * 0.22));
    mono[i] = attackCurve(i, A) * (env * body
      + octave * Math.sin(2 * ph + 0.5) * Math.exp(-s / (tau * 0.35))
      + strike * Math.sin(strikeRatio * ph) * Math.exp(-s / 0.035));
  }
  for (let i = 0; i < 240 && i < len; i++) mono[len - 1 - i] *= i / 240;
  writeMono(out, toSamples(t), mono, pan, gain * vel * 0.6);
}

/** Soft marimba-like mallet tone (partials near 1 : 3.9 : 9.2) with felt mallet noise. */
export function marimba(out, t, freq, { vel = 0.7, gain = 1, pan = 0, decay = 0.6, mallet = 0.5, rng = DEFAULT_RNG } = {}) {
  const len = toSamples(decay + 0.02);
  const mono = new Float64Array(len);
  const tau = decay / 6.9, w = TAU * freq / SR, A = toSamples(0.0025);
  const lp = new OnePole(1400);
  for (let i = 0; i < len; i++) {
    const s = i / SR;
    mono[i] = attackCurve(i, A) * (
      Math.sin(w * i) * Math.exp(-s / tau)
      + 0.3 * mallet * Math.sin(3.93 * w * i) * Math.exp(-s / (tau * 0.22))
      + 0.08 * mallet * Math.sin(9.2 * w * i) * Math.exp(-s / (tau * 0.06))
      + 0.12 * mallet * lp.lp(rng.bi()) * Math.exp(-s / 0.004));
  }
  for (let i = 0; i < 240 && i < len; i++) mono[len - 1 - i] *= i / 240;
  writeMono(out, toSamples(t), mono, pan, gain * vel * 0.6);
}

/** A single glint grain: fast-attack sine with a faint inharmonic sparkle partial. */
export function glint(out, t, freq, { vel = 0.5, gain = 1, pan = 0, decay = 0.07, attack = 0.003 } = {}) {
  const len = toSamples(attack + decay * 6);
  const mono = new Float64Array(len);
  const w = TAU * freq / SR, A = toSamples(attack), kd = Math.exp(-1 / (decay * SR)), k2 = Math.exp(-1 / (decay * 0.4 * SR));
  let e = 1, e2 = 1;
  for (let i = 0; i < len; i++) {
    if (i >= A) { e *= kd; e2 *= k2; }
    mono[i] = attackCurve(i, A) * (Math.sin(w * i) * e + 0.22 * Math.sin(2.76 * w * i + 1) * e2);
  }
  writeMono(out, toSamples(t), mono, pan, gain * vel);
}

/** Granular gold sparkle cloud between t0 and t1 over a set of frequencies. */
export function sparkle(out, t0, t1, { rng = DEFAULT_RNG, count = 40, freqs = [2349, 2960, 3520, 4699, 5920, 7040], gain = 1, width = 0.8, density = (u) => Math.sin(Math.PI * u) } = {}) {
  let placed = 0, guard = 0;
  while (placed < count && guard++ < count * 50) {
    const u = rng.next();
    if (rng.next() > density(u)) continue;
    const f = rng.pick(freqs) * 2 ** (rng.bi() * 0.012);
    glint(out, t0 + u * (t1 - t0), f, { vel: rng.range(0.25, 1) * (0.6 + 0.4 * density(u)), gain, pan: rng.bi() * width, decay: rng.range(0.025, 0.11), attack: rng.range(0.0015, 0.006) });
    placed++;
  }
}

/** Correlated stereo pink noise source pair: corr 0..1 (1 = mono). */
export function stereoNoise(rng, corr = 0.6) {
  const c = pinkNoise(rng), l = pinkNoise(rng), r = pinkNoise(rng);
  const a = Math.sqrt(corr), b = Math.sqrt(1 - corr), out = new Float64Array(2);
  return () => { const m = c(); out[0] = a * m + b * l(); out[1] = a * m + b * r(); return out; };
}
