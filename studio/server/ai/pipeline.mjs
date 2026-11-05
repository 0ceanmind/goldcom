// The production pipeline: a request in plain words becomes a finished, reviewed Reel / carousel / Story / post.
//   brief → 3 concepts → creative-director pick → storyboard → footage (library or live phone capture)
//   → build → render + art-director review (up to N rounds) → final export
// Every stage's output is kept on the job so the UI can show the thinking and a production can resume.
import { complete } from './engine.mjs';
import { completeCopy } from './copy.mjs';
import { BILINGUAL_COPY, copyInput, applyCopy } from './copy-contract.mjs';
import { creativeHistory, historyPrompt, reserveConcepts, finalOriginalityIssues } from './originality.mjs';
import { realizeIllustrations } from './illustrate.mjs';
import { productionReadiness, reviewFingerprint } from '../../shared/readiness.js';
import { constraintsFor, constraintIssues } from '../constraints.mjs';
import { directorSystem, footageIndex, DIRECTOR_SCENES } from './knowledge.mjs';
import { labelFootage } from './label.mjs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { listFootage, getFootage, footageDir } from '../footage/store.mjs';
import { ffmpeg } from '../media/ffmpeg.mjs';
import { createFromSpec, saveDocument, getDocument } from '../store.mjs';
import { updateJob } from '../jobs.mjs';
import { getSettings } from '../settings.mjs';
import { reviewFrames, reviewTimes } from '../render/review.mjs';
import { lintDocument } from '../../shared/lint.js';
import { THEMES, TRANSITIONS, isSequence } from '../../shared/brand.js';
import { TEMPLATES } from '../../shared/templates.js';

const FORMAT_OF = {
  reel: { format: 'story', kind: 'reel' },
  story: { format: 'story', kind: 'story' },
  carousel: { format: 'feed-portrait', kind: 'carousel' },
  post: { format: 'feed-portrait', kind: 'post' },
  motion: { format: 'feed-portrait', kind: 'motion' },
};
const MUSIC = ['none', 'calm-gold', 'modern-pulse', 'warm-eid'];
const str = { type: 'string' };
const kv = { type: 'array', items: { type: 'object', additionalProperties: false, required: ['key', 'value'], properties: { key: str, value: str } } };

// ---------- schemas ----------
export const BRIEF = {
  type: 'object', additionalProperties: false,
  required: ['brand', 'title', 'format', 'lang', 'objective', 'audience', 'key_message', 'tone', 'duration_s', 'slide_count', 'must_include', 'app_flows_needed', 'needs_people', 'mentions_prices', 'assumptions'],
  properties: {
    brand: { type: 'string', description: 'The actual client brand requested; Goldcom unless a different client is explicitly requested' },
    title: { type: 'string', description: 'Short working title' },
    format: { type: 'string', enum: Object.keys(FORMAT_OF) },
    lang: { type: 'string', enum: ['ar', 'en'] },
    objective: str, audience: str, key_message: str, tone: str,
    duration_s: { type: 'number', description: 'Target length for reels/stories (seconds), 0 for stills' },
    slide_count: { type: 'integer', description: 'Slides/frames for carousels and stories, scenes for reels' },
    must_include: { type: 'array', items: str },
    app_flows_needed: { type: 'array', items: str, description: 'Real app flows that must be shown, each as a precise path, e.g. "Home → Browse → 1 g bar → Buy → review (stop before paying)"' },
    needs_people: { type: 'boolean' },
    mentions_prices: { type: 'boolean' },
    assumptions: { type: 'array', items: str, description: 'Decisions you made where the request was open' },
  },
};

export const CONCEPTS = {
  type: 'object', additionalProperties: false, required: ['concepts'],
  properties: {
    concepts: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'name', 'angle', 'hook', 'beats', 'visual_style', 'why_it_works', 'risk', 'family', 'metaphor', 'framing', 'motion', 'narrative'],
        properties: {
          id: { type: 'string', enum: ['A', 'B', 'C'] }, name: str, angle: str,
          hook: { type: 'string', description: 'The exact opening line, in the content language' },
          beats: { type: 'array', items: str, description: 'Scene-by-scene beats' },
          visual_style: str, why_it_works: str, risk: str,
          family: str, metaphor: str, framing: str, motion: str, narrative: str,
        },
      },
    },
  },
};

const PICK = {
  type: 'object', additionalProperties: false, required: ['scores', 'winner', 'reason', 'improvements'],
  properties: {
    scores: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'hook', 'clarity', 'brand', 'feasibility', 'originality', 'note'], properties: { id: str, hook: { type: 'integer' }, clarity: { type: 'integer' }, brand: { type: 'integer' }, feasibility: { type: 'integer' }, originality: { type: 'integer' }, note: str } } },
    winner: { type: 'string', enum: ['A', 'B', 'C'] },
    reason: str,
    improvements: { type: 'array', items: str, description: 'Concrete changes that make the winner stronger' },
  },
};

const SCENE = {
  type: 'object', additionalProperties: false,
  required: ['scene', 'purpose', 'duration', 'theme', 'transition', 'fields', 'footage', 'art_note'],
  properties: {
    scene: { type: 'string', enum: DIRECTOR_SCENES },
    purpose: str,
    duration: { type: 'number', description: 'Seconds (reels/stories); use 4 for stills' },
    theme: { type: 'string', enum: Object.keys(THEMES) },
    transition: { type: 'string', enum: Object.keys(TRANSITIONS), description: 'Transition INTO this scene' },
    fields: kv,
    footage: {
      type: 'object', additionalProperties: false, required: ['use', 'footage_id', 'from', 'to', 'capture_goal'],
      properties: { use: { type: 'boolean' }, footage_id: str, from: { type: 'number' }, to: { type: 'number' }, capture_goal: str },
    },
    art_note: str,
  },
};

const STORYBOARD = {
  type: 'object', additionalProperties: false, required: ['title', 'scenes', 'caption', 'music', 'notes'],
  properties: {
    title: str,
    scenes: { type: 'array', items: SCENE },
    caption: { type: 'object', additionalProperties: false, required: ['text', 'hashtags'], properties: { text: str, hashtags: { type: 'array', items: str } } },
    music: { type: 'string', enum: MUSIC },
    notes: { type: 'array', items: str, description: 'At most 5 short, practical things the person must check or do before posting (each ≤ 25 words, plain language)' },
  },
};

const REVIEW = {
  type: 'object', additionalProperties: false, required: ['score', 'verdict', 'summary', 'issues', 'edits', 'caption_fix', 'hashtags_fix'],
  properties: {
    score: { type: 'integer', minimum: 1, maximum: 10, description: '1–10, where 8+ is ready to post' },
    verdict: { type: 'string', enum: ['ship', 'revise'] },
    summary: str,
    issues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['scene', 'severity', 'problem'], properties: { scene: { type: 'integer' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, problem: str } } },
    edits: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['scene', 'set', 'duration', 'theme', 'transition', 'replace_scene', 'remove'],
        properties: { scene: { type: 'integer', description: '1-based scene number' }, set: kv, duration: { type: 'number', description: '0 = keep' }, theme: { type: 'string', description: '"" = keep' }, transition: { type: 'string', description: '"" = keep' }, replace_scene: { type: 'string', description: '"" = keep, else a scene id' }, remove: { type: 'boolean' } },
      },
    },
    caption_fix: { type: 'string', description: 'Replacement caption text, or "" to keep' },
    hashtags_fix: { type: 'array', items: str, description: 'Replacement hashtags, or [] to keep' },
  },
};

const MAP = {
  type: 'object', additionalProperties: false, required: ['assignments'],
  properties: { assignments: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['scene', 'footage_id', 'from', 'to', 'title_fix'], properties: { scene: { type: 'integer' }, footage_id: str, from: { type: 'number' }, to: { type: 'number' }, title_fix: { type: 'string', description: 'Corrected instruction using the real UI label, or ""' } } } } },
};

const REGION = {
  type: 'object', additionalProperties: false, required: ['found', 'x', 'y', 'w', 'h', 'label'],
  properties: { found: { type: 'boolean' }, x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' }, label: { type: 'string', description: 'The exact text of the element, as shown' } },
};

// ---------- helpers ----------
const J = (o) => JSON.stringify(o, null, 1);
const today = () => new Date().toISOString().slice(0, 10);

function fieldsToContent(fields = []) {
  const c = {};
  for (const { key, value } of fields) {
    if (!key) continue;
    if (key === 'params') { try { c[key] = JSON.parse(value); } catch { throw new Error('3D parameters must be valid JSON'); } }
    else c[key] = ['items','messages','products','rows','before','after','ticker','lines','labels','options'].includes(key) ? String(value).split('\n').map((x) => x.trim()).filter(Boolean) : value;
  }
  return c;
}

function cleanStoryboard(sb, brief) {
  const seq = ['reel', 'story', 'motion'].includes(brief.format);
  const scenes = (sb.scenes || []).filter((s) => TEMPLATES[s.scene]).map((s) => ({
    ...s,
    duration: seq ? Math.min(12, Math.max(1.6, Number(s.duration) || 3)) : 4,
    theme: THEMES[s.theme] ? s.theme : 'onyx',
    transition: TRANSITIONS[s.transition] ? s.transition : 'fade',
    fields: (s.fields || []).filter((f) => f && f.key),
    footage: s.footage || { use: false, footage_id: '', from: 0, to: 0, capture_goal: '' },
  }));
  if (brief.format === 'post' || brief.format === 'motion') scenes.splice(1);
  return { ...sb, scenes };
}

async function footageContent(scene) {
  const f = scene.footage;
  if (!f?.use || !f.footage_id) return {};
  let meta;
  try { meta = await getFootage(f.footage_id); } catch { return {}; }
  if (meta.status !== 'ready' || meta.labels?.sensitive || meta.steps?.some(s => s.sensitive?.length)) return {};
  if (meta.kind === 'image') return { footage: `/footage/${meta.id}/image${meta.ext || '.png'}`, screenshot: `/footage/${meta.id}/image${meta.ext || '.png'}`, image:`/footage/${meta.id}/image${meta.ext || '.png'}` };
  const from = Math.max(0, Math.min(meta.duration - 0.3, Number(f.from) || 0));
  const to = Math.max(from + 0.4, Math.min(meta.duration, Number(f.to) || from + 3));
  const taps = (meta.events || []).filter((e) => e.type === 'tap').map((e) => ({ t: e.t, x: e.x, y: e.y }));
  return { footage: `/footage/${meta.id}/video.mp4`, from: +from.toFixed(2), to: +to.toFixed(2), taps };
}

export async function buildDoc(sb, brief, { docId = null, source, preservedSlides = [] } = {}) {
  const { format, kind } = FORMAT_OF[brief.format] || FORMAT_OF.reel;
  const slides = [];
  for (const s of sb.scenes) {
    const content = { ...fieldsToContent(s.fields), ...(await footageContent(s)) };
    if (s.scene === 'outro' && brief.mentions_prices && !content.disclaimer) content.disclaimer = 'yes';
    slides.push({ template: s.scene, theme: s.theme, duration: s.duration, transition: s.transition, pattern:'none', content });
  }
  const doc = await createFromSpec({ name: sb.title || brief.title || 'Goldcom production', format, kind, lang: brief.lang, slides, source, persist: false });
  doc.caption = { text: sb.caption?.text || '', hashtags: sb.caption?.hashtags || [] };
  doc.audio = { music: sb.music && sb.music !== 'none' ? sb.music : getSettings().music || 'none', sfx: true };
  doc.notes = (sb.notes || []).join('\n');
  if (docId) doc.id = docId;
  if (docId) {
    const prior = await getDocument(docId);
    // Preserve every prior version. An editor-owned document is forked, never overwritten.
    if (prior.source?.lastWriter !== 'studio-ai') { doc.id = `${docId}_fork_${Date.now().toString(36)}`; doc.source = { ...source, forkedFrom: docId }; }
    else { doc.revision = prior.revision; }
  }
  doc.slides = doc.slides.map((s,i) => preservedSlides[i] || ({ ...s, layers: s.layers.filter(l => l.type !== 'sparkles') }));
  return saveDocument(doc);
}

export function applyReview(sb, review) {
  const scenes = sb.scenes.map((s) => ({ ...s, fields: [...s.fields] }));
  const removed = new Set();
  for (const e of review.edits || []) {
    const s = scenes[e.scene - 1];
    if (!s) continue;
    if (e.remove) { removed.add(e.scene - 1); continue; }
    if (e.replace_scene && TEMPLATES[e.replace_scene] && DIRECTOR_SCENES.includes(e.replace_scene)) {
      s.scene = e.replace_scene;
      s.realized = false;
      const allowed = new Set(TEMPLATES[s.scene].fields.map(f => f.key));
      s.fields = s.fields.filter(f => allowed.has(f.key));
    }
    const allowed = new Set(TEMPLATES[s.scene].fields.map(f => f.key));
    for (const { key, value } of e.set || []) {
      if (!allowed.has(key)) continue;
      const i = s.fields.findIndex((f) => f.key === key);
      if (i >= 0) s.fields[i] = { key, value }; else s.fields.push({ key, value });
    }
    if (e.duration > 0) s.duration = e.duration;
    if (e.theme && THEMES[e.theme]) s.theme = e.theme;
    if (e.transition && TRANSITIONS[e.transition]) s.transition = e.transition;
    if (e.replace_scene && TEMPLATES[e.replace_scene] && DIRECTOR_SCENES.includes(e.replace_scene)) s.scene = e.replace_scene;
  }
  const caption = { ...sb.caption, ...(review.caption_fix ? { text: review.caption_fix } : {}), ...(review.hashtags_fix?.length ? { hashtags: review.hashtags_fix } : {}) };
  const kept = scenes.filter((_, i) => !removed.has(i));
  if (!kept.length) throw new Error('Review cannot remove every scene');
  return { ...sb, scenes: kept, caption };
}

/** Frame of a footage item at time t as a JPEG buffer (or the screenshot itself). */
async function footageFrame(id, t) {
  const meta = await getFootage(id);
  const dir = footageDir(id);
  const tmp = path.join(os.tmpdir(), `gc-frame-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
  const src = meta.kind === 'image' ? path.join(dir, `image${meta.ext || '.png'}`) : path.join(dir, 'video.mp4');
  await ffmpeg([...(meta.kind === 'image' ? [] : ['-ss', String(Math.max(0, t))]), '-i', src, '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '3', tmp]);
  const buf = await fsp.readFile(tmp);
  fsp.rm(tmp, { force: true }).catch(() => {});
  return buf;
}

/** Find the exact on-screen element each spotlight scene talks about (instead of guessing coordinates). */
async function locateRegions(sb, call) {
  for (const s of sb.scenes) {
    if (s.scene !== 'ui-zoom' || !s.footage?.footage_id || s.located) continue;
    try {
      const buf = await footageFrame(s.footage.footage_id, Number(s.footage.from) || 0);
      const get = (k) => s.fields.find((f) => f.key === k)?.value || '';
      const r = await call({
        prompt: `This is the Goldcom app screen used in a close-up scene. The scene's title is "${get('title').replace(/\*/g, '')}" and its callout is "${get('callout')}".\nFind the single UI element (card, row or button) that the callout talks about. Return its bounding box as fractions of the image width/height (x, y = top-left), padded by about 2% on each side. found=false if it is not visible.`,
        images: [{ data: buf.toString('base64'), mediaType: 'image/jpeg', label: 'app screen' }], schema: REGION, effort: 'low',
      });
      if (r.found && r.w > 0.05 && r.h > 0.02) {
        const v = [r.x, r.y, r.w, r.h].map((n) => Math.max(0, Math.min(1, n)).toFixed(3)).join(',');
        const i = s.fields.findIndex((f) => f.key === 'region');
        if (i >= 0) s.fields[i] = { key: 'region', value: v }; else s.fields.push({ key: 'region', value: v });
      }
      s.located = true;
    } catch { /* keep the director's estimate */ }
  }
  return sb;
}

// ---------- the pipeline ----------
/**
 * Run (or resume) a production job. job fields used: prompt, options, and stage outputs.
 * options: { format: 'auto'|'reel'|..., lang: 'auto'|'ar'|'en', duration, chooseConcept, reviewRounds, autoExport, capture }
 */
export async function runProduction(job, { base, startExport, deviceCapture, complete: runComplete = complete, completeCopy: runCopy = completeCopy, reviewFrames: renderReviews = reviewFrames }) {
  const signal = job.controller.signal;
  job.video = null;
  job.result = null;
  const opts = { reviewRounds: 2, autoExport: true, capture: true, ...(job.options || {}) };
  job.usage = job.usage || { costUsd: 0, input: 0, output: 0, calls: 0 };
  const onUsage = (u) => { job.usage.calls++; job.usage.costUsd += u.costUsd || 0; job.usage.input += u.input || 0; job.usage.output += u.output || 0; if(u.unpriced)job.usage.unpricedCopyCalls=(job.usage.unpricedCopyCalls||0)+1; };
  const SYSTEM = directorSystem();
  const budget = Math.min(opts.budgetUsd || getSettings().productionBudgetUsd, getSettings().productionBudgetUsd);
  const call = (o) => {
    if (job.editorContext) o = { ...o, prompt: `${o.prompt}\nPreserve the user's existing slide edits (these slides are retained in the build): ${J(job.editorContext)}` };
    if (signal.aborted) throw new Error('Cancelled');
    if (job.usage.costUsd >= budget) throw Object.assign(new Error('Production budget exhausted. Increase the budget in Settings before resuming.'), { status: 402 });
    return runComplete({ system: SYSTEM, signal, onUsage, budgetUsd: budget - job.usage.costUsd, effort: getSettings().effort || 'high', ...o });
  };
  const copyCall = (o) => {
    if(signal.aborted)throw new Error('Cancelled');
    if(job.usage.costUsd>=budget)throw Object.assign(new Error('Production budget exhausted. Increase the budget in Settings before resuming.'),{status:402});
    return runCopy({system:SYSTEM,signal,onUsage,budgetUsd:budget-job.usage.costUsd,...o});
  };
  const constraints = constraintsFor(job.prompt);
  const block = (...reasons) => updateJob(job, { status: 'needs-attention', stage: job.stage || 'review', message: 'Needs attention', blockers: reasons, progress: 1, video: null, result: { docId: job.docId || null, video: null } });
  const step = (stage, progress, message) => updateJob(job, { stage, progress, message }, message);
  const lang = opts.lang && opts.lang !== 'auto' ? opts.lang : /[\u0600-\u06ff]/.test(job.prompt) ? 'ar' : /[A-Za-z]/.test(job.prompt) ? 'en' : getSettings().language || 'ar';

  // 0. Index any footage that has not been described yet (so the director can choose clips).
  let library = (await listFootage()).filter(f => !f.labels?.sensitive && !(f.steps || []).some(s => s.sensitive?.length));
  const unlabeled = library.filter((f) => f.status === 'ready' && !f.labels).slice(0, 6);
  if (unlabeled.length) {
    step('footage-index', 0.02, `Watching ${unlabeled.length} new recording${unlabeled.length > 1 ? 's' : ''}…`);
    for (const f of unlabeled) { try { await labelFootage(f.id, { signal, complete: call }); } catch (e) { updateJob(job, {}, `Could not index ${f.name}: ${e.message}`); } }
    library = (await listFootage()).filter(f => !f.labels?.sensitive && !(f.steps || []).some(s => s.sensitive?.length));
  }
  const index = () => footageIndex(library);
  const device = await deviceCapture?.status().catch(() => null);

  // 1. Brief
  if (!job.brief) {
    step('brief', 0.05, 'Reading the request and writing the brief…');
    const prompt = `Today is ${today()}.\nRequest from the Goldcom marketing team:\n"""${job.prompt}"""\n\nPreferences: format ${opts.format || 'auto'}${opts.duration ? `, about ${opts.duration} s` : ''}, language ${lang === 'ar' ? 'Arabic' : 'English'}.\nPhone connected for live app capture: ${device?.ready ? `yes (${device.model})` : 'no'}.\n\nFootage library:\n${index()}\n\nWrite the production brief. If the format is "auto", choose the format that best serves the request (a step-by-step guide is usually a reel; a story about people is often a carousel or a reel).`;
    const brief = await call({ prompt, schema: BRIEF, effort: 'medium' });
    if (opts.format && opts.format !== 'auto' && FORMAT_OF[opts.format]) brief.format = opts.format;
    brief.lang = lang;
    job.title = brief.title;
    updateJob(job, { brief, title: brief.title }, `Brief: ${brief.format} · ${brief.key_message}`);
  }
  const brief = job.brief;
  if (brief.brand && !/^(goldcom|جولدكم)$/i.test(brief.brand.trim())) { block('This studio supports Goldcom only. Create the other client’s content in its own brand workspace.'); return 'needs-attention'; }

  // 2. Concepts
  if (!job.concepts) {
    step('concepts', 0.12, 'Claude is briefing ChatGPT on three fresh creative directions…');
    const history=await creativeHistory({excludeJob:job.id,excludeDoc:job.docId});
    let rejected=[];
    for(let attempt=0;attempt<3;attempt++){
      const prompt = `Brief:\n${J(brief)}\nFootage:\n${index()}\nKnown creative history (reference data, do not copy):\n${historyPrompt(history)}\n${rejected.length?`Rejected similarities to correct: ${J(rejected)}`:''}\nCreate exactly three genuinely different concepts A, B and C using three DIFFERENT visual families. Each needs a new premise, metaphor, framing, motion idea and narrative, not a recolour or rewording of a prior design. 3D is optional; at least two concepts should explore non-3D craft unless the user explicitly requires all-3D. Use executable scene capabilities, meaningful visuals on EVERY slide, no plain-text slides. Hooks in ${brief.lang==='ar'?'natural Omani dialect':'natural English'}.`;
      const res=await copyCall({prompt,schema:CONCEPTS});
      rejected=await reserveConcepts(job.id,res.concepts,{excludeDoc:job.docId});
      if(!rejected.length){updateJob(job,{concepts:res.concepts,originality:{status:'checked',scope:'Saved designs, library and reserved concepts',attempts:attempt+1}},`ChatGPT concepts: ${res.concepts.map(c=>`${c.id}) ${c.name}`).join(' · ')}`);break;}
      updateJob(job,{},`Reworking familiar concepts (${attempt+1}/3): ${rejected.join(' ')}`);
    }
    if(!job.concepts){block('The concepts are still too close to known work. Rebuild to explore new directions.',...rejected);return 'needs-attention';}
  }

  // 3. Pick (creative director) — or wait for the person to choose.
  if (!job.pick) {
    step('pick', 0.2, 'Creative director is comparing the concepts…');
    const prompt = `Brief:\n${J(brief)}\n\nConcepts from ChatGPT:\n${J(job.concepts)}\nKnown work to avoid:\n${historyPrompt(await creativeHistory({excludeJob:job.id,excludeDoc:job.docId}))}\nAct as Claude, an exacting creative director. Score each concept 1–10 on hook strength, clarity, brand fit, feasibility, and originality AGAINST THE KNOWN WORK. Reject recycled composition, opening, metaphor or narrative even if recoloured. Choose the strongest and list concrete improvements to structure and visuals. ChatGPT owns final wording. All slides need substantive art; 3D is optional.`;
    const pick = await call({ prompt, schema: PICK });
    updateJob(job, { pick }, `Director picks ${pick.winner}: ${pick.reason}`);
    if (opts.chooseConcept && !job.chosen) {
      updateJob(job, { status: 'waiting', stage: 'choose', message: 'Choose a concept to continue' });
      return 'waiting';
    }
  }
  if (!job.chosen) job.chosen = job.pick.winner;
  const concept = job.concepts.find((c) => c.id === job.chosen) || job.concepts[0];

  // 4. Storyboard
  if (!job.storyboard) {
    step('storyboard', 0.3, `Writing the storyboard for "${concept.name}"…`);
    const target = ['reel', 'story', 'motion'].includes(brief.format) ? `Total length about ${brief.duration_s || opts.duration || 25} s.` : `About ${brief.slide_count || 6} slides.`;
    const revising = job.revisionOf ? `\nCurrent storyboard (revise it according to the client feedback; keep what already works, change what the feedback asks for):\n${J(job.revisionOf)}\n` : '';
    const prompt = `Brief:\n${J(brief)}\n\nChosen concept:\n${J(concept)}\n${revising}${job.chosen === job.pick.winner ? `Director's improvements to apply:\n- ${job.pick.improvements.join('\n- ')}` : 'The client chose this concept.'}\n${job.feedback ? `\nClient feedback to apply:\n${job.feedback}\n` : ''}\nFootage library:\n${index()}\nPhone connected for capture: ${device?.ready ? 'yes' : 'no'}.\n\nWrite the final storyboard: format ${brief.format}, language ${brief.lang === 'ar' ? 'Arabic' : 'English'}. ${target} Use only scenes from the catalog. Write every on-screen word in final, polished form. Assign real footage (footage_id + from/to) wherever the app is shown; request capture where it is missing. Caption in the content language. Notes in English: at most 5 short practical checklist items for the person posting (no process commentary).`;
    const sb = cleanStoryboard(await call({ prompt, schema: STORYBOARD }), brief);
    updateJob(job, { storyboard: sb }, `Storyboard: ${sb.scenes.length} scenes`);
  }

  // 5. Footage: capture what is missing (when a phone is connected), then map clips to scenes.
  if (!job.footageDone) {
    job.storyboard.notes = (job.storyboard.notes || []).filter(n => !/^\d+ scene\(s\) use an illustrative mock screen/.test(n));
    const missing = job.storyboard.scenes.map((s, i) => ({ s, i })).filter(({ s }) => s.footage?.use && (!s.footage.footage_id || !library.find((f) => f.id === s.footage.footage_id && f.status === 'ready')));
    if (missing.length) {
      const goals = [...new Set(missing.map(({ s }) => s.footage.capture_goal).filter(Boolean))];
      if (device?.ready && opts.capture && goals.length) {
        for (const [gi, goal] of goals.entries()) {
          step('capture', 0.36 + gi * 0.04, `Recording the real app on ${device.model || 'the phone'}: ${goal}`);
          try {
            const meta = await deviceCapture.capture({ goal, lang: brief.lang, signal, complete: call, onMessage: (m) => updateJob(job, { message: m }, m) });
            await labelFootage(meta.id, { signal, complete: call }).catch(() => {});
          } catch (e) { updateJob(job, {}, `Capture failed: ${e.message}`); }
        }
        library = (await listFootage()).filter(f => !f.labels?.sensitive && !(f.steps || []).some(s => s.sensitive?.length));
      }
      const ready = library.filter((f) => f.status === 'ready');
      if (ready.length) {
        step('footage', 0.44, 'Matching footage to each step…');
        const list = missing.map(({ s, i }) => `Scene ${i + 1} (${s.scene}): ${s.purpose} · fields ${J(s.fields)} · wanted: ${s.footage.capture_goal}`).join('\n');
        const map = await call({ prompt: `These scenes need real app footage:\n${list}\n\nFootage library:\n${index()}\n\nAssign the best footage and an exact time range to each scene. A step's range starts ~0.5 s before ITS tap and ends once the resulting screen has settled — it must end at least 0.4 s BEFORE the next step's tap, so no later tap appears in it. If an instruction title does not match the real button label in the footage, give a corrected title. Use footage_id "" when nothing fits.`, schema: MAP, effort: 'medium' });
        const sb = job.storyboard;
        for (const a of map.assignments) {
          const sc = sb.scenes[a.scene - 1];
          if (!sc || !a.footage_id) continue;
          sc.footage = { ...sc.footage, use: true, footage_id: a.footage_id, from: a.from, to: a.to };
          if (a.title_fix) { const t = sc.fields.find((f) => f.key === 'title'); if (t) t.value = a.title_fix; }
        }
      }
      const still = job.storyboard.scenes.filter((s) => s.footage?.use && !s.footage.footage_id).length;
      if (still) job.storyboard.notes = [...(job.storyboard.notes || []), `${still} scene(s) use an illustrative mock screen because no matching recording exists. Add a verified recording in Footage, then press Rebuild with footage on this production.`];
    }
    updateJob(job, { footageDone: true, storyboard: job.storyboard });
  }

  const hardErrors = constraintIssues(job.storyboard, constraints);
  if (hardErrors.length) {
    const fixed = await call({ schema: STORYBOARD, prompt: `Repair this storyboard to satisfy every hard constraint. Keep all other approved facts and structure. Constraints: ${J(constraints)}. Errors: ${J(hardErrors)}. Storyboard: ${J(job.storyboard)}` });
    job.storyboard = cleanStoryboard(fixed, brief);
    updateJob(job, { storyboard: job.storyboard });
  }
  // 6. Build
  const illustrate = async () => {
    if(!job.illustrationsDone) {
      step('illustrate',.46,'Claude is drawing the custom scene artwork…');
      for(const scene of job.storyboard.scenes)if(['photo-story','painted-story'].includes(scene.scene)&&scene.footage?.footage_id){
        const media=await footageContent(scene);
        if(media.image){scene.fields=scene.fields.filter(f=>f.key!=='image');scene.fields.push({key:'image',value:media.image});}
      }
      job.storyboard=await realizeIllustrations(job.storyboard,{call,brief,request:job.prompt});
      job.illustrationsDone=true;
      updateJob(job,{storyboard:job.storyboard,illustrationsDone:true});
    }
  };
  await illustrate();
  const polishCopy = async () => {
    const fingerprint=JSON.stringify(copyInput(job.storyboard));
    if(job.copyFingerprint===fingerprint)return;
    step('copy',.48,'ChatGPT is writing and checking Omani Arabic and English…');
    let copyError = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const packet = await copyCall({ schema: BILINGUAL_COPY, prompt: `Claude's storyboard for copywriting:\n${J(copyInput(job.storyboard))}\nBrief: ${J(brief)}\nClient request: ${job.prompt}\nFeedback: ${job.feedback||''}\nLatest director review (binding revision direction): ${J(job.reviews?.at(-1)||job.copyDirection||null)}\nPrevious validation error: ${copyError}\nPreserve accepted meaning and every marked emphasis span. Resolve the director's latest issues instead of rewriting everything back to a generic hook.\nRequired exact wording: ${J(constraints)}\nWrite BOTH versions: ar in natural Omani dialect, en in polished English. Keep scene numbers and the exact set of supplied field keys for every scene, including empty fields. Finalise every word in those fields and the caption. Preserve all numbers, approved facts, legal text and literal real app button labels. No invented claims. Keep titles short (about 6 Arabic / 7 English words). Do not add technical fields, URLs or change the visual plan. Preserve required exact wording in the requested output language version.`});
      try {
        job.storyboard = applyCopy(job.storyboard, packet, brief.lang);
      } catch (error) {
        copyError = error.message;
        if (attempt === 1) throw error;
        continue;
      }
      job.copyVariants = packet;
      job.copyFingerprint = JSON.stringify(copyInput(job.storyboard));
      updateJob(job, { storyboard: job.storyboard, copyVariants: packet, copyFingerprint: job.copyFingerprint, copywriter: 'ChatGPT' });
      return;
    }
  };
  await polishCopy();
  const source = { type: 'production', jobId: job.id, prompt: job.prompt, lastWriter: 'studio-ai', copywriter: 'ChatGPT', director: 'Claude' };
  step('build', 0.5, 'Building the scenes…');
  await locateRegions(job.storyboard, call);
  let doc = await buildDoc(job.storyboard, brief, { docId: job.docId, source, preservedSlides: job.preservedSlides });
  updateJob(job, { docId: doc.id, builtSlides: doc.slides }, `Design ${doc.id} built`);

  // 7. Review rounds (art director looks at rendered frames)
  job.reviews = job.reviews || [];
  let finalReviewed = job.reviews.length > 0 && job.reviewedFingerprint === reviewFingerprint(doc);
  const finalRound = Math.max(opts.reviewRounds, job.reviews.length);
  for (let round = job.reviews.length; !finalReviewed && round <= finalRound; round++) {
    step('review', 0.56 + round * 0.12, `Art director review, round ${round + 1}…`);
    let frames;
    try {
      frames = await renderReviews({ base, doc, times: reviewTimes(doc, { perSlide: isSequence(doc.kind) ? 4 : 1 }), scale: isSequence(doc.kind) ? 0.6 : 0.7 });
    } catch (e) {
      if (signal.aborted) throw e;
      // The design is already built; a renderer hiccup should not throw the production away.
      updateJob(job, {}, `Art director review skipped: the frames could not be rendered (${e.message.split('\n')[0]})`);
      break;
    }
    const lint = lintDocument(doc).map((i) => `[${i.level}] scene ${i.slide + 1}: ${i.message}`);
    const images = frames.map((f) => ({ data: f.buf.toString('base64'), mediaType: 'image/jpeg', label: f.label }));
    const prompt = `You are reviewing the rendered ${brief.format} "${job.storyboard.title}" (${brief.lang === 'ar' ? 'Arabic' : 'English'}). The images are frames in order, labelled by scene.\n\nStoryboard (scene numbers are 1-based):\n${J(job.storyboard.scenes.map((s, i) => ({ n: i + 1, scene: s.scene, duration: s.duration, theme: s.theme, fields: s.fields, footage: s.footage })))}\n\nCaption and hashtags: ${J(job.storyboard.caption)}\n\nAutomatic brand check:\n${lint.join('\n') || 'no issues'}\n\nReview like a demanding art director and brand guardian: hook strength, legibility on a phone, hierarchy, overlaps/clipping, Instagram safe zones, footage relevance (does the screen match the instruction?), pacing, story clarity, brand voice, claims and disclaimers, Arabic quality, AI-sounding copy. Then give precise edits (field values in final form). Verdict "ship" only if it is genuinely ready to post (score ≥ 8).`;
    const review = await call({ prompt:`Client request (binding): ${job.prompt}\nBrief (requested count overrides house defaults): ${J(brief)}\nFinal copy has ALREADY been authored by ChatGPT. Judge its actual Omani dialect, clarity and visual fit. Do not demand another copywriter pass when it has already happened. No fixed carousel minimum overrides an explicit count. A comment/education objective does not require app-store lines or a download CTA. The cover brand mark meets document branding; do not demand a logo on every slide.\nFor illustrated-scene, the drawing field is REAL executable declarative art. If the picture needs correction, edit drawing using valid JSON shapes and matching label positions; changing art_note prose alone changes no picture. Never replace a bespoke scene with a missing photo or library demo image.\n${prompt}`, images, schema: REVIEW,maxTokens:16000 });
    job.reviews.push({ round: round + 1, ...review });
    updateJob(job, { reviews: job.reviews, reviewedFingerprint: reviewFingerprint(doc) }, `Review ${round + 1}: ${review.score}/10 — ${review.summary}`);
    if ((review.verdict === 'ship' && review.score >= 8 && !review.issues.some(i => i.severity === 'blocker')) || round === finalRound || (!review.edits?.length && !review.caption_fix && !review.hashtags_fix?.length)) { finalReviewed = true; break; }
    // Apply the fixes; the last round's fixes are applied too, they just are not reviewed again.
    job.storyboard = cleanStoryboard(applyReview(job.storyboard, review), brief);
    job.illustrationsDone=false;
    await illustrate();
    await polishCopy();
    step('build', 0.6 + round * 0.12, `Applying ${review.edits.length} fix${review.edits.length > 1 ? 'es' : ''}…`);
    for (const e of review.edits) { const sc = job.storyboard.scenes[e.scene - 1]; if (sc && e.set?.some((x) => ['callout', 'from'].includes(x.key))) sc.located = false; }
    await locateRegions(job.storyboard, call);
    doc = await buildDoc(job.storyboard, brief, { docId: doc.id, source, preservedSlides: job.preservedSlides });
    updateJob(job, { storyboard: job.storyboard, builtSlides: doc.slides });
  }

  // The gate applies to the exact document revision that was just reviewed.
  const lastReview = job.reviews.at(-1);
  const constraintErrors = constraintIssues(job.storyboard, constraints);
  const originalityErrors=job.originality ? finalOriginalityIssues(job.storyboard,await creativeHistory({excludeJob:job.id,excludeDoc:doc.id})) : [];
  const quality = productionReadiness(doc, finalReviewed ? lastReview : null, [...constraintErrors,...originalityErrors]);
  doc.approval = { ...quality, revision: doc.revision + 1, reviewedAt: new Date().toISOString() };
  doc = await saveDocument(doc);
  if (!quality.ready) { block(...quality.blockers); return 'needs-attention'; }
  // 8. Export
  let exportJobId = null;
  if (opts.autoExport && isSequence(doc.kind) && startExport) {
    step('export', 0.9, 'Rendering the final video…');
    const ex = startExport({ docId: doc.id });
    exportJobId = ex.id;
    await new Promise((resolve) => {
      const t = setInterval(() => { if (ex.status !== 'running') { clearInterval(t); resolve(); } }, 500);
      signal.addEventListener('abort', () => { clearInterval(t); resolve(); }, { once: true });
    });
    if (signal.aborted) { ex.controller?.abort(); throw new Error('Cancelled'); }
    if (ex.status !== 'done') { block(`Video export failed: ${ex.error || ex.status}`); return 'needs-attention'; }
    if (ex.status === 'done') updateJob(job, { video: ex.result }, `Video ready: ${ex.result.file}`);
    else updateJob(job, {}, `Video export failed: ${ex.error || ex.status}`);
  }
  if (signal.aborted) throw new Error('Cancelled');
  doc = await getDocument(doc.id);
  const last = job.reviews[job.reviews.length - 1];
  updateJob(job, { status: 'done', stage: 'done', progress: 1, message: 'Ready', result: { docId: doc.id, video: job.video || null, exportJobId, score: last?.score ?? null } }, 'Production complete');
  return 'done';
}

/** Apply a follow-up instruction to a finished production ("make the hook punchier", "use Aisha instead"). */
export function prepareRevision(job, note) {
  job.feedback = note;
  job.video = null;
  job.result = null;
  job.blockers = [];
  job.revisionOf = job.storyboard || null;
  job.storyboard = null;
  job.illustrationsDone = false;
  job.copyFingerprint = null;
  job.copyVariants = null;
  job.footageDone = false;
  job.reviews = [];
  job.status = 'running';
  return job;
}

export const PIPELINE_STAGES = [
  ['brief', 'Brief'], ['concepts', 'ChatGPT ideas'], ['pick', 'Claude direction'], ['storyboard', 'Storyboard'], ['footage', 'Footage'], ['illustrate','Custom artwork'], ['copy', 'Bilingual copy'], ['build', 'Build'], ['review', 'Review'], ['export', 'Video'], ['done', 'Ready'],
];
