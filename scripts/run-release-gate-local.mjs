import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createNodeToolCommand } from './_shared/tooling.mjs';

const cwd = process.cwd();
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const unknownArgs = args.filter((arg) => arg !== '--dry-run');

if (unknownArgs.length > 0) {
  console.error(`Unknown argument(s): ${unknownArgs.join(', ')}`);
  console.error('Usage: node scripts/run-release-gate-local.mjs [--dry-run]');
  process.exit(1);
}

const quoteForShell = (value) => {
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
};

const formatCommand = (command, commandArgs) => (
  [command, ...commandArgs].map(quoteForShell).join(' ')
);

const runCommand = (command, commandArgs) => new Promise((resolve) => {
  const child = spawn(command, commandArgs, {
    cwd,
    env: process.env,
    shell: false,
    stdio: 'inherit',
  });

  child.on('error', (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    resolve(1);
  });
  child.on('close', (code) => {
    resolve(code ?? 1);
  });
});

const createSteps = (d1PersistDir, contentQaReportPath) => {
  const migrationReplay = createNodeToolCommand('wrangler', [
    'd1',
    'migrations',
    'apply',
    'medace-db',
    '--local',
    '--persist-to',
    d1PersistDir,
  ]);
  const viteBuild = createNodeToolCommand('vite', ['build']);
  const d1Database = process.env.CF_D1_DATABASE || 'medace-db';

  return [
    {
      label: 'Migration filename check',
      command: process.execPath,
      args: ['scripts/check-migration-filenames.mjs'],
    },
    {
      label: 'Local D1 migration replay',
      command: migrationReplay.command,
      args: migrationReplay.args,
    },
    {
      label: 'TypeScript typecheck',
      command: process.execPath,
      args: ['node_modules/typescript/bin/tsc', '--noEmit'],
    },
    {
      label: 'Vitest unit suite',
      command: process.execPath,
      args: ['node_modules/vitest/vitest.mjs', 'run'],
    },
    {
      label: 'Build app for API integration tests',
      command: viteBuild.command,
      args: viteBuild.args,
    },
    {
      label: 'API integration tests',
      command: process.execPath,
      args: ['scripts/run-api-integration-tests.mjs'],
    },
    {
      label: 'Full Playwright smoke suite',
      command: process.execPath,
      args: ['scripts/run-smoke-tests.mjs', '--suite', 'full'],
    },
    {
      label: 'Cloudflare configuration doctor',
      command: process.execPath,
      args: ['scripts/cf-doctor.mjs'],
    },
    {
      label: 'Remote D1 content QA report',
      command: process.execPath,
      args: [
        'scripts/analysis/run-d1-content-qa.mjs',
        '--remote',
        '--database',
        d1Database,
        '--output',
        contentQaReportPath,
        '--compact',
      ],
    },
    {
      label: 'Content QA blocking check',
      command: process.execPath,
      args: ['scripts/check-content-qa-report.mjs', '--input', contentQaReportPath],
    },
    {
      label: 'Remote D1 source ledger gate',
      command: process.execPath,
      args: [
        'scripts/analysis/check-d1-material-source-ledger.mjs',
        '--remote',
        '--database',
        d1Database,
      ],
    },
    {
      label: 'Build deploy artifact',
      command: viteBuild.command,
      args: viteBuild.args,
    },
  ];
};

let persistDir;
let contentQaReportPath;

try {
  persistDir = dryRun
    ? '<temp-d1-persist-dir>'
    : await mkdtemp(path.join(os.tmpdir(), 'medace-release-gate-'));
  contentQaReportPath = persistDir === '<temp-d1-persist-dir>'
    ? '<temp-content-qa-report>'
    : path.join(persistDir, 'content-qa-report.json');

  const steps = createSteps(persistDir, contentQaReportPath);

  console.log(dryRun ? 'Local release gate dry run:' : 'Local release gate:');
  steps.forEach((step, index) => {
    console.log(`${String(index + 1).padStart(2, '0')}. ${step.label}`);
    console.log(`    ${formatCommand(step.command, step.args)}`);
  });

  if (dryRun) {
    console.log('\nNo commands were executed.');
  } else {
    for (const [index, step] of steps.entries()) {
      const startedAt = Date.now();
      console.log(`\n[${index + 1}/${steps.length}] ${step.label}`);
      const exitCode = await runCommand(step.command, step.args);
      const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

      if (exitCode !== 0) {
        console.error(`[release-gate] ${step.label} failed after ${elapsedSeconds}s with exit code ${exitCode}.`);
        process.exitCode = exitCode;
        break;
      }

      console.log(`[release-gate] ${step.label} passed in ${elapsedSeconds}s.`);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (persistDir && persistDir !== '<temp-d1-persist-dir>') {
    await rm(persistDir, { recursive: true, force: true });
  }
}
