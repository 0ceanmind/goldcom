// People: one or two stylized 3D figures (Omani dress, faceless by design) in a 3D set or on a studio sweep.
// Built on kit.figure and kit.diorama, which take the same person spec and set names the production scenes use.
// The camera stays level (verticals stay straight, like architectural photography) and every person's feet land
// exactly where the layout asks (a_at / b_at across, floorAt down), so text and badges can be placed around them.
const PERSON_OPTS = ['man', 'young-man', 'senior-man', 'casual-man', 'woman', 'young-woman', 'senior-woman', 'casual-woman'];
const POSE_OPTS = ['stand', 'phone', 'phone-happy', 'stressed', 'thinking', 'celebrate', 'give-gift', 'receive-gift', 'wave', 'point', 'shrug', 'walk', 'sit', 'hold-goldbar', 'present'];
const MOOD_OPTS = ['neutral', 'happy', 'worried', 'surprised', 'calm', 'proud', 'thinking'];
const PROP_OPTS = ['auto', 'none', 'phone', 'giftbox', 'goldbar', 'receipts', 'bag', 'coffee'];
const SKIN_OPTS = ['light', 'medium', 'tan', 'deep'];

export default {
  id: 'people',
  name: 'People · in a set',
  description: 'One or two soft-matte 3D figures in Omani dress, faceless by design so body language carries the moment, in a 3D set (living room with a Muscat window, souq arcade with a gold shop, office, night room, corniche at golden hour) or on a seamless studio sweep. Real window light and shadows.',
  idea: { en: 'Real people, real moments with gold.', ar: 'أناس حقيقيون ولحظات حقيقية مع الذهب.' },
  tags: ['people', 'character', 'story', 'lifestyle', 'set'],
  duration: 6,
  still: 2.4,
  textZone: 'top',
  focusY: 0.5,
  params: [
    { key: 'set', label: 'Setting', type: 'select', options: ['studio', 'room', 'night-room', 'souq', 'office', 'outdoor-muscat', 'none'], default: 'studio' },
    { key: 'setTheme', label: 'Set colours', type: 'select', options: ['auto', 'onyx', 'cream', 'bullion', 'sand'], default: 'auto' },
    { key: 'mood', label: 'Light', type: 'select', options: ['warm', 'dim'], default: 'warm' },
    { key: 'framing', label: 'Framing', type: 'select', options: ['wide', 'full', 'three-quarter', 'waist', 'cutout'], default: 'full' },
    { key: 'floorAt', label: 'Feet at (0 top … 1 bottom, 0 = auto)', type: 'number', min: 0, max: 1.5, step: 0.01, default: 0 },
    { key: 'fill', label: 'Person height (share of frame, 0 = auto)', type: 'number', min: 0, max: 2, step: 0.01, default: 0 },
    { key: 'props', label: 'Props on the floor (comma list: giftbox, bag, coffee, goldbar)', type: 'text', default: '' },
    { key: 'a_person', label: 'Person', type: 'select', options: [...PERSON_OPTS, 'none'], default: 'woman' },
    { key: 'a_pose', label: 'Pose', type: 'select', options: POSE_OPTS, default: 'phone-happy' },
    { key: 'a_mood', label: 'Mood', type: 'select', options: MOOD_OPTS, default: 'happy' },
    { key: 'a_prop', label: 'Prop', type: 'select', options: PROP_OPTS, default: 'auto' },
    { key: 'a_skin', label: 'Skin', type: 'select', options: SKIN_OPTS, default: 'medium' },
    { key: 'a_facing', label: 'Facing', type: 'select', options: ['auto', 'front', 'right', 'left'], default: 'auto' },
    { key: 'a_at', label: 'Across (0 left … 1 right, 0 = auto)', type: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { key: 'b_person', label: 'Second person', type: 'select', options: ['none', ...PERSON_OPTS], default: 'none' },
    { key: 'b_pose', label: 'Second pose', type: 'select', options: POSE_OPTS, default: 'stand' },
    { key: 'b_mood', label: 'Second mood', type: 'select', options: MOOD_OPTS, default: 'neutral' },
    { key: 'b_prop', label: 'Second prop', type: 'select', options: PROP_OPTS, default: 'auto' },
    { key: 'b_skin', label: 'Second skin', type: 'select', options: SKIN_OPTS, default: 'tan' },
    { key: 'b_facing', label: 'Second facing', type: 'select', options: ['auto', 'front', 'right', 'left'], default: 'auto' },
    { key: 'b_at', label: 'Second across (0 = auto)', type: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { key: 'seed', label: 'Variation', type: 'number', min: 1, max: 9, step: 1, default: 1 },
    { key: 'face', label: 'Face', type: 'select', options: ['none', 'minimal'], default: 'none' },
    { key: 'spec', label: 'Full spec A (JSON, overrides person A)', type: 'text', default: '' },
    { key: 'specB', label: 'Full spec B (JSON)', type: 'text', default: '' },
  ],
  post: { bloom: 0.04, bloomThreshold: 3, vignette: 0.18, exposure: 1.06 },

  create({ THREE, kit, params, theme, lang, aspect, transparent }) {
    const PERSONS = {
      man: { gender: 'man', outfit: 'dishdasha', headwear: 'kumma', age: 'adult', beard: true },
      'young-man': { gender: 'man', outfit: 'dishdasha', headwear: 'kumma', age: 'young', beard: false },
      'senior-man': { gender: 'man', outfit: 'dishdasha', headwear: 'massar', age: 'senior', beard: true },
      'casual-man': { gender: 'man', outfit: 'casual', headwear: 'none', age: 'young', beard: false },
      woman: { gender: 'woman', outfit: 'abaya', headwear: 'hijab', age: 'adult' },
      'young-woman': { gender: 'woman', outfit: 'abaya', headwear: 'sheila', age: 'young' },
      'senior-woman': { gender: 'woman', outfit: 'abaya', headwear: 'hijab', age: 'senior' },
      'casual-woman': { gender: 'woman', outfit: 'casual', headwear: 'hijab', age: 'young' },
    };
    const json = (s) => { try { return s ? (typeof s === 'string' ? JSON.parse(s) : s) : null; } catch { return null; } };
    const setName = params.set || 'studio';
    const cutout = setName === 'none' || transparent || params.framing === 'cutout';
    const setTheme = params.setTheme && params.setTheme !== 'auto' ? params.setTheme : ({ cream: 'cream', sand: 'sand', bullion: 'bullion' }[theme] || 'onyx');
    const light = setTheme === 'cream' || setTheme === 'sand';
    const scene = new THREE.Scene();
    let env = light ? 'bright' : 'warm';

    // ---------- set and light ----------
    if (cutout) {
      // Transparent: only the figure and its shadow, for placing over any background.
      const catcher = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: light ? 0.18 : 0.35 }));
      catcher.rotation.x = -Math.PI / 2; catcher.receiveShadow = true;
      scene.add(catcher);
    }
    if (cutout || setName === 'studio') {
      const sweep = { onyx: '#3A3733', bullion: '#6E4E33', cream: '#F1E7D6', sand: '#E3C76E' }[setTheme] || '#3A3733';
      if (!cutout) {
        scene.background = new THREE.Color(sweep).multiplyScalar(light ? 0.9 : 0.32);
        scene.fog = new THREE.Fog(scene.background, 10, 22);
        scene.add(kit.cyclorama({ color: sweep }));
      }
      const key = new THREE.DirectionalLight('#FFF3E3', light ? 2.4 : 3.4);
      key.position.set(-2.2, 4.2, 3.2);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.radius = 6; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
      Object.assign(key.shadow.camera, { left: -3, right: 3, top: 2.8, bottom: -1, near: 1, far: 14 });
      const rim = new THREE.DirectionalLight('#FFD9A0', light ? 1.2 : 3.2);
      rim.position.set(2.6, 3, -3.4);
      const fill = new THREE.HemisphereLight(light ? '#FFF8EE' : '#6A625A', light ? '#C9B79A' : '#1A1612', 0.9);
      scene.add(key, rim, fill);
      if (params.mood === 'dim') { key.intensity *= 0.6; fill.intensity *= 0.6; }
    } else {
      const set = kit.diorama(setName, { theme: setTheme, mood: params.mood });
      scene.add(set.group);
      for (const l of set.lights) scene.add(l);
      scene.background = new THREE.Color(set.background);
      scene.userData.fog = set.fog || [6, 22];
      env = set.light ? 'bright' : 'warm';
    }

    // ---------- people ----------
    const two = (params.b_person && params.b_person !== 'none') || !!json(params.specB);
    const seed = Number(params.seed) || 1;
    const people = [];
    const specFor = (p, facing, s) => {
      const full = json(params[p === 'a_' ? 'spec' : 'specB']);
      const base = full ? { ...full } : { ...(PERSONS[params[`${p}person`]] || PERSONS.woman), pose: params[`${p}pose`], mood: params[`${p}mood`], skin: params[`${p}skin`] };
      const prop = params[`${p}prop`];
      if (!full && prop && prop !== 'auto') base.prop = prop === 'none' ? null : prop;
      const f = params[`${p}facing`];
      return { face: params.face, seed: s, lang, theme: setTheme, ...base, facing: base.facing || (f && f !== 'auto' ? f : facing) };
    };
    const at = (p, d) => { const v = Number(params[`${p}at`]); return v > 0 ? v : d; };
    const none = params.a_person === 'none' && !json(params.spec);
    const placements = none ? [] : two ? [['a_', at('a_', 0.3), 'right', seed], ['b_', at('b_', 0.7), 'left', seed + 3]] : [['a_', at('a_', 0.5), 'front', seed]];

    // ---------- camera: level, framed so the feet land at floorAt ----------
    const camera = new THREE.PerspectiveCamera(cutout ? 18 : 24, aspect, 0.1, 80);
    const tanV = Math.tan((camera.fov * Math.PI) / 360), tanH = tanV * aspect;
    const F = {
      wide: { fill: two ? 0.42 : 0.46, floor: 0.86 },
      full: { fill: two ? 0.6 : 0.66, floor: 0.9 },
      'three-quarter': { fill: 0.9, floor: 1.12 },
      waist: { fill: 1.25, floor: 1.42 },
      cutout: { fill: 0.92, floor: 0.97 },
    }[cutout ? 'cutout' : params.framing] || { fill: 0.66, floor: 0.9 };
    const floorAt = Number(params.floorAt) > 0 ? Number(params.floorAt) : F.floor;
    // Fit the person to the frame height, but never wider than the frame allows (two people on a square).
    const fill = Number(params.fill) > 0 ? Number(params.fill) : F.fill;
    let dist = 1.8 / (fill * 2 * tanV);
    if (two && !(Number(params.fill) > 0)) dist = Math.max(dist, 1.5 / (0.8 * 2 * tanH));
    const camY = Math.max(0.25, (floorAt - 0.5) * 2 * dist * tanV);
    // Fog starts behind the set, measured from the camera, so it only softens the far view.
    if (scene.userData.fog) scene.fog = new THREE.Fog(scene.background, dist + scene.userData.fog[0], dist + scene.userData.fog[1]);
    else if (scene.fog) { scene.fog.near = dist + 5; scene.fog.far = dist + 16; }
    for (const [p, ax, facing, s] of placements) {
      const f = kit.figure(specFor(p, facing, s));
      f.group.position.x = (ax - 0.5) * 2 * dist * tanH;
      scene.add(f.group);
      if (!cutout) {
        const shadow = kit.contactShadow({ size: 1.1, opacity: light ? 0.3 : 0.6, light });
        shadow.position.set(f.group.position.x, 0.003, 0.02);
        scene.add(shadow);
      }
      people.push(f);
    }
    // Floor props beside the first person (or centre stage), a touch larger than life so they read.
    const propNames = String(params.props || '').split(',').map((x) => x.trim()).filter(Boolean);
    const anchor = people[0] ? people[0].group.position.x : 0;
    propNames.forEach((name, i) => {
      const pr = kit.prop3d(name, { lang, theme: setTheme });
      if (!pr) return;
      const side = anchor > 0 ? -1 : 1;
      pr.scale.setScalar(1.6);
      pr.position.set(anchor + side * (0.55 + i * 0.4), name === 'giftbox' ? 0.12 : name === 'bag' || name === 'shopping-bag' ? 0.62 : name === 'coffee' ? 0.1 : 0.01, 0.25);
      if (name === 'goldbar' || name === 'phone') pr.rotation.x = -Math.PI / 2;
      pr.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      scene.add(pr);
      if (!cutout) { const sh = kit.contactShadow({ size: 0.6, opacity: light ? 0.3 : 0.55, light }); sh.position.set(pr.position.x, 0.003, 0.25); scene.add(sh); }
    });

    return {
      scene, camera,
      envVariant: env,
      post: { exposure: light ? 0.95 : 1.06 },
      update(t) {
        for (const p of people) p.update(t);
        // A slow, barely-there dolly keeps the frame alive without moving the composition.
        const drift = kit.ease.sineInOut(kit.clamp(t / 6));
        const d = dist * (1.015 - 0.02 * drift);
        camera.position.set(0.04 * Math.sin(t * 0.21), camY, d);
        camera.lookAt(0, camY, 0);
      },
    };
  },
};
