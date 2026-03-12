import {
  AI_ACTION_ESTIMATES,
  getSubscriptionPolicy,
  type MeteredAiAction,
} from '../../config/subscription';
import type { WritingAiProvider } from '../../types';
import { HttpError } from './http';
import type { AppEnv, DbUserRow } from './types';

const currentMonthKey = (): string => new Date().toISOString().slice(0, 7);

const getUserSubscriptionPolicy = (user: DbUserRow) => getSubscriptionPolicy(user.subscription_plan as any);

export const assertAiActionAllowed = (
  user: DbUserRow,
  action: MeteredAiAction,
): void => {
  const policy = getUserSubscriptionPolicy(user);
  if (!policy.allowedAiActions.includes(action)) {
    throw new HttpError(403, `${policy.label} ではこの AI 機能を利用できません。`);
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
  requestUnits?: number;
}

export const recordAiUsageEvent = async (
  env: AppEnv,
  user: DbUserRow,
  input: AiUsageEventInput,
): Promise<void> => {
  const estimate = AI_ACTION_ESTIMATES[input.action];
  const estimatedCostMilliYen = input.estimatedCostMilliYen
    ?? (input.usedAi ? estimate.estimatedCostMilliYen : 0);

  await env.DB.prepare(`
    INSERT INTO ai_usage_events (
      user_id, action, model, provider, estimated_cost_milli_yen, request_units, used_ai, month_key, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    user.id,
    input.action,
    input.model || estimate.model,
    input.provider || 'GEMINI',
    estimatedCostMilliYen,
    input.requestUnits || 1,
    input.usedAi ? 1 : 0,
    currentMonthKey(),
    Date.now(),
  ).run();
};
