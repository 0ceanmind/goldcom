// End-to-end test: drives the MCP server the same way Claude Code does.
// Usage: npm test   (the studio server is started automatically if it is not running)
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const client = new Client({ name: 'smoke-test', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'mcp', 'server.mjs')], env: { ...process.env }, stderr: 'inherit' }));
const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  if (r.isError) throw new Error(`${name}: ${r.content[0].text}`);
  return r;
};
const json = (r) => JSON.parse(r.content[0].text);
let ok = 0;
const check = (cond, msg) => { if (!cond) throw new Error(`FAIL: ${msg}`); ok++; console.log(`  ✓ ${msg}`); };

const tools = (await client.listTools()).tools.map((t) => t.name);
check(['studio_guide', 'create_design', 'edit_slide', 'capture_screenshot', 'render_preview', 'export_pngs', 'list_library', 'create_from_library', 'set_caption', 'list_scenes', 'create_scene_module', 'test_scene', 'generate_image', 'generate_3d_model', 'get_feedback', 'add_lesson', 'get_errors', 'resolve_error', 'save_knowledge'].every((t) => tools.includes(t)), `tools registered (${tools.length})`);
const prompts = (await client.listPrompts()).prompts.map((p) => p.name);
check(prompts.includes('project_carousel'), 'prompts registered');

const guide = (await call('studio_guide')).content[0].text;
check(guide.includes('## Templates') && guide.includes('GOLDCOM'), 'studio_guide returns templates and brand rules');

const created = json(await call('create_design', {
  name: 'Smoke test · project carousel', format: 'feed-portrait', kind: 'carousel', lang: 'en', open: false, project: 'smoke-test',
  slides: [
    { template: 'cover', theme: 'onyx', content: { kicker: 'Built with Claude Code', title: 'Goldcom Studio, *on brand*', subtitle: 'Design carousels from any project.', device: 'browser', visual: 'device' } },
    { template: 'statement', theme: 'charcoal', content: { kicker: 'Why', title: 'Design should keep up with *code*.' } },
    { template: 'list', theme: 'cream', content: { title: 'Highlights', items: ['Templates', 'Live sync', 'MP4 export'] } },
    { template: 'cta', theme: 'onyx', content: { title: 'Try it today', button: 'Open studio', link: 'goldcom.om' } },
  ],
}));
check(created.id && created.slides.length === 4, `create_design → ${created.id}`);

const edited = json(await call('edit_slide', { id: created.id, index: 1, content: { body: 'Guaranteed returns!' } }));
check(edited.brand_check.some((m) => m.includes('guaranteed')), 'brand check flags red-tier claim');
await call('edit_slide', { id: created.id, index: 1, content: { body: 'Every slide follows the Goldcom guidelines.' } });

const shot = json(await call('capture_screenshot', { url: 'http://localhost:5177/', device: 'desktop', attach_to: { id: created.id, index: 0 } }));
check(shot.url?.startsWith('/assets/') && shot.attached, 'capture_screenshot attaches a live screenshot');

const preview = await call('render_preview', { id: created.id, slides: [0, 2], scale: 0.3 });
const imgs = preview.content.filter((c) => c.type === 'image');
check(imgs.length === 2 && imgs[0].data.length > 1000, 'render_preview returns PNG images');

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'goldcom-export-'));
const saved = json(await call('export_pngs', { id: created.id, out_dir: out }));
check(saved.saved.length === 4 && fs.statSync(saved.saved[0]).size > 10000, 'export_pngs writes full-size PNGs');

const moved = json(await call('update_design', { id: created.id, lang: 'ar', order: [0, 2, 1, 3] }));
check(moved.lang === 'ar' && moved.slides[1].template === 'list', 'update_design reorders and switches language');

// Instagram kinds, captions and the library
const reel = json(await call('create_design', {
  name: 'Smoke test · reel', format: 'feed-portrait', kind: 'reel', lang: 'ar', open: false,
  caption: { text: 'الذهب من جوالك.', hashtags: ['#جولدكم', 'ذهب'] }, notes: 'Update the price before posting',
  slides: [{ template: 'kinetic', content: { title: 'ذهب حقيقي. من جرام واحد.' } }, { template: 'countdown', content: { title: 'العيد بعد' } }, { template: 'logo-sting' }],
}));
check(reel.format === 'story' && reel.kind === 'reel', 'reel kind forces the 9:16 format');
const reelDoc = json(await call('get_design', { id: reel.id }));
check(reelDoc.caption?.hashtags?.length === 2 && reelDoc.notes, 'create_design stores caption and notes');
const cap = json(await call('set_caption', { id: reel.id, text: 'Real gold, from 1 g.', hashtags: ['Goldcom'] }));
check(cap.caption.hashtags[0] === '#Goldcom', 'set_caption normalises hashtags');

const lib = json(await call('list_library'));
check(lib.length >= 24 && ['post', 'carousel', 'reel', 'story', 'motion'].every((c) => lib.some((i) => i.category === c)), `list_library returns ${lib.length} items in every category`);
const stories = json(await call('list_library', { category: 'story' }));
check(stories.every((i) => i.category === 'story'), 'list_library filters by category');
const fromLib = json(await call('create_from_library', { item_id: stories[0].id, lang: 'en', open: false }));
check(fromLib.id && fromLib.slides.length > 0, `create_from_library → ${stories[0].id}`);

// Visual-first: 3D scenes, the scene template, building a new scene module, generation and memory
check(guide.includes('## 3D scenes available') && guide.includes('## Lessons learned'), 'studio_guide includes scenes and lessons');
const scenes = json(await call('list_scenes'));
check(scenes.length >= 10 && scenes.every((m) => m.status === 'ok'), `list_scenes returns ${scenes.length} working scenes`);
const visual = json(await call('create_design', { name: 'Smoke test · visual', format: 'feed-portrait', kind: 'post', lang: 'ar', open: false, slides: [{ template: 'scene', content: { scene: 'bar-hero', params: { weight: '5 g' }, title: 'ذهب حقيقي. *ملكك.*' } }] }));
const vdoc = json(await call('get_design', { id: visual.id, full: true }));
check(vdoc.slides[0].layers[0].type === 'scene3d' && vdoc.slides[0].layers[0].params.weight === '5 g', 'scene template builds a full-bleed 3D layer');
const vprev = await call('render_preview', { id: visual.id, scale: 0.3 });
check(vprev.content.some((c) => c.type === 'image' && c.data.length > 5000), 'render_preview renders the 3D scene');
const frames = await call('test_scene', { id: 'coin-stack', times: [1, 3] });
check(frames.content.filter((c) => c.type === 'image').length === 2, 'test_scene renders frames of a module');
const tmpId = 'smoke-test-cube';
const code = `export default { id: '${tmpId}', name: 'Smoke cube', idea: { en: 'test' }, params: [], create({ THREE, kit, theme, aspect }) { const scene = new THREE.Scene(); kit.stage(scene, { theme, aspect }); const camera = new THREE.PerspectiveCamera(24, aspect, 0.1, 100); const m = new THREE.Mesh(kit.roundedBox(1, 1, 1, 0.06), kit.materials.gold()); m.position.y = 0.6; scene.add(m); return { scene, camera, update(t) { m.rotation.y = t * 0.5; kit.orbit(camera, { target: new THREE.Vector3(0, 0.6, 0), distance: 6, elevation: 0.2 }); } }; } };`;
const made = await call('create_scene_module', { id: tmpId, code, test_times: [1] });
check(made.content.some((c) => c.type === 'image'), 'create_scene_module validates, saves and renders a new module');
check(await (async () => { const r = await client.callTool({ name: 'create_scene_module', arguments: { id: 'smoke-test-bad', code: "import x from 'y'; export default {}" + ' '.repeat(60) } }); return r.isError; })(), 'create_scene_module refuses modules that import');
fs.rmSync(path.join(root, 'modules', 'scenes', `${tmpId}.js`), { force: true });
const gen = json(await call('generate_image', { prompt: 'a 10 g gold bar hero shot', aspect: '4:5', provider: 'scene' }));
check(gen.url?.startsWith('/assets/') && gen.provider === 'scene', 'generate_image routes a product shot to the built-in scenes');
const fb = json(await call('get_feedback'));
check(Array.isArray(fb.feedback) && Array.isArray(fb.themes), 'get_feedback returns feedback and recurring themes');
await call('delete_design', { id: visual.id });

// Bad input is refused with a clear message instead of crashing
const refused = async (name, args) => { const r = await client.callTool({ name, arguments: args }); return r.isError; };
check(await refused('create_from_library', { item_id: 'nope' }), 'unknown library item is refused');
check(await refused('edit_slide', { id: created.id, index: 99, content: { title: 'x' } }), 'out-of-range slide index is refused');
check(await refused('create_design', { name: 'x', format: 'feed-portrait', slides: [{ template: 'not-a-template' }], open: false }), 'unknown template is refused');
check(await refused('get_design', { id: 'doc_missing' }), 'missing design is refused');

for (const id of [reel.id, fromLib.id]) await call('delete_design', { id });
await call('delete_design', { id: created.id });
fs.rmSync(out, { recursive: true, force: true });
console.log(`\n${ok} checks passed.`);
await client.close();
process.exit(0);
