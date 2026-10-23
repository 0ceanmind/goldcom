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
};
