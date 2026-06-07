import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

const readText = (relativePath: string): string => (
  fs.readFileSync(`${root}/${relativePath}`, 'utf8')
);

const readJson = <T>(relativePath: string): T => (
  JSON.parse(readText(relativePath)) as T
);

const isGitTracked = (relativePath: string): boolean => (
  spawnSync('git', ['ls-files', '--error-unmatch', relativePath], {
    cwd: root,
    encoding: 'utf8',
  }).status === 0
);

const readArrayConst = (source: string, constName: string): string[] => {
  const match = source.match(new RegExp(`const\\s+${constName}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  if (!match) throw new Error(`Missing array const ${constName}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
};

const readMapStringKeys = (source: string, constName: string): string[] => {
  const match = source.match(new RegExp(`const\\s+${constName}\\s*=\\s*new Map\\(\\[([\\s\\S]*?)\\]\\);`));
  if (!match) throw new Error(`Missing map const ${constName}`);
  return [...match[1].matchAll(/\['([^']+)'\s*,/g)].map((entry) => entry[1]);
};

const expectTextInOrder = (source: string, expectedEntries: string[]) => {
  let cursor = -1;
  expectedEntries.forEach((entry) => {
    const nextCursor = source.indexOf(entry, cursor + 1);
    expect(nextCursor).toBeGreaterThan(cursor);
    cursor = nextCursor;
  });
};

type PackageJson = {
  scripts: Record<string, string>;
};

describe('release hygiene contracts', () => {
  it('keeps cf:sync and cf:doctor required config classifications aligned', () => {
    const sync = readText('scripts/cf-sync.mjs');
    const doctor = readText('scripts/cf-doctor.mjs');

    expect(readArrayConst(sync, 'REQUIRED_GITHUB_VARIABLES')).toEqual(
      readArrayConst(doctor, 'REQUIRED_GITHUB_VARIABLES'),
    );
    expect(readArrayConst(sync, 'REQUIRED_GITHUB_SCHEDULED_SECRETS')).toEqual(
      readArrayConst(doctor, 'REQUIRED_GITHUB_SCHEDULED_SECRETS'),
    );
    expect(readArrayConst(sync, 'REQUIRED_PAGES_SECRETS')).toEqual(
      readArrayConst(doctor, 'REQUIRED_PAGES_SECRETS'),
    );
    expect(readArrayConst(sync, 'OPTIONAL_PAGES_SECRETS')).toEqual(
      readArrayConst(doctor, 'DEFERRED_PAGES_SECRETS'),
    );
    expect(readMapStringKeys(sync, 'secretSources').sort()).toEqual(
      readArrayConst(doctor, 'REQUIRED_GITHUB_SECRETS').sort(),
    );
    expect(sync).toContain('...REQUIRED_GITHUB_SCHEDULED_SECRETS.map');
  });

  it('documents cf:doctor error=0 as the release gate used by deploy workflows', () => {
    const doctor = readText('scripts/cf-doctor.mjs');
    const readme = readText('README.md');
    const runbook = readText('docs/deployment-ops-runbook.md');
    const productionWorkflow = readText('.github/workflows/deploy-pages.yml');
    const previewWorkflow = readText('.github/workflows/deploy-pages-preview.yml');

    expect(doctor).toContain('Summary: ok=');
    expect(doctor).toMatch(/if \(\(counts\.error \|\| 0\) > 0\) \{\s*process\.exitCode = 1;/);
    expect(doctor).toMatch(/isPagesGitAutoDeployDisabled\(sourceConfig\) \? 'ok' : 'error'/);
    expect(doctor).toContain('`Possible duplicate Pages project ${gitMirrorProject}`');
    expect(doctor).toContain('project settings could not be verified');
    expect(readme).toContain('cf:doctor` の `Summary` が `error=0`');
    expect(readme).toContain('Cloudflare native Git auto-deploy');
    expect(readme).toContain('release-blocking error');
    expect(runbook).toContain('cf:doctor` の `Summary` が `error=0`');
    expect(runbook).toContain('Cloudflare native Git auto-deploy');
    expect(runbook).toContain('release-blocking error');
    expect(productionWorkflow).toMatch(/run: npm run cf:doctor/);
    expect(previewWorkflow).toMatch(/run: npm run cf:doctor/);
  });

  it('keeps the local release gate aligned with deploy workflow verification', () => {
    const packageJson = readJson<PackageJson>('package.json');
    const localGate = readText('scripts/run-release-gate-local.mjs');
    const readme = readText('README.md');
    const runbook = readText('docs/deployment-ops-runbook.md');
    const productionWorkflow = readText('.github/workflows/deploy-pages.yml');
    const previewWorkflow = readText('.github/workflows/deploy-pages-preview.yml');

    expect(packageJson.scripts['release:gate:local']).toBe('node scripts/run-release-gate-local.mjs');
    expect(packageJson.scripts['release:gate:local:dry']).toBe('node scripts/run-release-gate-local.mjs --dry-run');
    expect(packageJson.scripts['content:qa:gate']).toBe('node scripts/check-content-qa-report.mjs');
    expect(packageJson.scripts['content:source-ledger:d1']).toBe('node scripts/analysis/check-d1-material-source-ledger.mjs');
    expect(localGate).toContain('--dry-run');
    expect(localGate).toContain("'scripts/run-smoke-tests.mjs', '--suite', 'full'");
    expect(localGate).toContain("'scripts/cf-doctor.mjs'");
    expect(localGate).toContain("'scripts/analysis/run-d1-content-qa.mjs'");
    expect(localGate).toContain("'scripts/check-content-qa-report.mjs'");
    expect(localGate).toContain("'scripts/analysis/check-d1-material-source-ledger.mjs'");
    expect(localGate).toContain('Full Playwright smoke suite');
    expectTextInOrder(localGate, [
      'Migration filename check',
      'Local D1 migration replay',
      'TypeScript typecheck',
      'Vitest unit suite',
      'Build app for API integration tests',
      'API integration tests',
      'Full Playwright smoke suite',
      'Cloudflare configuration doctor',
      'Remote D1 content QA report',
      'Content QA blocking check',
      'Remote D1 source ledger gate',
      'Build deploy artifact',
    ]);
    const smokeRunner = readText('scripts/run-smoke-tests.mjs');
    expect(smokeRunner).toContain("workers: '1'");
    expect(smokeRunner).toContain('`--workers=${suite.workers}`');

    const workflowGateOrder = [
      'name: Fast verification gate',
      'run: npm run verify:fast',
      'name: Build app for local integration tests',
      'run: npm run build',
      'name: API integration tests',
      'run: npm run test:api',
      'name: Full smoke suite',
      'run: node scripts/run-smoke-tests.mjs --suite full',
      'name: Verify GitHub and Cloudflare configuration',
      'run: npm run cf:doctor',
      'name: Build deploy artifact',
      'run: npm run build',
    ];

    expectTextInOrder(productionWorkflow, workflowGateOrder);
    expectTextInOrder(previewWorkflow, workflowGateOrder);
    expect(productionWorkflow).toContain('local release gate equivalent');
    expect(previewWorkflow).toContain('local release gate equivalent');
    expectTextInOrder(productionWorkflow, [
      'name: Apply remote D1 migrations',
      'name: Generate production content QA report',
      'run: node scripts/analysis/run-d1-content-qa.mjs --remote --database "$CF_D1_DATABASE" --output tmp/content-qa/production-content-qa.json --compact',
      'name: Enforce production content QA gate',
      'run: npm run content:qa:gate -- --input tmp/content-qa/production-content-qa.json',
      'name: Enforce production source ledger gate',
      'run: npm run content:source-ledger:d1 -- --remote --database "$CF_D1_DATABASE"',
      'name: Deploy to Cloudflare Pages',
    ]);
    expectTextInOrder(previewWorkflow, [
      'name: Apply remote preview D1 migrations',
      'name: Generate preview content QA report',
      'run: node scripts/analysis/run-d1-content-qa.mjs --remote --database "$CF_D1_DATABASE" --output tmp/content-qa/preview-content-qa.json --compact',
      'name: Enforce preview content QA gate',
      'run: npm run content:qa:gate -- --input tmp/content-qa/preview-content-qa.json',
      'name: Enforce preview source ledger gate',
      'run: npm run content:source-ledger:d1 -- --remote --database "$CF_D1_DATABASE"',
      'name: Deploy preview to Cloudflare Pages',
    ]);
    expect(productionWorkflow).toContain('run: node scripts/run-smoke-tests.mjs --suite sentinel --grep');
    expect(previewWorkflow).toContain('run: node scripts/run-smoke-tests.mjs --suite sentinel --grep');
    expect(productionWorkflow).not.toContain('node node_modules/playwright/cli.js test --config=playwright.smoke.config.ts --grep');
    expect(previewWorkflow).not.toContain('node node_modules/playwright/cli.js test --config=playwright.smoke.config.ts --grep');

    expect(readme).toContain('npm run release:gate:local');
    expect(readme).toContain('node scripts/run-smoke-tests.mjs --suite full');
    expect(readme).toContain('content QA gate');
    expect(readme).toContain('source ledger gate');
    expect(runbook).toContain('npm run release:gate:local');
    expect(runbook).toContain('node scripts/run-smoke-tests.mjs --suite full');
    expect(runbook).toContain('content QA gate');
    expect(runbook).toContain('source ledger gate');
  });

  it('keeps production and preview deploys on the protected main path with pre-deploy runtime metadata', () => {
    const productionWorkflow = readText('.github/workflows/deploy-pages.yml');
    const previewWorkflow = readText('.github/workflows/deploy-pages-preview.yml');

    expect(productionWorkflow).toMatch(/branches:\n\s+- main\n/);
    expect(productionWorkflow).not.toMatch(/branches:\n(?:\s+- .+\n)*\s+- master\n/);
    expect(productionWorkflow).toContain("github.ref_name == 'main'");
    expect(productionWorkflow).not.toContain("github.ref_name == 'master'");
    expect(previewWorkflow).toMatch(/pull_request:\n\s+branches:\n\s+- main\n/);
    expect(previewWorkflow).not.toMatch(/branches:\n(?:\s+- .+\n)*\s+- master\n/);

    expectTextInOrder(productionWorkflow, [
      'name: Update production deployment runtime metadata',
      'name: Deploy to Cloudflare Pages',
      'name: Run deployed production smoke',
    ]);
    expectTextInOrder(previewWorkflow, [
      'name: Update preview deployment runtime metadata',
      'name: Deploy preview to Cloudflare Pages',
      'name: Wait for deployed preview readiness',
      'name: Run deployed preview smoke',
    ]);
    expect(productionWorkflow).toContain('PLAYWRIGHT_EXPECT_DEPLOYMENT_SHA: ${{ github.sha }}');
    expect(previewWorkflow).toContain('PLAYWRIGHT_EXPECT_DEPLOYMENT_SHA: ${{ github.sha }}');
  });

  it('keeps release scripts referenced by package.json tracked in git', () => {
    const packageJson = readJson<PackageJson>('package.json');
    const localGateScript = packageJson.scripts['release:gate:local'];
    const localGateDryScript = packageJson.scripts['release:gate:local:dry'];

    expect(localGateScript).toContain('scripts/run-release-gate-local.mjs');
    expect(localGateDryScript).toContain('scripts/run-release-gate-local.mjs');
    expect(isGitTracked('scripts/run-release-gate-local.mjs')).toBe(true);
  });
});
