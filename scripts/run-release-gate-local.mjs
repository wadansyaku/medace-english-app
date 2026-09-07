import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createNodeToolCommand } from './_shared/tooling.mjs';

const cwd = process.cwd();
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const scopeArgIndex = args.indexOf('--scope');
const scopeFromOption = scopeArgIndex >= 0 ? args[scopeArgIndex + 1] : null;
const scopeFromFlag = args.includes('--local-only')
  ? 'local-only'
  : args.includes('--remote-readonly')
    ? 'remote-readonly'
    : args.includes('--release')
      ? 'release'
      : null;
const scope = scopeFromOption || scopeFromFlag || 'release';
const knownArgs = new Set([
  '--dry-run',
  '--scope',
  scopeFromOption,
  '--local-only',
  '--remote-readonly',
  '--release',
].filter(Boolean));
const unknownArgs = args.filter((arg) => !knownArgs.has(arg));
const validScopes = new Set(['local-only', 'remote-readonly', 'release']);

if (scopeArgIndex >= 0 && !scopeFromOption) {
  console.error('Missing value after --scope.');
  console.error('Usage: node scripts/run-release-gate-local.mjs [--dry-run] [--scope local-only|remote-readonly|release]');
  process.exit(1);
}

if (!validScopes.has(scope)) {
  console.error(`Invalid scope: ${scope}`);
  console.error('Usage: node scripts/run-release-gate-local.mjs [--dry-run] [--scope local-only|remote-readonly|release]');
  process.exit(1);
}

if (unknownArgs.length > 0) {
  console.error(`Unknown argument(s): ${unknownArgs.join(', ')}`);
  console.error('Usage: node scripts/run-release-gate-local.mjs [--dry-run] [--scope local-only|remote-readonly|release]');
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

const resolveD1Database = () => {
  if (process.env.CLOUDFLARE_D1_DATABASE) return process.env.CLOUDFLARE_D1_DATABASE;
  if (process.env.CF_D1_DATABASE) return process.env.CF_D1_DATABASE;
  return 'medace-db';
};

const createLocalOnlySteps = (d1PersistDir) => {
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
      label: 'npm security audit',
      command: process.execPath,
      args: ['scripts/check-npm-audit.mjs'],
    },
    {
      label: 'Production source reachability',
      command: process.execPath,
      args: ['scripts/check-unused-source.mjs'],
    },
    {
      label: 'Architecture boundaries and circular imports',
      command: process.execPath,
      args: ['scripts/check-architecture.mjs'],
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
      label: 'Build deploy artifact',
      command: viteBuild.command,
      args: viteBuild.args,
    },
  ];
};

const createRemoteReadonlySteps = (contentQaReportPath, sourceLedgerReportPath, b2bActivationReportPath) => {
  const d1Database = resolveD1Database();

  return [
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
        '--summary-only',
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
        '--output',
        sourceLedgerReportPath,
        '--compact',
      ],
    },
    {
      label: 'Remote D1 B2B activation integrity gate',
      command: process.execPath,
      args: [
        'scripts/analysis/check-d1-b2b-activation.mjs',
        '--remote',
        '--database',
        d1Database,
        '--output',
        b2bActivationReportPath,
        '--compact',
      ],
    },
  ];
};

const createSteps = (gateScope, d1PersistDir, contentQaReportPath, sourceLedgerReportPath, b2bActivationReportPath) => {
  const localOnlySteps = createLocalOnlySteps(d1PersistDir);
  const remoteReadonlySteps = createRemoteReadonlySteps(
    contentQaReportPath,
    sourceLedgerReportPath,
    b2bActivationReportPath,
  );

  if (gateScope === 'local-only') return localOnlySteps;
  if (gateScope === 'remote-readonly') return remoteReadonlySteps;
  return [...localOnlySteps, ...remoteReadonlySteps];
};

let persistDir;
let contentQaReportPath;
let sourceLedgerReportPath;
let b2bActivationReportPath;

try {
  persistDir = dryRun
    ? '<temp-d1-persist-dir>'
    : await mkdtemp(path.join(os.tmpdir(), 'medace-release-gate-'));
  contentQaReportPath = persistDir === '<temp-d1-persist-dir>'
    ? '<temp-content-qa-report>'
    : path.join(persistDir, 'content-qa-report.json');
  sourceLedgerReportPath = persistDir === '<temp-d1-persist-dir>'
    ? '<temp-source-ledger-report>'
    : path.join(persistDir, 'source-ledger-report.json');
  b2bActivationReportPath = persistDir === '<temp-d1-persist-dir>'
    ? '<temp-b2b-activation-report>'
    : path.join(persistDir, 'b2b-activation-report.json');

  const steps = createSteps(
    scope,
    persistDir,
    contentQaReportPath,
    sourceLedgerReportPath,
    b2bActivationReportPath,
  );

  const gateLabel = {
    'local-only': 'Local-only release gate',
    'remote-readonly': 'Remote read-only release gate',
    release: 'Full release gate',
  }[scope];
  console.log(dryRun ? `${gateLabel} dry run:` : `${gateLabel}:`);
  console.log(`Scope: ${scope}`);
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
