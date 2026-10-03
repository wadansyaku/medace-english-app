import { spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const directories: string[] = [];
const scriptPath = fileURLToPath(new URL('../scripts/start-meeting-preview.mjs', import.meta.url));

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

const runPreview = async (mode: string) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'medace-meeting-lifecycle-'));
  directories.push(directory);
  const scratch = path.join(directory, 'scratch');
  await Promise.all([
    mkdir(scratch),
    mkdir(path.join(directory, 'node_modules/vite/bin'), { recursive: true }),
    mkdir(path.join(directory, 'node_modules/wrangler/bin'), { recursive: true }),
  ]);
  await writeFile(path.join(directory, 'wrangler.jsonc'), '{}');
  await writeFile(path.join(directory, 'import.sql'), 'SELECT 1;');
  await writeFile(path.join(directory, 'node_modules/vite/bin/vite.js'), 'process.exit(0);');
  await writeFile(path.join(directory, 'node_modules/wrangler/bin/wrangler.js'), `
    const fs = require('node:fs');
    if (process.argv.includes('pages')) {
      const mode = process.env.MEETING_PREVIEW_TEST_MODE;
      if (mode.startsWith('code:')) process.exit(Number(mode.slice(5)));
      if (mode.startsWith('signal:')) process.kill(process.pid, mode.slice(7));
      if (mode.startsWith('stop:')) {
        const signal = mode.slice(5);
        process.once(signal, () => {
          fs.writeFileSync('forwarded-signal.txt', signal);
          process.removeAllListeners(signal);
          process.kill(process.pid, signal);
        });
        process.kill(process.ppid, signal);
        setInterval(() => {}, 1000);
      }
    }
  `);
  // Keep the real wrapper and real OS child processes. Only substitute the
  // executable for the server-spawn failure, causing an actual ENOENT event.
  const preload = path.join(directory, 'observe-spawn.cjs');
  await writeFile(preload, `
    const childProcess = require('node:child_process');
    const fs = require('node:fs');
    const path = require('node:path');
    const realSpawn = childProcess.spawn;
    childProcess.spawn = (command, args, options) => {
      if (args.includes('pages')) {
        fs.writeFileSync('observed.json', JSON.stringify({
          localProject: args[args.indexOf('--cwd') + 1]
        }));
        if (process.env.MEETING_PREVIEW_TEST_MODE === 'spawn-error') {
          command = path.join(process.cwd(), 'missing-preview-executable');
        }
      }
      return realSpawn(command, args, options);
    };
    require('node:module').syncBuiltinESMExports();
  `);
  const state = path.join(directory, 'preview-state');
  const child = spawnSync(process.execPath, [
    '--require', preload, scriptPath,
    '--state', state, '--import', path.join(directory, 'import.sql'),
    '--dist', path.join(directory, 'preview-dist'), '--port', '41991',
  ], {
    cwd: directory,
    env: { ...process.env, TMPDIR: scratch, MEDACE_LOCAL_AI_BINDING: '0', MEETING_PREVIEW_TEST_MODE: mode },
    encoding: 'utf8', timeout: 10_000,
  });
  expect(child.error).toBeUndefined();
  const observed = JSON.parse(await readFile(path.join(directory, 'observed.json'), 'utf8'));
  await expect(access(observed.localProject)).rejects.toMatchObject({ code: 'ENOENT' });
  // Preview state belongs to the caller and survives stopping the server.
  await expect(access(state)).resolves.toBeUndefined();
  return { child, directory, output: `${child.stdout}\n${child.stderr}` };
};

describe('meeting preview server lifecycle', () => {
  it.each([0, 17])('returns the actual child exit code %s after cleanup', async code => {
    const { child } = await runPreview(`code:${code}`);
    expect(child.status).toBe(code);
  });

  it.each([['SIGINT', 130], ['SIGTERM', 143], ['SIGKILL', 137]] as const)(
    'reports unexpected child %s after cleanup', async (signal, status) => {
      const { child, output } = await runPreview(`signal:${signal}`);
      expect(child.status).toBe(status);
      expect(output).toContain(`signal=${signal}`);
    },
  );

  it('returns a failed OS spawn and still cleans the temporary project', async () => {
    const { child, output } = await runPreview('spawn-error');
    expect(child.status).toBe(1);
    expect(output).toContain('ENOENT');
  });

  it.each(['SIGINT', 'SIGTERM'])('treats requested %s as a normal stop', async signal => {
    const { child, directory, output } = await runPreview(`stop:${signal}`);
    expect(child.status).toBe(0);
    expect(await readFile(path.join(directory, 'forwarded-signal.txt'), 'utf8')).toBe(signal);
    expect(output).not.toContain('server failed');
  });
});
