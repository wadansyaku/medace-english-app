import { describe, expect, it } from 'vitest';

import { GeneratedAssetAuditStatus } from '../types';
import {
  createLocalExampleHint,
  createWordImagePlaceholderDataUrl,
  getHintAuditTone,
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

  it('creates deterministic local example fallbacks', () => {
    expect(createLocalExampleHint('apple', 'a fruit', 0)).toEqual({
      sentence: 'We use "apple" when talking about a fruit.',
      translation: '「apple」は a fruit の話をするときに使います。',
    });
    expect(createLocalExampleHint('apple', 'a fruit', 1).sentence).toContain('teacher');
  });

  it('creates svg placeholder images', () => {
    const url = createWordImagePlaceholderDataUrl('orbit', 'round path');
    expect(url.startsWith('data:image/svg+xml')).toBe(true);
    expect(url).toContain('orbit');
  });

  it('returns a visible tone for review-required assets', () => {
    expect(getHintAuditTone(GeneratedAssetAuditStatus.REVIEW_REQUIRED)).toEqual({
      label: '再確認推奨',
      className: 'border-amber-200 bg-amber-50/80 text-amber-800',
    });
  });
});
