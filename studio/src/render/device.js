// Premium device mockups and 3D perspective.
// A phone is drawn flat (body, bezel, screen content, island, glass) into an offscreen canvas, then placed
// with a true perspective warp (WebGL, perspective-correct) when it is tilted, with a visible edge and a soft
// contact shadow. Without WebGL it falls back to an affine approximation.

const offs = new Map();
function offscreen(key, w, h) {
  let cv = offs.get(key);
  if (!cv) { cv = document.createElement('canvas'); offs.set(key, cv); }
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  return cv;
}

function rrPath(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export const DEVICE_SPECS = {
  // ratio = width / height of the whole device; radius, bezel and screen inset are fractions of the width.
  iphone: { ratio: 0.4844, radius: 0.165, rim: 0.011, bezel: 0.036, island: true },
  android: { ratio: 0.4705, radius: 0.105, rim: 0.009, bezel: 0.028, island: false },
};

/** Screen rectangle of a device of size w×h (relative to its top-left). */
export function screenRect(w, h, frame = 'iphone') {
  const sp = DEVICE_SPECS[frame] || DEVICE_SPECS.iphone;
  const inset = w * (sp.rim + sp.bezel);
  return { x: inset, y: inset, w: w - 2 * inset, h: h - 2 * inset, r: Math.max(0, w * sp.radius - inset) };
}

/**
 * Draw a flat device at (0,0,w,h) on c. `drawScreen(c, x, y, w, h)` paints the screen content (already clipped).
 * opts: { frame, finish ('titanium'|'black'|'gold'), glare }
 */
export function drawDeviceFlat(c, w, h, drawScreen, opts = {}) {
  const frame = opts.frame || 'iphone';
  const sp = DEVICE_SPECS[frame] || DEVICE_SPECS.iphone;
  const R = w * sp.radius;
  const finish = opts.finish || 'titanium';
  const metal = finish === 'gold'
    ? ['#7a5a32', '#d9b877', '#8a6a3c', '#f1d999', '#6e5130']
    : finish === 'black'
      ? ['#121212', '#3a3a3a', '#161616', '#4a4a4a', '#0e0e0e']
      : ['#2b2b2a', '#8b8a86', '#3a3a38', '#a9a7a1', '#262625'];
  // Side buttons (behind the body).
  c.fillStyle = metal[2];
  const bw = w * 0.012;
  if (frame === 'iphone') {
    rrPath(c, -bw * 0.75, h * 0.17, bw * 1.5, h * 0.045, bw); c.fill();
    rrPath(c, -bw * 0.75, h * 0.245, bw * 1.5, h * 0.075, bw); c.fill();
    rrPath(c, -bw * 0.75, h * 0.335, bw * 1.5, h * 0.075, bw); c.fill();
    rrPath(c, w - bw * 0.75, h * 0.27, bw * 1.5, h * 0.11, bw); c.fill();
  } else {
    rrPath(c, w - bw * 0.75, h * 0.2, bw * 1.5, h * 0.12, bw); c.fill();
    rrPath(c, w - bw * 0.75, h * 0.36, bw * 1.5, h * 0.06, bw); c.fill();
  }
  // Metal rim.
  const g = c.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, metal[1]); g.addColorStop(0.18, metal[0]); g.addColorStop(0.5, metal[3]); g.addColorStop(0.82, metal[4]); g.addColorStop(1, metal[1]);
  rrPath(c, 0, 0, w, h, R); c.fillStyle = g; c.fill();
  // Fine inner highlight on the rim.
  c.save();
  rrPath(c, w * 0.004, w * 0.004, w - w * 0.008, h - w * 0.008, R - w * 0.004);
  c.strokeStyle = 'rgba(255,255,255,0.16)'; c.lineWidth = Math.max(0.5, w * 0.0025); c.stroke();
  c.restore();
  // Black glass bezel.
  const ri = w * sp.rim;
  rrPath(c, ri, ri, w - 2 * ri, h - 2 * ri, R - ri); c.fillStyle = '#050505'; c.fill();
  // Screen.
  const s = screenRect(w, h, frame);
  c.save();
  rrPath(c, s.x, s.y, s.w, s.h, s.r); c.clip();
  c.fillStyle = '#151513'; c.fillRect(s.x, s.y, s.w, s.h);
  drawScreen?.(c, s.x, s.y, s.w, s.h);
  // Glass: a faint diagonal reflection.
  if (opts.glare !== false) {
    const gg = c.createLinearGradient(s.x, s.y, s.x + s.w * 0.9, s.y + s.h * 0.55);
    gg.addColorStop(0, 'rgba(255,255,255,0.10)'); gg.addColorStop(0.38, 'rgba(255,255,255,0.03)'); gg.addColorStop(0.381, 'rgba(255,255,255,0)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gg; c.fillRect(s.x, s.y, s.w, s.h);
  }
  c.restore();
  // Camera: dynamic island or punch hole.
  c.fillStyle = '#000';
  if (sp.island) { rrPath(c, w / 2 - w * 0.13, s.y + w * 0.028, w * 0.26, w * 0.072, w * 0.036); c.fill(); }
  else { c.beginPath(); c.arc(w / 2, s.y + w * 0.05, w * 0.022, 0, Math.PI * 2); c.fill(); }
  // Lens glint inside the camera.
  c.fillStyle = 'rgba(70,80,110,0.55)';
  c.beginPath(); c.arc(sp.island ? w / 2 + w * 0.085 : w / 2, s.y + (sp.island ? w * 0.064 : w * 0.05), w * 0.011, 0, Math.PI * 2); c.fill();
}

// ---------- 3D maths ----------
const rad = (d) => (d * Math.PI) / 180;
function rotate([x, y, z], rx, ry, rz) {
  // Order: Z (roll), then X (pitch), then Y (yaw).
  let c = Math.cos(rad(rz)), s = Math.sin(rad(rz));
  [x, y] = [x * c - y * s, x * s + y * c];
  c = Math.cos(rad(rx)); s = Math.sin(rad(rx));
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(rad(ry)); s = Math.sin(rad(ry));
  [x, z] = [x * c + z * s, -x * s + z * c];
  return [x, y, z];
}
function project([x, y, z], d) { const k = d / (d + z); return { x: x * k, y: y * k, w: (d + z) / d }; }

function rimPoints(w, h, r, n = 10) {
  // Rounded-rect outline sampled clockwise from the top-left corner (centred coordinates).
  const pts = [];
  const corners = [[w / 2 - r, -h / 2 + r, -90], [w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 90], [-w / 2 + r, -h / 2 + r, 180]];
  for (const [cx, cy, a0] of corners) for (let i = 0; i <= n; i++) { const a = rad(a0 + (90 * i) / n); pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
}

function hull(points) {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// ---------- WebGL warp ----------
let gl = null, glCanvas = null, glProg = null, glBuf = null, glTex = null, glFailed = false, glAniso = null, gl2 = false;
function initGL() {
  if (gl || glFailed) return gl;
  try {
    glCanvas = document.createElement('canvas');
    const attrs = { premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: true, alpha: true };
    gl = glCanvas.getContext('webgl2', attrs);
    gl2 = !!gl;
    if (!gl) gl = glCanvas.getContext('webgl', attrs);
    if (!gl) throw new Error('no webgl');
    const vs = 'attribute vec4 p;attribute vec2 uv;varying vec2 v;void main(){gl_Position=p;v=uv;}';
    const fs = 'precision highp float;varying vec2 v;uniform sampler2D t;uniform float a;void main(){gl_FragColor=texture2D(t,v)*a;}';
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    glProg = gl.createProgram();
    gl.attachShader(glProg, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(glProg, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(glProg);
    if (!gl.getProgramParameter(glProg, gl.LINK_STATUS)) throw new Error('link failed');
    glBuf = gl.createBuffer();
    glTex = gl.createTexture();
    glAniso = gl.getExtension('EXT_texture_filter_anisotropic');
  } catch {
    glFailed = true; gl = null;
  }
  return gl;
}

/** Draw `src` (canvas) mapped onto the projected quad corners (tl, tr, br, bl with x, y, w) into c at bbox. */
function warpGL(c, src, quad, scale) {
  if (!initGL()) return false;
  const xs = quad.map((q) => q.x), ys = quad.map((q) => q.y);
  const bx = Math.floor(Math.min(...xs)) - 2, by = Math.floor(Math.min(...ys)) - 2;
  const bw = Math.ceil(Math.max(...xs)) + 2 - bx, bh = Math.ceil(Math.max(...ys)) + 2 - by;
  const pw = Math.max(1, Math.min(4096, Math.round(bw * scale))), ph = Math.max(1, Math.min(4096, Math.round(bh * scale)));
  if (glCanvas.width !== pw || glCanvas.height !== ph) { glCanvas.width = pw; glCanvas.height = ph; }
  gl.viewport(0, 0, pw, ph);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(glProg);
  const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const data = [];
  for (const i of [0, 1, 2, 0, 2, 3]) {
    const q = quad[i];
    const nx = ((q.x - bx) / bw) * 2 - 1, ny = 1 - ((q.y - by) / bh) * 2;
    data.push(nx * q.w, ny * q.w, 0, q.w, uv[i][0], uv[i][1]);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, glBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STREAM_DRAW);
  const pLoc = gl.getAttribLocation(glProg, 'p'), uvLoc = gl.getAttribLocation(glProg, 'uv');
  gl.enableVertexAttribArray(pLoc); gl.vertexAttribPointer(pLoc, 4, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(uvLoc); gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 24, 16);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, glTex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  const pot = (n) => (n & (n - 1)) === 0;
  const mip = gl2 || (pot(src.width) && pot(src.height));
  if (mip) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (glAniso) gl.texParameterf(gl.TEXTURE_2D, glAniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
  gl.uniform1i(gl.getUniformLocation(glProg, 't'), 0);
  gl.uniform1f(gl.getUniformLocation(glProg, 'a'), 1);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  c.drawImage(glCanvas, bx, by, bw, bh);
  return true;
}

function warpAffine(c, src, quad) {
  // Parallelogram through tl, tr, bl: good enough for small tilts when WebGL is missing.
  const [tl, tr, , bl] = quad;
  c.save();
  c.transform((tr.x - tl.x) / src.width, (tr.y - tl.y) / src.width, (bl.x - tl.x) / src.height, (bl.y - tl.y) / src.height, tl.x, tl.y);
  c.drawImage(src, 0, 0);
  c.restore();
}

/**
 * Draw a device layer: flat or in 3D. layer: { x, y, w, h, tilt: { rx, ry, rz }, frame, finish, shadow }.
 * `drawScreen(c, x, y, w, h)` paints the screen content in flat device coordinates.
 */
export function drawDevice(c, layer, drawScreen, { quality = 1 } = {}) {
  const { x, y, w, h } = layer;
  const tilt = layer.tilt || {};
  const rx = Number(tilt.rx) || 0, ry = Number(tilt.ry) || 0, rz = Number(tilt.rz) || 0;
  const flat = Math.abs(rx) < 0.05 && Math.abs(ry) < 0.05;
  const m = c.getTransform();
  const px = Math.max(0.25, Math.min(3, Math.hypot(m.a, m.b) * quality));
  const cx = x + w / 2, cy = y + h / 2;
  const opts = { frame: layer.frame, finish: layer.finish, glare: layer.glare };
  const shadow = layer.shadow || 'soft';

  if (flat) {
    if (shadow !== 'none') {
      c.save();
      c.translate(cx, cy); c.rotate(rad(rz)); c.translate(-cx, -cy);
      c.shadowColor = shadow === 'floating' ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.45)';
      c.shadowBlur = w * (shadow === 'floating' ? 0.28 : 0.16) * Math.hypot(m.a, m.b);
      c.shadowOffsetY = w * (shadow === 'floating' ? 0.16 : 0.07) * Math.hypot(m.a, m.b);
      rrPath(c, x + w * 0.02, y + w * 0.02, w - w * 0.04, h - w * 0.04, w * 0.15);
      c.fillStyle = '#000'; c.fill();
      c.restore();
    }
    c.save();
    c.translate(cx, cy); if (rz) c.rotate(rad(rz)); c.translate(x - cx, y - cy);
    drawDeviceFlat(c, w, h, drawScreen, opts);
    c.restore();
    return;
  }

  // Flat render into an offscreen canvas at the on-screen resolution, padded so edges stay smooth after the warp.
  const pad = 4;
  const ow = Math.ceil(w * px) + pad * 2, oh = Math.ceil(h * px) + pad * 2;
  const cv = offscreen(`dev:${layer.id || 'x'}`, ow, oh);
  const oc = cv.getContext('2d');
  oc.setTransform(1, 0, 0, 1, 0, 0); oc.clearRect(0, 0, ow, oh);
  oc.setTransform(px, 0, 0, px, pad, pad);
  drawDeviceFlat(oc, w, h, drawScreen, opts);

  const d = Math.max(w, h) * 2.4;
  const pw = w + (pad * 2) / px, ph = h + (pad * 2) / px;
  const corners = [[-pw / 2, -ph / 2, 0], [pw / 2, -ph / 2, 0], [pw / 2, ph / 2, 0], [-pw / 2, ph / 2, 0]]
    .map((p) => project(rotate(p, rx, ry, rz), d))
    .map((q) => ({ x: cx + q.x, y: cy + q.y, w: q.w }));

  // Contact shadow under the projected body.
  const sp = DEVICE_SPECS[layer.frame] || DEVICE_SPECS.iphone;
  const rim = rimPoints(w, h, w * sp.radius, 8);
  const front = rim.map(([a, b]) => project(rotate([a, b, 0], rx, ry, rz), d));
  if (shadow !== 'none') {
    c.save();
    const sc = Math.hypot(m.a, m.b);
    c.filter = `blur(${Math.max(1, w * 0.09 * sc)}px)`;
    c.globalAlpha *= shadow === 'floating' ? 0.5 : 0.42;
    c.fillStyle = '#000';
    c.beginPath();
    front.forEach((p, i) => { const X = cx + p.x * 0.96 + w * 0.04, Y = cy + p.y * 0.96 + h * 0.05; if (i) c.lineTo(X, Y); else c.moveTo(X, Y); });
    c.closePath(); c.fill();
    c.restore();
  }
  // Device edge: hull of the front and back outlines, filled with brushed metal.
  const depth = w * 0.075;
  const back = rim.map(([a, b]) => project(rotate([a * 0.985, b * 0.993, depth], rx, ry, rz), d));
  const shape = hull([...front, ...back]);
  c.save();
  const lx = cx + Math.min(...shape.map((p) => p.x)), rx2 = cx + Math.max(...shape.map((p) => p.x));
  const eg = c.createLinearGradient(lx, 0, rx2, 0);
  const finish = layer.finish || 'titanium';
  const ec = finish === 'gold' ? ['#5a3f22', '#c9a463', '#7a5a32'] : finish === 'black' ? ['#0c0c0c', '#3c3c3c', '#141414'] : ['#232322', '#8d8b86', '#2f2f2d'];
  eg.addColorStop(0, ec[0]); eg.addColorStop(ry > 0 ? 0.25 : 0.75, ec[1]); eg.addColorStop(1, ec[2]);
  c.fillStyle = eg;
  c.beginPath(); shape.forEach((p, i) => (i ? c.lineTo(cx + p.x, cy + p.y) : c.moveTo(cx + p.x, cy + p.y))); c.closePath(); c.fill();
  c.restore();
  if (!warpGL(c, cv, corners, Math.hypot(m.a, m.b))) warpAffine(c, cv, corners);
}

/** Project a point given in flat device coordinates (0..w, 0..h) to canvas coordinates for a tilted layer. */
export function projectDevicePoint(layer, px, py) {
  const { x, y, w, h } = layer;
  const t = layer.tilt || {};
  const d = Math.max(w, h) * 2.4;
  const q = project(rotate([px - w / 2, py - h / 2, 0], t.rx || 0, t.ry || 0, t.rz || 0), d);
  return { x: x + w / 2 + q.x, y: y + h / 2 + q.y };
}
