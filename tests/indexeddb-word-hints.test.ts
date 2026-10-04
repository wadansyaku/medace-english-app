import { describe, expect, it, vi } from 'vitest';

import { GeneratedAssetAuditStatus, WordHintAssetType, type WordData } from '../types';

vi.mock('../services/storage/idb-support', async () => {
  const actual = await vi.importActual<typeof import('../services/storage/idb-support')>('../services/storage/idb-support');
  return {
    ...actual,
    initStorageDb: vi.fn().mockResolvedValue({}),
  };
});

import { IndexedDBStorageService } from '../services/storage';
import {
  nounWorkbookFixtureBookDescription,
  nounWorkbookFixtureBookTitle,
  nounWorkbookFixtureImportProfile,
  nounWorkbookFixtureImportRows,
  nounWorkbookFixtureSourceContext,
} from './fixtures/nounWorkbookFixture.js';

const createRequest = <T>(result?: T, error?: Error) => {
  const request: any = {};
  queueMicrotask(() => {
    if (error) {
      request.error = error;
      request.onerror?.(new Event('error'));
      return;
    }
    request.result = result;
    request.onsuccess?.(new Event('success'));
  });
  return request as IDBRequest<T>;
};

const createWord = (): WordData => ({
  id: 'word-1',
  bookId: 'book-1',
  number: 1,
  word: 'acute',
  definition: 'sharp pain',
  searchKey: 'acute',
});

describe('IndexedDBStorageService word hints', () => {
  it.each([WordHintAssetType.EXAMPLE, WordHintAssetType.IMAGE])('rejects retired %s generation before reading or mutating storage', async (assetType) => {
    const getStore = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      const service = new IndexedDBStorageService({ getStore });
      for (const forceRefresh of [false, true]) {
        await expect(service.generateWordHintAsset({ wordId: 'word-1', assetType, forceRefresh })).rejects.toThrow('廃止');
      }
      expect(getStore).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { fetchSpy.mockRestore(); }
  });

  it('does not fabricate examples in local preparation', async () => {
    const getStore = vi.fn();
    const service = new IndexedDBStorageService({ getStore });
    await expect(service.prepareBookExamples('book-1')).rejects.toThrow('端末内では生成しません');
    expect(getStore).not.toHaveBeenCalled();
  });

  it('withholds pending stored hints when a local book is read again', async () => {
    const pendingWord: WordData = {
      ...createWord(),
      exampleSentence: 'Stored pending example.',
      exampleMeaning: '保存済みの承認待ち例文。',
      exampleGeneratedAt: 1_000,
      exampleAuditStatus: GeneratedAssetAuditStatus.PENDING,
      exampleImageUrl: 'data:image/png;base64,stored-pending-image',
      exampleImageGeneratedAt: 1_000,
      exampleImageAuditStatus: GeneratedAssetAuditStatus.PENDING,
    };
    const store = {
      index: vi.fn(() => ({
        getAll: vi.fn(() => createRequest([pendingWord])),
      })),
    } as unknown as IDBObjectStore;
    const service = new IndexedDBStorageService({
      getStore: vi.fn(async () => store),
    });

    const [result] = await service.getWordsByBook('book-1');

    expect(result).toMatchObject({
      exampleSentence: null,
      exampleMeaning: null,
      exampleAuditStatus: GeneratedAssetAuditStatus.PENDING,
      exampleImageUrl: null,
      exampleImageAuditStatus: GeneratedAssetAuditStatus.PENDING,
    });
  });

  it('withholds a local audited example when generation provenance is missing', async () => {
    const missingProvenanceWord: WordData = {
      ...createWord(),
      exampleSentence: 'A generated example with lost provenance.',
      exampleMeaning: '生成履歴が欠けた例文。',
      exampleGeneratedAt: null,
      exampleAuditStatus: GeneratedAssetAuditStatus.PENDING,
    };
    const store = {
      index: vi.fn(() => ({
        getAll: vi.fn(() => createRequest([missingProvenanceWord])),
      })),
    } as unknown as IDBObjectStore;
    const service = new IndexedDBStorageService({
      getStore: vi.fn(async () => store),
    });

    const [result] = await service.getWordsByBook('book-1');

    expect(result).toMatchObject({
      exampleSentence: null,
      exampleMeaning: null,
      exampleAuditStatus: GeneratedAssetAuditStatus.REVIEW_REQUIRED,
    });
  });

  it('round-trips noun workbook import metadata through the IndexedDB fallback', async () => {
    const books = new Map<string, unknown>();
    const words = new Map<string, WordData>();
    const booksStore = {
      put: vi.fn((value: { id: string }) => {
        books.set(value.id, value);
        return createRequest(value);
      }),
    };
    const wordsStore = {
      put: vi.fn((value: WordData) => {
        words.set(value.id, value);
        return createRequest(value);
      }),
      index: vi.fn(() => ({
        getAll: vi.fn((bookId: string) => createRequest(
          [...words.values()].filter((word) => word.bookId === bookId),
        )),
      })),
    };
    const createTransaction = () => {
      let oncomplete: ((event: Event) => void) | null = null;
      return {
        get oncomplete() {
          return oncomplete;
        },
        set oncomplete(handler) {
          oncomplete = handler;
          queueMicrotask(() => handler?.(new Event('complete')));
        },
        objectStore: vi.fn((storeName: string) => {
          if (storeName === 'books') return booksStore;
          if (storeName === 'words') return wordsStore;
          throw new Error(`Unexpected store: ${storeName}`);
        }),
      } as unknown as IDBTransaction;
    };
    const db = {
      transaction: vi.fn(() => createTransaction()),
    } as unknown as IDBDatabase;

    const service = new IndexedDBStorageService({ db });
    const result = await service.batchImportWords({
      defaultBookName: nounWorkbookFixtureBookTitle,
      source: {
        kind: 'rows',
        rows: [...nounWorkbookFixtureImportRows],
      },
      contextSummary: nounWorkbookFixtureSourceContext,
      bookDescription: nounWorkbookFixtureBookDescription,
      importProfile: nounWorkbookFixtureImportProfile,
    });
    const importedWords = await service.getWordsByBook(result.importedBookIds[0]);
    const goalWord = importedWords.find((word) => word.word === 'goal');

    expect(result.importedWordCount).toBe(nounWorkbookFixtureImportRows.length);
    expect(goalWord).toMatchObject({
      category: '国際 移動',
      subcategory: '国際',
      section: '到達',
      sourceSheet: '国際 移動',
      sourceEntryId: 3,
      exampleSentence: 'Set a goal for the year.',
    });
  });
});
