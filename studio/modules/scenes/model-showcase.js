// Any 3D model (GLB from Meshy, Tripo, or an upload) staged like a Goldcom product: black stone, studio light, slow turntable.
export default {
  id: 'model-showcase',
  name: 'Any 3D model · turntable',
  description: 'Shows a GLB model (generated with generate_3d_model or uploaded) on glossy black stone under the studio lights, turning slowly. Optionally re-materials it in polished gold.',
  idea: { en: 'Any object, presented with the care of a product shot.', ar: 'أي مجسّم، معروض بعناية صورة منتج.' },
  tags: ['model', 'glb', 'product', 'generated'],
  duration: 8,
  still: 2.2,
  textZone: 'top',
  focusY: 0.6,
  params: [
    { key: 'model', label: 'GLB model', type: 'asset', default: '' },
    { key: 'finish', label: 'Material', type: 'select', options: ['original', 'gold', 'satin gold'], default: 'original' },
    { key: 'spin', label: 'Turntable', type: 'select', options: ['slow', 'still', 'full turn'], default: 'slow' },
  ],
  assets: (p) => (p.model ? [p.model] : []),
  create({ THREE, kit, params, theme, aspect, loop, asset }) {
    const { ease, seg } = kit;
    const scene = new THREE.Scene();
    kit.stage(scene, { theme, aspect, glowY: 0.5 });
    const camera = new THREE.PerspectiveCamera(26, aspect, 0.1, 100);
    const holder = new THREE.Group();
    scene.add(holder);
    const gltf = params.model ? asset(params.model, 'gltf') : null;
    let size = new THREE.Vector3(1, 1, 1);
    if (gltf?.scene) {
      const obj = gltf.scene.clone(true);
      const box = new THREE.Box3().setFromObject(obj);
      const s = box.getSize(new THREE.Vector3());
      const k = 1.6 / Math.max(s.x, s.y, s.z, 1e-6);
      obj.scale.setScalar(k);
      const c = box.getCenter(new THREE.Vector3()).multiplyScalar(k);
      obj.position.set(-c.x, -box.min.y * k + 0.02, -c.z);
      if (params.finish !== 'original') {
        const mat = params.finish === 'gold' ? kit.materials.gold({ roughness: 0.18 }) : kit.materials.satin({ roughness: 0.3 });
        obj.traverse((o) => { if (o.isMesh) o.material = mat; });
      }
      holder.add(obj);
      size = s.multiplyScalar(k);
    } else {
      // No model yet: a placeholder plinth so the slide still reads.
      const plinth = new THREE.Mesh(kit.roundedBox(1, 0.5, 1, 0.04), kit.materials.lacquer());
      plinth.position.y = 0.25;
      holder.add(plinth);
      size.set(1, 0.5, 1);
    }
    const shadow = kit.contactShadow({ size: Math.max(size.x, size.z) * 1.8, opacity: 0.6 });
    shadow.position.y = 0.002;
    scene.add(shadow);
    return {
      scene, camera,
      update(t, { dur }) {
        const p = loop ? (t % dur) / dur : t / 12;
        holder.rotation.y = params.spin === 'still' ? -0.5 : params.spin === 'full turn' ? p * Math.PI * 2 : -0.6 + Math.sin(p * Math.PI * 2) * 0.5;
        const rise = loop ? 1 : ease.settle(seg(t, 0, 1.2));
        holder.position.y = (1 - rise) * -0.2;
        const dist = kit.fitBox(camera, Math.max(size.x, size.z) * 1.2, size.y * 1.3, aspect, { fillW: 0.62, fillH: 0.5 });
        kit.orbit(camera, { target: new THREE.Vector3(0, size.y * 0.48, 0), distance: dist * (1 - ease.glide(seg(t, 0, 9)) * 0.05), azimuth: 0.1, elevation: 0.12 });
      },
      post: { bloom: 0.05, bloomThreshold: 3, vignette: 0.3 },
    };
  },
};
