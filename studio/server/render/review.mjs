// Review frames: contact sheets of a design at chosen moments, used by the AI art director and for previews.
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { renderStills } from './video.mjs';
import { ffmpeg } from '../media/ffmpeg.mjs';
import { slideStarts, transitionDurOf } from './timing.mjs';
import { isSequence } from '../../shared/brand.js';

/** Moments worth looking at: for sequences, the settled middle and end of every scene and one transition frame. */
export function reviewTimes(doc, { perSlide = 2 } = {}) {
  if (!isSequence(doc.kind)) return doc.slides.map((s, i) => ({ slide: i, t: null, label: `Slide ${i + 1}` }));
  const starts = slideStarts(doc);
  const out = [];
  doc.slides.forEach((s, i) => {
    const d = Number(s.duration) || 4;
    const td = i ? transitionDurOf(s) : 0;
    const settled = Math.min(d - 0.1, td + Math.max(1.1, d * 0.45));
    out.push({ t: starts[i] + settled, slide: i, label: `Scene ${i + 1} · ${settled.toFixed(1)}s` });
    if (perSlide > 1) out.push({ t: starts[i] + Math.max(settled + 0.3, d - 0.25), slide: i, label: `Scene ${i + 1} · end` });
    if (perSlide > 2 && i) out.push({ t: starts[i] + td * 0.5, slide: i, label: `Into scene ${i + 1}` });
  });
  return out.sort((a, b) => a.t - b.t);
}

/** Render frames (sequence moments or static slides) and return [{ label, buf }] JPEGs. */
export async function reviewFrames({ base, doc, times = reviewTimes(doc), scale = 0.4 }) {
  const seq = isSequence(doc.kind);
  if (seq) {
    const bufs = await renderStills({ base, doc, times: times.map((x) => x.t), scale });
    return times.map((x, i) => ({ ...x, buf: bufs[i] }));
  }
  const out = [];
  for (const x of times) {
    const [buf] = await renderStills({ base, doc, times: [Infinity], scale, mode: 'slide', index: x.slide });
    out.push({ ...x, buf });
  }
  return out;
}

/** Tile frames into one JPEG (cols per row). */
export async function contactSheet(frames, { cols = 4, out } = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'gc-sheet-'));
  try {
    for (let i = 0; i < frames.length; i++) await fsp.writeFile(path.join(dir, `${String(i + 1).padStart(3, '0')}.jpg`), frames[i].buf);
    const rows = Math.ceil(frames.length / cols);
    const file = out || path.join(dir, 'sheet.jpg');
    await ffmpeg(['-framerate', '1', '-i', path.join(dir, '%03d.jpg'), '-vf', `tile=${cols}x${rows}:padding=12:margin=12:color=0x0c0c0b`, '-frames:v', '1', '-q:v', '3', file]);
    return fsp.readFile(file);
  } finally {
    if (!out) fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
