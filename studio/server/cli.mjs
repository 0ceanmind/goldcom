// Finding and starting command-line tools (claude, codex) without a shell.
// On Windows, npm installs each tool as a .cmd shim. Running a shim needs cmd.exe, which re-reads every argument
// (prompts, JSON, error text) as shell syntax, so a stray & or | would run a command. commandFor() looks inside the
// shim for the real program (a .exe, or a .js file run by node) and starts that directly instead.
import fs from 'node:fs';
import path from 'node:path';

const WIN = process.platform === 'win32';
const WIN_EXTS = ['.exe', '.cmd', '.bat'];

/** Every match on PATH, executables before shims. On Windows only runnable extensions count (npm also drops a POSIX script with no extension). */
export function whichAll(cmd) {
  const out = [];
  for (const dir of String(process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    for (const name of WIN ? WIN_EXTS.map((e) => cmd + e) : [cmd]) {
      const full = path.join(dir, name);
      try { if (fs.statSync(full).isFile() && !out.includes(full)) out.push(full); } catch { /* keep looking */ }
    }
  }
  return out.sort((a, b) => isShim(a) - isShim(b));
}
export const which = (cmd) => whichAll(cmd)[0] || null;

export const isShim = (file) => /\.(cmd|bat)$/i.test(String(file));

/**
 * How to start `file` without a shell: { cmd, prefix } to pass to spawn(cmd, [...prefix, ...args]).
 * Returns null for a shim it cannot read; callers should then refuse rather than fall back to cmd.exe.
 */
export function commandFor(file) {
  if (!file) return null;
  if (!isShim(file)) return { cmd: file, prefix: [] };
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return null; }
  const dir = path.dirname(file);
  // npm's cmd-shim names its target relative to the shim: "%dp0%\node_modules\...\cli.js" or "...\claude.exe".
  const targets = [...text.matchAll(/"%~?dp0%?\\?([^"%]+)"/gi)].map((m) => path.join(dir, m[1])).filter((t) => !/\\node\.exe$/i.test(t));
  const target = targets.reverse().find((t) => fs.existsSync(t));
  if (!target) return null;
  if (/\.(c|m)?js$/i.test(target)) {
    const localNode = path.join(dir, 'node.exe');
    return { cmd: fs.existsSync(localNode) ? localNode : process.execPath, prefix: [target] };
  }
  if (/\.exe$/i.test(target)) return { cmd: target, prefix: [] };
  return null;
}
