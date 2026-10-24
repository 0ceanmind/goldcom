// Android phone routes: status, Android tools install, live mirror, remote input, Claude-driven capture,
// manual recordings and screenshots straight into the footage library.
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { send, readJson, bodyToFile } from '../http-util.mjs';
import * as A from '../capture/adb.mjs';
import { captureFlow, startManualTake } from '../capture/agent.mjs';
import { importFootage } from '../footage/store.mjs';
import { createJob, updateJob } from '../jobs.mjs';
import { getSettings } from '../settings.mjs';

let manual = null;

async function pickSerial(serial) {
  if (serial) return serial;
  const d = await A.pickDevice(getSettings().captureDevice);
  if (!d) throw Object.assign(new Error('No phone is available. Start the phone emulator, connect a cloud phone, or plug in an Android phone.'), { status: 409 });
  return d.serial;
}

export async function deviceRoutes(req, res, url) {
  const p = url.pathname;
  if (!p.startsWith('/api/device')) return false;
  if (p === '/api/device' && req.method === 'GET') {
    const adbPath = A.findAdb();
    if (!adbPath) { send(res, 200, { adb: null, devices: [] }); return true; }
    let devices = [];
    let error = null;
    try { devices = await A.devices(); } catch (e) { error = e.message; }
    const want = url.searchParams.get('serial');
    const ready = want ? devices.find((d) => d.serial === want && d.state === 'device') : devices.find((d) => d.state === 'device');
    let info = null, pkg = getSettings().appPackage || null;
    if (ready) {
      try { info = await A.deviceInfo(ready.serial); } catch { /* ignore */ }
      if (!pkg) { try { pkg = await A.findGoldcomPackage(ready.serial); } catch { /* ignore */ } }
    }
    send(res, 200, { adb: adbPath, devices, serial: ready?.serial || null, info, pkg, recording: manual?.serial || null, error });
    return true;
  }
  if (p === '/api/device/install-tools' && req.method === 'POST') {
    const job = createJob('tools', { title: 'Install Android tools', message: 'Starting…' });
    send(res, 202, { jobId: job.id });
    A.installPlatformTools(({ message, pct }) => updateJob(job, { message, progress: pct }, message))
      .then((adb) => updateJob(job, { status: 'done', progress: 1, result: { adb } }, 'Done'))
      .catch((e) => updateJob(job, { status: 'error', error: e.message, message: e.message }));
    return true;
  }
  if (p === '/api/device/install-apk' && req.method === 'POST') {
    // An APK from the Goldcom team installs on any phone, even where the Play Store does not list the app.
    const serial = await pickSerial(url.searchParams.get('serial'));
    const file = path.join(os.tmpdir(), `goldcom-${Date.now()}.apk`);
    try {
      await bodyToFile(req, file, 600 * 1024 * 1024);
      const head = await fsp.readFile(file).then((b) => b.subarray(0, 4));
      if (head.readUInt32BE(0) !== 0x504b0304) throw Object.assign(new Error('That file is not an Android app (.apk).'), { status: 400 });
      const out = (await A.adb(['install', '-r', '-g', file], { serial, timeout: 300000 })).toString('utf8');
      if (!/Success/.test(out)) throw new Error(`Install failed: ${out.trim().slice(-300)}`);
      send(res, 200, { ok: true, pkg: await A.findGoldcomPackage(serial).catch(() => null) });
    } finally {
      fsp.rm(file, { force: true }).catch(() => {});
    }
    return true;
  }
  if (p === '/api/device/screen' && req.method === 'GET') {
    const serial = await pickSerial(url.searchParams.get('serial'));
    send(res, 200, await A.screencap(serial), { 'Content-Type': 'image/png' });
    return true;
  }
  if (p === '/api/device/input' && req.method === 'POST') {
    const b = await readJson(req);
    const serial = await pickSerial(b.serial);
    const info = await A.deviceInfo(serial);
    if (b.action === 'tap') await A.tap(serial, b.x * info.width, b.y * info.height);
    else if (b.action === 'swipe') await A.swipe(serial, b.x * info.width, b.y * info.height, b.x2 * info.width, b.y2 * info.height, b.ms || 450);
    else if (b.action === 'back') await A.keyevent(serial, A.KEY.back);
    else if (b.action === 'home') await A.keyevent(serial, A.KEY.home);
    else if (b.action === 'text') await A.typeText(serial, b.text || '');
    else if (b.action === 'launch') { const pkg = b.pkg || getSettings().appPackage || (await A.findGoldcomPackage(serial)); if (!pkg) throw new Error('Goldcom app not found on the phone'); await A.launchApp(serial, pkg, { fresh: !!b.fresh }); }
    send(res, 200, { ok: true });
    return true;
  }
  if (p === '/api/device/screenshot' && req.method === 'POST') {
    const b = await readJson(req);
    const serial = await pickSerial(b.serial);
    if (b.demo !== false) { await A.demoMode(serial, true); await new Promise((r) => setTimeout(r, 600)); }
    const png = await A.screencap(serial);
    if (b.demo !== false) await A.demoMode(serial, false);
    send(res, 201, await importFootage(png, { name: `${b.name || 'Screenshot'}.png`, source: 'device' }));
    return true;
  }
  if (p === '/api/device/capture' && req.method === 'POST') {
    const b = await readJson(req);
    const serial = await pickSerial(b.serial);
    const job = createJob('capture', { title: `Capture · ${String(b.goal || '').slice(0, 60)}`, message: 'Starting…', steps: [] });
    send(res, 202, { jobId: job.id });
    captureFlow({
      serial, goal: b.goal, pkg: b.pkg || getSettings().appPackage || null, lang: b.lang || getSettings().language, signal: job.controller.signal,
      onMessage: (m) => updateJob(job, { message: m }, m),
      onStep: ({ index, step }) => { job.steps.push({ index, screen: step.screen_name, action: step.action, caption: step.caption, reason: step.reason }); updateJob(job, { message: `Step ${index + 1}: ${step.screen_name} → ${step.action}` }, `${step.screen_name}: ${step.action} (${step.reason})`); },
    }).then((meta) => updateJob(job, { status: 'done', progress: 1, message: 'Footage saved', result: { footageId: meta.id } }, `Saved footage ${meta.id}`))
      .catch((e) => { if (job.status === 'running') updateJob(job, { status: 'error', error: e.message, message: e.message }, e.stack); });
    return true;
  }
  if (p === '/api/device/record/start' && req.method === 'POST') {
    const b = await readJson(req);
    if (manual) throw Object.assign(new Error('Already recording'), { status: 409 });
    const serial = await pickSerial(b.serial);
    manual = await startManualTake(serial, { demo: b.demo !== false });
    manual.serial = serial;
    send(res, 200, { ok: true });
    return true;
  }
  if (p === '/api/device/record/stop' && req.method === 'POST') {
    const b = await readJson(req);
    if (!manual) throw Object.assign(new Error('Not recording'), { status: 409 });
    const take = manual; manual = null;
    send(res, 201, await take.stop({ name: b.name || 'Screen recording' }));
    return true;
  }
  return false;
}
