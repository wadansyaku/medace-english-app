import type { MotivationScopeStats, PublicMotivationSnapshot } from '../../types';

interface BuildPublicMotivationSnapshotInput {
  globalScope: MotivationScopeStats;
  activeLearners15m: number;
  activeLearners24h: number;
  wordsTouched24h: number;
  updatedAt?: number;
}

const createPublicInsight = ({
  globalScope,
  activeLearners15m,
  activeLearners24h,
  wordsTouched24h,
}: BuildPublicMotivationSnapshotInput): PublicMotivationSnapshot['snapshot']['insight'] => {
  if (globalScope.totalAnswers <= 0) {
    return {
      title: '最初の学習ログを待っています',
      body: '公開ホームでは、アプリ全体の累計と直近の動きを自動更新で表示します。',
    };
  }

  if (activeLearners15m > 0) {
    return {
      title: `直近15分で ${activeLearners15m} 人が学習しています`,
      body: `過去24時間では ${activeLearners24h} 人が ${wordsTouched24h.toLocaleString('ja-JP')} 語に触れました。`,
    };
  }

  if (activeLearners24h > 0) {
    return {
      title: `今日は ${activeLearners24h} 人が学習しました`,
      body: `直近24時間で ${wordsTouched24h.toLocaleString('ja-JP')} 語の復習ログが更新されています。`,
    };
  }

  return {
    title: `累計 ${globalScope.totalAnswers.toLocaleString('ja-JP')} 回の回答が積み上がっています`,
    body: `現在の正答率は ${globalScope.accuracyRate}%、登録学習者は ${globalScope.registeredUsers.toLocaleString('ja-JP')} 人です。`,
  };
};

export const buildPublicMotivationSnapshot = (
  input: BuildPublicMotivationSnapshotInput,
): PublicMotivationSnapshot => ({
  snapshot: {
    scopes: [input.globalScope],
    insight: createPublicInsight(input),
  },
  activeLearners15m: input.activeLearners15m,
  activeLearners24h: input.activeLearners24h,
  wordsTouched24h: input.wordsTouched24h,
  updatedAt: input.updatedAt || Date.now(),
});
