import { describe, expect, it } from 'vitest';

import {
  buildDashboardBookCollections,
  buildDashboardProgressMap,
  buildDashboardSnapshotModel,
} from '../functions/_shared/dashboard-snapshot-model';
import type { DbBookRow } from '../functions/_shared/storage-support';
import type { DbUserRow } from '../functions/_shared/types';
import {
  BookAccessScope,
  BookCatalogSource,
  SubscriptionPlan,
  UserRole,
  type BookProgress,
} from '../types';

const makeUser = (overrides: Partial<DbUserRow> = {}): DbUserRow => ({
  id: 'student-1',
  email: 'student@example.com',
  password_hash: null,
  display_name: 'Student One',
  role: UserRole.STUDENT,
  grade: null,
  english_level: null,
  subscription_plan: SubscriptionPlan.TOC_FREE,
  organization_id: null,
  organization_name: null,
  organization_role: null,
  study_mode: null,
  stats_xp: null,
  stats_level: null,
  stats_current_streak: null,
  stats_last_login_date: null,
  created_at: 1,
  updated_at: 1,
  ...overrides,
});

const makeBookRow = (overrides: Partial<DbBookRow>): DbBookRow => ({
  id: 'book-1',
  title: 'Book 1',
  word_count: 100,
  is_priority: 0,
  description: null,
  source_context: null,
  created_by: null,
  catalog_source: BookCatalogSource.STEADY_STUDY_ORIGINAL,
  access_scope: BookAccessScope.ALL_PLANS,
  ledger_source_id: 'ledger-1',
  ledger_rights_status: 'approved',
  ledger_review_status: 'approved',
  ledger_content_qa_report: '{}',
  ledger_qa_word_count: 100,
  ledger_qa_required_blank_rows: 0,
  ledger_qa_rows_with_sentinel: 0,
  ledger_qa_sentinel_value_count: 0,
  ledger_qa_duplicate_headword_count: 0,
  ledger_qa_source_coverage_rate: 1,
  ledger_qa_example_pair_coverage_rate: 1,
  ...overrides,
});

describe('dashboard snapshot model helpers', () => {
  it('partitions visible books into sorted official and personal collections', () => {
    const user = makeUser();
    const rows: DbBookRow[] = [
      makeBookRow({ id: 'official-z', title: 'Zeta', is_priority: 0 }),
      makeBookRow({ id: 'mine-a', title: 'My A', created_by: user.id, catalog_source: BookCatalogSource.USER_GENERATED, ledger_source_id: null }),
      makeBookRow({ id: 'official-a', title: 'Alpha', is_priority: 0 }),
      makeBookRow({ id: 'mine-z', title: 'My Z', created_by: user.id, catalog_source: BookCatalogSource.USER_GENERATED, ledger_source_id: null }),
      makeBookRow({ id: 'official-priority', title: 'Priority', is_priority: 1 }),
    ];

    const collections = buildDashboardBookCollections(rows, user);

    expect(collections.officialBooks.map((book) => book.id)).toEqual([
      'official-priority',
      'official-a',
      'official-z',
    ]);
    expect(collections.myBooks.map((book) => book.id)).toEqual(['mine-z', 'mine-a']);
  });

  it('keeps non-selectable visible books out of today selectable candidates', () => {
    const user = makeUser({ subscription_plan: SubscriptionPlan.TOB_PAID });
    const rows: DbBookRow[] = [
      makeBookRow({ id: 'approved-official', title: 'Approved' }),
      makeBookRow({
        id: 'missing-ledger-official',
        title: 'Missing Ledger',
        ledger_source_id: null,
      }),
      makeBookRow({
        id: 'business-only-official',
        title: 'Business Only',
        access_scope: BookAccessScope.BUSINESS_ONLY,
      }),
      makeBookRow({
        id: 'my-book',
        title: 'My Book',
        created_by: user.id,
        catalog_source: BookCatalogSource.USER_GENERATED,
        ledger_source_id: null,
      }),
    ];

    const collections = buildDashboardBookCollections(rows, user);

    expect(collections.officialBooks.map((book) => book.id)).toEqual([
      'approved-official',
      'business-only-official',
      'missing-ledger-official',
    ]);
    expect(collections.myBooks.map((book) => book.id)).toEqual(['my-book']);
    expect(collections.todaySelectableBooks.map((book) => book.id)).toEqual([
      'approved-official',
      'business-only-official',
      'my-book',
    ]);
  });

  it('builds progress map by book id with later results winning duplicate ids', () => {
    const first: BookProgress = {
      bookId: 'book-1',
      learnedCount: 3,
      totalCount: 10,
      percentage: 30,
    };
    const updated: BookProgress = {
      bookId: 'book-1',
      learnedCount: 5,
      totalCount: 10,
      percentage: 50,
    };
    const other: BookProgress = {
      bookId: 'book-2',
      learnedCount: 1,
      totalCount: 4,
      percentage: 25,
    };

    expect(buildDashboardProgressMap([first, other, updated])).toEqual({
      'book-1': updated,
      'book-2': other,
    });
  });

  it('assembles dashboard snapshots from read parts and progress results', () => {
    const progress: BookProgress = {
      bookId: 'book-1',
      learnedCount: 5,
      totalCount: 10,
      percentage: 50,
    };

    const snapshot = buildDashboardSnapshotModel({
      dueCount: 3,
      officialBooks: [{ id: 'book-1', title: 'Book 1', wordCount: 10, isPriority: false }],
      myBooks: [],
      progressResults: [progress],
      learningPlan: null,
      learningPreference: null,
      weaknessProfile: null,
      leaderboard: [],
      masteryDist: {
        new: 5,
        learning: 3,
        review: 1,
        graduated: 1,
        total: 10,
      },
      activityLogs: [],
      motivationSnapshot: {
        scopes: [],
        insight: {
          title: 'まだ学習データがありません',
          body: '最初の学習で集計が始まります。',
        },
      },
      coachNotifications: [],
      primaryMission: null,
      accountOverview: {
        subscriptionPlan: SubscriptionPlan.TOC_FREE,
        priceLabel: '無料',
        pricingNote: '',
        audienceLabel: '個人',
        featureSummary: [],
        aiUsage: {
          monthKey: '2026-06',
          estimatedCostMilliYen: 0,
          budgetMilliYen: 0,
          remainingMilliYen: 0,
          generationCount: 0,
          cacheHitCount: 0,
          cacheHitRatio: 0,
          avoidedCostMilliYen: 0,
          actionCounts: {},
        },
      },
      commercialRequests: [],
    });

    expect(snapshot.progressMap).toEqual({ 'book-1': progress });
    expect(snapshot.officialBooks.map((book) => book.id)).toEqual(['book-1']);
    expect(snapshot.dueCount).toBe(3);
  });
});
