// Phone emulator on this computer: status, one-time install, start/stop, Google Play page for Goldcom.
import { send, readJson } from '../http-util.mjs';
import { createJob, updateJob } from '../jobs.mjs';
import * as E from '../capture/emulator.mjs';
import { getSettings } from '../settings.mjs';

let installing = null;
let starting = null;

export async function emulatorRoutes(req, res, url) {
  const p = url.pathname;
  if (!p.startsWith('/api/emulator')) return false;
  if (p === '/api/emulator' && req.method === 'GET') {
    send(res, 200, { ...(await E.status()), installJob: installing?.status === 'running' ? installing.id : null, startJob: starting?.status === 'running' ? starting.id : null });
    return true;
  }
  if (p === '/api/emulator/install' && req.method === 'POST') {
    const b = await readJson(req);
    if (!b.acceptLicense) throw Object.assign(new Error('Accept the Android SDK License Agreement to download the emulator.'), { status: 400 });
    if (installing?.status === 'running') { send(res, 202, { jobId: installing.id }); return true; }
    const job = installing = createJob('emulator', { title: 'Install the phone emulator', message: 'Starting…' });
    send(res, 202, { jobId: job.id });
    E.install({ signal: job.controller.signal, onProgress: ({ message, pct }) => updateJob(job, { message, progress: pct }) })
      .then((r) => updateJob(job, { status: 'done', progress: 1, message: 'Phone emulator installed', result: r }, 'Installed'))
      .catch((e) => updateJob(job, { status: 'error', error: e.message, message: e.message }, e.stack));
    return true;
  }
  if (p === '/api/emulator/start' && req.method === 'POST') {
    const b = await readJson(req);
    if (starting?.status === 'running') { send(res, 202, { jobId: starting.id }); return true; }
    const job = starting = createJob('emulator', { title: 'Start the Goldcom phone', message: 'Starting the phone…' });
    send(res, 202, { jobId: job.id });
    E.start({ headless: !!b.headless, signal: job.controller.signal, onProgress: ({ message, pct }) => updateJob(job, { message, progress: pct }) })
      .then((st) => updateJob(job, { status: 'done', progress: 1, message: 'The phone is ready', result: st }, 'Ready'))
      .catch((e) => updateJob(job, { status: 'error', error: e.message, message: e.message }, e.stack));
    return true;
  }
  if (p === '/api/emulator/stop' && req.method === 'POST') { await E.stop(); send(res, 200, { ok: true }); return true; }
  if (p === '/api/emulator/open-store' && req.method === 'POST') { await E.openStore(getSettings().appPackage || E.GOLDCOM_PACKAGE); send(res, 200, { ok: true }); return true; }
  if (p === '/api/emulator/enable-hypervisor' && req.method === 'POST') { E.enableHypervisor(); send(res, 200, { ok: true }); return true; }
  if (p === '/api/emulator' && req.method === 'DELETE') { await E.uninstall(); send(res, 200, { ok: true }); return true; }
  return false;
}
