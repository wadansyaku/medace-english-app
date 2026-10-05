import { HttpError } from './http';

// This candidate has no approved live provider, price schedule, durable USD
// reservations, or learner-data agreement. A key/binding alone cannot enable it.
export const rejectLegacyLiveAi = (): never => {
  throw new HttpError(503, 'AIの自動処理は停止しています。保存済み教材・テンプレートをご利用ください。個別答案は講師と確認してください。');
};
