// Thin client for the studio server.
async function req(method, url, body, headers = {}) {
  const raw = body instanceof Blob || body instanceof ArrayBuffer || body instanceof File;
  const res = await fetch(url, {
    method,
    headers: body && !raw ? { 'Content-Type': 'application/json', ...headers } : headers,
    body: body && !raw ? JSON.stringify(body) : body,
  });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw Object.assign(new Error(data?.error || `${res.status} ${res.statusText}`), { status: res.status });
  return data;
}
export const api = {
  health: () => req('GET', '/api/health'),
  list: () => req('GET', '/api/documents'),
  get: (id) => req('GET', `/api/documents/${id}`),
  create: (doc) => req('POST', '/api/documents', doc),
  save: (doc) => req('PUT', `/api/documents/${doc.id}`, doc),
  remove: (id) => req('DELETE', `/api/documents/${id}`),
  assets: () => req('GET', '/api/assets'),
  upload: (file) => req('POST', '/api/assets', file, { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name || 'upload.png') }),
  capture: (opts) => req('POST', '/api/capture', opts),

  // AI productions
  produce: (prompt, options) => req('POST', '/api/productions', { prompt, options }),
  productions: () => req('GET', '/api/jobs?type=production'),
  job: (id) => req('GET', `/api/jobs/${id}`),
  cancelJob: (id) => req('POST', `/api/jobs/${id}/cancel`),
  deleteJob: (id) => req('DELETE', `/api/jobs/${id}`),
  choose: (id, concept) => req('POST', `/api/productions/${id}/choose`, { concept }),
  revise: (id, note) => req('POST', `/api/productions/${id}/revise`, { note }),
  resume: (id) => req('POST', `/api/productions/${id}/resume`, {}),

  // Video export (server, studio quality)
  exportVideo: (id, opts = {}) => req('POST', `/api/documents/${id}/export`, opts),
  exports: () => req('GET', '/api/exports'),

  // Footage library + phone
  footage: () => req('GET', '/api/footage'),
  footageItem: (id) => req('GET', `/api/footage/${id}`),
  uploadFootage: (file) => req('POST', '/api/footage', file, { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name || 'recording.mp4') }),
  updateFootage: (id, patch) => req('PATCH', `/api/footage/${id}`, patch),
  deleteFootage: (id) => req('DELETE', `/api/footage/${id}`),
  cropFootage: (id, body) => req('POST', `/api/footage/${id}/crop`, body),
  device: (serial) => req('GET', `/api/device${serial ? `?serial=${encodeURIComponent(serial)}` : ''}`),
  installTools: () => req('POST', '/api/device/install-tools', {}),
  deviceInput: (b) => req('POST', '/api/device/input', b),
  deviceScreenshot: (name, serial) => req('POST', '/api/device/screenshot', { name, serial }),
  deviceCapture: (goal, lang, serial) => req('POST', '/api/device/capture', { goal, lang, serial }),
  recordStart: (serial) => req('POST', '/api/device/record/start', { serial }),
  recordStop: (name) => req('POST', '/api/device/record/stop', { name }),
  installApk: (file, serial) => req('POST', `/api/device/install-apk?serial=${encodeURIComponent(serial || '')}`, file, { 'Content-Type': 'application/vnd.android.package-archive' }),

  // Cloud phones
  cloud: () => req('GET', '/api/cloud'),
  cloudMyIp: () => req('GET', '/api/cloud/my-ip'),
  cloudAdd: (b) => req('POST', '/api/cloud/phones', b),
  cloudConnect: (address) => req('POST', '/api/cloud/connect', { address }),
  cloudDisconnect: (address) => req('POST', '/api/cloud/disconnect', { address }),
  cloudRemove: (address) => req('DELETE', `/api/cloud/phones?address=${encodeURIComponent(address)}`),

  // Phone emulator on this computer
  emulator: () => req('GET', '/api/emulator'),
  emulatorInstall: () => req('POST', '/api/emulator/install', { acceptLicense: true }),
  emulatorStart: (headless) => req('POST', '/api/emulator/start', { headless }),
  emulatorStop: () => req('POST', '/api/emulator/stop', {}),
  emulatorMode: (level) => req('POST', '/api/emulator/mode', { level }),
  emulatorReset: () => req('POST', '/api/emulator/reset', {}),
  emulatorOpenStore: () => req('POST', '/api/emulator/open-store', {}),
  emulatorEnableHypervisor: () => req('POST', '/api/emulator/enable-hypervisor', {}),
  emulatorRemove: () => req('DELETE', '/api/emulator'),

  // Settings, engine, updates
  settings: () => req('GET', '/api/settings'),
  saveSettings: (s) => req('PUT', '/api/settings', s),
  engine: () => req('GET', '/api/engine'),
  testEngine: () => req('POST', '/api/engine/test', {}),
  update: () => req('GET', '/api/update'),
  checkUpdate: () => req('POST', '/api/update/check', {}),
  applyUpdate: () => req('POST', '/api/update/apply', {}),
  channels: () => req('GET', '/api/update/channels'),
};
