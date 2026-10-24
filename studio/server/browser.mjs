// Optional headless browser (Playwright) for live URL screenshots and server-side slide rendering.
// Install with: npm i playwright && npx playwright install chromium
import fs from 'node:fs';

let browserPromise = null;

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    throw Object.assign(new Error('Playwright is not installed. Run: npm i playwright && npx playwright install chromium'), { status: 501 });
  }
}

export async function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium } = await loadPlaywright();
      const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH && fs.existsSync(process.env.PLAYWRIGHT_CHROMIUM_PATH) ? process.env.PLAYWRIGHT_CHROMIUM_PATH : undefined;
      return chromium.launch({ executablePath, args: ['--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-accelerated-2d-canvas'] });
    })().catch((e) => { browserPromise = null; throw e; });
  }
  return browserPromise;
}

export async function browserAvailable() {
  try { await import('playwright'); return true; } catch { return false; }
}

export async function closeBrowser() {
  if (browserPromise) { try { (await browserPromise).close(); } catch { /* ignore */ } browserPromise = null; }
}

const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' },
  tablet: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
};

/** Screenshot a live URL (e.g. a Claude Code project's dev server) as a PNG buffer. */
export async function capturePage({ url, device = 'phone', fullPage = false, waitMs = 800, selector, colorScheme = 'dark' }) {
  if (!/^https?:\/\//i.test(String(url || ''))) throw Object.assign(new Error('A full http(s) URL is required'), { status: 400 });
  const browser = await getBrowser();
  const ctx = await browser.newContext({ ...(DEVICES[device] || DEVICES.phone), colorScheme });
  try {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => page.waitForLoadState('load'));
    if (waitMs) await page.waitForTimeout(Math.min(Number(waitMs) || 0, 10000));
    if (selector) return await page.locator(selector).first().screenshot();
    return await page.screenshot({ fullPage: !!fullPage });
  } finally {
    await ctx.close();
  }
}

/** Render one slide of a document to PNG using the studio's own renderer page. */
export async function renderDocument({ base, id, slide = 0, t, scale = 1 }) {
  const q = new URLSearchParams({ doc: id, slide: String(slide), scale: String(scale) });
  if (t !== null && t !== undefined && t !== '') q.set('t', String(t));
  return (await renderPage(base, q)).png;
}

/** Render a 3D scene module on its own (used to test new or repaired modules). Returns { png, ms, logs }. */
export async function renderScene({ base, id, params = {}, t, w = 1080, h = 1350, theme = 'onyx', lang = 'en', transparent = false, dur = 6, focusY, post }) {
  const q = new URLSearchParams({ scene: id, params: JSON.stringify(params || {}), w: String(w), h: String(h), theme, lang, dur: String(dur) });
  if (t !== null && t !== undefined && t !== '') q.set('t', String(t));
  if (transparent) q.set('transparent', '1');
  if (focusY !== undefined && focusY !== null) q.set('focusY', String(focusY));
  if (post) q.set('post', typeof post === 'string' ? post : JSON.stringify(post));
  return renderPage(base, q);
}

// Headless WebGL renders are heavy: run at most two at a time, queue the rest.
let active = 0;
const waiting = [];
async function slot(fn) {
  if (active >= 2) await new Promise((r) => waiting.push(r));
  active++;
  try { return await fn(); } finally { active--; waiting.shift()?.(); }
}

function renderPage(base, q) { return slot(() => renderPageNow(base, q)); }

async function renderPageNow(base, q) {
  const browser = await getBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1200 } });
  const logs = [];
  try {
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`.slice(0, 600)); });
    page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`.slice(0, 600)));
    await page.goto(`${base}/render.html?${q}`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction('window.__READY === true || window.__ERROR', null, { timeout: 120000 });
    const err = await page.evaluate('window.__ERROR || null');
    if (err) throw Object.assign(new Error(`Render failed: ${err}`), { logs });
    const [dataUrl, ms, warn] = await page.evaluate('[window.__PNG, window.__MS, window.__WARN || []]');
    return { png: Buffer.from(dataUrl.split(',')[1], 'base64'), ms, warnings: warn, logs };
  } finally {
    await ctx.close();
  }
}

/** Rasterise an SVG string to PNG at w×h (Claude's vector art becomes a layer like any image). */
export async function rasterizeSvg(svg, w = 1080, h = 1350) {
  return slot(async () => {
    const browser = await getBrowser();
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    try {
      const page = await ctx.newPage();
      await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg.replace(/<svg/i, `<svg width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"`)}</body></html>`);
      return await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h }, omitBackground: true });
    } finally { await ctx.close(); }
  });
}
