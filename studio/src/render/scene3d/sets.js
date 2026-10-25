// 3D sets for people scenes: soft-matte dioramas (room, souq, office, night room, Muscat corniche, studio sweep).
// Same names and palettes as the illustrated sets (characters/palette.js SET_THEMES), so the production scenes and
// the AI director keep working unchanged. People stand around the origin; the back wall sits at z = -2.4.
// Returns { group, lights, background, fog, env, exposure }.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SET_THEMES } from '../characters/palette.js';
import { COLORS } from '../../../shared/brand.js';
import { canvasTexture, drawSymbol, materials, GOLD } from './kit.js';

const TAU = Math.PI * 2;
const rnd = (seed) => { const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
const C = (h) => new THREE.Color(h);

function matte(color, rough = 0.9) { return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, envMapIntensity: 0.5 }); }
function mesh(geo, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}

/** Arch outline: a rectangle with a round top. */
function arch(path, cx, bottom, w, h, hole = false) {
  const r = w / 2, top = bottom + h - r;
  const p = hole ? new THREE.Path() : path;
  p.moveTo(cx - r, bottom);
  p.lineTo(cx + r, bottom);
  p.lineTo(cx + r, top);
  p.absarc(cx, top, r, 0, Math.PI, false);
  p.lineTo(cx - r, bottom);
  return p;
}

/** A wall (in the XY plane, facing +z) with arched openings. */
function wall({ width = 10, height = 5, depth = 0.14, holes = [], color, x = 0, z = -2.4 }) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0); s.lineTo(width / 2, 0); s.lineTo(width / 2, height); s.lineTo(-width / 2, height); s.lineTo(-width / 2, 0);
  for (const h of holes) s.holes.push(arch(null, h.x, h.y, h.w, h.h, true));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 24 });
  return mesh(g, matte(color, 0.94), { x, z: z - depth });
}

function gradientTexture(stops, { w = 8, h = 512, horizontal = false } = {}) {
  return canvasTexture(horizontal ? h : w, horizontal ? w : h, (c, cw, ch) => {
    const g = horizontal ? c.createLinearGradient(0, 0, cw, 0) : c.createLinearGradient(0, 0, 0, ch);
    for (const [o, col] of stops) g.addColorStop(o, col);
    c.fillStyle = g; c.fillRect(0, 0, cw, ch);
  });
}

function backdrop(stops, { w = 30, h = 14, z = -9, y = 4 } = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: gradientTexture(stops), fog: false, toneMapped: true }));
  m.position.set(0, y, z);
  return m;
}

/** Low mountain ridge silhouette (a flat strip with a noisy top edge). */
function ridge({ width = 30, height = 2.4, z = -8, color, seed = 1, y = 0 }) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const x = -width / 2 + (i / n) * width;
    const v = 0.55 + 0.25 * Math.sin(i * 0.45 + seed) + 0.18 * Math.sin(i * 1.3 + seed * 2) + 0.08 * rnd(i + seed * 10);
    s.lineTo(x, height * v);
  }
  s.lineTo(width / 2, 0); s.lineTo(-width / 2, 0);
  return mesh(new THREE.ShapeGeometry(s), new THREE.MeshStandardMaterial({ color, roughness: 1 }), { y, z, cast: false });
}

function plant(T, { x = 0, z = 0, scale = 1 } = {}) {
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.scale.setScalar(scale);
  g.add(mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.36, 32), matte(T.pot, 0.8), { y: 0.18 }));
  g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 32), matte('#3A2E24', 1), { y: 0.355 }));
  const leafGeo = new THREE.SphereGeometry(1, 16, 10);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + rnd(i) * 0.5, tilt = 0.12 + rnd(i * 3) * 0.32, len = 0.55 + rnd(i * 7) * 0.35;
    const leaf = mesh(leafGeo, matte(i % 2 ? T.plant : T.plant2, 0.75), { y: 0.36 + len * 0.5 * Math.cos(tilt) });
    leaf.scale.set(0.055, len * 0.5, 0.012);
    leaf.position.x = Math.sin(a) * Math.sin(tilt) * len * 0.5;
    leaf.position.z = Math.cos(a) * Math.sin(tilt) * len * 0.5;
    leaf.rotation.set(Math.cos(a) * tilt, a, -Math.sin(a) * tilt * 0.2, 'YXZ');
    leaf.rotation.x = Math.cos(a) * tilt; leaf.rotation.z = -Math.sin(a) * tilt;
    g.add(leaf);
  }
  return g;
}

function palm(T, { x = 0, z = 0, h = 4.2 } = {}) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const trunkMat = matte(T.wood2, 0.95);
  const segs = 12;
  for (let i = 0; i < segs; i++) {
    const y = (i / segs) * h, r = 0.14 - i * 0.004;
    g.add(mesh(new THREE.CylinderGeometry(r * 0.92, r, h / segs * 1.02, 16), trunkMat, { y: y + h / segs / 2, x: Math.sin(i * 0.2) * 0.06 * i / segs, cast: true }));
  }
  const frondMat = matte(T.plant, 0.8);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.3;
    const f = new THREE.Group(); f.position.set(0.06, h, 0); f.rotation.y = a;
    const leaf = mesh(new THREE.SphereGeometry(1, 16, 8), frondMat, { z: 0.75, y: -0.1 });
    leaf.scale.set(0.16, 0.025, 0.8); leaf.rotation.x = 0.35 + rnd(i) * 0.3;
    f.add(leaf); g.add(f);
  }
  return g;
}

function lantern(T, { x = 0, y = 2.6, z = 0, lit = true } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const brass = materials.satin({ color: GOLD.deep, roughness: 0.45 });
  g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.6, 6), brass, { y: 0.42, cast: false }));
  g.add(mesh(new THREE.ConeGeometry(0.11, 0.1, 6), brass, { y: 0.1 }));
  const glass = new THREE.MeshStandardMaterial({ color: '#000000', emissive: C(T.lamp), emissiveIntensity: lit ? 2.2 : 0.2, roughness: 0.6 });
  g.add(mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.2, 6), glass, { y: -0.05, cast: false }));
  g.add(mesh(new THREE.ConeGeometry(0.08, 0.06, 6), brass, { y: -0.18, rx: Math.PI }));
  return g;
}

/** Sun / window light that casts shadows (shadow camera sized for the set). */
function sun(color, intensity, pos, { size = 6, radius = 5 } = {}) {
  const l = new THREE.DirectionalLight(color, intensity);
  l.position.set(...pos);
  l.castShadow = true;
  l.shadow.mapSize.set(1024, 1024);
  l.shadow.radius = radius;
  l.shadow.bias = -0.0004; l.shadow.normalBias = 0.02;
  Object.assign(l.shadow.camera, { left: -size, right: size, top: size, bottom: -size, near: 0.5, far: 30 });
  return l;
}

function frontKey(T, intensity = 1.6) {
  // Soft key from the camera side, no shadow: keeps faces and fronts readable whatever the set light does.
  const l = new THREE.DirectionalLight('#FFF4E6', intensity);
  l.position.set(-1.5, 2.6, 6);
  return l;
}

function floorPlane(color, { w = 30, d = 16, rough = 0.85, planks = false, line } = {}) {
  let map = null;
  if (planks) {
    map = canvasTexture(512, 512, (c, cw, ch) => {
      c.fillStyle = color; c.fillRect(0, 0, cw, ch);
      c.strokeStyle = line || 'rgba(0,0,0,0.12)'; c.lineWidth = 2;
      for (let i = 0; i <= 8; i++) { c.beginPath(); c.moveTo(0, i * 64); c.lineTo(cw, i * 64); c.stroke(); }
      for (let i = 0; i < 24; i++) { const y = Math.floor(i / 3) * 64, x = rnd(i) * cw; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 64); c.stroke(); }
    });
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(w / 4, d / 4);
  }
  const m = mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: map ? '#FFFFFF' : color, map, roughness: rough, metalness: 0, envMapIntensity: 0.4 }), { rx: -Math.PI / 2, z: d / 2 - 2.6, cast: false });
  return m;
}

// ---------- sets ----------
function room(T, { night = false, dim = false } = {}) {
  const g = new THREE.Group();
  const lights = [];
  const winX = -1.05, winW = 1.3, winH = 2.1, winY = 0.75;
  g.add(floorPlane(T.floor, { planks: true, line: T.dark ? 'rgba(0,0,0,0.25)' : 'rgba(120,90,60,0.12)' }));
  g.add(wall({ width: 14, height: 5, holes: [{ x: winX, y: winY, w: winW, h: winH }], color: T.wall }));
  // Window frame, sill and mullions.
  const trim = matte(T.dark ? T.trim : '#FFFFFF', 0.7);
  const frame = new THREE.Shape(); arch(frame, winX, winY, winW + 0.12, winH + 0.06);
  frame.holes.push(arch(null, winX, winY, winW, winH, true));
  g.add(mesh(new THREE.ExtrudeGeometry(frame, { depth: 0.06, bevelEnabled: false, curveSegments: 24 }), trim, { z: -2.4 }));
  g.add(mesh(new RoundedBoxGeometry(winW + 0.3, 0.05, 0.2, 3, 0.015), trim, { x: winX, y: winY - 0.02, z: -2.36 }));
  g.add(mesh(new THREE.BoxGeometry(0.035, winH - winW / 2, 0.04), trim, { x: winX, y: winY + (winH - winW / 2) / 2, z: -2.5 }));
  g.add(mesh(new THREE.BoxGeometry(winW, 0.035, 0.04), trim, { x: winX, y: winY + winH * 0.45, z: -2.5 }));
  // View: sky, sea and the Hajar mountains, a dome and minaret.
  const skyStops = night ? [[0, '#141A26'], [0.6, '#27303F'], [1, '#3A3A3E']] : T.dark ? [[0, T.sky], [0.7, T.skyLow], [1, T.skyLow]] : [[0, '#DCE6E8'], [0.65, T.skyLow], [1, '#F6E7CC']];
  g.add(backdrop(skyStops, { z: -7, y: 3, w: 16, h: 8 }));
  g.add(ridge({ color: night ? '#1B2029' : T.mountain2, z: -6.4, height: 2.6, seed: 2, y: 0.4 }));
  g.add(ridge({ color: night ? '#151A22' : T.mountain, z: -6, height: 1.6, seed: 5, y: 0.4 }));
  g.add(mesh(new THREE.PlaneGeometry(16, 3), matte(night ? '#161B24' : T.sea, 0.4), { rx: -Math.PI / 2, y: 0.45, z: -5.4, cast: false }));
  const domeMat = matte(night ? '#1C212B' : T.dark ? T.mountain2 : '#EDE6D8', 0.9);
  g.add(mesh(new THREE.SphereGeometry(0.42, 24, 12, 0, TAU, 0, Math.PI / 2), domeMat, { x: winX - 0.3, y: 1.15, z: -5.6, cast: false }));
  g.add(mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.7, 24), domeMat, { x: winX - 0.3, y: 0.8, z: -5.6, cast: false }));
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.9, 12), domeMat, { x: winX + 0.45, y: 1.4, z: -5.5, cast: false }));
  g.add(mesh(new THREE.ConeGeometry(0.08, 0.25, 12), domeMat, { x: winX + 0.45, y: 2.47, z: -5.5, cast: false }));
  // Furniture: low sofa, side table, plant, framed print, rug.
  const fabricMat = new THREE.MeshPhysicalMaterial({ color: T.fabric, roughness: 0.92, sheen: 0.6, sheenColor: C(T.fabric).lerp(C('#FFFFFF'), 0.4) });
  const sofa = new THREE.Group(); sofa.position.set(1.55, 0, -1.85);
  sofa.add(mesh(new RoundedBoxGeometry(2.1, 0.42, 0.85, 5, 0.1), fabricMat, { y: 0.25 }));
  sofa.add(mesh(new RoundedBoxGeometry(2.1, 0.55, 0.22, 5, 0.1), fabricMat, { y: 0.62, z: -0.33 }));
  for (const s of [-1, 1]) sofa.add(mesh(new RoundedBoxGeometry(0.22, 0.6, 0.85, 5, 0.1), fabricMat, { x: s * 1.0, y: 0.34 }));
  for (const s of [-0.5, 0.5]) sofa.add(mesh(new RoundedBoxGeometry(0.85, 0.16, 0.6, 5, 0.07), fabricMat, { x: s, y: 0.52, z: 0.06 }));
  g.add(sofa);
  g.add(plant(T, { x: -2.35, z: -1.9, scale: 1.25 }));
  const art = new THREE.Group(); art.position.set(1.55, 2.0, -2.38);
  art.add(mesh(new THREE.BoxGeometry(0.9, 0.62, 0.04), matte(T.dark ? '#2A2824' : '#FFFFFF', 0.6)));
  const print = canvasTexture(256, 176, (c, w, h) => { c.fillStyle = T.dark ? '#33302B' : '#F4EBDA'; c.fillRect(0, 0, w, h); c.fillStyle = T.accent; c.beginPath(); c.moveTo(w * 0.3, h * 0.78); c.lineTo(w * 0.5, h * 0.22); c.lineTo(w * 0.7, h * 0.78); c.closePath(); c.fill(); });
  art.add(mesh(new THREE.PlaneGeometry(0.78, 0.5), new THREE.MeshStandardMaterial({ map: print, roughness: 0.8 }), { z: 0.021, cast: false }));
  g.add(art);
  const rug = canvasTexture(512, 320, (c, w, h) => { c.fillStyle = T.dark ? '#2C2A26' : '#EADCC2'; c.fillRect(0, 0, w, h); c.strokeStyle = T.accentSoft; c.lineWidth = 6; c.strokeRect(22, 22, w - 44, h - 44); c.lineWidth = 2; c.strokeRect(40, 40, w - 80, h - 80); });
  g.add(mesh(new THREE.PlaneGeometry(3.2, 2), new THREE.MeshStandardMaterial({ map: rug, roughness: 1 }), { rx: -Math.PI / 2, y: 0.005, z: 0.1, cast: false }));
  // Light: low sun through the window (the frame casts a soft patch across the floor), front key, ambient.
  if (night) {
    const lamp = new THREE.Group(); lamp.position.set(2.75, 0, -1.6);
    const metal = materials.satin({ color: '#2A2622', roughness: 0.5 });
    lamp.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 24), metal, { y: 0.015 }));
    lamp.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.45, 8), metal, { y: 0.74 }));
    lamp.add(mesh(new THREE.CylinderGeometry(0.17, 0.24, 0.3, 32, 1, true), new THREE.MeshStandardMaterial({ color: '#000', emissive: C('#FFD9A0'), emissiveIntensity: 1.6, side: THREE.DoubleSide }), { y: 1.55, cast: false }));
    g.add(lamp);
    const bulb = new THREE.PointLight('#FFC985', dim ? 5 : 7, 7, 1.6); bulb.position.set(2.75, 1.5, -1.5); bulb.castShadow = true; bulb.shadow.radius = 6; bulb.shadow.mapSize.set(512, 512);
    lights.push(bulb, new THREE.HemisphereLight('#3A4258', '#141210', 0.5), frontKey(T, 0.55));
  } else {
    lights.push(sun('#FFE2B8', dim ? 2.2 : T.dark ? 3.6 : 3.0, [-4.2, 4.6, -8], { size: 5 }), frontKey(T, dim ? 1.0 : T.dark ? 1.5 : 1.15), new THREE.HemisphereLight(T.dark ? '#5A5249' : '#FFF6E8', T.dark ? '#1A1714' : '#B89E7A', T.dark ? 0.7 : 0.55));
  }
  return { group: g, lights, background: night ? '#11141B' : T.dark ? T.wall2 : T.wall, exposure: night ? 1.15 : 1 };
}

function souq(T, { dim = false } = {}) {
  const g = new THREE.Group(); const lights = [];
  g.add(floorPlane(T.dark ? '#24221E' : '#E2D3B6', { planks: true, line: T.dark ? 'rgba(0,0,0,0.35)' : 'rgba(110,80,50,0.16)' }));
  // Arcade: a stone wall with deep arches; the middle arch is a gold shop lit from inside.
  const holes = [-3.6, -1.8, 0, 1.8, 3.6].map((x) => ({ x, y: 0, w: 1.3, h: 2.7 }));
  g.add(wall({ width: 14, height: 4.6, holes, color: T.stoneWall, depth: 0.35 }));
  g.add(mesh(new THREE.BoxGeometry(14, 0.12, 0.5), matte(T.trim, 0.9), { y: 3.05, z: -2.55 }));
  // Decorative band of small diamonds along the top.
  const band = canvasTexture(1024, 32, (c, w, h) => { c.fillStyle = T.stoneWall; c.fillRect(0, 0, w, h); c.fillStyle = T.accentSoft; for (let i = 0; i < 64; i++) { const x = i * 16 + 8; c.beginPath(); c.moveTo(x, 6); c.lineTo(x + 6, 16); c.lineTo(x, 26); c.lineTo(x - 6, 16); c.fill(); } });
  band.wrapS = THREE.RepeatWrapping; band.repeat.set(4, 1);
  g.add(mesh(new THREE.PlaneGeometry(14, 0.26), new THREE.MeshStandardMaterial({ map: band, roughness: 0.9 }), { y: 3.38, z: -2.39, cast: false }));
  // Behind each arch: a dim back room; the centre one is the gold shop.
  for (const [i, x] of [-3.6, -1.8, 0, 1.8, 3.6].entries()) {
    const shop = i === 2;
    g.add(mesh(new THREE.PlaneGeometry(1.5, 3), matte(shop ? '#2A1F16' : T.dark ? '#151412' : '#BFA98A', 1), { x, y: 1.5, z: -3.4, cast: false }));
    if (shop) {
      const glow = new THREE.MeshStandardMaterial({ color: '#000', emissive: C('#FFCF85'), emissiveIntensity: 0.9 });
      for (let r = 0; r < 4; r++) {
        g.add(mesh(new THREE.BoxGeometry(1.1, 0.025, 0.3), matte('#4A3524', 0.7), { x, y: 0.6 + r * 0.45, z: -3.2 }));
        g.add(mesh(new THREE.BoxGeometry(1.08, 0.006, 0.02), glow, { x, y: 0.62 + r * 0.45 + 0.01, z: -3.06, cast: false }));
        for (let k = 0; k < 6; k++) {
          const item = k % 2 ? mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 20), materials.gold(), { x: x - 0.42 + k * 0.17, y: 0.7 + r * 0.45, z: -3.15, cast: false }) : mesh(new RoundedBoxGeometry(0.06, 0.09, 0.012, 2, 0.004), materials.gold(), { x: x - 0.42 + k * 0.17, y: 0.68 + r * 0.45, z: -3.15, cast: false });
          g.add(item);
        }
      }
      const shopLight = new THREE.PointLight('#FFC77A', dim ? 3 : 5, 4, 1.5); shopLight.position.set(x, 2.2, -2.9);
      lights.push(shopLight);
    }
  }
  for (const x of [-2.7, -0.9, 0.9, 2.7]) g.add(lantern(T, { x, y: 2.75, z: -1.7, lit: true }));
  for (const x of [-0.9, 0.9]) { const p = new THREE.PointLight('#FFC27A', dim ? 1.4 : 2.4, 3.5, 1.6); p.position.set(x, 2.6, -1.6); lights.push(p); }
  // A low brass tray stand with coffee pots by the shop.
  lights.push(sun('#FFE2B8', dim ? 1.2 : 2.0, [3.5, 6, 5], { size: 5 }), frontKey(T, dim ? 0.8 : 1.2), new THREE.HemisphereLight(T.dark ? '#4A4036' : '#FFF1DC', T.dark ? '#14110E' : '#BFA27A', T.dark ? 0.55 : 0.9));
  return { group: g, lights, background: T.dark ? '#141210' : T.wall2, exposure: 1 };
}

function office(T, { dim = false } = {}) {
  const g = new THREE.Group(); const lights = [];
  g.add(floorPlane(T.dark ? '#1C1B19' : '#E9E1D2', { rough: 0.6 }));
  // Glass wall: tall mullions over a skyline.
  const frameMat = matte(T.dark ? '#2B2A27' : '#D9D2C4', 0.6);
  g.add(mesh(new THREE.BoxGeometry(14, 0.6, 0.12), matte(T.wall, 0.9), { y: 0.3, z: -2.45 }));
  g.add(mesh(new THREE.BoxGeometry(14, 0.6, 0.12), matte(T.wall, 0.9), { y: 3.7, z: -2.45 }));
  for (let i = -6; i <= 6; i++) g.add(mesh(new THREE.BoxGeometry(0.06, 3.4, 0.1), frameMat, { x: i * 1.15, y: 2, z: -2.42 }));
  g.add(backdrop(T.dark ? [[0, '#1E2228'], [0.7, '#3A3630'], [1, '#4A4136']] : [[0, '#D9E2E4'], [0.7, '#F3E6CF'], [1, '#F6EBD7']], { z: -9, y: 3, w: 22, h: 9 }));
  for (let i = 0; i < 26; i++) {
    const w = 0.4 + rnd(i) * 0.7, h = 1 + rnd(i * 3) * 3.2, x = -9 + i * 0.72 + rnd(i * 5) * 0.3;
    g.add(mesh(new THREE.BoxGeometry(w, h, 0.4), matte(T.dark ? (i % 2 ? '#262A30' : '#2D3137') : i % 2 ? '#D3D0C8' : '#C9C5BC', 1), { x, y: h / 2 + 0.2, z: -7 - rnd(i * 7) * 1.2, cast: false }));
  }
  // Desk with a monitor showing a gold chart, chair, plant.
  const wood = matte(T.wood, 0.7);
  const desk = new THREE.Group(); desk.position.set(1.5, 0, -1.4);
  desk.add(mesh(new RoundedBoxGeometry(1.8, 0.05, 0.8, 3, 0.02), wood, { y: 0.74 }));
  for (const sx of [-0.85, 0.85]) desk.add(mesh(new THREE.BoxGeometry(0.04, 0.72, 0.7), matte(T.dark ? '#2A2926' : '#CFC6B4', 0.6), { x: sx, y: 0.36 }));
  const chart = canvasTexture(512, 300, (c, w, h) => {
    c.fillStyle = '#121211'; c.fillRect(0, 0, w, h);
    c.strokeStyle = COLORS.gold; c.lineWidth = 6; c.beginPath();
    for (let i = 0; i <= 24; i++) { const x = 30 + i * (w - 60) / 24, y = h * 0.75 - i * 6 - Math.sin(i * 0.8) * 18; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
    c.stroke(); c.fillStyle = COLORS.gold; drawSymbol(c, 50, 40, 36);
  });
  desk.add(mesh(new RoundedBoxGeometry(0.82, 0.5, 0.03, 3, 0.012), matte('#141413', 0.4), { y: 1.12, z: -0.15 }));
  desk.add(mesh(new THREE.PlaneGeometry(0.78, 0.46), new THREE.MeshStandardMaterial({ color: '#000', emissive: C('#FFFFFF'), emissiveMap: chart, emissiveIntensity: 0.9 }), { y: 1.12, z: -0.134, cast: false }));
  desk.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 8), matte('#2A2926', 0.5), { y: 0.92, z: -0.17 }));
  g.add(desk);
  g.add(plant(T, { x: -2.4, z: -1.9, scale: 1.3 }));
  lights.push(sun('#FFF1DA', dim ? 1.8 : 2.6, [-3, 5, -7], { size: 5 }), frontKey(T, dim ? 1.0 : T.dark ? 1.4 : 1.1), new THREE.HemisphereLight(T.dark ? '#59524A' : '#FFFFFF', T.dark ? '#181614' : '#BFB29A', T.dark ? 0.7 : 0.55));
  return { group: g, lights, background: T.dark ? '#1A1918' : '#EFE7D8', exposure: 1 };
}

function outdoor(T, { dim = false } = {}) {
  const g = new THREE.Group(); const lights = [];
  // Corniche promenade: pale stone, a low railing, the sea and the mountains at golden hour.
  g.add(floorPlane(T.dark ? '#2A2722' : '#E8DCC4', { planks: true, w: 30, d: 8, line: T.dark ? 'rgba(0,0,0,0.3)' : 'rgba(120,90,60,0.14)' }));
  const sky = T.dark ? [[0, '#20252C'], [0.55, '#4A4136'], [0.8, '#8A6A45'], [1, '#B98A55']] : [[0, '#E3E9E6'], [0.55, '#F6E3C2'], [0.8, '#F3C98C'], [1, '#F2D6A4']];
  g.add(backdrop(sky, { z: -14, y: 5, w: 40, h: 14 }));
  const sunDisc = mesh(new THREE.CircleGeometry(0.7, 48), new THREE.MeshBasicMaterial({ color: C(T.dark ? '#E9B872' : '#FFE3A8'), fog: false }), { x: 3.2, y: 1.9, z: -13.5, cast: false, receive: false });
  g.add(sunDisc);
  g.add(ridge({ color: T.mountain2, z: -12, height: 3.6, seed: 1, width: 40 }));
  g.add(ridge({ color: T.mountain, z: -11, height: 2.2, seed: 4, width: 40 }));
  g.add(mesh(new THREE.PlaneGeometry(40, 9), new THREE.MeshStandardMaterial({ color: T.sea, roughness: 0.25, metalness: 0.1 }), { rx: -Math.PI / 2, y: -0.3, z: -6.8, cast: false }));
  // Railing along the promenade edge.
  const rail = materials.satin({ color: T.dark ? '#6B5A3E' : '#C9B48E', roughness: 0.5 });
  g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 30, 8), rail, { y: 0.95, z: -2.3, rz: Math.PI / 2 }));
  g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 30, 8), rail, { y: 0.5, z: -2.3, rz: Math.PI / 2 }));
  for (let i = -12; i <= 12; i++) g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.95, 8), rail, { x: i * 1.1, y: 0.475, z: -2.3 }));
  // Dome and minaret across the water.
  const stone = matte(T.dark ? '#3A3833' : '#F3ECDE', 0.9);
  g.add(mesh(new THREE.SphereGeometry(0.8, 32, 16, 0, TAU, 0, Math.PI / 2), stone, { x: -3.4, y: 1.3, z: -9.5, cast: false }));
  g.add(mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.3, 32), stone, { x: -3.4, y: 0.65, z: -9.5, cast: false }));
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.13, 3.4, 16), stone, { x: -2.1, y: 1.7, z: -9.3, cast: false }));
  g.add(mesh(new THREE.ConeGeometry(0.13, 0.4, 16), stone, { x: -2.1, y: 3.6, z: -9.3, cast: false }));
  g.add(palm(T, { x: 2.6, z: -1.6, h: 3.8 }));
  lights.push(sun(T.dark ? '#FFC98A' : '#FFD49A', dim ? 2.0 : 3.2, [5, 3.2, -6], { size: 5 }), frontKey(T, dim ? 1.0 : T.dark ? 1.5 : 1.1), new THREE.HemisphereLight(T.dark ? '#6A5B48' : '#FFF4E2', T.dark ? '#1C1814' : '#B9A27A', T.dark ? 0.75 : 0.55));
  return { group: g, lights, background: T.dark ? '#2A2A2A' : '#F2DFC0', exposure: 1, fog: [14, 40] };
}

/**
 * Build a set by name. theme: onyx | cream | bullion | sand. mood: warm | dim.
 * The studio sweep is handled by the caller (kit.cyclorama) and is not built here.
 */
export function diorama(name = 'room', { theme = 'cream', mood = 'warm' } = {}) {
  const T = SET_THEMES[theme] || SET_THEMES.cream;
  const dim = mood === 'dim';
  const s = name === 'souq' ? souq(T, { dim }) : name === 'office' ? office(T, { dim }) : name === 'outdoor-muscat' ? outdoor(T, { dim }) : name === 'night-room' ? room(T, { night: true, dim }) : room(T, { dim });
  return { ...s, palette: T, light: !T.dark };
}

export function setNames() { return ['studio', 'room', 'night-room', 'souq', 'office', 'outdoor-muscat']; }
