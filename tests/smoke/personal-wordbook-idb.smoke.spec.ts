import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect, test } from './diagnostics';
import { exposeStudentDemo, openDashboardReference } from './smoke-support';
import { SubscriptionPlan } from '../../types';
import { DB_NAME, DB_VERSION, STORES } from '../../services/storage/idb-support';
import type { CatalogImportRequest } from '../../contracts/storage';

type CapturedDraft = { key: string; value: string };
type CaptureWindow = typeof window & { capturedPersonalDraft?: CapturedDraft };
const dashboard = async (page: Page) => {
  await expect(page.getByTestId('student-dashboard')).toBeVisible();
};
const login = async (page: Page) => {
  await page.goto('/'); await exposeStudentDemo(page);
  await page.getByTestId('demo-login-student').click(); await dashboard(page);
  // The normal IDB student demo is free. Promote only this synthetic session
  // to the existing personal plan; keep its UID and all saved data unchanged.
  const sessionUid = await page.evaluate(({ name, store, plan }) => new Promise<string>((resolve, reject) => {
    const open = indexedDB.open(name); open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result; const tx = db.transaction(store, 'readwrite');
      const sessions = tx.objectStore(store); const current = sessions.get('current');
      let uid = '';
      current.onsuccess = () => {
        if (!current.result?.user?.uid) { tx.abort(); return; }
        uid = current.result.user.uid;
        sessions.put({ ...current.result, user: { ...current.result.user, subscriptionPlan: plan } });
      };
      tx.oncomplete = () => { db.close(); resolve(uid); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Synthetic demo session was not ready.')); };
    };
  }), { name: DB_NAME, store: STORES.SESSION, plan: SubscriptionPlan.TOC_PAID });
  expect(sessionUid).not.toBe('');
  await page.reload(); await dashboard(page);
};
const openCreate = async (page: Page) => {
  await openDashboardReference(page, 'library');
  const first = page.getByTestId('library-create-first-personal-book');
  if (await first.isVisible()) await first.click();
  else await page.getByTestId('dashboard-library-section').getByRole('button', { name: /^(作成|新規作成)$/ }).click();
  const modal = page.getByRole('dialog', { name: 'My単語帳 作成', exact: true });
  await expect(modal).toBeVisible(); return modal;
};
const restore = async (page: Page, captured: CapturedDraft) => {
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), captured);
  await page.goto('/'); await dashboard(page);
  const modal = await openCreate(page);
  await expect(modal.getByTestId('phrasebook-create-submit')).toHaveText('保存を再確認');
  return modal;
};
// Resolve only at native transaction completion, never just get request success.
const records = async (page: Page) => page.evaluate(({ name, stores }) => new Promise<{
  version: number; books: any[]; words: any[]; receipts: any[]; history: any[];
}>((resolve, reject) => {
  const open = indexedDB.open(name); open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const db = open.result;
    const tx = db.transaction([stores.BOOKS, stores.WORDS, stores.PERSONAL_CATALOG_IMPORT_RECEIPTS, stores.HISTORY]);
    const books = tx.objectStore(stores.BOOKS).getAll(); const words = tx.objectStore(stores.WORDS).getAll();
    const receipts = tx.objectStore(stores.PERSONAL_CATALOG_IMPORT_RECEIPTS).getAll();
    const history = tx.objectStore(stores.HISTORY).getAll();
    tx.oncomplete = () => { const result = { version: db.version, books: books.result, words: words.result, receipts: receipts.result, history: history.result }; db.close(); resolve(result); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
  };
}), { name: DB_NAME, stores: STORES });

test('native personal import v8 to v9 upgrade preserves unrelated saved history', async ({ page }) => {
  const assetPattern = '**/assets/index-*.js';
  const blockRootModule = (route: import('@playwright/test').Route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
  await page.route(assetPattern, blockRootModule, { times: 1 });
  await page.goto('/');
  const sentinel = { id: 'unrelated-synthetic-owner_prior-word', data: { wordId: 'prior-word', bookId: 'prior-book', attemptCount: 4, lastReviewedAt: 1700000000000 } };
  await page.evaluate(({ name, stores, sentinel }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name, 8); request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore(stores.BOOKS, { keyPath: 'id' });
      db.createObjectStore(stores.WORDS, { keyPath: 'id' }).createIndex('bookId', 'bookId', { unique: false });
      db.createObjectStore(stores.HISTORY, { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result; const tx = db.transaction(stores.HISTORY, 'readwrite');
      tx.objectStore(stores.HISTORY).add(sentinel);
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }), { name: DB_NAME, stores: STORES, sentinel });
  await page.unroute(assetPattern, blockRootModule);
  await login(page);
  const upgraded = await page.evaluate(({ name, stores, id }) => new Promise((resolve, reject) => {
    const request = indexedDB.open(name); request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result; const tx = db.transaction(stores.HISTORY); const history = tx.objectStore(stores.HISTORY).get(id);
      tx.oncomplete = () => { const result = { version: db.version, hasReceipts: db.objectStoreNames.contains(stores.PERSONAL_CATALOG_IMPORT_RECEIPTS), history: history.result }; db.close(); resolve(result); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }), { name: DB_NAME, stores: STORES, id: sentinel.id });
  expect(DB_VERSION).toBe(9);
  expect(upgraded).toEqual({ version: 9, hasReceipts: true, history: sentinel });
});

test('native personal receipt replays concurrently across two tabs and cannot resurrect a deleted book', async ({ page, context }, info) => {
  const apiWrites: string[] = [];
  context.on('request', request => { if (request.url().includes('/api/') && !['GET', 'HEAD'].includes(request.method())) apiWrites.push(request.url()); });
  await login(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith('steady-study:personal-wordbook-draft:')) {
        const draft = JSON.parse(value);
        if (draft.pendingRequest) (window as CaptureWindow).capturedPersonalDraft = { key, value };
      }
      return original.call(this, key, value);
    };
  });
  const modal = await openCreate(page);
  await modal.getByLabel('単語', { exact: true }).fill('native-receipt-word');
  await modal.getByRole('textbox', { name: '意味', exact: true }).fill('実IDBの合成保存');
  await modal.getByTestId('phrasebook-create-submit').click();
  await expect(modal.getByTestId('personal-wordbook-confirmation')).toBeVisible();
  await modal.getByTestId('phrasebook-create-submit').click();
  await expect(modal.getByTestId('personal-wordbook-saved')).toContainText('1語を保存しました');
  const captured = await page.evaluate(() => (window as CaptureWindow).capturedPersonalDraft);
  expect(captured).toBeDefined();
  if (!captured) throw new Error('The actual pre-send immutable draft was not captured.');
  const pendingRequest: CatalogImportRequest = JSON.parse(captured.value).pendingRequest;
  const first = await records(page);
  const receipt = first.receipts.find(row => row.uid === pendingRequest.createdByUid && row.clientImportId === pendingRequest.clientImportId);
  expect(receipt).toBeDefined();
  const bookId = receipt.bookId as string;
  const wordIds = first.words.filter(row => row.bookId === bookId).map(row => row.id);
  expect(wordIds).toHaveLength(1); expect(receipt.result.importedBookIds).toEqual([bookId]);
  const secondPage = await context.newPage();
  await secondPage.goto('/'); await dashboard(secondPage);
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), captured);
  const [a, b] = await Promise.all([restore(page, captured), restore(secondPage, captured)]);
  await Promise.all([a.getByTestId('phrasebook-create-submit').click(), b.getByTestId('phrasebook-create-submit').click()]);
  await Promise.all([expect(a.getByTestId('personal-wordbook-saved')).toBeVisible(), expect(b.getByTestId('personal-wordbook-saved')).toBeVisible()]);
  const after = await records(page);
  expect(after.books.filter(row => row.id === bookId)).toHaveLength(1);
  expect(after.words.filter(row => row.bookId === bookId).map(row => row.id)).toEqual(wordIds);
  expect(after.receipts.filter(row => row.uid === pendingRequest.createdByUid && row.clientImportId === pendingRequest.clientImportId)).toEqual([receipt]);
  await a.getByTestId('personal-wordbook-start-study').click();
  await expect(page.getByTestId('study-card-front')).toContainText('native-receipt-word');
  await secondPage.close();
  await page.evaluate(({ name, stores, bookId, wordIds }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name); request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result; const tx = db.transaction([stores.BOOKS, stores.WORDS], 'readwrite');
      tx.objectStore(stores.BOOKS).delete(bookId); wordIds.forEach(id => tx.objectStore(stores.WORDS).delete(id));
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }), { name: DB_NAME, stores: STORES, bookId, wordIds });
  const deletedModal = await restore(page, captured);
  await deletedModal.getByTestId('phrasebook-create-submit').click();
  await expect(deletedModal.getByRole('alert')).toContainText('削除済み');
  await expect(deletedModal.getByTestId('personal-wordbook-saved')).toHaveCount(0);
  await expect(deletedModal.getByLabel('単語', { exact: true })).toBeEditable();
  const deleted = await records(page);
  expect(deleted.books.filter(row => row.id === bookId)).toHaveLength(0);
  expect(deleted.words.filter(row => row.bookId === bookId)).toHaveLength(0);
  expect(deleted.receipts.filter(row => row.uid === pendingRequest.createdByUid && row.clientImportId === pendingRequest.clientImportId)).toEqual([receipt]);
  // Existing study telemetry may POST to this local endpoint. Every other API
  // mutation, including catalog/storage and AI, must remain absent in IDB mode.
  const nonTelemetryApiWrites = apiWrites.filter(url => new URL(url).pathname !== '/api/public/product-events');
  expect(nonTelemetryApiWrites).toEqual([]);
  await info.attach('native-personal-receipt-acceptance', { body: JSON.stringify({ bookId, wordIds, replayedReceiptCount: 1, deletedReplayRefused: true, nonTelemetryApiWrites, localTelemetryRequestCount: apiWrites.length }), contentType: 'application/json' });
});

test('native personal import aborts all 201 writes on a late ID collision and recovers the same request', async ({ page }, info) => {
  await login(page);
  const editing = await openCreate(page);
  await editing.getByLabel('単語', { exact: true }).fill('initialize-synthetic-draft');
  await editing.getByRole('textbox', { name: '意味', exact: true }).fill('下書き準備');
  const draftData = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(key => key.startsWith('steady-study:personal-wordbook-draft:'));
    if (!key) throw new Error('The actual account-scoped draft was not initialized.');
    return { key, draft: JSON.parse(localStorage.getItem(key)!) };
  });
  const uid = draftData.draft.ownerUid as string;
  const clientImportId = 'native-atomic-recovery-201-0001';
  const title = 'Synthetic native 201-word rollback';
  const request: CatalogImportRequest = {
    clientImportId, createdByUid: uid, defaultBookName: title,
    source: { kind: 'rows', rows: Array.from({ length: 201 }, (_, index) => ({
      word: `native_atomic_${index + 1}`, definition: `合成意味${index + 1}`, number: index + 1,
    })) },
  };
  const bookId = `personal-${createHash('sha256').update(`${uid}:${clientImportId}`).digest('hex')}`;
  const collision = { id: `${bookId}_201_200`, bookId: 'synthetic-unrelated-collision-book', number: 999, word: 'preexisting-collision', definition: '保存済みの合成値', searchKey: 'preexisting-collision' };
  const sentinel = { id: 'unrelated-synthetic-owner_atomic-history', data: { wordId: 'unrelated-prior-word', bookId: 'unrelated-prior-book', attemptCount: 7 } };
  await page.evaluate(({ name, stores, collision, sentinel }) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open(name); open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result; const tx = db.transaction([stores.WORDS, stores.HISTORY], 'readwrite');
      tx.objectStore(stores.WORDS).add(collision); tx.objectStore(stores.HISTORY).add(sentinel);
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }), { name: DB_NAME, stores: STORES, collision, sentinel });
  if (request.source.kind !== 'rows') throw new Error('Rows required.');
  const captured = { key: draftData.key, value: JSON.stringify({ ...draftData.draft, title, updatedAt: Date.now(),
    rows: request.source.rows.map((row, index) => ({ ...row, draftId: `synthetic-row-${index + 1}` })), pendingRequest: request }) };
  const before = await records(page);
  const modal = await restore(page, captured);
  await modal.getByTestId('phrasebook-create-submit').click();
  await expect(modal.getByRole('alert')).toBeVisible();
  await expect(modal.getByTestId('personal-wordbook-saved')).toHaveCount(0);
  await expect(modal.getByTestId('phrasebook-create-submit')).toHaveText('保存を再確認');
  const afterAbort = await records(page);
  expect(afterAbort.books).toEqual(before.books);
  expect(afterAbort.words).toEqual(before.words);
  expect(afterAbort.receipts).toEqual(before.receipts);
  expect(afterAbort.history).toEqual(before.history);
  expect(afterAbort.books.filter(row => row.id === bookId)).toHaveLength(0);
  expect(afterAbort.words.filter(row => row.bookId === bookId)).toHaveLength(0);
  expect(afterAbort.words.find(row => row.id === collision.id)).toEqual(collision);
  expect(afterAbort.history.find(row => row.id === sentinel.id)).toEqual(sentinel);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).pendingRequest, captured.key)).toEqual(request);
  await page.evaluate(({ name, stores, id }) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open(name); open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result; const tx = db.transaction(stores.WORDS, 'readwrite'); tx.objectStore(stores.WORDS).delete(id);
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }), { name: DB_NAME, stores: STORES, id: collision.id });
  await modal.getByTestId('phrasebook-create-submit').click();
  await expect(modal.getByTestId('personal-wordbook-saved')).toContainText('201語を保存しました');
  const recovered = await records(page);
  expect(recovered.books.filter(row => row.id === bookId)).toHaveLength(1);
  const imported = recovered.words.filter(row => row.bookId === bookId);
  expect(imported).toHaveLength(201);
  expect(new Set(imported.map(row => row.id)).size).toBe(201);
  expect(imported.some(row => row.id === collision.id && row.word === 'native_atomic_201')).toBe(true);
  const receipts = recovered.receipts.filter(row => row.uid === uid && row.clientImportId === clientImportId);
  expect(receipts).toHaveLength(1);
  expect(receipts[0].result).toMatchObject({ importedBookIds: [bookId], importedWordCount: 201 });
  expect(recovered.history).toEqual(before.history);
  await info.attach('native-personal-atomic-recovery', { body: JSON.stringify({ clientImportId, bookId, abortedNewWords: 0, recoveredWords: imported.length, receiptCount: receipts.length, priorHistoryPreserved: true }), contentType: 'application/json' });
});
