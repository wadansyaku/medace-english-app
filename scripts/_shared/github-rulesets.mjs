export const MAIN_MERGE_GATE_RULESET_NAME = 'main-merge-gate';
export const MAIN_MERGE_GATE_REF = 'refs/heads/main';

const getRule = (ruleset, type) => (
  Array.isArray(ruleset?.rules)
    ? ruleset.rules.find((rule) => rule?.type === type) || null
    : null
);

const sortStrings = (values) => [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));

const normalizeStatusChecks = (checks) => sortStrings(
  Array.isArray(checks)
    ? checks.map((check) => check?.context || '')
    : [],
);

const normalizeDeployments = (environments) => sortStrings(Array.isArray(environments) ? environments : []);

const sameStrings = (left, right) => (
  left.length === right.length
  && left.every((value, index) => value === right[index])
);

export const normalizeMainMergeGateRuleset = (ruleset) => {
  if (!ruleset) {
    return {
      exists: false,
    };
  }

  const pullRequestRule = getRule(ruleset, 'pull_request');
  const statusCheckRule = getRule(ruleset, 'required_status_checks');
  const deploymentRule = getRule(ruleset, 'required_deployments');

  return {
    exists: true,
    id: ruleset.id,
    name: ruleset.name,
    target: ruleset.target,
    enforcement: ruleset.enforcement,
    refs: sortStrings(ruleset.conditions?.ref_name?.include || []),
    protections: {
      deletion: Boolean(getRule(ruleset, 'deletion')),
      nonFastForward: Boolean(getRule(ruleset, 'non_fast_forward')),
      linearHistory: Boolean(getRule(ruleset, 'required_linear_history')),
    },
    pullRequest: {
      requiredApprovingReviewCount: Number(pullRequestRule?.parameters?.required_approving_review_count ?? -1),
      requireCodeOwnerReview: Boolean(pullRequestRule?.parameters?.require_code_owner_review),
      requireLastPushApproval: Boolean(pullRequestRule?.parameters?.require_last_push_approval),
      requiredReviewThreadResolution: Boolean(pullRequestRule?.parameters?.required_review_thread_resolution),
    },
    requiredStatusChecks: normalizeStatusChecks(
      statusCheckRule?.parameters?.required_status_checks,
    ),
    requiredDeployments: normalizeDeployments(
      deploymentRule?.parameters?.required_deployment_environments,
    ),
  };
};

export const isMainMergeGateRulesetCompliant = (ruleset) => {
  const normalized = normalizeMainMergeGateRuleset(ruleset);
  if (!normalized.exists) return false;

  return (
    normalized.name === MAIN_MERGE_GATE_RULESET_NAME
    && normalized.target === 'branch'
    && normalized.enforcement === 'active'
    && sameStrings(normalized.refs, [MAIN_MERGE_GATE_REF])
    && normalized.protections.deletion
    && normalized.protections.nonFastForward
    && normalized.protections.linearHistory
    && normalized.pullRequest.requiredApprovingReviewCount === 0
    && normalized.pullRequest.requireCodeOwnerReview === false
    && normalized.pullRequest.requireLastPushApproval === false
    && normalized.pullRequest.requiredReviewThreadResolution === true
    && sameStrings(normalized.requiredStatusChecks, ['verify'])
    && sameStrings(normalized.requiredDeployments, ['preview'])
  );
};

export const createMainMergeGateRulesetPayload = (existingRuleset = null) => {
  const existingStatusChecks = getRule(existingRuleset, 'required_status_checks')?.parameters?.required_status_checks || [];
  const verifyCheck = existingStatusChecks.find((check) => check?.context === 'verify');
  const requiredStatusChecks = verifyCheck
    ? [{
        context: 'verify',
        ...(typeof verifyCheck.integration_id === 'number' ? { integration_id: verifyCheck.integration_id } : {}),
      }]
    : [{ context: 'verify' }];

  return {
    name: MAIN_MERGE_GATE_RULESET_NAME,
    target: 'branch',
    enforcement: 'active',
    conditions: {
      ref_name: {
        include: [MAIN_MERGE_GATE_REF],
        exclude: [],
      },
    },
    rules: [
      {
        type: 'deletion',
      },
      {
        type: 'non_fast_forward',
      },
      {
        type: 'pull_request',
        parameters: {
          dismiss_stale_reviews_on_push: false,
          require_code_owner_review: false,
          require_last_push_approval: false,
          required_approving_review_count: 0,
          required_review_thread_resolution: true,
        },
      },
      {
        type: 'required_status_checks',
        parameters: {
          strict_required_status_checks_policy: true,
          required_status_checks: requiredStatusChecks,
        },
      },
      {
        type: 'required_deployments',
        parameters: {
          required_deployment_environments: ['preview'],
        },
      },
      {
        type: 'required_linear_history',
      },
    ],
    bypass_actors: [],
  };
};
