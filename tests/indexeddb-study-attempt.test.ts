import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { saveSrsHistory, type LearningHistoryContext } from '../services/storage/learning-history';
import {
  DB_VERSION,
  STORES,
  getObjectStore,
  initStorageDb,
  type StoredLearningHistoryRecord,
  type StoredStudyAttemptReceipt,
} from '../services/storage/idb-support';
import { studyAttemptFingerprint } from '../shared/srs';
import { LearningTaskIntentType, type WordData } from '../types';

const word: WordData = {
  id: 'word-1', bookId: 'book-1', number: 1, word: 'learn', definition: '学ぶ', searchKey: 'learn',
};
const flushTasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const controlledRequest = <T>() => {
  const request: Partial<IDBRequest<T>> = { error: null };
  return {
    request: request as IDBRequest<T>,
    succeed(result: T) {
      Object.assign(request, { result });
      request.onsuccess?.call(request as IDBRequest<T>, new Event('success'));
    },
    fail(error: Error) {
      Object.assign(request, { error });
      request.onerror?.call(request as IDBRequest<T>, new Event('error'));
    },
  };
};

const resolvedRequest = <T>(value: T): IDBRequest<T> => {
  const controlled = controlledRequest<T>();
  queueMicrotask(() => controlled.succeed(value));
  return controlled.request;
};

const controlledTransaction = (names: string[]) => {
  const reads: Array<{ name: string; key: IDBValidKey; control: ReturnType<typeof controlledRequest<unknown>> }> = [];
  const writes: Array<{ name: string; operation: string; value: unknown; control: ReturnType<typeof controlledRequest<unknown>> }> = [];
  const transaction: Partial<IDBTransaction> = { error: null };
  const stores = Object.fromEntries(names.map((name) => [name, {
    get(key: IDBValidKey) {
      const control = controlledRequest<unknown>();
      reads.push({ name, key, control });
      return control.request;
    },
    put(value: unknown) {
      const control = controlledRequest<unknown>();
      writes.push({ name, operation: 'put', value, control });
      return control.request;
    },
    add(value: unknown) {
      const control = controlledRequest<unknown>();
      writes.push({ name, operation: 'add', value, control });
      return control.request;
    },
  } as unknown as IDBObjectStore]));
  transaction.objectStore = vi.fn((name) => stores[name]);
  transaction.abort = vi.fn(() => {
    transaction.onabort?.call(transaction as IDBTransaction, new Event('abort'));
  });
  return {
    reads,
    writes,
    transaction: transaction as IDBTransaction,
    complete() {
      transaction.oncomplete?.call(transaction as IDBTransaction, new Event('complete'));
    },
    fail(error: Error) {
      Object.assign(transaction, { error });
      transaction.onabort?.call(transaction as IDBTransaction, new Event('abort'));
    },
  };
};

const createHarness = () => {
  const transactions: ReturnType<typeof controlledTransaction>[] = [];
  const db = {
    transaction: vi.fn((storeNames: string | string[]) => {
      const tx = controlledTransaction(Array.isArray(storeNames) ? storeNames : [storeNames]);
      transactions.push(tx);
      return tx.transaction;
    }),
  } as unknown as IDBDatabase;
  const getStore = vi.fn<LearningHistoryContext['getStore']>(async () => { throw new Error('Projection unavailable'); });
  const getSession = vi.fn(async () => null);
  const context: LearningHistoryContext = {
    getDb: async () => db,
    getStore,
    getBooks: async () => [],
    getWordsByBook: async () => [word],
    getSession,
  };
  return { context, db, transactions, getStore, getSession };
};

const queueFreshAttempt = (
  transaction: ReturnType<typeof controlledTransaction>,
  existing?: StoredLearningHistoryRecord,
) => {
  transaction.reads[0].control.succeed(undefined);
  transaction.reads[1].control.succeed(existing);
  transaction.writes.forEach(({ control }) => control.succeed('saved'));
};

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('atomic IndexedDB study attempts', () => {
  it('queues history, interaction and receipt together, resolving only on transaction complete', async () => {
    const harness = createHarness();
    let settled = false;
    const saved = saveSrsHistory(harness.context, 'learner-1', word, 3, 240, undefined, undefined, 'attempt-1')
      .then(() => { settled = true; });
    await flushTasks();
    const transaction = harness.transactions[0];
    expect(harness.db.transaction).toHaveBeenCalledWith([
      STORES.HISTORY, STORES.INTERACTION_EVENTS, STORES.STUDY_ATTEMPT_RECEIPTS,
    ], 'readwrite');
    queueFreshAttempt(transaction);
    expect(transaction.writes.map(({ name }) => name)).toEqual([
      STORES.HISTORY, STORES.INTERACTION_EVENTS, STORES.STUDY_ATTEMPT_RECEIPTS,
    ]);
    expect(transaction.writes[0].value).toMatchObject({
      id: 'learner-1_word-1', data: { attemptCount: 1, correctCount: 1, interval: 3, totalResponseTimeMs: 240 },
    });
    expect(transaction.writes[1].value).toMatchObject({
      id: 'study:["learner-1","attempt-1"]', uid: 'learner-1', data: { interactionSource: 'STUDY', rating: 3 },
    });
    await flushTasks();
    expect(settled).toBe(false);
    expect(harness.getSession).not.toHaveBeenCalled();
    transaction.complete();
    await saved;
    expect(settled).toBe(true);
  });

  it('rejects a late transaction abort even after every write request succeeded', async () => {
    const harness = createHarness();
    const saved = saveSrsHistory(harness.context, 'learner-1', word, 2, 10, undefined, undefined, 'attempt-2');
    const rejected = expect(saved).rejects.toThrow('quota exhausted');
    await flushTasks();
    const transaction = harness.transactions[0];
    queueFreshAttempt(transaction);
    transaction.fail(new Error('quota exhausted'));
    await rejected;
    expect(harness.getSession).not.toHaveBeenCalled();
  });

  it('does not move history or event timestamps backwards when the local clock changes', async () => {
    const harness = createHarness();
    const futureTimestamp = Date.now() + 86_400_000;
    const saved = saveSrsHistory(harness.context, 'learner-1', word, 2, 10, undefined, undefined, 'clock-attempt');
    await flushTasks();
    const transaction = harness.transactions[0];
    queueFreshAttempt(transaction, {
      id: 'learner-1_word-1',
      data: {
        wordId: word.id, bookId: word.bookId, status: 'learning',
        lastStudiedAt: futureTimestamp, nextReviewDate: futureTimestamp + 86_400_000,
        interval: 1, easeFactor: 2.5, attemptCount: 1, correctCount: 1,
        totalResponseTimeMs: 10, interactionSource: 'STUDY',
      },
    });
    expect(transaction.writes[0].value).toMatchObject({ data: { lastStudiedAt: futureTimestamp } });
    expect(transaction.writes[1].value).toMatchObject({ data: { createdAt: futureTimestamp } });
    expect(transaction.writes[2].value).toMatchObject({ committedAt: futureTimestamp });
    transaction.complete();
    await saved;
  });

  it('treats a committed exact retry as a no-op and can recover a failed projection', async () => {
    const harness = createHarness();
    const first = saveSrsHistory(harness.context, 'learner-1', word, 2, 15, 'mission-1', LearningTaskIntentType.TODAY_FOCUS, 'attempt-3');
    await flushTasks();
    const initial = harness.transactions[0];
    queueFreshAttempt(initial);
    initial.complete();
    await expect(first).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledOnce();
    const receipt = initial.writes[2].value as StoredStudyAttemptReceipt;

    harness.getStore.mockImplementation(async () => ({ getAll: () => resolvedRequest([]) } as unknown as IDBObjectStore));
    const retry = saveSrsHistory(harness.context, 'learner-1', word, 2, 15, 'mission-1', LearningTaskIntentType.TODAY_FOCUS, 'attempt-3');
    await flushTasks();
    const duplicate = harness.transactions[1];
    duplicate.reads[0].control.succeed(receipt);
    expect(duplicate.reads).toHaveLength(1);
    expect(duplicate.writes).toHaveLength(0);
    duplicate.complete();
    await flushTasks();
    const projection = harness.transactions[2];
    expect(projection.writes.length).toBeGreaterThan(1);
    expect(projection.writes.every(({ name }) => name === STORES.WEAKNESS_SIGNALS)).toBe(true);
    projection.complete();
    await expect(retry).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('aborts reused attempt ids with a different payload before any history/event write', async () => {
    const harness = createHarness();
    const saved = saveSrsHistory(harness.context, 'learner-1', word, 3, 15, undefined, undefined, 'attempt-4');
    const rejected = expect(saved).rejects.toThrow('異なる解答');
    await flushTasks();
    const transaction = harness.transactions[0];
    transaction.reads[0].control.succeed({
      fingerprint: studyAttemptFingerprint({ wordId: word.id, bookId: word.bookId, rating: 0, responseTimeMs: 15 }),
    });
    await rejected;
    expect(transaction.transaction.abort).toHaveBeenCalledOnce();
    expect(transaction.writes).toHaveLength(0);
  });

  it('keeps failed history reads from becoming a new empty history', async () => {
    const harness = createHarness();
    const saved = saveSrsHistory(harness.context, 'learner-1', word, 3, 15, undefined, undefined, 'attempt-5');
    const rejected = expect(saved).rejects.toThrow('history unreadable');
    await flushTasks();
    const transaction = harness.transactions[0];
    transaction.reads[0].control.succeed(undefined);
    transaction.reads[1].control.fail(new Error('history unreadable'));
    await rejected;
    expect(transaction.writes).toHaveLength(0);
  });

  it('validates before opening a transaction', async () => {
    const harness = createHarness();
    await expect(saveSrsHistory(harness.context, 'learner-1', word, 9)).rejects.toThrow('0 から 3');
    await expect(saveSrsHistory(harness.context, 'learner-1', word, 2, Infinity)).rejects.toThrow('解答時間');
    await expect(saveSrsHistory(harness.context, 'learner-1', word, 2, 0, undefined, undefined, 'bad/id')).rejects.toThrow('識別子');
    expect(harness.db.transaction).not.toHaveBeenCalled();
  });
});

describe('IndexedDB study receipt upgrade', () => {
  it('rejects a blocked upgrade with a recovery instruction and closes its late connection', async () => {
    const db = { close: vi.fn() } as unknown as IDBDatabase;
    const request: Partial<IDBOpenDBRequest> = { result: db };
    vi.stubGlobal('indexedDB', { open: vi.fn(() => request) });
    try {
      const opened = initStorageDb();
      const rejected = expect(opened).rejects.toThrow('ほかの Steady Study タブやウィンドウを閉じて');
      request.onblocked?.call(request as IDBOpenDBRequest, new Event('blocked') as IDBVersionChangeEvent);
      await rejected;
      expect(db.close).not.toHaveBeenCalled();

      request.onsuccess?.call(request as IDBOpenDBRequest, new Event('success'));
      expect(db.close).toHaveBeenCalledOnce();
      await expect(opened).rejects.toThrow('再読み込み');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('closes a superseded connection and propagates failed reads instead of returning empty data', async () => {
    const closedError = new DOMException('The database connection is closing.', 'InvalidStateError');
    const db = {
      close: vi.fn(),
      transaction: vi.fn(() => { throw closedError; }),
    } as unknown as IDBDatabase;
    const request: Partial<IDBOpenDBRequest> = { result: db };
    vi.stubGlobal('indexedDB', { open: vi.fn(() => request) });
    try {
      const opened = initStorageDb();
      request.onsuccess?.call(request as IDBOpenDBRequest, new Event('success'));
      await expect(opened).resolves.toBe(db);
      expect(db.close).not.toHaveBeenCalled();

      db.onversionchange?.call(db, new Event('versionchange') as IDBVersionChangeEvent);
      expect(db.close).toHaveBeenCalledOnce();
      await expect(getObjectStore(opened, STORES.HISTORY)).rejects.toBe(closedError);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('adds study and quiz receipt stores without recreating existing version-six data', async () => {
    const oldStoreNames = new Set<string>(Object.values(STORES).filter((name) => name !== STORES.STUDY_ATTEMPT_RECEIPTS && name !== STORES.QUIZ_ATTEMPT_RECEIPTS));
    const db = {
      objectStoreNames: { contains: (name: string) => oldStoreNames.has(name) },
      createObjectStore: vi.fn(),
    } as unknown as IDBDatabase;
    const openRequest: Partial<IDBOpenDBRequest> = { result: db };
    const open = vi.fn(() => openRequest);
    vi.stubGlobal('indexedDB', { open });
    try {
      const opened = initStorageDb();
      openRequest.onupgradeneeded?.call(openRequest as IDBOpenDBRequest, new Event('upgradeneeded') as IDBVersionChangeEvent);
      openRequest.onsuccess?.call(openRequest as IDBOpenDBRequest, new Event('success'));
      await expect(opened).resolves.toBe(db);
      expect(DB_VERSION).toBe(8);
      expect(open).toHaveBeenCalledWith('MedAceDB', 8);
      expect(db.createObjectStore).toHaveBeenCalledTimes(2);
      expect(db.createObjectStore).toHaveBeenCalledWith(STORES.STUDY_ATTEMPT_RECEIPTS, { keyPath: 'id' });
      expect(db.createObjectStore).toHaveBeenCalledWith(STORES.QUIZ_ATTEMPT_RECEIPTS, { keyPath: 'id' });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
