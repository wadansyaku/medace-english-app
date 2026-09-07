import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  findUnreachableProductionSources,
} from '../scripts/check-unused-source.mjs';
import {
  cleanLocalArtifacts,
  collectLocalArtifactTargets,
} from '../scripts/clean-local-artifacts.mjs';

const temporaryRoots: string[] = [];

const createTemporaryRoot = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'medace-hygiene-test-'));
  temporaryRoots.push(root);
  return root;
};

const writeFixture = async (root: string, relativePath: string, content = '') => {
  const absolutePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content);
};

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => (
    fs.rm(root, { recursive: true, force: true })
  )));
});

describe('production source reachability', () => {
  it('follows static, re-exported, type-only, aliased, and dynamic literal internal imports', async () => {
    const root = await createTemporaryRoot();
    await writeFixture(root, 'index.tsx', "import App from './App'; import './styles.css'; void import('./components/Lazy');\n");
    await writeFixture(root, 'App.tsx', "import type { Model } from './types'; export { value } from './utils/value'; export { aliased } from '@/shared/aliased'; export default 1 as Model;\n");
    await writeFixture(root, 'types.ts', 'export type Model = number;\n');
    await writeFixture(root, 'utils/value.ts', 'export const value = 1;\n');
    await writeFixture(root, 'components/Lazy.tsx', "const panel = 'Alpha'; void import(`./panels/${panel}.ts`); import.meta.glob(['./glob/**/*.ts', '!./glob/private/**']); new Worker(new URL('./worker.ts', import.meta.url)); export default null;\n");
    await writeFixture(root, 'components/worker.ts', 'self.postMessage({ ready: true });\n');
    await writeFixture(root, 'components/panels/Alpha.ts', 'export const alpha = true;\n');
    await writeFixture(root, 'components/panels/Beta.ts', 'export const beta = true;\n');
    await writeFixture(root, 'components/glob/Gamma.ts', 'export const gamma = true;\n');
    await writeFixture(root, 'components/glob/nested/Delta.ts', 'export const delta = true;\n');
    await writeFixture(root, 'components/glob/private/Excluded.ts', 'export const excluded = true;\n');
    await writeFixture(root, 'components/Orphan.tsx', 'export default null;\n');
    await writeFixture(root, 'shared/aliased.ts', 'export const aliased = true;\n');
    await writeFixture(root, 'styles.css', 'body { color: black; }\n');
    await writeFixture(root, 'functions/api/[[path]].ts', "export { onRequest } from '../_shared/router';\n");
    await writeFixture(root, 'functions/_shared/router.ts', 'export const onRequest = () => new Response();\n');
    await writeFixture(root, 'scripts/not-a-production-candidate.mjs', 'export const ignored = true;\n');
    await writeFixture(root, 'tests/not-a-production-candidate.test.ts', 'export const ignored = true;\n');

    await expect(findUnreachableProductionSources(root)).resolves.toEqual([
      'components/Orphan.tsx',
      'components/glob/private/Excluded.ts',
    ]);
  });
});

describe('safe local artifact cleanup', () => {
  it('dry-runs and applies only the explicit regenerable artifact policy', async () => {
    const root = await createTemporaryRoot();
    const removable = [
      '.DS_Store',
      '_worker.bundle',
      'components/.DS_Store',
      'dist/app.js',
      'scripts/__pycache__/helper.cpython-311.pyc',
      'test-results-rerun/trace.zip',
      'test-results-rerun/.DS_Store',
      'test-results/result.json',
      'utils/cache.pyc',
    ];
    const protectedPaths = [
      '.playwright-cli/.DS_Store',
      '.wrangler/tmp/worker.pyc',
      'node_modules/example/.DS_Store',
      'output/.DS_Store',
      'tmp/.DS_Store',
    ];
    const userArtifacts = [
      'test-results-archive/notes.md',
      'test-results-user-notes.md',
    ];
    await Promise.all([...removable, ...protectedPaths, ...userArtifacts].map((relativePath) => (
      writeFixture(root, relativePath, 'fixture')
    )));
    await fs.writeFile(path.join(root, 'dist-file'), 'user artifact');

    await expect(collectLocalArtifactTargets(root)).resolves.toEqual([
      '.DS_Store',
      '_worker.bundle',
      'components/.DS_Store',
      'dist',
      'scripts/__pycache__',
      'test-results',
      'test-results-rerun',
      'utils/cache.pyc',
    ]);

    await cleanLocalArtifacts({ root, apply: false });
    await expect(fs.stat(path.join(root, 'dist/app.js'))).resolves.toBeDefined();

    await cleanLocalArtifacts({ root, apply: true });
    await Promise.all(removable.map(async (relativePath) => {
      await expect(fs.stat(path.join(root, relativePath))).rejects.toMatchObject({ code: 'ENOENT' });
    }));
    await Promise.all(protectedPaths.map(async (relativePath) => {
      await expect(fs.stat(path.join(root, relativePath))).resolves.toBeDefined();
    }));
    await Promise.all(userArtifacts.map(async (relativePath) => {
      await expect(fs.stat(path.join(root, relativePath))).resolves.toBeDefined();
    }));
  });

  it('does not follow artifact-shaped symlinks or remove wrong-kind names', async () => {
    const root = await createTemporaryRoot();
    await writeFixture(root, 'output/keep.txt', 'user output');
    await writeFixture(root, 'tmp/keep.txt', 'user temporary evidence');
    await fs.mkdir(path.join(root, 'components'), { recursive: true });
    await fs.symlink(path.join(root, 'output'), path.join(root, 'test-results'));
    await fs.symlink(path.join(root, 'tmp'), path.join(root, '_worker.bundle'));
    await fs.symlink(path.join(root, 'output/keep.txt'), path.join(root, 'components/.DS_Store'));
    await fs.symlink(path.join(root, 'output'), path.join(root, 'components/__pycache__'));
    await writeFixture(root, 'dist', 'user file with a directory-shaped name');
    await writeFixture(root, 'test-results-rerun', 'user file with a directory-shaped name');

    await expect(collectLocalArtifactTargets(root)).resolves.toEqual([]);
    await cleanLocalArtifacts({ root, apply: true });

    await expect(fs.readFile(path.join(root, 'output/keep.txt'), 'utf8')).resolves.toBe('user output');
    await expect(fs.readFile(path.join(root, 'tmp/keep.txt'), 'utf8')).resolves.toBe('user temporary evidence');
    await expect(fs.lstat(path.join(root, 'test-results'))).resolves.toMatchObject({});
    await expect(fs.lstat(path.join(root, '_worker.bundle'))).resolves.toMatchObject({});
    await expect(fs.lstat(path.join(root, 'components/.DS_Store'))).resolves.toMatchObject({});
    await expect(fs.lstat(path.join(root, 'components/__pycache__'))).resolves.toMatchObject({});
    await expect(fs.readFile(path.join(root, 'dist'), 'utf8')).resolves.toBe('user file with a directory-shaped name');
    await expect(fs.readFile(path.join(root, 'test-results-rerun'), 'utf8')).resolves.toBe('user file with a directory-shaped name');
  });
});
