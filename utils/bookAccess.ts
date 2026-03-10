import { BookAccessScope, BookCatalogSource, BookMetadata, SubscriptionPlan } from '../types';

export const normalizeOfficialBookText = (value: string | null | undefined): string | undefined => {
  if (!value) return undefined;
  const normalized = value
    .replaceAll('Nanjyo English App のオリジナル単語データベース', 'オリジナル単語データベース')
    .replaceAll('Nanjyo English App', 'オリジナル単語データベース')
    .replaceAll('オリジナル単語データベース のオリジナル単語データベース', 'オリジナル単語データベース')
    .replaceAll('NanjyoEnglishApp', 'original_wordbank')
    .trim();

  if (!normalized) return undefined;
  if (/Licensed Partner Catalog/i.test(normalized)) return undefined;
  if (/Imported Catalog/i.test(normalized)) return undefined;
  if (/MASTER_DATABASE_REFINED\.csv/i.test(normalized)) return undefined;
  if (/\.csv\b/i.test(normalized) && /投入/.test(normalized)) return undefined;
  if (/として\s+.+\.csv\s+から投入/.test(normalized)) return undefined;

  return normalized;
};

export const normalizeBookVisibilityPolicy = (book: BookMetadata): BookMetadata => {
  const sanitizedBook = {
    ...book,
    description: normalizeOfficialBookText(book.description),
    sourceContext: normalizeOfficialBookText(book.sourceContext),
  };

  if (sanitizedBook.catalogSource === BookCatalogSource.USER_GENERATED) return sanitizedBook;
  if (sanitizedBook.accessScope) return sanitizedBook;

  return {
    ...sanitizedBook,
    accessScope: sanitizedBook.catalogSource === BookCatalogSource.STEADY_STUDY_ORIGINAL
      ? BookAccessScope.ALL_PLANS
      : BookAccessScope.BUSINESS_ONLY,
  };
};

export const canAccessOfficialBook = (plan: SubscriptionPlan | undefined, book: BookMetadata): boolean => {
  const normalizedBook = normalizeBookVisibilityPolicy(book);
  if (normalizedBook.catalogSource === BookCatalogSource.USER_GENERATED) return false;
  if ((normalizedBook.accessScope || BookAccessScope.ALL_PLANS) === BookAccessScope.ALL_PLANS) return true;
  return plan === SubscriptionPlan.TOB_PAID;
};
