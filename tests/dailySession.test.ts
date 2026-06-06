import { describe, expect, it, vi } from 'vitest';

const {
  readAllMock,
  readFirstMock,
  readVisibleBookRowsMock,
  readLearningPlanBookIdsMock,
  readWeaknessProfileMock,
} = vi.hoisted(() => ({
  readAllMock: vi.fn(),
  readFirstMock: vi.fn(),
  readVisibleBookRowsMock: vi.fn(),
  readLearningPlanBookIdsMock: vi.fn(),
  readWeaknessProfileMock: vi.fn(),
}));

vi.mock('../functions/_shared/storage-support', async () => {
  const actual = await vi.importActual<typeof import('../functions/_shared/storage-support')>('../functions/_shared/storage-support');
  return {
    ...actual,
    readAll: readAllMock,
    readFirst: readFirstMock,
    readVisibleBookRows: readVisibleBookRowsMock,
  };
});

vi.mock('../functions/_shared/learning-plan-books', () => ({
  readLearningPlanBookIds: readLearningPlanBookIdsMock,
}));

vi.mock('../functions/_shared/weakness-actions', () => ({
  readWeaknessProfile: readWeaknessProfileMock,
}));

import { handleGetDailySessionWords } from '../functions/_shared/storage-book-actions';
import { getDailySessionWords as getLocalDailySessionWords } from '../services/storage/learning-history';
import { STORES, type StoredLearningHistoryRecord } from '../services/storage/idb-support';
import { createTodayFocusTaskIntent } from '../shared/learningTask';
import {
  BookAccessScope,
  BookCatalogSource,
  EnglishLevel,
  UserGrade,
  UserRole,
  type BookMetadata,
  type LearningPlan,
  type UserProfile,
  type WordData,
} from '../types';
import type { DbBookRow, DbWordRow } from '../functions/_shared/storage-support';

const makeBookRow = (id: string, title = id): DbBookRow => ({
  id,
  title,
  word_count: 100,
  is_priority: 0,
  description: null,
  source_context: null,
  created_by: null,
  catalog_source: BookCatalogSource.STEADY_STUDY_ORIGINAL,
  access_scope: BookAccessScope.ALL_PLANS,
});

const makeWordRow = (bookId: string, number: number): DbWordRow => ({
  id: `${bookId}-${number}`,
  book_id: bookId,
  word_number: number,
  word: `${bookId}-word-${number}`,
  definition: `${bookId}-definition-${number}`,
  search_key: null,
  category: null,
  subcategory: null,
  section: null,
  source_sheet: null,
  source_entry_id: null,
  example_sentence: null,
  example_meaning: null,
  example_generated_at: null,
  example_audit_status: null,
  example_audit_note: null,
  example_audited_at: null,
  example_image_key: null,
  example_image_content_type: null,
  example_image_generated_at: null,
  example_image_audit_status: null,
  example_image_audit_note: null,
  example_image_audited_at: null,
  is_reported: 0,
});

const makeBook = (id: string): BookMetadata => ({
  id,
  title: id,
  wordCount: 100,
  isPriority: false,
  catalogSource: BookCatalogSource.STEADY_STUDY_ORIGINAL,
  accessScope: BookAccessScope.ALL_PLANS,
});

const makeWord = (bookId: string, number: number): WordData => ({
  id: `${bookId}-${number}`,
  bookId,
  number,
  word: `${bookId}-word-${number}`,
  definition: `${bookId}-definition-${number}`,
});

const makeRequestStore = <T,>(records: T[]) => ({
  getAll: () => {
    const request: Partial<IDBRequest<T[]>> = { result: records };
    globalThis.setTimeout(() => {
      request.onsuccess?.call(request as IDBRequest<T[]>, {} as Event);
    }, 0);
    return request as IDBRequest<T[]>;
  },
}) as IDBObjectStore;

const makeLearningPlan = (selectedBookIds: string[]): LearningPlan => ({
  uid: 'student-1',
  createdAt: 1,
  targetDate: '2026-07-01',
  goalDescription: 'plan',
  dailyWordGoal: 10,
  selectedBookIds,
  status: 'ACTIVE',
});

const makeUser = (): UserProfile => ({
  uid: 'student-1',
  displayName: 'Student',
  role: UserRole.STUDENT,
  email: 'student@example.test',
  grade: UserGrade.SHS1,
  englishLevel: EnglishLevel.B1,
});

describe('daily session word selection', () => {
  it('uses the Today Focus preferred books and keeps new cloud words in number order', async () => {
    readAllMock.mockReset();
    readFirstMock.mockReset();
    readVisibleBookRowsMock.mockReset();
    readLearningPlanBookIdsMock.mockReset();
    readWeaknessProfileMock.mockReset();

    readVisibleBookRowsMock.mockResolvedValueOnce([
      makeBookRow('book-a'),
      makeBookRow('book-b'),
    ]);
    readFirstMock.mockResolvedValueOnce({ count: 1 });
    readAllMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeWordRow('book-b', 3),
        makeWordRow('book-b', 1),
        makeWordRow('book-b', 2),
      ]);
    readWeaknessProfileMock.mockResolvedValueOnce(null);

    const words = await handleGetDailySessionWords(
      { DB: { prepare: vi.fn() } } as any,
      {
        id: 'student-1',
        role: UserRole.STUDENT,
        grade: UserGrade.SHS1,
        english_level: EnglishLevel.B1,
      } as any,
      3,
      createTodayFocusTaskIntent({ preferredBookIds: ['book-b'] }),
    );

    expect(readLearningPlanBookIdsMock).not.toHaveBeenCalled();
    expect(words.map((word) => word.bookId)).toEqual(['book-b', 'book-b', 'book-b']);
    expect(words.map((word) => word.number)).toEqual([1, 2, 3]);
  });

  it('falls back to visible cloud books when saved plan books are no longer accessible', async () => {
    readAllMock.mockReset();
    readFirstMock.mockReset();
    readVisibleBookRowsMock.mockReset();
    readLearningPlanBookIdsMock.mockReset();
    readWeaknessProfileMock.mockReset();

    readVisibleBookRowsMock.mockResolvedValueOnce([
      makeBookRow('book-a'),
      makeBookRow('book-b'),
    ]);
    readLearningPlanBookIdsMock.mockResolvedValueOnce(['stale-book']);
    readFirstMock.mockResolvedValueOnce({ count: 0 });
    readAllMock.mockResolvedValueOnce([
      makeWordRow('book-a', 1),
      makeWordRow('book-b', 1),
    ]);

    const words = await handleGetDailySessionWords(
      { DB: { prepare: vi.fn() } } as any,
      {
        id: 'student-1',
        role: UserRole.STUDENT,
        grade: UserGrade.SHS1,
        english_level: EnglishLevel.B1,
      } as any,
      2,
    );

    expect(readLearningPlanBookIdsMock).toHaveBeenCalledWith(expect.anything(), 'student-1');
    expect(words.map((word) => word.bookId).sort()).toEqual(['book-a', 'book-b']);
  });

  it('falls back to the saved learning plan for local Today Focus sessions', async () => {
    const recordsByStore = new Map<string, unknown[]>([
      [STORES.HISTORY, [] satisfies StoredLearningHistoryRecord[]],
      [STORES.WORDS, [
        makeWord('book-a', 1),
        makeWord('book-b', 3),
        makeWord('book-b', 1),
        makeWord('book-b', 2),
      ]],
    ]);

    const words = await getLocalDailySessionWords({
      getStore: async (storeName) => makeRequestStore(recordsByStore.get(storeName) || []),
      getBooks: async () => [makeBook('book-a'), makeBook('book-b')],
      getWordsByBook: async () => [],
      getSession: async () => makeUser(),
      getLearningPlan: async () => makeLearningPlan(['book-b']),
    }, 'student-1', 3, createTodayFocusTaskIntent());

    expect(words.map((word) => word.bookId)).toEqual(['book-b', 'book-b', 'book-b']);
    expect(words.map((word) => word.number)).toEqual([1, 2, 3]);
  });

  it('falls back to visible local books when saved plan books are no longer accessible', async () => {
    const recordsByStore = new Map<string, unknown[]>([
      [STORES.HISTORY, [] satisfies StoredLearningHistoryRecord[]],
      [STORES.WORDS, [
        makeWord('book-a', 1),
        makeWord('book-b', 1),
      ]],
    ]);

    const words = await getLocalDailySessionWords({
      getStore: async (storeName) => makeRequestStore(recordsByStore.get(storeName) || []),
      getBooks: async () => [makeBook('book-a'), makeBook('book-b')],
      getWordsByBook: async () => [],
      getSession: async () => makeUser(),
      getLearningPlan: async () => makeLearningPlan(['stale-book']),
    }, 'student-1', 2, createTodayFocusTaskIntent());

    expect(words.map((word) => word.bookId).sort()).toEqual(['book-a', 'book-b']);
  });
});
