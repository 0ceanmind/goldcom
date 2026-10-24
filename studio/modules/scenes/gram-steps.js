// "Start from 1 gram": the real bar sizes in a row, smallest first, rising one by one as the camera travels.
export default {
  id: 'gram-steps',
  name: 'From 1 gram · bar line-up',
  description: 'Goldcom minted bars from 1 g to 100 g at their real proportions rise out of black stone one after another while the camera tracks from the smallest to the largest.',
  idea: { en: 'You can start with one gram and grow from there.', ar: 'ابدأ بجرام واحد، وكبّر رصيدك متى شئت.' },
  tags: ['product', 'start-small', 'weights', 'explainer'],
  duration: 7,
  still: 6.2,
  textZone: 'top',
  focusY: 0.6,
  params: [
    { key: 'weights', label: 'Weights (comma separated)', type: 'text', default: '1 g, 5 g, 10 g, 50 g, 100 g' },
    { key: 'highlight', label: 'Highlight', type: 'select', options: ['first', 'last', 'none'], default: 'first' },
  ],
  create({ THREE, kit, params, theme, lang, aspect, loop }) {
    const { ease, seg, mix } = kit;
    const scene = new THREE.Scene();
    const staging = kit.stage(scene, { theme, aspect, glowY: 0.5, fogNear: 10, fogFar: 30 });
    if (staging.floor) staging.floor.material.uniforms.strength.value = 0.22;
    const camera = new THREE.PerspectiveCamera(26, aspect, 0.1, 100);

    const weights = String(params.weights || '').split(',').map((s) => s.trim()).filter((w) => kit.BAR_SIZES[w]);
    const list = weights.length ? weights : ['1 g', '5 g', '10 g', '50 g', '100 g'];
    const MM = 0.032; // world units per millimetre
    const edge = kit.materials.satin({ roughness: 0.28 });
    const bars = [];
    let x = 0;
    const gap = 0.16;
    list.forEach((w, i) => {
      const [mw, mh, md] = kit.BAR_SIZES[w];
      const W = mw * MM, H = mh * MM, D = Math.max(0.03, md * MM * 1.4);
      const stamp = kit.barStamp({ weight: w, serial: `GC ${String(4211 + i * 7).padStart(6, '0')}`, lang, aspect: mh / mw });
      const face = kit.materials.gold({ normalMap: stamp.normalMap, roughnessMap: stamp.roughnessMap, roughness: 1, normalScale: 0.85 });
      const mesh = new THREE.Mesh(kit.barGeometry({ w: W, h: H, d: D, r: W * 0.07, bevel: Math.min(0.012, D * 0.3) }), [face, edge]);
      const g = new THREE.Group();
      g.add(mesh);
      x += (i ? gap : 0) + W / 2;
      g.position.set(x, H / 2 + 0.03, 0);
      x += W / 2;
      const shadow = kit.contactShadow({ size: W * 2.2, opacity: 0.5 });
      shadow.position.set(g.position.x, 0.002, 0);
      scene.add(g, shadow);
      bars.push({ g, mesh, W, H, shadow, x: g.position.x });
    });
    const total = x;
    const tallest = Math.max(...bars.map((b) => b.H));

    return {
      scene, camera,
      update(t, { dur }) {
        const n = bars.length;
        const T = loop ? (t % dur) : t;
        const span = loop ? dur * 0.62 : 4.6;
        bars.forEach((b, i) => {
          const start = 0.25 + (i / Math.max(1, n - 1)) * (span - 1.1);
          // Each bar is set down from above and lands with a small, heavy settle.
          const p = ease.drop(seg(T, start, start + 0.9));
          const out = loop ? ease.cubicInOut(seg(T, dur - 0.8, dur - 0.1)) : 0;
          const lift = (1 - p) * 1.6 + out * 1.6;
          b.g.position.y = b.H / 2 + 0.03 + lift;
          b.g.rotation.set(-0.17, -0.34 + i * 0.07 + Math.sin(t * 0.5 + i * 0.6) * 0.035 + (1 - p) * 0.25, 0);
          b.g.visible = T >= start && p + (1 - out) > 0;
          b.shadow.material.opacity = 0.55 * Math.max(0, 1 - lift / 1.2);
          const hl = params.highlight === 'first' ? i === 0 : params.highlight === 'last' ? i === n - 1 : false;
          b.mesh.material[0].envMapIntensity = hl ? 1.35 : 1.0;
        });
        // Camera tracks from the 1 g bar to the full line-up.
        const travel = ease.quintInOut(seg(T, 0.1, span + 0.8));
        const fromX = bars[0].x, toX = total / 2;
        const tx = mix(fromX, toX, travel);
        const near = kit.fitBox(camera, bars[0].W * 2.4, bars[0].H * 1.6, aspect, { fillW: 0.9, fillH: 0.62 });
        const far = kit.fitBox(camera, total * 1.04, tallest * 1.2, aspect, { fillW: 0.92, fillH: 0.6 });
        const dist = mix(near, far, travel);
        const ty = mix(bars[0].H * 0.6, tallest * 0.48, travel);
        kit.orbit(camera, { target: new THREE.Vector3(tx, ty, 0), distance: dist, azimuth: mix(-0.3, -0.12, travel) + Math.sin(t * 0.2) * 0.02, elevation: mix(0.1, 0.06, travel) });
      },
      post: { bloom: 0.05, bloomThreshold: 3, vignette: 0.3 },
    };
  },
};
