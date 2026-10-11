import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { build } from 'vite';
import type { Page, BrowserContext } from '@playwright/test';
import { expect, test } from './diagnostics';

type NativeFixture = {
  support: typeof import('../../services/storage/idb-support');
  learning: typeof import('../../services/storage/learning-history');
  db: IDBDatabase;
  context: import('../../services/storage/learning-history').LearningHistoryContext;
  now: number;
  start: (id: string, bookId?: string, limit?: number, range?: { start: number; end: number }, mode?: 'study' | 'quiz', policy?: string) => Promise<import('../../types').WordData[]>;
  snapshot: () => Promise<{ session: unknown[]; history: unknown[]; events: number; receipts: number }>;
};
type FixtureWindow = typeof window & { graduatedFixture: NativeFixture };
let historyCode = '';
const supportCode = ts.transpileModule(readFileSync(new URL('../../services/storage/idb-support.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;

test.beforeAll(async () => {
  const bundled = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: fileURLToPath(new URL('../../services/storage/learning-history.ts', import.meta.url)), formats: ['es'] } } });
  const outputs = Array.isArray(bundled) ? bundled : [bundled];
  const entry = outputs.flatMap((output) => 'output' in output ? output.output : []).find((output) => output.type === 'chunk' && output.isEntry);
  if (!entry || entry.type !== 'chunk' || entry.imports.length || entry.dynamicImports.length) throw new Error('Native long-term review fixture must bundle actual storage without external imports.');
  historyCode = entry.code;
});

test.afterEach(async ({ page }, testInfo) => {
  const evidence = await page.evaluate(async () => {
    const fixture = (window as FixtureWindow).graduatedFixture;
    if (!fixture) return undefined;
    const db = await fixture.support.initStorageDb();
    try {
      const tx = db.transaction([fixture.support.STORES.SESSION, fixture.support.STORES.HISTORY, fixture.support.STORES.INTERACTION_EVENTS, fixture.support.STORES.STUDY_ATTEMPT_RECEIPTS]);
      const done = fixture.support.waitForTransaction(tx);
      const [session, histories, events, receipts] = await Promise.all([
        fixture.support.requestToPromise(tx.objectStore(fixture.support.STORES.SESSION).getAll()),
        fixture.support.requestToPromise(tx.objectStore(fixture.support.STORES.HISTORY).getAll()),
        fixture.support.requestToPromise(tx.objectStore(fixture.support.STORES.INTERACTION_EVENTS).count()),
        fixture.support.requestToPromise(tx.objectStore(fixture.support.STORES.STUDY_ATTEMPT_RECEIPTS).getAll()),
      ]);
      await done;
      return { nativeIndexedDB: true, dbVersion: db.version, simulatedNow: fixture.now, sessionRecords: session,
        historyCount: histories.length, studyEvents: events, answerReceipts: receipts };
    } finally { db.close(); }
  });
  if (evidence) await testInfo.attach('native-idb-persistence.json', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
});

const setup = async (page: Page, context: BrowserContext, secondTab = false, seed = true) => {
  await context.route('https://graduated-idb.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Native long-term review verification</title>' }));
  const initialize = async (target: Page, seed: boolean) => {
    await target.goto('https://graduated-idb.test/');
    await target.evaluate(async ({ supportCode, historyCode, seed }) => {
      const importCode = async (code: string) => {
        const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
        try { return await import(url); } finally { URL.revokeObjectURL(url); }
      };
      const support: NativeFixture['support'] = await importCode(supportCode);
      const learning: NativeFixture['learning'] = await importCode(historyCode);
      const db = await support.initStorageDb();
      const fixture = { support, learning, db, now: Date.parse('2026-10-11T14:59:00Z') } as NativeFixture;
      const uid = 'graduate-student';
      const user = { uid, displayName: 'Synthetic learner', role: 'STUDENT', subscriptionPlan: 'TOC_FREE', stats: { xp: 0, level: 1, currentStreak: 0, lastLoginDate: '' } };
      Date.now = () => fixture.now;
      if (seed) {
        const tx = db.transaction(Object.values(support.STORES), 'readwrite');
        const done = support.waitForTransaction(tx);
        tx.objectStore(support.STORES.SESSION).put({ key: 'current', user });
        for (const bookId of ['book-a', 'book-b']) {
          tx.objectStore(support.STORES.BOOKS).put({ id: bookId, title: bookId, wordCount: 115,
            catalogSource: 'USER_GENERATED', accessScope: 'ALL_PLANS', description: JSON.stringify({ createdBy: uid }) });
          for (let n = 1; n <= 115; n++) {
            const id = `${bookId}-${n}`;
            tx.objectStore(support.STORES.WORDS).put({ id, bookId, number: n, word: `word${n}`, definition: `meaning${n}` });
            tx.objectStore(support.STORES.HISTORY).put({ id: `${uid}_${id}`, data: {
              wordId: id, bookId, status: n <= 100 ? 'review' : 'graduated', interactionSource: 'STUDY',
              nextReviewDate: fixture.now - n, lastStudiedAt: fixture.now - 100_000, interval: n <= 100 ? 4 : 30,
              easeFactor: 2.5, attemptCount: 5, correctCount: 5, totalResponseTimeMs: 50,
            } });
          }
        }
        await done;
      }
      fixture.context = {
        getDb: async () => db,
        getStore: (name, mode) => support.getObjectStore(Promise.resolve(db), name, mode),
        getBooks: async () => support.requestToPromise(db.transaction(support.STORES.BOOKS).objectStore(support.STORES.BOOKS).getAll()),
        getWordsByBook: async (bookId) => support.requestToPromise(db.transaction(support.STORES.WORDS).objectStore(support.STORES.WORDS).index('bookId').getAll(bookId)),
        getSession: async () => (await support.requestToPromise(db.transaction(support.STORES.SESSION).objectStore(support.STORES.SESSION).get('current')))?.user || null,
      };
      fixture.start = (id, bookId = 'book-a', limit = 20, range, mode = 'study', policy = 'BOOK_DUE_ONLY') => learning.getBookSession(fixture.context, uid, bookId, limit, {
        mode, intentType: 'BOOK_STUDY', label: 'Native verification', selectionPolicy: policy, limit, bookId, ...(range ? { wordRange: range } : {}),
      } as import('../../types').LearningTaskIntent, id);
      fixture.snapshot = async () => {
        const tx = db.transaction([support.STORES.SESSION, support.STORES.HISTORY, support.STORES.INTERACTION_EVENTS, support.STORES.STUDY_ATTEMPT_RECEIPTS]);
        const done = support.waitForTransaction(tx);
        const [session, history, events, receipts] = await Promise.all([
          support.requestToPromise(tx.objectStore(support.STORES.SESSION).getAll()),
          support.requestToPromise(tx.objectStore(support.STORES.HISTORY).getAll()),
          support.requestToPromise(tx.objectStore(support.STORES.INTERACTION_EVENTS).count()),
          support.requestToPromise(tx.objectStore(support.STORES.STUDY_ATTEMPT_RECEIPTS).count()),
        ]);
        await done;
        return { session, history, events, receipts };
      };
      (window as FixtureWindow).graduatedFixture = fixture;
    }, { supportCode, historyCode, seed });
  };
  await initialize(page, seed);
  const other = secondTab ? await context.newPage() : undefined;
  if (other) await initialize(other, false);
  return other;
};

test('native IDB serializes different-material two-tab starts at the last daily slot and retains DB9 rollback compatibility', async ({ page, context }) => {
  const other = await setup(page, context, true);
  await page.evaluate(async () => { const fixture = (window as FixtureWindow).graduatedFixture; await fixture.start('first-three'); await fixture.start('fourth', 'book-a', 5); });
  const [left, right] = await Promise.all([
    page.evaluate(async () => (await (window as FixtureWindow).graduatedFixture.start('race-a')).filter((word) => word.longTermReview).map((word) => word.id)),
    other!.evaluate(async () => (await (window as FixtureWindow).graduatedFixture.start('race-b', 'book-b')).filter((word) => word.longTermReview).map((word) => word.id)),
  ]);
  expect(left.length + right.length).toBe(1);
  const result = await page.evaluate(async () => {
    const fixture = (window as FixtureWindow).graduatedFixture;
    const snapshot = await fixture.snapshot();
    const day = snapshot.session.find((record: any) => record.key.startsWith('long-term-review-day:')) as any;
    const beforeAbandon = snapshot;
    for (let index = 0; index < 5; index++) await fixture.start(`abandoned-${index}`, index % 2 ? 'book-b' : 'book-a');
    const after = await fixture.snapshot();
    return { day, afterDay: after.session.find((record: any) => record.key.startsWith('long-term-review-day:')), events: after.events, receipts: after.receipts,
      historySame: JSON.stringify(after.history) === JSON.stringify(beforeAbandon.history), version: fixture.db.version };
  });
  expect(result.day.allocatedWordIds).toHaveLength(5);
  expect(new Set(result.day.allocatedWordIds).size).toBe(5);
  expect((result.afterDay as any).allocatedWordIds).toEqual(result.day.allocatedWordIds);
  expect(result).toMatchObject({ historySame: true, events: 0, receipts: 0, version: 9 });
  await other!.evaluate(() => (window as FixtureWindow).graduatedFixture.db.close());
  const reopened = await page.evaluate(async () => {
    const fixture = (window as FixtureWindow).graduatedFixture;
    fixture.db.close();
    const request = indexedDB.open('MedAceDB', 9);
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const current = await fixture.support.requestToPromise(db.transaction('session').objectStore('session').get('current'));
    const historyCount = await fixture.support.requestToPromise(db.transaction('history').objectStore('history').count());
    const result = { version: db.version, uid: current.user.uid, historyCount }; db.close(); return result;
  });
  expect(reopened).toEqual({ version: 9, uid: 'graduate-student', historyCount: 230 });
});

test('native IDB committed starts replay unchanged after lost response or JST midnight and conflicting payloads reject', async ({ page, context }) => {
  await setup(page, context);
  const result = await page.evaluate(async () => {
    const fixture = (window as FixtureWindow).graduatedFixture;
    const first = await fixture.start('lost-response');
    const committed = await fixture.snapshot();
    const replay = await fixture.start('lost-response');
    const afterReplay = await fixture.snapshot();
    const conflict = await fixture.start('lost-response', 'book-a', 5).then(() => false, (error) => error.status === 409);
    fixture.now = Date.parse('2026-10-11T15:01:00Z');
    const midnightReplay = await fixture.start('lost-response');
    const nextDay = await fixture.start('new-day', 'book-b');
    const afterMidnight = await fixture.snapshot();
    const firstWord = first.find((word) => word.longTermReview)!;
    await fixture.learning.saveSrsHistory(fixture.context, 'graduate-student', firstWord, 0, 100, undefined, undefined, 'midnight-answer');
    await fixture.learning.saveSrsHistory(fixture.context, 'graduate-student', firstWord, 0, 100, undefined, undefined, 'midnight-answer');
    const answered = await fixture.snapshot();
    return { first: first.map((word) => word.id), replay: replay.map((word) => word.id), midnightReplay: midnightReplay.map((word) => word.id),
      unchangedReplay: JSON.stringify(committed) === JSON.stringify(afterReplay), conflict,
      starts: afterMidnight.session.filter((record: any) => record.key.startsWith('long-term-review-start:')),
      days: afterMidnight.session.filter((record: any) => record.key.startsWith('long-term-review-day:')),
      nextDayLong: nextDay.filter((word) => word.longTermReview).length, answerReceipts: answered.receipts, answerEvents: answered.events };
  });
  expect(result.replay).toEqual(result.first);
  expect(result.midnightReplay).toEqual(result.first);
  expect(result.unchangedReplay).toBe(true);
  expect(result.conflict).toBe(true);
  expect(result.starts).toHaveLength(2);
  expect((result.starts[0] as any).dayKey).toBe('2026-10-11');
  expect((result.starts[1] as any).dayKey).toBe('2026-10-12');
  expect(result.days).toHaveLength(2);
  expect(result).toMatchObject({ nextDayLong: 3, answerReceipts: 1, answerEvents: 1 });
});

test('native IDB assignment never blocks a shown answer, but latest authorization revocation blocks replay overview and answer', async ({ page, context }) => {
  await setup(page, context);
  const result = await page.evaluate(async () => {
    const fixture = (window as FixtureWindow).graduatedFixture;
    const shown = await fixture.start('shown');
    await fixture.start('consume-rest', 'book-b');
    const word = shown.find((word) => word.longTermReview)!;
    await fixture.learning.saveSrsHistory(fixture.context, 'graduate-student', word, 0, 100, undefined, undefined, 'shown-save');
    const saved = await fixture.snapshot();
    const tx = fixture.db.transaction(fixture.support.STORES.BOOKS, 'readwrite');
    const done = fixture.support.waitForTransaction(tx);
    tx.objectStore(fixture.support.STORES.BOOKS).put({ id: 'book-a', title: 'Now private', wordCount: 115,
      catalogSource: 'USER_GENERATED', description: JSON.stringify({ createdBy: 'graduate-student-other' }) });
    await done;
    const replayRejected = await fixture.start('shown').then(() => false, () => true);
    const overviewRejected = await fixture.learning.getBookStudyOverview(fixture.context, 'graduate-student', 'book-a').then(() => false, () => true);
    const answerRejected = await fixture.learning.saveSrsHistory(fixture.context, 'graduate-student', word, 2, 100, undefined, undefined, 'revoked-save').then(() => false, () => true);
    const otherUserRejected = await fixture.learning.getBookSession(fixture.context, 'graduate-student-other', 'book-b', 20, undefined, 'stolen-user').then(() => false, () => true);
    const after = await fixture.snapshot();
    return { shownSaved: saved.receipts === 1 && saved.events === 1, replayRejected, overviewRejected, answerRejected, otherUserRejected,
      historyUnchanged: JSON.stringify(saved.history) === JSON.stringify(after.history), receiptsUnchanged: saved.receipts === after.receipts,
      availableOtherBook: await fixture.learning.getLongTermReviewAvailableCount(fixture.context, 'graduate-student', 'book-b') };
  });
  expect(result).toEqual({ shownSaved: true, replayRejected: true, overviewRejected: true, answerRejected: true, otherUserRejected: true,
    historyUnchanged: true, receiptsUnchanged: true, availableOtherBook: 0 });
});

test('native IDB scope excludes other chapters future quiz and other-user histories and reserves review amid 100 ordinary due words', async ({ page, context }) => {
  await setup(page, context);
  const result = await page.evaluate(async () => {
    const fixture = (window as FixtureWindow).graduatedFixture;
    const overview = await fixture.learning.getBookStudyOverview(fixture.context, 'graduate-student', 'book-a', { start: 1, end: 100 });
    const noLong = await fixture.start('normal-chapter', 'book-a', 10, { start: 1, end: 100 });
    const beforeExcluded = await fixture.snapshot();
    const quiz = await fixture.start('quiz', 'book-a', 10, undefined, 'quiz');
    const newOnly = await fixture.start('new-only', 'book-a', 10, undefined, 'study', 'BOOK_NEW_ONLY');
    const afterExcluded = await fixture.snapshot();
    const tx = fixture.db.transaction(fixture.support.STORES.HISTORY, 'readwrite');
    const done = fixture.support.waitForTransaction(tx);
    const historyStore = tx.objectStore(fixture.support.STORES.HISTORY);
    const update = (id: string, mutate: (record: any) => void) => { const request = historyStore.get(id); request.onsuccess = () => { const record = request.result; mutate(record); historyStore.put(record); }; };
    update('graduate-student_book-a-101', (record) => { record.data.nextReviewDate = fixture.now + 100_000; });
    update('graduate-student_book-a-102', (record) => { record.data.interactionSource = 'QUIZ'; });
    update('graduate-student_book-a-103', (record) => { historyStore.delete(record.id); record.id = 'graduate-student_other_book-a-103'; });
    update('graduate-student_book-a-104', (record) => { record.data.bookId = 'book-b'; });
    await done;
    const bounded = await fixture.start('bounded');
    const short: string[][] = [];
    for (let index = 1; index <= 5; index++) short.push((await fixture.start(`one-word-${index}`, 'book-a', 1)).filter((word) => word.longTermReview).map((word) => word.id));
    return { overview, noLong: noLong.filter((word) => word.longTermReview).length, quizLong: quiz.filter((word) => word.longTermReview).length,
      newOnlyLong: newOnly.filter((word) => word.longTermReview).length, excludedNoAllocation: JSON.stringify(beforeExcluded.session) === JSON.stringify(afterExcluded.session),
      boundedCount: bounded.length, boundedLong: bounded.filter((word) => word.longTermReview).map((word) => word.id), short,
      dueCount: await fixture.learning.getDueCount(fixture.context, 'graduate-student') };
  });
  expect(result.overview).toMatchObject({ totalCount: 100, dueCount: 100, longTermReviewAvailableCount: 0 });
  expect(result).toMatchObject({ noLong: 0, quizLong: 0, newOnlyLong: 0, excludedNoAllocation: true, boundedCount: 20, dueCount: 200 });
  expect(result.boundedLong).toHaveLength(3);
  expect(result.boundedLong.every((id) => !['book-a-101', 'book-a-102', 'book-a-103', 'book-a-104'].includes(id))).toBe(true);
  expect(result.short.flat()).toHaveLength(1);
});

test('native IDB replay drops formerly ordinary words that another tab moved into future review or graduation', async ({ page, context }) => {
  await setup(page, context);
  const result = await page.evaluate(async () => {
    const fixture = (window as FixtureWindow).graduatedFixture;
    const first = await fixture.start('changed-normal');
    const normal = first.filter((word) => !word.longTermReview).slice(0, 2);
    const tx = fixture.db.transaction(fixture.support.STORES.HISTORY, 'readwrite');
    const done = fixture.support.waitForTransaction(tx);
    normal.forEach((word, index) => {
      const store = tx.objectStore(fixture.support.STORES.HISTORY);
      const request = store.get(`graduate-student_${word.id}`);
      request.onsuccess = () => { const record = request.result; record.data.nextReviewDate = fixture.now + 100_000;
        record.data.status = index === 0 ? 'graduated' : 'review'; store.put(record); };
    });
    await done;
    const before = await fixture.snapshot();
    const replay = await fixture.start('changed-normal');
    const after = await fixture.snapshot();
    return { changedIds: normal.map((word) => word.id), replayIds: replay.map((word) => word.id),
      initialCount: first.length, replayCount: replay.length, noRefill: JSON.stringify(before.session) === JSON.stringify(after.session) };
  });
  expect(result.initialCount).toBe(20);
  expect(result.replayCount).toBe(18);
  expect(result.changedIds.every((id) => !result.replayIds.includes(id))).toBe(true);
  expect(result.noRefill).toBe(true);
});

test('native IDB rolls back a failed start receipt and daily assignment together before retrying', async ({ page, context }) => {
  await setup(page, context);
  const result = await page.evaluate(async () => {
    const fixture = (window as FixtureWindow).graduatedFixture;
    const before = await fixture.snapshot();
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === fixture.support.STORES.SESSION && value.key?.startsWith('long-term-review-day:')) {
        throw new DOMException('Injected assignment write failure', 'QuotaExceededError');
      }
      return originalPut.call(this, value, key);
    };
    let failed = false;
    try { failed = await fixture.start('interrupted-start').then(() => false, () => true); }
    finally { IDBObjectStore.prototype.put = originalPut; }
    const afterFailure = await fixture.snapshot();
    const retried = await fixture.start('interrupted-start');
    const afterRetry = await fixture.snapshot();
    return { failed, unchanged: JSON.stringify(before) === JSON.stringify(afterFailure),
      retriedLong: retried.filter((word) => word.longTermReview).length,
      day: afterRetry.session.find((record: any) => record.key.startsWith('long-term-review-day:')),
      starts: afterRetry.session.filter((record: any) => record.key.startsWith('long-term-review-start:')).length };
  });
  expect(result).toMatchObject({ failed: true, unchanged: true, retriedLong: 3, starts: 1 });
  expect((result.day as any).allocatedWordIds).toHaveLength(3);
  expect((result.day as any).startOrdinal).toBe(1);
});

test('native IDB daily starts use only preferred authorized materials and fail rather than escape an unavailable explicit scope', async ({ page, context }) => {
  await setup(page, context);
  const result = await page.evaluate(async () => {
    const fixture = (window as FixtureWindow).graduatedFixture;
    const task = { mode: 'study', intentType: 'TODAY_FOCUS', label: 'Preferred scope', selectionPolicy: 'DUE_FIRST',
      limit: 10, preferredBookIds: ['book-a'] } as import('../../types').LearningTaskIntent;
    const availableBefore = await fixture.learning.getLongTermReviewAvailableCount(fixture.context, 'graduate-student');
    const words = await fixture.learning.getDailySessionWords(fixture.context, 'graduate-student', 10, task, 'preferred-daily');
    const before = await fixture.snapshot();
    const unavailable = await fixture.learning.getDailySessionWords(fixture.context, 'graduate-student', 10,
      { ...task, preferredBookIds: ['nonexistent-book'] }, 'unavailable-daily').then(() => false, () => true);
    const after = await fixture.snapshot();
    return { availableBefore, words: words.map((word) => ({ id: word.id, bookId: word.bookId, long: !!word.longTermReview })),
      unavailable, unchanged: JSON.stringify(before) === JSON.stringify(after) };
  });
  expect(result.availableBefore).toBe(5);
  expect(result.words).toHaveLength(10);
  expect(result.words.every((word) => word.bookId === 'book-a')).toBe(true);
  expect(result.words.filter((word) => word.long)).toHaveLength(2);
  expect(result).toMatchObject({ unavailable: true, unchanged: true });
});

test('native IDB zero-field graduated histories remain studied and never enter ranged new-only or duplicate normal slots', async ({ page, context }) => {
  await setup(page, context);
  const result = await page.evaluate(async () => {
    const fixture = (window as FixtureWindow).graduatedFixture;
    const tx = fixture.db.transaction(fixture.support.STORES.HISTORY, 'readwrite');
    const done = fixture.support.waitForTransaction(tx);
    for (const number of [101, 102]) {
      const store = tx.objectStore(fixture.support.STORES.HISTORY);
      const request = store.get(`graduate-student_book-a-${number}`);
      request.onsuccess = () => { const record = request.result; record.data.attemptCount = 0; record.data.interval = 0;
        if (number === 101) record.data.nextReviewDate = fixture.now + 100_000; store.put(record); };
    }
    await done;
    const range = { start: 101, end: 102 };
    const overview = await fixture.learning.getBookStudyOverview(fixture.context, 'graduate-student', 'book-a', range);
    const newOnly = await fixture.start('zero-new', 'book-a', 10, range, 'study', 'BOOK_NEW_ONLY');
    const normalAndLong = await fixture.start('zero-default', 'book-a', 10, range, 'study', 'BOOK_DEFAULT');
    return { overview, newOnly: newOnly.map((word) => word.id), normalAndLong: normalAndLong.map((word) => ({ id: word.id, long: !!word.longTermReview })) };
  });
  expect(result.overview).toMatchObject({ totalCount: 2, studiedCount: 2, newCount: 0, dueCount: 0, longTermReviewAvailableCount: 1 });
  expect(result.newOnly).toEqual([]);
  expect(result.normalAndLong).toEqual([{ id: 'book-a-102', long: true }]);
});

test('native IDB failed read or learning-plan load rejects without reporting zero or assigning a fallback scope', async ({ page, context }) => {
  await setup(page, context);
  const result = await page.evaluate(async () => {
    const fixture = (window as FixtureWindow).graduatedFixture;
    const before = await fixture.snapshot();
    let dbCalls = 0;
    const failingPlan = { ...fixture.context,
      getDb: async () => { dbCalls += 1; return fixture.db; },
      getLearningPlan: async () => { throw new Error('Injected learning-plan load failure'); },
    };
    const planRejected = await fixture.learning.getDailySessionWords(failingPlan, 'graduate-student', 10, undefined, 'failed-plan')
      .then(() => false, (error) => error.message.includes('learning-plan load failure'));
    const legacyWords = await fixture.learning.getDailySessionWords(failingPlan, 'graduate-student', 10);
    const originalGetAll = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function (...args) {
      const request = originalGetAll.apply(this, args);
      if (this.name === fixture.support.STORES.HISTORY) this.transaction.abort();
      return request;
    };
    let readRejected = false;
    try { readRejected = await fixture.learning.getLongTermReviewAvailableCount(fixture.context, 'graduate-student').then(() => false, () => true); }
    finally { IDBObjectStore.prototype.getAll = originalGetAll; }
    const after = await fixture.snapshot();
    return { planRejected, dbCalls, legacyNormalCount: legacyWords.length, readRejected,
      unchanged: JSON.stringify(before) === JSON.stringify(after) };
  });
  expect(result).toEqual({ planRejected: true, dbCalls: 0, legacyNormalCount: 10, readRejected: true, unchanged: true });
});

test('native IDB QUIZ-only graduation remains an ordinary new word on identical default and daily start replays', async ({ page, context }) => {
  await setup(page, context);
  const result = await page.evaluate(async () => {
    const fixture = (window as FixtureWindow).graduatedFixture;
    const bookId = 'quiz-only-book';
    const wordId = 'quiz-only-word';
    const tx = fixture.db.transaction([fixture.support.STORES.BOOKS, fixture.support.STORES.WORDS, fixture.support.STORES.HISTORY], 'readwrite');
    const done = fixture.support.waitForTransaction(tx);
    tx.objectStore(fixture.support.STORES.BOOKS).put({ id: bookId, title: 'Quiz-only fixture', wordCount: 1,
      catalogSource: 'USER_GENERATED', accessScope: 'ALL_PLANS', description: JSON.stringify({ createdBy: 'graduate-student' }) });
    tx.objectStore(fixture.support.STORES.WORDS).put({ id: wordId, bookId, number: 1, word: 'word', definition: 'meaning' });
    tx.objectStore(fixture.support.STORES.HISTORY).put({ id: `graduate-student_${wordId}`, data: {
      wordId, bookId, status: 'graduated', interactionSource: 'QUIZ', nextReviewDate: fixture.now - 1,
      lastStudiedAt: fixture.now - 100_000, interval: 30, easeFactor: 2.5, attemptCount: 5, correctCount: 5, totalResponseTimeMs: 50,
    } });
    await done;
    const overview = await fixture.learning.getBookStudyOverview(fixture.context, 'graduate-student', bookId);
    const firstBook = await fixture.start('quiz-only-default', bookId, 10, undefined, 'study', 'BOOK_DEFAULT');
    const beforeBookReplay = await fixture.snapshot();
    const replayBook = await fixture.start('quiz-only-default', bookId, 10, undefined, 'study', 'BOOK_DEFAULT');
    const afterBookReplay = await fixture.snapshot();
    const task = { mode: 'study', intentType: 'TODAY_FOCUS', label: 'Quiz-only daily fixture', selectionPolicy: 'DUE_FIRST',
      limit: 10, preferredBookIds: [bookId] } as import('../../types').LearningTaskIntent;
    const firstDaily = await fixture.learning.getDailySessionWords(fixture.context, 'graduate-student', 10, task, 'quiz-only-daily');
    const beforeDailyReplay = await fixture.snapshot();
    const replayDaily = await fixture.learning.getDailySessionWords(fixture.context, 'graduate-student', 10, task, 'quiz-only-daily');
    const afterDailyReplay = await fixture.snapshot();
    const project = (words: import('../../types').WordData[]) => words.map((word) => ({ id: word.id, long: !!word.longTermReview }));
    return { overview, firstBook: project(firstBook), replayBook: project(replayBook), firstDaily: project(firstDaily), replayDaily: project(replayDaily),
      bookReplayUnchanged: JSON.stringify(beforeBookReplay) === JSON.stringify(afterBookReplay),
      dailyReplayUnchanged: JSON.stringify(beforeDailyReplay) === JSON.stringify(afterDailyReplay) };
  });
  expect(result.overview).toMatchObject({ totalCount: 1, studiedCount: 0, newCount: 1, dueCount: 0, longTermReviewAvailableCount: 0 });
  expect(result.firstBook).toEqual([{ id: 'quiz-only-word', long: false }]);
  expect(result.replayBook).toEqual(result.firstBook);
  expect(result.firstDaily).toEqual(result.firstBook);
  expect(result.replayDaily).toEqual(result.firstDaily);
  expect(result).toMatchObject({ bookReplayUnchanged: true, dailyReplayUnchanged: true });
});

test('native IDB ADMIN can explicitly inspect pending blocked and ledgerless books while automatic candidates and learner access remain gated', async ({ page, context }) => {
  await setup(page, context);
  const result = await page.evaluate(async () => {
    const fixture = (window as FixtureWindow).graduatedFixture;
    const uid = 'graduate-student';
    const tx = fixture.db.transaction([fixture.support.STORES.SESSION, fixture.support.STORES.BOOKS, fixture.support.STORES.WORDS, fixture.support.STORES.HISTORY], 'readwrite');
    const done = fixture.support.waitForTransaction(tx);
    tx.objectStore(fixture.support.STORES.SESSION).put({ key: 'current', user: { uid, email: 'synthetic-admin@example.test', displayName: 'Synthetic admin', role: 'ADMIN', subscriptionPlan: 'TOC_FREE' } });
    tx.objectStore(fixture.support.STORES.BOOKS).delete('book-a');
    tx.objectStore(fixture.support.STORES.BOOKS).delete('book-b');
    const bookIds = ['pending-official', 'blocked-official', 'ledgerless-official'];
    bookIds.forEach((bookId, index) => {
      tx.objectStore(fixture.support.STORES.BOOKS).put({ id: bookId, title: bookId, wordCount: 2,
        catalogSource: 'STEADY_STUDY_ORIGINAL', accessScope: 'ALL_PLANS', ...(index < 2 ? { qualityGate: {
          status: index === 0 ? 'source_review_required' : 'qa_blocked', label: 'Synthetic unchecked material', summary: '',
          isApprovedForLearner: false, isSelectableForToday: false, blockingReasons: ['Synthetic review pending'], warnings: [],
        } } : {}) });
      for (const number of [1, 2]) {
        const wordId = `${bookId}-${number}`;
        tx.objectStore(fixture.support.STORES.WORDS).put({ id: wordId, bookId, number, word: `word${number}`, definition: 'meaning' });
        tx.objectStore(fixture.support.STORES.HISTORY).put({ id: `${uid}_${wordId}`, data: {
          wordId, bookId, status: number === 1 ? 'review' : 'graduated', interactionSource: 'STUDY', nextReviewDate: fixture.now - 1,
          lastStudiedAt: fixture.now - 100_000, interval: number === 1 ? 4 : 30, easeFactor: 2.5, attemptCount: 5, correctCount: 5, totalResponseTimeMs: 50,
        } });
      }
    });
    await done;
    const automatic = await fixture.learning.getDailySessionWords(fixture.context, uid, 10, undefined, 'admin-automatic');
    const globalLongCount = await fixture.learning.getLongTermReviewAvailableCount(fixture.context, uid);
    const globalDueCount = await fixture.learning.getDueCount(fixture.context, uid);
    const explicit: Array<{ bookId: string; words: string[]; overviewLong: number | undefined }> = [];
    for (const bookId of bookIds) {
      const overview = await fixture.learning.getBookStudyOverview(fixture.context, uid, bookId);
      const words = await fixture.start(`admin-${bookId}`, bookId, 10);
      explicit.push({ bookId, words: words.map((word) => word.id), overviewLong: overview.longTermReviewAvailableCount });
      await fixture.learning.saveSrsHistory(fixture.context, uid, words[0], 0, 100, undefined, undefined, `admin-answer-${bookId}`);
    }
    const rejected: boolean[] = [];
    for (const role of ['STUDENT', 'INSTRUCTOR']) {
      const roleTx = fixture.db.transaction(fixture.support.STORES.SESSION, 'readwrite');
      const roleDone = fixture.support.waitForTransaction(roleTx);
      roleTx.objectStore(fixture.support.STORES.SESSION).put({ key: 'current', user: { uid, email: 'synthetic-learner@example.test', displayName: 'Synthetic learner', role, subscriptionPlan: 'TOC_FREE' } });
      await roleDone;
      for (const bookId of bookIds) {
        rejected.push(await fixture.start(`${role}-${bookId}`, bookId, 10).then(() => false, () => true));
        rejected.push(await fixture.learning.getBookStudyOverview(fixture.context, uid, bookId).then(() => false, () => true));
        rejected.push(await fixture.learning.saveSrsHistory(fixture.context, uid,
          { id: `${bookId}-1`, bookId, number: 1, word: 'word', definition: 'meaning' }, 2, 100, undefined, undefined, `${role}-answer-${bookId}`).then(() => false, () => true));
      }
    }
    return { automatic: automatic.map((word) => word.id), globalLongCount, globalDueCount, explicit, rejected,
      answerReceipts: (await fixture.snapshot()).receipts };
  });
  expect(result).toMatchObject({ automatic: [], globalLongCount: 0, globalDueCount: 0, answerReceipts: 3 });
  expect(result.explicit.map((entry) => entry.words.length)).toEqual([2, 2, 2]);
  expect(result.explicit.map((entry) => entry.overviewLong)).toEqual([1, 1, 1]);
  expect(result.rejected).toHaveLength(18);
  expect(result.rejected.every(Boolean)).toBe(true);
});

test('native IDB saved daily starts retain their original plan scope after plan changes reload and JST midnight while latest authorization and dates still apply', async ({ page, context }) => {
  await setup(page, context);
  const original = await page.evaluate(async () => {
    const fixture = (window as FixtureWindow).graduatedFixture;
    const uid = 'graduate-student';
    fixture.context.getLearningPlan = async () => fixture.support.requestToPromise(fixture.db.transaction(fixture.support.STORES.PLANS).objectStore(fixture.support.STORES.PLANS).get(uid));
    const putPlan = async (selectedBookIds: string[]) => {
      const tx = fixture.db.transaction(fixture.support.STORES.PLANS, 'readwrite');
      const done = fixture.support.waitForTransaction(tx);
      tx.objectStore(fixture.support.STORES.PLANS).put({ uid, selectedBookIds }); await done;
    };
    await putPlan(['book-a']);
    const first = await fixture.learning.getDailySessionWords(fixture.context, uid, 10, undefined, 'frozen-plan');
    await putPlan(['book-b']);
    fixture.now = Date.parse('2026-10-11T15:01:00Z');
    const beforeReplay = await fixture.snapshot();
    const replay = await fixture.learning.getDailySessionWords(fixture.context, uid, 10, undefined, 'frozen-plan');
    const afterReplay = await fixture.snapshot();
    const next = await fixture.learning.getDailySessionWords(fixture.context, uid, 10, undefined, 'new-plan');
    return { first: first.map((word) => ({ id: word.id, bookId: word.bookId, long: !!word.longTermReview })), replayIds: replay.map((word) => word.id),
      nextBooks: next.map((word) => word.bookId), replayUnchanged: JSON.stringify(beforeReplay) === JSON.stringify(afterReplay) };
  });
  expect(original.first).toHaveLength(10);
  expect(original.first.every((word) => word.bookId === 'book-a')).toBe(true);
  expect(original.replayIds).toEqual(original.first.map((word) => word.id));
  expect(original.nextBooks).toHaveLength(10);
  expect(original.nextBooks.every((bookId) => bookId === 'book-b')).toBe(true);
  expect(original.replayUnchanged).toBe(true);
  await page.evaluate(() => (window as FixtureWindow).graduatedFixture.db.close());
  await page.reload();
  await setup(page, context, false, false);
  const reloaded = await page.evaluate(async () => {
    const fixture = (window as FixtureWindow).graduatedFixture;
    const uid = 'graduate-student';
    fixture.now = Date.parse('2026-10-11T15:01:00Z');
    let planCalls = 0;
    let weaknessCalls = 0;
    const getStore = fixture.context.getStore;
    fixture.context.getLearningPlan = async () => { planCalls += 1; throw new Error('Injected mutable planning failure'); };
    fixture.context.getStore = async (name, mode) => {
      if (name === fixture.support.STORES.WEAKNESS_SIGNALS) { weaknessCalls += 1; throw new Error('Injected weakness projection failure'); }
      return getStore(name, mode);
    };
    const before = await fixture.snapshot();
    const replay = await fixture.learning.getDailySessionWords(fixture.context, uid, 10, undefined, 'frozen-plan');
    const changedIntent = { mode: 'study', intentType: 'TODAY_FOCUS', label: 'Changed explicit preference', selectionPolicy: 'DUE_FIRST',
      limit: 10, preferredBookIds: ['book-b'] } as import('../../types').LearningTaskIntent;
    const conflict = await fixture.learning.getDailySessionWords(fixture.context, uid, 10, changedIntent, 'frozen-plan').then(() => false, (error) => error.status === 409);
    const after = await fixture.snapshot();
    const graduate = replay.find((word) => word.longTermReview)!;
    const historyTx = fixture.db.transaction(fixture.support.STORES.HISTORY, 'readwrite');
    const historyDone = fixture.support.waitForTransaction(historyTx);
    const store = historyTx.objectStore(fixture.support.STORES.HISTORY);
    const request = store.get(`${uid}_${graduate.id}`);
    request.onsuccess = () => { const record = request.result; record.data.nextReviewDate = fixture.now + 100_000; store.put(record); };
    await historyDone;
    const afterDateChange = await fixture.learning.getDailySessionWords(fixture.context, uid, 10, undefined, 'frozen-plan');
    const bookTx = fixture.db.transaction(fixture.support.STORES.BOOKS, 'readwrite');
    const bookDone = fixture.support.waitForTransaction(bookTx);
    bookTx.objectStore(fixture.support.STORES.BOOKS).put({ id: 'book-a', title: 'Now another owner', wordCount: 115,
      catalogSource: 'USER_GENERATED', description: JSON.stringify({ createdBy: 'other-user' }) });
    await bookDone;
    const afterRevocation = await fixture.learning.getDailySessionWords(fixture.context, uid, 10, undefined, 'frozen-plan');
    return { replayIds: replay.map((word) => word.id), conflict, planCalls, weaknessCalls,
      unchanged: JSON.stringify(before) === JSON.stringify(after), removedFutureId: graduate.id, afterDateIds: afterDateChange.map((word) => word.id),
      afterRevocationIds: afterRevocation.map((word) => word.id), starts: after.session.filter((record: any) => record.key.startsWith('long-term-review-start:')),
      days: after.session.filter((record: any) => record.key.startsWith('long-term-review-day:')) };
  });
  expect(reloaded.replayIds).toEqual(original.first.map((word) => word.id));
  expect(reloaded).toMatchObject({ conflict: true, planCalls: 0, weaknessCalls: 0, unchanged: true, afterRevocationIds: [] });
  expect(reloaded.afterDateIds).toHaveLength(9);
  expect(reloaded.afterDateIds).not.toContain(reloaded.removedFutureId);
  expect(reloaded.starts).toHaveLength(2);
  expect((reloaded.starts.find((record: any) => record.clientSessionId === 'frozen-plan') as any).dayKey).toBe('2026-10-11');
  expect(reloaded.days).toHaveLength(2);
});

test('native IDB racing identical daily start IDs return one committed scope even when callers read different mutable plans', async ({ page, context }) => {
  const other = await setup(page, context, true);
  const waiting: import('@playwright/test').Route[] = [];
  await context.route('https://graduated-idb.test/plan-race*', async (route) => {
    waiting.push(route);
    if (waiting.length === 2) await Promise.all(waiting.map((request) => request.fulfill({ contentType: 'application/json', body: '{}' })));
  });
  const start = (target: Page, bookId: string) => target.evaluate(async (selectedBookId) => {
    const fixture = (window as FixtureWindow).graduatedFixture;
    fixture.context.getLearningPlan = async () => {
      await fetch(`https://graduated-idb.test/plan-race?book=${selectedBookId}`);
      return { selectedBookIds: [selectedBookId] } as import('../../types').LearningPlan;
    };
    return (await fixture.learning.getDailySessionWords(fixture.context, 'graduate-student', 10, undefined, 'same-plan-race'))
      .map((word) => ({ id: word.id, bookId: word.bookId, long: !!word.longTermReview }));
  }, bookId);
  const [first, second] = await Promise.all([start(page, 'book-a'), start(other!, 'book-b')]);
  expect(waiting).toHaveLength(2);
  expect(first).toHaveLength(10);
  expect(second).toEqual(first);
  expect(new Set(first.map((word) => word.bookId)).size).toBe(1);
  expect(first.filter((word) => word.long)).toHaveLength(2);
  const records = await page.evaluate(async () => (await (window as FixtureWindow).graduatedFixture.snapshot()).session);
  const starts = records.filter((record: any) => record.key.startsWith('long-term-review-start:'));
  const day = records.find((record: any) => record.key.startsWith('long-term-review-day:')) as any;
  expect(starts).toHaveLength(1);
  expect(day).toMatchObject({ startOrdinal: 1 });
  expect(day.allocatedWordIds).toHaveLength(2);
  await other!.close();
});
