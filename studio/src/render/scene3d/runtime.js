// 3D scene runtime: one shared WebGL renderer draws every `scene3d` layer into the 2D slide canvas.
// Scene modules live in studio/modules/scenes/*.js and are loaded at runtime, so new ones
// (written by Claude or by hand) appear without rebuilding the studio.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { kit, studioEnvScene } from './kit.js';
import { loadType3d, type3dReady } from './type3d.js';
import { setSceneRegistry } from '../../../shared/templates.js';

const TONE = { neutral: THREE.NeutralToneMapping, aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, none: THREE.NoToneMapping };

// Guards every frame against NaN/Inf pixels (degenerate normals, bad tangents in a module) before bloom spreads them.
const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (c.r != c.r || c.g != c.g || c.b != c.b || c.a != c.a) c = vec4(0.0);
      gl_FragColor = clamp(c, vec4(0.0), vec4(48.0, 48.0, 48.0, 1.0));
    }`,
};

const FinishShader = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.22 }, grain: { value: 0.025 }, time: { value: 0 }, res: { value: new THREE.Vector2(1080, 1350) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float vignette; uniform float grain; uniform float time; uniform vec2 res;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = (vUv - 0.5) * vec2(res.x / res.y, 1.0);
      float v = 1.0 - vignette * smoothstep(0.32, 0.95, length(d) * 1.25);
      c.rgb *= v;
      float n = hash(floor(vUv * res) + fract(time * 7.13) * 91.7) - 0.5;
      c.rgb += n * grain * c.a;
      gl_FragColor = c;
    }`,
};

class SceneRuntime {
  constructor() {
    this.registry = new Map(); // id -> meta from /api/modules
    this.modules = new Map(); // id -> { mod, version } | { error }
    this.loading = new Map();
    this.instances = new Map(); // key -> instance
    this.broken = new Map(); // id -> message
    this.reported = new Set();
    this.listeners = new Set();
    this.assets = new Map(); // url -> { value, p, err }
    this.envs = new Map();
    this.composers = new Map();
    this.registryP = null;
    this.base = '';
    this.pendingReports = [];
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(what) { for (const fn of this.listeners) { try { fn(what); } catch { /* ignore */ } } }

  // ---------- registry & modules ----------
  async loadRegistry(force = false) {
    if (this.registryP && !force) return this.registryP;
    this.registryP = (async () => {
      try {
        const res = await fetch(`${this.base}/api/modules`);
        const list = res.ok ? await res.json() : [];
        this.registry.clear();
        for (const m of list) this.registry.set(m.id, m);
        setSceneRegistry(list);
      } catch { /* offline: modules load lazily by id */ }
      return this.registry;
    })();
    return this.registryP;
  }

  list() { return [...this.registry.values()]; }

  async ensure(id) {
    if (!id) return null;
    const have = this.modules.get(id);
    const meta = this.registry.get(id);
    if (have?.mod && (!meta || have.version === meta.version)) return have.mod;
    if (this.loading.has(id)) return this.loading.get(id);
    const p = (async () => {
      await this.loadRegistry();
      const m = this.registry.get(id);
      const file = m?.file || `${id}.js`;
      const v = m?.version || Date.now();
      try {
        const mod = (await import(/* @vite-ignore */ `${this.base}/modules/scenes/${file}?v=${v}`)).default;
        if (!mod || typeof mod.create !== 'function') throw new Error(`Scene module "${id}" has no default export with create()`);
        this.modules.set(id, { mod, version: v });
        this.broken.delete(id);
        return mod;
      } catch (err) {
        this.modules.set(id, { error: String(err?.message || err), version: v });
        this.fail(id, 'load', err);
        return null;
      } finally {
        this.loading.delete(id);
        this.emit({ type: 'module', id });
      }
    })();
    this.loading.set(id, p);
    return p;
  }

  /** Drop cached code and instances for a module (or all) so the next draw reloads it. */
  async invalidate(id) {
    await this.loadRegistry(true);
    for (const [k, inst] of this.instances) {
      if (!id || inst.moduleId === id) { this.disposeInstance(inst); this.instances.delete(k); }
    }
    if (id) { this.modules.delete(id); this.broken.delete(id); } else { this.modules.clear(); this.broken.clear(); }
    this.reported.clear();
    this.emit({ type: 'invalidate', id });
  }

  // ---------- assets a scene can ask for (screenshots, GLB models) ----------
  asset(url, kind) {
    if (!url) return null;
    let e = this.assets.get(url);
    if (!e) {
      e = { value: null, err: null, p: null };
      const isModel = kind === 'gltf' || /\.(glb|gltf)(\?|$)/i.test(url);
      e.p = new Promise((resolve) => {
        const done = (v) => { e.value = v; resolve(v); this.emit({ type: 'asset', url }); };
        const fail = (err) => { e.err = String(err?.message || err); resolve(null); };
        if (isModel) new GLTFLoader().load(url, (g) => done(g), undefined, fail);
        else new THREE.TextureLoader().load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; done(t); }, undefined, fail);
      });
      this.assets.set(url, e);
    }
    return e.value;
  }

  async preload(doc) {
    await Promise.all([this.loadRegistry(), loadType3d().catch(() => null)]);
    const layers = [];
    for (const s of doc.slides || []) for (const l of s.layers || []) if (l.type === 'scene3d' && !l.hidden) layers.push(l);
    const mods = await Promise.all([...new Set(layers.map((l) => l.scene))].map((id) => this.ensure(id)));
    const urls = [];
    for (const l of layers) {
      const mod = this.modules.get(l.scene)?.mod;
      if (!mod?.assets) continue;
      try { for (const u of mod.assets(this.params(mod, l)) || []) if (u) urls.push(u); } catch { /* ignore */ }
    }
    for (const u of urls) this.asset(u);
    await Promise.all(urls.map((u) => this.assets.get(u)?.p));
    return mods;
  }

  params(mod, layer) {
    const out = {};
    for (const p of mod.params || []) out[p.key] = p.default;
    return { ...out, ...(layer.params || {}) };
  }

  // ---------- GPU ----------
  gl() {
    if (this.renderer) return this.renderer;
    const canvas = document.createElement('canvas');
    canvas.width = 2; canvas.height = 2;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.reset(); });
    const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    r.setPixelRatio(1);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.setClearColor(0x000000, 0);
    this.renderer = r;
    this.pmrem = new THREE.PMREMGenerator(r);
    return r;
  }

  reset() {
    for (const inst of this.instances.values()) this.disposeInstance(inst);
    this.instances.clear();
    for (const c of this.composers.values()) c.composer.dispose?.();
    this.composers.clear();
    for (const e of this.envs.values()) e.dispose();
    this.envs.clear();
    try { this.renderer?.dispose(); } catch { /* ignore */ }
    this.renderer = null;
    this.emit({ type: 'reset' });
  }

  env(variant = 'studio') {
    this.gl();
    let e = this.envs.get(variant);
    if (!e) {
      const sc = studioEnvScene(variant);
      e = this.pmrem.fromScene(sc, 0.035).texture;
      sc.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
      this.envs.set(variant, e);
    }
    return e;
  }

  composer(w, h) {
    const key = `${w}x${h}`;
    let c = this.composers.get(key);
    if (c) { c.used = performance.now(); return c; }
    const r = this.gl();
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(r, rt);
    composer.setPixelRatio(1);
    composer.setSize(w, h);
    const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    renderPass.clearAlpha = 0;
    const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.3, 0.55, 0.85);
    const output = new OutputPass();
    const finish = new ShaderPass(FinishShader);
    composer.addPass(renderPass);
    composer.addPass(new ShaderPass(SanitizeShader));
    composer.addPass(bloom);
    composer.addPass(output);
    composer.addPass(finish);
    c = { composer, renderPass, bloom, output, finish, used: performance.now() };
    this.composers.set(key, c);
    if (this.composers.size > 5) {
      const old = [...this.composers.entries()].sort((a, b) => a[1].used - b[1].used)[0];
      old[1].composer.renderTarget1.dispose(); old[1].composer.renderTarget2.dispose();
      old[1].bloom.dispose?.();
      this.composers.delete(old[0]);
    }
    return c;
  }

  disposeInstance(inst) {
    try { inst.dispose?.(); } catch { /* ignore */ }
    inst.scene?.traverse?.((o) => {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap']) m[k]?.dispose?.();
        m.dispose?.();
      }
      o.dispose?.();
    });
    if (inst.scene?.background?.isTexture) inst.scene.background.dispose();
  }

  // ---------- errors ----------
  fail(id, phase, err) {
    const message = String(err?.message || err);
    this.broken.set(id, message);
    const sig = `${id}|${phase}|${message}`;
    if (this.reported.has(sig)) return;
    this.reported.add(sig);
    console.warn(`[scene3d] ${id} ${phase}:`, err);
    try {
      const p = fetch(`${this.base}/api/errors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'scene3d', module: id, phase, message, stack: String(err?.stack || '').slice(0, 4000), url: location.href }),
      }).catch(() => {});
      this.pendingReports.push(p);
    } catch { /* ignore */ }
    this.emit({ type: 'error', id, phase, message });
  }

  status(id) {
    if (this.broken.has(id)) return { state: 'error', message: this.broken.get(id) };
    if (this.modules.get(id)?.mod) return { state: 'ready' };
    return { state: 'loading' };
  }

  // ---------- drawing ----------
  /**
   * Render a scene3d layer at w×h device pixels for time t (seconds; Infinity = the module's still frame).
   * Returns the WebGL canvas (valid until the next call) or null while loading / after an error.
   */
  render(layer, { w, h, t, theme = 'onyx', lang = 'en', dur = 6, live = false, quality = 1 }) {
    const id = layer.scene;
    if (!id || this.broken.has(id)) return null;
    const entry = this.modules.get(id);
    if (!entry?.mod) { this.ensure(id); return null; }
    if (!type3dReady()) { loadType3d().then(() => this.emit({ type: 'fonts' })).catch(() => {}); return null; }
    const mod = entry.mod;
    w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
    const aspect = layer.w / layer.h;
    const params = this.params(mod, layer);
    const transparent = !!layer.transparent;
    const loop = layer.loop?.type === 'seamless' || (layer.seamless ?? false);
    const key = `${layer.id}|${id}@${entry.version}|${theme}|${lang}|${aspect.toFixed(3)}|${transparent}|${loop}|${JSON.stringify(params)}`;
    let inst = this.instances.get(key);
    const r = this.gl();
    try {
      if (!inst) {
        for (const [k, other] of this.instances) if (other.layerId === layer.id && other.moduleId === id) { this.disposeInstance(other); this.instances.delete(k); }
        const api = {
          THREE, kit, params, theme, lang, rtl: lang === 'ar', aspect, transparent, loop, duration: dur, quality,
          env: (v) => this.env(v),
          asset: (url, kind) => this.asset(url, kind),
        };
        const made = mod.create(api);
        if (!made?.scene || !made?.camera) throw new Error('create() must return { scene, camera, update }');
        inst = { ...made, moduleId: id, layerId: layer.id, used: 0 };
        if (!inst.scene.environment && made.envVariant !== 'none') inst.scene.environment = this.env(made.envVariant || 'studio');
        this.instances.set(key, inst);
        if (this.instances.size > 24) {
          const old = [...this.instances.entries()].sort((a, b) => a[1].used - b[1].used)[0];
          this.disposeInstance(old[1]); this.instances.delete(old[0]);
        }
      }
      inst.used = performance.now();
      const still = mod.still ?? Math.min(dur, mod.duration || 6) * 0.7;
      let lt = Number.isFinite(t) ? t : still;
      lt = lt * (layer.speed || 1) + (layer.timeOffset || 0);
      inst.update?.(lt, { dur, live, still: !Number.isFinite(t), aspect, w, h });
      const cam = inst.camera;
      cam.aspect = aspect;
      const focusY = layer.focusY ?? inst.focusY ?? 0.5;
      if (Math.abs(focusY - 0.5) > 0.001) cam.setViewOffset(1000 * aspect, 1000, 0, -(focusY - 0.5) * 1000, 1000 * aspect, 1000);
      else if (cam.view?.enabled) cam.clearViewOffset();
      cam.updateProjectionMatrix();

      const post = { bloom: 0.1, bloomRadius: 0.3, bloomThreshold: 2.4, exposure: 1, tone: 'neutral', vignette: transparent ? 0 : 0.24, grain: transparent ? 0 : 0.022, ...(mod.post || {}), ...(inst.post || {}), ...(layer.post || {}) };
      r.setSize(w, h, false);
      r.toneMapping = TONE[post.tone] ?? THREE.NeutralToneMapping;
      r.toneMappingExposure = post.exposure;
      r.setClearColor(0x000000, 0);
      const c = this.composer(w, h);
      c.renderPass.scene = inst.scene;
      c.renderPass.camera = cam;
      c.bloom.enabled = post.bloom > 0;
      c.bloom.strength = post.bloom;
      c.bloom.radius = post.bloomRadius;
      c.bloom.threshold = post.bloomThreshold;
      c.finish.uniforms.vignette.value = post.vignette;
      c.finish.uniforms.grain.value = post.grain;
      c.finish.uniforms.time.value = lt;
      c.finish.uniforms.res.value.set(w, h);
      c.composer.render();
      return r.domElement;
    } catch (err) {
      if (inst) { this.disposeInstance(inst); this.instances.delete(key); }
      this.fail(id, inst ? 'render' : 'create', err);
      return null;
    }
  }
}

export const sceneRuntime = new SceneRuntime();
if (typeof window !== 'undefined') window.__goldcomScenes = sceneRuntime;
