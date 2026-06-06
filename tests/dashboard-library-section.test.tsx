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
});
