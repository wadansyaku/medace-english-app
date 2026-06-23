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

const readWorkflowStep = (source: string, stepName: string): string => {
  const start = source.indexOf(`- name: ${stepName}`);
  if (start < 0) throw new Error(`Missing workflow step ${stepName}`);
  const next = source.indexOf('\n      - name:', start + 1);
  return source.slice(start, next < 0 ? source.length : next);
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

  it('keeps CI verify from skipping the npm security audit gate', () => {
    const ciWorkflow = readText('.github/workflows/ci.yml');

    expectTextInOrder(ciWorkflow, [
      'name: Install dependencies',
      'run: npm ci',
      'name: Security audit',
      'run: npm run security:audit',
      'name: Fast verification gate',
      'run: npm run verify:fast',
    ]);
  });

  it('keeps CI sentinel smoke enabled for pull requests without Cloudflare credentials', () => {
    const ciWorkflow = readText('.github/workflows/ci.yml');
    const browserSmokeWorkflow = readText('.github/workflows/browser-smoke.yml');
    const installStep = readWorkflowStep(ciWorkflow, 'Install Playwright browser for sentinel smoke');
    const sentinelStep = readWorkflowStep(ciWorkflow, 'Run smoke sentinel');

    expectTextInOrder(ciWorkflow, [
      'pull_request:',
      'name: Build',
      'run: npm run build',
      'name: Install Playwright browser for sentinel smoke',
      'run: node node_modules/playwright/cli.js install --with-deps chromium',
      'name: Run smoke sentinel',
      "SMOKE_SKIP_BUILD: '1'",
      'run: node scripts/run-smoke-tests.mjs --suite sentinel',
      'name: API integration tests',
    ]);
    expect(installStep).not.toContain("if: github.event_name == 'push'");
    expect(sentinelStep).not.toContain("if: github.event_name == 'push'");
    expect(sentinelStep).not.toContain('CLOUDFLARE_API_TOKEN');
    expect(sentinelStep).not.toContain('CLOUDFLARE_ACCOUNT_ID');
    expect(sentinelStep).toContain("SMOKE_SKIP_BUILD: '1'");
    expect(browserSmokeWorkflow).toMatch(/pull_request:\n\s+branches:/);
    expect(browserSmokeWorkflow).toContain('run: node scripts/run-smoke-tests.mjs --suite "${{ inputs.suite || \'sentinel\' }}"');
  });

  it('does not reuse a Cloudflare smoke build for the IDB fallback suite', () => {
    const smokeRunner = readText('scripts/run-smoke-tests.mjs');

    expectTextInOrder(smokeRunner, [
      'const canSkipBuildForSuite = (suiteEnv) => (',
      'skipBuild',
      "&& suiteEnv?.VITE_STORAGE_MODE !== 'idb'",
      'if (canSkipBuildForSuite(suiteEnv))',
      'return 0;',
      'const buildKey = suite.env?.VITE_STORAGE_MODE === \'idb\' ? \'idb\' : \'cloudflare\';',
    ]);
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
    expect(packageJson.scripts['security:audit']).toBe('node scripts/check-npm-audit.mjs');
    expect(packageJson.scripts['content:qa:gate']).toBe('node scripts/check-content-qa-report.mjs');
    expect(packageJson.scripts['content:source-ledger:d1']).toBe('node scripts/analysis/check-d1-material-source-ledger.mjs');
    expect(packageJson.scripts['ops:b2b-activation:d1']).toBe('node scripts/analysis/check-d1-b2b-activation.mjs');
    expect(packageJson.scripts['ops:production-baseline:d1']).toBe('node scripts/analysis/run-production-baseline.mjs');
    expect(localGate).toContain('--dry-run');
    expect(localGate).toContain("'scripts/check-npm-audit.mjs'");
    expect(localGate).toContain("'scripts/run-smoke-tests.mjs', '--suite', 'full'");
    expect(localGate).toContain("'scripts/cf-doctor.mjs'");
    expect(localGate).toContain("'scripts/analysis/run-d1-content-qa.mjs'");
    expect(localGate).toContain("'scripts/check-content-qa-report.mjs'");
    expect(localGate).toContain("'scripts/analysis/check-d1-material-source-ledger.mjs'");
    expect(localGate).toContain("'scripts/analysis/check-d1-b2b-activation.mjs'");
    expect(localGate).toContain('source-ledger-report.json');
    expect(localGate).toContain('b2b-activation-report.json');
    expect(localGate).toContain('Full Playwright smoke suite');
    expectTextInOrder(localGate, [
      'Migration filename check',
      'Local D1 migration replay',
      'npm security audit',
      'TypeScript typecheck',
      'Vitest unit suite',
      'Build app for API integration tests',
      'API integration tests',
      'Full Playwright smoke suite',
      'Cloudflare configuration doctor',
      'Remote D1 content QA report',
      'Content QA blocking check',
      'Remote D1 source ledger gate',
      'Remote D1 B2B activation integrity gate',
      'Build deploy artifact',
    ]);
    const smokeRunner = readText('scripts/run-smoke-tests.mjs');
    expect(smokeRunner).toContain("workers: '1'");
    expect(smokeRunner).toContain('`--workers=${suite.workers}`');

    const workflowGateOrder = [
      'name: Install dependencies',
      'run: npm ci',
      'name: Security audit',
      'run: npm run security:audit',
      'name: Install Playwright browser',
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
    expectTextInOrder(productionWorkflow, [
      'name: Verify GitHub and Cloudflare configuration',
      'name: Sync production admin demo runtime flag',
      'run: |',
      'pages secret put ENABLE_ADMIN_DEMO --project-name "$CF_PAGES_PROJECT"',
      'name: Build deploy artifact',
    ]);
    expect(productionWorkflow).toContain('local release gate equivalent');
    expect(previewWorkflow).toContain('local release gate equivalent');
    expect(productionWorkflow).toContain('B2B Activation Integrity Gate: \\`passed\\`');
    expect(previewWorkflow).toContain('B2B Activation Integrity Gate: \\`passed\\`');
    expect(previewWorkflow).toContain('B2B Activation Integrity Gate: `passed`');
    expectTextInOrder(productionWorkflow, [
      'name: Apply remote D1 migrations',
      'name: Generate production content QA report',
      'run: node scripts/analysis/run-d1-content-qa.mjs --remote --database "$CF_D1_DATABASE" --output tmp/content-qa/production-content-qa.json --compact',
      'name: Enforce production content QA gate',
      'run: npm run content:qa:gate -- --input tmp/content-qa/production-content-qa.json',
      'name: Enforce production source ledger gate',
      'run: npm run content:source-ledger:d1 -- --remote --database "$CF_D1_DATABASE" --output tmp/release-gates/production-source-ledger.json --compact',
      'name: Enforce production B2B activation integrity gate',
      'run: npm run ops:b2b-activation:d1 -- --remote --database "$CF_D1_DATABASE" --output tmp/release-gates/production-b2b-activation.json --compact',
      'name: Upload production release gate evidence',
      'name: Summarize production release gate evidence',
      'name: Deploy to Cloudflare Pages',
    ]);
    expectTextInOrder(previewWorkflow, [
      'name: Apply remote preview D1 migrations',
      'name: Generate preview content QA report',
      'run: node scripts/analysis/run-d1-content-qa.mjs --remote --database "$CF_D1_DATABASE" --output tmp/content-qa/preview-content-qa.json --compact',
      'name: Enforce preview content QA gate',
      'run: npm run content:qa:gate -- --input tmp/content-qa/preview-content-qa.json',
      'name: Enforce preview source ledger gate',
      'run: npm run content:source-ledger:d1 -- --remote --database "$CF_D1_DATABASE" --output tmp/release-gates/preview-source-ledger.json --compact',
      'name: Enforce preview B2B activation integrity gate',
      'run: npm run ops:b2b-activation:d1 -- --remote --database "$CF_D1_DATABASE" --output tmp/release-gates/preview-b2b-activation.json --compact',
      'name: Upload preview release gate evidence',
      'name: Summarize preview release gate evidence',
      'name: Deploy preview to Cloudflare Pages',
    ]);
    expect(productionWorkflow).toContain('uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02');
    expect(productionWorkflow).toContain('name: production-release-gate-evidence');
    expect(productionWorkflow).toContain('## Production Release Gate Evidence');
    expect(previewWorkflow).toContain('uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02');
    expect(previewWorkflow).toContain('name: preview-release-gate-evidence');
    expect(previewWorkflow).toContain('## Preview Release Gate Evidence');
    expect(productionWorkflow).toContain('run: node scripts/run-smoke-tests.mjs --suite sentinel --grep');
    expect(productionWorkflow).toContain('public guide keeps the business role previews visible');
    expect(productionWorkflow).toContain('public role pages always emit a noindex robots tag and service admin action stays safe');
    expect(productionWorkflow).toContain('service admin dedicated access link resolves to the protected admin entrypoint');
    expect(productionWorkflow).toContain('name: Upload production deployed smoke artifacts');
    expect(productionWorkflow).toContain('name: production-deployed-smoke-artifacts');
    expect(previewWorkflow).toContain('run: node scripts/run-smoke-tests.mjs --suite sentinel --grep');
    expect(previewWorkflow).toContain('name: Upload preview deployed smoke artifacts');
    expect(previewWorkflow).toContain('name: preview-deployed-smoke-artifacts');
    expect(productionWorkflow).not.toContain('node node_modules/playwright/cli.js test --config=playwright.smoke.config.ts --grep');
    expect(previewWorkflow).not.toContain('node node_modules/playwright/cli.js test --config=playwright.smoke.config.ts --grep');

    expect(readme).toContain('npm run release:gate:local');
    expect(readme).toContain('npm security audit');
    expect(readme).toContain('`security:audit`');
    expect(readme).toContain('node scripts/run-smoke-tests.mjs --suite full');
    expect(readme).toContain('content QA gate');
    expect(readme).toContain('source ledger gate');
    expect(readme).toContain('B2B activation integrity gate');
    expect(readme).toContain('ops:production-baseline:d1');
    expect(runbook).toContain('npm run release:gate:local');
    expect(runbook).toContain('npm security audit');
    expect(runbook).toContain('`security:audit`');
    expect(runbook).toContain('node scripts/run-smoke-tests.mjs --suite full');
    expect(runbook).toContain('content QA gate');
    expect(runbook).toContain('source ledger gate');
    expect(runbook).toContain('B2B activation integrity gate');
    expect(runbook).toContain('ops:production-baseline:d1');
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
