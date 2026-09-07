import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GeneratedAssetAuditStatus, WordHintAssetType, type WordData } from '../types';

const {
  generateGeminiSentenceMock,
  generateWordImageMock,
} = vi.hoisted(() => ({
  generateGeminiSentenceMock: vi.fn(),
  generateWordImageMock: vi.fn(),
}));

vi.mock('../services/gemini', () => ({
  generateGeminiSentence: generateGeminiSentenceMock,
  generateWordImage: generateWordImageMock,
}));

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

const createCompletingTransaction = () => {
  let oncomplete: ((event: Event) => void) | null = null;
  return {
    error: null,
    get oncomplete() {
      return oncomplete;
    },
    set oncomplete(handler) {
      oncomplete = handler;
      queueMicrotask(() => handler?.(new Event('complete')));
    },
  } as unknown as IDBTransaction;
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
  beforeEach(() => {
    generateGeminiSentenceMock.mockReset();
    generateWordImageMock.mockReset();
  });

  it('persists pending examples for audit but returns a learner-safe copy', async () => {
    const storedWord = createWord();
    const putMock = vi.fn((value: WordData) => createRequest(value));
    const readStore = {
      get: vi.fn(() => createRequest(storedWord)),
    } as unknown as IDBObjectStore;
    const writeStore = {
      put: putMock,
      transaction: createCompletingTransaction(),
    } as unknown as IDBObjectStore;
    const getStoreMock = vi.fn(async (_storeName: string, mode: IDBTransactionMode = 'readonly') => (
      mode === 'readwrite' ? writeStore : readStore
    ));

    generateGeminiSentenceMock.mockResolvedValueOnce({
      english: 'The patient reported acute pain.',
      japanese: '患者は鋭い痛みを訴えた。',
    });

    const service = new IndexedDBStorageService({ getStore: getStoreMock });
    const result = await service.generateWordHintAsset({
      wordId: 'word-1',
      assetType: WordHintAssetType.EXAMPLE,
    });

    expect(getStoreMock).toHaveBeenNthCalledWith(1, 'words', 'readonly');
    expect(getStoreMock).toHaveBeenNthCalledWith(2, 'words', 'readwrite');
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(putMock.mock.calls[0]?.[0]).toMatchObject({
      id: 'word-1',
      exampleSentence: 'The patient reported acute pain.',
      exampleMeaning: '患者は鋭い痛みを訴えた。',
      exampleAuditStatus: GeneratedAssetAuditStatus.PENDING,
    });
    expect(result).toMatchObject({
      exampleSentence: null,
      exampleMeaning: null,
      exampleAuditStatus: GeneratedAssetAuditStatus.PENDING,
    });
  });

  it('persists pending images for audit but never returns their URL to learners', async () => {
    const storedWord = createWord();
    const putMock = vi.fn((value: WordData) => createRequest(value));
    const readStore = {
      get: vi.fn(() => createRequest(storedWord)),
    } as unknown as IDBObjectStore;
    const writeStore = {
      put: putMock,
      transaction: createCompletingTransaction(),
    } as unknown as IDBObjectStore;
    const getStoreMock = vi.fn(async (_storeName: string, mode: IDBTransactionMode = 'readonly') => (
      mode === 'readwrite' ? writeStore : readStore
    ));
    generateWordImageMock.mockResolvedValueOnce('data:image/png;base64,pending-image');

    const service = new IndexedDBStorageService({ getStore: getStoreMock });
    const result = await service.generateWordHintAsset({
      wordId: 'word-1',
      assetType: WordHintAssetType.IMAGE,
    });

    expect(putMock.mock.calls[0]?.[0]).toMatchObject({
      id: 'word-1',
      exampleImageUrl: 'data:image/png;base64,pending-image',
      exampleImageAuditStatus: GeneratedAssetAuditStatus.PENDING,
    });
    expect(result).toMatchObject({
      exampleImageUrl: null,
      exampleImageAuditStatus: GeneratedAssetAuditStatus.PENDING,
    });
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
