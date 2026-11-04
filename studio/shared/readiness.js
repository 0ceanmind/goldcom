import { lintDocument } from './lint.js';

export function reviewFingerprint(doc) {
  const clean = value => {
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k => !['id','revision','approval','source','createdAt','updatedAt'].includes(k)).map(k=>[k,clean(value[k])]));
    return value;
  };
  return JSON.stringify(clean(doc));
}

export function documentBlockers(doc) {
  const blockers = lintDocument(doc).filter(i => i.level === 'error').map(i => i.message);
  if (!doc.slides?.length) blockers.push('Add at least one scene.');
  for (const [i, s] of (doc.slides || []).entries()) {
    for (const l of s.layers || []) {
      if (l.hidden) continue;
      if (l.type === 'phone' && !l.src) blockers.push(`Scene ${i + 1}: add verified app footage.`);
      if (l.type === 'scene3d' && l.scene === 'phone-taps' && !l.params?.screenshot) blockers.push(`Scene ${i + 1}: replace the illustrative 3D phone screen with verified footage.`);
      if (l.type === 'image' && !l.src) blockers.push(`Scene ${i + 1}: replace the empty image.`);
    }
  }
  return [...new Set(blockers)];
}

export function productionReadiness(doc, review, extra = []) {
  const blockers = [...documentBlockers(doc), ...extra];
  if (!review || review.verdict !== 'ship' || review.score < 8) blockers.push('The art director has not approved this version at 8/10 or higher.');
  if (review?.issues?.some(i => i.severity === 'blocker')) blockers.push('Resolve the art director’s blocking issues.');
  return { ready: blockers.length === 0, blockers: [...new Set(blockers)] };
}

export function assertExportable(doc) {
  const blockers = documentBlockers(doc);
  if (doc.source?.type === 'production' && (doc.approval?.revision !== doc.revision || !doc.approval?.ready)) blockers.push('This production version needs a new review.');
  if (blockers.length) throw Object.assign(new Error(`Export blocked: ${[...new Set(blockers)].join(' ')}`), { status: 422, blockers });
}
