import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

export const PRODUCTION_ENTRY_POINTS = [
  'index.tsx',
  'functions/api/[[path]].ts',
];

export const PRODUCTION_SOURCE_ROOTS = [
  'components',
  'config',
  'contracts',
  'data',
  'domains',
  'functions',
  'hooks',
  'services',
  'shared',
  'types',
  'utils',
];

const ROOT_SOURCE_FILES = [
  'App.tsx',
  'index.tsx',
  'types.ts',
];

const SOURCE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
];

const isProductionSourceFile = (filePath) => (
  SOURCE_EXTENSIONS.some((extension) => filePath.endsWith(extension))
  && !filePath.endsWith('.d.ts')
  && !/\.(?:test|spec)\.[^.]+$/.test(filePath)
);

const toPosixRelativePath = (root, absolutePath) => (
  path.relative(root, absolutePath).split(path.sep).join('/')
);

const walkSourceDirectory = async (root, relativeDirectory, files) => {
  const absoluteDirectory = path.join(root, relativeDirectory);
  let entries;
  try {
    entries = await fs.readdir(absoluteDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }

  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      await walkSourceDirectory(root, relativePath, files);
      continue;
    }
    if (entry.isFile() && isProductionSourceFile(relativePath)) {
      files.add(toPosixRelativePath(root, path.join(root, relativePath)));
    }
  }
};

export const collectProductionSourceFiles = async (root = process.cwd()) => {
  const resolvedRoot = path.resolve(root);
  const files = new Set();

  for (const relativePath of ROOT_SOURCE_FILES) {
    try {
      const stats = await fs.stat(path.join(resolvedRoot, relativePath));
      if (stats.isFile()) files.add(relativePath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  for (const relativeDirectory of PRODUCTION_SOURCE_ROOTS) {
    await walkSourceDirectory(resolvedRoot, relativeDirectory, files);
  }

  return [...files].sort();
};

const resolveRelativeImport = ({ root, importer, specifier, sourceFiles }) => {
  const cleanSpecifier = specifier.split(/[?#]/, 1)[0];
  const unresolvedPath = cleanSpecifier.startsWith('@/')
    ? path.resolve(root, cleanSpecifier.slice(2))
    : cleanSpecifier.startsWith('.')
      ? path.resolve(path.dirname(path.join(root, importer)), cleanSpecifier)
      : null;
  if (!unresolvedPath) return null;

  const relativeUnresolvedPath = path.relative(root, unresolvedPath);
  if (relativeUnresolvedPath === '..' || relativeUnresolvedPath.startsWith(`..${path.sep}`)) {
    return null;
  }

  const candidates = [];
  const extension = path.extname(unresolvedPath);
  if (extension) {
    candidates.push(unresolvedPath);
    if (extension === '.js' || extension === '.jsx' || extension === '.mjs') {
      const withoutExtension = unresolvedPath.slice(0, -extension.length);
      candidates.push(`${withoutExtension}.ts`, `${withoutExtension}.tsx`);
    }
  } else {
    SOURCE_EXTENSIONS.forEach((sourceExtension) => {
      candidates.push(`${unresolvedPath}${sourceExtension}`);
    });
    SOURCE_EXTENSIONS.forEach((sourceExtension) => {
      candidates.push(path.join(unresolvedPath, `index${sourceExtension}`));
    });
  }

  for (const candidate of candidates) {
    const relativeCandidate = toPosixRelativePath(root, candidate);
    if (sourceFiles.has(relativeCandidate)) return relativeCandidate;
  }
  return null;
};

const isImportMeta = (node) => (
  ts.isMetaProperty(node)
  && node.keywordToken === ts.SyntaxKind.ImportKeyword
);

const isImportMetaUrl = (node) => (
  ts.isPropertyAccessExpression(node)
  && node.name.text === 'url'
  && isImportMeta(node.expression)
);

const collectStaticModuleReferences = (source, fileName) => {
  const specifiers = new Set(
    ts.preProcessFile(source, true, true).importedFiles.map(({ fileName: importedFile }) => importedFile),
  );
  const dynamicPatterns = [];
  const importGlobPatterns = [];
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') || fileName.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const visit = (node) => {
    if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isTemplateExpression(node.arguments[0])
    ) {
      const template = node.arguments[0];
      const parts = [template.head.text, ...template.templateSpans.map((span) => span.literal.text)];
      if (parts[0].startsWith('.') || parts[0].startsWith('@/')) {
        dynamicPatterns.push(parts);
      }
    }
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'glob'
      && isImportMeta(node.expression.expression)
      && node.arguments.length >= 1
    ) {
      const globInput = node.arguments[0];
      const globNodes = ts.isArrayLiteralExpression(globInput) ? globInput.elements : [globInput];
      globNodes.forEach((globNode) => {
        if (ts.isStringLiteral(globNode) || ts.isNoSubstitutionTemplateLiteral(globNode)) {
          importGlobPatterns.push(globNode.text);
        }
      });
    }
    if (
      ts.isNewExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'URL'
      && node.arguments?.length >= 2
      && (ts.isStringLiteral(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))
      && isImportMetaUrl(node.arguments[1])
    ) {
      specifiers.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return {
    specifiers: [...specifiers],
    dynamicPatterns,
    importGlobPatterns,
  };
};

const escapeRegularExpression = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const matchesDynamicImportPattern = ({ root, importer, candidate, parts }) => {
  const importerDirectory = path.dirname(path.join(root, importer));
  const absoluteCandidate = path.join(root, candidate);
  const relativeCandidate = path.relative(importerDirectory, absoluteCandidate).split(path.sep).join('/');
  const relativeSpecifier = relativeCandidate.startsWith('.') ? relativeCandidate : `./${relativeCandidate}`;
  const aliasSpecifier = `@/${candidate}`;
  const queryFreeParts = [...parts];
  const lastPart = queryFreeParts.at(-1) || '';
  queryFreeParts[queryFreeParts.length - 1] = lastPart.split(/[?#]/, 1)[0];
  const pattern = new RegExp(`^${queryFreeParts.map(escapeRegularExpression).join('[^/]+')}$`);
  return pattern.test(relativeSpecifier) || pattern.test(aliasSpecifier);
};

const globToRegularExpression = (glob) => {
  let source = '^';
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (character === '*' && glob[index + 1] === '*') {
      const followedBySlash = glob[index + 2] === '/';
      source += followedBySlash ? '(?:.*/)?' : '.*';
      index += followedBySlash ? 2 : 1;
      continue;
    }
    if (character === '*') {
      source += '[^/]*';
      continue;
    }
    if (character === '?') {
      source += '[^/]';
      continue;
    }
    source += escapeRegularExpression(character);
  }
  return new RegExp(`${source}$`);
};

const matchesImportGlobPatterns = ({ root, importer, candidate, patterns }) => {
  if (patterns.length === 0) return false;
  const importerDirectory = path.dirname(path.join(root, importer));
  const absoluteCandidate = path.join(root, candidate);
  const relativeCandidate = path.relative(importerDirectory, absoluteCandidate).split(path.sep).join('/');
  const relativeSpecifier = relativeCandidate.startsWith('.') ? relativeCandidate : `./${relativeCandidate}`;
  const aliasSpecifier = `@/${candidate}`;
  const positivePatterns = patterns.filter((pattern) => !pattern.startsWith('!'));
  const negativePatterns = patterns.filter((pattern) => pattern.startsWith('!')).map((pattern) => pattern.slice(1));
  const matches = (pattern) => {
    const queryFreePattern = pattern.split(/[?#]/, 1)[0];
    const regularExpression = globToRegularExpression(queryFreePattern);
    return regularExpression.test(relativeSpecifier) || regularExpression.test(aliasSpecifier);
  };
  return positivePatterns.some(matches) && !negativePatterns.some(matches);
};

export const buildRelativeImportGraph = async (root = process.cwd()) => {
  const resolvedRoot = path.resolve(root);
  const sourceFileList = await collectProductionSourceFiles(resolvedRoot);
  const sourceFiles = new Set(sourceFileList);
  const graph = new Map();

  for (const relativePath of sourceFileList) {
    const source = await fs.readFile(path.join(resolvedRoot, relativePath), 'utf8');
    const dependencies = new Set();
    const references = collectStaticModuleReferences(source, relativePath);
    references.specifiers.forEach((specifier) => {
      const dependency = resolveRelativeImport({
        root: resolvedRoot,
        importer: relativePath,
        specifier,
        sourceFiles,
      });
      if (dependency) dependencies.add(dependency);
    });
    references.dynamicPatterns.forEach((parts) => {
      sourceFileList.forEach((candidate) => {
        if (matchesDynamicImportPattern({
          root: resolvedRoot,
          importer: relativePath,
          candidate,
          parts,
        })) {
          dependencies.add(candidate);
        }
      });
    });
    if (references.importGlobPatterns.length > 0) {
      sourceFileList.forEach((candidate) => {
        if (matchesImportGlobPatterns({
          root: resolvedRoot,
          importer: relativePath,
          candidate,
          patterns: references.importGlobPatterns,
        })) {
          dependencies.add(candidate);
        }
      });
    }
    graph.set(relativePath, [...dependencies].sort());
  }

  return graph;
};

export const findUnreachableProductionSources = async (root = process.cwd()) => {
  const resolvedRoot = path.resolve(root);
  const graph = await buildRelativeImportGraph(resolvedRoot);
  const missingEntryPoints = PRODUCTION_ENTRY_POINTS.filter((entryPoint) => !graph.has(entryPoint));
  if (missingEntryPoints.length > 0) {
    throw new Error(`Missing production entry point(s): ${missingEntryPoints.join(', ')}`);
  }

  const reachable = new Set();
  const queue = [...PRODUCTION_ENTRY_POINTS];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || reachable.has(current)) continue;
    reachable.add(current);
    (graph.get(current) || []).forEach((dependency) => {
      if (!reachable.has(dependency)) queue.push(dependency);
    });
  }

  return [...graph.keys()].filter((relativePath) => !reachable.has(relativePath)).sort();
};

export const runUnusedSourceCheck = async (root = process.cwd()) => {
  const unreachable = await findUnreachableProductionSources(root);
  if (unreachable.length === 0) {
    console.log('[quality:unused] All production sources are reachable from the declared entry points.');
    return 0;
  }

  console.error(`[quality:unused] Found ${unreachable.length} unreachable production source file(s):`);
  unreachable.forEach((relativePath) => console.error(`- ${relativePath}`));
  console.error('[quality:unused] Import each file from a production entry graph or remove the obsolete source.');
  return 1;
};

const isMainModule = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  try {
    process.exitCode = await runUnusedSourceCheck();
  } catch (error) {
    console.error(`[quality:unused] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
