// A gold ring turning slowly on black stone.
export default {
  id: 'demo-ring',
  name: 'Gold ring · turntable',
  description: 'A plain polished 24K band standing on its edge on black stone, turning slowly.',
  idea: { en: 'Jewellery-grade gold, simply shown.', ar: 'ذهب بجودة المجوهرات.' },
  tags: ['jewellery', 'product'],
  duration: 6,
  still: 2.5,
  textZone: 'top',
  focusY: 0.6,
  params: [],
  create({ THREE, kit, theme, aspect }) {
    const scene = new THREE.Scene();
    kit.stage(scene, { theme, aspect });
    const camera = new THREE.PerspectiveCamera(24, aspect, 0.1, 100);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.12, 64, 160), kit.materials.gold({ roughness: 0.16 }));
    ring.position.y = 0.72;
    scene.add(ring);
    return {
      scene, camera,
      update(t) {
        ring.rotation.y = t * 0.4;
        kit.orbit(camera, { target: new THREE.Vector3(0, 0.7, 0), distance: kit.fitBox(camera, 1.5, 1.5, aspect, { fillW: 0.5, fillH: 0.42 }), azimuth: 0, elevation: 0.1 });
      },
    };
  },
};
