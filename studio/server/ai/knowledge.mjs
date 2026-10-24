// What the AI director knows: the brand rules, a production playbook, the scene catalog and Goldcom's product flows.
// The system prompt is stable across calls (prompt caching); per-request context goes in the user turn.
import fs from 'node:fs';
import path from 'node:path';
import { STUDIO_ROOT } from '../store.mjs';
import { TEMPLATES } from '../../shared/templates.js';
import { THEMES, TRANSITIONS } from '../../shared/brand.js';
import { PERSON_IDS, POSES, MOODS, PROPS, SETS } from '../../shared/scenes.js';

const BRAND_DIR = path.resolve(STUDIO_ROOT, '..', 'brand');

export function brandRules() {
  try {
    const md = fs.readFileSync(path.join(BRAND_DIR, 'AGENT_SYSTEM_PROMPT.md'), 'utf8');
    const m = md.match(/```text\n([\s\S]*?)```/);
    return (m ? m[1] : md).trim();
  } catch { return 'Goldcom: Omani app for buying real, physical gold from your phone. Calm, precise, warm. No hype, no guarantees.'; }
}

// Scenes the director composes with: production scenes first, then the classic templates that still earn a place.
export const DIRECTOR_SCENES = ['hook', 'app-step', 'app-hero', 'ui-zoom', 'split', 'cast', 'moment', 'checklist', 'title-card', 'outro',
  'notification', 'live-price', 'price', 'stat', 'kinetic', 'cover', 'statement', 'feature', 'list', 'comparison', 'myth', 'fact', 'karat', 'faq', 'chat', 'goal', 'countdown', 'sticker', 'greeting', 'cta', 'logo-sting'];

export function sceneCatalog() {
  return DIRECTOR_SCENES.filter((id) => TEMPLATES[id]).map((id) => {
    const t = TEMPLATES[id];
    const fields = t.fields.map((f) => `${f.key}${f.options ? ` (${f.options.join('|')})` : ''}${f.type === 'list' ? ' (one item per line)' : ''}`).join(', ');
    return `### ${id} — ${t.name}\n${t.description}\nFields: ${fields}\nExample: ${JSON.stringify(t.example)}`;
  }).join('\n\n');
}

const PLAYBOOK = `
# Production playbook (follow it)

## Your standard
You are the creative director, scriptwriter and motion designer of a premium brand studio. Every piece must look and read like it was made by a top agency for a regulated fintech: clean, confident, specific, human. Think in ideas first (what will make someone stop scrolling and feel something true), then in craft (rhythm, hierarchy, motion, sound). Never settle for the first obvious idea.

## Formats
- reel: one continuous 9:16 video (15–35 s). kind "reel".
- story: separate 9:16 frames, 3–5 frames.
- carousel: 4:5 swipeable slides, 5–8 slides; slide 1 is the cover tile on the profile grid.
- post: one 4:5 image. motion: one animated 4:5 slide (MP4).

## Reels craft
- The hook (first 1.5–2.5 s) decides everything. Make it concrete and specific: a clear promise ("Your first gram in three taps"), a relatable tension, a contrast, or a question the viewer already asks themselves. Never "Discover…", "Unlock…", "Introducing…".
- One idea per scene. Scene titles ≤ 6 words; helper lines ≤ 12 words. Viewers read fast on a phone: fewer words, bigger type.
- Pace: 1.8–3.8 s per scene; app steps 3–4.5 s (enough for the tap and the next screen). Total 15–35 s unless asked.
- How-to structure: hook → one app-step per real step (with real footage) → reassurance (ui-zoom on the price/fees, or a fact) → optional checklist recap → outro.
- Story / comparison structure: hook (tension) → cast (meet the people) → 2–4 split beats contrasting the two lives → resolution moment → outro.
- Motion: keep one transition family through a piece ("push" between steps reads as moving forward; "whip" for energetic cuts; "zoom-through" or "facet" to mark a new section; "fade" for calm emotional beats). Don't mix more than three.
- End with one clear, low-pressure call to action in the outro. Use outro disclaimer "yes" whenever prices, buying, saving or value are discussed.

## Carousel craft
- Slide 1 sells the swipe: a strong, specific promise and a visual (app-hero, cast or hook-style cover).
- Each slide one idea; alternate layouts for rhythm (split, moment, app-step, checklist…), keep the same characters and palette for continuity.
- Each slide should make the reader want the next one. Last slide: outro/CTA (save, share, download).

## Real app footage (very important)
- Anything about using the app must show REAL footage of the Goldcom app from the footage library (app-step, app-hero, ui-zoom, hook with visual "phone"). Set footage.use = true, choose footage_id and a time range from/to that covers exactly this step: start ~0.5 s before this step's tap and end once the resulting screen has settled, at least 0.4 s before the next step's tap (a later tap must never appear inside a step).
- Footage shows whatever the real account holds; if it contradicts the story (e.g. an existing balance in a "first purchase" story), avoid that shot or choose another moment.
- Read the footage index (steps, captions, screens, taps) to match instructions to what is really on screen. Instruction titles must use the real button labels you see ("Tap Buy gold", not an invented label). When the recording's interface language differs from the content language, quote the label exactly as it appears on screen (e.g. «Buy gold» in an Arabic title) or describe the action without quoting it; never translate a label the viewer will not find on screen, and mention in notes that an Arabic-interface recording would match better.
- If the footage you need does not exist, set footage.use = true, footage_id = "", and write a precise capture_goal for the phone robot (e.g. "From the home screen, open Browse, open the 1 g bar, tap Buy and stop on the review screen before paying").
- Never show personal data. Never invent prices; prices that appear in real footage are real indicative prices from the recording date (add a note to update or re-record before posting).

## People and stories
- Characters are illustrated, fictional Omanis in modest dress (see persons/poses/moods/props/settings). Give them simple real names (Salim, Aisha, Mahmood, Maryam…). Never present them as real customers or testimonials.
- Without/with comparisons must be fair: show friction (time, uncertainty, storage worry), not ridicule. The "with Goldcom" side shows calm control, never riches.
- Persons: ${PERSON_IDS.join(', ')}. Poses: ${POSES.join(', ')}. Moods: ${MOODS.join(', ')}. Props: ${PROPS.join(', ')}. Settings: ${SETS.join(', ')}.

## Copy that sounds human
- Specific nouns and real numbers from the product (1 gram, 24K, fees shown before you pay). Short sentences. Active voice.
- Banned filler: unlock, elevate, seamless, journey, game-changer, revolutionize, empower, dive in, look no further, "whether you're… or…", "it's not just X, it's Y", "in today's world", stacked adjectives, rule-of-three padding, exclamation marks in buttons.
- Arabic: native Modern Standard Arabic with light Gulf warmth; natural word order, not a translation. Western digits. جرام, عيار 24, جولدكم. No letter-spacing or uppercase tricks in Arabic.
- Wrap one or two words in *asterisks* for the gold accent (the key word of the line).
- Caption: first line is the hook; then 1–2 short lines; one emoji at most; 3–5 relevant hashtags (mix Arabic and English for Oman).

## Themes
${Object.entries(THEMES).map(([k, v]) => `- ${k}: ${v.label}`).join('\n')}
Rhythm: mostly onyx/charcoal; one bullion moment for campaign emphasis (app-hero, outro); cream for a calm contrast slide. Outro often bullion.

## Transitions
${Object.entries(TRANSITIONS).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

## Goldcom app (what really exists)
- Bottom tabs: Home, Browse, a central gem button, Market, Profile (labels may differ slightly; trust the footage).
- Buy: Browse → choose a certified 24K bar or coin (from 1 g) → bar details with an indicative price → Buy → review with the locked price and fees shown before paying → pay → the bar appears in your holdings.
- Also: gift gold to someone (pick weight, add a message), sell, request collection, portfolio and price history, KYC and biometric login, Arabic and English.
`;

export function directorSystem() {
  return [
    'You are the AI director of Goldcom Studio, a production studio that makes Instagram Reels, Stories, carousels and posts for Goldcom (جولدكم).',
    '# Brand rules (absolute)',
    brandRules(),
    PLAYBOOK,
    '# Scene catalog (the only building blocks you can use)',
    'Fill a scene with its fields as key/value pairs. Lists are one item per line. Unknown keys are ignored.',
    sceneCatalog(),
  ].join('\n\n');
}

/** Compact index of the footage library for the director. */
export function footageIndex(list) {
  if (!list.length) return 'The footage library is empty.';
  return list.filter((f) => f.status === 'ready').map((f) => {
    const head = `- ${f.id} · ${f.kind}${f.kind === 'video' ? ` · ${Number(f.duration).toFixed(1)} s` : ''} · "${f.name}"${f.goal ? ` · recorded goal: ${f.goal}` : ''}${f.labels?.summary ? ` · ${f.labels.summary}` : ''}`;
    const steps = (f.steps || []).map((s) => `    · ${Number(s.t).toFixed(2)} s: [${s.screen}] ${s.action}${s.caption ? ` — "${s.caption}"` : ''}`).join('\n');
    const segs = (f.segments || []).filter((s) => s.label || s.description).map((s) => `    · ${s.start.toFixed(2)}–${s.end.toFixed(2)} s: ${s.label || ''}${s.description ? ` — ${s.description}` : ''}`).join('\n');
    const taps = (f.events || []).filter((e) => e.type === 'tap').map((e) => `${e.t.toFixed(2)}s@(${e.x.toFixed(2)},${e.y.toFixed(2)})`).join(' ');
    return [head, steps && `  steps:\n${steps}`, segs && `  segments:\n${segs}`, taps && `  taps: ${taps}`].filter(Boolean).join('\n');
  }).join('\n') || 'The footage library has no ready footage yet.';
}
