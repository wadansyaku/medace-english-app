import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import DashboardLibrarySection from '../components/dashboard/DashboardLibrarySection';
import { BookAccessScope, BookCatalogSource, type BookMetadata } from '../types';

const makePersonalBook = (): BookMetadata => ({
  id: 'personal-1',
  title: 'My単語帳',
  wordCount: 120,
  isPriority: true,
  catalogSource: BookCatalogSource.USER_GENERATED,
  accessScope: BookAccessScope.ALL_PLANS,
});

const makeBlockedOfficialBook = (): BookMetadata => ({
  id: 'blocked-1',
  title: '確認中教材',
  wordCount: 120,
  isPriority: true,
  catalogSource: BookCatalogSource.STEADY_STUDY_ORIGINAL,
  accessScope: BookAccessScope.ALL_PLANS,
  qualityGate: {
    status: 'source_review_required',
    label: '出典確認',
    summary: 'source ledger確認待ちです。',
    isApprovedForLearner: false,
    isSelectableForToday: false,
    blockingReasons: ['権利確認が pending です。'],
    warnings: [],
  },
});

const makeApprovedOfficialBook = (): BookMetadata => ({
  id: 'approved-1',
  title: '承認済み教材',
  wordCount: 160,
  isPriority: true,
  catalogSource: BookCatalogSource.STEADY_STUDY_ORIGINAL,
  accessScope: BookAccessScope.ALL_PLANS,
  qualityGate: {
    status: 'approved',
    label: '承認済み',
    summary: 'source ledgerとcontent QAの両方を通過しています。',
    isApprovedForLearner: true,
    isSelectableForToday: true,
    blockingReasons: [],
    warnings: [],
  },
});

const makeUngatedOfficialBook = (): BookMetadata => ({
  id: 'ungated-1',
  title: '台帳未確認教材',
  wordCount: 100,
  isPriority: false,
  catalogSource: BookCatalogSource.STEADY_STUDY_ORIGINAL,
  accessScope: BookAccessScope.ALL_PLANS,
});

describe('DashboardLibrarySection', () => {
  it('keeps the first material creation action out of the library empty state', () => {
    const rendered = renderToStaticMarkup(
      <DashboardLibrarySection
        books={[]}
        myBooks={[]}
        primaryRecommendedBook={null}
        secondaryRecommendedBooks={[]}
        progressMap={{}}
        showLibrary={false}
        onToggleLibrary={() => undefined}
        onOpenCreateModal={() => undefined}
        onDelete={() => undefined}
        onPrepareExamples={() => undefined}
        onSelect={() => undefined}
      />,
    );

    expect(rendered).toContain('まだMy単語帳がありません');
    expect(rendered).toContain('最初の教材を作ると、ここに単語帳と進捗が表示されます。');
    expect(rendered).not.toContain('今すぐ作成する');
    expect(rendered).not.toContain('新規作成');
  });

  it('keeps additional material creation available after a personal book exists', () => {
    const rendered = renderToStaticMarkup(
      <DashboardLibrarySection
        books={[]}
        myBooks={[makePersonalBook()]}
        primaryRecommendedBook={null}
        secondaryRecommendedBooks={[]}
        progressMap={{}}
        showLibrary={false}
        onToggleLibrary={() => undefined}
        onOpenCreateModal={() => undefined}
        onDelete={() => undefined}
        onPrepareExamples={() => undefined}
        onSelect={() => undefined}
      />,
    );

    expect(rendered).toContain('新規作成');
  });

  it('shows review-pending official books as unavailable instead of startable material', () => {
    const blockedBook = makeBlockedOfficialBook();
    const rendered = renderToStaticMarkup(
      <DashboardLibrarySection
        books={[blockedBook]}
        myBooks={[]}
        primaryRecommendedBook={null}
        secondaryRecommendedBooks={[]}
        blockedOfficialBookCount={1}
        progressMap={{}}
        showLibrary
        onToggleLibrary={() => undefined}
        onOpenCreateModal={() => undefined}
        onDelete={() => undefined}
        onPrepareExamples={() => undefined}
        onSelect={() => undefined}
      />,
    );

    expect(rendered).toContain('配布教材 1 冊は確認中です。承認後に学習・テストで使えます。');
    expect(rendered).toContain('この教材は確認中です。承認後に学習やテストで使えます。');
    expect(rendered).toContain('disabled=""');
  });

  it('treats official books without quality gates as confirmation-pending material', () => {
    const ungatedBook = makeUngatedOfficialBook();
    const rendered = renderToStaticMarkup(
      <DashboardLibrarySection
        books={[ungatedBook]}
        myBooks={[]}
        primaryRecommendedBook={null}
        secondaryRecommendedBooks={[]}
        blockedOfficialBookCount={1}
        progressMap={{}}
        showLibrary
        onToggleLibrary={() => undefined}
        onOpenCreateModal={() => undefined}
        onDelete={() => undefined}
        onPrepareExamples={() => undefined}
        onSelect={() => undefined}
      />,
    );

    expect(rendered).toContain('台帳未確認教材');
    expect(rendered).toContain('確認中');
    expect(rendered).toContain('この教材は確認中です。承認後に学習やテストで使えます。');
    expect(rendered).toContain('disabled=""');
  });

  it('keeps the review-pending notice when approved official material is also recommended', () => {
    const approvedBook = makeApprovedOfficialBook();
    const rendered = renderToStaticMarkup(
      <DashboardLibrarySection
        books={[approvedBook]}
        myBooks={[]}
        primaryRecommendedBook={approvedBook}
        secondaryRecommendedBooks={[]}
        blockedOfficialBookCount={2}
        progressMap={{}}
        showLibrary={false}
        onToggleLibrary={() => undefined}
        onOpenCreateModal={() => undefined}
        onDelete={() => undefined}
        onPrepareExamples={() => undefined}
        onSelect={() => undefined}
      />,
    );

    expect(rendered).toContain('承認済み教材');
    expect(rendered).toContain('配布教材 2 冊は確認中です。承認後に学習・テストで使えます。');
  });
});
