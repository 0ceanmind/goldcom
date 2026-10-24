// Goldcom character & prop illustration system (Canvas 2D, deterministic, no external assets).
//
//   drawCharacter(ctx, spec, box, t)   one person, feet at the bottom centre of box, scaled to box height
//   drawProp(ctx, name, box, opts, t)  a prop fitted inside box
//   drawScene(ctx, name, box, opts, t) a background set filling box; returns { floorY, slots, theme }
//   characterAnchors(spec, box, t)     where the head / hands / held prop land (for bubbles, effects)
//
// Scale: a standing adult man is ~92% of box.h tall (women ~95% of that), so people placed in boxes
// of equal height read at consistent sizes. Raised or extended arms (celebrate, point, present) and
// held props may reach up to ~0.3 × box.h beyond the body sideways; give such boxes some room.
// Every call is wrapped in save/restore and multiplies (never overwrites) the caller's globalAlpha,
// so characters can be faded or transformed by the renderer like any other layer.
import { resolveSpec, buildRig, drawFigure, FRAME_H, GROUND_PAD } from './figure.js';
import { drawProp, PROPS, _setCharacterDrawer } from './props.js';
import { drawScene, SCENES } from './scenes.js';
import { CHARACTER_OPTIONS, PROP_NAMES, SCENE_NAMES, PROP_OPTIONS, SCENE_OPTIONS, SCENE_THEMES } from './options.js';

/** Shared fitting: model units → pixels for a box. */
function fit(S, R, box) {
  let s = box.h / FRAME_H;
  if (box.w > 0 && box.w < box.h * 0.26) s = box.w / (FRAME_H * 0.26); // extremely narrow boxes
  const k = s * (S.gender === 'woman' ? 0.955 : 1) * (S.age === 'senior' ? 0.985 : 1);
  const flip = S.facing === 'left';
  const shift = R.sit && R.view !== 'front' ? -24 : 0; // centre the seated figure + cushion
  return { k, flip, ox: box.x + box.w / 2, oy: box.y + box.h - GROUND_PAD * s, shift };
}

export function drawCharacter(ctx, spec = {}, box, t = 0) {
  if (!ctx || !box || !(box.h > 0)) return;
  const S = resolveSpec(spec || {});
  S.theme = spec?.theme;
  const R = buildRig(S, Number(t) || 0);
  const F = fit(S, R, box);
  ctx.save();
  ctx.translate(F.ox, F.oy);
  ctx.scale(F.flip ? -F.k : F.k, F.k);
  ctx.translate(F.shift, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  drawFigure(ctx, S, R, F.flip);
  ctx.restore();
}

_setCharacterDrawer(drawCharacter);

/** Where a character's head, hands and held prop land for a given box (pixels). */
export function characterAnchors(spec = {}, box, t = 0) {
  const S = resolveSpec(spec || {});
  const R = buildRig(S, Number(t) || 0);
  const F = fit(S, R, box);
  const sx = F.flip ? -1 : 1;
  const P = (q) => ({ x: F.ox + (q.x + F.shift) * F.k * sx, y: F.oy + q.y * F.k });
  return {
    head: P(R.head.c),
    headTop: P({ x: R.head.c.x, y: R.head.c.y - 100 }),
    feet: { x: F.ox, y: F.oy },
    prop: R.prop && !R.prop.hidden ? P(R.prop) : null,
    nearHand: P(R.arms.near.W),
    farHand: P(R.arms.far.W),
    scale: F.k,
  };
}

export { drawProp, drawScene, CHARACTER_OPTIONS, PROP_NAMES, SCENE_NAMES, PROP_OPTIONS, SCENE_OPTIONS, SCENE_THEMES, PROPS, SCENES };
