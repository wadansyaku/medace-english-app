import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createNodeToolCommand } from './_shared/tooling.mjs';
import {
  MAIN_MERGE_GATE_RULESET_NAME,
  createMainMergeGateRulesetPayload,
  isMainMergeGateRulesetCompliant,
  normalizeMainMergeGateRuleset,
} from './_shared/github-rulesets.mjs';

const cwd = process.cwd();

const REQUIRED_GITHUB_VARIABLES = ['CLOUDFLARE_PAGES_PROJECT', 'CLOUDFLARE_D1_DATABASE', 'WRITING_AI_MODE'];
const GITHUB_DEPLOYMENT_ENVIRONMENTS = ['production', 'preview'];
const REQUIRED_PAGES_SECRETS = ['ADMIN_DEMO_PASSWORD', 'WRITING_AI_MODE'];
const OPTIONAL_PAGES_SECRETS = ['GEMINI_API_KEY', 'OPENAI_API_KEY'];

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
const r2Bindings = [
  ...primaryR2Bindings.flatMap((bucket) => (bucket.bucket_name ? [{ env: 'production', name: bucket.bucket_name }] : [])),
  ...previewR2Bindings.flatMap((bucket) => (bucket.bucket_name ? [{ env: 'preview', name: bucket.bucket_name }] : [])),
  ...primaryR2Bindings.flatMap((bucket) => (bucket.preview_bucket_name ? [{ env: 'preview', name: bucket.preview_bucket_name }] : [])),
];
const repoSlug = getRepoSlug();

pushRecord('info', 'Workspace', cwd);
pushRecord('info', 'GitHub repo', repoSlug || '(unable to detect from origin)');
pushRecord('info', 'Pages project', pagesProject);
pushRecord('info', 'D1 database', d1Database || '(missing in wrangler.jsonc)');
pushRecord('info', 'Preview D1 database', previewD1Database || '(missing preview name)');
pushRecord('info', 'Preview D1 database id', previewD1DatabaseId || '(missing env.preview.d1_databases[0].database_id)');
pushRecord('info', 'Writing AI mode', writingAiMode);
pushRecord('info', 'R2 buckets', r2Bindings.length > 0 ? r2Bindings.map((bucket) => `${bucket.env}:${bucket.name}`).join(', ') : '(none)');

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
    const existingRuleset = rulesetsResponse.result;
    if (isMainMergeGateRulesetCompliant(existingRuleset)) {
      pushRecord('ok', `GitHub ruleset ${MAIN_MERGE_GATE_RULESET_NAME}`, JSON.stringify(normalizeMainMergeGateRuleset(existingRuleset)));
    } else {
      const payload = createMainMergeGateRulesetPayload(existingRuleset);
      const syncResponse = existingRuleset
        ? runGhApiJson(`repos/${repoSlug}/rulesets/${existingRuleset.id}`, {
            method: 'PUT',
            body: payload,
          })
        : runGhApiJson(`repos/${repoSlug}/rulesets`, {
            method: 'POST',
            body: payload,
          });

      if (!syncResponse.ok) {
        pushRecord('error', `GitHub ruleset ${MAIN_MERGE_GATE_RULESET_NAME}`, syncResponse.stderr);
      } else {
        pushRecord(
          isMainMergeGateRulesetCompliant(syncResponse.result) ? 'ok' : 'error',
          `GitHub ruleset ${MAIN_MERGE_GATE_RULESET_NAME}`,
          JSON.stringify(normalizeMainMergeGateRuleset(syncResponse.result)),
        );
      }
    }
  }

  const repoVariables = new Map([
    ['CLOUDFLARE_PAGES_PROJECT', pagesProject],
    ['CLOUDFLARE_D1_DATABASE', d1Database],
    ['WRITING_AI_MODE', writingAiMode],
  ]);

  for (const [name, value] of repoVariables) {
    if (!value) {
      pushRecord('error', `GitHub variable ${name}`, 'value is empty');
      continue;
    }
    const result = run('gh', ['variable', 'set', name, '--repo', repoSlug, '--body', value]);
    recordCommand(`GitHub variable ${name}`, result, value);
  }

  const deploymentEnvironmentVariables = new Map([
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

  for (const envName of GITHUB_DEPLOYMENT_ENVIRONMENTS) {
    for (const [name, value] of deploymentEnvironmentVariables.get(envName) || new Map()) {
      if (!value) {
        pushRecord('error', `GitHub ${envName} variable ${name}`, 'value is empty');
        continue;
      }
      const result = run('gh', ['variable', 'set', name, '--env', envName, '--repo', repoSlug, '--body', value]);
      recordCommand(`GitHub ${envName} variable ${name}`, result, value);
    }
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

  for (const envName of GITHUB_DEPLOYMENT_ENVIRONMENTS) {
    for (const [name, value] of secretSources) {
      if (!value) {
        pushRecord('warn', `GitHub ${envName} secret ${name}`, 'missing locally, skipped');
        continue;
      }
      const result = run('gh', ['secret', 'set', name, '--env', envName, '--repo', repoSlug, '--body', value]);
      recordCommand(`GitHub ${envName} secret ${name}`, result, 'synced');
    }
  }

  REQUIRED_GITHUB_VARIABLES.forEach((name) => {
    if (!repoVariables.get(name)) {
      pushRecord('error', `GitHub variable ${name}`, 'missing');
    }
  });
}

if (cloudflareReady) {
  const pagesProjects = runWrangler(['pages', 'project', 'list']);
  if (recordCommand('Cloudflare Pages project inventory', pagesProjects, 'retrieved')) {
    const projectExists = pagesProjects.stdout.includes(pagesProject);
    pushRecord(
      projectExists ? 'ok' : 'error',
      `Pages project ${pagesProject}`,
      projectExists ? 'present' : 'missing',
    );
    const gitProvider = readPagesProjectColumn(pagesProjects.stdout, pagesProject, 'Git Provider');
    if (projectExists) {
      try {
        let project = await fetchCloudflareApi(`/pages/projects/${pagesProject}`, {}, detectedAccountId);
        const sourceConfig = project?.source?.config || null;

        if (gitProvider?.toLowerCase() === 'yes' && isPagesGitAutoDeployDisabled(sourceConfig)) {
          pushRecord('ok', `Pages project ${pagesProject} Git auto-deploy`, 'already disabled');
        } else if (gitProvider?.toLowerCase() === 'yes' && project?.source?.type === 'github') {
          const nextSource = {
            ...project.source,
            config: {
              ...sourceConfig,
              deployments_enabled: false,
              production_deployments_enabled: false,
              preview_deployment_setting: 'none',
            },
          };
          project = await fetchCloudflareApi(
            `/pages/projects/${pagesProject}`,
            {
              method: 'PATCH',
              body: JSON.stringify({ source: nextSource }),
            },
            detectedAccountId,
          );
          pushRecord(
            isPagesGitAutoDeployDisabled(project?.source?.config || null) ? 'ok' : 'warn',
            `Pages project ${pagesProject} Git auto-deploy`,
            isPagesGitAutoDeployDisabled(project?.source?.config || null)
              ? 'disabled to keep GitHub Actions as the canonical deploy path'
              : 'Git integration remains active; verify Cloudflare Pages branch control settings',
          );
        } else if (gitProvider?.toLowerCase() === 'yes') {
          pushRecord('warn', `Pages project ${pagesProject} Git auto-deploy`, 'Git provider is linked, but the source type is not github');
        }

        const deploymentConfigs = project?.deployment_configs || {};
        const needsBindingSync = (
          (d1DatabaseId && readPagesBindingValue(deploymentConfigs.production, 'd1_databases', 'DB', 'id') !== d1DatabaseId)
          || (previewD1DatabaseId && readPagesBindingValue(deploymentConfigs.preview, 'd1_databases', 'DB', 'id') !== previewD1DatabaseId)
          || (productionR2BucketName && readPagesBindingValue(deploymentConfigs.production, 'r2_buckets', 'WRITING_ASSETS', 'name') !== productionR2BucketName)
          || (previewR2BucketName && readPagesBindingValue(deploymentConfigs.preview, 'r2_buckets', 'WRITING_ASSETS', 'name') !== previewR2BucketName)
        );

        if (!needsBindingSync) {
          pushRecord('ok', `Pages project ${pagesProject} deployment bindings`, 'already aligned with wrangler.jsonc');
        } else {
          project = await fetchCloudflareApi(
            `/pages/projects/${pagesProject}`,
            {
              method: 'PATCH',
              body: JSON.stringify({
                deployment_configs: {
                  production: {
                    ...(d1DatabaseId ? { d1_databases: { DB: { id: d1DatabaseId } } } : {}),
                    ...(productionR2BucketName ? { r2_buckets: { WRITING_ASSETS: { name: productionR2BucketName } } } : {}),
                  },
                  preview: {
                    ...(previewD1DatabaseId ? { d1_databases: { DB: { id: previewD1DatabaseId } } } : {}),
                    ...(previewR2BucketName ? { r2_buckets: { WRITING_ASSETS: { name: previewR2BucketName } } } : {}),
                  },
                },
              }),
            },
            detectedAccountId,
          );
          const syncedDeploymentConfigs = project?.deployment_configs || {};
          const bindingSyncOk = (
            (!d1DatabaseId || readPagesBindingValue(syncedDeploymentConfigs.production, 'd1_databases', 'DB', 'id') === d1DatabaseId)
            && (!previewD1DatabaseId || readPagesBindingValue(syncedDeploymentConfigs.preview, 'd1_databases', 'DB', 'id') === previewD1DatabaseId)
            && (!productionR2BucketName || readPagesBindingValue(syncedDeploymentConfigs.production, 'r2_buckets', 'WRITING_ASSETS', 'name') === productionR2BucketName)
            && (!previewR2BucketName || readPagesBindingValue(syncedDeploymentConfigs.preview, 'r2_buckets', 'WRITING_ASSETS', 'name') === previewR2BucketName)
          );
          pushRecord(
            bindingSyncOk ? 'ok' : 'warn',
            `Pages project ${pagesProject} deployment bindings`,
            bindingSyncOk ? 'synced from wrangler.jsonc' : 'binding sync attempted, but Cloudflare returned unexpected values',
          );
        }
      } catch (error) {
        pushRecord(
          'warn',
          `Pages project ${pagesProject} API sync`,
          `unable to update project settings via API: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  try {
    const databases = await fetchCloudflareApi('/d1/database', {}, detectedAccountId);
    pushRecord('ok', 'Cloudflare D1 inventory', 'retrieved');

    const productionDatabase = databases.find((database) => database.name === d1Database);
    pushRecord(
      productionDatabase ? 'ok' : 'error',
      `D1 database ${d1Database}`,
      productionDatabase ? `present (${productionDatabase.uuid})` : 'missing',
    );

    let previewDatabase = databases.find((database) => database.name === previewD1Database);
    if (!previewDatabase) {
      previewDatabase = await fetchCloudflareApi(
        '/d1/database',
        {
          method: 'POST',
          body: JSON.stringify({ name: previewD1Database }),
        },
        detectedAccountId,
      );
      pushRecord('ok', `D1 database ${previewD1Database}`, `created (${previewDatabase.uuid})`);
    } else {
      pushRecord('ok', `D1 database ${previewD1Database}`, `present (${previewDatabase.uuid})`);
    }

    if (previewD1DatabaseId) {
      pushRecord(
        previewDatabase.uuid === previewD1DatabaseId ? 'ok' : 'error',
        `D1 preview binding ${previewD1DatabaseId}`,
        previewDatabase.uuid === previewD1DatabaseId ? `mapped to ${previewDatabase.name}` : `wrangler.jsonc points to ${previewD1DatabaseId}, but Cloudflare returned ${previewDatabase.uuid}`,
      );
    }
  } catch (error) {
    pushRecord('error', 'Cloudflare D1 inventory', error instanceof Error ? error.message : String(error));
  }

  const r2List = r2Bindings.length > 0 ? runWrangler(['r2', 'bucket', 'list']) : null;
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

    const createResult = runWrangler(['r2', 'bucket', 'create', bucket.name]);
    if (!createResult.ok && isAlreadyOwnedR2BucketError(createResult)) {
      pushRecord('ok', `R2 bucket ${bucket.name}`, 'already exists');
      continue;
    }
    recordCommand(`Create R2 bucket ${bucket.name}`, createResult, 'created');
  }

  const readPagesSecretNames = (envArgs) => {
    const secretList = runWrangler(['pages', 'secret', 'list', '--project-name', pagesProject, ...envArgs]);
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
      const value = name === 'WRITING_AI_MODE'
        ? writingAiMode
        : (
          label === 'preview'
            ? (process.env.ADMIN_DEMO_PASSWORD_PREVIEW || process.env[name] || '')
            : (process.env[name] || '')
        );
      if (!value) {
        pushRecord('error', `Pages ${label} secret ${name}`, 'missing locally, cannot sync');
        continue;
      }
      if (label === 'preview' && name === 'ADMIN_DEMO_PASSWORD' && !process.env.ADMIN_DEMO_PASSWORD_PREVIEW) {
        pushRecord('warn', 'Pages preview secret ADMIN_DEMO_PASSWORD', 'using ADMIN_DEMO_PASSWORD fallback; set ADMIN_DEMO_PASSWORD_PREVIEW to split preview credentials');
      }
      const result = runWrangler(
        ['pages', 'secret', 'put', name, '--project-name', pagesProject, ...envArgs],
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
      const result = runWrangler(
        ['pages', 'secret', 'put', name, '--project-name', pagesProject, ...envArgs],
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
