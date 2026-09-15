// Dependency-free path guard. Default: staged additions/changes; --all: tracked tree (CI).
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const args = process.argv.includes('--all')
  ? ['ls-files', '-z']
  : ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'];
const files = execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const forbiddenDirectories = new Set([
  'node_modules', 'dist', 'build', 'out', 'coverage', 'test-results', 'playwright-report',
  'blob-report', 'scratchpad', 'scratch', 'tmp', 'temp', 'archive', 'archives', 'design',
  '.cache', '.vite', '.next', '.turbo', '.vercel', '.claude',
]);
function reason(file) {
  const parts = file.toLowerCase().split('/');
  const name = parts.at(-1);
  if (parts.slice(0, -1).some(p => forbiddenDirectories.has(p))) return 'generated, scratch or archive directory';
  if ((name === '.env' || name.startsWith('.env.')) && !/^\.env(?:\.[\w-]+)*\.example$/.test(name)) return 'local environment file';
  if (/\.(?:log|tsbuildinfo|pem|key)$/.test(name)) return 'cache, log or private-key file';
  if (/^(?:claude-)?handoff(?:[.-]|$)|^project_plan\.md$|^transcript(?:[.-]|$)/.test(name)) return 'working notes';
  if (/^adaptive layout engine for multi-surface ads.*\.html$/.test(name)) return 'downloaded assignment reference';
  if (['thumbs.db', 'desktop.ini', '.ds_store'].includes(name)) return 'operating-system metadata';
  if (path.posix.basename(file).includes('\n')) return 'newline in filename';
  return null;
}
const rejected = files.map(file => ({ file, reason: reason(file) })).filter(entry => entry.reason);
if (rejected.length) {
  console.error('Commit hygiene check rejected these paths:');
  for (const entry of rejected) console.error(`- ${JSON.stringify(entry.file)}: ${entry.reason}`);
  console.error('Unstage these paths and keep local artifacts outside Git. Review intentional exceptions explicitly.');
  process.exitCode = 1;
} else console.log(`Commit hygiene: ${files.length} paths checked; no known clutter found. Review content separately.`);
