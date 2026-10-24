// Audio module demo: renders the SFX + music library into data/cache/audio-demo/ and mixes a
// 20-second demo reel soundtrack (calm-gold + cues) to demo.m4a, then reports its loudness.
//   node scripts/audio-demo.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureSfx, SFX_LIBRARY } from '../server/audio/synth.mjs';
import { ensureMusic, MUSIC_LIBRARY, beatGrid, musicTiming } from '../server/audio/music.mjs';
import { mixAudio } from '../server/audio/mix.mjs';
import { run, FFMPEG } from '../server/media/ffmpeg.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'data', 'cache', 'audio-demo');
const sfxDir = path.join(dir, 'sfx');
const musicDir = path.join(dir, 'music');
fs.mkdirSync(dir, { recursive: true });

const secs = (t0) => `${((performance.now() - t0) / 1000).toFixed(2)} s`;

let t0 = performance.now();
const sfx = await ensureSfx(sfxDir);
console.log(`SFX library (${SFX_LIBRARY.length} sounds) ready in ${secs(t0)}: ${sfxDir}`);
for (const s of SFX_LIBRARY) console.log(`  ${s.name.padEnd(13)} ${s.duration.toFixed(2)}s  ${path.relative(root, sfx[s.name])}`);

t0 = performance.now();
const beds = await ensureMusic(musicDir);
console.log(`\nMusic beds ready in ${secs(t0)}: ${musicDir}`);
for (const m of MUSIC_LIBRARY) console.log(`  ${m.name.padEnd(13)} ${m.bpm} BPM  ${path.relative(root, beds[m.name])}`);

const duration = 20;
const cues = [
  { name: 'whoosh-soft', t: 0 }, { name: 'whoosh-soft', t: 3 }, { name: 'whoosh-soft', t: 6.5 },
  { name: 'tap', t: 4.2 }, { name: 'tap', t: 5.0 },
  { name: 'success', t: 8 },
  { name: 'shimmer', t: 10 },
  { name: 'notification', t: 12 },
  { name: 'logo-sting', t: 17.5 },
];
const out = path.join(dir, 'demo.m4a');
t0 = performance.now();
const res = await mixAudio({ duration, cues, music: { name: 'calm-gold' }, out, sfxDir, musicDir });
console.log(`\nMixed ${duration}s demo in ${secs(t0)}: ${res.out}`);
if (res.warnings.length) console.log('  warnings:', res.warnings);
const timing = musicTiming('calm-gold', duration);
console.log(`  calm-gold: ${timing.bpm} BPM, final chord at ${timing.finalChordAt?.toFixed(2)} s, bar downbeats: ${beatGrid('calm-gold', duration, { every: 4 }).map((b) => b.toFixed(2)).join(' ')}`);

// independent measurement with ffmpeg loudnorm (analysis only)
const { stderr } = await run(FFMPEG, ['-hide_banner', '-nostats', '-i', out, '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-']);
const json = JSON.parse(stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1));
console.log(`  measured (ffmpeg loudnorm): integrated ${json.input_i} LUFS, true peak ${json.input_tp} dBTP, LRA ${json.input_lra} LU`);
console.log(`  measured (ffmpeg ebur128):  integrated ${res.integrated} LUFS, true peak ${res.truePeak} dBTP`);
