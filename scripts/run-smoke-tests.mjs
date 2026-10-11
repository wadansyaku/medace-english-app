import { access, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { getAvailablePort } from './_shared/ports.mjs';
import {
  extractAssetPaths,
  extractHtmlPwaReferences,
  extractManifestIconPaths,
  verifyAppShellMetadata,
  verifyPwaManifestMetadata,
  waitForSmokeServer,
} from './_shared/smoke-readiness.mjs';
import { createNodeToolCommand } from './_shared/tooling.mjs';

const cwd = process.cwd();
const cliArgs = process.argv.slice(2);
const { FORCE_COLOR: _forceColor, ...baseEnv } = process.env;
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL || '';
const isExternalTarget = externalBaseUrl.length > 0;
const skipBuild = process.env.SMOKE_SKIP_BUILD === '1';
let suiteMode = process.env.SMOKE_SUITE || 'full';
const extraArgs = [];

for (let index = 0; index < cliArgs.length; index += 1) {
  const arg = cliArgs[index];
  if (arg === '--suite') {
    suiteMode = cliArgs[index + 1] || suiteMode;
    index += 1;
    continue;
  }
  if (arg.startsWith('--suite=')) {
    suiteMode = arg.slice('--suite='.length) || suiteMode;
    continue;
  }
  extraArgs.push(arg);
}

suiteMode = suiteMode === 'sentinel' ? 'sentinel' : 'full';
const isFilteredRun = extraArgs.some((arg) => (
  arg === '--grep'
  || arg === '-g'
  || arg === '--grep-invert'
  || arg.startsWith('--grep=')
  || arg.startsWith('--grep-invert=')
));
const hasWorkerArg = extraArgs.some((arg) => arg === '--workers' || arg.startsWith('--workers='));

const runCommand = (command, args, env, serverSignal) => new Promise((resolve, reject) => {
  if (serverSignal?.aborted) {
    reject(serverSignal.reason);
    return;
  }

  const child = spawn(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    detached: Boolean(serverSignal) && process.platform !== 'win32',
  });

  let settled = false;
  let stoppingForServer = false;
  const finish = (code, error) => {
    if (settled) return;
    settled = true;
    serverSignal?.removeEventListener('abort', onServerExit);
    child.removeListener('close', onClose);
    child.removeListener('error', onError);
    if (error) reject(error);
    else resolve(code ?? 1);
  };
  const onClose = (code) => {
    if (!stoppingForServer) finish(code);
  };
  const onError = () => {
    if (!stoppingForServer) finish(1);
  };
  const onServerExit = async () => {
    stoppingForServer = true;
    await stopChildProcess(child);
    finish(1, serverSignal.reason);
  };

  child.once('close', onClose);
  child.once('error', onError);
  serverSignal?.addEventListener('abort', onServerExit, { once: true });
});

const runCommandCapture = (command, args, env) => new Promise((resolve) => {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  child.on('close', (code) => {
    resolve({ code: code ?? 1, stdout, stderr });
  });
  child.on('error', (error) => {
    resolve({ code: 1, stdout, stderr: `${stderr}${error.message}` });
  });
});

const assertBuiltStaticFilesExist = async (paths, contextLabel) => {
  const missing = [];
  await Promise.all(paths.map(async (staticPath) => {
    const localPath = path.join(cwd, 'dist', staticPath.replace(/^\/+/, ''));
    try {
      await access(localPath);
    } catch {
      missing.push(staticPath);
    }
  }));

  if (missing.length) {
    throw new Error(`[smoke] ${contextLabel} references missing static files:\n${missing.sort().join('\n')}`);
  }
};

const verifyBuiltPwaReferences = async (html) => {
  verifyAppShellMetadata(html, 'dist/index.html');

  const { manifestPaths, iconPaths } = extractHtmlPwaReferences(html);
  if (!manifestPaths.length) {
    throw new Error('[smoke] dist/index.html does not reference a web manifest');
  }

  const manifestIconPaths = [];
  await Promise.all(manifestPaths.map(async (manifestPath) => {
    const localManifestPath = path.join(cwd, 'dist', manifestPath.replace(/^\/+/, ''));
    let manifest;
    try {
      manifest = JSON.parse(await readFile(localManifestPath, 'utf8'));
    } catch (error) {
      throw new Error(`[smoke] ${manifestPath} could not be read as JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    verifyPwaManifestMetadata(manifest, manifestPath);
    manifestIconPaths.push(...extractManifestIconPaths(manifest));
  }));

  await assertBuiltStaticFilesExist([...new Set([...manifestPaths, ...iconPaths, ...manifestIconPaths])], 'PWA metadata');
};

const verifyBuiltAssetReferences = async () => {
  const indexPath = path.join(cwd, 'dist', 'index.html');
  const html = await readFile(indexPath, 'utf8');
  const assetPaths = extractAssetPaths(html);
  if (!assetPaths.length) {
    throw new Error('[smoke] dist/index.html does not reference any /assets files');
  }

  const missingAssets = [];
  await Promise.all(assetPaths.map(async (assetPath) => {
    const localPath = path.join(cwd, 'dist', assetPath.replace(/^\/+/, ''));
    try {
      await access(localPath);
    } catch {
      missingAssets.push(assetPath);
    }
  }));

  if (missingAssets.length) {
    throw new Error(`[smoke] dist/index.html references missing assets:\n${missingAssets.sort().join('\n')}`);
  }

  await verifyBuiltPwaReferences(html);
};

const getFilteredTestCount = async (suite, suiteEnv, baseUrl, outputDir, port) => {
  const playwrightListCommand = createNodeToolCommand('playwright', [
    'test',
    '--config=playwright.smoke.config.ts',
    ...suite.files,
    ...extraArgs,
    '--list',
  ]);
  const result = await runCommandCapture(
    playwrightListCommand.command,
    playwrightListCommand.args,
    {
      ...suiteEnv,
      PLAYWRIGHT_BASE_URL: baseUrl,
      PLAYWRIGHT_SKIP_WEBSERVER: '1',
      PLAYWRIGHT_SMOKE_PORT: String(port),
      PLAYWRIGHT_OUTPUT_DIR: outputDir,
      PLAYWRIGHT_TRACE_MODE: 'off',
      PLAYWRIGHT_VIDEO_MODE: 'off',
    },
  );

  const combinedOutput = `${result.stdout}\n${result.stderr}`;
  const totalMatch = combinedOutput.match(/Total:\s+(\d+)\s+tests?\s+in\b/i);
  if (totalMatch) {
    return Number(totalMatch[1]);
  }

  throw new Error(`[smoke:${suite.name}] could not determine filtered test count:\n${combinedOutput.trim()}`);
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

const monitorServerProcess = (child, label) => {
  const controller = new AbortController();
  const onExit = (code, signal) => {
    controller.abort(new Error(
      `[smoke:${label}] local server exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'none'}); stopping browser tests.`,
    ));
  };
  const onError = (error) => {
    controller.abort(new Error(`[smoke:${label}] local server failed to start: ${error.message}`, { cause: error }));
  };
  child.once('exit', onExit);
  child.once('error', onError);
  return {
    signal: controller.signal,
    dispose: () => {
      child.removeListener('exit', onExit);
      child.removeListener('error', onError);
    },
  };
};

const stopChildProcess = async (child, graceMs = 2_000) => {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) {
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
      signalProcessTree('SIGTERM');
    } catch {
      finish();
      return;
    }

    forceKillTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          signalProcessTree('SIGKILL');
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

const sentinelFiles = [
  'tests/smoke/public.smoke.spec.ts',
  'tests/smoke/student.smoke.spec.ts',
  'tests/smoke/dashboard-recovery.smoke.spec.ts',
];

const cloudflareFiles = [
  'tests/smoke/personal-wordbook.smoke.spec.ts',
  'tests/smoke/pronunciation.smoke.spec.ts',
  'tests/smoke/guest-pronunciation.smoke.spec.ts',
  'tests/smoke/quiz-pronunciation.smoke.spec.ts',
  'tests/smoke/aichi-exam-badge.smoke.spec.ts',
  'tests/smoke/product-feedback.smoke.spec.ts',
  'tests/smoke/admin-example-preparation.smoke.spec.ts',
  'tests/smoke/guest-trial.smoke.spec.ts',
  'tests/smoke/guest-learning.smoke.spec.ts',
  'tests/smoke/auth-focused.smoke.spec.ts',
  'tests/smoke/staff-login.smoke.spec.ts',
  'tests/smoke/ui-audit.smoke.spec.ts',
  'tests/smoke/grammar-answer-isolation.smoke.spec.ts',
  'tests/smoke/worksheet-reliability.smoke.spec.ts',
  'tests/smoke/writing-ops-recovery.smoke.spec.ts',
  'tests/smoke/writing-drafts-budget.smoke.spec.ts',
  'tests/smoke/navigation-recovery.smoke.spec.ts',
  'tests/smoke/public.smoke.spec.ts',
  'tests/smoke/student.smoke.spec.ts',
  'tests/smoke/dashboard-recovery.smoke.spec.ts',
  'tests/smoke/organization.smoke.spec.ts',
  'tests/smoke/commercial.smoke.spec.ts',
  'tests/smoke/writing.smoke.spec.ts',
  'tests/smoke/mobile.smoke.spec.ts',
  'tests/smoke/study-reliability.smoke.spec.ts',
  'tests/smoke/quiz-receipts.smoke.spec.ts',
  'tests/smoke/quiz-controller-receipts.smoke.spec.ts',
];

const suites = suiteMode === 'sentinel'
  ? [
      {
        name: 'sentinel',
        files: sentinelFiles,
        env: {},
      },
    ]
  : [
      {
        name: isExternalTarget ? 'remote-full' : 'full',
        files: cloudflareFiles,
        env: {},
        workers: '1',
      },
      ...(
        isExternalTarget
          ? []
          : [{
            name: 'idb',
            files: ['tests/smoke/idb.smoke.spec.ts', 'tests/smoke/quiz-receipts-idb.smoke.spec.ts', 'tests/smoke/personal-wordbook-idb.smoke.spec.ts'],
            env: {
              VITE_STORAGE_MODE: 'idb',
            },
            workers: '1',
          }]
      ),
    ];

let exitCode = 0;
let filteredTestCount = 0;
const buildCache = new Set();

const canSkipBuildForSuite = (suiteEnv) => (
  skipBuild
  && suiteEnv?.VITE_STORAGE_MODE !== 'idb'
);

const runBuildForEnv = async (suiteEnv, buildKey) => {
  if (canSkipBuildForSuite(suiteEnv)) {
    return 0;
  }
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
  const requestedPort = Number(process.env.PLAYWRIGHT_SMOKE_PORT || 0);
  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) throw new Error('PLAYWRIGHT_SMOKE_PORT must be an available TCP port');
  const port = requestedPort || await getAvailablePort();
  const baseUrl = isExternalTarget ? externalBaseUrl : `http://127.0.0.1:${port}`;
  const outputDir = path.join(cwd, 'test-results', `smoke-${suite.name}-${Date.now()}`);
  await mkdir(outputDir, { recursive: true });

  console.log(`\n[smoke:${suite.name}] port=${port} output=${outputDir}`);

  const suiteEnv = {
    ...baseEnv,
    ...(suite.env || {}),
  };
  if (isFilteredRun) {
    try {
      const suiteFilteredTestCount = await getFilteredTestCount(suite, suiteEnv, baseUrl, outputDir, port);
      filteredTestCount += suiteFilteredTestCount;
      if (suiteFilteredTestCount === 0) {
        console.log(`[smoke:${suite.name}] filter matched 0 tests; skipping this suite`);
        continue;
      }
      console.log(`[smoke:${suite.name}] filter matched ${suiteFilteredTestCount} test(s)`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      exitCode = 1;
      continue;
    }
  }
  if (!isExternalTarget) {
    const buildKey = suite.env?.VITE_STORAGE_MODE === 'idb' ? 'idb' : 'cloudflare';
    const buildExitCode = await runBuildForEnv(suiteEnv, buildKey);

    if (buildExitCode !== 0) {
      exitCode = buildExitCode;
      continue;
    }
    try {
      await verifyBuiltAssetReferences();
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      exitCode = 1;
      continue;
    }
  }

  let server;
  let serverMonitor;

  try {
    if (!isExternalTarget) {
      server = startServer(port, {
        ...suiteEnv,
        PLAYWRIGHT_SMOKE_PORT: String(port),
      });
      serverMonitor = monitorServerProcess(server, suite.name);
    }
    await waitForSmokeServer(baseUrl, {
      expectedDeploymentSha: suiteEnv.PLAYWRIGHT_EXPECT_DEPLOYMENT_SHA || '',
      timeoutMs: Number(suiteEnv.PLAYWRIGHT_SMOKE_SERVER_TIMEOUT_MS || '180000'),
      serverSignal: serverMonitor?.signal,
    });

    const playwrightCommand = createNodeToolCommand('playwright', [
      'test',
      '--config=playwright.smoke.config.ts',
      ...(!hasWorkerArg && suite.workers ? [`--workers=${suite.workers}`] : []),
      ...suite.files,
      ...extraArgs,
    ]);
    const suiteExitCode = await runCommand(
      playwrightCommand.command,
      playwrightCommand.args,
      {
        ...suiteEnv,
        PLAYWRIGHT_BASE_URL: baseUrl,
        PLAYWRIGHT_LOCAL_SYNTHETIC_RUNTIME: !isExternalTarget && (suiteEnv.VITE_STORAGE_MODE || 'cloudflare') === 'cloudflare' ? '1' : '0',
        PLAYWRIGHT_SKIP_WEBSERVER: '1',
        PLAYWRIGHT_SMOKE_PORT: String(port),
        PLAYWRIGHT_OUTPUT_DIR: outputDir,
        PLAYWRIGHT_TRACE_MODE: baseEnv.PLAYWRIGHT_TRACE_MODE || 'off',
        PLAYWRIGHT_VIDEO_MODE: baseEnv.PLAYWRIGHT_VIDEO_MODE || 'off',
      },
      serverMonitor?.signal,
    );

    if (suiteExitCode !== 0) {
      exitCode = suiteExitCode;
      // A user interruption must not launch a browser for the next suite.
      if (suiteExitCode === 130 || suiteExitCode === 143) break;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    exitCode = 1;
    if (serverMonitor?.signal.aborted) break;
  } finally {
    serverMonitor?.dispose();
    await stopChildProcess(server);
  }
}

if (isFilteredRun && filteredTestCount === 0 && exitCode === 0) {
  console.error('[smoke] filtered run matched 0 tests across all suites');
  exitCode = 1;
}

process.exit(exitCode);
