import { describe, expect, it } from 'vitest';
import { getLocalStudyAccessibleBooks } from '../services/storage/graduated-review-assignments';
import { buildBookSessionWords } from '../services/storage/learning-history';
import { BookAccessScope, BookCatalogSource, SubscriptionPlan, UserRole, type BookMetadata, type LearningHistory, type UserProfile, type WordData } from '../types';

const user: UserProfile = { uid: 'student', email: 'synthetic@example.test', displayName: 'Synthetic', role: UserRole.STUDENT, subscriptionPlan: SubscriptionPlan.TOC_FREE };
const personalBook = (id: string, createdBy: string): BookMetadata => ({ id, title: id, wordCount: 1, isPriority: false,
  catalogSource: BookCatalogSource.USER_GENERATED, description: JSON.stringify({ createdBy }) });
const officialBook = (id: string, accessScope: BookAccessScope, approved: boolean): BookMetadata => ({ id, title: id, wordCount: 1,
  isPriority: false, catalogSource: BookCatalogSource.STEADY_STUDY_ORIGINAL, accessScope, qualityGate: {
    status: approved ? 'approved' : 'missing_ledger', label: '', summary: '', isApprovedForLearner: approved,
    isSelectableForToday: approved, blockingReasons: [], warnings: [],
  } });

describe('local graduated-review authorization snapshot', () => {
  it('uses exact ownership rather than a user ID substring or prefixed owner', () => {
    const books = [personalBook('owned', 'student'), personalBook('other-prefixed-owner', 'student_other'),
      { ...personalBook('text-in-description', 'other'), description: 'mentions student' }];
    expect(getLocalStudyAccessibleBooks(books, user).map((book) => book.id)).toEqual(['owned']);
  });

  it('checks both current subscription access and learner material approval', () => {
    const books = [officialBook('free-approved', BookAccessScope.ALL_PLANS, true),
      officialBook('business-approved', BookAccessScope.BUSINESS_ONLY, true), officialBook('free-unapproved', BookAccessScope.ALL_PLANS, false)];
    expect(getLocalStudyAccessibleBooks(books, user).map((book) => book.id)).toEqual(['free-approved']);
    expect(getLocalStudyAccessibleBooks(books, { ...user, subscriptionPlan: SubscriptionPlan.TOB_PAID }).map((book) => book.id))
      .toEqual(['free-approved', 'business-approved']);
  });

  it('recomputes access after a book owner or approval changes', () => {
    const owned = personalBook('book', 'student');
    expect(getLocalStudyAccessibleBooks([owned], user)).toHaveLength(1);
    expect(getLocalStudyAccessibleBooks([{ ...owned, description: JSON.stringify({ createdBy: 'student_other' }) }], user)).toEqual([]);
    expect(getLocalStudyAccessibleBooks([officialBook('book', BookAccessScope.ALL_PLANS, false)], user)).toEqual([]);
  });

  it('never relabels an own STUDY graduated history with zero numeric fields as a new word', () => {
    const words: WordData[] = [1, 2].map((number) => ({ id: `w${number}`, bookId: 'book', number, word: `word${number}`, definition: `meaning${number}` }));
    const histories: LearningHistory[] = [{ wordId: 'w1', bookId: 'book', status: 'graduated', interactionSource: 'STUDY',
      lastStudiedAt: 1, nextReviewDate: 1000, interval: 0, easeFactor: 2.5, attemptCount: 0, correctCount: 0, totalResponseTimeMs: 0 }];
    expect(buildBookSessionWords({ words, histories, limit: 10, now: 10, selectionPolicy: 'BOOK_NEW_ONLY', wordRange: { start: 1, end: 2 } })
      .map((word) => word.id)).toEqual(['w2']);
  });
});
