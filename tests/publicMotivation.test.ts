import { describe, expect, it } from 'vitest';

import { buildPublicMotivationSnapshot } from '../functions/_shared/public-motivation';
import type { MotivationScopeStats } from '../types';

const globalScope: MotivationScopeStats = {
  scope: 'GLOBAL',
  label: 'アプリ全体',
  description: '現在の利用者全体の累計です。',
  totalAnswers: 3200,
  totalCorrect: 2500,
  accuracyRate: 78,
  totalStudyTimeMs: 7_200_000,
  averageResponseTimeMs: 1900,
  registeredUsers: 128,
};

describe('buildPublicMotivationSnapshot', () => {
  it('uses live learner counts to produce a realtime headline', () => {
    const snapshot = buildPublicMotivationSnapshot({
      globalScope,
      activeLearners15m: 6,
      activeLearners24h: 42,
      wordsTouched24h: 380,
      updatedAt: 1_700_000_000_000,
    });

    expect(snapshot.snapshot.scopes).toEqual([globalScope]);
    expect(snapshot.snapshot.insight.title).toContain('6 人');
    expect(snapshot.snapshot.insight.body).toContain('42 人');
    expect(snapshot.wordsTouched24h).toBe(380);
    expect(snapshot.updatedAt).toBe(1_700_000_000_000);
  });

  it('falls back to a cumulative summary when no recent learners are active', () => {
    const snapshot = buildPublicMotivationSnapshot({
      globalScope,
      activeLearners15m: 0,
      activeLearners24h: 0,
      wordsTouched24h: 0,
    });

    expect(snapshot.snapshot.insight.title).toContain('3,200');
    expect(snapshot.snapshot.insight.body).toContain('128');
  });
});
