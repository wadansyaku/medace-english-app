import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { build } from 'vite';

import { expect, test } from './diagnostics';

import { DB_NAME, DB_VERSION, STORES } from '../../services/storage/idb-support';
import { loginGroupAdminDemo } from './smoke-support';

type UpgradeTestWindow = typeof window & {
  legacyDb: IDBDatabase;
  upgradedDb: IDBDatabase;
  futureDb: IDBDatabase;
  storageModule: typeof import('../../services/storage/idb-support');
};

test('idb upgrade recovers from an old tab without losing saved history or leaking connections', async ({ page, context }) => {
  // Run the current storage module against native IndexedDB in an isolated
  // origin, independent of the application's storage mode and API fixture.
  const source = readFileSync(new URL('../../services/storage/idb-support.ts', import.meta.url), 'utf8');
  const moduleCode = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText;
  await context.route('https://idb-upgrade.test/**', (route) => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>IndexedDB upgrade verification</title>',
  }));
  const legacyPage = await context.newPage();
  await Promise.all([page.goto('https://idb-upgrade.test/new'), legacyPage.goto('https://idb-upgrade.test/old')]);

  const originalHistory = { id: 'upgrade-learner_word-1', data: { wordId: 'word-1', bookId: 'book-1', attemptCount: 4 } };
  await legacyPage.evaluate(({ name, version, stores, history }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name, version - 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore(stores.BOOKS, { keyPath: 'id' });
      db.createObjectStore(stores.WORDS, { keyPath: 'id' }).createIndex('bookId', 'bookId');
      db.createObjectStore(stores.HISTORY, { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      (window as UpgradeTestWindow).legacyDb = db;
      // This models the already-shipped v6 tab, which has no close handler.
      const tx = db.transaction([stores.BOOKS, stores.WORDS, stores.HISTORY], 'readwrite');
      tx.objectStore(stores.BOOKS).put({ id: 'book-1', title: 'Upgrade fixture' });
      tx.objectStore(stores.WORDS).put({ id: 'word-1', bookId: 'book-1' });
      tx.objectStore(stores.HISTORY).put(history);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    };
  }), { name: DB_NAME, version: DB_VERSION, stores: STORES, history: originalHistory });

  await page.evaluate(async (code) => {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    try { (window as UpgradeTestWindow).storageModule = await import(url); } finally { URL.revokeObjectURL(url); }
  }, moduleCode);
  const blockedMessage = await page.evaluate(async () => {
    try {
      await (window as UpgradeTestWindow).storageModule.initStorageDb();
      return 'unexpected success';
    } catch (error) { return error instanceof Error ? error.message : String(error); }
  });
  expect(blockedMessage).toContain('ほかの Steady Study タブやウィンドウを閉じて');

  await legacyPage.evaluate(() => (window as UpgradeTestWindow).legacyDb.close());
  const restored = await page.evaluate(async (historyId) => {
    const state = window as UpgradeTestWindow;
    state.upgradedDb = await state.storageModule.initStorageDb();
    const history = await state.storageModule.requestToPromise(
      state.upgradedDb.transaction(state.storageModule.STORES.HISTORY).objectStore(state.storageModule.STORES.HISTORY).get(historyId),
    );
    return { history, version: state.upgradedDb.version, hasReceipts: state.upgradedDb.objectStoreNames.contains(state.storageModule.STORES.STUDY_ATTEMPT_RECEIPTS) };
  }, originalHistory.id);
  expect(restored).toEqual({ history: originalHistory, version: DB_VERSION, hasReceipts: true });

  // A later upgrade proves both that the abandoned open was closed and that
  // the successfully opened v7 connection releases itself on versionchange.
  const futureVersion = await legacyPage.evaluate(({ name, version }) => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open(name, version + 1);
    request.onblocked = () => reject(new Error('A connection leaked and blocked the next upgrade.'));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      (window as UpgradeTestWindow).futureDb = request.result;
      resolve(request.result.version);
    };
  }), { name: DB_NAME, version: DB_VERSION });
  expect(futureVersion).toBe(DB_VERSION + 1);
  expect(await page.evaluate(async () => {
    const state = window as UpgradeTestWindow;
    try {
      await state.storageModule.getObjectStore(Promise.resolve(state.upgradedDb), state.storageModule.STORES.HISTORY);
      return 'unexpected readable connection';
    } catch (error) { return error instanceof DOMException ? error.name : String(error); }
  })).toBe('InvalidStateError');
  await legacyPage.evaluate(() => (window as UpgradeTestWindow).futureDb.close());
  await legacyPage.close();
});

test('native idb preserves concurrent answers and rolls back an interrupted receipt with its history and event', async ({ page, context }) => {
  const storageCode = ts.transpileModule(readFileSync(new URL('../../services/storage/idb-support.ts', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText;
  // Bundle the actual storage functions in memory; no app build or fixture
  // implementation replaces native transaction scheduling in this regression.
  const bundled = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: { entry: fileURLToPath(new URL('../../services/storage/learning-history.ts', import.meta.url)), formats: ['es'] },
    },
  });
  const outputs = Array.isArray(bundled) ? bundled : [bundled];
  const entry = outputs.flatMap((output) => 'output' in output ? output.output : []).find((output) => output.type === 'chunk' && output.isEntry);
  if (!entry || entry.type !== 'chunk' || entry.imports.length || entry.dynamicImports.length) throw new Error('Native IDB fixture requires a self-contained storage module.');
  await context.route('https://idb-atomic.test/**', (route) => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>IndexedDB atomic save verification</title>',
  }));
  await page.goto('https://idb-atomic.test/');

  const result = await page.evaluate(async ({ storageCode: supportCode, historyCode }) => {
    const importCode = async (code: string) => {
      const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      try { return await import(url); } finally { URL.revokeObjectURL(url); }
    };
    const support: typeof import('../../services/storage/idb-support') = await importCode(supportCode);
    const learning: typeof import('../../services/storage/learning-history') = await importCode(historyCode);
    const db = await support.initStorageDb();
    const uid = 'native-idb-learner';
    const word = { id: 'native-word', bookId: 'native-book', word: 'learn', definition: '学ぶ', number: 1, searchKey: 'learn' };
    const storage: import('../../services/storage/learning-history').LearningHistoryContext = {
      getDb: async () => db,
      getStore: (name, mode) => support.getObjectStore(Promise.resolve(db), name, mode),
      getBooks: async () => [],
      getSession: async () => null,
      getWordsByBook: async () => [word],
    };
    const save = (attempt: string, rating = 3) => learning.saveSrsHistory(storage, uid, word, rating, 100, undefined, undefined, attempt);
    const snapshot = async () => {
      const tx = db.transaction([support.STORES.HISTORY, support.STORES.INTERACTION_EVENTS, support.STORES.STUDY_ATTEMPT_RECEIPTS, support.STORES.WEAKNESS_SIGNALS]);
      const complete = support.waitForTransaction(tx);
      const [histories, events, receipts, signals] = await Promise.all([
        support.requestToPromise(tx.objectStore(support.STORES.HISTORY).getAll()) as Promise<import('../../services/storage/idb-support').StoredLearningHistoryRecord[]>,
        support.requestToPromise(tx.objectStore(support.STORES.INTERACTION_EVENTS).count()),
        support.requestToPromise(tx.objectStore(support.STORES.STUDY_ATTEMPT_RECEIPTS).count()),
        support.requestToPromise(tx.objectStore(support.STORES.WEAKNESS_SIGNALS).count()),
      ]);
      await complete;
      return { attempts: histories.find((record) => record.data.wordId === word.id)?.data.attemptCount, events, receipts, signals };
    };
    try {
      await Promise.all([save('same-attempt'), save('same-attempt')]);
      const duplicate = await snapshot();
      await Promise.all([save('distinct-a'), save('distinct-b')]);
      const concurrent = await snapshot();
      const conflictingPayloadRejected = await save('same-attempt', 0).then(() => false, () => true);
      const afterConflict = await snapshot();

      const originalAdd = IDBObjectStore.prototype.add;
      let interrupted = false;
      IDBObjectStore.prototype.add = function (value, key) {
        if (this.name === support.STORES.STUDY_ATTEMPT_RECEIPTS && value.clientAttemptId === 'interrupted-attempt') {
          throw new DOMException('Injected receipt write failure', 'QuotaExceededError');
        }
        return originalAdd.call(this, value, key);
      };
      try { interrupted = await save('interrupted-attempt').then(() => false, () => true); }
      finally { IDBObjectStore.prototype.add = originalAdd; }
      const afterRollback = await snapshot();
      await save('interrupted-attempt');
      const afterRetry = await snapshot();

      // Catalog lookup yields a task boundary, so a transaction opened before
      // that lookup would be inactive by the time the quiz event is queued.
      await learning.recordQuizAttempt({ ...storage, getBooks: () => new Promise((resolve) => setTimeout(() => resolve([]), 30)) }, uid, 'native-quiz-word', word.bookId, true, 'EN_TO_JA', 100);
      const quizHistory = await support.requestToPromise(db.transaction(support.STORES.HISTORY).objectStore(support.STORES.HISTORY).get(`${uid}_native-quiz-word`));
      return { duplicate, concurrent, conflictingPayloadRejected, afterConflict, interrupted, afterRollback, afterRetry, afterQuiz: await snapshot(), quizHistory: quizHistory?.data };
    } finally { db.close(); }
  }, { storageCode, historyCode: entry.code });

  expect(result.duplicate).toMatchObject({ attempts: 1, events: 1, receipts: 1 });
  expect(result.concurrent).toMatchObject({ attempts: 3, events: 3, receipts: 3 });
  expect(result.conflictingPayloadRejected).toBe(true);
  expect(result.afterConflict).toEqual(result.concurrent);
  expect(result.interrupted).toBe(true);
  expect(result.afterRollback).toEqual(result.concurrent);
  expect(result.afterRetry).toMatchObject({ attempts: 4, events: 4, receipts: 4 });
  expect(result.afterQuiz).toMatchObject({ attempts: 4, events: 5, receipts: 4 });
  expect(result.afterQuiz.signals).toBeGreaterThan(0);
  expect(result.quizHistory).toMatchObject({ attemptCount: 1, interactionSource: 'QUIZ' });
});

test('idb mode blocks B2B workspace clients instead of serving mock success', async ({ page }) => {
  await loginGroupAdminDemo(page);

  await expect(page.getByText('組織ダッシュボードとミッション機能は Cloudflare storage mode でのみ利用できます。')).toBeVisible();
  await expect(page.getByTestId('business-admin-dashboard')).toHaveCount(0);
  await expect(page.getByTestId('organization-kpi-trend-section')).toHaveCount(0);
});
