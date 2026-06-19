import { describe, expect, it } from 'vitest';

import {
  evaluateMaterialQualityGate,
  getLearnerMaterialQualityMessage,
  getOperatorMaterialQualityMessage,
  isBookApprovedForLearner,
  isBookSelectableForToday,
  resolveLearnerMaterialQualityGate,
  type MaterialSourceLedgerSnapshot,
} from '../shared/materialQuality';
import { BookCatalogSource, type BookMetadata } from '../types';

const baseBook: BookMetadata = {
  id: 'book-1',
  title: 'Book 1',
  wordCount: 120,
  isPriority: false,
  catalogSource: BookCatalogSource.STEADY_STUDY_ORIGINAL,
};

const approvedLedger: MaterialSourceLedgerSnapshot = {
  sourceId: 'ledger-book-1',
  rightsStatus: 'approved',
  reviewStatus: 'approved',
  contentQaReport: 'content-qa.json',
  qaWordCount: 120,
  qaRequiredBlankRows: 0,
  qaRowsWithSentinel: 0,
  qaSentinelValueCount: 0,
  qaDuplicateHeadwordCount: 0,
  qaSourceCoverageRate: 1,
  qaExamplePairCoverageRate: 1,
};

describe('material quality gate', () => {
  it('approves learner selection only when source ledger and content QA both pass', () => {
    const gate = evaluateMaterialQualityGate(baseBook, approvedLedger);

    expect(gate.status).toBe('approved');
    expect(gate.isApprovedForLearner).toBe(true);
    expect(gate.isSelectableForToday).toBe(true);
  });

  it('keeps review-pending source material out of Today Focus even when QA has no blocking rows', () => {
    const gate = evaluateMaterialQualityGate(baseBook, {
      ...approvedLedger,
      rightsStatus: 'pending',
      reviewStatus: 'needs_review',
      qaDuplicateHeadwordCount: 2,
      qaSourceCoverageRate: 0,
    });

    expect(gate.status).toBe('source_review_required');
    expect(gate.isSelectableForToday).toBe(false);
    expect(gate.blockingReasons.join('\n')).toContain('pending');
    expect(gate.warnings.join('\n')).toContain('重複headword');
  });

  it('blocks QA failures regardless of source status', () => {
    const gate = evaluateMaterialQualityGate(baseBook, {
      ...approvedLedger,
      qaRowsWithSentinel: 1,
      qaSentinelValueCount: 2,
    });

    expect(gate.status).toBe('qa_blocked');
    expect(gate.isApprovedForLearner).toBe(false);
  });

  it('escalates approved material warnings to operators without blocking learners', () => {
    const gate = evaluateMaterialQualityGate(baseBook, {
      ...approvedLedger,
      qaDuplicateHeadwordCount: 2,
      qaSourceCoverageRate: 0.95,
    });

    expect(gate.status).toBe('approved');
    expect(gate.isSelectableForToday).toBe(true);
    expect(getLearnerMaterialQualityMessage(gate)).toBe('学習に使える教材です。');
    expect(getOperatorMaterialQualityMessage(gate)).toContain('重複headword');
    expect(getOperatorMaterialQualityMessage(gate)).toContain('次回教材更新までに確認');
  });

  it('treats user-generated books as selectable personal material', () => {
    const gate = evaluateMaterialQualityGate({
      ...baseBook,
      catalogSource: BookCatalogSource.USER_GENERATED,
    }, null);

    expect(gate.status).toBe('user_generated');
    expect(gate.isSelectableForToday).toBe(true);
    expect(isBookSelectableForToday({ ...baseBook, qualityGate: gate })).toBe(true);
  });

  it('fails closed when an official book is missing its quality gate', () => {
    const bookWithoutGate: BookMetadata = {
      ...baseBook,
      qualityGate: undefined,
    };

    const gate = resolveLearnerMaterialQualityGate(bookWithoutGate);

    expect(gate).toMatchObject({
      status: 'missing_ledger',
      label: '確認中',
      isApprovedForLearner: false,
      isSelectableForToday: false,
    });
    expect(isBookSelectableForToday(bookWithoutGate)).toBe(false);
    expect(isBookApprovedForLearner(bookWithoutGate)).toBe(false);
    expect(getLearnerMaterialQualityMessage(gate)).toBe('この教材は確認中です。承認後に学習やテストで使えます。');
  });

  it('uses learner-facing copy for review-pending material', () => {
    const gate = evaluateMaterialQualityGate(baseBook, {
      ...approvedLedger,
      rightsStatus: 'pending',
      reviewStatus: 'needs_review',
    });

    const message = getLearnerMaterialQualityMessage(gate);

    expect(message).toBe('この教材は確認中です。承認後に学習やテストで使えます。');
    expect(message).not.toContain('source ledger');
    expect(message).not.toContain('QA');
  });
});
