// Background jobs (exports, productions, captures) with progress pushed to the editor over SSE.
// Productions are persisted to <data>/jobs so the history survives restarts.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from './store.mjs';

export const JOBS_DIR = path.join(DATA_DIR, 'jobs');
const jobs = new Map();
let broadcaster = () => {};
export const setBroadcaster = (fn) => { broadcaster = fn; };

const PERSIST = new Set(['production']);
const persistTimers = new Map();
function persist(job) {
  if (!PERSIST.has(job.type)) return;
  clearTimeout(persistTimers.get(job.id));
  persistTimers.set(job.id, setTimeout(() => {
    fs.mkdirSync(JOBS_DIR, { recursive: true });
    const { controller, ...data } = job;
    fsp.writeFile(path.join(JOBS_DIR, `${job.id}.json`), JSON.stringify(data, null, 2)).catch(() => {});
  }, 250));
}

const publicJob = (job) => { const { controller, ...rest } = job; return rest; };

export function createJob(type, data = {}) {
  const id = `${type.slice(0, 4)}_${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
  const job = { id, type, status: 'running', progress: 0, stage: null, message: '', log: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), result: null, error: null, controller: new AbortController(), ...data };
  jobs.set(id, job);
  broadcaster({ type: 'job', job: summary(job) });
  persist(job);
  return job;
}

export function updateJob(job, patch = {}, logLine) {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  if (logLine) {
    job.log.push({ t: new Date().toISOString(), msg: logLine });
    if (job.log.length > 400) job.log.splice(0, job.log.length - 400);
  }
  broadcaster({ type: 'job', job: summary(job), line: logLine || null });
  persist(job);
  return job;
}

export const summary = (job) => ({ id: job.id, type: job.type, status: job.status, progress: job.progress, stage: job.stage, message: job.message, createdAt: job.createdAt, updatedAt: job.updatedAt, title: job.title || null, docId: job.docId || null, result: job.result, error: job.error });

export async function getJob(id) {
  if (jobs.has(id)) return publicJob(jobs.get(id));
  const file = path.join(JOBS_DIR, `${String(id).replace(/[^\w-]/g, '')}.json`);
  if (fs.existsSync(file)) return JSON.parse(await fsp.readFile(file, 'utf8'));
  throw Object.assign(new Error('Job not found'), { status: 404 });
}

export async function listJobs(type) {
  const out = new Map();
  if (fs.existsSync(JOBS_DIR)) {
    for (const f of await fsp.readdir(JOBS_DIR)) {
      if (!f.endsWith('.json')) continue;
      try { const j = JSON.parse(await fsp.readFile(path.join(JOBS_DIR, f), 'utf8')); out.set(j.id, j); } catch { /* skip */ }
    }
  }
  for (const j of jobs.values()) out.set(j.id, publicJob(j));
  return [...out.values()].filter((j) => !type || j.type === type).map((j) => ({ ...summary(j), prompt: j.prompt || null })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function cancelJob(id) {
  const job = jobs.get(id);
  if (!job || job.status !== 'running') return false;
  job.controller.abort();
  updateJob(job, { status: 'cancelled', message: 'Cancelled' }, 'Cancelled by user');
  return true;
}

export async function deleteJob(id) {
  jobs.delete(id);
  await fsp.rm(path.join(JOBS_DIR, `${String(id).replace(/[^\w-]/g, '')}.json`), { force: true });
}

/** Mark productions that were running when the server stopped. */
export async function recoverJobs() {
  if (!fs.existsSync(JOBS_DIR)) return;
  for (const f of await fsp.readdir(JOBS_DIR)) {
    try {
      const file = path.join(JOBS_DIR, f);
      const j = JSON.parse(await fsp.readFile(file, 'utf8'));
      if (j.status === 'running' || j.status === 'waiting') { j.status = 'interrupted'; j.message = 'The studio restarted while this was running. Press Resume to continue.'; await fsp.writeFile(file, JSON.stringify(j, null, 2)); }
    } catch { /* skip */ }
  }
}

export function liveJob(id) { return jobs.get(id) || null; }
export function registerJob(job) { jobs.set(job.id, job); return job; }
