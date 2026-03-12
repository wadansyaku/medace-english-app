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

const runCommand = (command, commandArgs, env = process.env) => new Promise((resolve, reject) => {
  const child = spawn(command, commandArgs, {
    cwd,
    env,
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

const signalProcessTree = (child, signal) => {
  if (!child?.pid) return;
  child.kill(signal);
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
    ...process.env,
    CI: '1',
  });

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
      ...process.env,
      CI: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
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
