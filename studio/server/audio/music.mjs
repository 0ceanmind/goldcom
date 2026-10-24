// Procedural royalty-free music beds for Goldcom reels: seeded, deterministic, 48 kHz stereo.
// Any duration can be rendered with a musical ending (the last chord lands on a downbeat
// and rings out, reaching silence exactly at the end).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import {
  SR, TAU, toSamples, stereo, makeRng, hashSeed, clamp, Reverb, compress, limit, masterLoudness, measureLoudness,
  filterBuf, chorus, fadeOutRegion, fadeEdges, writeWav, saturate, dbToGain, scaleBuf, Biquad, DelayLine,
} from './dsp.mjs';
import { feltPiano, renderPad, bass, kick, clap, hat, rim, pluck, ksPluck, frameDrum, chime } from './instruments.mjs';

/** Bump when shared DSP behaviour changes in a way the source hash would not catch. */
export const MUSIC_VERSION = 1;
const BED_LUFS = -16;
const BED_CEILING = -1.5;
const MIN_RING = 2.4; // seconds the final chord rings before the end

const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

// ---------- shared helpers ----------

/** Bar/beat plan for a duration: where the final chord lands, how many groove bars precede it. */
function makePlan(bpm, duration) {
  const beat = 60 / bpm, bar = beat * 4;
  const finalBar = Math.floor((duration - MIN_RING) / bar + 1e-9);
  const ending = finalBar >= 2;
  return {
    bpm, beat, bar, duration,
    ending,
    finalBar: ending ? finalBar : -1,
    finalTime: ending ? finalBar * bar : null,
    bars: ending ? finalBar : Math.ceil(duration / bar),
  };
}

/** Group consecutive bars that share a chord into segments: [{ t, dur, chord, bar }]. */
function segments(plan, chordAt) {
  const segs = [];
  for (let b = 0; b < plan.bars; b++) {
    const c = chordAt(b);
    const last = segs[segs.length - 1];
    if (last && last.chord === c) last.dur += plan.bar;
    else segs.push({ t: b * plan.bar, dur: plan.bar, chord: c, bar: b });
  }
  return segs;
}

/** Stereo ping-pong delay with low-passed feedback (in place). */
function pingPong(buf, time, { feedback = 0.35, wet = 0.25, lp = 3200 } = {}) {
  const n = buf.L.length, d = toSamples(time);
  const dl = new DelayLine(d + 4), dr = new DelayLine(d + 4);
  const fl = new Biquad('lowpass', lp, 0.7), fr = new Biquad('lowpass', lp, 0.7);
  for (let i = 0; i < n; i++) {
    const yl = dl.readInt(d), yr = dr.readInt(d);
    const inMono = (buf.L[i] + buf.R[i]) * 0.5;
    dl.write(fl.tick(inMono + yr * feedback));
    dr.write(fr.tick(yl * feedback));
    buf.L[i] += yl * wet; buf.R[i] += yr * wet;
  }
  return buf;
}

/** Kick-triggered ducking envelope (fast dip, smooth recovery), 0..1 per sample. */
function duckEnvelope(n, times, { depth = 0.5, attack = 0.008, recover = 0.11 } = {}) {
  const env = new Float32Array(n).fill(1);
  const A = Math.max(1, toSamples(attack)), kr = Math.exp(-1 / (recover * SR));
  for (const t of times) {
    const i0 = toSamples(t), len = A + toSamples(recover * 6);
    let shape = 1;
    for (let k = 0; k < len && i0 + k < n; k++) {
      if (k < A) shape = k / A; else if (k === A) shape = 1; else shape *= kr;
      const g = 1 - depth * shape;
      if (g < env[i0 + k]) env[i0 + k] = g;
    }
  }
  return env;
}

/** Cap a stem's crest factor with a look-ahead limiter relative to its own loudness (plucked transients). */
function tame(buf, { crest = 11, release = 0.06 } = {}) {
  const L = measureLoudness(buf, { peaks: false }).integrated;
  if (Number.isFinite(L)) limit(buf, { ceiling: L + crest, release, lookahead: 0.002 });
  return buf;
}

const applyEnv = (buf, env) => { for (let i = 0; i < buf.L.length; i++) { buf.L[i] *= env[i]; buf.R[i] *= env[i]; } };

// ---------- calm-gold: felt piano, warm pad, sub, brushes (D major, 90 BPM) ----------

function composeCalmGold(plan, n, rng) {
  const { beat, bar, ending, finalBar, finalTime, duration } = plan;
  const CH = [
    { root: 38, pad: [57, 61, 64, 66], piano: [62, 66, 69, 73, 76] }, // Dmaj9
    { root: 35, pad: [57, 61, 62, 66], piano: [59, 62, 66, 69, 73] }, // Bm9
    { root: 43, pad: [59, 62, 66, 69], piano: [55, 59, 62, 66, 71] }, // Gmaj9
    { root: 45, pad: [57, 62, 64, 66], piano: [57, 62, 64, 66, 69] }, // A6sus4
  ];
  const FINAL = { root: 38, pad: [50, 57, 64, 66, 69], piano: [50, 57, 62, 64, 66, 69] }; // Dadd9
  const chordAt = (b) => (ending && b === finalBar - 1 ? CH[3] : CH[Math.floor(b / 2) % 4]);
  const segs = segments(plan, chordAt);
  const segEnd = (t) => { const s = segs.find((g) => t >= g.t - 1e-6 && t < g.t + g.dur); return s ? s.t + s.dur : t + bar; };
  const ring = ending ? duration - finalTime : 0;

  // pad
  const padNotes = [];
  for (const s of segs) for (const m of s.chord.pad) padNotes.push({ t: s.t, dur: s.dur + 0.15, midi: m, vel: 0.62 });
  if (ending) for (const m of FINAL.pad) padNotes.push({ t: finalTime, dur: ring * 0.55, midi: m, vel: 0.62, attack: 0.5, release: ring * 0.5 });
  const pad = renderPad(n, padNotes, {
    rng, voices: 3, detune: 11, attack: 0.9, release: 1.8, sine: 0.35, q: 0.6,
    cutoff: (t) => (650 + 650 * smooth(t / (2 * bar))) * (1 + 0.22 * Math.sin(TAU * t / (8 * bar) - Math.PI / 2)),
  });
  chorus(pad, { rate: 0.27, depth: 0.0035, mix: 0.3 });

  // felt piano: left-hand roots, broken-chord patterns, a pentatonic top line in phrase halves
  const piano = stereo(n);
  const PAT = [
    [[0, 0, 0.75], [2, 2, 0.5], [3, 3, 0.45], [5, 4, 0.5], [6, 2, 0.4]],
    [[0, 1, 0.7], [1, 3, 0.42], [3, 4, 0.5], [4, 2, 0.48], [6, 3, 0.45], [7, 1, 0.35]],
    [[0, 0, 0.72], [3, 2, 0.48], [4, 4, 0.55], [6, 3, 0.45]],
    [[0, 2, 0.7], [2, 4, 0.5], [3, 3, 0.42], [4, 1, 0.5], [6, 4, 0.48], [7, 3, 0.36]],
  ];
  const SPARSE = [[0, 0, 0.6], [4, 2, 0.45]];
  const MEL = [
    [[0, 81, 0.5], [3, 78, 0.42], [4, 76, 0.45], [6, 74, 0.4]],
    [[0, 76, 0.45], [2, 78, 0.42], [4, 81, 0.5]],
    [[0, 83, 0.46], [2, 81, 0.42], [4, 78, 0.45]],
    [[1, 76, 0.4], [3, 78, 0.42], [4, 74, 0.45]],
  ];
  const at8 = (b, pos) => b * bar + pos * beat / 2 + (pos % 2 ? 0.05 * beat : 0);
  for (const s of segs) feltPiano(piano, s.t + 0.003, s.chord.root + 12, { vel: 0.5, dur: s.dur, pan: -0.25, rng });
  for (let b = 0; b < plan.bars; b++) {
    const c = chordAt(b);
    const melodyBar = b >= 4 && b % 8 >= 4 && !(ending && b >= finalBar - 1);
    const pat = b === 0 ? SPARSE : melodyBar ? PAT[2] : PAT[(Math.floor(b / 2) + Math.floor(b / 8)) % PAT.length];
    for (const [pos, idx, v] of pat) {
      const t = at8(b, pos) + (pos ? rng.gauss() * 0.005 : 0);
      feltPiano(piano, t, c.piano[idx], { vel: v * (0.92 + rng.bi() * 0.08), dur: Math.max(beat, segEnd(t) - t), pan: -0.15 + idx * 0.1, rng });
    }
    if (melodyBar) {
      for (const [pos, m, v] of MEL[b % 4]) {
        const t = at8(b, pos) + rng.gauss() * 0.004;
        feltPiano(piano, t, m, { vel: v, dur: beat * 1.6, pan: 0.2, rng, bright: 0.15 });
      }
    }
  }
  if (ending) FINAL.piano.forEach((m, k) => feltPiano(piano, finalTime + k * 0.022, m, { vel: 0.55 + k * 0.025, dur: ring, pan: -0.3 + k * 0.12, rng }));

  // sub bass, soft kick, rim, brushes
  const low = stereo(n), drums = stereo(n);
  for (let b = 1; b < plan.bars; b++) {
    const r = chordAt(b).root;
    bass(low, b * bar, r, { vel: 0.8, dur: beat * 2.4, release: 0.2, tone: 0.12, rng });
    bass(low, b * bar + 2.5 * beat, r, { vel: 0.6, dur: beat * 1.3, release: 0.2, tone: 0.12, rng });
  }
  if (ending) bass(low, finalTime, FINAL.root, { vel: 0.85, dur: ring * 0.6, release: ring * 0.25, tone: 0.1, rng });
  for (let b = 2; b < plan.bars; b++) {
    const breath = b % 8 === 7 || (ending && b === finalBar - 1);
    kick(drums, b * bar, { vel: 0.75, pitch: 52, punch: 45, decay: 0.17, click: 0.03, rng });
    if (!breath) kick(drums, b * bar + 2.5 * beat, { vel: 0.42, pitch: 52, punch: 45, decay: 0.15, click: 0.02, rng });
    if (b >= 4) for (const bt of [1, 3]) rim(drums, b * bar + bt * beat + rng.gauss() * 0.003, { vel: 0.42 + rng.bi() * 0.05, pan: 0.18, rng });
    const hv = [0.5, 0.28, 0.42, 0.28, 0.5, 0.28, 0.42, 0.32];
    for (let k = 0; k < 8; k++) {
      if (breath && k >= 6) break;
      hat(drums, at8(b, k) + rng.gauss() * 0.004, { vel: hv[k] * (0.85 + rng.next() * 0.15), attack: 0.004, decay: 0.05, tone: 7500, pan: -0.28, rng });
    }
    for (const bt of [1, 3]) hat(drums, b * bar + bt * beat - 0.03, { vel: 0.22, attack: 0.04, decay: 0.07, tone: 4800, q: 0.6, pan: -0.1, rng });
  }
  if (ending) kick(drums, finalTime, { vel: 0.6, pitch: 50, punch: 40, decay: 0.2, click: 0.02, rng });

  return [
    // gains calibrated so stems sit at piano 0 / pad -5 / bass -6 / drums -9 LU
    { name: 'pad', buf: pad, gain: 0.046, send: 0.35 },
    { name: 'piano', buf: piano, gain: 1.0, send: 0.3 },
    { name: 'bass', buf: low, gain: 0.08, send: 0 },
    { name: 'drums', buf: drums, gain: 0.158, send: 0.12 },
  ];
}

// ---------- modern-pulse: four-on-the-floor soft kick, clap, pluck arp, ducked pad (A major, 110 BPM) ----------

function composeModernPulse(plan, n, rng) {
  const { beat, bar, ending, finalBar, finalTime, duration } = plan;
  const CH = [
    { root: 38, pad: [57, 61, 64, 66], arp: [62, 66, 69, 73, 76] }, // Dmaj9 (IV)
    { root: 40, pad: [57, 59, 61, 64], arp: [64, 69, 71, 73, 76] }, // E6sus (V)
    { root: 42, pad: [57, 61, 64, 68], arp: [66, 69, 73, 76, 80] }, // F#m9 (vi)
    { root: 37, pad: [56, 59, 61, 64], arp: [61, 64, 68, 71, 73] }, // C#m7 (iii)
  ];
  const FINAL = { root: 45, pad: [57, 61, 64, 71], arp: [69, 73, 76, 81] }; // Aadd9
  const chordAt = (b) => (ending && b === finalBar - 1 ? CH[1] : CH[b % 4]);
  const segs = segments(plan, chordAt);
  const ring = ending ? duration - finalTime : 0;
  const at16 = (b, k) => b * bar + k * beat / 4;

  // kick times drive both the kick track and the ducking
  const kickTimes = [];
  for (let b = 2; b < plan.bars; b++) {
    const last = ending && b === finalBar - 1 ? 2 : b % 8 === 7 ? 3 : 4;
    for (let k = 0; k < last; k++) kickTimes.push(b * bar + k * beat);
  }
  if (ending) kickTimes.push(finalTime);

  // pad: filter opens across each 8-bar phrase
  const padNotes = [];
  for (const s of segs) for (const m of s.chord.pad) padNotes.push({ t: s.t, dur: s.dur, midi: m, vel: 0.6 });
  if (ending) for (const m of FINAL.pad) padNotes.push({ t: finalTime, dur: ring * 0.5, midi: m, vel: 0.62, attack: 0.15, release: ring * 0.5 });
  const pad = renderPad(n, padNotes, {
    rng, voices: 4, detune: 14, attack: 0.22, release: 0.7, width: 0.9, sine: 0.2, q: 0.75,
    cutoff: (t) => 600 + 1500 * ((t / bar) % 8 / 8) ** 1.5 * smooth(t / (2 * bar)),
  });
  chorus(pad, { rate: 0.4, depth: 0.003, mix: 0.35 });
  applyEnv(pad, duckEnvelope(n, kickTimes, { depth: 0.55, recover: 0.12 }));

  // pluck arpeggio (16ths) with dotted-eighth ping-pong
  const arp = stereo(n);
  const ORDER = [0, 1, 2, 4, 3, 2, 1, 2, 0, 1, 2, 4, 3, 4, 2, 1];
  for (let b = 0; b < plan.bars; b++) {
    const c = chordAt(b);
    const lift = b >= 4 && b % 8 >= 4;
    for (let k = 0; k < 16; k++) {
      if (b < 2 && k % 2) continue; // intro: eighths only
      if (ending && b === finalBar - 1 && k >= 14) continue;
      let m = c.arp[ORDER[k]];
      if (lift && ORDER[k] === 4 && k % 4 === 3) m += 12;
      const v = (k % 4 === 0 ? 0.9 : k % 2 === 0 ? 0.7 : 0.55) * (0.95 + rng.bi() * 0.05);
      pluck(arp, at16(b, k), m, { vel: v, decay: 0.15, cutoff: 2400, base: 320, pan: k % 2 ? 0.22 : -0.22, rng });
    }
  }
  if (ending) FINAL.arp.forEach((m, k) => pluck(arp, finalTime + k * 0.03, m, { vel: 0.8, decay: 0.55, cutoff: 2000, base: 280, pan: -0.3 + k * 0.2, rng }));
  pingPong(arp, beat * 0.75, { feedback: 0.36, wet: 0.24, lp: 3000 });

  // offbeat pluck bass, ducked lightly by the kick
  const low = stereo(n);
  for (let b = 2; b < plan.bars; b++) {
    const r = chordAt(b).root;
    for (const k of [1, 3, 5, 7]) bass(low, b * bar + k * beat / 2, r, { vel: 0.75, dur: beat * 0.42, release: 0.06, decay: 0.12, tone: 0.35, drive: 1.8, rng });
  }
  if (ending) bass(low, finalTime, FINAL.root, { vel: 0.7, dur: Math.min(ring * 0.5, 1.6), release: 0.5, decay: 0.6, tone: 0.2, rng });
  applyEnv(low, duckEnvelope(n, kickTimes, { depth: 0.3, recover: 0.08 }));

  // drums
  const drums = stereo(n);
  for (const t of kickTimes) kick(drums, t, { vel: 0.85, pitch: 48, punch: 85, decay: 0.24, click: 0.07, rng });
  for (let b = 4; b < plan.bars; b++) {
    if (ending && b === finalBar - 1) { clap(drums, b * bar + beat, { vel: 0.7, rng }); continue; }
    for (const bt of [1, 3]) clap(drums, b * bar + bt * beat + rng.gauss() * 0.002, { vel: 0.68 + rng.bi() * 0.04, rng });
  }
  for (let b = 2; b < plan.bars; b++) {
    for (const k of [2, 6, 10, 14]) hat(drums, at16(b, k), { vel: 0.5 * (0.9 + rng.next() * 0.1), decay: 0.035, tone: 9000, pan: 0.25, rng });
    if (b >= 6 && !(ending && b === finalBar - 1)) {
      for (let k = 0; k < 16; k++) hat(drums, at16(b, k) + rng.gauss() * 0.003, { vel: [0.3, 0.16, 0.24, 0.16][k % 4], attack: 0.006, decay: 0.022, tone: 6800, q: 0.7, pan: -0.3, rng });
    }
  }
  if (ending) clap(drums, finalTime, { vel: 0.55, rng });

  return [
    // gains calibrated so stems sit at arp 0 / drums -1.5 / pad -4 / bass -5.5 LU
    { name: 'pad', buf: pad, gain: 0.112, send: 0.3 },
    { name: 'arp', buf: arp, gain: 0.5, send: 0.25 },
    { name: 'bass', buf: low, gain: 0.321, send: 0 },
    { name: 'drums', buf: drums, gain: 0.411, send: 0.14 },
  ];
}

// ---------- warm-eid: oud & kanun in D Hijaz over warm pad and soft frame drum (84 BPM) ----------

function composeWarmEid(plan, n, rng) {
  const { beat, bar, ending, finalBar, finalTime, duration } = plan;
  const CH = [
    { root: 38, pad: [54, 57, 62, 66], drone: [50, 57] }, // D
    { root: 43, pad: [55, 58, 62, 67], drone: [55, 62] }, // Gm
    { root: 36, pad: [55, 60, 63, 67], drone: [48, 55] }, // Cm
    { root: 38, pad: [54, 57, 62, 66], drone: [50, 57] }, // D
  ];
  const FINAL = { root: 38, pad: [50, 57, 62, 66, 69] };
  const chordAt = (b) => (ending && b === finalBar - 1 ? CH[2] : CH[Math.floor(b / 2) % 4]);
  const segs = segments(plan, chordAt);
  const ring = ending ? duration - finalTime : 0;
  const stopAt = ending ? finalTime - 0.02 : duration;
  // Hijaz phrases per 2-bar block: [beat, midi, durBeats, vel]
  const PHR = [
    [[0, 62, 1, 0.8], [1, 63, 0.5, 0.6], [1.5, 66, 0.5, 0.65], [2, 67, 1, 0.75], [3, 66, 0.5, 0.6], [3.5, 63, 0.5, 0.55], [4, 62, 2.5, 0.7]],
    [[0, 67, 0.5, 0.75], [0.5, 69, 0.5, 0.6], [1, 70, 1, 0.8], [2, 69, 0.5, 0.6], [2.5, 67, 0.5, 0.55], [3, 66, 1, 0.65], [4, 67, 2.5, 0.7]],
    [[0, 67, 1, 0.7], [1, 63, 0.5, 0.6], [1.5, 66, 0.5, 0.6], [2, 67, 0.5, 0.65], [2.5, 69, 0.5, 0.65], [3, 70, 1, 0.75], [4, 69, 0.75, 0.65], [4.75, 67, 0.25, 0.5], [5, 66, 1, 0.6]],
    [[0, 66, 1, 0.7], [1, 63, 1, 0.65], [2, 62, 4, 0.75]],
  ];

  // pad
  const padNotes = [];
  for (const s of segs) for (const m of s.chord.pad) padNotes.push({ t: s.t, dur: s.dur + 0.2, midi: m, vel: 0.6 });
  if (ending) for (const m of FINAL.pad) padNotes.push({ t: finalTime, dur: ring * 0.55, midi: m, vel: 0.6, attack: 0.45, release: ring * 0.5 });
  const pad = renderPad(n, padNotes, {
    rng, voices: 3, detune: 9, attack: 1.1, release: 2.0, sine: 0.5, q: 0.6,
    cutoff: (t) => (600 + 400 * smooth(t / (2 * bar))) * (1 + 0.2 * Math.sin(TAU * t / (8 * bar))),
  });
  chorus(pad, { rate: 0.22, depth: 0.003, mix: 0.3 });

  // oud melody (even cycles) / kanun answer an octave up (odd cycles) with oud drones
  const oud = stereo(n), kanun = stereo(n);
  for (let blk = 0; blk * 2 < plan.bars; blk++) {
    const t0 = blk * 2 * bar, cycle = Math.floor(blk / 4), phrase = PHR[blk % 4];
    if (cycle % 2 === 0) {
      for (const [bt, m, d, v] of phrase) {
        const t = t0 + bt * beat + (bt ? rng.gauss() * 0.006 : 0);
        if (t < stopAt) ksPluck(oud, t, m, { vel: v * (0.95 + rng.bi() * 0.05), kind: 'oud', decay: clamp(d * beat * 1.6, 0.8, 2.6), pan: 0.12, rng });
      }
    } else {
      for (const [bt, m, d, v] of phrase) {
        const t = t0 + bt * beat + rng.gauss() * 0.004;
        if (t < stopAt) ksPluck(kanun, t, m + 12, { vel: v * 0.75, kind: 'kanun', decay: clamp(d * beat * 2, 1, 3), pan: -0.2, rng });
      }
      const c = chordAt(blk * 2);
      c.drone.forEach((m, k) => { if (t0 + k * 0.03 < stopAt) ksPluck(oud, t0 + k * 0.03, m, { vel: 0.55, kind: 'oud', decay: 2.4, pan: 0.1, rng }); });
    }
    // kanun flourish at the end of each 8-bar cycle, leading back to D
    const fb = blk * 2 + 1;
    if (blk % 4 === 3 && fb < plan.bars && !(ending && fb >= finalBar - 1)) {
      [62, 66, 69, 74].forEach((m, k) => ksPluck(kanun, fb * bar + (3 + k * 0.25) * beat, m, { vel: 0.4 + k * 0.08, kind: 'kanun', pan: -0.25, rng }));
    }
  }
  if (ending) {
    [67, 69, 72].forEach((m, k) => ksPluck(kanun, finalTime - (0.75 - k * 0.25) * beat, m, { vel: 0.45 + k * 0.07, kind: 'kanun', pan: -0.2, rng }));
    ksPluck(kanun, finalTime, 74, { vel: 0.5, kind: 'kanun', decay: 3, pan: -0.2, rng });
    [50, 57, 62].forEach((m, k) => ksPluck(oud, finalTime + k * 0.045, m, { vel: 0.55, kind: 'oud', decay: 3, pan: 0.1, rng }));
  }

  tame(oud); tame(kanun);

  // bells on cycle starts and at the end (celebratory, restrained)
  const bells = stereo(n);
  for (let b = 8; b < plan.bars; b += 8) [74, 78, 81].forEach((m, k) => chime(bells, b * bar + k * 0.045, 440 * 2 ** ((m - 69) / 12), { vel: 0.28, decay: 2.2, tine: 0.4, pan: -0.3 + k * 0.3 }));
  if (ending) [74, 81, 86].forEach((m, k) => chime(bells, finalTime + 0.05 + k * 0.05, 440 * 2 ** ((m - 69) / 12), { vel: 0.26, decay: 2.4, tine: 0.4, pan: -0.3 + k * 0.3 }));

  // bass on the doums
  const low = stereo(n);
  for (let b = 2; b < plan.bars; b++) {
    const r = chordAt(b).root;
    bass(low, b * bar, r, { vel: 0.75, dur: beat * 1.8, release: 0.18, tone: 0.1, rng });
    bass(low, b * bar + 2 * beat, r, { vel: 0.58, dur: beat * 1.8, release: 0.18, tone: 0.1, rng });
  }
  if (ending) bass(low, finalTime, FINAL.root, { vel: 0.8, dur: ring * 0.6, release: ring * 0.25, tone: 0.08, rng });

  // frame drum (maqsum), riq jingles from bar 4, fills into each new cycle
  const drums = stereo(n);
  const MAQSUM = [[0, 'doum', 0.85], [1, 'tek', 0.5], [3, 'tek', 0.55], [4, 'doum', 0.75], [6, 'tek', 0.6]];
  for (let b = 2; b < plan.bars; b++) {
    const lastBeforeEnd = ending && b === finalBar - 1;
    for (const [p, st, v] of MAQSUM) {
      const t = b * bar + p * beat / 2 + (p ? rng.gauss() * 0.004 : 0);
      frameDrum(drums, t, st, { vel: v * (0.92 + rng.bi() * 0.06), pan: st === 'tek' ? 0.2 : 0, rng });
      if (b >= 4 && (p === 3 || p === 6)) frameDrum(drums, t, 'riq', { vel: 0.32, pan: -0.3, rng });
    }
    for (const k of [5, 13]) if (rng.chance(0.55)) frameDrum(drums, b * bar + k * beat / 4, 'tek', { vel: 0.22, pan: 0.2, rng });
    if (b % 8 === 7 || lastBeforeEnd) for (let k = 12; k < 16; k++) frameDrum(drums, b * bar + k * beat / 4, 'tek', { vel: 0.28 + (k - 12) * 0.09, pan: 0.2, rng });
  }
  if (ending) { frameDrum(drums, finalTime, 'doum', { vel: 0.65, rng }); frameDrum(drums, finalTime, 'riq', { vel: 0.3, pan: -0.3, rng }); }

  return [
    // gains calibrated so stems sit at oud 0 / kanun -2.5 / pad -5 / drums -5 / bass -6.5 / bells -8 LU
    { name: 'pad', buf: pad, gain: 0.055, send: 0.4 },
    { name: 'oud', buf: oud, gain: 0.95, send: 0.3 },
    { name: 'kanun', buf: kanun, gain: 1.1, send: 0.38 },
    { name: 'bells', buf: bells, gain: 0.31, send: 0.5 },
    { name: 'bass', buf: low, gain: 0.1, send: 0 },
    { name: 'drums', buf: drums, gain: 0.19, send: 0.18 },
  ];
}

// ---------- library ----------

const BEDS = {
  'calm-gold': {
    bpm: 90, duration: 48, mood: 'calm, premium, trustworthy',
    description: 'Warm pad chords (Dmaj9-Bm9-Gmaj9-A6sus), felt piano, sub bass and soft brushes.',
    compose: composeCalmGold,
    reverb: { decay: 2.4, size: 1.1, damping: 5500, predelay: 0.022, seed: 31 }, revReturn: 0.34,
    eq: [['peak', 260, 0.8, -1.5], ['highshelf', 4000, 0.7, 2]],
  },
  'modern-pulse': {
    bpm: 110, duration: 50, mood: 'modern, confident, product launch',
    description: 'Soft four-on-the-floor kick, clap, pluck arpeggio, sidechained pad (IV-V-vi-iii in A).',
    compose: composeModernPulse,
    reverb: { decay: 1.8, size: 0.9, damping: 7000, predelay: 0.015, seed: 32 }, revReturn: 0.28,
    eq: [['peak', 300, 0.9, -1.5], ['highshelf', 5000, 0.7, 2]],
  },
  'warm-eid': {
    bpm: 84, duration: 50, mood: 'warm, celebratory, restrained',
    description: 'Oud and kanun phrases in D Hijaz over a warm pad, soft frame drum (maqsum) and bells.',
    compose: composeWarmEid,
    reverb: { decay: 2.6, size: 1.15, damping: 5000, predelay: 0.025, seed: 33 }, revReturn: 0.32,
    eq: [['highshelf', 6000, 0.7, 1.5]],
  },
};

export const MUSIC_LIBRARY = Object.entries(BEDS).map(([name, b]) => ({ name, bpm: b.bpm, mood: b.mood, description: b.description, duration: b.duration }));

function bedOf(name) {
  const b = BEDS[name];
  if (!b) throw new Error(`unknown music bed "${name}" (have: ${Object.keys(BEDS).join(', ')})`);
  return b;
}

/**
 * Render a bed to a stereo buffer of exactly `duration` seconds, mastered to -16 LUFS / -1.5 dBTP.
 * Pass `stems: {}` to receive the post-gain stems, `info: {}` for mastering stats.
 */
export function renderMusic(name, { duration, stems = null, info = null } = {}) {
  const bed = bedOf(name);
  duration = Math.max(1, duration ?? bed.duration);
  const n = toSamples(duration);
  const plan = makePlan(bed.bpm, duration);
  const rng = makeRng(hashSeed(`goldcom-music:${name}`));
  const tracks = bed.compose(plan, n, rng);
  const mix = stereo(n), send = stereo(n);
  for (const tr of tracks) {
    const { L, R } = tr.buf;
    for (let i = 0; i < n; i++) {
      const l = L[i] * tr.gain, r = R[i] * tr.gain;
      mix.L[i] += l; mix.R[i] += r;
      send.L[i] += l * tr.send; send.R[i] += r * tr.send;
    }
    if (stems) stems[tr.name] = scaleBuf({ L: Float32Array.from(L), R: Float32Array.from(R) }, tr.gain);
  }
  const wetL = new Float32Array(n), wetR = new Float32Array(n);
  new Reverb(bed.reverb).run(send.L, send.R, wetL, wetR);
  for (let i = 0; i < n; i++) { mix.L[i] += wetL[i] * bed.revReturn; mix.R[i] += wetR[i] * bed.revReturn; }
  filterBuf(mix, 'highpass', 28, 0.7);
  for (const [type, f, q, g] of bed.eq || []) filterBuf(mix, type, f, q, g);
  // glue: pre-level to a known loudness so compressor settings behave the same on every bed
  const pre = measureLoudness(mix, { peaks: false }).integrated;
  if (Number.isFinite(pre)) scaleBuf(mix, dbToGain(-20 - pre));
  const compDb = compress(mix, { threshold: -24, ratio: 1.8, attack: 0.025, release: 0.25, knee: 8 });
  saturate(mix, 1.15, 0.35);
  // ending: last chord rings, then a cosine fade that reaches silence at the end
  if (plan.ending) fadeOutRegion(mix, plan.finalTime + 0.45 * (duration - plan.finalTime), duration);
  else fadeOutRegion(mix, duration - Math.min(1.5, duration * 0.3), duration);
  const m = masterLoudness(mix, { lufs: BED_LUFS, ceiling: BED_CEILING });
  fadeEdges(mix, 0.003, 0.01);
  if (info) Object.assign(info, { compressorDb: compDb, limiterDb: m.limitDb, integrated: m.integrated, truePeak: m.truePeak, plan });
  return mix;
}

let srcHash = null;
function cacheKey(name, duration) {
  if (!srcHash) {
    const h = crypto.createHash('sha1');
    for (const f of ['./dsp.mjs', './instruments.mjs', './music.mjs']) {
      try { h.update(fs.readFileSync(new URL(f, import.meta.url))); } catch { /* bundled elsewhere */ }
    }
    srcHash = h.digest('hex');
  }
  return crypto.createHash('sha1').update(`${MUSIC_VERSION}|${srcHash}|${name}|${Math.round(duration * 1000)}`).digest('hex').slice(0, 16);
}

async function readManifest(file) {
  try { return JSON.parse(await fs.promises.readFile(file, 'utf8')); } catch { return {}; }
}

async function recordManifest(dir, entries) {
  const manifestPath = path.join(dir, 'music-manifest.json');
  const fresh = await readManifest(manifestPath); // re-read: another process may have written meanwhile
  Object.assign(fresh, entries);
  const tmp = `${manifestPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(fresh, null, 2));
  await fs.promises.rename(tmp, manifestPath);
}

/** Where a bed of this duration is cached and whether that file is current. */
async function cacheSlot(name, duration, dir) {
  const bed = bedOf(name);
  const d = duration ?? bed.duration;
  const isDefault = Math.abs(d - bed.duration) < 1e-6;
  const file = path.join(dir, isDefault ? `${name}.wav` : `${name}.${Math.round(d * 1000)}ms.wav`);
  const key = cacheKey(name, d);
  const manifest = await readManifest(path.join(dir, 'music-manifest.json'));
  return { file, key, duration: d, fresh: manifest[path.basename(file)] === key && fs.existsSync(file) };
}

/** Render + write one bed (used directly and by music-worker.mjs). */
export async function writeBed(name, duration, file) {
  await writeWav(file, renderMusic(name, { duration }), { seed: hashSeed(name) });
}

/**
 * Render (or reuse from cache) a bed of a specific duration with a musical ending.
 * Returns the absolute WAV path.
 */
export async function renderMusicFile(name, { duration, dir }) {
  dir = path.resolve(dir);
  await fs.promises.mkdir(dir, { recursive: true });
  const slot = await cacheSlot(name, duration, dir);
  if (!slot.fresh) {
    await writeBed(name, slot.duration, slot.file);
    await recordManifest(dir, { [path.basename(slot.file)]: slot.key });
  }
  return slot.file;
}

function renderInWorker(name, duration, file) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./music-worker.mjs', import.meta.url), { workerData: { name, duration, file } });
    w.once('message', resolve);
    w.once('error', reject);
    w.once('exit', (code) => (code ? reject(new Error(`music worker exited with ${code}`)) : resolve()));
  });
}

/** Render any missing default-length beds into dir (in parallel worker threads). Returns { [name]: absolutePath }. */
export async function ensureMusic(dir) {
  dir = path.resolve(dir);
  await fs.promises.mkdir(dir, { recursive: true });
  const names = Object.keys(BEDS), out = {}, done = {};
  const slots = await Promise.all(names.map((n) => cacheSlot(n, undefined, dir)));
  const todo = slots.map((s, i) => ({ ...s, name: names[i] })).filter((s) => !s.fresh);
  const parallel = Math.max(1, Math.min(todo.length, os.availableParallelism?.() ?? os.cpus().length));
  for (let i = 0; i < todo.length; i += parallel) {
    await Promise.all(todo.slice(i, i + parallel).map(async (s) => {
      try { await renderInWorker(s.name, s.duration, s.file); } catch { await writeBed(s.name, s.duration, s.file); }
      done[path.basename(s.file)] = s.key;
    }));
  }
  if (todo.length) await recordManifest(dir, done);
  names.forEach((n, i) => { out[n] = slots[i].file; });
  return out;
}

/**
 * Beat times (seconds) for a bed rendered at `duration` (+ offset), relative to the reel.
 * every: 1 = every beat, 4 = bar downbeats. Beats are exact; the bed starts on a downbeat.
 */
export function beatGrid(name, duration, { offset = 0, every = 1 } = {}) {
  const { bpm } = bedOf(name);
  const step = 60 / bpm * every, out = [];
  for (let k = Math.ceil(offset / step - 1e-9); k * step - offset < duration - 1e-9; k++) out.push(+(k * step - offset).toFixed(6));
  return out;
}

/** Timing facts for syncing: tempo, beat/bar length and when the final chord lands (reel time). */
export function musicTiming(name, duration, { offset = 0 } = {}) {
  const { bpm } = bedOf(name);
  const plan = makePlan(bpm, duration + offset);
  return { bpm, beat: plan.beat, bar: plan.bar, finalChordAt: plan.ending ? plan.finalTime - offset : null };
}
