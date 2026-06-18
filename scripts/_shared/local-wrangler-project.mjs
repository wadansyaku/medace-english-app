import { lstat, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const cwd = process.cwd();

const LOCAL_PROJECT_LINKS = [
  'dist',
  'functions',
  'shared',
  'utils',
  'config',
  'contracts',
  'types.ts',
  'node_modules',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
];

const removeAiBindings = (config) => {
  const nextConfig = { ...config };
  delete nextConfig.$schema;
  delete nextConfig.ai;

  if (nextConfig.env && typeof nextConfig.env === 'object') {
    nextConfig.env = Object.fromEntries(
      Object.entries(nextConfig.env).map(([name, envConfig]) => {
        if (!envConfig || typeof envConfig !== 'object') {
          return [name, envConfig];
        }
        const nextEnvConfig = { ...envConfig };
        delete nextEnvConfig.ai;
        return [name, nextEnvConfig];
      }),
    );
  }

  return nextConfig;
};

const linkProjectEntry = async (tempDir, entry) => {
  const source = path.join(cwd, entry);
  let stats;
  try {
    stats = await lstat(source);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  await symlink(source, path.join(tempDir, entry), stats.isDirectory() ? 'dir' : 'file');
};

export const createLocalWranglerProject = async () => {
  if (process.env.MEDACE_LOCAL_AI_BINDING === '1') {
    return {
      cwd,
      cleanup: async () => {},
    };
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'medace-wrangler-local-'));
  const config = JSON.parse(await readFile(path.join(cwd, 'wrangler.jsonc'), 'utf8'));
  await writeFile(
    path.join(tempDir, 'wrangler.jsonc'),
    `${JSON.stringify(removeAiBindings(config), null, 2)}\n`,
  );

  await Promise.all(LOCAL_PROJECT_LINKS.map((entry) => linkProjectEntry(tempDir, entry)));

  return {
    cwd: tempDir,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
};
