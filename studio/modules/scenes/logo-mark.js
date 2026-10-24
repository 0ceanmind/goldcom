// The Goldcom symbol in solid gold: its three parts (roof, G, gem) arrive and lock, or the mark emerges from darkness.
export default {
  id: 'logo-mark',
  name: 'Goldcom mark · sting',
  description: 'The Goldcom symbol extruded in polished gold. "assemble": the roof, the G and the gem glide in from three directions and lock together. "emerge": the mark sits dark on onyx and appears only where a raking light passes.',
  idea: { en: 'A brand sign-off with weight: the mark, made of gold.', ar: 'توقيع العلامة: شعار جولدكم من ذهب.' },
  tags: ['logo', 'sting', 'brand', 'outro', 'intro'],
  duration: 4,
  still: 3.4,
  textZone: 'bottom',
  focusY: 0.42,
  params: [
    { key: 'mode', label: 'Motion', type: 'select', options: ['assemble', 'emerge'], default: 'assemble' },
    { key: 'floor', label: 'Stone floor', type: 'select', options: ['on', 'off'], default: 'on' },
  ],
  create({ THREE, kit, params, theme, aspect, loop }) {
    const { ease, seg, mix, clamp } = kit;
    const scene = new THREE.Scene();
    const withFloor = params.floor !== 'off';
    const staging = kit.stage(scene, { theme, aspect, floor: withFloor, glowY: 0.45, glow: 0.9 });
    if (staging.floor) { staging.floor.material.uniforms.strength.value = 0.14; staging.floor.material.uniforms.falloff.value = 2.4; }
    const camera = new THREE.PerspectiveCamera(24, aspect, 0.1, 100);

    const geos = kit.symbolGeometries({ depth: 0.16, bevel: 0.02 });
    const mk = (g) => new THREE.Mesh(g, kit.materials.gold({ roughness: 0.16 }));
    const parts = { roof: mk(geos.roof), g: mk(geos.g), gem: mk(geos.gem) };
    const mark = new THREE.Group();
    for (const m of Object.values(parts)) mark.add(m);
    const H = 1.35;
    mark.scale.setScalar(H);
    const lift = withFloor ? H / 2 + 0.06 : 0;
    mark.position.y = lift;
    scene.add(mark);
    const shadow = kit.contactShadow({ size: 1.3, opacity: withFloor ? 0.5 : 0 });
    shadow.position.y = 0.002;
    scene.add(shadow);

    const sweep = new THREE.PointLight('#FFE6BF', 0, 3, 1.5);
    scene.add(sweep);
    // Each part's arrival vector (in mark units): roof from above, G from the start side, gem from below.
    const from = { roof: new THREE.Vector3(0, 0.55, -0.4), g: new THREE.Vector3(-0.6, -0.05, -0.3), gem: new THREE.Vector3(0.1, -0.5, 0.35) };
    const delay = { roof: 0.15, g: 0.35, gem: 0.6 };
    const dark = new THREE.Color('#1A1610'), gold = new THREE.Color(kit.GOLD.pure);

    return {
      scene, camera,
      update(t, { dur }) {
        const T = loop ? t % dur : t;
        const out = loop ? ease.lift(seg(T, dur - 0.5, dur - 0.05)) : 0;
        if (params.mode === 'emerge') {
          const a = mix(-2.4, 0.9, ease.glide(seg(T, 0.1, 2.6)));
          sweep.position.set(Math.cos(a) * 1.2, lift + Math.sin(a) * 0.6 + 0.2, 0.9);
          sweep.intensity = 7;
          const lit = ease.glide(seg(T, 0.5, 2.8)) * (1 - out);
          for (const m of Object.values(parts)) { m.material.color.copy(dark).lerp(gold, lit); m.material.envMapIntensity = mix(0.08, 1.15, lit); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); }
        } else {
          sweep.intensity = 0;
          for (const [k, m] of Object.entries(parts)) {
            const p = ease.settle(seg(T, delay[k], delay[k] + 1.1));
            const q = 1 - p + out;
            m.position.copy(from[k]).multiplyScalar(q);
            m.rotation.set(from[k].y * q * 0.9, -from[k].x * q * 1.2, 0);
            m.material.color.copy(gold);
            m.material.envMapIntensity = 1.15;
            m.visible = T > delay[k] - 0.05 && q < 1.2;
          }
        }
        // The locked mark turns a few degrees so its bevels catch the strips.
        mark.rotation.set(-0.12, -0.32 + ease.glide(seg(T, 0.6, dur)) * 0.4 + Math.sin(t * 0.4) * 0.03, 0);
        shadow.material.opacity = withFloor ? 0.5 * ease.cubicOut(seg(T, 0.6, 1.6)) * (1 - out) : 0;
        const dist = kit.fitBox(camera, H * 0.8, H, aspect, { fillW: 0.5, fillH: 0.42 });
        kit.orbit(camera, { target: new THREE.Vector3(0, lift, 0), distance: dist * (1 - ease.glide(seg(t, 0, 8)) * 0.06), azimuth: 0.02, elevation: withFloor ? 0.08 : 0 });
      },
      post: { bloom: 0.07, bloomThreshold: 2.8, vignette: 0.32 },
    };
  },
};
