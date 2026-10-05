import { HttpError } from './http';
import { createDisabledAiProviderBoundary } from './ai-provider-boundary';

const productionBoundary = createDisabledAiProviderBoundary();

// This candidate has no approved live provider, price schedule, durable USD
// reservations, or learner-data agreement. A key/binding alone cannot enable it.
export const rejectLegacyLiveAi = (): never => {
  if (productionBoundary.mode !== 'DISABLED') throw new HttpError(503, 'AI provider設定を確認できません。');
  throw new HttpError(503, 'AIの自動処理は停止しています。保存済み教材・テンプレートをご利用ください。個別答案は講師と確認してください。');
};
