import type { MotivationScopeStats, MotivationSnapshot } from '../../types';

export interface MotivationAggregateTotals {
  totalAnswers: number;
  totalCorrect: number;
  totalResponseTimeMs: number;
}

const toAccuracyRate = (totalCorrect: number, totalAnswers: number): number => (
  totalAnswers > 0 ? Math.round((totalCorrect / totalAnswers) * 100) : 0
);

const toAverageResponseTimeMs = (totalResponseTimeMs: number, totalAnswers: number): number | null => {
  if (totalAnswers <= 0 || totalResponseTimeMs <= 0) return null;
  return Math.round(totalResponseTimeMs / totalAnswers);
};

export const createMotivationScope = (
  scope: MotivationScopeStats['scope'],
  label: string,
  description: string,
  totals: MotivationAggregateTotals,
  registeredUsers: number,
): MotivationScopeStats => ({
  scope,
  label,
  description,
  totalAnswers: totals.totalAnswers,
  totalCorrect: totals.totalCorrect,
  accuracyRate: toAccuracyRate(totals.totalCorrect, totals.totalAnswers),
  totalStudyTimeMs: totals.totalResponseTimeMs,
  averageResponseTimeMs: toAverageResponseTimeMs(totals.totalResponseTimeMs, totals.totalAnswers),
  registeredUsers,
});

export const buildMockMotivationTotals = (
  personal: MotivationAggregateTotals,
  registeredUsers: number,
  averageAccuracy: number,
  averageResponseTimeMs: number,
): MotivationAggregateTotals => {
  const peerCount = Math.max(registeredUsers - 1, 0);
  const peerAnswers = peerCount * 96;
  const peerCorrect = Math.round(peerAnswers * averageAccuracy);
  const peerResponseTimeMs = peerAnswers * averageResponseTimeMs;

  return {
    totalAnswers: personal.totalAnswers + peerAnswers,
    totalCorrect: personal.totalCorrect + peerCorrect,
    totalResponseTimeMs: personal.totalResponseTimeMs + peerResponseTimeMs,
  };
};

export const createMotivationInsight = (scopes: MotivationScopeStats[]): MotivationSnapshot['insight'] => {
  const personal = scopes.find((scope) => scope.scope === 'PERSONAL');
  const comparison = scopes.find((scope) => scope.scope === 'GROUP') || scopes.find((scope) => scope.scope === 'GLOBAL');

  if (!personal || personal.totalAnswers === 0) {
    return {
      title: '最初の5問でモチベーションボードが動きます',
      body: '学習かテストを1セット進めると、総回答数・正解数・解答時間の集計がここから育ち始めます。',
    };
  }

  if (comparison && comparison.totalAnswers > 0) {
    const answerShare = Math.max(1, Math.round((personal.totalAnswers / comparison.totalAnswers) * 100));
    const timingCopy = personal.averageResponseTimeMs
      ? `平均解答時間は ${Math.round(personal.averageResponseTimeMs / 100) / 10} 秒です。`
      : '平均解答時間はこの更新以降の回答から集計します。';

    return {
      title: `あなたの回答が${comparison.label}の ${answerShare}% を占めています`,
      body: `正答率は ${personal.accuracyRate}% です。${timingCopy}`,
    };
  }

  return {
    title: `総回答数 ${personal.totalAnswers} 問まで積み上がりました`,
    body: `総正解数は ${personal.totalCorrect} 問、累計学習時間は ${Math.round(personal.totalStudyTimeMs / 60000)} 分です。`,
  };
};
