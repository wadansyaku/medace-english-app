import { spawnSync } from 'node:child_process';

const severityRank = {
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

const minimumSeverity = 'moderate';

const allowedVulnerabilities = new Map([
  [
    'xlsx',
    {
      maxSeverity: 'high',
      fixAvailable: false,
      advisorySources: new Set([1108110, 1108111]),
      reason: 'npm registry has no fixed xlsx release; usage is limited to local workbook/content QA tooling.',
    },
  ],
]);

const rank = (severity) => severityRank[severity] ?? -1;

const audit = spawnSync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['audit', `--audit-level=${minimumSeverity}`, '--json'],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: false,
  },
);

if (audit.error) {
  console.error(`[security:audit] npm audit failed to start: ${audit.error.message}`);
  process.exit(1);
}

let report;
try {
  report = JSON.parse(audit.stdout || '{}');
} catch (error) {
  console.error('[security:audit] npm audit did not return valid JSON.');
  if (audit.stdout) console.error(audit.stdout);
  if (audit.stderr) console.error(audit.stderr);
  process.exit(1);
}

const vulnerabilities = Object.values(report.vulnerabilities || {})
  .filter((vulnerability) => rank(vulnerability.severity) >= rank(minimumSeverity));

const unexpected = [];
const allowed = [];

for (const vulnerability of vulnerabilities) {
  const policy = allowedVulnerabilities.get(vulnerability.name);
  if (!policy) {
    unexpected.push(vulnerability);
    continue;
  }

  const sourceIds = (vulnerability.via || [])
    .filter((entry) => typeof entry === 'object' && entry !== null)
    .map((entry) => entry.source);
  const advisorySetMatches = sourceIds.length > 0
    && sourceIds.every((source) => policy.advisorySources.has(source));
  const severityAllowed = rank(vulnerability.severity) <= rank(policy.maxSeverity);
  const fixAvailabilityMatches = vulnerability.fixAvailable === policy.fixAvailable;

  if (severityAllowed && fixAvailabilityMatches && advisorySetMatches) {
    allowed.push({ vulnerability, policy });
  } else {
    unexpected.push(vulnerability);
  }
}

if (allowed.length > 0) {
  console.warn('[security:audit] Allowed known vulnerabilities:');
  for (const { vulnerability, policy } of allowed) {
    console.warn(`- ${vulnerability.name} (${vulnerability.severity}): ${policy.reason}`);
  }
}

if (unexpected.length > 0) {
  console.error('[security:audit] Unexpected npm audit vulnerabilities:');
  for (const vulnerability of unexpected) {
    console.error(`- ${vulnerability.name} (${vulnerability.severity})`);
  }
  process.exit(1);
}

console.log(`[security:audit] Passed with ${allowed.length} documented exception(s).`);
