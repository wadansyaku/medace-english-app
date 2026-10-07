import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
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

const readSmokeTestDeclarations = (relativePath: string) => {
  const source = ts.createSourceFile(relativePath, readText(relativePath), ts.ScriptTarget.Latest, true);
  const declarations: { title: string; body: string; file: string }[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'test'
      && node.arguments.length >= 2
      && ts.isStringLiteralLike(node.arguments[0])
    ) {
      declarations.push({
        title: node.arguments[0].text,
        body: node.getText(source),
        file: relativePath,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return declarations;
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
    expect(doctor).toContain('Cloudflare dashboard may show "Deployments paused"');
    expect(doctor).toContain('isProtectedReleaseContext');
    expect(doctor).toContain('cf:doctor must fail closed in protected/release workflows');
    expect(readme).toContain('cf:doctor` の `Summary` が `error=0`');
    expect(readme).toContain('Cloudflare native Git auto-deploy');
    expect(readme).toContain('Deployments paused');
    expect(readme).toContain('Resume deployments');
    expect(readme).toContain('release-blocking error');
    expect(runbook).toContain('cf:doctor` の `Summary` が `error=0`');
    expect(runbook).toContain('Cloudflare native Git auto-deploy');
    expect(runbook).toContain('Deployments paused');
    expect(runbook).toContain('Resume deployments');
    expect(runbook).toContain('release-blocking error');
    expect(productionWorkflow).toMatch(/run: npm run cf:doctor/);
    expect(previewWorkflow).toMatch(/run: npm run cf:doctor/);
  });

  it('keeps Cloudflare doctor fail-closed in protected CI contexts', () => {
    const ciWorkflow = readText('.github/workflows/ci.yml');
    const doctorStep = readWorkflowStep(ciWorkflow, 'Verify GitHub and Cloudflare configuration');

    expect(doctorStep).toContain('set -euo pipefail');
    expect(doctorStep).toContain('protected_ref="${GITHUB_REF_PROTECTED:-false}"');
    expect(doctorStep).toContain('main|master');
    expect(doctorStep).toContain('Missing Cloudflare credentials in a protected CI context');
    expect(doctorStep).toContain('exit 1');
    expectTextInOrder(doctorStep, [
      'if [ -n "$missing" ] && [ "$protected_ref" = "true" ]; then',
      'exit 1',
      'if [ -n "$missing" ]; then',
      'Skipping cf:doctor because Cloudflare credentials are unavailable in this unprotected pull request context',
      'exit 0',
      'npm run cf:doctor',
    ]);
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

  it('runs PR sentinel once in the required verify check and keeps standalone smoke manual', () => {
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
    expect(installStep).not.toContain('if:');
    expect(sentinelStep).not.toContain('if:');
    expect(sentinelStep).not.toContain('CLOUDFLARE_API_TOKEN');
    expect(sentinelStep).not.toContain('CLOUDFLARE_ACCOUNT_ID');
    expect(sentinelStep).toContain("SMOKE_SKIP_BUILD: '1'");
    expect(ciWorkflow).toMatch(/^name: CI\n/);
    expect(ciWorkflow).toMatch(/jobs:\n  verify:/);
    expect(browserSmokeWorkflow).toMatch(/^name: Smoke Sentinel\n/);
    expect(browserSmokeWorkflow).toMatch(/jobs:\n  smoke:/);
    expect(browserSmokeWorkflow).not.toContain('pull_request:');
    expect(browserSmokeWorkflow).toContain('workflow_dispatch:');
    expect(readWorkflowStep(browserSmokeWorkflow, 'Run browser smoke tests')).not.toContain('if:');
    expect(browserSmokeWorkflow).toContain('run: node scripts/run-smoke-tests.mjs --suite "${{ inputs.suite || \'sentinel\' }}"');
    expect(ciWorkflow).toContain('group: ci-${{ github.event.pull_request.number || github.ref }}');
    expect(browserSmokeWorkflow).toContain('group: browser-smoke-manual-${{ github.ref }}');
  });

  it('keeps remote credentials out of local verification steps', () => {
    const workflows = [
      '.github/workflows/ci.yml',
      '.github/workflows/deploy-pages.yml',
      '.github/workflows/deploy-pages-preview.yml',
    ];
    for (const workflowPath of workflows) {
      const workflow = readText(workflowPath);
      const jobHeader = workflow.slice(0, workflow.indexOf('\n    steps:'));
      expect(jobHeader).not.toContain('GH_TOKEN:');
      expect(jobHeader).not.toContain('${{ secrets.');
      const localSteps = ['Install dependencies', 'Security audit', 'Fast verification gate', 'API integration tests'];
      if (workflowPath !== '.github/workflows/ci.yml') localSteps.push('Full smoke suite');
      for (const name of localSteps) {
        expect(readWorkflowStep(workflow, name)).not.toContain('${{ secrets.');
        expect(readWorkflowStep(workflow, name)).not.toContain('GH_TOKEN:');
      }
      const doctor = readWorkflowStep(workflow, 'Verify GitHub and Cloudflare configuration');
      expect(doctor).toContain('GH_TOKEN: ${{ github.token }}');
      expect(doctor).toContain('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}');
    }
    const browserSmoke = readText('.github/workflows/browser-smoke.yml');
    expect(browserSmoke).not.toContain('${{ secrets.');
    expect(browserSmoke).not.toContain('GH_TOKEN:');
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

    expect(packageJson.scripts['release:gate']).toBe('node scripts/run-release-gate-local.mjs --scope release');
    expect(packageJson.scripts['release:gate:dry']).toBe('node scripts/run-release-gate-local.mjs --scope release --dry-run');
    expect(packageJson.scripts['release:gate:local']).toBe('node scripts/run-release-gate-local.mjs --scope release');
    expect(packageJson.scripts['release:gate:local:dry']).toBe('node scripts/run-release-gate-local.mjs --scope release --dry-run');
    expect(packageJson.scripts['release:gate:local-only']).toBe('node scripts/run-release-gate-local.mjs --scope local-only');
    expect(packageJson.scripts['release:gate:remote-readonly']).toBe('node scripts/run-release-gate-local.mjs --scope remote-readonly');
    expect(packageJson.scripts['security:audit']).toBe('node scripts/check-npm-audit.mjs');
    expect(packageJson.scripts['quality:unused']).toBe('node scripts/check-unused-source.mjs');
    expect(packageJson.scripts['quality:architecture']).toBe('node scripts/check-architecture.mjs');
    expect(packageJson.scripts['clean:artifacts']).toBe('node scripts/clean-local-artifacts.mjs');
    expect(packageJson.scripts['clean:artifacts:apply']).toBe('node scripts/clean-local-artifacts.mjs --apply');
    expect(packageJson.scripts['verify:fast']).toContain('npm run quality:unused');
    expect(packageJson.scripts['verify:fast']).toContain('npm run quality:architecture');
    expect(packageJson.scripts['content:qa:gate']).toBe('node scripts/check-content-qa-report.mjs');
    expect(packageJson.scripts['content:source-ledger:d1']).toBe('node scripts/analysis/check-d1-material-source-ledger.mjs');
    expect(packageJson.scripts['ops:b2b-activation:d1']).toBe('node scripts/analysis/check-d1-b2b-activation.mjs');
    expect(packageJson.scripts['ops:production-baseline:d1']).toBe('node scripts/analysis/run-production-baseline.mjs');
    expect(localGate).toContain('--dry-run');
    expect(localGate).toContain("'local-only'");
    expect(localGate).toContain("'remote-readonly'");
    expect(localGate).toContain("'release'");
    expect(localGate).toContain('CLOUDFLARE_D1_DATABASE');
    expect(localGate).toContain('CF_D1_DATABASE');
    expect(localGate).toContain("'scripts/check-npm-audit.mjs'");
    expect(localGate).toContain("'scripts/check-unused-source.mjs'");
    expect(localGate).toContain("'scripts/check-architecture.mjs'");
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
      'Production source reachability',
      'Architecture boundaries and circular imports',
      'TypeScript typecheck',
      'Vitest unit suite',
      'Build app for API integration tests',
      'API integration tests',
      'Full Playwright smoke suite',
      'Build deploy artifact',
      'Cloudflare configuration doctor',
      'Remote D1 content QA report',
      'Content QA blocking check',
      'Remote D1 source ledger gate',
      'Remote D1 B2B activation integrity gate',
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
      'run: node scripts/analysis/run-d1-content-qa.mjs --remote --database "$CLOUDFLARE_D1_DATABASE" --output tmp/content-qa/production-content-qa.json --compact',
      'name: Enforce production content QA gate',
      'run: npm run content:qa:gate -- --input tmp/content-qa/production-content-qa.json',
      'name: Enforce production source ledger gate',
      'run: npm run content:source-ledger:d1 -- --remote --database "$CLOUDFLARE_D1_DATABASE" --output tmp/release-gates/production-source-ledger.json --compact',
      'name: Enforce production B2B activation integrity gate',
      'run: npm run ops:b2b-activation:d1 -- --remote --database "$CLOUDFLARE_D1_DATABASE" --output tmp/release-gates/production-b2b-activation.json --compact',
      'name: Upload production release gate evidence',
      'name: Summarize production release gate evidence',
      'name: Deploy to Cloudflare Pages',
    ]);
    expectTextInOrder(previewWorkflow, [
      'name: Apply remote preview D1 migrations',
      'name: Generate preview content QA report',
      'run: node scripts/analysis/run-d1-content-qa.mjs --remote --database "$CLOUDFLARE_D1_DATABASE" --output tmp/content-qa/preview-content-qa.json --compact',
      'name: Enforce preview content QA gate',
      'run: npm run content:qa:gate -- --input tmp/content-qa/preview-content-qa.json',
      'name: Enforce preview source ledger gate',
      'run: npm run content:source-ledger:d1 -- --remote --database "$CLOUDFLARE_D1_DATABASE" --output tmp/release-gates/preview-source-ledger.json --compact',
      'name: Enforce preview B2B activation integrity gate',
      'run: npm run ops:b2b-activation:d1 -- --remote --database "$CLOUDFLARE_D1_DATABASE" --output tmp/release-gates/preview-b2b-activation.json --compact',
      'name: Upload preview release gate evidence',
      'name: Summarize preview release gate evidence',
      'name: Deploy preview to Cloudflare Pages',
    ]);
    expect(productionWorkflow).toContain('uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a');
    expect(productionWorkflow).toContain('name: production-release-gate-evidence');
    expect(productionWorkflow).toContain('## Production Release Gate Evidence');
    expect(previewWorkflow).toContain('uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a');
    expect(previewWorkflow).toContain('name: preview-release-gate-evidence');
    expect(previewWorkflow).toContain('## Preview Release Gate Evidence');
    expect(productionWorkflow).toContain('run: node scripts/run-smoke-tests.mjs --suite sentinel --grep');
    expect(productionWorkflow).toContain('name: Upload production deployed smoke artifacts');
    expect(productionWorkflow).toContain('name: production-deployed-smoke-artifacts');
    expect(previewWorkflow).toContain('run: node scripts/run-smoke-tests.mjs --suite sentinel --grep');
    expect(previewWorkflow).toContain('name: Upload preview deployed smoke artifacts');
    expect(previewWorkflow).toContain('name: preview-deployed-smoke-artifacts');
    const productionSecretsStep = readWorkflowStep(productionWorkflow, 'Inspect production Pages secrets');
    const previewSecretsStep = readWorkflowStep(previewWorkflow, 'Inspect preview Pages secrets');
    expect(productionSecretsStep).toContain('set -euo pipefail');
    expect(previewSecretsStep).toContain('set -euo pipefail');
    expect(productionSecretsStep).not.toContain('pages secret list --project-name "$CF_PAGES_PROJECT" || true');
    expect(previewSecretsStep).not.toContain('pages secret list --project-name "$CF_PAGES_PROJECT" --env preview || true');
    expectTextInOrder(productionSecretsStep, [
      'echo "missing-required=$missing_required" >> "$GITHUB_OUTPUT"',
      'if [ "$missing_required" != "(none)" ]; then',
      'Missing required production Pages secrets',
      'exit 1',
    ]);
    expectTextInOrder(previewSecretsStep, [
      'echo "missing-required=$missing_required" >> "$GITHUB_OUTPUT"',
      'if [ "$missing_required" != "(none)" ]; then',
      'Missing required preview Pages secrets',
      'exit 1',
    ]);
    expect(productionWorkflow).not.toContain('node node_modules/playwright/cli.js test --config=playwright.smoke.config.ts --grep');
    expect(previewWorkflow).not.toContain('node node_modules/playwright/cli.js test --config=playwright.smoke.config.ts --grep');

    // README is an entry point; detailed release instructions have one owner.
    expect(readme).toContain('./docs/deployment-ops-runbook.md');
    expect(readme).toContain('./docs/environment-setup.md');
    expect(readme).toContain('release:gate:local-only');
    expect(readme).toContain('release:gate:remote-readonly');
    expect(readme).toContain('npm run security:audit');
    const setupReference = readText('docs/environment-setup.md');
    expect(setupReference).toContain('npm run release:gate:local');
    expect(setupReference).toContain('node scripts/run-smoke-tests.mjs --suite full');
    expect(runbook).toContain('npm run release:gate:local');
    expect(runbook).toContain('`security:audit`');
    expect(runbook).toContain('node scripts/run-smoke-tests.mjs --suite full');
    expect(runbook).toContain('content QA gate');
    expect(runbook).toContain('source ledger gate');
    expect(runbook).toContain('B2B activation integrity gate');
    expect(runbook).toContain('ops:production-baseline:d1');
  });

  it.each([
    {
      environment: 'production',
      workflow: '.github/workflows/deploy-pages.yml',
      expectedCount: 5,
      evidence: ['start-first-home', '/api/session', 'business-role-preview-instructor', 'business-role-preview-group-admin', 'business-role-preview-service-admin', 'admin-demo-password', '/admin-access'],
    },
    {
      environment: 'preview',
      workflow: '.github/workflows/deploy-pages-preview.yml',
      expectedCount: 4,
      evidence: ['start-first-home', '/api/session', 'preview-deployment-banner', 'writing-student-section'],
    },
  ])('selects every intended $environment deployed smoke from registered test declarations', ({ environment, workflow, expectedCount, evidence }) => {
    const step = readWorkflowStep(readText(workflow), `Run deployed ${environment} smoke`);
    expect(step).toContain('--suite sentinel');
    const grep = step.match(/--grep "([^"\n]+)"/)?.[1];
    expect(grep).toBeDefined();
    const selectors = grep!.split('|');
    expect(selectors).toHaveLength(expectedCount);
    expect(new Set(selectors).size).toBe(expectedCount);

    const registeredTests = readArrayConst(readText('scripts/run-smoke-tests.mjs'), 'sentinelFiles')
      .flatMap(readSmokeTestDeclarations);
    // Each alternative must select one real test; a partially stale grep must fail.
    for (const selector of selectors) {
      const matches = registeredTests.filter(({ title }) => new RegExp(selector).test(title));
      expect(matches, `${environment} selector: ${selector}`).toHaveLength(1);
    }
    const selected = registeredTests.filter(({ title }) => new RegExp(grep!).test(title));
    expect(selected).toHaveLength(expectedCount);
    expect(selected.every(({ file }) => file === 'tests/smoke/public.smoke.spec.ts')).toBe(true);
    // Keep the public role guards and preview read checks when tests are renamed.
    const selectedBodies = selected.map(({ body }) => body).join('\n');
    for (const marker of evidence) expect(selectedBodies).toContain(marker);
  });

  it('keeps production and preview deploys on the protected main path with pre-deploy runtime metadata', () => {
    const productionWorkflow = readText('.github/workflows/deploy-pages.yml');
    const previewWorkflow = readText('.github/workflows/deploy-pages-preview.yml');

    // A new main push must not interrupt a release between migration and deployment.
    expect(productionWorkflow).toMatch(/group: pages-production\n\s+cancel-in-progress: false/);
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

  it('publishes only aggregate content QA evidence in each deployment environment', () => {
    for (const [workflow, environment] of [
      ['.github/workflows/deploy-pages.yml', 'production'],
      ['.github/workflows/deploy-pages-preview.yml', 'preview'],
    ]) {
      const step = readWorkflowStep(readText(workflow), `Generate ${environment} content QA report`);
      expect(step).toContain('--summary-only');
      expect(step).not.toContain('--raw-output');
    }
  });

  it('records the recovery bookmark before migration even if a later deployment step fails', () => {
    const workflow = readText('.github/workflows/deploy-pages.yml');
    const bookmarkStep = readWorkflowStep(workflow, 'Capture production D1 recovery bookmark');
    expect(bookmarkStep).toContain('$GITHUB_STEP_SUMMARY');
    expect(bookmarkStep).toContain('$bookmark');
    expectTextInOrder(workflow, [
      'name: Capture production D1 recovery bookmark',
      '## Production D1 Recovery Bookmark',
      'name: Apply remote D1 migrations',
    ]);
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
