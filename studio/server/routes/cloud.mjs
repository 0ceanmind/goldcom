// Cloud phone routes: saved phones, connect/disconnect over ADB.
import { send, readJson } from '../http-util.mjs';
import * as C from '../capture/cloud.mjs';
import * as A from '../capture/adb.mjs';

export async function cloudRoutes(req, res, url) {
  const p = url.pathname;
  if (!p.startsWith('/api/cloud')) return false;
  if (p === '/api/cloud' && req.method === 'GET') {
    send(res, 200, { adb: !!A.findAdb(), phones: await C.status() });
    return true;
  }
  if (p === '/api/cloud/my-ip' && req.method === 'GET') {
    // For providers that only accept ADB from whitelisted addresses (e.g. DuoPlus).
    const r = await fetch('https://api.ipify.org?format=json').then((x) => x.json()).catch(() => null);
    send(res, 200, { ip: r?.ip || null });
    return true;
  }
  if (p === '/api/cloud/phones' && req.method === 'POST') {
    const b = await readJson(req);
    if (!A.findAdb()) await A.installPlatformTools(() => {});
    const saved = C.savePhone(b);
    let conn = null;
    try { conn = await C.connect(saved.address, { provider: saved.provider, code: saved.code }); } catch (e) { conn = { state: 'error', error: e.message }; }
    const { code, ...phone } = saved;
    send(res, 201, { phone, connection: conn });
    return true;
  }
  if (p === '/api/cloud/connect' && req.method === 'POST') {
    const b = await readJson(req);
    if (!A.findAdb()) await A.installPlatformTools(() => {});
    send(res, 200, await C.reconnect(b.address));
    return true;
  }
  if (p === '/api/cloud/disconnect' && req.method === 'POST') {
    const b = await readJson(req);
    await C.disconnect(b.address);
    send(res, 200, { ok: true });
    return true;
  }
  if (p === '/api/cloud/phones' && req.method === 'DELETE') {
    const address = url.searchParams.get('address');
    await C.disconnect(address);
    C.removePhone(address);
    send(res, 200, { ok: true });
    return true;
  }
  return false;
}
