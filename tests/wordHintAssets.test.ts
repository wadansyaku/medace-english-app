import { describe, expect, it } from 'vitest';

import { GeneratedAssetAuditStatus } from '../types';
import {
  getLearnerGeneratedAssetAuditStatus,
  getHintAuditTone,
  isGeneratedAssetVisibleToLearner,
  projectWordHintAssetsForLearner,
  resolveExampleTranslation,
  shouldAuditGeneratedAsset,
} from '../shared/wordHintAssets';

describe('word hint asset helpers', () => {
  it('marks never-audited assets as due', () => {
    expect(shouldAuditGeneratedAsset(1_000, null, 1_100)).toBe(true);
  });

  it('marks assets as due when the latest generation is newer than the audit', () => {
    expect(shouldAuditGeneratedAsset(2_000, 1_000, 2_100)).toBe(true);
  });

  it('keeps fresh audited assets out of the queue', () => {
    expect(shouldAuditGeneratedAsset(1_000, 1_500, 2_000, 5_000)).toBe(false);
  });

  it('shows source-authored assets without an AI generation timestamp', () => {
    expect(isGeneratedAssetVisibleToLearner({
      generatedAt: null,
      auditedAt: null,
      auditStatus: null,
      now: 10_000,
    })).toBe(true);
  });

  it('only shows approved assets audited after their generation', () => {
    expect(isGeneratedAssetVisibleToLearner({
      generatedAt: 1_000,
      auditedAt: 1_100,
      auditStatus: GeneratedAssetAuditStatus.APPROVED,
      now: 1_200,
      staleMs: 1_000,
    })).toBe(true);

    expect(isGeneratedAssetVisibleToLearner({
      generatedAt: 1_000,
      auditedAt: 1_100,
      auditStatus: GeneratedAssetAuditStatus.PENDING,
      now: 1_200,
      staleMs: 1_000,
    })).toBe(false);
    expect(isGeneratedAssetVisibleToLearner({
      generatedAt: 2_000,
      auditedAt: 1_100,
      auditStatus: GeneratedAssetAuditStatus.APPROVED,
      now: 2_100,
      staleMs: 1_000,
    })).toBe(false);
    expect(isGeneratedAssetVisibleToLearner({
      generatedAt: 1_000,
      auditedAt: 1_100,
      auditStatus: GeneratedAssetAuditStatus.APPROVED,
      now: 2_100,
      staleMs: 1_000,
    })).toBe(true);
  });

  it('keeps fixed approvals and review holds after elapsed time', () => {
    expect(getLearnerGeneratedAssetAuditStatus({
      generatedAt: 1_000,
      auditedAt: 1_100,
      auditStatus: GeneratedAssetAuditStatus.APPROVED,
      now: 2_100,
      staleMs: 1_000,
    })).toBe(GeneratedAssetAuditStatus.APPROVED);
    expect(getLearnerGeneratedAssetAuditStatus({
      generatedAt: 1_000,
      auditedAt: 1_100,
      auditStatus: GeneratedAssetAuditStatus.REVIEW_REQUIRED,
      now: 1_200,
      staleMs: 1_000,
    })).toBe(GeneratedAssetAuditStatus.REVIEW_REQUIRED);
  });

  it('projects the same learner-safe copy for cloud audit metadata and local records', () => {
    const generatedWord = {
      id: 'word-1',
      bookId: 'book-1',
      number: 1,
      word: 'acute',
      definition: '鋭い',
      exampleSentence: 'Pending generated example.',
      exampleMeaning: '承認待ちの例文。',
      exampleGeneratedAt: 1_000,
      exampleAuditStatus: GeneratedAssetAuditStatus.PENDING,
      exampleImageUrl: 'data:image/png;base64,pending',
      exampleImageGeneratedAt: 1_000,
      exampleImageAuditStatus: GeneratedAssetAuditStatus.PENDING,
    };

    expect(projectWordHintAssetsForLearner(generatedWord, { now: 1_200 })).toMatchObject({
      exampleSentence: null,
      exampleMeaning: null,
      exampleAuditStatus: GeneratedAssetAuditStatus.PENDING,
      exampleImageUrl: null,
      exampleImageAuditStatus: GeneratedAssetAuditStatus.PENDING,
    });
    expect(projectWordHintAssetsForLearner({
      ...generatedWord,
      exampleAuditStatus: GeneratedAssetAuditStatus.APPROVED,
      exampleImageAuditStatus: GeneratedAssetAuditStatus.APPROVED,
    }, {
      exampleAuditedAt: 1_100,
      exampleImageAuditedAt: 1_100,
      now: 1_200,
    })).toMatchObject({
      exampleSentence: 'Pending generated example.',
      exampleMeaning: '承認待ちの例文。',
      exampleAuditStatus: GeneratedAssetAuditStatus.APPROVED,
      exampleImageUrl: 'data:image/png;base64,pending',
      exampleImageAuditStatus: GeneratedAssetAuditStatus.APPROVED,
    });
  });

  it('keeps source-authored local hints visible when generatedAt is absent', () => {
    expect(projectWordHintAssetsForLearner({
      id: 'word-1',
      bookId: 'book-1',
      number: 1,
      word: 'acute',
      definition: '鋭い',
      exampleSentence: 'A source-authored example.',
      exampleMeaning: '教材由来の例文。',
    })).toMatchObject({
      exampleSentence: 'A source-authored example.',
      exampleMeaning: '教材由来の例文。',
    });
  });

  it('withholds an audited example whose generation provenance is missing', () => {
    expect(projectWordHintAssetsForLearner({
      id: 'word-1',
      bookId: 'book-1',
      number: 1,
      word: 'acute',
      definition: '鋭い',
      exampleSentence: 'A generated example with lost provenance.',
      exampleMeaning: '生成履歴が欠けた例文。',
      exampleGeneratedAt: null,
      exampleAuditStatus: GeneratedAssetAuditStatus.PENDING,
    })).toMatchObject({
      exampleSentence: null,
      exampleMeaning: null,
      exampleAuditStatus: GeneratedAssetAuditStatus.REVIEW_REQUIRED,
    });
  });

  it('never treats an image without generation provenance as source-authored', () => {
    expect(projectWordHintAssetsForLearner({
      id: 'word-1',
      bookId: 'book-1',
      number: 1,
      word: 'acute',
      definition: '鋭い',
      exampleImageUrl: '/api/word-hints/word-1/image',
      exampleImageGeneratedAt: null,
      exampleImageAuditStatus: GeneratedAssetAuditStatus.APPROVED,
    }, {
      exampleImageAuditedAt: 1_100,
      now: 1_200,
    })).toMatchObject({
      exampleImageUrl: null,
      exampleImageAuditStatus: GeneratedAssetAuditStatus.REVIEW_REQUIRED,
    });
  });


  it('falls back to the definition when the example translation is missing', () => {
    expect(resolveExampleTranslation({
      definition: '鋭い',
      exampleMeaning: '',
    })).toBe('語義: 鋭い');
    expect(resolveExampleTranslation({
      definition: '鋭い',
      exampleMeaning: '鋭い痛み',
    })).toBe('鋭い痛み');
  });


  it('returns a visible tone for review-required assets', () => {
    expect(getHintAuditTone(GeneratedAssetAuditStatus.REVIEW_REQUIRED)).toEqual({
      label: '見直し中',
      className: 'border-amber-200 bg-amber-50/80 text-amber-800',
    });
  });

  it('returns a visible tone while generated content is awaiting review', () => {
    expect(getHintAuditTone(GeneratedAssetAuditStatus.PENDING)).toEqual({
      label: '確認中',
      className: 'border-sky-200 bg-sky-50/80 text-sky-700',
    });
  });
});
