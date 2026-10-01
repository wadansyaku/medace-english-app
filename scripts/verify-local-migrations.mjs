import { mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

// Keep the selected Node runtime; login shells can replace PATH on developer Macs.
const persistDir = await mkdtemp(path.join(os.tmpdir(), 'medace-migration-replay-'));
try {
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      'node_modules/wrangler/bin/wrangler.js', 'd1', 'migrations', 'apply',
      'medace-db', '--local', '--persist-to', persistDir,
    ], {
      stdio: 'inherit',
      env: { ...process.env, CI: '1', WRANGLER_LOG_PATH: path.join(persistDir, 'wrangler.log') },
    });
    child.once('error', reject);
    child.once('close', (code) => resolve(code ?? 1));
  });
  process.exitCode = exitCode;
} finally {
  await rm(persistDir, { recursive: true, force: true });
}
