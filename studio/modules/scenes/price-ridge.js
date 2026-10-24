// "Price slabs": each day's price as a thin brushed-gold slab in a gentle arc; today's slab glows from its seam.
export default {
  id: 'price-ridge',
  name: 'Price slabs · recent days',
  description: 'The recent price series as a row of thin brushed-gold slabs on black stone, arranged on a shallow arc. A long lens glides along them so the strip light runs from slab to slab; today\'s slab, at the end, is polished and lit from a warm seam. Pair it with the price and an "indicative" label in 2D.',
  idea: { en: 'Where gold has been lately, and where it is today.', ar: 'مسار الذهب في الأيام الأخيرة، وأين هو اليوم.' },
  tags: ['price', 'chart', 'market', 'data'],
  duration: 6,
  still: 5.2,
  textZone: 'top',
  focusY: 0.62,
  params: [
    { key: 'points', label: 'Price series (comma separated, oldest first)', type: 'text', default: '31.02,31.10,30.96,30.88,31.05,31.22,31.18,31.01,30.94,31.08,31.27,31.35,31.29,31.12,31.06,31.19,31.31,31.26,31.38,31.44,31.36,31.21,31.15,31.24,31.33,31.29,31.18,31.25,31.30,31.20' },
  ],
  create({ THREE, kit, params, theme, aspect, loop }) {
    const { ease, seg, mix, clamp } = kit;
    const scene = new THREE.Scene();
    const staging = kit.stage(scene, { theme, aspect, glowY: 0.55, glow: 0.6, fogNear: 5, fogFar: 15 });
    if (staging.floor) staging.floor.material.uniforms.strength.value = 0.2;
    const camera = new THREE.PerspectiveCamera(20, aspect, 0.1, 100);

    const raw = String(params.points || '').split(',').map(Number).filter(Number.isFinite);
    const pts = raw.length >= 3 ? raw.slice(-40) : [1, 1.2, 1.1, 1.3, 1.25, 1.4];
    const lo = Math.min(...pts), hi = Math.max(...pts);
    // Heights keep a solid base so small moves are visible but never look like a crash or a rocket.
    const hAt = (v) => 0.55 + ((v - lo) / Math.max(1e-6, hi - lo)) * 0.75;
    const n = pts.length, SW = 0.11, SD = 0.026, step = 0.165, R = 7;
    const brushed = kit.materials.satin({ color: kit.GOLD.warm, roughness: 0.28 });
    brushed.envMapIntensity = 2;
    const slabs = [];
    const group = new THREE.Group();
    scene.add(group);
    pts.forEach((v, i) => {
      const h = hAt(v);
      const last = i === n - 1;
      const mat = last ? kit.materials.gold({ roughness: 0.14 }) : brushed;
      const m = new THREE.Mesh(kit.roundedBox(SW, h, SD, 0.006, 2), mat);
      // A shallow arc: the row curves away from the camera at both ends.
      const a = ((i - (n - 1) / 2) * step) / R;
      m.position.set(Math.sin(a) * R, h / 2, R - Math.cos(a) * R - 0.0);
      m.rotation.set(-0.14, -a, 0, 'YXZ');
      group.add(m);
      slabs.push({ m, h, a });
    });
    const today = slabs[n - 1];
    // Warm seam inside today's slab: a thin emissive strip down its middle.
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.012, today.h * 0.92, SD + 0.002), new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFC66B').multiplyScalar(1.6) }));
    today.m.add(seam);
    // A light that travels along the row: the specular runs from slab to slab.
    const sweep = new THREE.PointLight('#FFE7C4', 0, 2.6, 1.2);
    scene.add(sweep);
    const todayLight = new THREE.PointLight('#FFC66B', 0, 1.2, 1.4);
    todayLight.position.set(0, today.h * 0.6, 0.12);
    today.m.add(todayLight);
    const shadow = kit.contactShadow({ size: 1, opacity: 0.55 });
    shadow.scale.set(n * step * 1.1, 0.8, 1);
    shadow.position.y = 0.002;
    scene.add(shadow);

    return {
      scene, camera,
      update(t, { dur }) {
        const T = loop ? t % dur : t;
        const out = loop ? ease.cubicInOut(seg(T, dur - 0.7, dur - 0.05)) : 0;
        // Slabs rise in order, oldest first, then hold.
        slabs.forEach((s, i) => {
          const k = ease.settle(seg(T, 0.1 + i * 0.045, 0.9 + i * 0.045)) * (1 - out);
          // Never scale a mesh to ~0: degenerate normals turn into NaN pixels that bloom smears across the frame.
          s.m.visible = k > 0.03;
          s.m.scale.y = Math.max(0.03, k);
          s.m.position.y = (s.h * Math.max(0.03, k)) / 2;
        });
        const on = ease.snap(seg(T, 2.6, 3.2)) * (1 - out);
        seam.material.color.setRGB(1, 0.78, 0.42).multiplyScalar(2.4 * on);
        todayLight.intensity = 0.8 * on;
        const sw = ease.glide(seg(T, 0.6, 3.4));
        const a = ((mix(-0.6, 1.05, sw) * (n - 1) / 2) * step) / R;
        sweep.position.set(Math.sin(a) * R, 1.25, R - Math.cos(a) * R + 0.7);
        sweep.intensity = 4 * Math.sin(Math.PI * sw);
        const glide = ease.glide(seg(T, 0, loop ? dur : 6));
        const end = today.m.position;
        const dist = kit.fitBox(camera, n * step * 0.62, 1.6, aspect, { fillW: 1, fillH: 0.62 });
        kit.orbit(camera, { target: new THREE.Vector3(mix(-0.4, end.x * 0.55, glide), 0.7, mix(0.2, end.z * 0.5, glide)), distance: dist, azimuth: mix(-0.55, -0.28, glide), elevation: mix(0.1, 0.18, glide) });
      },
      post: { bloom: 0.1, bloomThreshold: 1.8, vignette: 0.28, exposure: 1.35 },
    };
  },
};
