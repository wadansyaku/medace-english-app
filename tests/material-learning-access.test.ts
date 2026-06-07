import { describe, expect, it, vi } from 'vitest';

import { handleGetBookProgress } from '../functions/_shared/storage-learning-actions';
import { assertBookLearningAccess, type DbBookRow } from '../functions/_shared/storage-support';
import { BookAccessScope, BookCatalogSource, SubscriptionPlan, UserRole } from '../types';

const makeBookRow = (overrides: Partial<DbBookRow> = {}): DbBookRow => ({
  id: 'book-1',
  title: 'Book 1',
  word_count: 120,
  is_priority: 0,
  description: null,
  source_context: null,
  created_by: null,
  catalog_source: BookCatalogSource.STEADY_STUDY_ORIGINAL,
  access_scope: BookAccessScope.ALL_PLANS,
  ledger_source_id: 'ledger-book-1',
  ledger_rights_status: 'approved',
  ledger_review_status: 'approved',
  ledger_content_qa_report: 'content-qa.json',
  ledger_qa_word_count: 120,
  ledger_qa_required_blank_rows: 0,
  ledger_qa_rows_with_sentinel: 0,
  ledger_qa_sentinel_value_count: 0,
  ledger_qa_duplicate_headword_count: 0,
  ledger_qa_source_coverage_rate: 1,
  ledger_qa_example_pair_coverage_rate: 1,
  ...overrides,
});

const makeEnv = (book: DbBookRow | null) => {
  const first = vi.fn().mockResolvedValue(book);
  const bind = vi.fn(() => ({ first }));
  const prepare = vi.fn(() => ({ bind }));
  return { env: { DB: { prepare } } as any, prepare, bind, first };
};

describe('material learning access', () => {
  it('allows approved official materials for learners with catalog access', async () => {
    const { env } = makeEnv(makeBookRow());

    await expect(assertBookLearningAccess(env, {
      id: 'student-1',
      role: UserRole.STUDENT,
      subscription_plan: SubscriptionPlan.TOC_FREE,
    } as any, 'book-1')).resolves.toBeUndefined();
  });

  it('blocks review-pending official materials from learner study and quiz entrypoints', async () => {
    const { env } = makeEnv(makeBookRow({
      ledger_rights_status: 'pending',
      ledger_review_status: 'needs_review',
    }));

    await expect(assertBookLearningAccess(env, {
      id: 'student-1',
      role: UserRole.STUDENT,
      subscription_plan: SubscriptionPlan.TOB_PAID,
    } as any, 'book-1')).rejects.toMatchObject({
      status: 403,
      message: 'この教材は確認中のため、学習やテストにはまだ使えません。',
    });
  });

  it('keeps service admins able to inspect review-pending material', async () => {
    const { env } = makeEnv(makeBookRow({
      ledger_rights_status: 'pending',
      ledger_review_status: 'needs_review',
    }));

    await expect(assertBookLearningAccess(env, {
      id: 'admin-1',
      role: UserRole.ADMIN,
      subscription_plan: SubscriptionPlan.TOB_PAID,
    } as any, 'book-1')).resolves.toBeUndefined();
  });

  it('blocks review-pending materials from direct progress reads', async () => {
    const { env } = makeEnv(makeBookRow({
      ledger_rights_status: 'pending',
      ledger_review_status: 'needs_review',
    }));

    await expect(handleGetBookProgress(env, {
      id: 'student-1',
      role: UserRole.STUDENT,
      subscription_plan: SubscriptionPlan.TOB_PAID,
    } as any, 'book-1')).rejects.toMatchObject({
      status: 403,
      message: 'この教材は確認中のため、学習やテストにはまだ使えません。',
    });
  });
});
