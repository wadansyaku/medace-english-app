import { access, lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalWranglerProject } from '../scripts/_shared/local-wrangler-project.mjs';
import { GoogleGenAI } from './fixtures/writingLiveProviderMock.js';

const projects = [];
afterEach(async () => {
  await Promise.all(projects.splice(0).map((project) => project.cleanup()));
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const createProject = async (options) => {
  const project = await createLocalWranglerProject(options);
  projects.push(project);
  return project;
};
const sourceSnapshot = async () => {
  const sourceDir = path.join(process.cwd(), 'functions');
  const entries = await readdir(sourceDir, { recursive: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const sourcePath = path.join(sourceDir, entry);
    return (await lstat(sourcePath)).isFile() ? [entry, await readFile(sourcePath)] : null;
  }));
  return new Map(files.filter(Boolean));
};

describe('local writing provider mock isolation', () => {
  it('keeps the default project linked to the unchanged production Functions', async () => {
    vi.stubEnv('MEDACE_LOCAL_AI_BINDING', '0');
    const project = await createProject();
    expect((await lstat(path.join(project.cwd, 'functions'))).isSymbolicLink()).toBe(true);
    expect(await readFile(path.join(project.cwd, 'functions/_shared/writing-ai-adapter.ts'), 'utf8'))
      .toContain("import { GoogleGenAI, Type } from '@google/genai';");
    await expect(access(path.join(project.cwd, 'functions/_shared/writing-live-provider-mock.js'))).rejects.toThrow();
  });

  // Comparing the entire temporary Functions tree can exceed the ordinary 5s
  // unit limit when TypeScript/build or other suites also use the filesystem.
  it('copies Functions and alters only three temporary files without adding a global AI key or secret files', async () => {
    vi.stubEnv('MEDACE_LOCAL_AI_BINDING', '1');
    const before = await sourceSnapshot();
    const project = await createProject({ writingProviderMock: true });
    expect(project.cwd).not.toBe(process.cwd());
    expect((await lstat(path.join(project.cwd, 'functions'))).isSymbolicLink()).toBe(false);
    const modified = new Set(['_shared/writing-ai.ts', '_shared/writing-ai-adapter.ts', '_shared/writing-ai-capabilities.ts']);
    for (const [entry, source] of before) {
      const temporarySource = await readFile(path.join(project.cwd, 'functions', entry));
      expect(temporarySource.equals(source), entry).toBe(!modified.has(entry));
    }
    expect(await sourceSnapshot()).toEqual(before);
    const config = JSON.parse(await readFile(path.join(project.cwd, 'wrangler.jsonc'), 'utf8'));
    expect(config.ai).toBeUndefined();
    expect(Object.values(config.env || {}).every((environment) => !environment.ai)).toBe(true);
    expect(JSON.stringify(config)).not.toContain('synthetic-writing-test-key');
    for (const entry of ['.dev.vars', '.env', '.env.local']) {
      await expect(access(path.join(project.cwd, entry))).rejects.toThrow();
    }
    expect(await readFile(path.join(project.cwd, 'functions/_shared/ai-actions.ts'), 'utf8'))
      .toContain("from '@google/genai'");
  }, 15_000);

  it('runs the actual live adapter parser, policy, metering and manual-text path without network', async () => {
    const noNetwork = vi.fn(() => { throw new Error('Unexpected network access.'); });
    vi.stubGlobal('fetch', noNetwork);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const project = await createProject({ writingProviderMock: true });
    const compiled = await build({
      entryPoints: [path.join(project.cwd, 'functions/_shared/writing-ai.ts')],
      bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
    });
    const facade = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
    const usage = [];
    let budgetTotal = 0;
    const env = { DB: { prepare: (sql) => ({ bind: (...values) => ({
      first: async () => ({ total: budgetTotal }),
      run: async () => { if (sql.includes('INSERT INTO ai_usage_events')) usage.push(values); return {}; },
    }) }) } };
    const user = { id: 'synthetic-student', subscription_plan: 'TOB_PAID', role: 'STUDENT' };
    const template = { examCategory: 'EIKEN', title: 'Opinion', promptBase: 'Give two reasons.', guidance: 'Use an example.', sampleTopic: 'school life' };
    const prompt = await facade.generateWritingPrompt(env, user, template, 'Synthetic Student', 'tablets in class');
    expect(prompt).toMatchObject({ promptTitle: 'Synthetic writing task: tablets in class', provider: 'GEMINI', provenance: { mode: 'live' } });
    const assignment = { ...prompt, id: 'synthetic-assignment', wordCountMin: 40, wordCountMax: 120 };
    const ocr = await facade.runWritingOcr(env, user, assignment, [{ fileName: 'test.png', mimeType: 'image/png', base64Data: 'dGVzdA==' }]);
    expect(ocr).toMatchObject({ confidence: 0.96, provider: 'GEMINI', provenance: { mode: 'live' } });
    const evaluations = await facade.runWritingEvaluations(env, user, assignment, ocr.transcript);
    expect(evaluations).toHaveLength(1);
    expect(evaluations[0]).toMatchObject({ provider: 'GEMINI', isDefault: true, correctedDraft: ocr.transcript, provenance: { mode: 'live' } });
    const manual = await facade.runWritingOcr(env, user, assignment, [], 'My manual test draft.');
    expect(manual).toMatchObject({ transcript: 'My manual test draft.', provenance: { notes: 'manual-transcript', model: 'manual-transcript' } });
    expect(usage.map((values) => values[1])).toEqual(['generateWritingPrompt', 'ocrWritingSubmission', 'evaluateWritingSubmission', 'ocrWritingSubmission']);
    expect(usage.map((values) => values[6])).toEqual([1, 1, 1, 0]);
    await expect(facade.generateWritingPrompt(env, { ...user, subscription_plan: 'TOC_FREE' }, template, 'Student'))
      .rejects.toMatchObject({ status: 403 });
    budgetTotal = 40000;
    await expect(facade.runWritingEvaluations(env, user, assignment, ocr.transcript)).rejects.toMatchObject({ status: 429 });
    expect(usage).toHaveLength(4);
    expect(noNetwork).not.toHaveBeenCalled();
    expect(env).not.toHaveProperty('GEMINI_API_KEY');
    expect(env).not.toHaveProperty('WRITING_AI_MODE');
  });

  it('rejects unexpected provider requests and keys rather than reaching a real provider', async () => {
    const noNetwork = vi.fn(() => { throw new Error('Unexpected network access.'); });
    vi.stubGlobal('fetch', noNetwork);
    expect(() => new GoogleGenAI({ apiKey: 'not-a-test-key' })).toThrow('synthetic test key');
    const provider = new GoogleGenAI({ apiKey: 'synthetic-writing-test-key' });
    await expect(provider.models.generateContent({ model: 'unexpected-model' })).rejects.toThrow('Unsupported');
    await expect(provider.models.generateContent({ model: 'gemini-2.5-flash', config: {
      responseMimeType: 'application/json', responseSchema: { required: ['not-writing'] },
    } })).rejects.toThrow('Unsupported');
    expect(noNetwork).not.toHaveBeenCalled();
  });
});
