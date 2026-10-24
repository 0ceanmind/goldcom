// Claude watches imported footage (keyframes per segment) and writes an index: which screen, what happens,
// the real button labels, and whether personal data is visible. The director uses this to pick the right clips.
import fs from 'node:fs';
import path from 'node:path';
import { complete } from './engine.mjs';
import { footageDir, getFootage, updateFootage } from '../footage/store.mjs';

const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['summary', 'language', 'segments', 'sensitive'],
  properties: {
    summary: { type: 'string', description: 'One sentence: what this recording or screenshot shows.' },
    language: { type: 'string', enum: ['ar', 'en', 'mixed', 'none'] },
    sensitive: { type: 'boolean', description: 'True if names, balances, phone numbers, IDs or other personal data are visible anywhere.' },
    segments: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['index', 'label', 'description', 'ui_labels'],
        properties: {
          index: { type: 'integer' },
          label: { type: 'string', description: 'Screen name, 1–4 words (e.g. "Home", "Browse", "Bar details", "Checkout review").' },
          description: { type: 'string', description: 'What is on screen / what happens, ≤ 20 words.' },
          ui_labels: { type: 'array', items: { type: 'string' }, description: 'Exact visible button/tab labels.' },
        },
      },
    },
  },
};

export async function labelFootage(id, { signal } = {}) {
  const meta = await getFootage(id);
  if (meta.status !== 'ready') return meta;
  const dir = footageDir(id);
  const segs = meta.segments.length ? meta.segments : [{ start: 0, end: 0, kf: 'poster.jpg' }];
  const pick = segs.map((s, i) => ({ ...s, i })).filter((s) => s.kf).slice(0, 14);
  const loaded = pick.map((s) => ({
    label: meta.kind === 'video' ? `segment ${s.i + 1} (${s.start.toFixed(1)}–${s.end.toFixed(1)} s)` : 'screenshot',
    mediaType: 'image/jpeg',
    data: fs.readFileSync(path.join(dir, s.kf)).toString('base64'),
  }));
  const res = await complete({
    system: 'You index screen recordings of the Goldcom mobile app (an Omani app for buying physical gold) for a video editor. Be literal and precise; copy UI labels exactly as shown.',
    prompt: `Footage "${meta.name}" (${meta.kind}${meta.kind === 'video' ? `, ${Number(meta.duration).toFixed(1)} s` : ''}). Each image is one keyframe, in order. Return one entry per image with index = the segment number shown in its label (1-based).`,
    images: loaded, schema: SCHEMA, effort: 'low', signal,
  });
  const segments = meta.segments.map((s, i) => {
    const r = res.segments.find((x) => x.index === i + 1);
    return r ? { ...s, label: r.label, description: r.description, ui: r.ui_labels } : s;
  });
  return updateFootage(id, { segments, labels: { summary: res.summary, language: res.language, sensitive: res.sensitive, at: new Date().toISOString() } });
}
