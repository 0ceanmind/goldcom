// The production pipeline: a request in plain words becomes a finished, reviewed Reel / carousel / Story / post.
//   brief → 3 concepts → creative-director pick → storyboard → footage (library or live phone capture)
//   → build → render + art-director review (up to N rounds) → final export
// Every stage's output is kept on the job so the UI can show the thinking and a production can resume.
import { complete } from './engine.mjs';
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
const BRIEF = {
  type: 'object', additionalProperties: false,
  required: ['title', 'format', 'lang', 'objective', 'audience', 'key_message', 'tone', 'duration_s', 'slide_count', 'must_include', 'app_flows_needed', 'needs_people', 'mentions_prices', 'assumptions'],
  properties: {
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

const CONCEPTS = {
  type: 'object', additionalProperties: false, required: ['concepts'],
  properties: {
    concepts: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'name', 'angle', 'hook', 'beats', 'visual_style', 'why_it_works', 'risk'],
        properties: {
          id: { type: 'string', enum: ['A', 'B', 'C'] }, name: str, angle: str,
          hook: { type: 'string', description: 'The exact opening line, in the content language' },
          beats: { type: 'array', items: str, description: 'Scene-by-scene beats' },
          visual_style: str, why_it_works: str, risk: str,
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
    score: { type: 'integer', description: '1–10, where 8+ is ready to post' },
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
    c[key] = key === 'items' || key === 'messages' || key === 'products' || key === 'rows' || key === 'before' || key === 'after' || key === 'ticker' || key === 'lines' ? String(value).split('\n').map((x) => x.trim()).filter(Boolean) : value;
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
  if (meta.status !== 'ready') return {};
  if (meta.kind === 'image') return { footage: `/footage/${meta.id}/image${meta.ext || '.png'}`, screenshot: `/footage/${meta.id}/image${meta.ext || '.png'}` };
  const from = Math.max(0, Math.min(meta.duration - 0.3, Number(f.from) || 0));
  const to = Math.max(from + 0.4, Math.min(meta.duration, Number(f.to) || from + 3));
  const taps = (meta.events || []).filter((e) => e.type === 'tap').map((e) => ({ t: e.t, x: e.x, y: e.y }));
  return { footage: `/footage/${meta.id}/video.mp4`, from: +from.toFixed(2), to: +to.toFixed(2), taps };
}

export async function buildDoc(sb, brief, { docId = null, source } = {}) {
  const { format, kind } = FORMAT_OF[brief.format] || FORMAT_OF.reel;
  const slides = [];
  for (const s of sb.scenes) {
    const content = { ...fieldsToContent(s.fields), ...(await footageContent(s)) };
    if (s.scene === 'outro' && brief.mentions_prices && !content.disclaimer) content.disclaimer = 'yes';
    slides.push({ template: s.scene, theme: s.theme, duration: s.duration, transition: s.transition, content });
  }
  const doc = await createFromSpec({ name: sb.title || brief.title || 'Goldcom production', format, kind, lang: brief.lang, slides, source });
  doc.caption = { text: sb.caption?.text || '', hashtags: sb.caption?.hashtags || [] };
  doc.audio = { music: sb.music && sb.music !== 'none' ? sb.music : getSettings().music || 'none', sfx: true };
  doc.notes = (sb.notes || []).join('\n');
  if (docId) doc.id = docId;
  return saveDocument(doc);
}

function applyReview(sb, review) {
  const scenes = sb.scenes.map((s) => ({ ...s, fields: [...s.fields] }));
  const removed = new Set();
  for (const e of review.edits || []) {
    const s = scenes[e.scene - 1];
    if (!s) continue;
    if (e.remove) { removed.add(e.scene - 1); continue; }
    for (const { key, value } of e.set || []) {
      const i = s.fields.findIndex((f) => f.key === key);
      if (i >= 0) s.fields[i] = { key, value }; else s.fields.push({ key, value });
    }
    if (e.duration > 0) s.duration = e.duration;
    if (e.theme && THEMES[e.theme]) s.theme = e.theme;
    if (e.transition && TRANSITIONS[e.transition]) s.transition = e.transition;
    if (e.replace_scene && TEMPLATES[e.replace_scene] && DIRECTOR_SCENES.includes(e.replace_scene)) s.scene = e.replace_scene;
  }
  const caption = { ...sb.caption, ...(review.caption_fix ? { text: review.caption_fix } : {}), ...(review.hashtags_fix?.length ? { hashtags: review.hashtags_fix } : {}) };
  return { ...sb, scenes: scenes.filter((_, i) => !removed.has(i)), caption };
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
export async function runProduction(job, { base, startExport, deviceCapture }) {
  const signal = job.controller.signal;
  const opts = { reviewRounds: 2, autoExport: true, capture: true, ...(job.options || {}) };
  job.usage = job.usage || { costUsd: 0, input: 0, output: 0, calls: 0 };
  const onUsage = (u) => { job.usage.calls++; job.usage.costUsd += u.costUsd || 0; job.usage.input += u.input || 0; job.usage.output += u.output || 0; };
  const SYSTEM = directorSystem();
  const call = (o) => complete({ system: SYSTEM, signal, onUsage, effort: getSettings().effort || 'high', ...o });
  const step = (stage, progress, message) => updateJob(job, { stage, progress, message }, message);
  const lang = opts.lang && opts.lang !== 'auto' ? opts.lang : getSettings().language || 'ar';

  // 0. Index any footage that has not been described yet (so the director can choose clips).
  let library = await listFootage();
  const unlabeled = library.filter((f) => f.status === 'ready' && !f.labels).slice(0, 6);
  if (unlabeled.length) {
    step('footage-index', 0.02, `Watching ${unlabeled.length} new recording${unlabeled.length > 1 ? 's' : ''}…`);
    for (const f of unlabeled) { try { await labelFootage(f.id, { signal }); } catch (e) { updateJob(job, {}, `Could not index ${f.name}: ${e.message}`); } }
    library = await listFootage();
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

  // 2. Concepts
  if (!job.concepts) {
    step('concepts', 0.12, 'Exploring three creative directions…');
    const prompt = `Brief:\n${J(brief)}\n\nFootage library:\n${index()}\n\nCreate three genuinely different creative concepts (A, B, C) for this brief. Vary the angle (e.g. practical demo, human story, surprising fact, contrast, POV), the hook and the visual treatment. Each must be producible with the scene catalog and the footage that exists or can be captured. Hooks in ${brief.lang === 'ar' ? 'Arabic' : 'English'}.`;
    const res = await call({ prompt, schema: CONCEPTS });
    updateJob(job, { concepts: res.concepts }, `Concepts: ${res.concepts.map((c) => `${c.id}) ${c.name}`).join(' · ')}`);
  }

  // 3. Pick (creative director) — or wait for the person to choose.
  if (!job.pick) {
    step('pick', 0.2, 'Creative director is comparing the concepts…');
    const prompt = `Brief:\n${J(brief)}\n\nConcepts:\n${J(job.concepts)}\n\nAct as an exacting creative director who has not seen these before. Score each concept 1–10 on hook strength, clarity, brand fit, feasibility with real app footage, and originality. Choose the strongest and list concrete improvements (sharper hook wording, a better beat order, a cut, a stronger visual).`;
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
    const missing = job.storyboard.scenes.map((s, i) => ({ s, i })).filter(({ s }) => s.footage?.use && (!s.footage.footage_id || !library.find((f) => f.id === s.footage.footage_id && f.status === 'ready')));
    if (missing.length) {
      const goals = [...new Set(missing.map(({ s }) => s.footage.capture_goal).filter(Boolean))];
      if (device?.ready && opts.capture && goals.length) {
        for (const [gi, goal] of goals.entries()) {
          step('capture', 0.36 + gi * 0.04, `Recording the real app on ${device.model || 'the phone'}: ${goal}`);
          try {
            const meta = await deviceCapture.capture({ goal, lang: brief.lang, signal, onMessage: (m) => updateJob(job, { message: m }, m) });
            await labelFootage(meta.id, { signal }).catch(() => {});
          } catch (e) { updateJob(job, {}, `Capture failed: ${e.message}`); }
        }
        library = await listFootage();
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
      if (still) job.storyboard.notes = [...(job.storyboard.notes || []), `${still} scene(s) use an illustrative mock screen because no matching recording exists. Record the flow (Footage → Phone) and press Rebuild to swap in real footage.`];
    }
    updateJob(job, { footageDone: true, storyboard: job.storyboard });
  }

  // 6. Build
  const source = { type: 'production', jobId: job.id, prompt: job.prompt, lastWriter: 'studio-ai' };
  step('build', 0.5, 'Building the scenes…');
  await locateRegions(job.storyboard, call);
  let doc = await buildDoc(job.storyboard, brief, { docId: job.docId, source });
  updateJob(job, { docId: doc.id }, `Design ${doc.id} built`);

  // 7. Review rounds (art director looks at rendered frames)
  job.reviews = job.reviews || [];
  for (let round = job.reviews.length; round < opts.reviewRounds; round++) {
    step('review', 0.56 + round * 0.12, `Art director review, round ${round + 1}…`);
    let frames;
    try {
      frames = await reviewFrames({ base, doc, times: reviewTimes(doc, { perSlide: isSequence(doc.kind) ? 2 : 1 }), scale: isSequence(doc.kind) ? 0.36 : 0.45 });
    } catch (e) {
      if (signal.aborted) throw e;
      // The design is already built; a renderer hiccup should not throw the production away.
      updateJob(job, {}, `Art director review skipped: the frames could not be rendered (${e.message.split('\n')[0]})`);
      break;
    }
    const lint = lintDocument(doc).map((i) => `[${i.level}] scene ${i.slide + 1}: ${i.message}`);
    const images = frames.map((f) => ({ data: f.buf.toString('base64'), mediaType: 'image/jpeg', label: f.label }));
    const prompt = `You are reviewing the rendered ${brief.format} "${job.storyboard.title}" (${brief.lang === 'ar' ? 'Arabic' : 'English'}). The images are frames in order, labelled by scene.\n\nStoryboard (scene numbers are 1-based):\n${J(job.storyboard.scenes.map((s, i) => ({ n: i + 1, scene: s.scene, duration: s.duration, theme: s.theme, fields: s.fields, footage: s.footage })))}\n\nCaption: ${job.storyboard.caption?.text}\n\nAutomatic brand check:\n${lint.join('\n') || 'no issues'}\n\nReview like a demanding art director and brand guardian: hook strength, legibility on a phone, hierarchy, overlaps/clipping, Instagram safe zones, footage relevance (does the screen match the instruction?), pacing, story clarity, brand voice, claims and disclaimers, Arabic quality, AI-sounding copy. Then give precise edits (field values in final form). Verdict "ship" only if it is genuinely ready to post (score ≥ 8).`;
    const review = await call({ prompt, images, schema: REVIEW });
    job.reviews.push({ round: round + 1, ...review });
    updateJob(job, { reviews: job.reviews }, `Review ${round + 1}: ${review.score}/10 — ${review.summary}`);
    if (review.verdict === 'ship' || (!review.edits?.length && !review.caption_fix && !review.hashtags_fix?.length)) break;
    // Apply the fixes; the last round's fixes are applied too, they just are not reviewed again.
    job.storyboard = cleanStoryboard(applyReview(job.storyboard, review), brief);
    step('build', 0.6 + round * 0.12, `Applying ${review.edits.length} fix${review.edits.length > 1 ? 'es' : ''}…`);
    for (const e of review.edits) { const sc = job.storyboard.scenes[e.scene - 1]; if (sc && e.set?.some((x) => ['callout', 'from'].includes(x.key))) sc.located = false; }
    await locateRegions(job.storyboard, call);
    doc = await buildDoc(job.storyboard, brief, { docId: doc.id, source });
    updateJob(job, { storyboard: job.storyboard });
  }

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
    if (ex.status === 'done') updateJob(job, { video: ex.result }, `Video ready: ${ex.result.file}`);
    else updateJob(job, {}, `Video export failed: ${ex.error || ex.status}`);
  }
  doc = await getDocument(doc.id);
  const last = job.reviews[job.reviews.length - 1];
  updateJob(job, { status: 'done', stage: 'done', progress: 1, message: 'Ready', result: { docId: doc.id, video: job.video || null, exportJobId, score: last?.score ?? null } }, 'Production complete');
  return 'done';
}

/** Apply a follow-up instruction to a finished production ("make the hook punchier", "use Aisha instead"). */
export function prepareRevision(job, note) {
  job.feedback = [job.feedback, note].filter(Boolean).join('\n');
  job.revisionOf = job.storyboard || null;
  job.storyboard = null;
  job.footageDone = false;
  job.reviews = [];
  job.status = 'running';
  return job;
}

export const PIPELINE_STAGES = [
  ['brief', 'Brief'], ['concepts', 'Concepts'], ['pick', 'Direction'], ['storyboard', 'Storyboard'], ['footage', 'Footage'], ['build', 'Build'], ['review', 'Review'], ['export', 'Video'], ['done', 'Ready'],
];
