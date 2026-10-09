import { PersonalCatalogImportError, preparePersonalCatalogImport } from '../../shared/personalCatalogImport';
import {
  BookAccessScope,
  BookCatalogSource,
  GeneratedAssetAuditStatus,
  type BookMetadata,
  type UserProfile,
  type WordData,
} from '../../types';
import type {
  CatalogImportRequest,
  CatalogImportResult,
  GenerateWordHintAssetPayload,
  PrepareBookExamplesResult,
} from '../../contracts/storage';
import { projectWordHintAssetsForLearner } from '../../shared/wordHintAssets';
import { canAccessOfficialBook, normalizeBookVisibilityPolicy } from '../../utils/bookAccess';
import { catalogRowsAreEquivalent, createImportedBookId, normalizeCatalogImportRows } from './catalog-import';
import { STORES, type GetStore, waitForTransaction } from './idb-support';
import { isBookOwnedByUser } from './mockData';

export interface LocalCatalogStorageContext {
  getDb: () => Promise<IDBDatabase>;
  getStore: GetStore;
  getSession: () => Promise<UserProfile | null>;
}

const toIndexedDbError = (error: unknown, fallbackMessage: string): Error => {
  if (error instanceof Error) return error;
  return new Error(fallbackMessage);
};

const mutateWordAndWaitForTransaction = async (
  store: IDBObjectStore,
  wordId: string,
  mutate: (word: WordData) => WordData | undefined,
  fallbackMessage: string,
): Promise<void> => {
  const transactionComplete = waitForTransaction(store.transaction);
  const mutationQueued = new Promise<void>((resolve, reject) => {
    const request = store.get(wordId);
    request.onsuccess = () => {
      try {
        const word = request.result as WordData | undefined;
        if (word) {
          const putRequest = store.put(mutate(word) || word);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(toIndexedDbError(putRequest.error, fallbackMessage));
          return;
        }
        resolve();
      } catch (error) {
        reject(toIndexedDbError(error, fallbackMessage));
      }
    };
    request.onerror = () => reject(toIndexedDbError(request.error, fallbackMessage));
  });

  await Promise.all([mutationQueued, transactionComplete]);
};

export const normalizeLocalCatalogBook = (
  book: BookMetadata,
  userUid: string | undefined,
): BookMetadata => {
  const normalizedBook = normalizeBookVisibilityPolicy(book);
  if (!isBookOwnedByUser(normalizedBook, userUid)) {
    return normalizedBook;
  }

  return {
    ...normalizedBook,
    catalogSource: BookCatalogSource.USER_GENERATED,
    accessScope: BookAccessScope.ALL_PLANS,
  };
};

interface PersonalCatalogImportReceipt {
  uid: string;
  clientImportId: string;
  fingerprint: string;
  bookId: string;
  result: CatalogImportResult;
  committedAt: number;
}

const importPersonalCatalogLocal = async (
  context: LocalCatalogStorageContext,
  request: CatalogImportRequest,
  onProgress?: (progress: number) => void,
): Promise<CatalogImportResult> => {
  const session = await context.getSession();
  if (!session?.uid) throw new PersonalCatalogImportError(403, '個人単語帳の保存にはログインが必要です。');
  // Hashing and normalization finish before opening a native transaction.
  const prepared = await preparePersonalCatalogImport(request, session.uid);
  const { clientImportId, fingerprint, bookId, title, words, result } = prepared;
  onProgress?.(5);
  const db = await context.getDb();
  const tx = db.transaction([STORES.BOOKS, STORES.WORDS, STORES.PERSONAL_CATALOG_IMPORT_RECEIPTS], 'readwrite');
  const complete = waitForTransaction(tx);
  let confirmed: CatalogImportResult | undefined;
  const queued = new Promise<void>((resolve, reject) => {
    const fail = (error: unknown) => {
      try { tx.abort(); } catch { /* An error event may already have aborted the transaction. */ }
      reject(error);
    };
    const receiptStore = tx.objectStore(STORES.PERSONAL_CATALOG_IMPORT_RECEIPTS);
    const lookup = receiptStore.get([session.uid, clientImportId]);
    lookup.onerror = () => fail(lookup.error || new Error('作成結果を確認できませんでした。'));
    lookup.onsuccess = () => {
      try {
        const receipt = lookup.result as PersonalCatalogImportReceipt | undefined;
        if (receipt) {
          if (receipt.fingerprint !== fingerprint) throw new PersonalCatalogImportError(409, 'この作成IDは別の内容で使用済みです。同じ内容で再送してください。');
          const bookLookup = tx.objectStore(STORES.BOOKS).get(receipt.bookId);
          bookLookup.onerror = () => fail(bookLookup.error || new Error('保存した単語帳を確認できませんでした。'));
          bookLookup.onsuccess = () => {
            if (!bookLookup.result || !isBookOwnedByUser(bookLookup.result as BookMetadata, session.uid)) {
              fail(new PersonalCatalogImportError(409, '保存した単語帳は削除済み、または所有者を確認できません。新しく作成してください。'));
              return;
            }
            confirmed = structuredClone(receipt.result);
            resolve();
          };
          return;
        }
        const meta: BookMetadata = {
          id: bookId, title, wordCount: words.length, isPriority: false,
          description: JSON.stringify({ createdBy: session.uid, type: 'USER_GENERATED' }),
          sourceContext: request.contextSummary,
          catalogSource: BookCatalogSource.USER_GENERATED, accessScope: BookAccessScope.ALL_PLANS,
        };
        tx.objectStore(STORES.BOOKS).add(meta);
        const wordStore = tx.objectStore(STORES.WORDS);
        words.forEach(word => wordStore.add(word));
        receiptStore.add({ uid: session.uid, clientImportId, fingerprint, bookId, result, committedAt: Date.now() } satisfies PersonalCatalogImportReceipt);
        confirmed = result;
        resolve();
      } catch (error) { fail(error); }
    };
  });
  await Promise.all([queued, complete]);
  if (!confirmed) throw new Error('単語帳の保存完了を確認できませんでした。');
  onProgress?.(100);
  return confirmed;
};

export const batchImportWordsLocal = async (
  context: LocalCatalogStorageContext,
  request: CatalogImportRequest,
  onProgress?: (progress: number) => void,
): Promise<CatalogImportResult> => {
  if (request.clientImportId !== undefined) return importPersonalCatalogLocal(context, request, onProgress);
  const db = await context.getDb();
  const bookGroups = new Map<string, { meta: BookMetadata; words: WordData[] }>();
  const { rows, warnings } = normalizeCatalogImportRows(request);
  const total = rows.length;
  const issues = [...warnings];
  let skippedRowCount = 0;

  onProgress?.(5);

  for (let index = 0; index < total; index += 1) {
    const row = rows[index];
    const bookName = (row.bookName || request.defaultBookName || 'Imported').trim();
    const groupKey = `${request.createdByUid || 'official'}:${bookName}`;
    const word = row.word.trim();
    const definition = row.definition.trim();
    const parsedNumber = Number.parseInt(String(row.number || index + 1), 10);
    const number = Number.isFinite(parsedNumber) && parsedNumber > 0 ? parsedNumber : index + 1;

    if (!word) {
      skippedRowCount += 1;
      issues.push({ code: 'EMPTY_WORD', message: '単語が空の行をスキップしました。', rowNumber: index + 2 });
      continue;
    }
    if (!definition) {
      skippedRowCount += 1;
      issues.push({ code: 'EMPTY_DEFINITION', message: '訳が空の行をスキップしました。', rowNumber: index + 2 });
      continue;
    }

    if (!bookGroups.has(groupKey)) {
      const bookId = createImportedBookId(
        bookName,
        request.createdByUid,
        request.createdByUid ? String(Date.now()) : undefined,
      );
      const description = request.createdByUid
        ? JSON.stringify({ createdBy: request.createdByUid, type: 'USER_GENERATED' })
        : (request.bookDescription || 'Imported');

      bookGroups.set(groupKey, {
        meta: {
          id: bookId,
          title: bookName,
          wordCount: 0,
          isPriority: !request.createdByUid && bookName.includes('DUO'),
          description,
          sourceContext: request.contextSummary,
          catalogSource: request.createdByUid
            ? BookCatalogSource.USER_GENERATED
            : (request.options?.catalogSource || BookCatalogSource.LICENSED_PARTNER),
          accessScope: request.createdByUid
            ? BookAccessScope.ALL_PLANS
            : (request.options?.accessScope || BookAccessScope.BUSINESS_ONLY),
        },
        words: [],
      });
    }

    const bookGroup = bookGroups.get(groupKey);
    if (!bookGroup) continue;

    const duplicate = bookGroup.words.some((candidate) => catalogRowsAreEquivalent(candidate, row));
    if (duplicate) {
      skippedRowCount += 1;
      issues.push({ code: 'DUPLICATE_ROW', message: '重複行をスキップしました。', rowNumber: index + 2 });
      continue;
    }

    bookGroup.words.push({
      id: `${bookGroup.meta.id}_${number}_${index}`,
      bookId: bookGroup.meta.id,
      number,
      word,
      definition,
      searchKey: word.toLowerCase(),
      ...(row.partOfSpeech ? { partOfSpeech: row.partOfSpeech } : {}),
      ...(row.inflections ? { inflections: row.inflections } : {}),
      ...(row.pronunciation ? { pronunciation: row.pronunciation } : {}),
      ...(row.sourceNote ? { sourceNote: row.sourceNote } : {}),
      ...(row.category?.trim() ? { category: row.category.trim() } : {}),
      ...(row.subcategory?.trim() ? { subcategory: row.subcategory.trim() } : {}),
      ...(row.section?.trim() ? { section: row.section.trim() } : {}),
      ...(row.sourceSheet?.trim() ? { sourceSheet: row.sourceSheet.trim() } : {}),
      ...(Number.isFinite(Number.parseInt(String(row.sourceEntryId || '').trim(), 10))
        ? { sourceEntryId: Number.parseInt(String(row.sourceEntryId).trim(), 10) }
        : {}),
      ...(row.exampleSentence?.trim() ? { exampleSentence: row.exampleSentence.trim() } : {}),
      ...(row.exampleMeaning?.trim() ? { exampleMeaning: row.exampleMeaning.trim() } : {}),
    });

    if (index % 250 === 0) {
      onProgress?.(Math.round((index / Math.max(total, 1)) * 90));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const tx = db.transaction([STORES.BOOKS, STORES.WORDS], 'readwrite');
  const transactionComplete = waitForTransaction(tx);
  const importedBookIds: string[] = [];
  let importedWordCount = 0;

  for (const [, data] of bookGroups) {
    data.meta.wordCount = data.words.length;
    importedBookIds.push(data.meta.id);
    importedWordCount += data.words.length;
    tx.objectStore(STORES.BOOKS).put(data.meta);
    data.words.forEach((word) => tx.objectStore(STORES.WORDS).put(word));
  }

  await transactionComplete;
  onProgress?.(100);
  return {
    importedBookIds,
    importedBookCount: importedBookIds.length,
    importedWordCount,
    skippedRowCount,
    warnings: issues,
  };
};

export const getBooksLocal = async (context: LocalCatalogStorageContext): Promise<BookMetadata[]> => {
  const sessionUser = await context.getSession();
  const store = await context.getStore(STORES.BOOKS);
  return new Promise((resolve) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const books = ((request.result || []) as BookMetadata[])
        .map((book) => normalizeLocalCatalogBook(book, sessionUser?.uid));
      resolve(
        books.filter((book) =>
          isBookOwnedByUser(book, sessionUser?.uid) ||
          canAccessOfficialBook(sessionUser?.subscriptionPlan, book)
        ),
      );
    };
  });
};

export const deleteBookLocal = async (
  context: LocalCatalogStorageContext,
  bookId: string,
): Promise<void> => {
  const db = await context.getDb();
  const tx = db.transaction([STORES.BOOKS, STORES.WORDS, STORES.HISTORY], 'readwrite');
  const transactionComplete = waitForTransaction(tx);

  tx.objectStore(STORES.BOOKS).delete(bookId);
  const wordsStore = tx.objectStore(STORES.WORDS);
  const index = wordsStore.index('bookId');
  const wordRequest = index.getAllKeys(bookId);

  wordRequest.onsuccess = () => {
    const keys = wordRequest.result;
    keys.forEach((key) => wordsStore.delete(key));
  };
  await transactionComplete;
};

const readWordsByBookLocal = async (
  context: Pick<LocalCatalogStorageContext, 'getStore'>,
  bookId: string,
): Promise<WordData[]> => {
  const store = await context.getStore(STORES.WORDS);
  const index = store.index('bookId');
  return new Promise((resolve) => {
    const request = index.getAll(bookId);
    request.onsuccess = () => resolve((request.result || []).sort((left: WordData, right: WordData) => left.number - right.number));
  });
};

export const getWordsByBookLocal = async (
  context: Pick<LocalCatalogStorageContext, 'getStore'>,
  bookId: string,
): Promise<WordData[]> => (
  (await readWordsByBookLocal(context, bookId)).map((word) => projectWordHintAssetsForLearner(word))
);

export const updateWordLocal = async (
  context: Pick<LocalCatalogStorageContext, 'getStore'>,
  word: WordData,
): Promise<void> => {
  const store = await context.getStore(STORES.WORDS, 'readwrite');
  // The caller holds a learner projection. Preserve stored, hidden hints instead
  // of replacing their content with null values from that projection.
  await mutateWordAndWaitForTransaction(store, word.id, current => {
    const changed = current.word !== word.word || current.definition !== word.definition;
    return {
      ...current,
      word: word.word,
      definition: word.definition,
      ...(changed && (current.exampleGeneratedAt || current.exampleAuditStatus)
        ? { exampleAuditStatus: GeneratedAssetAuditStatus.REVIEW_REQUIRED }
        : {}),
      ...(changed && (current.exampleImageGeneratedAt || current.exampleImageAuditStatus)
        ? { exampleImageAuditStatus: GeneratedAssetAuditStatus.REVIEW_REQUIRED }
        : {}),
    };
  }, '単語の変更を保存できませんでした。');
};

export const reportWordLocal = async (
  context: Pick<LocalCatalogStorageContext, 'getStore'>,
  wordId: string,
  _reason: string,
): Promise<void> => {
  const store = await context.getStore(STORES.WORDS, 'readwrite');
  await mutateWordAndWaitForTransaction(
    store,
    wordId,
    (word) => ({
      ...word,
      isReported: true,
    }),
    '単語の報告状態の保存に失敗しました。',
  );
};

// Compatibility entry points fail before reading or changing learner storage.
export const generateWordHintAssetLocal = async (
  _context: Pick<LocalCatalogStorageContext, 'getStore'>,
  _payload: GenerateWordHintAssetPayload,
): Promise<WordData> => {
  throw new Error('学習中の例文・画像生成は廃止しました。保存済みの内容をご利用ください。');
};

export const prepareBookExamplesLocal = async (
  _context: Pick<LocalCatalogStorageContext, 'getStore'>,
  _bookId: string,
): Promise<PrepareBookExamplesResult> => {
  throw new Error('例文の事前準備はCloudflareの管理者画面で行ってください。端末内では生成しません。');
};
