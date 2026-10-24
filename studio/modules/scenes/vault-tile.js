// "The vault tile": a wall of dark brushed panels; one slides open and warm light shows a bar inside.
export default {
  id: 'vault-tile',
  name: 'Vault tile · reveal',
  description: 'A wall of dark brushed-bronze panels with hairline gaps. The centre panel slides back and aside; warm light spills out of the shallow compartment where a Goldcom bar stands. The wall closes again for the loop.',
  idea: { en: 'Your gold is real, allocated to you and kept safe.', ar: 'ذهبك حقيقي، ومخصّص لك، ومحفوظ بأمان.' },
  tags: ['security', 'storage', 'trust', 'vault', 'reveal'],
  duration: 6,
  still: 4.4,
  textZone: 'top',
  focusY: 0.56,
  params: [
    { key: 'weight', label: 'Bar inside', type: 'select', options: ['10 g', '20 g', '50 g', '100 g', '1 oz'], default: '50 g' },
    { key: 'number', label: 'Box number', type: 'text', default: '0217' },
  ],
  create({ THREE, kit, params, theme, lang, aspect, loop }) {
    const { ease, seg, mix } = kit;
    const scene = new THREE.Scene();
    kit.stage(scene, { theme, aspect, floor: false, glowY: 0.45, glow: 0.4, fog: false });
    const camera = new THREE.PerspectiveCamera(24, aspect, 0.1, 100);

    const COLS = 9, ROWS = 11, PW = 0.74, PH = 0.52, GAP = 0.018, PD = 0.08;
    const panelMat = new THREE.MeshPhysicalMaterial({ color: '#3A2E24', metalness: 0.85, roughness: 0.38, envMapIntensity: 0.8 });
    const panelGeo = kit.roundedBox(PW, PH, PD, 0.01, 3);
    const wall = new THREE.Group();
    scene.add(wall);
    const oc = 4, or = 5; // the panel that opens (centre)
    let openPanel = null;
    const W = COLS * (PW + GAP), H = ROWS * (PH + GAP);
    const cell = (c, r) => new THREE.Vector3(-W / 2 + (c + 0.5) * (PW + GAP), H / 2 - (r + 0.5) * (PH + GAP), 0);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const m = new THREE.Mesh(panelGeo, panelMat);
        m.position.copy(cell(c, r));
        wall.add(m);
        if (c === oc && r === or) openPanel = m;
      }
    }
    // Engraved box number on the panel that opens.
    const plate = kit.reliefMaps((cx, w, h) => {
      kit.drawText(cx, String(params.number || '0217'), w * 0.88, h * 0.84, { size: h * 0.12, weight: 600, align: 'right', letterSpacing: 4 });
    }, { w: 1024, h: 720, strength: 2.2 });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(PW - 0.02, PH - 0.02), new THREE.MeshPhysicalMaterial({ color: '#3A2E24', metalness: 0.85, roughness: 0.44, envMapIntensity: 0.5, normalMap: plate.normalMap, normalScale: new THREE.Vector2(-0.9, -0.9), transparent: true }));
    face.position.z = PD / 2 + 0.0008;
    openPanel.add(face);
    const home = cell(oc, or);

    // Shallow compartment behind the opening, lit warm from its top edge.
    const depth = 0.3;
    const cav = new THREE.Group();
    cav.position.copy(home);
    wall.add(cav);
    const inside = new THREE.MeshStandardMaterial({ color: '#2B2016', roughness: 0.62, metalness: 0.2 });
    const plane = (w, h, x, y, z, rx, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), inside); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); cav.add(m); return m; };
    plane(PW, PH, 0, 0, -depth, 0, 0);
    plane(depth, PH, -PW / 2, 0, -depth / 2, 0, Math.PI / 2);
    plane(depth, PH, PW / 2, 0, -depth / 2, 0, -Math.PI / 2);
    plane(PW, depth, 0, -PH / 2, -depth / 2, -Math.PI / 2, 0);
    plane(PW, depth, 0, PH / 2, -depth / 2, Math.PI / 2, 0);
    // Far backdrop seen through the hairline gaps.
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(W + 6, H + 6), new THREE.MeshBasicMaterial({ color: '#050404' }));
    backdrop.position.z = -depth - 0.4;
    wall.add(backdrop);
    // A hidden warm LED strip along the top inside edge, like a display niche.
    const led = new THREE.Mesh(new THREE.BoxGeometry(PW * 0.92, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFC27A').multiplyScalar(2.2) }));
    led.position.set(0, PH / 2 - 0.012, -0.03);
    cav.add(led);

    const [mw, mh, md] = kit.BAR_SIZES[params.weight] || kit.BAR_SIZES['50 g'];
    const bH = PH * 0.74, bW = (bH * mw) / mh, bD = Math.max(0.03, (bH * md) / mh * 1.3);
    const stamp = kit.barStamp({ weight: params.weight, serial: `GC ${String(params.number || '0217').padStart(6, '0')}`, lang, aspect: mh / mw });
    const bar = new THREE.Mesh(kit.barGeometry({ w: bW, h: bH, d: bD, r: bW * 0.07, bevel: 0.01 }), [kit.materials.gold({ normalMap: stamp.normalMap, roughnessMap: stamp.roughnessMap, roughness: 1, normalScale: 0.8 }), kit.materials.satin()]);
    bar.position.set(0.02, -PH / 2 + bH / 2 + 0.012, -depth * 0.45);
    bar.rotation.set(-0.1, 0.12, 0);
    cav.add(bar);
    const glow = new THREE.PointLight('#FFC27A', 0, 1.2, 1.1);
    glow.position.set(0, PH * 0.42, -depth * 0.25);
    cav.add(glow);

    return {
      scene, camera,
      update(t, { dur }) {
        const T = loop ? t % dur : t;
        const closeBack = loop ? ease.cubicInOut(seg(T, dur - 0.6, dur - 0.1)) : 0;
        const closeSide = loop ? ease.cubicInOut(seg(T, dur - 1.3, dur - 0.6)) : 0;
        const back1 = ease.settle(seg(T, 0.9, 1.4)) * (1 - closeBack);
        const side = ease.settle(seg(T, 1.35, 2.45)) * (1 - closeSide);
        openPanel.position.set(home.x + side * (PW + GAP), home.y, home.z - back1 * (PD + 0.012));
        const light = Math.max(back1 * 0.25, side);
        glow.intensity = light * 1.4;
        led.material.color.setRGB(1, 0.76, 0.48).multiplyScalar(2.2 * light);
        wall.rotation.y = -0.24;
        const slide = ease.glide(seg(t, 0, loop ? dur : 7));
        const push = ease.glide(seg(T, 2.6, 5.5)) * 0.05;
        const focus = home.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), wall.rotation.y);
        const dist = kit.fitBox(camera, (PW + GAP) * 3.2, (PH + GAP) * 4.2, aspect, { fillW: 1, fillH: 1 });
        kit.orbit(camera, { target: new THREE.Vector3(focus.x + mix(0.18, -0.02, slide), focus.y + 0.02, focus.z), distance: dist * (1 - push), azimuth: mix(0.05, -0.05, slide), elevation: 0.03 });
      },
      post: { bloom: 0.06, bloomThreshold: 2.6, vignette: 0.36 },
    };
  },
};
