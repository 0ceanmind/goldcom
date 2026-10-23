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
check(['studio_guide', 'create_design', 'edit_slide', 'capture_screenshot', 'render_preview', 'export_pngs'].every((t) => tools.includes(t)), `tools registered (${tools.length})`);
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

await call('delete_design', { id: created.id });
fs.rmSync(out, { recursive: true, force: true });
console.log(`\n${ok} checks passed.`);
await client.close();
process.exit(0);
