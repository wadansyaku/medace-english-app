import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WordHintAssetType, type WordData } from '../types';

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

  it('persists generated example hints after async generation completes', async () => {
    const storedWord = createWord();
    const putMock = vi.fn((value: WordData) => createRequest(value));
    const readStore = {
      get: vi.fn(() => createRequest(storedWord)),
    } as unknown as IDBObjectStore;
    const writeStore = {
      put: putMock,
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
    });
    expect(result.exampleSentence).toBe('The patient reported acute pain.');
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
