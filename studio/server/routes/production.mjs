// AI production routes: start a production from a plain-language request, follow it, choose a concept,
// ask for changes, resume after a restart.
import { send, readJson } from '../http-util.mjs';
import { createJob, updateJob, getJob, liveJob, registerJob } from '../jobs.mjs';
import { runProduction, prepareRevision } from '../ai/pipeline.mjs';
import { startExport } from './exports.mjs';
import * as A from '../capture/adb.mjs';
import { captureFlow } from '../capture/agent.mjs';
import { getSettings } from '../settings.mjs';

const deviceCapture = {
  async status() {
    if (!A.findAdb()) return null;
    const ready = await A.pickDevice(getSettings().captureDevice);
    return ready ? { ready: true, serial: ready.serial, model: ready.model } : null;
  },
  async capture({ goal, lang, signal, onMessage }) {
    const st = await deviceCapture.status();
    if (!st) throw new Error('No phone connected');
    return captureFlow({ serial: st.serial, goal, lang, pkg: getSettings().appPackage || null, signal, onMessage });
  },
};

function run(job, base) {
  job.status = 'running';
  if (!job.controller || job.controller.signal.aborted) job.controller = new AbortController();
  updateJob(job, { status: 'running', error: null });
  runProduction(job, { base, startExport: (o) => startExport({ base, ...o }), deviceCapture })
    .catch((e) => { if (job.status === 'running') updateJob(job, { status: 'error', error: e.message, message: e.message }, e.stack); });
}

async function revive(id) {
  const live = liveJob(id);
  if (live) return live;
  const saved = await getJob(id);
  return registerJob({ ...saved, controller: new AbortController() });
}

export async function productionRoutes(req, res, url, { base }) {
  const p = url.pathname;
  let m;
  if (p === '/api/productions' && req.method === 'POST') {
    const b = await readJson(req);
    if (!String(b.prompt || '').trim()) throw Object.assign(new Error('Describe what to make'), { status: 400 });
    const job = createJob('production', { title: String(b.prompt).slice(0, 80), prompt: String(b.prompt).trim(), options: b.options || {}, message: 'Starting…' });
    run(job, base);
    send(res, 202, { jobId: job.id });
    return true;
  }
  if ((m = p.match(/^\/api\/productions\/([\w-]+)\/(choose|revise|resume)$/)) && req.method === 'POST') {
    const b = await readJson(req);
    const job = await revive(m[1]);
    if (job.status === 'running') throw Object.assign(new Error('This production is still running'), { status: 409 });
    if (m[2] === 'choose') { job.chosen = b.concept; job.storyboard = null; job.footageDone = false; job.reviews = []; }
    if (m[2] === 'revise') { if (!String(b.note || '').trim()) throw Object.assign(new Error('Say what to change'), { status: 400 }); prepareRevision(job, String(b.note).trim()); updateJob(job, {}, `Change requested: ${b.note}`); }
    run(job, base);
    send(res, 202, { jobId: job.id });
    return true;
  }
  return false;
}
