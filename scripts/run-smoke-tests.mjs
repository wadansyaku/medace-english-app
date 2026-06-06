import { access, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

import { getAvailablePort } from './_shared/ports.mjs';
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

const normalizeAssetPath = (assetPath) => {
  try {
    return new URL(assetPath, 'http://smoke.local').pathname;
  } catch {
    return assetPath.split('?')[0].split('#')[0];
  }
};

const normalizeLocalStaticPath = (staticPath) => {
  if (!staticPath || staticPath.startsWith('#') || staticPath.startsWith('data:')) {
    return null;
  }

  try {
    const url = new URL(staticPath, 'http://smoke.local');
    if (url.origin !== 'http://smoke.local') {
      return null;
    }
    return url.pathname;
  } catch {
    return staticPath.startsWith('/') ? staticPath : `/${staticPath}`;
  }
};

const parseHtmlAttributes = (tag) => {
  const attrs = {};
  for (const match of tag.matchAll(/\s([^\s=]+)=["']([^"']*)["']/g)) {
    attrs[match[1].toLowerCase()] = match[2];
  }
  return attrs;
};

const extractAssetPaths = (html) => {
  const assetPaths = new Set();
  for (const match of html.matchAll(/\b(?:src|href)=["']([^"']*\/assets\/[^"']+)["']/g)) {
    assetPaths.add(normalizeAssetPath(match[1]));
  }
  return [...assetPaths];
};

const extractHtmlPwaReferences = (html) => {
  const manifestPaths = new Set();
  const iconPaths = new Set();

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = parseHtmlAttributes(match[0]);
    const href = normalizeLocalStaticPath(attrs.href);
    if (!href) {
      continue;
    }

    const relTokens = new Set((attrs.rel || '').toLowerCase().split(/\s+/).filter(Boolean));
    if (relTokens.has('manifest')) {
      manifestPaths.add(href);
    }
    if (relTokens.has('icon') || relTokens.has('apple-touch-icon') || relTokens.has('mask-icon')) {
      iconPaths.add(href);
    }
  }

  return {
    manifestPaths: [...manifestPaths],
    iconPaths: [...iconPaths],
  };
};

const extractManifestIconPaths = (manifest) => {
  if (!Array.isArray(manifest.icons)) {
    return [];
  }

  return manifest.icons
    .map((icon) => normalizeLocalStaticPath(icon?.src || ''))
    .filter(Boolean);
};

const verifyAppShellMetadata = (html, locationLabel) => {
  if (!/<html\b[^>]*\blang=["']ja["']/i.test(html)) {
    throw new Error(`[smoke] ${locationLabel} is missing html lang="ja"`);
  }
  if (!/<title>\s*Steady Study \| 英単語学習スペース\s*<\/title>/i.test(html)) {
    throw new Error(`[smoke] ${locationLabel} is missing the Steady Study app title`);
  }
  if (!/name=["']apple-mobile-web-app-title["']\s+content=["']Steady Study["']/i.test(html)) {
    throw new Error(`[smoke] ${locationLabel} is missing the iOS PWA app title`);
  }
};

const verifyPwaManifestMetadata = (manifest, locationLabel) => {
  const failures = [];
  if (manifest.name !== 'Steady Study') {
    failures.push(`name=${JSON.stringify(manifest.name)}`);
  }
  if (manifest.short_name !== 'Steady Study') {
    failures.push(`short_name=${JSON.stringify(manifest.short_name)}`);
  }
  if (manifest.display !== 'standalone') {
    failures.push(`display=${JSON.stringify(manifest.display)}`);
  }
  if (manifest.start_url !== '/') {
    failures.push(`start_url=${JSON.stringify(manifest.start_url)}`);
  }
  if (!extractManifestIconPaths(manifest).length) {
    failures.push('icons=[]');
  }

  if (failures.length) {
    throw new Error(`[smoke] ${locationLabel} has invalid PWA metadata: ${failures.join(', ')}`);
  }
};

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

const verifyServedAssetReferences = async (baseUrl) => {
  const rootResponse = await fetch(`${baseUrl}/`);
  if (!rootResponse.ok) {
    throw new Error(`[smoke] / returned ${rootResponse.status}`);
  }

  const rootContentType = rootResponse.headers.get('content-type') || '';
  if (!rootContentType.includes('text/html')) {
    throw new Error(`[smoke] / returned unexpected content-type "${rootContentType || '(missing)'}"`);
  }

  const html = await rootResponse.text();
  if (!html.includes('id="root"')) {
    throw new Error('[smoke] / did not return the app shell root element');
  }
  verifyAppShellMetadata(html, '/');

  const assetPaths = extractAssetPaths(html);
  if (!assetPaths.length) {
    throw new Error('[smoke] / did not reference any /assets files');
  }

  const failures = [];
  await Promise.all(assetPaths.map(async (assetPath) => {
    const assetUrl = new URL(assetPath, baseUrl).toString();
    try {
      const response = await fetch(assetUrl);
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok) {
        failures.push(`${assetPath} -> HTTP ${response.status}`);
        return;
      }
      if (contentType.includes('text/html')) {
        failures.push(`${assetPath} -> HTML response instead of a static asset`);
        return;
      }
      if (assetPath.endsWith('.js') && !/javascript|ecmascript/i.test(contentType)) {
        failures.push(`${assetPath} -> unexpected JS content-type "${contentType || '(missing)'}"`);
      }
      if (assetPath.endsWith('.css') && !/text\/css/i.test(contentType)) {
        failures.push(`${assetPath} -> unexpected CSS content-type "${contentType || '(missing)'}"`);
      }
    } catch (error) {
      failures.push(`${assetPath} -> ${error instanceof Error ? error.message : String(error)}`);
    }
  }));

  if (failures.length) {
    throw new Error(`[smoke] static asset readiness failed:\n${failures.sort().join('\n')}`);
  }

  await verifyServedPwaReferences(baseUrl, html);
};

const verifyServedStaticFile = async (baseUrl, staticPath, expectedKind) => {
  const assetUrl = new URL(staticPath, baseUrl).toString();
  const response = await fetch(assetUrl);
  const contentType = response.headers.get('content-type') || '';

  if (!response.ok) {
    throw new Error(`${staticPath} -> HTTP ${response.status}`);
  }
  if (contentType.includes('text/html')) {
    throw new Error(`${staticPath} -> HTML response instead of ${expectedKind}`);
  }
  if (expectedKind === 'image' && contentType && !/^image\//i.test(contentType) && !/octet-stream/i.test(contentType)) {
    throw new Error(`${staticPath} -> unexpected image content-type "${contentType}"`);
  }

  return response;
};

const verifyServedPwaReferences = async (baseUrl, html) => {
  const { manifestPaths, iconPaths } = extractHtmlPwaReferences(html);
  if (!manifestPaths.length) {
    throw new Error('[smoke] / did not reference a web manifest');
  }

  const failures = [];
  const manifestIconPaths = [];
  await Promise.all(manifestPaths.map(async (manifestPath) => {
    try {
      const response = await verifyServedStaticFile(baseUrl, manifestPath, 'manifest');
      const manifest = await response.json();
      verifyPwaManifestMetadata(manifest, manifestPath);
      manifestIconPaths.push(...extractManifestIconPaths(manifest));
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }));

  await Promise.all([...new Set([...iconPaths, ...manifestIconPaths])].map(async (iconPath) => {
    try {
      await verifyServedStaticFile(baseUrl, iconPath, 'image');
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }));

  if (failures.length) {
    throw new Error(`[smoke] served PWA asset readiness failed:\n${failures.sort().join('\n')}`);
  }
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

const waitForServer = async (baseUrl) => {
  const timeoutMs = Number(process.env.PLAYWRIGHT_SMOKE_SERVER_TIMEOUT_MS || '180000');
  const deadline = Date.now() + timeoutMs;
  let lastError = '';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/session`);
      if (response.status === 200 || response.status === 204) {
        await verifyServedAssetReferences(baseUrl);
        return;
      }
      lastError = `/api/session returned ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      // Retry until ready.
    }
    await delay(500);
  }

  throw new Error(`Timed out waiting for smoke server at ${baseUrl} after ${timeoutMs}ms${lastError ? `; last error: ${lastError}` : ''}`);
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

const sentinelFiles = [
  'tests/smoke/public.smoke.spec.ts',
  'tests/smoke/student.smoke.spec.ts',
];

const cloudflareFiles = [
  'tests/smoke/public.smoke.spec.ts',
  'tests/smoke/student.smoke.spec.ts',
  'tests/smoke/organization.smoke.spec.ts',
  'tests/smoke/commercial.smoke.spec.ts',
  'tests/smoke/writing.smoke.spec.ts',
  'tests/smoke/mobile.smoke.spec.ts',
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
            files: ['tests/smoke/idb.smoke.spec.ts'],
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

const runBuildForEnv = async (suiteEnv, buildKey) => {
  if (skipBuild) {
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
  const port = await getAvailablePort();
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

  try {
    if (!isExternalTarget) {
      server = startServer(port, {
        ...suiteEnv,
        PLAYWRIGHT_SMOKE_PORT: String(port),
      });
      await waitForServer(baseUrl);
    } else {
      await verifyServedAssetReferences(baseUrl);
    }

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

if (isFilteredRun && filteredTestCount === 0 && exitCode === 0) {
  console.error('[smoke] filtered run matched 0 tests across all suites');
  exitCode = 1;
}

process.exit(exitCode);
