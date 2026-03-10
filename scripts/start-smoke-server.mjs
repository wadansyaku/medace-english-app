import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const cwd = process.cwd();
const args = process.argv.slice(2);

const readArg = (name, fallback) => {
  const index = args.findIndex((arg) => arg === `--${name}`);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
};

const port = readArg('port', process.env.PLAYWRIGHT_SMOKE_PORT || '41731');
const persistDir = await mkdtemp(path.join(os.tmpdir(), 'medace-smoke-'));

const runCommand = (command, commandArgs) => new Promise((resolve, reject) => {
  const child = spawn(command, commandArgs, {
    cwd,
    stdio: 'inherit',
  });

  child.on('error', reject);
  child.on('close', (code) => {
    if (code === 0) {
      resolve();
      return;
    }
    reject(new Error(`${command} ${commandArgs.join(' ')} failed with code ${code}`));
  });
});

let server;

const cleanup = async () => {
  if (server && !server.killed) {
    server.kill('SIGTERM');
  }
  await rm(persistDir, { recursive: true, force: true });
};

const handleExitSignal = async (signal) => {
  await cleanup();
  process.exit(signal === 'SIGINT' ? 130 : 143);
};

process.on('SIGINT', () => {
  void handleExitSignal('SIGINT');
});
process.on('SIGTERM', () => {
  void handleExitSignal('SIGTERM');
});

try {
  await runCommand('npx', [
    'wrangler',
    'd1',
    'migrations',
    'apply',
    'medace-db',
    '--local',
    '--persist-to',
    persistDir,
  ]);

  server = spawn('npx', [
    'wrangler',
    'pages',
    'dev',
    'dist',
    '--ip',
    '127.0.0.1',
    '--port',
    String(port),
    '--persist-to',
    persistDir,
  ], {
    cwd,
    stdio: 'inherit',
  });

  server.on('close', async (code) => {
    await rm(persistDir, { recursive: true, force: true });
    process.exit(code ?? 0);
  });
} catch (error) {
  await cleanup();
  throw error;
}
