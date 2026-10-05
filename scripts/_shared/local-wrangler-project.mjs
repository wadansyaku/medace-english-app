import { copyFile, cp, lstat, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
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

// Only the local test runners opt into this provider substitution. Production
// Functions and ordinary preview projects continue using their original adapter.
const copyFunctionsWithWritingProviderMock = async (tempDir) => {
  const functionsDir = path.join(tempDir, 'functions');
  await cp(path.join(cwd, 'functions'), functionsDir, { recursive: true });
  const adapterPath = path.join(functionsDir, '_shared/writing-ai-adapter.ts');
  const adapterSource = await readFile(adapterPath, 'utf8');
  const sdkImport = "import { GoogleGenAI, Type } from '@google/genai';";
  if (adapterSource.split(sdkImport).length !== 2) {
    throw new Error('Could not isolate the writing provider import for local tests.');
  }
  await copyFile(
    path.join(cwd, 'tests/fixtures/writingLiveProviderMock.js'),
    path.join(functionsDir, '_shared/writing-live-provider-mock.js'),
  );
  await writeFile(adapterPath, adapterSource.replace(sdkImport,
    "import { GoogleGenAI, Type } from './writing-live-provider-mock.js';"));

  const facadePath = path.join(functionsDir, '_shared/writing-ai.ts');
  const facadeSource = await readFile(facadePath, 'utf8');
  const adapterCall = 'createWritingAiAdapter(env, user, logContext)';
  if (facadeSource.split(adapterCall).length !== 4
    || facadeSource.split('  resolveWritingAiMode,\n').length !== 2
    || facadeSource.split('export { resolveWritingAiMode };').length !== 2) {
    throw new Error('Could not isolate the writing facade for local tests.');
  }
  await writeFile(facadePath, facadeSource
    .replace('  resolveWritingAiMode,\n', '')
    .replace('export { resolveWritingAiMode };', "// Synthetic provider responses exercise the real live adapter and persistence.\nexport const resolveWritingAiMode = (_env?: AppEnv) => 'live' as const;")
    .replaceAll(adapterCall, "createWritingAiAdapter({ ...env, WRITING_AI_MODE: 'live', GEMINI_API_KEY: 'synthetic-writing-test-key' }, user, logContext)"));
};

export const createLocalWranglerProject = async ({ writingProviderMock = false } = {}) => {
  if (!writingProviderMock && process.env.MEDACE_LOCAL_AI_BINDING === '1') {
    return {
      cwd,
      cleanup: async () => {},
    };
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'medace-wrangler-local-'));
  try {
    const config = JSON.parse(await readFile(path.join(cwd, 'wrangler.jsonc'), 'utf8'));
    await writeFile(
      path.join(tempDir, 'wrangler.jsonc'),
      `${JSON.stringify(removeAiBindings(config), null, 2)}\n`,
    );
    await Promise.all(LOCAL_PROJECT_LINKS
      .filter((entry) => !writingProviderMock || entry !== 'functions')
      .map((entry) => linkProjectEntry(tempDir, entry)));
    if (writingProviderMock) await copyFunctionsWithWritingProviderMock(tempDir);
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }

  return {
    cwd: tempDir,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
};
