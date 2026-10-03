import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

import { expect, test } from './diagnostics';
import type { QuizAttemptInput } from '../../shared/quizAttempt';
import type { LearningHistoryContext } from '../../services/storage/learning-history';
import type {
  StoredInteractionEventRecord,
  StoredLearningHistoryRecord,
  StoredQuizAttemptReceipt,
} from '../../services/storage/idb-support';

interface QuizIdbFixture {
  support: typeof import('../../services/storage/idb-support');
  learning: typeof import('../../services/storage/learning-history');
  db: IDBDatabase;
  context: LearningHistoryContext;
  save: (input: Partial<QuizAttemptInput>, uid?: string, context?: LearningHistoryContext) => ReturnType<QuizIdbFixture['learning']['recordQuizAttempt']>;
  snapshot: () => Promise<{
    histories: StoredLearningHistoryRecord[];
    events: StoredInteractionEventRecord[];
    receipts: StoredQuizAttemptReceipt[];
    studyReceipts: number;
  }>;
}

type QuizIdbWindow = typeof window & { quizIdb: QuizIdbFixture };

let moduleCode: string;
let storageServiceCode: string;
let unexpectedRequests: string[];

test.beforeAll(async () => {
  // Import the real storage implementation in one in-memory browser module.
  // Native Chrome IDB supplies transaction ordering, durability, and rollback.
  const result = await build({
    stdin: {
      contents: 'export * as support from "./services/storage/idb-support.ts"; export * as learning from "./services/storage/learning-history.ts";',
      resolveDir: fileURLToPath(new URL('../../', import.meta.url)),
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    logLevel: 'silent',
  });
  moduleCode = result.outputFiles[0].text;
  const serviceBundle = await build({
    stdin: {
      contents: 'export { IndexedDBStorageService } from "./services/storage.ts";',
      resolveDir: fileURLToPath(new URL('../../', import.meta.url)),
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    // Avoid opening an unrelated singleton IDB connection at module import.
    // The test explicitly injects its synthetic DB into the actual IDB class.
    define: { 'import.meta.env': '{"VITE_STORAGE_MODE":"cloudflare"}' },
    logLevel: 'silent',
  });
  storageServiceCode = serviceBundle.outputFiles[0].text;
});

test.beforeEach(async ({ context, page }) => {
  unexpectedRequests = [];
  await context.route('**/*', (route) => {
    if (route.request().url() === 'https://quiz-receipts-idb.test/') {
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Quiz receipt native IDB verification</title><h1>Isolated quiz receipt fixture</h1>',
      });
    }
    unexpectedRequests.push(route.request().url());
    return route.abort();
  });
  await page.goto('https://quiz-receipts-idb.test/');
  await page.evaluate(async (code) => {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    let modules: Pick<QuizIdbFixture, 'support' | 'learning'>;
    try { modules = await import(url); } finally { URL.revokeObjectURL(url); }
    const { support, learning } = modules;
    const fixture = { support, learning, db: await support.initStorageDb() } as QuizIdbFixture;
    fixture.context = {
      getDb: async () => fixture.db,
      getStore: (name, mode) => support.getObjectStore(Promise.resolve(fixture.db), name, mode),
      // A task boundary here detects incorrectly opening a transaction before
      // catalog or SHA-256 work, when it would already have become inactive.
      getBooks: () => new Promise((resolve) => setTimeout(() => resolve([]), 5)),
      getSession: async () => null,
      getWordsByBook: async () => [],
    };
    fixture.save = (overrides, uid = 'quiz-native-learner', context = fixture.context) => {
      const input: QuizAttemptInput = {
        wordId: 'quiz-word', bookId: 'quiz-book', correct: true,
        questionMode: 'EN_TO_JA', responseTimeMs: 100, ...overrides,
      };
      return learning.recordQuizAttempt(
        context, uid, input.wordId, input.bookId, input.correct,
        input.questionMode, input.responseTimeMs, input.missionAssignmentId,
        input.taskIntentType, input.generatedProblemId, input.grammarScopeId,
        input.translationFeedback, input.clientAttemptId,
      );
    };
    fixture.snapshot = async () => {
      const tx = fixture.db.transaction([
        support.STORES.HISTORY, support.STORES.INTERACTION_EVENTS,
        support.STORES.QUIZ_ATTEMPT_RECEIPTS, support.STORES.STUDY_ATTEMPT_RECEIPTS,
      ]);
      const complete = support.waitForTransaction(tx);
      const [histories, events, receipts, studyReceipts] = await Promise.all([
        support.requestToPromise(tx.objectStore(support.STORES.HISTORY).getAll()) as Promise<StoredLearningHistoryRecord[]>,
        support.requestToPromise(tx.objectStore(support.STORES.INTERACTION_EVENTS).getAll()) as Promise<StoredInteractionEventRecord[]>,
        support.requestToPromise(tx.objectStore(support.STORES.QUIZ_ATTEMPT_RECEIPTS).getAll()) as Promise<StoredQuizAttemptReceipt[]>,
        support.requestToPromise(tx.objectStore(support.STORES.STUDY_ATTEMPT_RECEIPTS).count()),
      ]);
      await complete;
      return { histories, events, receipts, studyReceipts };
    };
    (window as QuizIdbWindow).quizIdb = fixture;
  }, moduleCode);
});

test.afterEach(async ({ page }) => {
  await page.evaluate(() => (window as QuizIdbWindow).quizIdb?.db.close());
  expect(unexpectedRequests, 'Only the synthetic fixture origin may be requested').toEqual([]);
});

test('quiz receipt survives a lost response, deduplicates concurrent retries, and preserves distinct parallel answers', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const fixture = (window as QuizIdbWindow).quizIdb;
    const otherDb = await fixture.support.initStorageDb();
    const otherContext: LearningHistoryContext = {
      ...fixture.context,
      getDb: async () => otherDb,
      getStore: (name, mode) => fixture.support.getObjectStore(Promise.resolve(otherDb), name, mode),
    };
    try {
      const [first, duplicate] = await Promise.all([
        fixture.save({ clientAttemptId: 'lost-response' }),
        fixture.save({ clientAttemptId: 'lost-response' }, undefined, otherContext),
      ]);
      const afterDuplicate = await fixture.snapshot();
      // Discard the first response and reopen the database before retrying.
      fixture.db.close();
      fixture.db = await fixture.support.initStorageDb();
      const recovered = await fixture.save({ clientAttemptId: 'lost-response' });
      const afterReopen = await fixture.snapshot();
      const concurrent = await Promise.all(Array.from({ length: 24 }, (_, index) => fixture.save({
        clientAttemptId: `parallel-${index}`, correct: index % 2 === 0, responseTimeMs: 10 + index,
      }, undefined, index % 2 === 0 ? fixture.context : otherContext)));
      const afterParallel = await fixture.snapshot();
      await fixture.save({ clientAttemptId: 'lost-response' }, 'other-learner');
      return { first, duplicate, recovered, afterDuplicate, afterReopen, concurrent, afterParallel, afterOtherUser: await fixture.snapshot() };
    } finally { otherDb.close(); }
  });

  expect(result.first).toMatchObject({ clientAttemptId: 'lost-response', wordId: 'quiz-word', bookId: 'quiz-book', storageMode: 'idb' });
  expect(result.first.committedAt).toBeGreaterThan(0);
  expect(result.duplicate).toEqual(result.first);
  expect(result.recovered).toEqual(result.first);
  expect(result.afterDuplicate.histories[0].data).toMatchObject({ attemptCount: 1, correctCount: 1, totalResponseTimeMs: 100, interactionSource: 'QUIZ' });
  expect(result.afterDuplicate.events).toHaveLength(1);
  expect(result.afterDuplicate.receipts).toHaveLength(1);
  expect(result.afterReopen).toEqual(result.afterDuplicate);
  expect(result.concurrent).toHaveLength(24);
  expect(result.afterParallel.histories[0].data).toMatchObject({ attemptCount: 25, correctCount: 13, totalResponseTimeMs: 616 });
  expect(result.afterParallel.events).toHaveLength(25);
  expect(result.afterParallel.receipts).toHaveLength(25);
  expect(result.afterParallel.studyReceipts).toBe(0);
  expect(result.afterOtherUser.histories).toHaveLength(2);
  expect(result.afterOtherUser.events).toHaveLength(26);
  expect(result.afterOtherUser.receipts).toHaveLength(26);
});

test('quiz fingerprint rejects changed content including full feedback but ignores object key ordering', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const fixture = (window as QuizIdbWindow).quizIdb;
    const feedback: import('../../types').JapaneseTranslationFeedback = {
      isCorrect: true, score: 8, maxScore: 10, verdictLabel: '合格', examTarget: 'GENERAL',
      sourceSentence: 'I learn English.', expectedTranslation: '英語を学ぶ。', userTranslation: '英語を学ぶ。',
      summaryJa: '語順を確認できました。', strengths: ['主語'], issues: [], improvedTranslation: '英語を学ぶ。',
      grammarAdviceJa: '動詞を確認', nextDrillJa: '次の文', criteria: [{ label: '意味', score: 8, maxScore: 10, comment: '保持' }], usedAi: false,
    };
    const base: Partial<QuizAttemptInput> = {
      clientAttemptId: 'full-payload', missionAssignmentId: 'mission-a',
      taskIntentType: 'BOOK_QUIZ' as import('../../types').LearningTaskIntentType,
      generatedProblemId: 'generated-a', grammarScopeId: 'basic-svo', translationFeedback: feedback,
    };
    const receipt = await fixture.save(base);
    const before = await fixture.snapshot();
    const reorderedFeedback = Object.fromEntries(Object.entries(feedback).reverse()) as unknown as typeof feedback;
    const reordered = await fixture.save({ ...base, translationFeedback: reorderedFeedback });
    const changes: Partial<QuizAttemptInput>[] = [
      { wordId: 'changed-word' }, { bookId: 'changed-book' }, { correct: false },
      { questionMode: 'JA_TO_EN' }, { responseTimeMs: 101 }, { missionAssignmentId: 'mission-b' },
      { taskIntentType: 'MISSION_QUIZ' as import('../../types').LearningTaskIntentType },
      { generatedProblemId: 'generated-b' }, { grammarScopeId: 'be-verb' },
      { translationFeedback: { ...feedback, userTranslation: '別の回答' } },
      { translationFeedback: { ...feedback, criteria: [{ ...feedback.criteria[0], comment: '変更' }] } },
    ];
    const conflicts = [];
    for (const change of changes) conflicts.push(await fixture.save({ ...base, ...change }).then(() => false, () => true));
    const invalidInputs = [
      { clientAttemptId: 'invalid id' }, { responseTimeMs: -1 }, { responseTimeMs: Number.NaN },
      { wordId: ' ' }, { questionMode: 'UNKNOWN' as QuizAttemptInput['questionMode'] },
    ];
    const invalid = [];
    for (const input of invalidInputs) invalid.push(await fixture.save(input).then(() => false, () => true));
    return { receipt, reordered, before, after: await fixture.snapshot(), conflicts, invalid };
  });

  expect(result.reordered).toEqual(result.receipt);
  expect(result.conflicts).toEqual(Array(11).fill(true));
  expect(result.invalid).toEqual(Array(5).fill(true));
  expect(result.after).toEqual(result.before);
  expect(result.after.receipts[0].fingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(result.after.receipts[0]).not.toHaveProperty('translationFeedback');
  expect(result.after.events[0].data).not.toHaveProperty('generatedProblemId');
});

test('quiz abort rolls back history, event and receipt even after receipt request success, then same-id retry recovers', async ({ page }) => {
  const results = await page.evaluate(async () => {
    const fixture = (window as QuizIdbWindow).quizIdb;
    const { STORES } = fixture.support;
    const results = [];
    for (const failure of ['history', 'event', 'receipt', 'after-receipt-success']) {
      const before = await fixture.snapshot();
      const originalPut = IDBObjectStore.prototype.put;
      const originalAdd = IDBObjectStore.prototype.add;
      let receiptRequestSucceeded = false;
      IDBObjectStore.prototype.put = function (value, key) {
        if (failure === 'history' && this.name === STORES.HISTORY) throw new DOMException('Injected history failure', 'QuotaExceededError');
        return originalPut.call(this, value, key);
      };
      IDBObjectStore.prototype.add = function (value, key) {
        if ((failure === 'event' && this.name === STORES.INTERACTION_EVENTS)
          || (failure === 'receipt' && this.name === STORES.QUIZ_ATTEMPT_RECEIPTS)) {
          throw new DOMException('Injected atomic save failure', 'QuotaExceededError');
        }
        const request = originalAdd.call(this, value, key);
        if (failure === 'after-receipt-success' && this.name === STORES.QUIZ_ATTEMPT_RECEIPTS) {
          const tx = this.transaction;
          request.addEventListener('success', () => { receiptRequestSucceeded = true; tx.abort(); });
        }
        return request;
      };
      let rejected: boolean;
      try { rejected = await fixture.save({ clientAttemptId: failure }).then(() => false, () => true); }
      finally { IDBObjectStore.prototype.put = originalPut; IDBObjectStore.prototype.add = originalAdd; }
      const afterAbort = await fixture.snapshot();
      const receipt = await fixture.save({ clientAttemptId: failure });
      results.push({ failure, rejected, receiptRequestSucceeded, before, afterAbort, receipt, afterRetry: await fixture.snapshot() });
    }
    return results;
  });

  for (const [index, result] of results.entries()) {
    expect(result.rejected, result.failure).toBe(true);
    expect(result.afterAbort, result.failure).toEqual(result.before);
    expect(result.receipt).toMatchObject({ clientAttemptId: result.failure, storageMode: 'idb' });
    expect(result.afterRetry.histories[0].data.attemptCount).toBe(index + 1);
    expect(result.afterRetry.events).toHaveLength(index + 1);
    expect(result.afterRetry.receipts).toHaveLength(index + 1);
  }
  expect(results[3].receiptRequestSucceeded).toBe(true);
});

test('legacy quiz returns null, quiz and SRS ids stay separate, and derived refresh failure preserves the saved receipt', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const fixture = (window as QuizIdbWindow).quizIdb;
    const legacy = await Promise.all([fixture.save({}), fixture.save({})]);
    const afterLegacy = await fixture.snapshot();
    const word = { id: 'quiz-word', bookId: 'quiz-book', word: 'learn', definition: '学ぶ', number: 1, searchKey: 'learn' };
    await fixture.learning.saveSrsHistory(fixture.context, 'quiz-native-learner', word, 3, 100, undefined, undefined, 'shared-id');
    const afterStudy = await fixture.snapshot();
    fixture.context.getSession = async () => { throw new Error('Injected derived refresh failure'); };
    const receipt = await fixture.save({ clientAttemptId: 'shared-id' });
    const afterRefreshFailure = await fixture.snapshot();
    fixture.context.getSession = async () => null;
    const retry = await fixture.save({ clientAttemptId: 'shared-id' });
    const signalCount = await fixture.support.requestToPromise(
      fixture.db.transaction(fixture.support.STORES.WEAKNESS_SIGNALS).objectStore(fixture.support.STORES.WEAKNESS_SIGNALS).count(),
    );
    return { legacy, afterLegacy, afterStudy, receipt, retry, afterRefreshFailure, afterRetry: await fixture.snapshot(), signalCount };
  });

  expect(result.legacy).toEqual([null, null]);
  expect(result.afterLegacy.histories[0].data.attemptCount).toBe(2);
  expect(result.afterLegacy.events).toHaveLength(2);
  expect(result.afterLegacy.receipts).toHaveLength(2);
  expect(result.afterStudy.studyReceipts).toBe(1);
  expect(result.receipt).toMatchObject({ clientAttemptId: 'shared-id', storageMode: 'idb', projectionStatus: 'PENDING' });
  expect(result.retry).toEqual({ ...result.receipt, projectionStatus: 'COMPLETE' });
  expect(result.afterRefreshFailure.histories[0].data).toMatchObject({
    attemptCount: 4, interactionSource: 'STUDY',
    interval: result.afterStudy.histories[0].data.interval,
    nextReviewDate: result.afterStudy.histories[0].data.nextReviewDate,
    status: result.afterStudy.histories[0].data.status,
  });
  expect(result.afterRefreshFailure.events).toHaveLength(4);
  expect(result.afterRefreshFailure.receipts).toHaveLength(3);
  expect(result.afterRefreshFailure.studyReceipts).toBe(1);
  expect(result.afterRetry).toEqual(result.afterRefreshFailure);
  expect(result.signalCount).toBeGreaterThan(0);
});

test('actual IDB reset clears quiz receipts so the previous attempt id can save fresh history', async ({ page }) => {
  const result = await page.evaluate(async (code) => {
    const fixture = (window as QuizIdbWindow).quizIdb;
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    let serviceModule: Pick<typeof import('../../services/storage'), 'IndexedDBStorageService'>;
    try { serviceModule = await import(url); } finally { URL.revokeObjectURL(url); }
    const actualStorage = new serviceModule.IndexedDBStorageService({ db: fixture.db });
    const save = (attemptId: string) => actualStorage.recordQuizAttempt(
      'quiz-native-learner', 'quiz-word', 'quiz-book', true, 'EN_TO_JA', 100,
      undefined, undefined, undefined, undefined, undefined, attemptId,
    );
    const original = await save('before-reset');
    await save('another-before-reset');
    await actualStorage.saveSRSHistory(
      'quiz-native-learner',
      { id: 'srs-word', bookId: 'quiz-book', word: 'learn', definition: '学ぶ', number: 1, searchKey: 'learn' },
      3, 100, undefined, undefined, 'before-reset',
    );
    const beforeReset = await fixture.snapshot();
    await actualStorage.resetAllData();
    const afterReset = await fixture.snapshot();
    const fresh = await save('before-reset');
    const afterFreshSave = await fixture.snapshot();
    const retried = await save('before-reset');
    return { original, fresh, retried, beforeReset, afterReset, afterFreshSave, afterRetry: await fixture.snapshot() };
  }, storageServiceCode);

  expect(result.beforeReset.histories).toHaveLength(2);
  expect(result.beforeReset.events).toHaveLength(3);
  expect(result.beforeReset.receipts).toHaveLength(2);
  expect(result.beforeReset.studyReceipts).toBe(1);
  expect(result.afterReset).toEqual({ histories: [], events: [], receipts: [], studyReceipts: 0 });
  expect(result.fresh).toMatchObject({ clientAttemptId: 'before-reset', storageMode: 'idb' });
  expect(result.afterFreshSave.histories).toHaveLength(1);
  expect(result.afterFreshSave.histories[0].data).toMatchObject({
    wordId: 'quiz-word', attemptCount: 1, correctCount: 1, totalResponseTimeMs: 100, interactionSource: 'QUIZ',
  });
  expect(result.afterFreshSave.events).toHaveLength(1);
  expect(result.afterFreshSave.receipts).toHaveLength(1);
  expect(result.afterFreshSave.studyReceipts).toBe(0);
  expect(result.retried).toEqual(result.fresh);
  expect(result.afterRetry).toEqual(result.afterFreshSave);
});

test('v8 upgrade adds quiz receipts while retaining synthetic v7 history and SRS receipts', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const fixture = (window as QuizIdbWindow).quizIdb;
    const { support } = fixture;
    fixture.db.close();
    await support.requestToPromise(indexedDB.deleteDatabase(support.DB_NAME));
    const request = indexedDB.open(support.DB_NAME, 7);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(support.STORES.HISTORY, { keyPath: 'id' });
      request.result.createObjectStore(support.STORES.STUDY_ATTEMPT_RECEIPTS, { keyPath: 'id' });
    };
    const oldDb = await support.requestToPromise(request);
    const history = { id: 'synthetic-old-history', data: { wordId: 'old-word', bookId: 'old-book', attemptCount: 4 } };
    const receipt = { id: 'synthetic-old-study', uid: 'old-learner', clientAttemptId: 'old-attempt', fingerprint: 'old-fingerprint', committedAt: 42 };
    const tx = oldDb.transaction([support.STORES.HISTORY, support.STORES.STUDY_ATTEMPT_RECEIPTS], 'readwrite');
    const complete = support.waitForTransaction(tx);
    tx.objectStore(support.STORES.HISTORY).put(history);
    tx.objectStore(support.STORES.STUDY_ATTEMPT_RECEIPTS).put(receipt);
    await complete;
    oldDb.close();
    fixture.db = await support.initStorageDb();
    const restoredTx = fixture.db.transaction([support.STORES.HISTORY, support.STORES.STUDY_ATTEMPT_RECEIPTS]);
    const [restoredHistory, restoredReceipt] = await Promise.all([
      support.requestToPromise(restoredTx.objectStore(support.STORES.HISTORY).get(history.id)),
      support.requestToPromise(restoredTx.objectStore(support.STORES.STUDY_ATTEMPT_RECEIPTS).get(receipt.id)),
    ]);
    return { version: fixture.db.version, hasQuizReceipts: fixture.db.objectStoreNames.contains(support.STORES.QUIZ_ATTEMPT_RECEIPTS), history, receipt, restoredHistory, restoredReceipt };
  });

  expect(result.version).toBe(8);
  expect(result.hasQuizReceipts).toBe(true);
  expect(result.restoredHistory).toEqual(result.history);
  expect(result.restoredReceipt).toEqual(result.receipt);
});
