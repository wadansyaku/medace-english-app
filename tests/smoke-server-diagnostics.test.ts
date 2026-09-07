import { spawnSync } from 'node:child_process';
import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { classifyWranglerFailureLog, readSmokeServerDiagnostic } from '../scripts/_shared/smoke-server-diagnostics.mjs';

const directories: string[] = [];
const secretFixture = 'PRIVATE_CREDENTIAL_FIXTURE';
const materialFixture = 'PRIVATE_MATERIAL_TEXT_FIXTURE';
const privateLog = `Authorization: Bearer ${secretFixture}\nrequest body: ${materialFixture}\nError in ProxyController: Error inside ProxyWorker\n  cause: { message: 'Network connection lost.' }\n`;
const createDirectory = async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'medace-diagnostic-test-'));
  directories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('private smoke server diagnostics', () => {
  it('reports fixed observed signatures without retaining raw error values', () => {
    expect(classifyWranglerFailureLog(privateLog)).toEqual(['PROXY_CONNECTION_LOST']);
    expect(classifyWranglerFailureLog('The Workers runtime crashed unexpectedly and is being restarted (crash #1). SQLITE_BUSY'))
      .toEqual(['RUNTIME_CRASH', 'SQLITE_BUSY']);
    expect(classifyWranglerFailureLog(`unrecognized failure: ${secretFixture}`)).toEqual(['UNKNOWN']);
    expect(classifyWranglerFailureLog('Network connection lost.')).toEqual(['UNKNOWN']);
  });

  it('bounds log inspection and keeps missing or unreadable evidence unknown', async () => {
    const directory = await createDirectory();
    const logPath = path.join(directory, `${secretFixture}.log`);
    await writeFile(logPath, `${'x'.repeat(300 * 1024)}\n${privateLog}`);
    const diagnostic = await readSmokeServerDiagnostic(logPath);
    expect(diagnostic).toEqual({
      type: 'smoke_server_diagnostic', logStatus: 'read', inspectedBytes: 256 * 1024,
      truncated: true, signatures: ['PROXY_CONNECTION_LOST'],
    });
    expect(await readSmokeServerDiagnostic(path.join(directory, 'missing.log'))).toMatchObject({ logStatus: 'missing', signatures: ['UNKNOWN'] });
    expect(await readSmokeServerDiagnostic(directory)).toMatchObject({ logStatus: 'unreadable', signatures: ['UNKNOWN'] });
    expect(JSON.stringify(diagnostic)).not.toContain(secretFixture);
    expect(JSON.stringify(diagnostic)).not.toContain(materialFixture);
  });

  it.each([false, true])('uses a private temporary log and cleans it after requestedStop=%s', async (requestedStop) => {
    const directory = await createDirectory();
    await mkdir(path.join(directory, 'scripts/_shared'), { recursive: true });
    await mkdir(path.join(directory, 'node_modules/wrangler/bin'), { recursive: true });
    for (const script of ['start-smoke-server.mjs', '_shared/tooling.mjs', '_shared/local-wrangler-project.mjs', '_shared/smoke-server-diagnostics.mjs']) {
      await copyFile(new URL(`../scripts/${script}`, import.meta.url), path.join(directory, 'scripts', script));
    }
    await writeFile(path.join(directory, 'wrangler.jsonc'), '{}');
    // Execute the real wrapper and cleanup, with a fixture child instead of any
    // build, Cloudflare connection, or application server.
    await writeFile(path.join(directory, 'node_modules/wrangler/bin/wrangler.js'), `
      const fs = require('node:fs');
      if (process.argv.includes('pages')) {
        fs.writeFileSync(process.env.WRANGLER_LOG_PATH, ${JSON.stringify(privateLog)});
        fs.writeFileSync('observed.json', JSON.stringify({
          logPath: process.env.WRANGLER_LOG_PATH,
          level: process.env.WRANGLER_LOG,
          sanitize: process.env.WRANGLER_LOG_SANITIZE
        }));
        ${requestedStop ? "process.kill(process.ppid, 'SIGTERM'); setInterval(() => {}, 1000);" : 'process.exit(1);'}
      }
    `);
    const child = spawnSync(process.execPath, ['scripts/start-smoke-server.mjs'], {
      cwd: directory,
      env: {
        ...process.env,
        MEDACE_LOCAL_AI_BINDING: '0',
        WRANGLER_LOG: 'debug',
        WRANGLER_LOG_SANITIZE: 'false',
        WRANGLER_LOG_PATH: path.join(directory, 'must-not-be-used.log'),
      },
      encoding: 'utf8', timeout: 10_000,
    });
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(requestedStop ? 143 : 1);
    const output = `${child.stdout}\n${child.stderr}`;
    expect(output).not.toContain(secretFixture);
    expect(output).not.toContain(materialFixture);
    if (requestedStop) expect(output).not.toContain('smoke_server_diagnostic');
    else expect(output).toContain('"signatures":["PROXY_CONNECTION_LOST"]');
    const observed = JSON.parse(await readFile(path.join(directory, 'observed.json'), 'utf8'));
    expect(observed).toMatchObject({ level: 'info', sanitize: 'true' });
    expect(path.basename(observed.logPath)).toBe('wrangler-debug.log');
    expect(path.dirname(observed.logPath)).not.toBe(directory);
    await expect(access(path.dirname(observed.logPath))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(path.join(directory, 'must-not-be-used.log'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
