import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { getAvailablePort } from './_shared/ports.mjs';

const cwd = process.cwd();
const extraArgs = process.argv.slice(2);
const { FORCE_COLOR: _forceColor, ...baseEnv } = process.env;

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

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

const suites = [
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

for (const suite of suites) {
  const port = await getAvailablePort();
  const outputDir = path.join(cwd, 'test-results', `smoke-${suite.name}-${Date.now()}`);
  await mkdir(outputDir, { recursive: true });

  console.log(`\n[smoke:${suite.name}] port=${port} output=${outputDir}`);

  const suiteExitCode = await runCommand(
    npxCommand,
    ['playwright', 'test', '--config=playwright.smoke.config.ts', ...suite.args, ...extraArgs],
    {
      ...baseEnv,
      ...(suite.env || {}),
      PLAYWRIGHT_SMOKE_PORT: String(port),
      PLAYWRIGHT_OUTPUT_DIR: outputDir,
      PLAYWRIGHT_TRACE_MODE: baseEnv.PLAYWRIGHT_TRACE_MODE || 'off',
      PLAYWRIGHT_VIDEO_MODE: baseEnv.PLAYWRIGHT_VIDEO_MODE || 'off',
    },
  );

  if (suiteExitCode !== 0) {
    exitCode = suiteExitCode;
  }
}

process.exit(exitCode);
