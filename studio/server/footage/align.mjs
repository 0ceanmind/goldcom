// Align logged taps with what actually happened on screen. The recorder's clock and the host's clock differ by a
// fraction of a second; a tap is normally followed by a visible change within ~0.1–0.8 s, so we pick the time
// offset that best lines taps up with screen changes.
import path from 'node:path';
import { run, FFMPEG } from '../media/ffmpeg.mjs';
import { footageDir, getFootage, updateFootage } from './store.mjs';

/** Scene-change score for every frame: [{ t, s }]. */
export async function sceneScores(file) {
  const { stderr, stdout } = await run(FFMPEG, ['-hide_banner', '-i', file, '-an', '-vf', "scale=180:-2,select='gte(scene,0)',metadata=print:file=-", '-f', 'null', '-'], { timeout: 10 * 60e3 });
  const text = stdout.toString() + stderr;
  const out = [];
  let t = null;
  for (const line of text.split('\n')) {
    let m;
    if ((m = line.match(/pts_time:([\d.]+)/))) t = Number(m[1]);
    else if ((m = line.match(/lavfi\.scene_score=([\d.]+)/)) && t !== null) out.push({ t, s: Number(m[1]) });
  }
  return out;
}

export function bestOffset(taps, scores, { range = [-1.5, 1.5], step = 1 / 30 } = {}) {
  if (!taps.length || !scores.length) return { offset: 0, score: 0 };
  const score = (off) => taps.reduce((acc, tp) => {
    let best = 0;
    for (const f of scores) if (f.t >= tp.t + off + 0.06 && f.t <= tp.t + off + 0.85 && f.s > best) best = f.s;
    return acc + best;
  }, 0);
  let best = { offset: 0, score: score(0) };
  for (let off = range[0]; off <= range[1]; off += step) { const s = score(off); if (s > best.score + 1e-6) best = { offset: off, score: s }; }
  // Only move when the evidence is clearly better than doing nothing.
  return best.score > score(0) * 1.15 ? best : { offset: 0, score: score(0) };
}

export async function alignEvents(id) {
  const meta = await getFootage(id);
  const taps = (meta.events || []).filter((e) => e.type === 'tap' || e.type === 'swipe');
  if (!taps.length || meta.aligned) return meta;
  const scores = await sceneScores(path.join(footageDir(id), 'video.mp4'));
  const { offset } = bestOffset(taps, scores);
  const shift = (e) => ({ ...e, t: +Math.max(0, e.t + offset).toFixed(3) });
  return updateFootage(id, { events: meta.events.map(shift), steps: (meta.steps || []).map(shift), aligned: { offset: +offset.toFixed(3) } });
}
