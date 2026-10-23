// One-time setup: connects Goldcom Studio to Claude Code.
//  - registers the goldcom-studio MCP server (user scope = available in every project)
//  - installs the /goldcom-studio skill into ~/.claude/skills
// Usage: npm run connect [-- --scope project|user|local] [-- --print]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const scope = args.includes('--scope') ? args[args.indexOf('--scope') + 1] : 'user';
const printOnly = args.includes('--print');
const server = path.join(root, 'mcp', 'server.mjs');
const node = process.execPath;
const say = (m) => console.log(m);

say('\n  Goldcom Studio · connect to Claude Code\n');

if (!fs.existsSync(path.join(root, 'node_modules', '@modelcontextprotocol'))) {
  say('  • Installing dependencies…');
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install'], { cwd: root, stdio: 'inherit' });
}
if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  say('  • Building the editor…');
  execFileSync(node, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
}

const manual = `claude mcp add goldcom-studio --scope ${scope} -- "${node}" "${server}"`;
const hasClaude = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude']).status === 0;
if (printOnly || !hasClaude) {
  if (!hasClaude) say('  • Claude Code CLI not found on PATH. Run this once Claude Code is installed:');
  say(`\n    ${manual}\n`);
  say('  Or add this to your project .mcp.json / ~/.claude.json "mcpServers":');
  say(`    ${JSON.stringify({ 'goldcom-studio': { command: node, args: [server] } })}\n`);
} else {
  spawnSync('claude', ['mcp', 'remove', 'goldcom-studio', '--scope', scope], { stdio: 'ignore' });
  const r = spawnSync('claude', ['mcp', 'add', 'goldcom-studio', '--scope', scope, '--', node, server], { encoding: 'utf8' });
  if (r.status === 0) say(`  ✓ MCP server "goldcom-studio" registered (${scope} scope)`);
  else { say(`  ✕ Could not register automatically:\n${r.stderr || r.stdout}\n  Run manually:\n    ${manual}`); }
}

const skillSrc = path.join(root, 'skill', 'goldcom-studio');
const skillDst = path.join(os.homedir(), '.claude', 'skills', 'goldcom-studio');
if (!printOnly) {
  fs.mkdirSync(skillDst, { recursive: true });
  for (const f of fs.readdirSync(skillSrc)) fs.copyFileSync(path.join(skillSrc, f), path.join(skillDst, f));
  say(`  ✓ Skill installed → ${skillDst}`);
}

say(`
  Next:
    1. Start the studio:   cd ${root} && npm run studio   →  http://localhost:5177
       (Claude also starts it automatically when it needs it.)
    2. Restart Claude Code, open any project and try:
         /goldcom-studio make an Arabic carousel about this project
         /goldcom-studio 20-second 9:16 launch video in English
`);
