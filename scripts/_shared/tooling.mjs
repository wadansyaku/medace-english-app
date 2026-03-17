import path from 'node:path';

const cwd = process.cwd();

export const toolPaths = {
  playwright: path.join(cwd, 'node_modules', '@playwright', 'test', 'cli.js'),
  tsc: path.join(cwd, 'node_modules', 'typescript', 'bin', 'tsc'),
  vite: path.join(cwd, 'node_modules', 'vite', 'bin', 'vite.js'),
  vitest: path.join(cwd, 'node_modules', 'vitest', 'vitest.mjs'),
  wrangler: path.join(cwd, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
};

export const createNodeToolCommand = (toolName, args = []) => ({
  command: process.execPath,
  args: [toolPaths[toolName], ...args],
});
