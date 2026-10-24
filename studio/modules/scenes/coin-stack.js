// "Monthly stack": Goldcom coins land one per beat and build a column. Shows grams accumulating, never returns.
export default {
  id: 'coin-stack',
  name: 'Coin stack · month by month',
  description: 'Stamped Goldcom coins with reeded edges drop onto a stack one per beat (12 by default, one per month). Heavy, decisive landings, side light, slow orbit.',
  idea: { en: 'A little every month adds up to something you can hold.', ar: 'القليل كل شهر يصبح ذهبًا بين يديك.' },
  tags: ['savings', 'growth', 'habit', 'coins', 'explainer'],
  duration: 6,
  still: 5.6,
  textZone: 'top',
  focusY: 0.6,
  params: [
    { key: 'count', label: 'Coins', type: 'number', min: 3, max: 24, step: 1, default: 12 },
    { key: 'loose', label: 'Loose coin in front', type: 'select', options: ['on', 'off'], default: 'on' },
  ],
  create({ THREE, kit, params, theme, aspect, loop }) {
    const { ease, seg, mix, rand } = kit;
    const scene = new THREE.Scene();
    const staging = kit.stage(scene, { theme, aspect, glowY: 0.5, glow: 0.8 });
    if (staging.floor) staging.floor.material.uniforms.strength.value = 0.22;
    const camera = new THREE.PerspectiveCamera(24, aspect, 0.1, 100);

    const R = 0.5, TH = 0.07;
    const stamp = kit.coinStamp({});
    const reed = kit.reedingMap(180);
    reed.normalMap.wrapS = THREE.RepeatWrapping;
    const faceMat = kit.materials.gold({ normalMap: stamp.normalMap, roughnessMap: stamp.roughnessMap, roughness: 1, normalScale: 0.8 });
    const edgeMat = kit.materials.gold({ normalMap: reed.normalMap, roughness: 0.26, normalScale: 0.9 });
    const edgeGeo = new THREE.CylinderGeometry(R, R, TH, 160, 1, true);
    const faceGeo = new THREE.CircleGeometry(R, 96);
    function coin() {
      const g = new THREE.Group();
      const edge = new THREE.Mesh(edgeGeo, edgeMat);
      const top = new THREE.Mesh(faceGeo, faceMat);
      top.rotation.x = -Math.PI / 2; top.position.y = TH / 2;
      const bottom = new THREE.Mesh(faceGeo, faceMat);
      bottom.rotation.x = Math.PI / 2; bottom.position.y = -TH / 2;
      g.add(edge, top, bottom);
      return g;
    }
    const N = Math.max(3, Math.min(24, Number(params.count) || 12));
    const coins = [];
    for (let i = 0; i < N; i++) {
      const c = coin();
      const jx = (rand(i * 3.3) - 0.5) * 0.035, jz = (rand(i * 7.9) - 0.5) * 0.035;
      scene.add(c);
      coins.push({ c, y: TH / 2 + i * (TH + 0.002) + 0.001, jx, jz, spin: rand(i * 1.7) * Math.PI * 2 });
    }
    const stackH = N * (TH + 0.002);
    let loose = null;
    if (params.loose !== 'off') {
      loose = coin();
      loose.position.set(-0.95, TH / 2 + 0.001, 0.75);
      loose.rotation.y = 0.8;
      scene.add(loose);
      const ls = kit.contactShadow({ size: 1.4, opacity: 0.55 });
      ls.position.set(-0.95, 0.002, 0.75);
      scene.add(ls);
    }
    const shadow = kit.contactShadow({ size: 1.6, opacity: 0.6 });
    shadow.position.y = 0.002;
    scene.add(shadow);

    return {
      scene, camera,
      update(t, { dur }) {
        const T = loop ? t % dur : t;
        const span = loop ? dur * 0.72 : Math.min(4.4, N * 0.36);
        const beat = span / N;
        const out = loop ? ease.lift(seg(T, dur - 0.55, dur - 0.05)) : 0;
        coins.forEach((k, i) => {
          const start = 0.2 + i * beat;
          const p = ease.weight(seg(T, start, start + 0.55));
          const fall = (1 - p) * 1.9 + out * (stackH + 1.6 - k.y);
          k.c.position.set(k.jx, k.y + fall, k.jz);
          k.c.rotation.set((1 - p) * 0.12, k.spin + (1 - p) * 0.6, (1 - p) * -0.08);
          k.c.visible = T >= start - 0.02;
        });
        const landed = coins.filter((k, i) => T >= 0.2 + i * beat + 0.3).length;
        shadow.material.opacity = Math.min(0.6, 0.15 + landed * 0.05) * (1 - out);
        const h = Math.max(stackH, 0.6);
        const dist = kit.fitBox(camera, 2.4, h * 1.6 + 0.4, aspect, { fillW: 0.86, fillH: 0.62 });
        const az = mix(-0.55, -0.25, ease.glide(seg(t, 0, loop ? dur : 8))) + (loop ? Math.sin((T / dur) * Math.PI * 2) * 0.05 : 0);
        kit.orbit(camera, { target: new THREE.Vector3(-0.15, h * 0.45, 0.15), distance: dist, azimuth: az, elevation: 0.3 });
      },
      post: { bloom: 0.05, bloomThreshold: 3, vignette: 0.3 },
    };
  },
};
