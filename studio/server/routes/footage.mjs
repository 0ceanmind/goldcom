// Footage library routes: upload recordings/screenshots, list, label, delete, and serve media with Range support.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { send, readJson, bodyToFile, serveFile } from '../http-util.mjs';
import { listFootage, getFootage, updateFootage, deleteFootage, importFootage, footageFile, ensureFrames } from '../footage/store.mjs';

export async function footageRoutes(req, res, url) {
  const p = url.pathname;
  let m;
  if (p.startsWith('/footage/') && (req.method === 'GET' || req.method === 'HEAD')) {
    // Exact export frames are extracted on demand.
    if ((m = p.match(/^\/footage\/([\w-]+)\/frames\/(\d+)\/\d+\.jpg$/))) {
      const dir = path.join(path.dirname(footageFile(p)), '..');
      if (!fs.existsSync(path.join(dir, String(m[2]), '.done'))) await ensureFrames(m[1], Number(m[2]));
    }
    const file = footageFile(p);
    if (file && serveFile(req, res, file, { cache: 'public, max-age=3600' })) return true;
    send(res, 404, { error: 'Not found' });
    return true;
  }
  if (p === '/api/footage' && req.method === 'GET') { send(res, 200, await listFootage()); return true; }
  if (p === '/api/footage' && req.method === 'POST') {
    const name = decodeURIComponent(req.headers['x-filename'] || 'recording.mp4');
    const tmp = path.join(os.tmpdir(), `goldcom-upload-${Date.now()}${path.extname(name) || '.mp4'}`);
    try {
      await bodyToFile(req, tmp);
      const meta = await importFootage(tmp, { name, source: req.headers['x-source'] || 'upload', notes: decodeURIComponent(req.headers['x-notes'] || '') });
      send(res, 201, meta);
    } finally { fsp.rm(tmp, { force: true }).catch(() => {}); }
    return true;
  }
  if ((m = p.match(/^\/api\/footage\/([\w-]+)$/))) {
    if (req.method === 'GET') { send(res, 200, await getFootage(m[1])); return true; }
    if (req.method === 'PATCH' || req.method === 'PUT') {
      const body = await readJson(req);
      const allowed = {};
      for (const k of ['name', 'tags', 'notes', 'segments', 'labels', 'events']) if (body[k] !== undefined) allowed[k] = body[k];
      send(res, 200, await updateFootage(m[1], allowed));
      return true;
    }
    if (req.method === 'DELETE') { await deleteFootage(m[1]); send(res, 200, { ok: true }); return true; }
  }
  return false;
}
