// Cloud phones: Android phones rented in a data centre. Most providers expose ADB over the network
// ("adb connect host:port"); once connected, the phone is an ordinary adb device for mirroring, recording and the
// Claude capture agent. Saved phones live in settings.cloudPhones.
import * as A from './adb.mjs';
import { getSettings, updateSettings } from '../settings.mjs';

const ADDRESS = /^[\w.-]+:\d{2,5}$/;

export function normalizeAddress(raw) {
  let a = String(raw || '').trim().replace(/^adb\s+connect\s+/i, '').replace(/^tcp:\/\//i, '');
  if (/^[\w.-]+$/.test(a)) a += ':5555';
  if (!ADDRESS.test(a)) throw Object.assign(new Error('Enter the cloud phone’s ADB address as host:port, for example 203.0.113.10:5555.'), { status: 400 });
  return a;
}

// After "adb connect", some providers require a login with a connection code shown in their dashboard.
export const PROVIDERS = {
  geelark: { name: 'GeeLark', login: (code) => `glogin ${code}`, needsCode: true },
  multilogin: { name: 'Multilogin', login: (code) => `glogin ${code}`, needsCode: true },
  morelogin: { name: 'MoreLogin', login: (code) => code, needsCode: true },
  duoplus: { name: 'DuoPlus', login: null, needsCode: false },
  other: { name: 'Other provider', login: (code) => code, needsCode: false },
};

export async function connect(address, { provider = 'other', code = '' } = {}) {
  const a = normalizeAddress(address);
  const out = (await A.adb(['connect', a], { timeout: 20000 })).toString('utf8').trim();
  if (/unable|failed|refused|cannot|timed out/i.test(out)) throw Object.assign(new Error(`Could not reach ${a}: ${out}. Check that the cloud phone is switched on, ADB is enabled for it in your provider’s dashboard${provider === 'duoplus' ? ', and this computer’s IP address is on the ADB whitelist' : ''}.`), { status: 502 });
  const pv = PROVIDERS[provider] || PROVIDERS.other;
  const c = String(code || '').trim();
  if (c && pv.login) {
    if (!/^[\w-]{3,64}$/.test(c)) throw Object.assign(new Error('The connection code should be letters and numbers only.'), { status: 400 });
    await A.adb(['shell', pv.login(c)], { serial: a, timeout: 15000 }).catch(() => {});
  }
  // The provider may ask to approve the computer on the phone; give it a moment to settle.
  for (let i = 0; i < 10; i++) {
    const d = (await A.devices()).find((x) => x.serial === a);
    if (d?.state === 'device') return { address: a, state: 'device', model: d.model };
    if (d?.state === 'unauthorized') return { address: a, state: 'unauthorized' };
    await new Promise((r) => setTimeout(r, 700));
  }
  return { address: a, state: 'offline' };
}

/** Reconnect a saved phone (its provider and connection code are remembered). */
export async function reconnect(address) {
  const a = normalizeAddress(address);
  const p = savedPhones().find((x) => x.address === a);
  return connect(a, { provider: p?.provider, code: p?.code });
}

export async function disconnect(address) {
  await A.adb(['disconnect', normalizeAddress(address)], { timeout: 10000 }).catch(() => {});
}

export function savedPhones() { return getSettings().cloudPhones || []; }

export function savePhone({ name, provider, address, code }) {
  const a = normalizeAddress(address);
  const list = savedPhones().filter((p) => p.address !== a);
  list.unshift({ name: String(name || '').trim() || `${(PROVIDERS[provider] || PROVIDERS.other).name} phone`, provider: PROVIDERS[provider] ? provider : 'other', address: a, code: String(code || '').trim(), addedAt: new Date().toISOString() });
  updateSettings({ cloudPhones: list.slice(0, 12) });
  return list[0];
}

export function removePhone(address) {
  const a = normalizeAddress(address);
  updateSettings({ cloudPhones: savedPhones().filter((p) => p.address !== a) });
}

/** Saved phones with their live connection state. */
export async function status() {
  let devices = [];
  if (A.findAdb()) { try { devices = await A.devices(); } catch { /* adb busy */ } }
  return savedPhones().map(({ code, ...p }) => {
    const d = devices.find((x) => x.serial === p.address);
    return { ...p, hasCode: !!code, state: d?.state || 'disconnected', model: d?.model || null };
  });
}
