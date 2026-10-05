import type { WritingAiCapabilities } from '../../contracts/writing-ai-drafts';
import { AI_MONTHLY_PLAN_LIMIT_MICRO_USD, AI_MONTHLY_DISPATCH_LIMIT_MICRO_USD } from './ai-provider-budget';
import type { AppEnv } from './types';

// Only a private network-free regression copy may replace this literal. Neither
// request data, secrets nor environment configuration enable legacy grading.
const SYNTHETIC_WRITING_REGRESSION_CAPABILITIES = false;
export const WRITING_OPENAI_MODEL = 'gpt-4.1-mini-2025-04-14';

export const isWritingOpenAiConfigured = (env: AppEnv): boolean =>
  env.OPENAI_WRITING_ENABLED === 'true' && Boolean(env.OPENAI_API_KEY?.trim())
  && env.OPENAI_WRITING_DATA_POLICY === 'operator-approved-v1';

export const writingAiCapabilities = (env: AppEnv, approved = false): WritingAiCapabilities => {
  const enabled = isWritingOpenAiConfigured(env) && approved;
  return {
    provider: 'OPENAI', model: WRITING_OPENAI_MODEL,
    state: enabled ? 'ENABLED' : isWritingOpenAiConfigured(env) ? 'REQUIRES_DATA_APPROVAL' : 'DISABLED',
    ocrEnabled: enabled, feedbackEnabled: enabled, pdfOcrEnabled: false,
    gradingEnabled: SYNTHETIC_WRITING_REGRESSION_CAPABILITIES,
    draftSavingEnabled: true,
    message: enabled
      ? 'GPTは未評価の下書きだけを作成します。原本を人が確認してください。成績は確定しません。'
      : 'GPT画像読み取り・個別添削は未有効です。原本と手入力を未評価の下書きとして保存できます。成績・提出完了にはなりません。',
    monthlyPlanLimitMicroUsd: AI_MONTHLY_PLAN_LIMIT_MICRO_USD,
    dispatchLimitMicroUsd: AI_MONTHLY_DISPATCH_LIMIT_MICRO_USD,
  };
};
