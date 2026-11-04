// AI production routes: start a production from a plain-language request, follow it, choose a concept,
// ask for changes, resume after a restart.
import { send, readJson } from '../http-util.mjs';
import { createJob, updateJob, getJob, liveJob, registerJob } from '../jobs.mjs';
import { runProduction, prepareRevision } from '../ai/pipeline.mjs';
import { startExport } from './exports.mjs';
import * as A from '../capture/adb.mjs';
import { captureFlow } from '../capture/agent.mjs';
import { enginePreflight } from '../ai/engine.mjs';
import { copyPreflight } from '../ai/copy.mjs';
import { validateReply } from '../ai/engine.mjs';
import { BRIEF } from '../ai/pipeline.mjs';
import { getDocument } from '../store.mjs';
import { getSettings } from '../settings.mjs';

const deviceCapture = {
  async status() {
    if (!A.findAdb()) return null;
    const ready = await A.pickDevice(getSettings().captureDevice);
    return ready ? { ready: true, serial: ready.serial, model: ready.model } : null;
  },
  async capture({ goal, lang, signal, onMessage, complete }) {
    const st = await deviceCapture.status();
    if (!st) throw new Error('No phone connected');
    return captureFlow({ serial: st.serial, goal, lang, pkg: getSettings().appPackage || null, signal, onMessage, complete });
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
  if (p === '/api/campaigns' && req.method === 'POST') {
    const b = await readJson(req);
    if (!Array.isArray(b.deliverables) || !b.deliverables.length || b.deliverables.length > 6 || !String(b.brief || '').trim()) throw Object.assign(new Error('Provide a shared brief and one to six deliverables'), { status: 400 });
    await preflight();
    for (const d of b.deliverables) validateOptions(d);
    const campaign = createJob('campaign', { title: b.title || 'Goldcom campaign', sharedBrief: b.brief, cast: String(b.cast || ''), line: String(b.line || ''), deliverables: [], status: 'waiting', message: 'Campaign deliverables created' });
    for (const d of b.deliverables) {
      const prompt = `${b.brief}\nShared cast: ${String(b.cast || '')}\nCampaign line (must appear verbatim): "${String(b.line || '')}"\nDeliverable: ${d.format} in ${d.lang || 'auto'}. ${String(d.prompt || '')}`;
      const job = createJob('production', { title: b.title || prompt.slice(0,80), prompt, campaignId: campaign.id, options: { ...d, budgetUsd: getSettings().productionBudgetUsd / b.deliverables.length }, message: 'Starting…' });
      campaign.deliverables.push(job.id); run(job, base);
    }
    updateJob(campaign, { deliverables: campaign.deliverables });
    send(res, 202, { campaignId: campaign.id, jobId: campaign.deliverables[0], deliverables: campaign.deliverables }); return true;
  }
  if (p === '/api/productions' && req.method === 'POST') {
    const b = await readJson(req);
    if (!String(b.prompt || '').trim()) throw Object.assign(new Error('Describe what to make'), { status: 400 });
    if (String(b.prompt).length > 20000) throw Object.assign(new Error('Keep the brief below 20,000 characters'), { status: 400 });
    validateOptions(b.options || {});
    await preflight();
    const job = createJob('production', { title: String(b.prompt).slice(0, 80), prompt: String(b.prompt).trim(), options: b.options || {}, message: 'Starting…' });
    run(job, base);
    send(res, 202, { jobId: job.id });
    return true;
  }
  if ((m = p.match(/^\/api\/productions\/([\w-]+)\/brief$/)) && req.method === 'PATCH') {
    const job = await revive(m[1]);
    if (job.status === 'running') throw Object.assign(new Error('Stop this production before editing its brief'), { status: 409 });
    const b = await readJson(req); validateReply(BRIEF, b.brief);
    prepareRevision(job, 'Use the edited brief.'); job.brief = b.brief; job.concepts = null; job.pick = null; job.chosen = null; job.status = 'needs-attention';
    updateJob(job, { stage: 'brief', blockers: ['Brief changed. Rebuild and review the new version before exporting.'], message: 'Brief saved. Press Rebuild to produce the new version.' }); send(res,200,{ ok:true }); return true;
  }
  if ((m = p.match(/^\/api\/productions\/([\w-]+)\/(choose|revise|resume|rebuild)$/)) && req.method === 'POST') {
    const b = await readJson(req);
    const job = await revive(m[1]);
    if (job.status === 'running') throw Object.assign(new Error('This production is still running'), { status: 409 });
    await preflight();
    if (job.docId) {
      const current = await getDocument(job.docId);
      if (current.source?.lastWriter !== 'studio-ai') {
        job.preservedSlides = current.slides.map((s,i) => !job.builtSlides || JSON.stringify(s) !== JSON.stringify(job.builtSlides[i]) ? s : null);
        job.editorContext = current.slides.map((s,i)=>({scene:i+1,template:s.template,content:s.content,custom:s.custom}));
      }
    }
    if (m[2] === 'choose' && !job.concepts?.some(c => c.id === b.concept)) throw Object.assign(new Error('Choose an existing concept'), { status: 400 });
    if (m[2] === 'rebuild') { job.footageDone = false; job.reviews = []; job.video = null; job.result = null; }
    if (m[2] === 'choose') { job.video = null; job.result = null; job.chosen = b.concept; job.storyboard = null; job.footageDone = false; job.reviews = []; }
    if (m[2] === 'revise') { if (!String(b.note || '').trim()) throw Object.assign(new Error('Say what to change'), { status: 400 }); prepareRevision(job, String(b.note).trim()); updateJob(job, {}, `Change requested: ${b.note}`); }
    run(job, base);
    send(res, 202, { jobId: job.id });
    return true;
  }
  return false;
}

export function validateOptions(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw Object.assign(new Error('Invalid production preferences'), { status: 400 });
  if (o.format && !['auto','post','carousel','reel','story','motion'].includes(o.format) || o.lang && !['auto','ar','en'].includes(o.lang) || o.reviewRounds !== undefined && (!Number.isInteger(o.reviewRounds) || o.reviewRounds < 1 || o.reviewRounds > 4) || o.duration !== undefined && (!Number.isFinite(o.duration) || o.duration < 3 || o.duration > 120) || o.budgetUsd !== undefined && (!Number.isFinite(o.budgetUsd) || o.budgetUsd <= 0)) throw Object.assign(new Error('Invalid production preferences'), { status: 400 });
}
async function preflight() {
  await copyPreflight();
  await enginePreflight();
}
