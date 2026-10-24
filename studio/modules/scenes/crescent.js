// Ramadan crescent told through light: a gold sphere in darkness; the key light orbits and the lit edge grows into a crescent.
export default {
  id: 'crescent',
  name: 'Crescent of light · Ramadan',
  description: 'A satin gold sphere in near darkness. The key light travels from behind the sphere to its side, so the lit edge grows from a hairline into a crescent. No stars, no lanterns.',
  idea: { en: 'The month begins with a crescent; here the crescent is gold.', ar: 'هلال رمضان، مرسوم بالضوء على الذهب.' },
  tags: ['ramadan', 'occasion', 'season', 'abstract'],
  duration: 8,
  still: 6.5,
  textZone: 'bottom',
  focusY: 0.44,
  params: [
    { key: 'side', label: 'Light from', type: 'select', options: ['right', 'left'], default: 'right' },
  ],
  create({ THREE, kit, params, theme, aspect, loop }) {
    const { ease, seg, mix } = kit;
    const scene = new THREE.Scene();
    kit.stage(scene, { theme, aspect, floor: false, glow: 0.25, glowY: 0.44, fog: false, lights: false });
    scene.environment = null;
    const camera = new THREE.PerspectiveCamera(22, aspect, 0.1, 100);
    const mat = new THREE.MeshPhysicalMaterial({ color: kit.GOLD.pure, metalness: 0.55, roughness: 0.38, clearcoat: 0.3, clearcoatRoughness: 0.25 });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), mat);
    scene.add(sphere);
    const key = new THREE.DirectionalLight('#FFE9C6', 5.2);
    scene.add(key);
    const fill = new THREE.AmbientLight('#2A1E12', 0.05);
    scene.add(fill);
    const dir = params.side === 'left' ? -1 : 1;
    return {
      scene, camera, envVariant: 'none',
      update(t, { dur }) {
        const T = loop ? t % dur : t;
        const p = loop ? 0.5 - 0.5 * Math.cos((T / dur) * Math.PI * 2) : ease.glide(seg(T, 0, 6.5));
        // Angle of the light around the sphere: from almost directly behind to 70° off the view axis.
        const a = mix(Math.PI * 0.94, Math.PI * 0.6, p);
        key.position.set(Math.sin(a) * dir * 6, 1.2, Math.cos(a) * 6);
        sphere.rotation.y = t * 0.05;
        const dist = kit.fitBox(camera, 2, 2, aspect, { fillW: 0.62, fillH: 0.5 });
        kit.orbit(camera, { distance: dist * (1 - ease.glide(seg(t, 0, 9)) * 0.04), azimuth: 0, elevation: 0 });
      },
      post: { bloom: 0.12, bloomThreshold: 1.6, bloomRadius: 0.5, vignette: 0.34 },
    };
  },
};
