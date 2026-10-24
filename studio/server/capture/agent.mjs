// Claude operates the real Goldcom app on a connected Android phone and records a clean take.
// 1. Rehearsal: Claude looks at each screen (screenshot + UI elements) and decides the next tap, step by step,
//    until the goal screen is reached. Nothing is recorded, so thinking time never shows in the footage.
// 2. Take: the app restarts, the status bar switches to demo mode (09:41, full battery) and the rehearsed steps are
//    replayed at a natural pace while the screen records. Every tap is logged so the editor can add tap ripples and
//    zoom the camera to the right place.
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { complete } from '../ai/engine.mjs';
import { ffmpeg } from '../media/ffmpeg.mjs';
import { toDriver } from './driver.mjs';
import { importFootage, updateFootage, getFootage } from '../footage/store.mjs';
import { alignEvents } from '../footage/align.mjs';

const sleep = (ms, signal) => new Promise((r, j) => { const t = setTimeout(r, ms); signal?.addEventListener('abort', () => { clearTimeout(t); j(new Error('Cancelled')); }, { once: true }); });

async function shrink(png, width = 540) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'gc-shot-'));
  const inp = path.join(dir, 'in.png'), out = path.join(dir, 'out.jpg');
  await fsp.writeFile(inp, png);
  await ffmpeg(['-i', inp, '-vf', `scale=${width}:-2`, '-q:v', '4', out]);
  const buf = await fsp.readFile(out);
  fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  return buf;
}

/** Wait until the screen stops changing (or a timeout). Live prices tick, so "nearly the same" counts as settled. */
async function settle(d, { min = 700, max = 4500, signal } = {}) {
  const t0 = Date.now();
  await sleep(min, signal);
  let prev = await d.screenshot();
  while (Date.now() - t0 < max) {
    await sleep(350, signal);
    const cur = await d.screenshot();
    if (Math.abs(cur.length - prev.length) / prev.length < 0.004) return { png: cur, ms: Date.now() - t0 };
    prev = cur;
  }
  return { png: prev, ms: Date.now() - t0 };
}

const SYSTEM = `You operate the real Goldcom mobile app (an Omani app for buying real, physical gold) on an Android phone, to film a product demo.
You see one screenshot at a time plus a numbered list of the on-screen elements with their bounds (pixels).
Choose exactly ONE next action that moves towards the goal. Prefer tapping a listed element by its number.

Safety rules (absolute):
- Never complete a payment, purchase, sale, transfer or gift. Stop with action "done" on the last review/confirmation screen BEFORE the final confirm button. Never press "Pay", "Confirm", "Confirm purchase", "Sell now", "Send gift" or similar final buttons.
- Never type passwords, OTP codes, card numbers or personal data. If a login, OTP or identity check blocks the goal, use "abort" and explain.
- Do not change account settings, delete anything, or open links outside the app.
- If a system dialog (permissions, updates, rating prompts) appears, dismiss it in the least invasive way (e.g. "Not now", "Later", back).

Filming guidance: take the clearest, most typical path a new customer would take. Avoid detours. When choosing amounts, prefer small typical values (e.g. 1 gram). Flag screens that show personal data (names, balances, phone numbers, IDs) so they can be blurred.`;

const STEP_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['screen_name', 'observation', 'action', 'element', 'x', 'y', 'text', 'caption', 'reason', 'sensitive_regions'],
  properties: {
    screen_name: { type: 'string', description: 'Short name of the current screen, e.g. "Home", "Browse", "Bar details", "Checkout review"' },
    observation: { type: 'string' },
    action: { type: 'string', enum: ['tap', 'type', 'swipe_up', 'swipe_down', 'swipe_left', 'swipe_right', 'back', 'wait', 'done', 'abort'] },
    element: { type: 'integer', description: 'Element number to act on, or -1' },
    x: { type: 'number', description: 'Tap x as a fraction of screen width (0..1), used when element is -1' },
    y: { type: 'number', description: 'Tap y as a fraction of screen height (0..1), used when element is -1' },
    text: { type: 'string', description: 'Text to type for action "type" (ASCII digits/letters only), else ""' },
    caption: { type: 'string', description: 'Viewer-facing caption for what this step shows, 2-6 words, in the requested language' },
    reason: { type: 'string' },
    sensitive_regions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['x', 'y', 'w', 'h'], properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } } }, description: 'Areas (fractions of the screen) showing personal data to blur; [] if none' },
  },
};

function describeElements(els, W, H) {
  return els.slice(0, 80).map((e, i) => {
    const [x1, y1, x2, y2] = e.bounds;
    const label = [e.text && `"${e.text.slice(0, 40)}"`, e.desc && `desc:"${e.desc.slice(0, 40)}"`, e.id && `id:${e.id}`].filter(Boolean).join(' ') || e.cls;
    const flags = [e.clickable && 'clickable', e.editable && 'input', e.scrollable && 'scrollable', e.checked && 'checked'].filter(Boolean).join(',');
    return `${i}. ${label} [${flags}] @ (${x1},${y1})-(${x2},${y2})`;
  }).join('\n') + `\n(screen ${W}x${H})`;
}

async function perform(d, info, step, els) {
  const W = info.width, H = info.height;
  let x = step.x * W, y = step.y * H;
  if (step.element >= 0 && els[step.element]) { const [x1, y1, x2, y2] = els[step.element].bounds; x = (x1 + x2) / 2; y = (y1 + y2) / 2; }
  switch (step.action) {
    case 'tap': await d.tap(x, y); return { type: 'tap', x: x / W, y: y / H };
    case 'type': await d.type(step.text); return { type: 'type', text: step.text };
    case 'back': await d.back(); return { type: 'back' };
    case 'swipe_up': await d.swipe(W / 2, H * 0.72, W / 2, H * 0.32, 520); return { type: 'swipe', x1: 0.5, y1: 0.72, x2: 0.5, y2: 0.32 };
    case 'swipe_down': await d.swipe(W / 2, H * 0.32, W / 2, H * 0.72, 520); return { type: 'swipe', x1: 0.5, y1: 0.32, x2: 0.5, y2: 0.72 };
    case 'swipe_left': await d.swipe(W * 0.8, H / 2, W * 0.2, H / 2, 420); return { type: 'swipe', x1: 0.8, y1: 0.5, x2: 0.2, y2: 0.5 };
    case 'swipe_right': await d.swipe(W * 0.2, H / 2, W * 0.8, H / 2, 420); return { type: 'swipe', x1: 0.2, y1: 0.5, x2: 0.8, y2: 0.5 };
    default: return { type: step.action };
  }
}

/**
 * Rehearse a flow and record a clean take.
 * opts: { serial (adb) or device (driver), goal, pkg, lang, maxSteps, signal, onStep({ index, step, image }), onMessage(text) }
 * Returns the imported footage meta (with steps and tap events).
 */
export async function captureFlow({ serial, device, goal, pkg, lang = 'en', maxSteps = 22, signal, onStep = () => {}, onMessage = () => {} }) {
  const d = toDriver(device || serial);
  const info = await d.info();
  pkg = pkg || (await d.findPackage());
  if (!pkg) throw new Error('The Goldcom app was not found on the phone. Install it, or set its package name in Settings.');

  // ---- rehearsal ----
  onMessage('Opening the Goldcom app for a rehearsal…');
  await d.launch(pkg, { fresh: true });
  let shot = (await settle(d, { min: 2500, max: 7000, signal })).png;
  const plan = [];
  const history = [];
  for (let i = 0; i < maxSteps; i++) {
    if (signal?.aborted) throw new Error('Cancelled');
    const els = await d.elements();
    const img = await shrink(shot);
    const prompt = `Goal: ${goal}\nCaption language: ${lang === 'ar' ? 'Arabic (Modern Standard Arabic)' : 'English'}\n\nSteps so far:\n${history.length ? history.map((h, k) => `${k + 1}. [${h.screen}] ${h.action}${h.label ? ` → ${h.label}` : ''}`).join('\n') : '(none, the app just opened)'}\n\nOn-screen elements:\n${describeElements(els, info.width, info.height)}\n\nDecide the next single action.`;
    const step = await complete({ system: SYSTEM, prompt, images: [{ data: img.toString('base64'), mediaType: 'image/jpeg', label: 'current screen' }], schema: STEP_SCHEMA, effort: 'medium', signal });
    onStep({ index: i, step, image: img });
    if (step.action === 'abort') throw new Error(`Stopped: ${step.reason}`);
    const label = step.element >= 0 && els[step.element] ? (els[step.element].text || els[step.element].desc || els[step.element].id) : '';
    history.push({ screen: step.screen_name, action: step.action, label });
    if (step.action === 'done') { plan.push({ action: 'done', caption: step.caption, screen: step.screen_name, sensitive: step.sensitive_regions }); break; }
    const ev = await perform(d, info, step, els);
    const st = await settle(d, { min: step.action === 'type' ? 500 : 800, max: 6000, signal });
    shot = st.png;
    plan.push({ ...ev, action: step.action, text: step.text, caption: step.caption, screen: step.screen_name, settleMs: st.ms, sensitive: step.sensitive_regions });
  }
  if (!plan.length || plan[plan.length - 1].action !== 'done') onMessage('Reached the step limit; recording what was rehearsed.');

  // ---- take ----
  onMessage('Recording a clean take…');
  await d.launch(pkg, { fresh: true });
  await d.demoMode(true);
  await settle(d, { min: 2500, max: 7000, signal });
  const rec = await d.startRecording();
  const events = [];
  const steps = [];
  const local = path.join(os.tmpdir(), `goldcom-take-${Date.now()}.mp4`);
  try {
    await sleep(1400, signal); // opening hold on the first screen
    const now = () => (Date.now() - rec.startedAt) / 1000;
    for (const st of plan) {
      steps.push({ t: +now().toFixed(3), caption: st.caption, screen: st.screen, action: st.action, sensitive: st.sensitive || [] });
      if (st.action === 'done') break;
      // Reading pause so viewers can see the screen before the next tap.
      await sleep(650, signal);
      const t = now();
      if (st.type === 'tap') { await d.tap(st.x * info.width, st.y * info.height); events.push({ t: +t.toFixed(3), type: 'tap', x: st.x, y: st.y }); }
      else if (st.type === 'swipe') { await d.swipe(st.x1 * info.width, st.y1 * info.height, st.x2 * info.width, st.y2 * info.height, 520); events.push({ t: +t.toFixed(3), type: 'swipe', x: st.x1, y: st.y1, x2: st.x2, y2: st.y2 }); }
      else if (st.type === 'type') { await d.type(st.text); events.push({ t: +t.toFixed(3), type: 'type', text: st.text }); }
      else if (st.type === 'back') { await d.back(); events.push({ t: +t.toFixed(3), type: 'back' }); }
      await sleep(Math.max(900, Math.min(5000, (st.settleMs || 1200) + 250)), signal);
    }
    await sleep(1800, signal); // closing hold on the result
  } finally {
    await rec.stop(local).catch((e) => onMessage(`Recording stop failed: ${e.message}`));
    await d.demoMode(false);
  }
  const meta = await importFootage(local, { name: goal.slice(0, 60), source: 'device', device: `${info.maker || ''} ${info.model || ''}`.trim(), events, notes: goal });
  await updateFootage(meta.id, { steps, goal, screen: { width: info.width, height: info.height } });
  fsp.rm(local, { force: true }).catch(() => {});
  // Fine-tune event timing against what actually changed on screen, once the proxy exists.
  waitReady(meta.id).then(() => alignEvents(meta.id)).catch(() => {});
  return getFootage(meta.id);
}

export async function waitReady(id, timeoutMs = 10 * 60e3) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const m = await getFootage(id);
    if (m.status === 'ready') return m;
    if (m.status === 'error') throw new Error(m.error || 'Processing failed');
    await sleep(800);
  }
  throw new Error('Footage processing timed out');
}

/** Manual take: the person operates the phone; taps are logged from the touchscreen. */
export async function startManualTake(target, { demo = true } = {}) {
  const d = toDriver(target);
  const info = await d.info();
  if (demo) await d.demoMode(true);
  const rec = await d.startRecording();
  const touches = await d.startTouchLog(info);
  return {
    info,
    async stop({ name = 'Screen recording' } = {}) {
      const local = path.join(os.tmpdir(), `goldcom-manual-${Date.now()}.mp4`);
      const taps = touches.stop();
      await rec.stop(local);
      if (demo) await d.demoMode(false);
      const events = taps.map((tp) => ({ t: +((tp.t - rec.startedAt) / 1000).toFixed(3), type: 'tap', x: tp.x, y: tp.y })).filter((e) => e.t >= 0);
      const meta = await importFootage(local, { name, source: 'device', device: `${info.maker || ''} ${info.model || ''}`.trim(), events });
      await updateFootage(meta.id, { screen: { width: info.width, height: info.height } });
      fsp.rm(local, { force: true }).catch(() => {});
      waitReady(meta.id).then(() => alignEvents(meta.id)).catch(() => {});
      return meta;
    },
  };
}
