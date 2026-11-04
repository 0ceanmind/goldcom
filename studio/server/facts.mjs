import fs from 'node:fs';
import path from 'node:path';
import { STUDIO_ROOT, DATA_DIR } from './store.mjs';

const file = path.join(DATA_DIR, 'product-facts.json');
export function allProductFacts() {
  const base = JSON.parse(fs.readFileSync(path.join(STUDIO_ROOT, 'knowledge', 'product-facts.json'), 'utf8'));
  let local = []; try { local = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* no local facts yet */ }
  return [...new Map([...base, ...local].map(f=>[f.id,f])).values()];
}
export function productFacts() { return allProductFacts().filter(f => f.approved && (!f.expiresAt || Date.parse(f.expiresAt) > Date.now())); }
export function saveProductFacts(facts) {
  if (!Array.isArray(facts) || facts.length > 100 || facts.some(f => !f.id || !f.claim || !f.source || !f.approvedBy || typeof f.approved !== 'boolean' || f.expiresAt && !Number.isFinite(Date.parse(f.expiresAt)))) throw Object.assign(new Error('Each fact needs id, claim, source, approver and approval status; expiry must be a valid date'), { status: 400 });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(facts, null, 2), { mode: 0o600 });
  return allProductFacts();
}
