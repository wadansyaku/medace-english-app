import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createNodeToolCommand } from './_shared/tooling.mjs';
import {
  MAIN_MERGE_GATE_RULESET_NAME,
  isMainMergeGateRulesetCompliant,
  normalizeMainMergeGateRuleset,
} from './_shared/github-rulesets.mjs';

const cwd = process.cwd();
const includeDeferred = process.argv.includes('--include-deferred');

const REQUIRED_GITHUB_SECRETS = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'];
const REQUIRED_GITHUB_VARIABLES = ['CLOUDFLARE_PAGES_PROJECT', 'CLOUDFLARE_D1_DATABASE', 'WRITING_AI_MODE'];
const GITHUB_DEPLOYMENT_ENVIRONMENTS = ['production', 'preview'];
const REQUIRED_PAGES_SECRETS = ['ADMIN_DEMO_PASSWORD', 'WRITING_AI_MODE'];
const DEFERRED_PAGES_SECRETS = ['GEMINI_API_KEY', 'OPENAI_API_KEY'];

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

const runWrangler = (args, options = {}) => {
  const wrangler = createNodeToolCommand('wrangler', args);
  return run(wrangler.command, wrangler.args, options);
};

const sleep = (ms) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

const runGhApiJson = (path, { method = 'GET', body } = {}) => {
  const args = ['api', '--method', method, path];
  const options = {};
  if (body) {
    args.push('--input', '-');
    options.input = JSON.stringify(body);
  }
  const result = run('gh', args, options);
  if (!result.ok) {
    return {
      ok: false,
      result: null,
      stderr: result.stderr || result.stdout || `exit ${result.status}`,
    };
  }
  try {
    return {
      ok: true,
      result: result.stdout ? JSON.parse(result.stdout) : null,
      stderr: '',
    };
  } catch (error) {
    return {
      ok: false,
      result: null,
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
};

const fetchNamedRepoRuleset = (repoSlug, rulesetName) => {
  const rulesetsResponse = runGhApiJson(`repos/${repoSlug}/rulesets`);
  if (!rulesetsResponse.ok) {
    return rulesetsResponse;
  }

  const rulesets = Array.isArray(rulesetsResponse.result) ? rulesetsResponse.result : [];
  const summaryRuleset = rulesets.find((entry) => entry?.name === rulesetName) || null;
  if (!summaryRuleset?.id) {
    return {
      ok: true,
      result: null,
      stderr: '',
    };
  }

  return runGhApiJson(`repos/${repoSlug}/rulesets/${summaryRuleset.id}`);
};

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

const parseJsonc = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const getRepoSlug = () => {
  const result = run('git', ['remote', 'get-url', 'origin']);
  if (!result.ok || !result.stdout) return null;

  const remote = result.stdout;
  const httpsMatch = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
  return httpsMatch?.[1] || null;
};

const parseGhListNames = (output) => output
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => line.split(/\s+/)[0])
  .filter(Boolean);

const parseGhVariableMap = (output) => new Map(
  output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, value = ''] = line.split(/\s+/, 2);
      return [name, value];
    }),
);

const parsePagesSecretNames = (output) => output
  .split('\n')
  .map((line) => line.match(/^\s*-\s([^:]+):/))
  .filter(Boolean)
  .map((match) => match[1]);

const parseWranglerTableRows = (output) => output
  .split('\n')
  .map((line) => line.trimEnd())
  .filter((line) => line.includes('│'))
  .map((line) => line.split('│').map((part) => part.trim()).filter(Boolean))
  .filter((columns) => columns.length > 1);

const normalizeTableHeader = (value) => value.trim().toLowerCase();

const readPagesProjectColumn = (output, projectName, columnName) => {
  const rows = parseWranglerTableRows(output);
  const headers = rows.find((columns) => columns.some((column) => normalizeTableHeader(column) === 'project name'));
  if (!headers) return null;

  const projectNameIndex = headers.findIndex((column) => normalizeTableHeader(column) === 'project name');
  const targetColumnIndex = headers.findIndex((column) => normalizeTableHeader(column) === normalizeTableHeader(columnName));
  if (projectNameIndex < 0 || targetColumnIndex < 0) return null;

  const row = rows.find((columns) => columns[projectNameIndex] === projectName);
  return row?.[targetColumnIndex] || null;
};

const getCloudflareApiCredentials = (fallbackAccountId = '') => {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN || '';
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || fallbackAccountId || '';
  if (!apiToken || !accountId) return null;
  return { apiToken, accountId };
};

const readErrorMessage = (payload, fallback) => {
  if (payload?.errors?.length) {
    return payload.errors.map((error) => error.message || JSON.stringify(error)).join('; ');
  }
  return fallback;
};

const fetchCloudflareApi = async (apiPath, init = {}, fallbackAccountId = '') => {
  const credentials = getCloudflareApiCredentials(fallbackAccountId);
  if (!credentials) {
    throw new Error('CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID が未設定です。');
  }

  const response = await fetch(`${CLOUDFLARE_API_BASE}/accounts/${credentials.accountId}${apiPath}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${credentials.apiToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok || (payload && payload.success === false)) {
    throw new Error(readErrorMessage(payload, text || `HTTP ${response.status}`));
  }
  return payload?.result ?? null;
};

const isPagesGitAutoDeployDisabled = (sourceConfig) => (
  Boolean(
    sourceConfig
    && sourceConfig.deployments_enabled === false
    && sourceConfig.production_deployments_enabled === false
    && sourceConfig.preview_deployment_setting === 'none'
  )
);

const readPagesBindingValue = (deploymentConfig, kind, binding, field) => (
  deploymentConfig?.[kind]?.[binding]?.[field] || ''
);

const records = [];
const pushRecord = (status, label, detail) => {
  records.push({ status, label, detail });
};

const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
const isGithubInventoryPermissionError = (result) => /Resource not accessible by integration/i.test(`${result.stderr}\n${result.stdout}`);
const isTransientCloudflareApiError = (result) => /Received a malformed response from the API|502 Bad Gateway|503 Service Temporarily Unavailable|504 Gateway Timeout/i.test(`${result.stderr}\n${result.stdout}`);

const runWranglerWithTransientRetries = (args, { transientRetries = 2, retryDelayMs = 1000, ...options } = {}) => {
  let result = runWrangler(args, options);

  for (let attempt = 1; attempt <= transientRetries && !result.ok && isTransientCloudflareApiError(result); attempt += 1) {
    sleep(retryDelayMs * attempt);
    result = runWrangler(args, options);
  }

  return result;
};

const recordCommand = (label, result, detailOnSuccess, { allowTransientFailure = false } = {}) => {
  if (result.ok) {
    pushRecord('ok', label, detailOnSuccess || result.stdout || 'ok');
    return true;
  }
  pushRecord(
    allowTransientFailure && isTransientCloudflareApiError(result) ? 'warn' : 'error',
    label,
    result.stderr || result.stdout || `exit ${result.status}`,
  );
  return false;
};

const wranglerConfigPath = path.join(cwd, 'wrangler.jsonc');
const wranglerRaw = await fs.readFile(wranglerConfigPath, 'utf8');
const wranglerConfig = JSON.parse(parseJsonc(wranglerRaw));

const previewConfig = wranglerConfig.env?.preview || {};
const primaryD1Binding = wranglerConfig.d1_databases?.[0] || {};
const previewD1Binding = previewConfig.d1_databases?.[0] || {};
const primaryR2Bindings = wranglerConfig.r2_buckets || [];
const previewR2Bindings = previewConfig.r2_buckets || [];
const pagesProject = process.env.CLOUDFLARE_PAGES_PROJECT || wranglerConfig.name;
const d1Database = process.env.CLOUDFLARE_D1_DATABASE || primaryD1Binding.database_name || '';
const previewD1Database = process.env.CLOUDFLARE_D1_DATABASE_PREVIEW || `${d1Database}-preview`;
const d1DatabaseId = primaryD1Binding.database_id || '';
const previewD1DatabaseId = previewD1Binding.database_id || primaryD1Binding.preview_database_id || '';
const writingAiMode = process.env.WRITING_AI_MODE || 'hybrid';
const productionR2BucketName = primaryR2Bindings[0]?.bucket_name || '';
const previewR2BucketName = previewR2Bindings[0]?.bucket_name || primaryR2Bindings[0]?.preview_bucket_name || '';
const r2Buckets = [
  ...primaryR2Bindings.flatMap((bucket) => (bucket.bucket_name ? [{ env: 'production', name: bucket.bucket_name }] : [])),
  ...previewR2Bindings.flatMap((bucket) => (bucket.bucket_name ? [{ env: 'preview', name: bucket.bucket_name }] : [])),
  ...primaryR2Bindings.flatMap((bucket) => (bucket.preview_bucket_name ? [{ env: 'preview', name: bucket.preview_bucket_name }] : [])),
];
const repoSlug = getRepoSlug();

pushRecord('info', 'Workspace', cwd);
pushRecord('info', 'Pages project', pagesProject);
pushRecord('info', 'D1 database', d1Database || '(missing in wrangler.jsonc)');
pushRecord('info', 'Preview D1 database', previewD1Database || '(missing preview name)');
pushRecord('info', 'Preview D1 database id', previewD1DatabaseId || '(missing env.preview.d1_databases[0].database_id)');
pushRecord('info', 'Writing AI mode', writingAiMode || '(missing locally, expecting Pages binding)');
pushRecord('info', 'R2 buckets', r2Buckets.length > 0 ? r2Buckets.map((bucket) => `${bucket.env}:${bucket.name}`).join(', ') : '(none)');
pushRecord('info', 'GitHub repo', repoSlug || '(unable to detect from origin)');

const ghAuth = run('gh', ['auth', 'status']);
const githubReady = recordCommand('GitHub auth', ghAuth, 'authenticated');
const detectedAccountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
let cloudflareReady = false;
try {
  await fetchCloudflareApi('/d1/database', {}, detectedAccountId);
  pushRecord('ok', 'Cloudflare auth', 'authenticated');
  cloudflareReady = true;
} catch (error) {
  pushRecord('error', 'Cloudflare auth', error instanceof Error ? error.message : String(error));
}

if (githubReady && repoSlug) {
  const rulesetsResponse = fetchNamedRepoRuleset(repoSlug, MAIN_MERGE_GATE_RULESET_NAME);
  if (!rulesetsResponse.ok) {
    pushRecord('error', `GitHub ruleset ${MAIN_MERGE_GATE_RULESET_NAME}`, rulesetsResponse.stderr);
  } else {
    const ruleset = rulesetsResponse.result;
    const normalizedRuleset = normalizeMainMergeGateRuleset(ruleset);
    pushRecord(
      isMainMergeGateRulesetCompliant(ruleset) ? 'ok' : 'error',
      `GitHub ruleset ${MAIN_MERGE_GATE_RULESET_NAME}`,
      JSON.stringify(normalizedRuleset),
    );
  }

  const ghSecrets = run('gh', ['secret', 'list', '--repo', repoSlug]);
  if (!ghSecrets.ok && isGitHubActions && isGithubInventoryPermissionError(ghSecrets)) {
    pushRecord('warn', 'GitHub secret inventory', 'skipped: workflow token cannot list repository secrets');
    REQUIRED_GITHUB_SECRETS.forEach((name) => {
      const present = Boolean(process.env[name]);
      pushRecord(
        present ? 'ok' : 'error',
        `Workflow secret ${name}`,
        present ? 'available to current workflow' : 'missing from current workflow environment'
      );
    });
  } else if (recordCommand('GitHub secret inventory', ghSecrets, 'retrieved')) {
    const names = new Set(parseGhListNames(ghSecrets.stdout));
    REQUIRED_GITHUB_SECRETS.forEach((name) => {
      pushRecord(names.has(name) ? 'ok' : 'error', `GitHub secret ${name}`, names.has(name) ? 'present' : 'missing');
    });
  }

  const ghVariables = run('gh', ['variable', 'list', '--repo', repoSlug]);
  if (!ghVariables.ok && isGitHubActions && isGithubInventoryPermissionError(ghVariables)) {
    pushRecord('warn', 'GitHub variable inventory', 'skipped: workflow token cannot list repository variables');
    REQUIRED_GITHUB_VARIABLES.forEach((name) => {
      const value = process.env[name];
      pushRecord(value ? 'ok' : 'warn', `Runtime config ${name}`, value || 'missing (using defaults or local config)');
    });
  } else if (recordCommand('GitHub variable inventory', ghVariables, 'retrieved')) {
    const lines = ghVariables.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
    const map = new Map(lines.map((line) => {
      const [name, value = ''] = line.split(/\s+/, 2);
      return [name, value];
    }));

    REQUIRED_GITHUB_VARIABLES.forEach((name) => {
      const value = map.get(name);
      pushRecord(value ? 'ok' : 'error', `GitHub variable ${name}`, value || 'missing');
    });
  }

  const expectedEnvironmentVariables = new Map([
    ['production', new Map([
      ['CLOUDFLARE_PAGES_PROJECT', pagesProject],
      ['CLOUDFLARE_D1_DATABASE', d1Database],
      ['WRITING_AI_MODE', writingAiMode],
    ])],
    ['preview', new Map([
      ['CLOUDFLARE_PAGES_PROJECT', pagesProject],
      ['CLOUDFLARE_D1_DATABASE', previewD1Database],
      ['WRITING_AI_MODE', writingAiMode],
    ])],
  ]);

  GITHUB_DEPLOYMENT_ENVIRONMENTS.forEach((envName) => {
    const ghEnvSecrets = run('gh', ['secret', 'list', '--env', envName, '--repo', repoSlug]);
    if (!ghEnvSecrets.ok && isGitHubActions && isGithubInventoryPermissionError(ghEnvSecrets)) {
      pushRecord('warn', `GitHub ${envName} secret inventory`, 'skipped: workflow token cannot list environment secrets');
      REQUIRED_GITHUB_SECRETS.forEach((name) => {
        const present = Boolean(process.env[name]);
        pushRecord(
          present ? 'ok' : 'warn',
          `Workflow environment secret ${envName}:${name}`,
          present ? 'available to current workflow' : 'not exposed in current workflow context',
        );
      });
    } else if (recordCommand(`GitHub ${envName} secret inventory`, ghEnvSecrets, 'retrieved')) {
      const names = new Set(parseGhListNames(ghEnvSecrets.stdout));
      REQUIRED_GITHUB_SECRETS.forEach((name) => {
        pushRecord(
          names.has(name) ? 'ok' : 'error',
          `GitHub ${envName} secret ${name}`,
          names.has(name) ? 'present' : 'missing',
        );
      });
    }

    const ghEnvVariables = run('gh', ['variable', 'list', '--env', envName, '--repo', repoSlug]);
    if (!ghEnvVariables.ok && isGitHubActions && isGithubInventoryPermissionError(ghEnvVariables)) {
      pushRecord('warn', `GitHub ${envName} variable inventory`, 'skipped: workflow token cannot list environment variables');
      for (const [name] of expectedEnvironmentVariables.get(envName) || new Map()) {
        const value = process.env[name];
        pushRecord(
          value ? 'ok' : 'warn',
          `Runtime environment variable ${envName}:${name}`,
          value || 'not exposed in current workflow context',
        );
      }
    } else if (recordCommand(`GitHub ${envName} variable inventory`, ghEnvVariables, 'retrieved')) {
      const envVariables = parseGhVariableMap(ghEnvVariables.stdout);
      for (const [name, expectedValue] of expectedEnvironmentVariables.get(envName) || new Map()) {
        const value = envVariables.get(name);
        pushRecord(
          value === expectedValue ? 'ok' : 'error',
          `GitHub ${envName} variable ${name}`,
          value || 'missing',
        );
      }
    }
  });
}

if (cloudflareReady) {
  const pagesProjects = runWranglerWithTransientRetries(['pages', 'project', 'list']);
  if (recordCommand('Cloudflare Pages project inventory', pagesProjects, 'retrieved', { allowTransientFailure: true })) {
    const projectExists = pagesProjects.stdout.includes(pagesProject);
    pushRecord(
      projectExists ? 'ok' : 'error',
      `Pages project ${pagesProject}`,
      projectExists ? 'present' : 'missing'
    );
    const gitProvider = readPagesProjectColumn(pagesProjects.stdout, pagesProject, 'Git Provider');
    if (projectExists) {
      try {
        const project = await fetchCloudflareApi(`/pages/projects/${pagesProject}`, {}, detectedAccountId);
        const sourceConfig = project?.source?.config || null;
        const deploymentConfigs = project?.deployment_configs || {};

        if (gitProvider?.toLowerCase() === 'yes') {
          pushRecord(
            isPagesGitAutoDeployDisabled(sourceConfig) ? 'ok' : 'warn',
            `Pages project ${pagesProject} Git auto-deploy`,
            isPagesGitAutoDeployDisabled(sourceConfig)
              ? 'Git integration remains linked, but automatic production/preview deploys are disabled'
              : 'native Git auto-deploy is still enabled; disable Cloudflare Git auto-deploy if GitHub Actions is the canonical deploy path',
          );
        }

        pushRecord(
          !d1DatabaseId || readPagesBindingValue(deploymentConfigs.production, 'd1_databases', 'DB', 'id') === d1DatabaseId ? 'ok' : 'error',
          `Pages production D1 binding ${pagesProject}`,
          readPagesBindingValue(deploymentConfigs.production, 'd1_databases', 'DB', 'id') || 'missing',
        );
        pushRecord(
          !previewD1DatabaseId || readPagesBindingValue(deploymentConfigs.preview, 'd1_databases', 'DB', 'id') === previewD1DatabaseId ? 'ok' : 'error',
          `Pages preview D1 binding ${pagesProject}`,
          readPagesBindingValue(deploymentConfigs.preview, 'd1_databases', 'DB', 'id') || 'missing',
        );
        pushRecord(
          !productionR2BucketName || readPagesBindingValue(deploymentConfigs.production, 'r2_buckets', 'WRITING_ASSETS', 'name') === productionR2BucketName ? 'ok' : 'error',
          `Pages production R2 binding ${pagesProject}`,
          readPagesBindingValue(deploymentConfigs.production, 'r2_buckets', 'WRITING_ASSETS', 'name') || 'missing',
        );
        pushRecord(
          !previewR2BucketName || readPagesBindingValue(deploymentConfigs.preview, 'r2_buckets', 'WRITING_ASSETS', 'name') === previewR2BucketName ? 'ok' : 'error',
          `Pages preview R2 binding ${pagesProject}`,
          readPagesBindingValue(deploymentConfigs.preview, 'r2_buckets', 'WRITING_ASSETS', 'name') || 'missing',
        );
      } catch (error) {
        pushRecord(
          'warn',
          `Pages project ${pagesProject} API inspection`,
          `project settings could not be verified: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    const gitMirrorProject = `${pagesProject}-git`;
    if (pagesProjects.stdout.includes(gitMirrorProject)) {
      pushRecord(
        'warn',
        `Possible duplicate Pages project ${gitMirrorProject}`,
        `present; disable Cloudflare Git auto-deploy or remove the mirror project if GitHub Actions is the canonical deploy path`,
      );
    }
  }

  pushRecord(
    previewD1DatabaseId ? 'ok' : 'error',
    'wrangler preview D1 binding',
    previewD1DatabaseId || 'missing env.preview.d1_databases[0].database_id',
  );

  try {
    const databases = await fetchCloudflareApi('/d1/database', {}, detectedAccountId);
    pushRecord('ok', 'Cloudflare D1 inventory', 'retrieved');

    const productionDatabase = databases.find((database) => database.name === d1Database);
    pushRecord(
      productionDatabase ? 'ok' : 'error',
      `D1 database ${d1Database}`,
      productionDatabase ? `present (${productionDatabase.uuid})` : 'missing',
    );

    const previewDatabase = databases.find((database) => database.name === previewD1Database);
    pushRecord(
      previewDatabase ? 'ok' : 'error',
      `D1 database ${previewD1Database}`,
      previewDatabase ? `present (${previewDatabase.uuid})` : 'missing',
    );

    if (previewD1DatabaseId) {
      const previewById = databases.find((database) => database.uuid === previewD1DatabaseId);
      pushRecord(
        previewById ? 'ok' : 'error',
        `D1 preview binding ${previewD1DatabaseId}`,
        previewById ? `mapped to ${previewById.name}` : 'missing',
      );
    }
  } catch (error) {
    pushRecord('error', 'Cloudflare D1 inventory', error instanceof Error ? error.message : String(error));
  }

  if (r2Buckets.length > 0) {
    const r2List = runWrangler(['r2', 'bucket', 'list']);
    if (recordCommand('Cloudflare R2 inventory', r2List, 'retrieved')) {
      r2Buckets.forEach((bucket) => {
        pushRecord(
          r2List.stdout.includes(bucket.name) ? 'ok' : 'error',
          `R2 bucket ${bucket.name}`,
          r2List.stdout.includes(bucket.name) ? `${bucket.env} bucket present` : `${bucket.env} bucket missing`,
        );
      });
    } else {
      r2Buckets.forEach((bucket) => {
        pushRecord('error', `R2 bucket ${bucket.name}`, 'inventory unavailable; enable R2 in the Cloudflare account dashboard first');
      });
    }
  }

  const checkPagesSecrets = (envName, args) => {
    const secrets = runWranglerWithTransientRetries(['pages', 'secret', 'list', '--project-name', pagesProject, ...args]);
    const labelPrefix = `Pages ${envName}`;
    if (!recordCommand(`${labelPrefix} secret inventory`, secrets, 'retrieved')) {
      return;
    }

    const names = new Set(parsePagesSecretNames(secrets.stdout));
    const missingRequiredStatus = 'error';
    REQUIRED_PAGES_SECRETS.forEach((name) => {
      pushRecord(
        names.has(name) ? 'ok' : missingRequiredStatus,
        `${labelPrefix} secret ${name}`,
        names.has(name) ? 'present' : 'missing'
      );
    });
    DEFERRED_PAGES_SECRETS.forEach((name) => {
      const present = names.has(name);
      if (present) {
        pushRecord('ok', `${labelPrefix} secret ${name}`, 'present');
        return;
      }
      pushRecord(includeDeferred ? 'error' : 'warn', `${labelPrefix} secret ${name}`, includeDeferred ? 'missing' : 'missing (deferred)');
    });
  };

  checkPagesSecrets('production', []);
  checkPagesSecrets('preview', ['--env', 'preview']);

  const currentBranch = run('git', ['branch', '--show-current']);
  if (currentBranch.ok && currentBranch.stdout) {
    const deployments = runWranglerWithTransientRetries(['pages', 'deployment', 'list', '--project-name', pagesProject]);
    if (recordCommand('Cloudflare deployment inventory', deployments, 'retrieved', { allowTransientFailure: true })) {
      const branch = currentBranch.stdout.trim();
      const matchingLine = deployments.stdout
        .split('\n')
        .find((line) => line.includes(branch) && line.includes('pages.dev'));
      pushRecord(
        matchingLine ? 'ok' : 'warn',
        `Latest deployment for ${branch}`,
        matchingLine ? matchingLine.trim() : 'no deployment row found for current branch'
      );
    }
  }
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
