// QA harness for the character & prop illustration system.
// Serves studio/ over a tiny static server, renders contact sheets in headless Chromium and saves PNGs.
// Usage: node scripts/character-sheet.mjs [sheet ...] [--out DIR]
//   sheets: poses-34 poses-front poses-left variety moods props scenes compare anim hero detail sit holds (default: all)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const oi = args.indexOf('--out');
const outDir = oi >= 0 ? args.splice(oi, 2)[1] : '/tmp/claude-0/-home-user-goldcom/a5f0477e-92a2-5866-8ff4-c02fb841d143/scratchpad/characters';
const wanted = args.filter((a) => !a.startsWith('--'));
fs.mkdirSync(outDir, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.normalize(path.join(root, url));
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${port}/scripts/character-sheet.html`);
try {
  await page.waitForFunction(() => window.ready === true, null, { timeout: 20000 });
} catch (e) {
  console.error('Sheet page failed to load:', errors.join('\n') || e.message);
  await browser.close(); server.close(); process.exit(1);
}
const names = await page.evaluate(() => Object.keys(window.sheets));
const todo = wanted.length ? names.filter((n) => wanted.includes(n)) : names;
for (const name of todo) {
  const t0 = Date.now();
  const url = await page.evaluate((n) => window.sheets[n](), name);
  const file = path.join(outDir, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  console.log(`saved ${file} (${Date.now() - t0} ms)`);
}
const perf = await page.evaluate(() => window.perf());
console.log('perf', JSON.stringify(perf));
if (errors.length) console.error('page errors:\n' + errors.join('\n'));
await browser.close();
server.close();
