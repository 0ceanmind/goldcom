// A black lacquered gift box opens: warm light spills out onto a minted bar resting on velvet.
export default {
  id: 'gift-box',
  name: 'Gift box · reveal',
  description: 'A black lacquer box on stone with a faint gold seam. The lid lifts on its hinge, warm light spills out, and a Goldcom bar rests on dark velvet inside. The lid is lined in espresso (or cream) with the mark in gold foil.',
  idea: { en: 'Gold makes the gift. Send a bar, not a voucher.', ar: 'الذهب هو الهدية.' },
  tags: ['gift', 'occasion', 'eid', 'wedding', 'reveal', 'product'],
  duration: 6,
  still: 4.6,
  textZone: 'top',
  focusY: 0.6,
  params: [
    { key: 'weight', label: 'Bar inside', type: 'select', options: ['1 g', '2.5 g', '5 g', '10 g', '20 g'], default: '5 g' },
    { key: 'lining', label: 'Lid lining', type: 'select', options: ['espresso', 'cream'], default: 'espresso' },
  ],
  create({ THREE, kit, params, theme, lang, aspect, loop }) {
    const { ease, seg, mix } = kit;
    const scene = new THREE.Scene();
    const staging = kit.stage(scene, { theme, aspect, glowY: 0.52, glow: 0.7 });
    if (staging.floor) staging.floor.material.uniforms.strength.value = 0.1;
    const camera = new THREE.PerspectiveCamera(26, aspect, 0.1, 100);

    const W = 1.5, D = 1.05, BH = 0.42, LH = 0.18, WALL = 0.07, RECESS = 0.14;
    const lacquer = kit.materials.lacquer({ color: '#0D0C0B', roughness: 0.32 });
    // Hollow tray: rounded walls around a recessed velvet insert, so light can pour out of the box.
    const outer = kit.roundedRectShape(W, D, 0.06);
    outer.holes.push(kit.roundedRectShape(W - WALL * 2, D - WALL * 2, 0.03));
    const wallGeo = new THREE.ExtrudeGeometry(outer, { depth: BH, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 3, curveSegments: 10 });
    wallGeo.rotateX(-Math.PI / 2);
    const walls = new THREE.Mesh(wallGeo, lacquer);
    scene.add(walls);
    const velvetMat = kit.materials.velvet({ color: '#100B08', sheenColor: '#A87A45' });
    const insert = new THREE.Mesh(kit.roundedBox(W - WALL * 2 - 0.004, BH - RECESS, D - WALL * 2 - 0.004, 0.02, 3), velvetMat);
    insert.position.y = (BH - RECESS) / 2;
    scene.add(insert);

    const [mw, mh, md] = kit.BAR_SIZES[params.weight] || kit.BAR_SIZES['5 g'];
    const bH = 0.66, bW = (bH * mw) / mh, bD = Math.max(0.035, (bH * md) / mh * 1.4);
    const stamp = kit.barStamp({ weight: params.weight, serial: 'GC 007744', lang, aspect: mh / mw });
    const bar = new THREE.Mesh(kit.barGeometry({ w: bW, h: bH, d: bD, r: bW * 0.07, bevel: 0.012 }), [kit.materials.gold({ normalMap: stamp.normalMap, roughnessMap: stamp.roughnessMap, roughness: 1, normalScale: 0.85 }), kit.materials.satin()]);
    // Presented on a velvet cushion, top end raised toward the viewer; it stays below the closed lid.
    const tilt = 0.34;
    const floorY = BH - RECESS;
    bar.rotation.set(-Math.PI / 2 + tilt, 0, 0);
    bar.position.set(0, floorY + Math.sin(tilt) * bH / 2 + bD / 2 + 0.005, 0.05);
    scene.add(bar);
    const cushion = new THREE.Mesh(kit.roundedBox(bW * 1.3, Math.sin(tilt) * bH * 0.8, 0.14, 0.05, 4), velvetMat);
    cushion.position.set(0, floorY + Math.sin(tilt) * bH * 0.4, 0.05 - Math.cos(tilt) * bH / 2 + 0.05);
    scene.add(cushion);

    // Lid hinged on the back edge.
    const hinge = new THREE.Group();
    hinge.position.set(0, BH, -D / 2);
    scene.add(hinge);
    const lid = new THREE.Mesh(kit.roundedBox(W, LH, D, 0.035, 5), lacquer);
    lid.position.set(0, LH / 2, D / 2);
    hinge.add(lid);
    const lining = kit.canvasTexture(1024, 720, (c, w, h) => {
      c.fillStyle = params.lining === 'espresso' ? '#2A1D14' : '#EFE4D0';
      c.fillRect(0, 0, w, h);
      const g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#F6D88A'); g.addColorStop(1, '#C8943D');
      c.fillStyle = g;
      kit.drawSymbol(c, w / 2, h * 0.44, h * 0.3);
      kit.drawText(c, lang === 'ar' ? 'جولدكم' : 'Goldcom', w / 2, h * 0.72, { size: h * 0.075, weight: 600, letterSpacing: lang === 'ar' ? 0 : 6 });
    });
    const liningMesh = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.12, D - 0.12), new THREE.MeshPhysicalMaterial({ map: lining, roughness: 0.55, sheen: 0.6, sheenColor: new THREE.Color('#FFF1D6'), envMapIntensity: 0.6 }));
    liningMesh.rotation.set(Math.PI / 2, 0, 0);
    liningMesh.position.set(0, -0.002, D / 2);
    hinge.add(liningMesh);

    // The seam: a thin warm line where lid meets base, lit from inside.
    const seam = new THREE.Mesh(new THREE.BoxGeometry(W + 0.004, 0.006, D + 0.004), new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFC66B'), transparent: true, opacity: 0.0 }));
    seam.position.y = BH + 0.002;
    scene.add(seam);
    // Warm light from inside the box: broad and soft, high above the tray so it never makes a hot spot.
    const inner = new THREE.PointLight('#FFC77A', 0, 4, 1.2);
    inner.position.set(0, BH + 1.1, 0.35);
    scene.add(inner);
    const shadow = kit.contactShadow({ size: 2.6, opacity: 0.6 });
    shadow.position.y = 0.002;
    scene.add(shadow);

    return {
      scene, camera,
      update(t, { dur }) {
        const T = loop ? t % dur : t;
        const open = ease.settle(seg(T, 1.0, 2.2)) * (loop ? 1 - ease.cubicInOut(seg(T, dur - 1.0, dur - 0.1)) : 1);
        hinge.rotation.x = -open * 1.86;
        const glowIn = ease.cubicOut(seg(T, 0, 0.9));
        seam.material.opacity = glowIn * (1 - open) * 0.9;
        inner.intensity = open * 1.6;
        inner.position.x = Math.sin(t * 0.5) * 0.15;
        const push = ease.glide(seg(t, 0, 7)) * 0.07;
        const dist = kit.fitBox(camera, W * 1.25, (BH + LH + D * 0.6) * 1.4, aspect, { fillW: 0.74, fillH: 0.5 });
        kit.orbit(camera, { target: new THREE.Vector3(0, BH * 0.9, 0), distance: dist * (1 - push), azimuth: -0.42 + Math.sin(t * 0.15) * 0.03, elevation: 0.42 });
      },
      post: { bloom: 0.04, bloomThreshold: 3, vignette: 0.32 },
    };
  },
};
