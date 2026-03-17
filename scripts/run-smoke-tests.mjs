import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

import { getAvailablePort } from './_shared/ports.mjs';
import { createNodeToolCommand } from './_shared/tooling.mjs';

const cwd = process.cwd();
const extraArgs = process.argv.slice(2);
const { FORCE_COLOR: _forceColor, ...baseEnv } = process.env;
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL || '';
const isExternalTarget = externalBaseUrl.length > 0;

const runCommand = (command, args, env) => new Promise((resolve) => {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: 'inherit',
  });

  child.on('close', (code) => {
    resolve(code ?? 1);
  });
  child.on('error', () => {
    resolve(1);
  });
});

const waitForServer = async (baseUrl) => {
  const timeoutMs = Number(process.env.PLAYWRIGHT_SMOKE_SERVER_TIMEOUT_MS || '180000');
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/session`);
      if (response.status === 200 || response.status === 204) {
        return;
      }
    } catch {
      // Retry until ready.
    }
    await delay(500);
  }

  throw new Error(`Timed out waiting for smoke server at ${baseUrl} after ${timeoutMs}ms`);
};

const startServer = (port, env) => spawn(
  process.execPath,
  ['scripts/start-smoke-server.mjs', '--port', String(port)],
  {
    cwd,
    env,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  },
);

const stopChildProcess = async (child, graceMs = 2_000) => {
  if (!child || child.exitCode !== null) {
    return;
  }

  const signalProcessTree = (signal) => {
    if (!child.pid) return;
    if (process.platform === 'win32') {
      child.kill(signal);
      return;
    }
    process.kill(-child.pid, signal);
  };

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
      signalProcessTree('SIGTERM');
    } catch {
      finish();
      return;
    }

    const forceKillTimer = setTimeout(() => {
      if (child.exitCode === null) {
        try {
          signalProcessTree('SIGKILL');
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

const suites = isExternalTarget
  ? [
      {
        name: 'remote-core',
        args: ['--grep-invert', 'writing|idb mode'],
        env: {},
      },
      {
        name: 'remote-writing',
        args: ['--grep', 'writing'],
        env: {},
      },
    ]
  : [
      {
        name: 'core',
        args: ['--grep-invert', 'writing|idb mode'],
        env: {},
      },
      {
        name: 'writing',
        args: ['--grep', 'writing'],
        env: {},
      },
      {
        name: 'idb',
        args: ['--grep', 'idb mode'],
        env: {
          VITE_STORAGE_MODE: 'idb',
        },
      },
    ];

let exitCode = 0;
const buildCache = new Set();

const runBuildForEnv = async (suiteEnv, buildKey) => {
  if (buildCache.has(buildKey)) {
    return 0;
  }

  const viteBuild = createNodeToolCommand('vite', ['build']);
  const buildExitCode = await runCommand(viteBuild.command, viteBuild.args, suiteEnv);
  if (buildExitCode === 0) {
    buildCache.add(buildKey);
  }
  return buildExitCode;
};

for (const suite of suites) {
  const port = await getAvailablePort();
  const baseUrl = isExternalTarget ? externalBaseUrl : `http://127.0.0.1:${port}`;
  const outputDir = path.join(cwd, 'test-results', `smoke-${suite.name}-${Date.now()}`);
  await mkdir(outputDir, { recursive: true });

  console.log(`\n[smoke:${suite.name}] port=${port} output=${outputDir}`);

  const suiteEnv = {
    ...baseEnv,
    ...(suite.env || {}),
  };
  if (!isExternalTarget) {
    const buildKey = suite.env?.VITE_STORAGE_MODE === 'idb' ? 'idb' : 'cloudflare';
    const buildExitCode = await runBuildForEnv(suiteEnv, buildKey);

    if (buildExitCode !== 0) {
      exitCode = buildExitCode;
      continue;
    }
  }

  let server;

  try {
    if (!isExternalTarget) {
      server = startServer(port, {
        ...suiteEnv,
        PLAYWRIGHT_SMOKE_PORT: String(port),
      });
      await waitForServer(baseUrl);
    }

    const playwrightCommand = createNodeToolCommand('playwright', ['test', '--config=playwright.smoke.config.ts', ...suite.args, ...extraArgs]);
    const suiteExitCode = await runCommand(
      playwrightCommand.command,
      playwrightCommand.args,
      {
        ...suiteEnv,
        PLAYWRIGHT_BASE_URL: baseUrl,
        PLAYWRIGHT_SKIP_WEBSERVER: '1',
        PLAYWRIGHT_SMOKE_PORT: String(port),
        PLAYWRIGHT_OUTPUT_DIR: outputDir,
        PLAYWRIGHT_TRACE_MODE: baseEnv.PLAYWRIGHT_TRACE_MODE || 'off',
        PLAYWRIGHT_VIDEO_MODE: baseEnv.PLAYWRIGHT_VIDEO_MODE || 'off',
      },
    );

    if (suiteExitCode !== 0) {
      exitCode = suiteExitCode;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    exitCode = 1;
  } finally {
    await stopChildProcess(server);
  }
}

process.exit(exitCode);
