import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROTECTED_TOP_LEVEL_DIRECTORIES = new Set([
  '.git',
  '.wrangler',
  'node_modules',
  'output',
  'tmp',
]);

const FIXED_TOP_LEVEL_ARTIFACT_KINDS = new Map([
  ['dist', 'directory'],
  ['_worker.bundle', 'file'],
  ['test-results', 'directory'],
  ['test-results-rerun', 'directory'],
]);

const normalizeRelativePath = (relativePath) => relativePath.split(path.sep).join('/');

const isProtectedPath = (relativePath) => {
  const segments = normalizeRelativePath(relativePath).split('/');
  return PROTECTED_TOP_LEVEL_DIRECTORIES.has(segments[0])
    || segments.some((segment) => segment.startsWith('.playwright'));
};

const isExpectedEntryKind = (entry, expectedKind) => (
  (expectedKind === 'directory' && entry.isDirectory())
  || (expectedKind === 'file' && entry.isFile())
);

const isFixedTopLevelArtifact = (entry) => {
  const expectedKind = FIXED_TOP_LEVEL_ARTIFACT_KINDS.get(entry.name);
  return Boolean(expectedKind) && isExpectedEntryKind(entry, expectedKind);
};

const isAllowedArtifactTarget = (relativePath) => {
  const normalized = normalizeRelativePath(relativePath);
  const segments = normalized.split('/');
  const basename = segments.at(-1) || '';
  return (
    (segments.length === 1 && FIXED_TOP_LEVEL_ARTIFACT_KINDS.has(basename))
    || basename === '.DS_Store'
    || basename === '__pycache__'
    || basename.endsWith('.pyc')
  );
};

const assertSafeTargetOnDisk = async (root, relativePath) => {
  assertSafeTarget(root, relativePath);
  const normalized = normalizeRelativePath(relativePath);
  const absolutePath = path.resolve(root, normalized);
  const [realRoot, realParent, stats] = await Promise.all([
    fs.realpath(root),
    fs.realpath(path.dirname(absolutePath)),
    fs.lstat(absolutePath),
  ]);
  const parentRelativeToRoot = path.relative(realRoot, realParent);
  if (
    parentRelativeToRoot === '..'
    || parentRelativeToRoot.startsWith(`..${path.sep}`)
    || stats.isSymbolicLink()
  ) {
    throw new Error(`Refusing symlinked cleanup target: ${relativePath}`);
  }

  const segments = normalized.split('/');
  const basename = segments.at(-1) || '';
  const fixedKind = segments.length === 1
    ? FIXED_TOP_LEVEL_ARTIFACT_KINDS.get(basename)
    : undefined;
  const validKind = fixedKind
    ? (fixedKind === 'directory' ? stats.isDirectory() : stats.isFile())
    : basename === '__pycache__'
      ? stats.isDirectory()
      : stats.isFile();
  if (!validKind) {
    throw new Error(`Refusing cleanup target with unexpected kind: ${relativePath}`);
  }
};

const assertSafeTarget = (root, relativePath) => {
  const normalized = normalizeRelativePath(relativePath);
  const absolutePath = path.resolve(root, normalized);
  const relativeToRoot = path.relative(root, absolutePath);
  if (
    !normalized
    || relativeToRoot === '..'
    || relativeToRoot.startsWith(`..${path.sep}`)
    || isProtectedPath(normalized)
    || !isAllowedArtifactTarget(normalized)
  ) {
    throw new Error(`Refusing unsafe cleanup target: ${relativePath}`);
  }
};

const collectRecursiveArtifacts = async (root, relativeDirectory, targets) => {
  const absoluteDirectory = path.join(root, relativeDirectory);
  const entries = await fs.readdir(absoluteDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const relativePath = normalizeRelativePath(path.join(relativeDirectory, entry.name));
    if (relativeDirectory === '' && isFixedTopLevelArtifact(entry)) continue;
    if (isProtectedPath(relativePath)) continue;

    if (entry.isFile() && entry.name === '.DS_Store') {
      targets.add(relativePath);
      continue;
    }
    if (entry.isDirectory() && entry.name === '__pycache__') {
      targets.add(relativePath);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.pyc')) {
      targets.add(relativePath);
      continue;
    }
    if (entry.isDirectory()) {
      await collectRecursiveArtifacts(root, relativePath, targets);
    }
  }
};

export const collectLocalArtifactTargets = async (root = process.cwd()) => {
  const resolvedRoot = path.resolve(root);
  const targets = new Set();
  const rootEntries = await fs.readdir(resolvedRoot, { withFileTypes: true });

  rootEntries.forEach((entry) => {
    if (isFixedTopLevelArtifact(entry)) targets.add(entry.name);
  });

  await collectRecursiveArtifacts(resolvedRoot, '', targets);
  const sortedTargets = [...targets].sort();
  for (const relativePath of sortedTargets) {
    await assertSafeTargetOnDisk(resolvedRoot, relativePath);
  }
  return sortedTargets;
};

export const cleanLocalArtifacts = async ({ root = process.cwd(), apply = false } = {}) => {
  const resolvedRoot = path.resolve(root);
  const targets = await collectLocalArtifactTargets(resolvedRoot);

  if (targets.length === 0) {
    console.log('[clean:artifacts] No safe local artifacts found.');
    return [];
  }

  console.log(`[clean:artifacts] ${apply ? 'Removing' : 'Dry run:'} ${targets.length} safe target(s).`);
  targets.forEach((relativePath) => console.log(`- ${relativePath}`));

  if (!apply) {
    console.log('[clean:artifacts] Nothing was deleted. Run `npm run clean:artifacts:apply` to apply this exact policy.');
    return targets;
  }

  for (const relativePath of targets) {
    await assertSafeTargetOnDisk(resolvedRoot, relativePath);
    await fs.rm(path.join(resolvedRoot, relativePath), { recursive: true, force: true });
  }
  console.log('[clean:artifacts] Cleanup complete. Protected local state was not traversed.');
  return targets;
};

const args = process.argv.slice(2);
const unknownArgs = args.filter((arg) => arg !== '--apply');
const isMainModule = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  if (unknownArgs.length > 0) {
    console.error(`[clean:artifacts] Unknown argument(s): ${unknownArgs.join(', ')}`);
    process.exitCode = 1;
  } else {
    try {
      await cleanLocalArtifacts({ apply: args.includes('--apply') });
    } catch (error) {
      console.error(`[clean:artifacts] ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
}
