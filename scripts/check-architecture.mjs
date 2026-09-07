import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { buildRelativeImportGraph } from './check-unused-source.mjs';

const BROWSER_ROOTS = new Set(['components', 'hooks', 'services']);
const SHARED_ROOTS = new Set(['config', 'contracts', 'data', 'domains', 'shared', 'types', 'utils']);
const browserEntry = (file) => file === 'App.tsx' || file === 'index.tsx';
const layerOf = (file) => {
  const directory = file.split('/')[0];
  if (browserEntry(file) || BROWSER_ROOTS.has(directory)) return 'browser';
  if (directory === 'functions') return 'server';
  if (file === 'types.ts' || SHARED_ROOTS.has(directory)) return 'shared';
  return null;
};

// Type imports obey the same boundary: portable models belong in contracts/shared,
// so a database or UI type cannot quietly couple the other runtime to its internals.
export const findArchitectureBoundaryViolations = (graph) => {
  const violations = [];
  for (const [source, dependencies] of graph) {
    const sourceLayer = layerOf(source);
    for (const dependency of dependencies) {
      const targetLayer = layerOf(dependency);
      if (
        (sourceLayer === 'browser' && targetLayer === 'server')
        || (sourceLayer === 'server' && targetLayer === 'browser')
        || (sourceLayer === 'shared' && (targetLayer === 'browser' || targetLayer === 'server'))
      ) {
        violations.push({ source, dependency, sourceLayer, targetLayer });
      }
    }
  }
  return violations.sort((a, b) => `${a.source}:${a.dependency}`.localeCompare(`${b.source}:${b.dependency}`));
};

// Tarjan's algorithm reports each strongly connected group once, including self-imports.
export const findImportCycles = (graph) => {
  let nextIndex = 0;
  const indices = new Map();
  const lowLinks = new Map();
  const stack = [];
  const active = new Set();
  const cycles = [];

  const visit = (source) => {
    indices.set(source, nextIndex);
    lowLinks.set(source, nextIndex);
    nextIndex += 1;
    stack.push(source);
    active.add(source);

    for (const dependency of graph.get(source) || []) {
      if (!indices.has(dependency)) {
        visit(dependency);
        lowLinks.set(source, Math.min(lowLinks.get(source), lowLinks.get(dependency)));
      } else if (active.has(dependency)) {
        lowLinks.set(source, Math.min(lowLinks.get(source), indices.get(dependency)));
      }
    }

    if (lowLinks.get(source) !== indices.get(source)) return;
    const component = [];
    let member;
    do {
      member = stack.pop();
      active.delete(member);
      component.push(member);
    } while (member !== source);
    if (component.length > 1 || (graph.get(source) || []).includes(source)) {
      cycles.push(component.sort());
    }
  };

  for (const source of graph.keys()) {
    if (!indices.has(source)) visit(source);
  }
  return cycles.sort((a, b) => a[0].localeCompare(b[0]));
};

export const inspectArchitecture = async (root = process.cwd()) => {
  const graph = await buildRelativeImportGraph(root);
  const boundaryViolations = findArchitectureBoundaryViolations(graph);
  for (const source of graph.keys()) {
    const sourceLayer = layerOf(source);
    if (sourceLayer === 'browser') continue;
    const content = await fs.readFile(path.resolve(root, source), 'utf8');
    const importedFiles = ts.preProcessFile(content, true, true).importedFiles;
    for (const { fileName: dependency } of importedFiles) {
      if (/^(?:react|react-dom)(?:\/|$)/.test(dependency)) {
        boundaryViolations.push({ source, dependency, sourceLayer, targetLayer: 'browser' });
      }
    }
  }
  return {
    sourceCount: graph.size,
    boundaryViolations,
    cycles: findImportCycles(graph),
  };
};

export const runArchitectureCheck = async (root = process.cwd()) => {
  const result = await inspectArchitecture(root);
  for (const violation of result.boundaryViolations) {
    console.error(`[quality:architecture] Invalid ${violation.sourceLayer} -> ${violation.targetLayer} import: ${violation.source} -> ${violation.dependency}`);
  }
  for (const cycle of result.cycles) {
    console.error(`[quality:architecture] Circular import group: ${cycle.join(', ')}`);
  }
  if (result.boundaryViolations.length > 0 || result.cycles.length > 0) return 1;
  console.log(`[quality:architecture] ${result.sourceCount} production sources: runtime boundaries valid, no circular imports.`);
  return 0;
};

const isMainModule = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  try {
    process.exitCode = await runArchitectureCheck();
  } catch (error) {
    console.error(`[quality:architecture] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
