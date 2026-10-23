// Regenerates samples/*.json (seeded into a fresh data folder on first run).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STARTERS } from '../shared/starters.js';
import { createDocument, createSlide, normalizeDocument } from '../shared/schema.js';
import { applyAllTemplates } from '../shared/templates.js';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'samples');
fs.mkdirSync(out, { recursive: true });
const picks = [
  ['launch', 'ar', 'Goldcom launch · Arabic carousel'],
  ['launch', 'en', 'Goldcom launch · English carousel'],
  ['gift', 'ar', 'Eid gifting reel'],
  ['price', 'ar', 'Gold price post'],
  ['appstore', 'ar', 'App Store screenshots'],
];
picks.forEach(([key, lang, name], i) => {
  const st = STARTERS[key];
  const doc = createDocument({ name, format: st.format, kind: st.kind, lang });
  doc.id = `doc_sample_${key}_${lang}`;
  doc.createdAt = doc.updatedAt = new Date(Date.UTC(2026, 9, 23, 12, 0, 10 - i)).toISOString();
  doc.slides = st.build(lang).map((s) => createSlide({ ...s, layers: s.layers || [] }));
  const built = applyAllTemplates(normalizeDocument(doc));
  fs.writeFileSync(path.join(out, `${doc.id}.json`), JSON.stringify(built, null, 2));
  console.log('wrote', doc.id, built.slides.length, 'slides');
});
