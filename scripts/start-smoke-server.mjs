import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const cwd = process.cwd();
const args = process.argv.slice(2);
const { FORCE_COLOR: _forceColor, ...baseEnv } = process.env;

const readArg = (name, fallback) => {
  const index = args.findIndex((arg) => arg === `--${name}`);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
};

const port = readArg('port', process.env.PLAYWRIGHT_SMOKE_PORT || '41731');
const persistDir = await mkdtemp(path.join(os.tmpdir(), 'medace-smoke-'));

const runCommand = (command, commandArgs, env = baseEnv, stdio = 'inherit') => new Promise((resolve, reject) => {
  const child = spawn(command, commandArgs, {
    cwd,
    env,
    stdio,
    detached: process.platform !== 'win32',
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

const signalProcessTree = (child, signal) => {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    child.kill(signal);
    return;
  }
  process.kill(-child.pid, signal);
};

const stopServerProcess = async (child, graceMs = 2_000) => {
  if (!child || child.exitCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      child.removeListener('close', onClose);
      resolve();
    };
    const onClose = () => finish();

    child.once('close', onClose);

    try {
      signalProcessTree(child, 'SIGTERM');
    } catch {
      finish();
      return;
    }

    const forceKillTimer = setTimeout(() => {
      if (child.exitCode === null) {
        try {
          signalProcessTree(child, 'SIGKILL');
        } catch {
          // Ignore secondary termination failures.
        }
      }
    }, graceMs);
    forceKillTimer.unref?.();

    const settleTimer = setTimeout(() => finish(), graceMs + 1_000);
    settleTimer.unref?.();
  });
};

const cleanup = async () => {
  await stopServerProcess(server);
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
  console.log('Applying local D1 migrations for smoke server...');
  await runCommand('npx', [
    'wrangler',
    'd1',
    'migrations',
    'apply',
    'medace-db',
    '--local',
    '--persist-to',
    persistDir,
  ], {
    ...baseEnv,
    CI: '1',
  }, ['ignore', 'ignore', 'ignore']);

  console.log(`Starting smoke server on http://127.0.0.1:${port} ...`);
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
    env: {
      ...baseEnv,
      CI: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });

  server.stdout?.on('data', (chunk) => {
    process.stdout.write(chunk);
  });
  server.stderr?.on('data', (chunk) => {
    process.stderr.write(chunk);
  });

  server.on('close', async (code) => {
    await rm(persistDir, { recursive: true, force: true });
    process.exit(code ?? 0);
  });
} catch (error) {
  await cleanup();
  throw error;
}
