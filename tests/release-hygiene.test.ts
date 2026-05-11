import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

const readText = (relativePath: string): string => (
  fs.readFileSync(`${root}/${relativePath}`, 'utf8')
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
    expect(readme).toContain('cf:doctor` の `Summary` が `error=0`');
    expect(runbook).toContain('cf:doctor` の `Summary` が `error=0`');
    expect(productionWorkflow).toMatch(/run: npm run cf:doctor/);
    expect(previewWorkflow).toMatch(/run: npm run cf:doctor/);
  });
});
