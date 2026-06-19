import { describe, expect, it, vi } from 'vitest';

import { isBookSelectableForToday } from '../shared/materialQuality';
import {
  batchImportWordsLocal,
  normalizeLocalCatalogBook,
  updateWordCacheLocal,
  updateWordLocal,
  type LocalCatalogStorageContext,
} from '../services/storage/catalog-local';
import {
  BookAccessScope,
  BookCatalogSource,
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
  const put = vi.fn(() => request.request);
  return {
    put,
    request,
    transaction,
    store: {
      put,
      transaction: transaction.transaction,
    } as unknown as IDBObjectStore,
  };
};

const createControlledReadModifyWriteStore = () => {
  const getRequest = createControlledRequest<WordData | undefined>();
  const putRequest = createControlledRequest<IDBValidKey>();
  const transaction = createControlledTransaction();
  const get = vi.fn(() => getRequest.request);
  const put = vi.fn(() => putRequest.request);
  return {
    get,
    put,
    getRequest,
    putRequest,
    transaction,
    store: {
      get,
      put,
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
    writeStore.request.fail(requestError);

    await expect(updatePromise).rejects.toThrow('word put failed');
  });

  it('waits for read-modify-write word cache updates to finish the put and transaction', async () => {
    const writeStore = createControlledReadModifyWriteStore();
    const getStore = vi.fn(async () => writeStore.store) as GetStore;
    let resolved = false;

    const updatePromise = updateWordCacheLocal(
      { getStore },
      'word-1',
      'The nurse triaged the patient.',
      '看護師は患者の優先順位を決めた。',
    ).then(() => {
      resolved = true;
    });
    await flushMicrotasks();

    expect(writeStore.get).toHaveBeenCalledWith('word-1');
    expect(resolved).toBe(false);

    writeStore.getRequest.succeed(makeWord());
    await flushMicrotasks();
    expect(writeStore.put).toHaveBeenCalledWith(expect.objectContaining({
      id: 'word-1',
      exampleSentence: 'The nurse triaged the patient.',
      exampleMeaning: '看護師は患者の優先順位を決めた。',
    }));
    expect(resolved).toBe(false);

    writeStore.putRequest.succeed('word-1');
    await flushMicrotasks();
    expect(resolved).toBe(false);

    writeStore.transaction.complete();
    await updatePromise;
    expect(resolved).toBe(true);
  });
});
