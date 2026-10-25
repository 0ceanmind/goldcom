# Scene modules

Every file in `scenes/` is one 3D scene: a short, looping piece of motion that shows one idea (a minted bar turning in the light, coins stacking month by month, a vault tile opening). The studio renders scenes with three.js into any slide, at any size, at any moment of time, so the same module works in the editor, in Claude's previews, in PNG exports and frame-exact MP4s.

Modules load at runtime. A new file appears in the editor's scene picker without a rebuild, and editors that have the studio open reload it the moment it changes. That is how the studio grows: when a brief needs a visual that does not exist, Claude writes a module (`create_scene_module`), tests it (`test_scene`), and uses it.

## Contract

```js
export default {
  id: 'bar-hero',                 // must match the file name (bar-hero.js); lowercase, digits, dashes
  name: 'Minted bar · hero',
  description: 'What the viewer sees, in one or two sentences.',
  idea: { en: 'The one idea it communicates.', ar: 'الفكرة بالعربية.' },
  tags: ['product', 'hero'],
  duration: 6,                    // natural length in seconds
  still: 2.6,                     // the time used for still images (posts, thumbnails)
  textZone: 'top',                // where the slide's one line goes: 'top' | 'bottom'
  focusY: 0.6,                    // where the subject sits vertically (0 top … 1 bottom), leaving room for text
  params: [                       // the editor builds its settings panel from this list
    { key: 'weight', label: 'Weight', type: 'select', options: ['1 g', '5 g', '10 g'], default: '10 g' },
    // types: select | text | number (min, max, step) | asset (an image or GLB URL from the studio)
  ],
  assets: (params) => [params.screenshot],   // optional: URLs to preload (images, .glb)
  post: { bloom: 0.06, bloomThreshold: 3, vignette: 0.3 },   // optional post-processing defaults

  create(api) {
    const { THREE, kit, params, theme, lang, rtl, aspect, loop, duration, env, asset } = api;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(24, aspect, 0.1, 100);
    // … build meshes once here …
    return {
      scene, camera,
      update(t, { dur, still }) { /* set EVERY animated value from t only */ },
      post: { /* optional per-instance overrides */ },
      envVariant: 'studio',       // 'studio' (default) | 'warm' | 'bright' | 'none'
      dispose() {},               // optional; geometries, materials and textures are disposed for you
    };
  },
};
```

Rules that keep scenes renderable anywhere:
- **No imports.** Everything comes through `api`: `api.THREE` (three.js r185) and `api.kit` (below). The server rejects modules with `import` or `require`.
- **Deterministic.** `update(t)` must set every animated value from `t` alone (no `Date.now()`, no accumulated state, no `Math.random()`; use `kit.rand(seed)`). Exports jump to any frame.
- **Loops.** When `api.loop` is true (seamless motion posts), make motion periodic over `dur` so the last frame matches the first.
- **Text zone.** Frame the subject with `kit.fitBox` and leave the `textZone` side quiet; the template puts one line there.
- **Brand.** Onyx/charcoal ground, gold as the only accent, real proportions, contact shadows, no sparkles, heavy objects land decisively (`kit.ease.settle`, `kit.ease.weight`). See `../knowledge/design-dna.md` and `../knowledge/lessons.md`.

## `api.kit`

| Group | Members |
|---|---|
| Motion | `seg(t, a, b)` normalised progress · `mix(a, b, p)` · `clamp` · `phase(t, period)` · `ease.{settle, lift, glide, snap, weight, spring, drop, expoOut, quintInOut, cubicInOut, sineInOut, backOut, linear}` · `bezier(x1, y1, x2, y2)` · `rand(seed)` · `noise1(x, seed)` |
| Staging | `stage(scene, { theme, aspect, floor, reflect, glowY, glow, fog, fogNear, fogFar, lights, transparent })` → `{ floor, key, rim, colors }` (themed backdrop, glossy stone floor with a soft reflection that fades into the backdrop, key + rim lights) · `reflectiveFloor(opts)` · `contactShadow({ size, opacity })` · `backdropTexture(theme)` · `backdropColors(theme)` |
| Camera | `fitBox(camera, w, h, aspect, { fillW, fillH })` distance that frames a box · `fitDistance(camera, size, aspect, fill)` · `orbit(camera, { target, distance, azimuth, elevation })` |
| Materials | `materials.gold({ color, roughness, normalMap, roughnessMap, normalScale, envMapIntensity })` · `materials.satin()` brushed gold · `materials.lacquer()` black lacquer · `materials.matte()` · `materials.velvet({ color, sheenColor })` · `materials.glass()` · `materials.emissive({ map, color, intensity })` · `GOLD.{pure, warm, rose, deep, pale}` |
| Geometry | `barGeometry({ w, h, d, r, bevel })` minted bar (group 0 faces, group 1 edge) · `BAR_SIZES['1 g' … '100 g']` real mm · `coinGeometry` · `discGeometry` · `symbolGeometries({ depth, bevel })` → `{ roof, g, gem }` Goldcom mark · `roundedBox(w, h, d, r)` · `roundedRectShape(w, h, r)` |
| Type | `text3d(text, { size, depth, bevel, align })` extruded brand type (Inter, IBM Plex Sans Arabic) · `glyphs3d(text, opts)` per-glyph meshes for staggered reveals |
| Surfaces | `barStamp({ weight, serial, lang, aspect })` → `{ normalMap, roughnessMap }` minted face · `coinStamp()` · `reedingMap(count)` · `reliefMaps(draw, opts)` any embossed design from a 2D drawing · `canvasTexture(w, h, draw)` live 2D texture (screens, labels) · `radialTexture()` · `drawText(c, text, x, y, opts)` · `drawSymbol(c, x, y, h)` |
| Particles | `softPoints(count, { size, color, opacity })` soft discs with per-point `alpha` and `scale` attributes · `samplePoints(draw, count, { height })` positions covering a 2D drawing (text, logo) |
| People | `figure(spec)` → `{ group, update(t), box(), hands, prop }`: a posable 3D person (spec: `gender, outfit (dishdasha, abaya, casual), headwear (kumma, massar, hijab, sheila, none), age, skin, pose, mood, prop, facing, seed, face ('none' or 'minimal')`); stands on y = 0 facing +z, call `update(t)` every frame · `figurePoses()` pose names and labels · `prop3d(name)` phone, goldbar, giftbox, receipts, bag, coffee, coin |
| Sets | `diorama(name, { theme, mood })` → `{ group, lights, background, fog }` for room, night-room, souq, office, outdoor-muscat (add the lights to your scene) · `cyclorama({ color })` seamless studio sweep that receives shadows |
| Assets | `api.asset(url)` returns a loaded texture or GLTF (declare it in `assets()` so it preloads) · `api.env(variant)` an environment map |

## Testing

```
test_scene({ id: 'my-scene', times: [0.5, 2, 4], params: { … } })   // MCP: renders frames you can look at
GET /api/scene-preview/<id>?t=2&w=1080&h=1350&params={…}            // HTTP: one PNG
```

If a module throws while loading or rendering, the studio skips it (the slide still renders), reports the error, and, when auto-repair is on, starts a repair task with the error and the module source.
