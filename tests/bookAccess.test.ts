import { describe, expect, it } from 'vitest';

import { BookAccessScope, BookCatalogSource, SubscriptionPlan, type BookMetadata } from '../types';
import { canAccessOfficialBook, normalizeBookVisibilityPolicy, normalizeOfficialBookText } from '../utils/bookAccess';

describe('book access helpers', () => {
  it('strips noisy import metadata from official book copy', () => {
    expect(normalizeOfficialBookText('Imported Catalog から投入')).toBeUndefined();
    expect(normalizeOfficialBookText('Nanjyo English App のオリジナル単語データベース')).toBe('オリジナル単語データベース');
  });

  it('applies default access scopes based on catalog source', () => {
    const original = normalizeBookVisibilityPolicy({
      id: 'starter',
      title: 'Starter',
      wordCount: 120,
      isPriority: true,
      catalogSource: BookCatalogSource.STEADY_STUDY_ORIGINAL,
    });
    const licensed = normalizeBookVisibilityPolicy({
      id: 'licensed',
      title: 'Licensed',
      wordCount: 240,
      isPriority: false,
      catalogSource: BookCatalogSource.LICENSED_PARTNER,
    });

    expect(original.accessScope).toBe(BookAccessScope.ALL_PLANS);
    expect(licensed.accessScope).toBe(BookAccessScope.BUSINESS_ONLY);
  });

  it('allows business-only books only for business paid plans', () => {
    const businessOnlyBook: BookMetadata = {
      id: 'licensed',
      title: 'Licensed',
      wordCount: 240,
      isPriority: false,
      catalogSource: BookCatalogSource.LICENSED_PARTNER,
      accessScope: BookAccessScope.BUSINESS_ONLY,
    };
    const allPlansBook: BookMetadata = {
      ...businessOnlyBook,
      id: 'starter',
      title: 'Starter',
      catalogSource: BookCatalogSource.STEADY_STUDY_ORIGINAL,
      accessScope: BookAccessScope.ALL_PLANS,
    };

    expect(canAccessOfficialBook(SubscriptionPlan.TOC_FREE, allPlansBook)).toBe(true);
    expect(canAccessOfficialBook(SubscriptionPlan.TOC_FREE, businessOnlyBook)).toBe(false);
    expect(canAccessOfficialBook(SubscriptionPlan.TOB_PAID, businessOnlyBook)).toBe(true);
  });
});
