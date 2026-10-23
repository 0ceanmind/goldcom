// Development: API server (5177) + Vite dev server with hot reload (5173).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const procs = [
  spawn(process.execPath, [path.join(root, 'server', 'index.mjs')], { cwd: root, stdio: 'inherit', env: { ...process.env, STUDIO_PUBLIC_URL: 'http://localhost:5173' } }),
  spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')], { cwd: root, stdio: 'inherit' }),
];
const stop = () => { procs.forEach((p) => p.kill()); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
procs.forEach((p) => p.on('exit', (code) => { if (code) stop(); }));
