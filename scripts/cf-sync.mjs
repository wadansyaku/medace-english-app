import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cwd = process.cwd();

const REQUIRED_GITHUB_VARIABLES = ['CLOUDFLARE_PAGES_PROJECT', 'CLOUDFLARE_D1_DATABASE'];
const REQUIRED_PAGES_SECRETS = ['ADMIN_DEMO_PASSWORD'];
const OPTIONAL_PAGES_SECRETS = ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'];

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
    },
    ...options,
  });

  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
};

const parseJsonc = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const parseGhListNames = (output) => output
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => line.split(/\s+/)[0])
  .filter(Boolean);

const parsePagesSecretNames = (output) => output
  .split('\n')
  .map((line) => line.match(/^\s*-\s([^:]+):/))
  .filter(Boolean)
  .map((match) => match[1]);

const getRepoSlug = () => {
  const result = run('git', ['remote', 'get-url', 'origin']);
  if (!result.ok || !result.stdout) return null;

  const remote = result.stdout;
  const httpsMatch = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
  return httpsMatch?.[1] || null;
};

const getAccountIdFromWhoami = (output) => {
  const match = output.match(/\b([a-f0-9]{32})\b/i);
  return match?.[1] || '';
};

const records = [];
const pushRecord = (status, label, detail) => {
  records.push({ status, label, detail });
};

const recordCommand = (label, result, detailOnSuccess) => {
  if (result.ok) {
    pushRecord('ok', label, detailOnSuccess || result.stdout || 'ok');
    return true;
  }
  pushRecord('error', label, result.stderr || result.stdout || `exit ${result.status}`);
  return false;
};

const isAlreadyOwnedR2BucketError = (result) => {
  const text = `${result.stdout}\n${result.stderr}`;
  return text.includes('already exists, and you own it') || text.includes('[code: 10004]');
};

const wranglerConfigPath = path.join(cwd, 'wrangler.jsonc');
const wranglerRaw = await fs.readFile(wranglerConfigPath, 'utf8');
const wranglerConfig = JSON.parse(parseJsonc(wranglerRaw));

const pagesProject = process.env.CLOUDFLARE_PAGES_PROJECT || wranglerConfig.name;
const d1Database = process.env.CLOUDFLARE_D1_DATABASE || wranglerConfig.d1_databases?.[0]?.database_name || '';
const r2Bindings = (wranglerConfig.r2_buckets || []).flatMap((bucket) => {
  const pairs = [];
  if (bucket.bucket_name) pairs.push({ env: 'production', name: bucket.bucket_name });
  if (bucket.preview_bucket_name) pairs.push({ env: 'preview', name: bucket.preview_bucket_name });
  return pairs;
});
const repoSlug = getRepoSlug();

pushRecord('info', 'Workspace', cwd);
pushRecord('info', 'GitHub repo', repoSlug || '(unable to detect from origin)');
pushRecord('info', 'Pages project', pagesProject);
pushRecord('info', 'D1 database', d1Database || '(missing in wrangler.jsonc)');
pushRecord('info', 'R2 buckets', r2Bindings.length > 0 ? r2Bindings.map((bucket) => `${bucket.env}:${bucket.name}`).join(', ') : '(none)');

const ghAuth = run('gh', ['auth', 'status']);
const wranglerAuth = run('npx', ['wrangler', 'whoami']);
const githubReady = recordCommand('GitHub auth', ghAuth, 'authenticated');
const cloudflareReady = recordCommand('Cloudflare auth', wranglerAuth, 'authenticated');
const detectedAccountId = wranglerAuth.ok ? getAccountIdFromWhoami(wranglerAuth.stdout) : '';

if (githubReady && repoSlug) {
  const repoVariables = new Map([
    ['CLOUDFLARE_PAGES_PROJECT', pagesProject],
    ['CLOUDFLARE_D1_DATABASE', d1Database],
  ]);

  for (const [name, value] of repoVariables) {
    if (!value) {
      pushRecord('error', `GitHub variable ${name}`, 'value is empty');
      continue;
    }
    const result = run('gh', ['variable', 'set', name, '--repo', repoSlug, '--body', value]);
    recordCommand(`GitHub variable ${name}`, result, value);
  }

  const ghSecrets = run('gh', ['secret', 'list', '--repo', repoSlug]);
  const existingSecrets = ghSecrets.ok ? new Set(parseGhListNames(ghSecrets.stdout)) : new Set();
  if (!ghSecrets.ok) {
    pushRecord('error', 'GitHub secret inventory', ghSecrets.stderr || ghSecrets.stdout || `exit ${ghSecrets.status}`);
  } else {
    pushRecord('ok', 'GitHub secret inventory', 'retrieved');
  }

  const secretSources = new Map([
    ['CLOUDFLARE_ACCOUNT_ID', process.env.CLOUDFLARE_ACCOUNT_ID || detectedAccountId],
    ['CLOUDFLARE_API_TOKEN', process.env.CLOUDFLARE_API_TOKEN || ''],
  ]);

  for (const [name, value] of secretSources) {
    if (existingSecrets.has(name)) {
      pushRecord('ok', `GitHub secret ${name}`, 'already present');
      continue;
    }
    if (!value) {
      pushRecord('warn', `GitHub secret ${name}`, 'missing locally, skipped');
      continue;
    }
    const result = run('gh', ['secret', 'set', name, '--repo', repoSlug, '--body', value]);
    recordCommand(`GitHub secret ${name}`, result, 'synced');
  }

  REQUIRED_GITHUB_VARIABLES.forEach((name) => {
    if (!repoVariables.get(name)) {
      pushRecord('error', `GitHub variable ${name}`, 'missing');
    }
  });
}

if (cloudflareReady) {
  const pagesProjects = run('npx', ['wrangler', 'pages', 'project', 'list']);
  if (recordCommand('Cloudflare Pages project inventory', pagesProjects, 'retrieved')) {
    pushRecord(
      pagesProjects.stdout.includes(pagesProject) ? 'ok' : 'error',
      `Pages project ${pagesProject}`,
      pagesProjects.stdout.includes(pagesProject) ? 'present' : 'missing',
    );
  }

  if (d1Database) {
    const d1List = run('npx', ['wrangler', 'd1', 'list']);
    if (recordCommand('Cloudflare D1 inventory', d1List, 'retrieved')) {
      pushRecord(
        d1List.stdout.includes(d1Database) ? 'ok' : 'error',
        `D1 database ${d1Database}`,
        d1List.stdout.includes(d1Database) ? 'present' : 'missing',
      );
    }
  }

  const r2List = r2Bindings.length > 0 ? run('npx', ['wrangler', 'r2', 'bucket', 'list']) : null;
  const canInspectR2 = Boolean(r2List) && recordCommand('Cloudflare R2 inventory', r2List, 'retrieved');
  const r2Names = canInspectR2 ? new Set(r2List.stdout.split('\n').filter((line) => line.includes('│')).map((line) => {
    const columns = line.split('│').map((part) => part.trim()).filter(Boolean);
    return columns[1] || '';
  }).filter(Boolean)) : new Set();

  for (const bucket of r2Bindings) {
    if (!canInspectR2) {
      pushRecord('error', `R2 bucket ${bucket.name}`, 'inventory unavailable; enable R2 in the Cloudflare account dashboard first');
      continue;
    }

    if (r2Names.has(bucket.name)) {
      pushRecord('ok', `R2 bucket ${bucket.name}`, 'present');
      continue;
    }

    const createResult = run('npx', ['wrangler', 'r2', 'bucket', 'create', bucket.name]);
    if (!createResult.ok && isAlreadyOwnedR2BucketError(createResult)) {
      pushRecord('ok', `R2 bucket ${bucket.name}`, 'already exists');
      continue;
    }
    recordCommand(`Create R2 bucket ${bucket.name}`, createResult, 'created');
  }

  const readPagesSecretNames = (envArgs) => {
    const secretList = run('npx', ['wrangler', 'pages', 'secret', 'list', '--project-name', pagesProject, ...envArgs]);
    if (!recordCommand(`Pages ${envArgs.length > 0 ? 'preview' : 'production'} secret inventory`, secretList, 'retrieved')) {
      return null;
    }
    return new Set(parsePagesSecretNames(secretList.stdout));
  };

  const productionSecrets = readPagesSecretNames([]);
  const previewSecrets = readPagesSecretNames(['--env', 'preview']);

  const syncPagesSecrets = (label, envArgs, existingSecrets) => {
    if (!existingSecrets) return;

    for (const name of REQUIRED_PAGES_SECRETS) {
      if (existingSecrets.has(name)) {
        pushRecord('ok', `Pages ${label} secret ${name}`, 'already present');
        continue;
      }
      const value = process.env[name] || '';
      if (!value) {
        pushRecord('error', `Pages ${label} secret ${name}`, 'missing locally, cannot sync');
        continue;
      }
      const result = run(
        'npx',
        ['wrangler', 'pages', 'secret', 'put', name, '--project-name', pagesProject, ...envArgs],
        { input: `${value}\n` },
      );
      recordCommand(`Pages ${label} secret ${name}`, result, 'synced');
    }

    for (const name of OPTIONAL_PAGES_SECRETS) {
      if (existingSecrets.has(name)) {
        pushRecord('ok', `Pages ${label} secret ${name}`, 'already present');
        continue;
      }
      const value = process.env[name] || (name === 'CLOUDFLARE_ACCOUNT_ID' ? detectedAccountId : '');
      if (!value) {
        pushRecord('warn', `Pages ${label} secret ${name}`, 'missing locally, skipped');
        continue;
      }
      const result = run(
        'npx',
        ['wrangler', 'pages', 'secret', 'put', name, '--project-name', pagesProject, ...envArgs],
        { input: `${value}\n` },
      );
      recordCommand(`Pages ${label} secret ${name}`, result, 'synced');
    }
  };

  syncPagesSecrets('production', [], productionSecrets);
  syncPagesSecrets('preview', ['--env', 'preview'], previewSecrets);
}

const counts = records.reduce((acc, record) => {
  acc[record.status] = (acc[record.status] || 0) + 1;
  return acc;
}, {});

const formatStatus = (status) => {
  if (status === 'ok') return 'OK';
  if (status === 'warn') return 'WARN';
  if (status === 'error') return 'ERROR';
  return 'INFO';
};

records.forEach((record) => {
  console.log(`[${formatStatus(record.status)}] ${record.label}: ${record.detail}`);
});

console.log('');
console.log(`Summary: ok=${counts.ok || 0} warn=${counts.warn || 0} error=${counts.error || 0}`);

if ((counts.error || 0) > 0) {
  process.exitCode = 1;
}
