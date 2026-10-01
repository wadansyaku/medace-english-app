import { spawn } from 'node:child_process';
import { mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createLocalWranglerProject } from './_shared/local-wrangler-project.mjs';

// Local-only preview. Never copies existing .wrangler state or credentials.
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const port = arg('--port', '41812');
// Keep meeting recordings independent from smoke's Cloudflare/IndexedDB builds.
const previewBuildDir = path.resolve(arg('--dist', 'output/meeting-preview/dist'));
const persistDir = path.resolve(arg('--state', path.join(os.tmpdir(), 'medace-meeting-preview-state')));
const importPath = arg('--import', 'tmp/october-content-audit/original-workbooks.local-preview.sql');
await mkdir(persistDir, { recursive: true });
const env = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: path.join(persistDir, 'wrangler.log') };
const run = (params, cwd = process.cwd()) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, params, { cwd, env, stdio: 'inherit' });
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Local preview command failed (${code}).`)));
});
await run(['node_modules/vite/bin/vite.js', 'build', '--outDir', previewBuildDir]);
await run(['node_modules/wrangler/bin/wrangler.js', 'd1', 'migrations', 'apply', 'medace-db', '--local', '--persist-to', persistDir]);
await access(importPath);
await run(['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'medace-db', '--local', '--persist-to', persistDir, '--file', path.resolve(importPath)]);
const localProject = await createLocalWranglerProject();
console.log(`Meeting preview (local D1, synthetic demo accounts): http://127.0.0.1:${port}`);
const server = spawn(process.execPath, [
  path.resolve('node_modules/wrangler/bin/wrangler.js'), '--cwd', localProject.cwd,
  'pages', 'dev', previewBuildDir, '--ip', '127.0.0.1', '--port', port, '--persist-to', persistDir,
], { env, stdio: 'inherit' });
process.once('SIGINT', () => server.kill('SIGINT'));
process.once('SIGTERM', () => server.kill('SIGTERM'));
await new Promise(resolve => server.once('exit', resolve));
await localProject.cleanup();
