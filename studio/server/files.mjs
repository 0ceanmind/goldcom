import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export async function atomicWrite(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, data, { mode: 0o600 });
    for (let attempt = 0; ; attempt++) {
      try { await fs.rename(tmp, file); break; }
      catch (e) { if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code) || attempt >= 6) throw e; await delay(20 * (attempt + 1)); }
    }
  } finally { await fs.rm(tmp, { force: true }).catch(() => {}); }
}

// A filesystem lock also covers the separate MCP process, not just this Node process.
export async function withFileLock(file, fn) {
  const lock = `${file}.lock`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  let handle;
  for (let i = 0; !handle; i++) {
    try { handle = await fs.open(lock, 'wx', 0o600); await handle.writeFile(String(process.pid)); }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const owner = Number(await fs.readFile(lock, 'utf8').catch(() => '0'));
      if (owner) { try { process.kill(owner, 0); } catch (err) { if (err.code === 'ESRCH') { await fs.rm(lock, { force: true }); continue; } } }
      if (i >= 200) throw Object.assign(new Error('Document is busy. Retry the save.'), { status: 409 });
      await delay(25);
    }
  }
  try { return await fn(); } finally { await handle.close(); await fs.rm(lock, { force: true }); }
}
