// Finds the phone screen inside a desktop recording (for example a cloud iPhone session in a browser window, or a
// mirroring app) so the footage can be cropped to just the app.
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { complete } from './engine.mjs';
import { ffmpeg, probe } from '../media/ffmpeg.mjs';
import { getFootage, originalFile } from '../footage/store.mjs';

const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['found', 'x', 'y', 'w', 'h', 'note'],
  properties: {
    found: { type: 'boolean', description: 'True if a phone screen is visible.' },
    x: { type: 'number', description: 'Left edge of the phone SCREEN as a fraction of the image width (0..1).' },
    y: { type: 'number', description: 'Top edge as a fraction of the image height.' },
    w: { type: 'number', description: 'Width as a fraction of the image width.' },
    h: { type: 'number', description: 'Height as a fraction of the image height.' },
    note: { type: 'string' },
  },
};

/** Returns { x, y, w, h } in pixels of the original recording, or throws when no phone screen is found. */
export async function detectPhoneScreen(id, { signal } = {}) {
  const meta = await getFootage(id);
  const src = originalFile(id);
  const info = await probe(src);
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'gc-crop-'));
  try {
    const frame = path.join(dir, 'f.jpg');
    const at = meta.kind === 'video' ? Math.max(0, Math.min((info.duration || 2) / 2, (info.duration || 2) - 0.2)) : 0;
    await ffmpeg([...(meta.kind === 'video' ? ['-ss', at.toFixed(2)] : []), '-i', src, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '3', frame]);
    const res = await complete({
      system: 'You locate phone screens inside screenshots of a computer desktop. Be precise to within 1% of the image size.',
      prompt: 'This is a frame from a screen recording made on a computer. Somewhere in it is a phone (for example a cloud phone streamed in a browser, or a mirroring window) showing a mobile app. Return the bounding box of the phone\'s SCREEN content only: inside the phone bezel or frame, excluding browser toolbars, side panels, window borders and any device frame. If several phones are visible, choose the largest.',
      images: [{ data: (await fsp.readFile(frame)).toString('base64'), mediaType: 'image/jpeg', label: 'desktop frame' }],
      schema: SCHEMA, effort: 'medium', signal,
    });
    if (!res.found || res.w < 0.05 || res.h < 0.05) throw Object.assign(new Error(`No phone screen found in this recording${res.note ? ` (${res.note})` : ''}.`), { status: 422 });
    // Pull the edges in very slightly so a sliver of bezel or toolbar never shows.
    const inset = 0.004;
    return {
      x: (res.x + inset) * info.width, y: (res.y + inset) * info.height,
      w: (res.w - inset * 2) * info.width, h: (res.h - inset * 2) * info.height,
    };
  } finally {
    fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
