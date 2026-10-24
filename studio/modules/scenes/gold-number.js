// "The number is the picture": a figure in solid gold, revealed glyph by glyph by a raking light.
export default {
  id: 'gold-number',
  name: 'Number in solid gold',
  description: 'A number or short word (1 g, 24K, 999.9, a price) extruded in polished gold, standing on black stone. It starts as a dark silhouette and a raking light turns each glyph to gold in reading order.',
  idea: { en: 'One figure carries the whole message: a weight, a purity, a price.', ar: 'رقم واحد يقول كل شيء: وزن، أو عيار، أو سعر.' },
  tags: ['type', 'number', 'price', 'purity', 'stat'],
  duration: 5,
  still: 4.2,
  textZone: 'bottom',
  focusY: 0.4,
  params: [
    { key: 'text', label: 'Number or word', type: 'text', default: '999.9', hint: 'Short: up to ~7 characters. Western digits.' },
    { key: 'finish', label: 'Finish', type: 'select', options: ['polished', 'brushed'], default: 'polished' },
    { key: 'reveal', label: 'Reveal', type: 'select', options: ['light', 'rise', 'none'], default: 'light' },
  ],
  create({ THREE, kit, params, theme, aspect, loop, rtl }) {
    const { ease, seg, mix, clamp } = kit;
    const scene = new THREE.Scene();
    const staging = kit.stage(scene, { theme, aspect, glowY: 0.46, glow: 0.8 });
    if (staging.floor) { staging.floor.material.uniforms.strength.value = 0.15; staging.floor.material.uniforms.falloff.value = 2.2; }
    const camera = new THREE.PerspectiveCamera(22, aspect, 0.1, 100);

    const text = String(params.text || '999.9').slice(0, 9);
    const glyphs = kit.glyphs3d(text, { size: 1, depth: 0.26, bevel: 0.028, bevelSegments: 5, curveSegments: 12 });
    const group = new THREE.Group();
    scene.add(group);
    const dark = new THREE.Color('#1E1A14');
    const gold = new THREE.Color(kit.GOLD.pure);
    const items = glyphs.map((g) => {
      const mat = params.finish === 'brushed' ? kit.materials.satin({ color: kit.GOLD.pure, roughness: 0.3 }) : kit.materials.gold({ roughness: 0.17 });
      const mesh = new THREE.Mesh(g.geometry, mat);
      mesh.position.x = g.x;
      group.add(mesh);
      return { mesh, mat, x: g.x + (g.advance || 0) / 2 };
    });
    const bb = new THREE.Box3().setFromObject(group);
    const width = bb.max.x - bb.min.x, height = bb.max.y - bb.min.y;
    group.position.y = height / 2 + 0.02;
    const shadow = kit.contactShadow({ size: 1, opacity: 0.6 });
    shadow.scale.set(width * 1.3, 0.9, 1);
    shadow.position.y = 0.002;
    scene.add(shadow);

    // A real moving light that skims the faces as the reveal passes.
    const sweep = new THREE.PointLight('#FFE6BF', 0, 4.5, 1.2);
    scene.add(sweep);

    const minX = Math.min(...items.map((i) => i.x)), maxX = Math.max(...items.map((i) => i.x));
    return {
      scene, camera,
      update(t, { dur }) {
        const T = loop ? t % dur : t;
        // Reveal order follows reading direction.
        const s = params.reveal === 'none' ? 1 : ease.glide(seg(T, 0.35, 2.4));
        const out = loop ? ease.cubicInOut(seg(T, dur - 0.9, dur - 0.05)) : 0;
        const front = rtl ? mix(maxX + 0.6, minX - 0.6, s) : mix(minX - 0.6, maxX + 0.6, s);
        items.forEach((it, i) => {
          let lit = params.reveal === 'none' ? 1 : clamp((rtl ? it.x - front : front - it.x) / 0.5);
          if (params.reveal === 'rise') lit = 1;
          lit *= 1 - out;
          it.mat.color.copy(dark).lerp(gold, lit);
          it.mat.envMapIntensity = mix(0.12, 1.15, lit);
          const k = params.reveal === 'rise' ? ease.weight(seg(T, 0.2 + i * 0.08, 1.1 + i * 0.08)) : 1;
          it.mesh.position.y = (1 - k) * -0.4;
          it.mesh.rotation.y = Math.sin(t * 0.6 + i * 0.7) * 0.02;
        });
        sweep.position.set(front, height * 1.6, 1.6);
        sweep.intensity = params.reveal === 'light' ? 3 * Math.sin(Math.PI * clamp(s)) : 0;
        group.rotation.set(-0.13, -0.16 + Math.sin(t * 0.25) * 0.05, 0);
        const dist = kit.fitBox(camera, width * 1.08, height * 1.1, aspect, { fillW: 0.82, fillH: 0.3 });
        const push = loop ? Math.sin((T / dur) * Math.PI * 2) * 0.06 : ease.glide(seg(t, 0, 6)) * 0.08;
        kit.orbit(camera, { target: new THREE.Vector3(0, height * 0.5, 0), distance: dist * (1 - push), azimuth: 0.05, elevation: 0.07 });
      },
      post: { bloom: 0.06, bloomThreshold: 3, vignette: 0.3 },
    };
  },
};
