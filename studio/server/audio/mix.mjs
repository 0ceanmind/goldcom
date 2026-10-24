// Reel soundtrack mixer: SFX cues over an optional music bed (library or user file), mixed in JS,
// loudness-normalised (BS.1770 integrated, true-peak limited) and encoded with ffmpeg.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FFMPEG, FFPROBE, run } from '../media/ffmpeg.mjs';
import {
  SR, stereo, toSamples, clamp, dbToGain, decodeWav, fromF32le, toF32le, addInto, masterLoudness,
  measureLoudness, fadeEdges, writeWav, limit, scaleBuf,
} from './dsp.mjs';
import { ensureSfx, sfxInfo } from './synth.mjs';
import { MUSIC_LIBRARY, renderMusicFile } from './music.mjs';

const CACHE = fileURLToPath(new URL('../../data/cache/audio/', import.meta.url));
export const DEFAULT_SFX_DIR = path.join(CACHE, 'sfx');
export const DEFAULT_MUSIC_DIR = path.join(CACHE, 'music');
const MAX_TP = -1.0;
// pre-encode true-peak ceiling: lossy codecs overshoot by a few tenths of a dB
const ceilingFor = (out) => (/\.wav$/i.test(out) ? -1.5 : -1.7);

/** Decode any audio file to 48 kHz stereo float. Our own WAVs skip ffmpeg. */
export async function loadAudio(file, { maxSeconds = 0 } = {}) {
  if (/\.wav$/i.test(file)) {
    const w = decodeWav(await fs.promises.readFile(file));
    if (w && w.sampleRate === SR) return w.buf;
  }
  const args = ['-hide_banner', '-loglevel', 'error', '-i', file, '-vn', '-sn', '-dn'];
  if (maxSeconds > 0) args.push('-t', String(maxSeconds));
  args.push('-f', 'f32le', '-acodec', 'pcm_f32le', '-ac', '2', '-ar', String(SR), 'pipe:1');
  const { stdout } = await run(FFMPEG, args);
  return fromF32le(stdout);
}

/** n samples of src starting at `start`, looping with an equal-power crossfade when it runs out. */
function loopBed(src, start, n, xfadeSec = 0.6) {
  const out = stereo(n), len = src.L.length;
  if (!len) return out;
  let pos = start % len, i = 0;
  if (pos + n <= len) {
    out.L.set(src.L.subarray(pos, pos + n)); out.R.set(src.R.subarray(pos, pos + n));
    return out;
  }
  const xf = Math.min(toSamples(xfadeSec), Math.floor(len / 4));
  while (i < n) {
    const plain = Math.max(0, len - pos - xf);
    for (let k = 0; k < plain && i < n; k++, i++, pos++) { out.L[i] = src.L[pos]; out.R[i] = src.R[pos]; }
    const cf = len - pos;
    for (let k = 0; k < cf && i < n; k++, i++) {
      const u = (k + 0.5) / cf, ga = Math.cos(u * Math.PI / 2), gb = Math.sin(u * Math.PI / 2);
      out.L[i] = src.L[pos + k] * ga + src.L[k] * gb;
      out.R[i] = src.R[pos + k] * ga + src.R[k] * gb;
    }
    pos = cf;
  }
  return out;
}

/** Per-sample music gain: level, fade in/out and ducking windows ({ t0, t1, amount 0..1 | db, ramp }). */
function musicEnvelope(n, duration, { gain = 0.6, fadeIn = 0.4, fadeOut = 1.5, duck = [] }) {
  const env = new Float32Array(n);
  const ducks = (Array.isArray(duck) ? duck : []).filter((d) => Number.isFinite(d?.t0) && Number.isFinite(d?.t1)).map((d) => ({
    t0: Math.min(d.t0, d.t1), t1: Math.max(d.t0, d.t1),
    amount: clamp(d.db != null ? 1 - dbToGain(-Math.abs(d.db)) : d.amount ?? 0.5, 0, 1),
    ramp: Math.max(0.01, d.ramp ?? 0.25),
  }));
  const fo0 = duration - fadeOut;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let g = gain;
    if (fadeIn > 0 && t < fadeIn) g *= Math.sin(Math.PI / 2 * t / fadeIn) ** 2;
    if (fadeOut > 0 && t > fo0) g *= Math.cos(Math.PI / 2 * Math.min(1, (t - fo0) / fadeOut)) ** 2;
    let att = 0;
    for (const d of ducks) {
      // fully ducked inside [t0, t1], smooth ramps outside it
      let s = t < d.t0 ? 1 - (d.t0 - t) / d.ramp : t > d.t1 ? 1 - (t - d.t1) / d.ramp : 1;
      if (s <= 0) continue;
      s = 0.5 - 0.5 * Math.cos(Math.PI * s);
      att = Math.max(att, d.amount * s);
    }
    env[i] = g * (1 - att);
  }
  return env;
}

/** Measure a file with ffmpeg's EBU R128 scanner: { integrated, truePeak, lra }. */
export async function measureFile(file) {
  const { stderr } = await run(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-']);
  const sum = stderr.slice(stderr.lastIndexOf('Summary:'));
  const num = (re) => { const m = sum.match(re); return m ? (m[1] === '-inf' ? -Infinity : Number(m[1])) : null; };
  return { integrated: num(/I:\s+(-?[\d.]+|-inf) LUFS/), truePeak: num(/Peak:\s+(-?[\d.]+|-inf) dBFS/), lra: num(/LRA:\s+([\d.]+) LU/) };
}

async function encode(buf, out) {
  await fs.promises.mkdir(path.dirname(out), { recursive: true });
  if (/\.wav$/i.test(out)) return writeWav(out, buf);
  const ext = path.extname(out) || '.m4a';
  const tmp = path.join(path.dirname(out), `.${path.basename(out, ext)}.${process.pid}.${Date.now()}.tmp${ext}`);
  const codec = /\.mp3$/i.test(out) ? ['-c:a', 'libmp3lame', '-b:a', '192k'] : ['-c:a', 'aac', '-b:a', '192k'];
  try {
    await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '2', '-i', 'pipe:0',
      ...codec, '-ar', String(SR), '-movflags', '+faststart', tmp], { input: toF32le(buf) });
    await fs.promises.rename(tmp, out);
  } catch (e) {
    fs.promises.unlink(tmp).catch(() => {});
    throw e;
  }
}

/**
 * Mix a reel soundtrack.
 *  duration  seconds (exact output length)
 *  cues      [{ name, t, gain = 1, pan = 0 }]  library SFX (or a file path in name/path); gain multiplies the
 *            library's per-sound mix level
 *  music     null | 'calm-gold' | { name | path, gain = 0.6, offset = 0, fadeIn = 0.4, fadeOut = 1.5,
 *            duck = [{ t0, t1, amount = 0.5 (fraction removed) | db, ramp = 0.25 }], ending = true }
 *            Library beds are rendered to offset+duration with a musical ending; files are trimmed/looped.
 *  out       .m4a (AAC 192k, 48 kHz stereo) or .wav (16-bit)
 *  lufs      integrated loudness target; true peak is kept at or below -1 dBTP
 * Returns { out, duration, integrated, truePeak, lra, limiterDb (max gain reduction), warnings }.
 */
export async function mixAudio({ duration, cues = [], music = null, out, sfxDir = DEFAULT_SFX_DIR, musicDir = DEFAULT_MUSIC_DIR, lufs = -14 }) {
  if (!(duration > 0) || !Number.isFinite(duration)) throw new Error('mixAudio: duration must be a positive number of seconds');
  if (!out) throw new Error('mixAudio: out path required');
  const n = toSamples(duration), bus = stereo(n), warnings = [];

  // music bed
  if (music) {
    const m = typeof music === 'string' ? { name: music } : music;
    const offset = Math.max(0, m.offset ?? 0);
    let src = null, start = 0;
    if (m.path || (m.name && !MUSIC_LIBRARY.some((x) => x.name === m.name) && fs.existsSync(m.name))) {
      const file = m.path || m.name;
      src = await loadAudio(file, { maxSeconds: offset + duration + 1 });
      start = toSamples(offset);
      if (src.L.length < start + n) warnings.push(`music "${path.basename(file)}" is shorter than offset+duration; looping`);
    } else if (MUSIC_LIBRARY.some((x) => x.name === m.name)) {
      const file = await renderMusicFile(m.name, { duration: m.ending === false ? undefined : offset + duration, dir: musicDir });
      src = await loadAudio(file);
      start = toSamples(offset);
    } else warnings.push(`unknown music "${m.name ?? m.path}" skipped`);
    if (src) {
      const bed = loopBed(src, start, n);
      const env = musicEnvelope(n, duration, { gain: m.gain ?? 0.6, fadeIn: m.fadeIn ?? 0.4, fadeOut: Math.min(m.fadeOut ?? 1.5, duration), duck: m.duck });
      for (let i = 0; i < n; i++) { bus.L[i] += bed.L[i] * env[i]; bus.R[i] += bed.R[i] * env[i]; }
    }
  }

  // sound effects
  if (cues.length) {
    const lib = await ensureSfx(sfxDir);
    const cache = new Map();
    for (const c of cues) {
      if (!c || !Number.isFinite(c.t)) { warnings.push(`cue without a numeric t skipped: ${JSON.stringify(c)}`); continue; }
      const file = lib[c.name] || c.path || (c.name && fs.existsSync(c.name) ? c.name : null);
      if (!file) { warnings.push(`unknown sfx "${c.name}" skipped`); continue; }
      if (!cache.has(file)) cache.set(file, await loadAudio(file));
      const level = lib[c.name] ? sfxInfo(c.name).level : 1;
      addInto(bus, cache.get(file), toSamples(c.t), (c.gain ?? 1) * level, clamp(c.pan ?? 0, -1, 1));
    }
  }

  // master: soft edges (cues cut at the end), loudness target, true-peak ceiling
  fadeEdges(bus, 0.002, 0.02);
  const silent = !Number.isFinite(measureLoudness(bus, { peaks: false }).integrated);
  const ceiling = ceilingFor(out);
  const master = silent ? { limitDb: 0 } : masterLoudness(bus, { lufs, ceiling });
  await encode(bus, out);

  // verify the encoded file; correct once if the codec pushed it off target
  let meas = silent ? { integrated: -Infinity, truePeak: -Infinity, lra: 0 } : await measureFile(out);
  if (!silent && (meas.truePeak > MAX_TP || Math.abs(meas.integrated - lufs) > 0.5)) {
    scaleBuf(bus, dbToGain(lufs - meas.integrated));
    limit(bus, { ceiling: ceiling - Math.max(0, meas.truePeak - MAX_TP) - 0.3 });
    await encode(bus, out);
    meas = await measureFile(out);
  }
  return { out: path.resolve(out), duration, integrated: meas.integrated, truePeak: meas.truePeak, lra: meas.lra, limiterDb: +master.limitDb.toFixed(2), warnings };
}

/** Put an audio track on a video: video stream copied, audio AAC (copied when already AAC), faststart. */
export async function muxAudio({ video, audio, out }) {
  let codec = '';
  try {
    const { stdout } = await run(FFPROBE, ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', audio]);
    codec = stdout.toString().trim();
  } catch { /* let ffmpeg decide */ }
  const aac = codec === 'aac' && !/\.(wav|mp3)$/i.test(audio);
  await fs.promises.mkdir(path.dirname(path.resolve(out)), { recursive: true });
  await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-i', audio,
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', ...(aac ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '192k', '-ar', String(SR)]),
    '-shortest', '-movflags', '+faststart', out]);
  return path.resolve(out);
}
