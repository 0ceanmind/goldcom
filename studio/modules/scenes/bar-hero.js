// Hero shot of a Goldcom minted bar: polished field, frosted stamp, long strip-light reflections.
export default {
  id: 'bar-hero',
  name: 'Minted bar · hero',
  description: 'A single Goldcom minted bar floating over black stone, turning slowly so the studio lights sweep across the stamp.',
  idea: { en: 'Real, physical 24K gold with your weight stamped on it.', ar: 'ذهب حقيقي عيار 24، ووزنك مختوم عليه.' },
  tags: ['product', 'hero', 'purity', 'physical'],
  duration: 6,
  still: 2.6,
  textZone: 'top',
  focusY: 0.6,
  params: [
    { key: 'weight', label: 'Weight', type: 'select', options: ['1 g', '2.5 g', '5 g', '10 g', '20 g', '1 oz', '50 g', '100 g'], default: '10 g' },
    { key: 'motion', label: 'Motion', type: 'select', options: ['turntable', 'reveal', 'still'], default: 'reveal' },
    { key: 'serial', label: 'Assay number', type: 'text', default: 'GC 004217' },
    { key: 'dust', label: 'Background motes', type: 'select', options: ['on', 'off'], default: 'on' },
  ],
  create({ THREE, kit, params, theme, lang, aspect, loop }) {
    const { ease, seg, mix } = kit;
    const scene = new THREE.Scene();
    const staging = kit.stage(scene, { theme, aspect, glowY: 0.5 });
    const camera = new THREE.PerspectiveCamera(24, aspect, 0.1, 100);

    const [mmW, mmH, mmD] = kit.BAR_SIZES[params.weight] || kit.BAR_SIZES['10 g'];
    const H = 1.72, W = (H * mmW) / mmH, D = Math.max(0.055, (H * mmD) / mmH * 1.25);
    const stamp = kit.barStamp({ weight: params.weight, serial: params.serial, lang, aspect: mmH / mmW });
    const face = kit.materials.gold({ normalMap: stamp.normalMap, roughnessMap: stamp.roughnessMap, roughness: 1, normalScale: 0.9 });
    const edge = kit.materials.satin({ roughness: 0.26 });
    const bar = new THREE.Mesh(kit.barGeometry({ w: W, h: H, d: D, r: W * 0.07, bevel: Math.min(0.022, D * 0.32) }), [face, edge]);
    const pivot = new THREE.Group();
    pivot.add(bar);
    scene.add(pivot);

    const shadow = kit.contactShadow({ size: 1.9, opacity: 0.5, light: staging.colors.light });
    shadow.position.y = 0.002;
    scene.add(shadow);

    // Out-of-focus motes far behind the bar: a few large, soft discs, never sharp "sparkles".
    const N = params.dust === 'off' ? 0 : 8;
    const dust = kit.softPoints(Math.max(1, N), { size: 1.1, color: '#E9B866', opacity: 0.055 });
    const seeds = Array.from({ length: N }, (_, i) => [kit.rand(i * 3.1) * 9 - 4.5, kit.rand(i * 5.7) * 4 + 0.6, -kit.rand(i * 1.9) * 5 - 4, 0.5 + kit.rand(i * 9.1)]);
    if (N) scene.add(dust);

    const baseY = H / 2 + 0.16;
    return {
      scene, camera,
      update(t, { dur }) {
        const period = loop ? dur : 9;
        const p = kit.phase(t, period);
        let yaw, rise, tilt;
        if (params.motion === 'still') { yaw = -0.42; rise = 1; tilt = 0; }
        else if (params.motion === 'turntable' || loop) { yaw = -0.45 + Math.sin(p * Math.PI * 2) * 0.38; rise = 1; tilt = 0; }
        else {
          // Reveal: the bar rises out of the dark, turns into the key light and settles into a slow drift.
          rise = ease.expoOut(seg(t, 0, 1.6));
          const turn = ease.quintInOut(seg(t, 0.2, 2.6));
          yaw = mix(-1.25, -0.42, turn) + Math.sin(Math.max(0, t - 2.6) * 0.45) * 0.16;
          tilt = (1 - turn) * 0.18;
        }
        const bob = Math.sin(t * 1.05) * 0.025;
        pivot.position.y = baseY - (1 - rise) * 0.4 + bob;
        pivot.rotation.set(-0.06 + tilt, yaw, 0.0);
        shadow.material.opacity = 0.55 * rise * (1 - bob * 4);
        // Slow push-in keeps the frame alive even on a still.
        const push = loop ? Math.sin(p * Math.PI * 2) * 0.12 : ease.sineInOut(seg(t, 0, 8)) * 0.35;
        const dist = kit.fitBox(camera, W * 1.1, H * 1.05, aspect, { fillW: 0.5, fillH: aspect < 0.7 ? 0.42 : 0.56 }) - push;
        kit.orbit(camera, { target: new THREE.Vector3(0, baseY - 0.1, 0), distance: dist, azimuth: 0.04, elevation: 0.05 });
        const pos = dust.geometry.attributes.position, al = dust.geometry.attributes.alpha, sc = dust.geometry.attributes.scale;
        for (let i = 0; i < N; i++) {
          const [x, y, z, s] = seeds[i];
          pos.setXYZ(i, x + Math.sin(t * 0.13 + i) * 0.35, y + Math.sin(t * 0.17 + i * 2) * 0.25, z);
          al.setX(i, (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.35 + i * 1.7))) * rise);
          sc.setX(i, s);
        }
        pos.needsUpdate = true; al.needsUpdate = true; sc.needsUpdate = true;
      },
      post: { bloom: 0.06, bloomThreshold: 3, vignette: 0.3 },
    };
  },
};
