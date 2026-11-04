import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { DATA_DIR } from './store.mjs';

export function localToken() {
  const file = path.join(DATA_DIR, '.api-token');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try { fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  return fs.readFileSync(file, 'utf8').trim();
}

export function requestGuard(req, port) {
  let host; try { host = new URL(`http://${req.headers.host}`); } catch { return 'Invalid Host'; }
  const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (!loopback.has(host.hostname) || ![String(port), '5173'].includes(host.port)) return 'Unexpected Host';
  if (req.headers.origin) {
    let origin; try { origin = new URL(req.headers.origin); } catch { return 'Invalid Origin'; }
    if (!['http:', 'https:'].includes(origin.protocol) || !loopback.has(origin.hostname) || ![String(port), '5173'].includes(origin.port)) return 'Cross-site Origin';
  }
  if (req.headers['sec-fetch-site'] === 'cross-site' && !(req.method === 'GET' && req.headers['sec-fetch-mode'] === 'navigate' && !req.url.startsWith('/api/'))) return 'Cross-site request';
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const supplied = String(req.headers.authorization || '').replace(/^Bearer /, '');
    const expected = localToken();
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return 'Local API token required';
  }
  return null;
}

export function privateAddress(ip) {
  const a = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (a.includes(':')) {
    if (a.startsWith('::ffff:')) { const tail = a.slice(7); if (tail.includes('.')) return privateAddress(tail); return true; }
    return a === '::' || a === '::1' || /^(fc|fd|fe[89ab]|ff)/.test(a) || a.startsWith('2001:db8:');
  }
  const n = a.split('.').map(Number);
  return n[0] === 0 || n[0] === 10 || n[0] === 127 || n[0] >= 224 || (n[0] === 169 && n[1] === 254) || (n[0] === 172 && n[1] >= 16 && n[1] <= 31) || (n[0] === 192 && [0, 168].includes(n[1])) || (n[0] === 100 && n[1] >= 64 && n[1] <= 127) || (n[0] === 198 && [18, 19].includes(n[1]));
}

export async function assertCaptureUrl(value, allowedOrigins = []) {
  let url; try { url = new URL(value); } catch { throw Object.assign(new Error('A full http(s) URL is required'), { status: 400 }); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Object.assign(new Error('Only HTTP(S) URLs without credentials are allowed'), { status: 400 });
  if (allowedOrigins.includes(url.origin) && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/assets/')) return url;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addresses.length || addresses.some(a => privateAddress(a.address))) throw Object.assign(new Error('Capture of private, loopback or metadata addresses is blocked. Add a specific development origin in Settings to capture your own app.'), { status: 403 });
  return url;
}
