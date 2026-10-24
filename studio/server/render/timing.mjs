// Transition timing shared by the server (soundtrack, review frames) — mirrors src/render/renderer.js.
const TRANSITION_DURS = { whip: 0.38, cut: 0, none: 0, 'zoom-through': 0.7, push: 0.65, facet: 0.75, blur: 0.6, 'scale-fade': 0.55 };
export const transitionDurOf = (slide) => Number(slide?.transitionDur) || (TRANSITION_DURS[slide?.transition] ?? 0.6);

/** Start time of every slide in a sequence. */
export function slideStarts(doc) {
  const out = [];
  let t = 0;
  for (const s of doc.slides) { out.push(t); t += Number(s.duration) || 4; }
  return out;
}
