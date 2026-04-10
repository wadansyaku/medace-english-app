import {
  AI_PRICING_VERSION,
  AI_ACTION_ESTIMATES,
  getAiActionEstimate,
  getSubscriptionPolicy,
  type MeteredAiAction,
} from '../../config/subscription';
import type { WritingAiProvider } from '../../types';
import { formatMonthKey } from '../../utils/date';
import type { ApiRequestLogContext } from './api-routes/runtime';
import { HttpError } from './http';
import type { AppEnv, DbUserRow } from './types';

const currentMonthKey = (): string => formatMonthKey(new Date());

const getUserSubscriptionPolicy = (user: DbUserRow) => getSubscriptionPolicy(user.subscription_plan as any);

export const assertAiActionAllowed = (
  user: DbUserRow,
  action: MeteredAiAction,
): void => {
  const policy = getUserSubscriptionPolicy(user);
  if (!policy.allowedAiActions.includes(action)) {
    throw new HttpError(403, `${policy.label} では ${AI_ACTION_ESTIMATES[action].label} を利用できません。`);
  }
};

export const assertBudgetAvailable = async (
  env: AppEnv,
  user: DbUserRow,
  action: MeteredAiAction,
  estimatedCostMilliYen = AI_ACTION_ESTIMATES[action].estimatedCostMilliYen,
): Promise<void> => {
  assertAiActionAllowed(user, action);

  if (estimatedCostMilliYen <= 0) return;

  const policy = getUserSubscriptionPolicy(user);
  const monthKey = currentMonthKey();
  const row = await env.DB.prepare(`
    SELECT COALESCE(SUM(estimated_cost_milli_yen), 0) AS total
    FROM ai_usage_events
    WHERE user_id = ? AND month_key = ?
  `).bind(user.id, monthKey).first() as { total: number } | null;

  const projected = Number(row?.total || 0) + estimatedCostMilliYen;
  if (projected > policy.monthlyAiBudgetMilliYen) {
    throw new HttpError(429, `今月のAI利用上限に達しました。現在プラン: ${policy.label}`);
  }
};

export interface AiUsageEventInput {
  action: MeteredAiAction;
  provider?: WritingAiProvider;
  model?: string;
  usedAi: boolean;
  estimatedCostMilliYen?: number;
  estimatedProviderCostMilliYen?: number;
  requestUnits?: number;
  pricingVersion?: string;
  providerInputUnits?: number;
  providerOutputUnits?: number;
  providerAssetCount?: number;
  logContext?: AiUsageLogContext;
}

export interface AiUsageLogContext extends ApiRequestLogContext {
  source?: 'api.ai' | 'writing';
}

export const recordAiUsageEvent = async (
  env: AppEnv,
  user: DbUserRow,
  input: AiUsageEventInput,
): Promise<void> => {
  const estimate = getAiActionEstimate(input.action);
  const estimatedCostMilliYen = input.estimatedCostMilliYen
    ?? (input.usedAi ? estimate.estimatedCostMilliYen : 0);
  const estimatedProviderCostMilliYen = input.estimatedProviderCostMilliYen
    ?? estimatedCostMilliYen;
  const requestUnits = Math.max(0, Math.trunc(input.requestUnits ?? 1));
  const providerInputUnits = Math.max(0, Math.trunc(input.providerInputUnits ?? requestUnits));
  const providerOutputUnits = Math.max(0, Math.trunc(input.providerOutputUnits ?? (input.usedAi ? 1 : 0)));
  const providerAssetCount = Math.max(0, Math.trunc(input.providerAssetCount ?? (input.action === 'generateWordImage' && input.usedAi ? 1 : 0)));

  await env.DB.prepare(`
    INSERT INTO ai_usage_events (
      user_id,
      action,
      model,
      provider,
      estimated_cost_milli_yen,
      request_units,
      used_ai,
      month_key,
      pricing_version,
      provider_input_units,
      provider_output_units,
      provider_asset_count,
      estimated_provider_cost_milli_yen,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    user.id,
    input.action,
    input.model || estimate.model,
    input.provider || 'GEMINI',
    estimatedCostMilliYen,
    requestUnits,
    input.usedAi ? 1 : 0,
    currentMonthKey(),
    input.pricingVersion || AI_PRICING_VERSION,
    providerInputUnits,
    providerOutputUnits,
    providerAssetCount,
    estimatedProviderCostMilliYen,
    Date.now(),
  ).run();

  console.log(JSON.stringify({
    type: 'ai_usage_event',
    source: input.logContext?.source || 'unknown',
    action: input.action,
    requestId: input.logContext?.requestId || null,
    pathname: input.logContext?.pathname || null,
    method: input.logContext?.method || null,
    deployment: input.logContext?.deployment || null,
    deploymentSha: input.logContext?.deploymentSha || null,
    userId: user.id,
    organizationId: user.organization_id || null,
    provider: input.provider || 'GEMINI',
    model: input.model || estimate.model,
    usedAi: input.usedAi,
    estimatedCostMilliYen,
    estimatedProviderCostMilliYen,
    requestUnits,
    pricingVersion: input.pricingVersion || AI_PRICING_VERSION,
    providerInputUnits,
    providerOutputUnits,
    providerAssetCount,
  }));
};
