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
});
