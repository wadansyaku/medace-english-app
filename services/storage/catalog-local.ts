import {
  BookAccessScope,
  BookCatalogSource,
  GeneratedAssetAuditStatus,
  type BookMetadata,
  type UserProfile,
  type WordData,
  WordHintAssetType,
} from '../../types';
import type {
  CatalogImportRequest,
  CatalogImportResult,
  GenerateWordHintAssetPayload,
  PrepareBookExamplesResult,
} from '../../contracts/storage';
import { createLocalExampleHint, createWordImagePlaceholderDataUrl } from '../../shared/wordHintAssets';
import { canAccessOfficialBook, normalizeBookVisibilityPolicy } from '../../utils/bookAccess';
import { generateGeminiSentence, generateWordImage } from '../gemini';
import { createImportedBookId, normalizeCatalogImportRows } from './catalog-import';
import { putStoreRecord, STORES, type GetStore, waitForTransaction } from './idb-support';
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

export const batchImportWordsLocal = async (
  context: LocalCatalogStorageContext,
  request: CatalogImportRequest,
  onProgress?: (progress: number) => void,
): Promise<CatalogImportResult> => {
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

    const duplicate = bookGroup.words.some((candidate) => candidate.word === word && candidate.definition === definition);
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

export const getWordsByBookLocal = async (
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

export const updateWordLocal = async (
  context: Pick<LocalCatalogStorageContext, 'getStore'>,
  word: WordData,
): Promise<void> => {
  const store = await context.getStore(STORES.WORDS, 'readwrite');
  await putStoreRecord(store, word);
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

export const updateWordCacheLocal = async (
  context: Pick<LocalCatalogStorageContext, 'getStore'>,
  wordId: string,
  sentence: string,
  translation: string,
): Promise<void> => {
  const store = await context.getStore(STORES.WORDS, 'readwrite');
  await mutateWordAndWaitForTransaction(
    store,
    wordId,
    (word) => ({
      ...word,
      exampleSentence: sentence,
      exampleMeaning: translation,
      exampleGeneratedAt: Date.now(),
      exampleAuditStatus: GeneratedAssetAuditStatus.PENDING,
    }),
    '単語キャッシュの保存に失敗しました。',
  );
};

const readWordRecordLocal = async (
  context: Pick<LocalCatalogStorageContext, 'getStore'>,
  wordId: string,
): Promise<WordData | undefined> => {
  const store = await context.getStore(STORES.WORDS, 'readonly');
  return new Promise((resolve, reject) => {
    const request = store.get(wordId);
    request.onsuccess = () => resolve(request.result as WordData | undefined);
    request.onerror = () => reject(request.error || new Error('単語キャッシュの読み込みに失敗しました。'));
  });
};

const writeWordRecordLocal = async (
  context: Pick<LocalCatalogStorageContext, 'getStore'>,
  word: WordData,
): Promise<void> => {
  const store = await context.getStore(STORES.WORDS, 'readwrite');
  await putStoreRecord(store, word);
};

export const generateWordHintAssetLocal = async (
  context: Pick<LocalCatalogStorageContext, 'getStore'>,
  payload: GenerateWordHintAssetPayload,
): Promise<WordData> => {
  const word = await readWordRecordLocal(context, payload.wordId);
  if (!word) {
    throw new Error('対象の単語が見つかりません。');
  }

  const nextWord: WordData = { ...word };
  if (payload.assetType === WordHintAssetType.EXAMPLE) {
    if (!payload.forceRefresh && nextWord.exampleSentence?.trim()) {
      return nextWord;
    }

    const generatedAt = Date.now();
    const generated = await generateGeminiSentence(nextWord.word, nextWord.definition)
      || createLocalExampleHint(nextWord.word, nextWord.definition, generatedAt);
    const nextSentence = 'english' in generated ? generated.english : generated.sentence;
    const nextTranslation = 'japanese' in generated ? generated.japanese : generated.translation;

    nextWord.exampleSentence = nextSentence;
    nextWord.exampleMeaning = nextTranslation;
    nextWord.exampleGeneratedAt = generatedAt;
    nextWord.exampleAuditStatus = GeneratedAssetAuditStatus.PENDING;
  } else {
    if (!payload.forceRefresh && nextWord.exampleImageUrl?.trim()) {
      return nextWord;
    }

    const generatedAt = Date.now();
    const imageUrl = await generateWordImage(nextWord.word, nextWord.definition)
      || createWordImagePlaceholderDataUrl(nextWord.word, nextWord.definition);

    nextWord.exampleImageUrl = imageUrl;
    nextWord.exampleImageGeneratedAt = generatedAt;
    nextWord.exampleImageAuditStatus = GeneratedAssetAuditStatus.PENDING;
  }

  await writeWordRecordLocal(context, nextWord);
  return nextWord;
};

export const prepareBookExamplesLocal = async (
  context: Pick<LocalCatalogStorageContext, 'getStore'>,
  bookId: string,
): Promise<PrepareBookExamplesResult> => {
  const words = await getWordsByBookLocal(context, bookId);
  const targetWords = words.filter((word) => !word.exampleSentence?.trim());
  const store = await context.getStore(STORES.WORDS, 'readwrite');
  const transactionComplete = waitForTransaction(store.transaction);

  const mutationsQueued = Promise.all(targetWords.map((word) => new Promise<void>((resolve, reject) => {
    const request = store.get(word.id);
    request.onsuccess = () => {
      try {
        const current = request.result as WordData | undefined;
        if (current) {
          const nextWord: WordData = {
            ...current,
            exampleSentence: current.exampleSentence?.trim() || `We study "${current.word}" in today's lesson.`,
            exampleMeaning: current.exampleMeaning?.trim() || `語義: ${current.definition}`,
            exampleGeneratedAt: Date.now(),
            exampleAuditStatus: GeneratedAssetAuditStatus.PENDING,
          };
          const putRequest = store.put(nextWord);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(toIndexedDbError(putRequest.error, '単語例文の保存に失敗しました。'));
          return;
        }
        resolve();
      } catch (error) {
        reject(toIndexedDbError(error, '単語例文の保存に失敗しました。'));
      }
    };
    request.onerror = () => reject(toIndexedDbError(request.error, '単語例文の読み込みに失敗しました。'));
  })));

  await Promise.all([mutationsQueued, transactionComplete]);

  return {
    bookId,
    preparedCount: targetWords.length,
    remainingCount: 0,
  };
};
