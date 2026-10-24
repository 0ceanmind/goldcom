// Soundtrack for an exported video: sound effects placed automatically from the design (transitions, taps,
// notifications, success moments, logo reveals) plus explicit cues and an optional music bed.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../store.mjs';
import { transitionDurOf } from './timing.mjs';

const SFX_DIR = path.join(DATA_DIR, 'cache', 'sfx');
const MUSIC_DIR = path.join(DATA_DIR, 'cache', 'music');
export const USER_MUSIC_DIR = path.join(DATA_DIR, 'music');

const TRANSITION_SFX = { whip: 'whoosh-fast', push: 'whoosh-soft', slide: 'whoosh-soft', 'zoom-through': 'whoosh-soft', zoom: 'whoosh-soft', facet: 'whoosh-soft', wipe: 'whoosh-soft', blur: null, fade: null, 'scale-fade': null, none: null, cut: null };

/** Cue list for one slide starting at `t0` (seconds). */
function slideCues(slide, t0, { first }) {
  const cues = [];
  if (!first) {
    const sfx = TRANSITION_SFX[slide.transition || 'fade'];
    if (sfx) cues.push({ name: sfx, t: Math.max(0, t0 - transitionDurOf(slide) * 0.35), gain: 0.55 });
  }
  for (const l of slide.layers || []) {
    if (l.hidden) continue;
    const at = t0 + (l.anim?.delay || 0);
    for (const tap of l.taps || []) cues.push({ name: 'tap', t: t0 + tap.t, gain: 0.8 });
    if (l.type === 'notification') cues.push({ name: 'notification', t: at + 0.15, gain: 0.55 });
    if (l.anim?.in === 'gleam' || l.sfx === 'success') cues.push({ name: 'success', t: at + 0.2, gain: 0.6 });
    if (l.type === 'sticker' || l.anim?.in === 'pop') cues.push({ name: 'pop', t: at + 0.05, gain: 0.45 });
    if (l.type === 'sparkles') cues.push({ name: 'shimmer', t: at, gain: 0.35 });
    if (l.anim?.in === 'count') cues.push({ name: 'riser-short', t: at, gain: 0.3 });
    if (l.type === 'chat' && l.anim?.in === 'type') cues.push({ name: 'typing', t: at, gain: 0.3 });
  }
  if (slide.template === 'logo-sting' || slide.template === 'outro') cues.push({ name: 'logo-sting', t: t0 + 0.1, gain: 0.8 });
  for (const c of slide.sfx || []) if (c?.name) cues.push({ name: c.name, t: t0 + (Number(c.t) || 0), gain: c.gain ?? 0.7 });
  return cues;
}

export function buildCues(doc, { mode = 'sequence', index = 0 } = {}) {
  if (mode === 'slide') return slideCues(doc.slides[index], 0, { first: true });
  const cues = [];
  let t = 0;
  doc.slides.forEach((s, i) => { cues.push(...slideCues(s, t, { first: i === 0 })); t += Number(s.duration) || 4; });
  for (const c of doc.audio?.cues || []) if (c?.name) cues.push({ name: c.name, t: Number(c.t) || 0, gain: c.gain ?? 0.7 });
  // Avoid machine-gun repeats: drop identical cues closer than 120 ms.
  cues.sort((a, b) => a.t - b.t);
  return cues.filter((c, i) => !cues.slice(Math.max(0, i - 4), i).some((d) => d.name === c.name && c.t - d.t < 0.12));
}

/** Mix and mux the soundtrack into `out`. Returns false when the audio engine is unavailable. */
export async function soundtrackFor(doc, { mode = 'sequence', index = 0, video, out }) {
  let mix;
  try { mix = await import('../audio/mix.mjs'); } catch { return false; }
  const { probe } = await import('../media/ffmpeg.mjs');
  const duration = (await probe(video)).duration;
  const audio = doc.audio || {};
  const cues = audio.sfx === false ? [] : buildCues(doc, { mode, index });
  let music = null;
  const bed = audio.music && audio.music !== 'none' ? audio.music : null;
  if (bed) {
    const userFile = path.join(USER_MUSIC_DIR, path.basename(bed));
    music = fs.existsSync(userFile) ? { path: userFile } : { name: bed };
    music.gain = audio.musicGain ?? 0.55;
    music.fadeOut = Math.min(2, duration / 4);
  }
  if (!cues.length && !music) return false;
  const tmp = `${out}.audio.m4a`;
  await mix.mixAudio({ duration, cues, music, out: tmp, sfxDir: SFX_DIR, musicDir: MUSIC_DIR, lufs: audio.lufs ?? -14 });
  await mix.muxAudio({ video, audio: tmp, out });
  fs.rmSync(tmp, { force: true });
  return true;
}
