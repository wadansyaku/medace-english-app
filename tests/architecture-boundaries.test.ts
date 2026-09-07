import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  findArchitectureBoundaryViolations,
  findImportCycles,
  inspectArchitecture,
} from '../scripts/check-architecture.mjs';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('production architecture boundaries', () => {
  it('allows both runtimes to consume portable domain contracts without reverse imports', () => {
    const graph = new Map([
      ['index.tsx', ['components/Dashboard.tsx']],
      ['components/Dashboard.tsx', ['services/learning.ts', 'shared/mission.ts']],
      ['services/learning.ts', ['contracts/storage.ts']],
      ['functions/api/[[path]].ts', ['functions/_shared/actions.ts']],
      ['functions/_shared/actions.ts', ['shared/mission.ts', 'contracts/storage.ts']],
      ['shared/mission.ts', ['types.ts', 'utils/date.ts']],
      ['contracts/storage.ts', ['types.ts']],
      ['utils/date.ts', []],
      ['types.ts', []],
    ]);

    expect(findArchitectureBoundaryViolations(graph)).toEqual([]);
    expect(findImportCycles(graph)).toEqual([]);
  });

  it('rejects client/server coupling and reverse imports from portable modules', () => {
    const graph = new Map([
      ['services/learning.ts', ['functions/_shared/actions.ts']],
      ['functions/_shared/actions.ts', ['hooks/useSession.ts', 'services/session.ts']],
      ['shared/model.ts', ['components/Dashboard.tsx', 'services/session.ts', 'functions/_shared/types.ts']],
      ['contracts/storage.ts', ['App.tsx']],
    ]);

    expect(findArchitectureBoundaryViolations(graph).map(({ source, dependency }) => [source, dependency])).toEqual([
      ['contracts/storage.ts', 'App.tsx'],
      ['functions/_shared/actions.ts', 'hooks/useSession.ts'],
      ['functions/_shared/actions.ts', 'services/session.ts'],
      ['services/learning.ts', 'functions/_shared/actions.ts'],
      ['shared/model.ts', 'components/Dashboard.tsx'],
      ['shared/model.ts', 'functions/_shared/types.ts'],
      ['shared/model.ts', 'services/session.ts'],
    ]);
  });

  it('detects type-only, alias and lazy imports plus React dependencies at the filesystem boundary', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'medace-architecture-test-'));
    temporaryRoots.push(root);
    const files = {
      'index.tsx': "void import('./services/client');",
      'services/client.ts': "import type { DbUser } from '@/functions/_shared/database';",
      'functions/_shared/database.ts': 'export interface DbUser { id: string }',
      'shared/view.ts': "import type { ReactNode } from 'react'; import { createPortal } from 'react-dom';",
      'functions/api/[[path]].ts': "export { onRequest } from '../_shared/actions';",
      'functions/_shared/actions.ts': "void import('../../components/Dashboard'); export const onRequest = () => new Response();",
      'components/Dashboard.tsx': 'export default null;',
    };
    for (const [relativePath, content] of Object.entries(files)) {
      await fs.mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
      await fs.writeFile(path.join(root, relativePath), content);
    }

    const result = await inspectArchitecture(root);
    expect(result.sourceCount).toBe(7);
    expect(result.cycles).toEqual([]);
    expect(result.boundaryViolations.map(({ source, dependency }) => `${source} -> ${dependency}`)).toEqual([
      'functions/_shared/actions.ts -> components/Dashboard.tsx',
      'services/client.ts -> functions/_shared/database.ts',
      'shared/view.ts -> react',
      'shared/view.ts -> react-dom',
    ]);
  });
});

describe('production import cycles', () => {
  it('finds disjoint cycles and self-imports without reporting acyclic callers', () => {
    const graph = new Map([
      ['components/App.tsx', ['shared/a.ts', 'shared/x.ts']],
      ['shared/a.ts', ['shared/b.ts']],
      ['shared/b.ts', ['shared/c.ts']],
      ['shared/c.ts', ['shared/a.ts']],
      ['shared/x.ts', ['shared/y.ts']],
      ['shared/y.ts', ['shared/x.ts']],
      ['shared/self.ts', ['shared/self.ts']],
      ['shared/leaf.ts', []],
    ]);

    expect(findImportCycles(graph)).toEqual([
      ['shared/a.ts', 'shared/b.ts', 'shared/c.ts'],
      ['shared/self.ts'],
      ['shared/x.ts', 'shared/y.ts'],
    ]);
  });
});
