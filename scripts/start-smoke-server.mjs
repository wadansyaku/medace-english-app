import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createNodeToolCommand } from './_shared/tooling.mjs';
import { createLocalWranglerProject } from './_shared/local-wrangler-project.mjs';
import { readSmokeServerDiagnostic } from './_shared/smoke-server-diagnostics.mjs';

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
const wranglerLogPath = path.join(persistDir, 'wrangler-debug.log');

const runCommand = (command, commandArgs, env = baseEnv, stdio = 'inherit') => new Promise((resolve, reject) => {
  const child = spawn(command, commandArgs, {
    cwd,
    env,
    stdio,
    detached: process.platform !== 'win32',
  });

  child.on('error', reject);
  child.on('close', (code, signal) => {
    if (code === 0 && !signal) {
      resolve();
      return;
    }
    reject(new Error(`${command} ${commandArgs.join(' ')} failed (code=${code ?? 'null'}, signal=${signal ?? 'none'})`));
  });
});

let server;
let localWranglerProject;
let cleanupPromise;
let requestedExitSignal;

const signalProcessTree = (child, signal) => {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    child.kill(signal);
    return;
  }
  process.kill(-child.pid, signal);
};

const stopServerProcess = async (child, graceMs = 2_000) => {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    let settled = false;
    let forceKillTimer;
    let settleTimer;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(forceKillTimer);
      clearTimeout(settleTimer);
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

    forceKillTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          signalProcessTree(child, 'SIGKILL');
        } catch {
          // Ignore secondary termination failures.
        }
      }
    }, graceMs);
    forceKillTimer.unref?.();

    settleTimer = setTimeout(() => finish(), graceMs + 1_000);
    settleTimer.unref?.();
  });
};

const cleanup = () => cleanupPromise ??= (async () => {
  await stopServerProcess(server);
  await localWranglerProject?.cleanup();
  await rm(persistDir, { recursive: true, force: true });
})();

const handleExitSignal = async (signal) => {
  if (requestedExitSignal) return;
  requestedExitSignal = signal;
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
  const wranglerMigrate = createNodeToolCommand('wrangler', [
    'd1',
    'migrations',
    'apply',
    'medace-db',
    '--local',
    '--persist-to',
    persistDir,
  ]);
  await runCommand(wranglerMigrate.command, wranglerMigrate.args, {
    ...baseEnv,
    CI: '1',
  }, ['ignore', 'ignore', 'ignore']);

  // Only the ephemeral local database receives this wholly synthetic original
  // catalog. External/deployed smoke targets are never seeded by this runner.
  const guestFixture = createNodeToolCommand('wrangler', [
    'd1', 'execute', 'medace-db', '--local', '--persist-to', persistDir,
    '--file', path.join(cwd, 'tests/fixtures/guest-naru-smoke.sql'),
  ]);
  await runCommand(guestFixture.command, guestFixture.args, { ...baseEnv, CI: '1' }, ['ignore', 'ignore', 'ignore']);

  console.log(`Starting smoke server on http://127.0.0.1:${port} ...`);
  localWranglerProject = await createLocalWranglerProject();
  const wranglerPagesDev = createNodeToolCommand('wrangler', [
    '--cwd',
    localWranglerProject.cwd,
    'pages',
    'dev',
    'dist',
    '--ip',
    '127.0.0.1',
    '--port',
    String(port),
    '--persist-to',
    persistDir,
  ]);
  server = spawn(wranglerPagesDev.command, wranglerPagesDev.args, {
    cwd,
    env: {
      ...baseEnv,
      CI: '1',
      WRANGLER_LOG_PATH: wranglerLogPath,
      WRANGLER_LOG: 'info',
      WRANGLER_LOG_SANITIZE: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  const serverExit = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.once('close', (code, signal) => resolve({ code, signal }));
  });

  server.stdout?.on('data', (chunk) => {
    process.stdout.write(chunk);
  });
  server.stderr?.on('data', (chunk) => {
    process.stderr.write(chunk);
  });

  const { code, signal } = await serverExit;
  console[requestedExitSignal ? 'log' : 'error'](
    `[smoke-server] Wrangler ${requestedExitSignal ? 'stopped' : 'exited unexpectedly'} (code=${code ?? 'null'}, signal=${signal ?? 'none'}).`,
  );
  if (!requestedExitSignal) {
    console.error(JSON.stringify(await readSmokeServerDiagnostic(wranglerLogPath)));
  }
  await cleanup();
  process.exit(requestedExitSignal
    ? (requestedExitSignal === 'SIGINT' ? 130 : 143)
    : (code || 1));
} catch (error) {
  await cleanup();
  throw error;
}
