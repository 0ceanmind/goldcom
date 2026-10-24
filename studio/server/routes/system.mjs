// Settings, engine status and one-click updates.
import fs from 'node:fs';
import path from 'node:path';
import { send, readJson } from '../http-util.mjs';
import { getSettings, updateSettings, publicSettings } from '../settings.mjs';
import { STUDIO_ROOT } from '../store.mjs';
import { createJob, updateJob } from '../jobs.mjs';
import { closeBrowser } from '../browser.mjs';

const updater = () => import('../updater.mjs');
let lastCheck = null;

function releaseBranch() {
  try { return JSON.parse(fs.readFileSync(path.join(STUDIO_ROOT, 'release.json'), 'utf8')).branch; } catch { return 'main'; }
}
const branch = () => getSettings().updateBranch || releaseBranch();

export function startUpdateChecks(broadcast) {
  if (!getSettings().autoUpdateCheck) return;
  updater().then((u) => u.startAutoCheck?.({
    branch: () => branch(),
    onResult: (r) => { lastCheck = { ...r, checkedAt: new Date().toISOString() }; if (r.available) broadcast({ type: 'update', update: lastCheck }); },
  })).catch(() => {});
}

export async function systemRoutes(req, res, url, { broadcast }) {
  const p = url.pathname;
  if (p === '/api/settings' && req.method === 'GET') { send(res, 200, publicSettings()); return true; }
  if (p === '/api/settings' && (req.method === 'PUT' || req.method === 'POST')) { updateSettings(await readJson(req)); send(res, 200, publicSettings()); return true; }
  if (p === '/api/engine' && req.method === 'GET') {
    const { engineStatus } = await import('../ai/engine.mjs');
    send(res, 200, await engineStatus());
    return true;
  }
  if (p === '/api/engine/test' && req.method === 'POST') {
    const { complete } = await import('../ai/engine.mjs');
    try {
      const r = await complete({ system: 'Reply with JSON only.', prompt: 'Say hello in Arabic and English for a gold app.', schema: { type: 'object', properties: { ar: { type: 'string' }, en: { type: 'string' } }, required: ['ar', 'en'], additionalProperties: false }, effort: 'low', label: 'test' });
      send(res, 200, { ok: true, reply: r });
    } catch (e) { send(res, 200, { ok: false, error: e.message }); }
    return true;
  }

  if (p === '/api/update' && req.method === 'GET') {
    try {
      const u = await updater();
      const info = await u.getVersionInfo();
      send(res, 200, { ...info, branch: branch(), lastCheck });
    } catch (e) { send(res, 200, { error: e.message, branch: branch(), lastCheck }); }
    return true;
  }
  if (p === '/api/update/check' && req.method === 'POST') {
    try {
      const u = await updater();
      lastCheck = { ...(await u.checkForUpdate({ branch: branch() })), checkedAt: new Date().toISOString() };
      send(res, 200, lastCheck);
    } catch (e) { send(res, 200, { available: false, error: e.message }); }
    return true;
  }
  if (p === '/api/update/channels' && req.method === 'GET') {
    try { send(res, 200, { branches: await (await updater()).listChannels(), current: branch() }); } catch (e) { send(res, 200, { branches: [], current: branch(), error: e.message }); }
    return true;
  }
  if (p === '/api/update/apply' && req.method === 'POST') {
    const job = createJob('update', { title: 'Updating Goldcom Studio', message: 'Starting…' });
    send(res, 202, { jobId: job.id });
    (async () => {
      const u = await updater();
      const r = await u.applyUpdate({ branch: branch(), onProgress: ({ step, message, pct }) => updateJob(job, { stage: step, message: message || step, progress: pct ?? job.progress }, message) });
      if (!r?.ok) throw new Error(r?.busy ? 'An update is already running.' : `${r?.error || 'Update failed'}${r?.rolledBack ? ' The previous version was restored.' : ''}`);
      if (r.upToDate || !r.restart) { lastCheck = { available: false, checkedAt: new Date().toISOString() }; updateJob(job, { status: 'done', progress: 1, message: 'Already up to date', result: r }); return; }
      lastCheck = null;
      updateJob(job, { status: 'done', progress: 1, message: 'Restarting…', result: r }, `Updated ${r.from?.slice?.(0, 7) || ''} → ${r.to?.slice?.(0, 7) || ''}`);
      broadcast({ type: 'restarting' });
      setTimeout(() => u.restartServer({ cleanup: closeBrowser }), 600);
    })().catch((e) => updateJob(job, { status: 'error', error: e.message, message: e.message }, e.stack));
    return true;
  }
  return false;
}
