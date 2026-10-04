import { describe, expect, it, vi } from 'vitest';

import { isBookSelectableForToday } from '../shared/materialQuality';
import {
  batchImportWordsLocal,
  normalizeLocalCatalogBook,
  updateWordLocal,
  type LocalCatalogStorageContext,
} from '../services/storage/catalog-local';
import {
  BookAccessScope,
  BookCatalogSource,
  GeneratedAssetAuditStatus,
  type BookMetadata,
  type WordData,
} from '../types';
import type { CatalogImportRequest } from '../contracts/storage';
import { STORES, type GetStore } from '../services/storage/idb-support';

const makeLegacyBook = (overrides: Partial<BookMetadata> = {}): BookMetadata => ({
  id: 'legacy-book',
  title: 'Legacy My Words',
  wordCount: 12,
  isPriority: false,
  description: JSON.stringify({ createdBy: 'student-1' }),
  ...overrides,
});

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
};

const flushTasks = async (): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};

const createControlledRequest = <T>() => {
  const request: Partial<IDBRequest<T>> = {};
  return {
    request: request as IDBRequest<T>,
    succeed: (result: T) => {
      Object.assign(request, { result });
      request.onsuccess?.call(request as IDBRequest<T>, new Event('success'));
    },
    fail: (error: Error) => {
      Object.assign(request, { error });
      request.onerror?.call(request as IDBRequest<T>, new Event('error'));
    },
  };
};

const createControlledTransaction = (
  stores: Record<string, IDBObjectStore> = {},
) => {
  const transaction: Partial<IDBTransaction> = {
    error: null,
    objectStore: vi.fn((storeName: string) => stores[storeName]),
  };
  return {
    transaction: transaction as IDBTransaction,
    complete: () => {
      transaction.oncomplete?.call(transaction as IDBTransaction, new Event('complete'));
    },
    fail: (error: Error) => {
      Object.assign(transaction, { error });
      transaction.onerror?.call(transaction as IDBTransaction, new Event('error'));
    },
  };
};

const createControlledWriteStore = <T>() => {
  const request = createControlledRequest<T>();
  const transaction = createControlledTransaction();
  const read = createControlledRequest<WordData>();
  const put = vi.fn((_value: unknown) => request.request);
  return {
    put,
    request,
    read,
    transaction,
    store: {
      put,
      get: vi.fn(() => read.request),
      transaction: transaction.transaction,
    } as unknown as IDBObjectStore,
  };
};

const makeImportRequest = (): CatalogImportRequest => ({
  defaultBookName: 'Imported Book',
  source: {
    kind: 'rows',
    rows: [
      {
        word: 'triage',
        definition: '優先順位を決める',
        number: 1,
      },
    ],
  },
});

const makeWord = (): WordData => ({
  id: 'word-1',
  bookId: 'book-1',
  number: 1,
  word: 'triage',
  definition: '優先順位を決める',
  searchKey: 'triage',
});

describe('local catalog normalization', () => {
  it('backfills catalogSource for legacy user-owned My単語帳 records', () => {
    const normalized = normalizeLocalCatalogBook(makeLegacyBook(), 'student-1');

    expect(normalized.catalogSource).toBe(BookCatalogSource.USER_GENERATED);
    expect(normalized.accessScope).toBe(BookAccessScope.ALL_PLANS);
    expect(isBookSelectableForToday(normalized)).toBe(true);
  });

  it('keeps ownerless legacy records fail-closed by material quality gate', () => {
    const normalized = normalizeLocalCatalogBook(makeLegacyBook({
      id: 'ownerless-book',
      description: undefined,
    }), 'student-1');

    expect(normalized.catalogSource).toBeUndefined();
    expect(isBookSelectableForToday(normalized)).toBe(false);
  });
});

describe('local catalog write contracts', () => {
  it('waits for batch import transaction completion before resolving', async () => {
    const booksPut = vi.fn(() => createControlledRequest<IDBValidKey>().request);
    const wordsPut = vi.fn(() => createControlledRequest<IDBValidKey>().request);
    const booksStore = {
      put: booksPut,
    } as unknown as IDBObjectStore;
    const wordsStore = {
      put: wordsPut,
    } as unknown as IDBObjectStore;
    const transaction = createControlledTransaction({
      [STORES.BOOKS]: booksStore,
      [STORES.WORDS]: wordsStore,
    });
    const db = {
      transaction: vi.fn(() => transaction.transaction),
    } as unknown as IDBDatabase;
    const context = {
      getDb: vi.fn(async () => db),
      getStore: vi.fn(),
      getSession: vi.fn(),
    } as unknown as LocalCatalogStorageContext;
    let resolved = false;

    const importPromise = batchImportWordsLocal(context, makeImportRequest())
      .then((result) => {
        resolved = true;
        return result;
      });
    await flushTasks();
    await flushTasks();

    expect(db.transaction).toHaveBeenCalledWith([STORES.BOOKS, STORES.WORDS], 'readwrite');
    expect(booksPut).toHaveBeenCalledTimes(1);
    expect(wordsPut).toHaveBeenCalledTimes(1);
    expect(resolved).toBe(false);

    transaction.complete();
    const result = await importPromise;

    expect(resolved).toBe(true);
    expect(result).toMatchObject({
      importedBookCount: 1,
      importedWordCount: 1,
      skippedRowCount: 0,
    });
  });

  it('rejects batch imports when the transaction errors', async () => {
    const booksPut = vi.fn(() => createControlledRequest<IDBValidKey>().request);
    const wordsPut = vi.fn(() => createControlledRequest<IDBValidKey>().request);
    const booksStore = {
      put: booksPut,
    } as unknown as IDBObjectStore;
    const wordsStore = {
      put: wordsPut,
    } as unknown as IDBObjectStore;
    const transaction = createControlledTransaction({
      [STORES.BOOKS]: booksStore,
      [STORES.WORDS]: wordsStore,
    });
    const db = {
      transaction: vi.fn(() => transaction.transaction),
    } as unknown as IDBDatabase;
    const context = {
      getDb: vi.fn(async () => db),
      getStore: vi.fn(),
      getSession: vi.fn(),
    } as unknown as LocalCatalogStorageContext;
    const transactionError = new Error('import transaction failed');

    const importPromise = batchImportWordsLocal(context, makeImportRequest());
    await flushTasks();
    await flushTasks();
    transaction.fail(transactionError);

    await expect(importPromise).rejects.toThrow('import transaction failed');
  });

  it('waits for word update put request and transaction completion before resolving', async () => {
    const writeStore = createControlledWriteStore<IDBValidKey>();
    const getStore = vi.fn(async () => writeStore.store) as GetStore;
    let resolved = false;

    const updatePromise = updateWordLocal({ getStore }, makeWord())
      .then(() => {
        resolved = true;
      });
    await flushMicrotasks();

    expect(getStore).toHaveBeenCalledWith(STORES.WORDS, 'readwrite');
    writeStore.read.succeed(makeWord());
    expect(writeStore.put).toHaveBeenCalledWith(makeWord());
    expect(resolved).toBe(false);

    writeStore.request.succeed('word-1');
    await flushMicrotasks();
    expect(resolved).toBe(false);

    writeStore.transaction.complete();
    await updatePromise;
    expect(resolved).toBe(true);
  });

  it('rejects word updates when the put request fails', async () => {
    const writeStore = createControlledWriteStore<IDBValidKey>();
    const getStore = vi.fn(async () => writeStore.store) as GetStore;
    const requestError = new Error('word put failed');

    const updatePromise = updateWordLocal({ getStore }, makeWord());
    await flushMicrotasks();
    writeStore.read.succeed(makeWord());
    writeStore.request.fail(requestError);

    await expect(updatePromise).rejects.toThrow('word put failed');
  });

  it.each([false, true])('preserves hidden saved hints and only invalidates approval on content change (%s)', async changed => {
    const stored = {
      ...makeWord(), exampleSentence: 'Stored generated sentence.', exampleMeaning: '保存された生成例文。',
      exampleGeneratedAt: 1000, exampleAuditStatus: GeneratedAssetAuditStatus.APPROVED,
      exampleImageUrl: 'data:image/png;base64,stored-image', exampleImageGeneratedAt: 1000,
      exampleImageAuditStatus: GeneratedAssetAuditStatus.APPROVED,
    };
    const writeStore = createControlledWriteStore<IDBValidKey>();
    const getStore = vi.fn(async () => writeStore.store) as GetStore;
    const result = updateWordLocal({ getStore }, { ...stored, definition: changed ? '変更された意味' : stored.definition, exampleSentence: null, exampleMeaning: null, exampleImageUrl: null });
    await flushMicrotasks();
    writeStore.read.succeed(stored);
    expect(writeStore.put.mock.calls[0]?.[0]).toMatchObject({
      exampleSentence: stored.exampleSentence, exampleMeaning: stored.exampleMeaning, exampleImageUrl: stored.exampleImageUrl,
      exampleGeneratedAt: 1000, exampleImageGeneratedAt: 1000,
      exampleAuditStatus: changed ? GeneratedAssetAuditStatus.REVIEW_REQUIRED : GeneratedAssetAuditStatus.APPROVED,
      exampleImageAuditStatus: changed ? GeneratedAssetAuditStatus.REVIEW_REQUIRED : GeneratedAssetAuditStatus.APPROVED,
    });
    writeStore.request.succeed('word-1');
    writeStore.transaction.complete();
    await result;
  });

});
