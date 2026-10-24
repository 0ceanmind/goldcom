// Thin client for the studio server.
async function req(method, url, body, headers = {}) {
  const res = await fetch(url, {
    method,
    headers: body && !(body instanceof Blob) && !(body instanceof ArrayBuffer) ? { 'Content-Type': 'application/json', ...headers } : headers,
    body: body && !(body instanceof Blob) && !(body instanceof ArrayBuffer) ? JSON.stringify(body) : body,
  });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(data?.error || `${res.status} ${res.statusText}`);
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
  modules: () => req('GET', '/api/modules'),
  generators: () => req('GET', '/api/generators'),
  generate: (body) => req('POST', '/api/generate', body),
  settings: () => req('GET', '/api/settings'),
  saveSettings: (body) => req('PUT', '/api/settings', body),
  agentStatus: () => req('GET', '/api/agent/status'),
  tasks: () => req('GET', '/api/agent/tasks'),
  task: (id) => req('GET', `/api/agent/tasks/${id}`),
  startTask: (body) => req('POST', '/api/agent/tasks', body),
  cancelTask: (id) => req('POST', `/api/agent/tasks/${id}/cancel`),
  feedback: (body) => req('POST', '/api/feedback', body),
  memory: () => req('GET', '/api/memory'),
  addLesson: (body) => req('POST', '/api/lessons', body),
};

/** Server-sent events are re-broadcast on window as "studio-event" so any panel can listen. */
export function onStudioEvent(fn) {
  const h = (e) => fn(e.detail);
  window.addEventListener('studio-event', h);
  return () => window.removeEventListener('studio-event', h);
}
