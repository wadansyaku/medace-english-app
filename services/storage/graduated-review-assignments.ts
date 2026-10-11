import { UserRole, BookAccessScope, BookCatalogSource } from '../../types';
import type { BookMetadata, LearningHistory, LearningTaskIntent, StudyWordRange, UserProfile, WordData } from '../../types';
import { canAccessOfficialBook, normalizeBookVisibilityPolicy } from '../../utils/bookAccess';
import { isBookSelectableForToday } from '../../shared/materialQuality';
import { isDueMasteryHistory, isMasteryProgressHistory } from '../../shared/learningHistory';
import { isWordInStudyRange } from '../../shared/studyScope';
import { selectBoundedLongTermReviewCandidates } from '../../shared/studySession';
import {
  composeGraduatedReviewSession,
  getGraduatedReviewDayKey,
  getGraduatedReviewSessionQuota,
  GRADUATED_REVIEW_DAILY_LIMIT,
  isDueGraduatedHistory,
} from '../../shared/graduatedReview';
import { projectWordHintAssetsForLearner } from '../../shared/wordHintAssets';
import { buildUserScopedRecordId, STORES, waitForTransaction, type StoredLearningHistoryRecord, type StoredSessionRecord } from './idb-support';

export interface LocalStudySnapshot {
  user: UserProfile;
  books: BookMetadata[];
  words: WordData[];
  histories: LearningHistory[];
}

export interface LocalGraduatedReviewDay {
  key: string;
  uid: string;
  dayKey: string;
  allocatedWordIds: string[];
  startOrdinal: number;
}

export interface LocalStudySessionStart {
  key: string;
  uid: string;
  clientSessionId: string;
  fingerprint: string;
  dayKey: string;
  startOrdinal: number;
  resultWords: Array<{ id: string; bookId: string }>;
  graduatedWordIds: string[];
  committedAt: number;
}

export const localGraduatedReviewDayKey = (uid: string, dayKey: string): string => `long-term-review-day:${JSON.stringify([uid, dayKey])}`;
export const localStudySessionStartKey = (uid: string, clientSessionId: string): string => `long-term-review-start:${JSON.stringify([uid, clientSessionId])}`;

const isExactlyOwnedBook = (book: BookMetadata, uid: string): boolean => {
  try {
    const metadata = JSON.parse(book.description || '{}') as { createdBy?: unknown };
    return metadata.createdBy === uid;
  } catch { return false; }
};

export const getLocalStudyAccessibleBooks = (books: BookMetadata[], user: UserProfile): BookMetadata[] => (
  books.map((rawBook) => isExactlyOwnedBook(rawBook, user.uid)
    ? { ...rawBook, catalogSource: BookCatalogSource.USER_GENERATED, accessScope: BookAccessScope.ALL_PLANS }
    : normalizeBookVisibilityPolicy(rawBook))
    .filter((book) => isBookSelectableForToday(book)
      && (user.role === UserRole.ADMIN || isExactlyOwnedBook(book, user.uid) || canAccessOfficialBook(user.subscriptionPlan, book)))
);

const snapshotFromRecords = (
  uid: string,
  session: StoredSessionRecord | undefined,
  books: BookMetadata[],
  words: WordData[],
  records: StoredLearningHistoryRecord[],
): LocalStudySnapshot => {
  if (!session?.user || session.user.uid !== uid) throw new Error('学習者のセッションを確認してください。');
  const accessibleBooks = getLocalStudyAccessibleBooks(books, session.user);
  const bookIds = new Set(accessibleBooks.map((book) => book.id));
  const scopedWords = words.filter((word) => bookIds.has(word.bookId));
  const wordsById = new Map(scopedWords.map((word) => [word.id, word]));
  const histories = records.filter((record) => record.id === buildUserScopedRecordId(uid, record.data.wordId)
    && wordsById.get(record.data.wordId)?.bookId === record.data.bookId).map((record) => record.data);
  return { user: session.user, books: accessibleBooks, words: scopedWords, histories };
};

const assertDay = (day: LocalGraduatedReviewDay | undefined, uid: string, dayKey: string): LocalGraduatedReviewDay => {
  if (!day) return { key: localGraduatedReviewDayKey(uid, dayKey), uid, dayKey, allocatedWordIds: [], startOrdinal: 0 };
  if (day.uid !== uid || day.dayKey !== dayKey || !Array.isArray(day.allocatedWordIds)
    || day.allocatedWordIds.some((id) => typeof id !== 'string')
    || new Set(day.allocatedWordIds).size !== day.allocatedWordIds.length
    || day.allocatedWordIds.length > GRADUATED_REVIEW_DAILY_LIMIT
    || !Number.isSafeInteger(day.startOrdinal) || day.startOrdinal < 0) {
    throw new Error('長期復習の割当記録を確認できません。');
  }
  return day;
};

/** All authorization, selection, and receipt writes run synchronously from
 * native request callbacks. No external await can close the transaction. */
export const allocateLocalGraduatedReviewSession = async ({
  getDb, uid, clientSessionId, fingerprint, limit, now, selectionPolicy, resolveScope, buildNormalWords,
}: {
  getDb: () => Promise<IDBDatabase>;
  uid: string;
  clientSessionId: string;
  fingerprint: string;
  limit: number;
  now: number;
  selectionPolicy?: LearningTaskIntent['selectionPolicy'];
  resolveScope: (snapshot: LocalStudySnapshot) => WordData[];
  buildNormalWords: (snapshot: LocalStudySnapshot, scopedWords: WordData[]) => WordData[];
}): Promise<WordData[]> => {
  const db = await getDb();
  const tx = db.transaction([STORES.SESSION, STORES.HISTORY, STORES.WORDS, STORES.BOOKS], 'readwrite');
  const complete = waitForTransaction(tx);
  const sessionStore = tx.objectStore(STORES.SESSION);
  const dayKey = getGraduatedReviewDayKey(now);
  const startKey = localStudySessionStartKey(uid, clientSessionId);
  let result: WordData[] | undefined;
  const queued = new Promise<void>((resolve, reject) => {
    const fail = (error: unknown) => {
      try { tx.abort(); } catch { /* A native error may already have aborted. */ }
      reject(error);
    };
    const requests = [
      sessionStore.get('current'), tx.objectStore(STORES.BOOKS).getAll(),
      tx.objectStore(STORES.WORDS).getAll(), tx.objectStore(STORES.HISTORY).getAll(),
      sessionStore.get(startKey), sessionStore.get(localGraduatedReviewDayKey(uid, dayKey)),
    ];
    let pending = requests.length;
    const values: unknown[] = [];
    requests.forEach((request, index) => {
      request.onerror = () => fail(request.error || new Error('学習開始の読み込みに失敗しました。'));
      request.onsuccess = () => {
        values[index] = request.result;
        if (--pending !== 0) return;
        try {
          const snapshot = snapshotFromRecords(uid, values[0] as StoredSessionRecord | undefined,
            values[1] as BookMetadata[], values[2] as WordData[], values[3] as StoredLearningHistoryRecord[]);
          const scopedWords = resolveScope(snapshot);
          const wordsById = new Map(scopedWords.map((word) => [word.id, word]));
          const historiesById = new Map(snapshot.histories.map((history) => [history.wordId, history]));
          const previous = values[4] as LocalStudySessionStart | undefined;
          if (previous) {
            if (previous.uid !== uid || previous.clientSessionId !== clientSessionId || previous.fingerprint !== fingerprint) {
              const error = new Error('この学習開始IDは別の内容で使用済みです。同じ内容で再送してください。');
              Object.assign(error, { status: 409 });
              throw error;
            }
            const graduatedIds = new Set(previous.graduatedWordIds);
            result = previous.resultWords.flatMap((savedWord) => {
              const word = wordsById.get(savedWord.id);
              if (!word || word.bookId !== savedWord.bookId) return [];
              const current = historiesById.get(word.id);
              if (graduatedIds.has(word.id) && !isDueGraduatedHistory(current || {
                status: 'new', interactionSource: 'STUDY', nextReviewDate: Infinity, lastStudiedAt: 0,
              }, now)) return [];
              if (!graduatedIds.has(word.id) && (current?.status === 'graduated'
                || (selectionPolicy === 'BOOK_DUE_ONLY' && (!current || !isMasteryProgressHistory(current)
                  || !Number.isFinite(current.nextReviewDate) || !isDueMasteryHistory(current, now))))) return [];
              return [{ ...projectWordHintAssetsForLearner(word), ...(graduatedIds.has(word.id) ? { longTermReview: true } : {}) }];
            });
            resolve();
            return;
          }
          const day = assertDay(values[5] as LocalGraduatedReviewDay | undefined, uid, dayKey);
          const startOrdinal = day.startOrdinal + 1;
          if (!Number.isSafeInteger(startOrdinal)) throw new Error('学習開始の回数を確認できません。');
          const scopedHistories = snapshot.histories.filter((history) => wordsById.get(history.wordId)?.bookId === history.bookId);
          const ordinaryDueCount = scopedHistories.filter((history) => isDueMasteryHistory(history, now)).length;
          const quota = Math.min(getGraduatedReviewSessionQuota(limit, ordinaryDueCount, startOrdinal),
            GRADUATED_REVIEW_DAILY_LIMIT - day.allocatedWordIds.length);
          const allocated = new Set(day.allocatedWordIds);
          const graduates = selectBoundedLongTermReviewCandidates({
            scopedWords: scopedWords.filter((word) => !allocated.has(word.id)),
            histories: scopedHistories, now, limit: GRADUATED_REVIEW_DAILY_LIMIT, quota: GRADUATED_REVIEW_DAILY_LIMIT,
          }).words.slice(0, quota).map((word) => ({ ...projectWordHintAssetsForLearner(word), longTermReview: true }));
          result = composeGraduatedReviewSession(buildNormalWords(snapshot, scopedWords), graduates, limit);
          const receipt: LocalStudySessionStart = {
            key: startKey, uid, clientSessionId, fingerprint, dayKey, startOrdinal,
            resultWords: result.map((word) => ({ id: word.id, bookId: word.bookId })),
            graduatedWordIds: graduates.map((word) => word.id), committedAt: now,
          };
          sessionStore.add(receipt);
          sessionStore.put({ ...day, startOrdinal, allocatedWordIds: [...day.allocatedWordIds, ...receipt.graduatedWordIds] } satisfies LocalGraduatedReviewDay);
          resolve();
        } catch (error) { fail(error); }
      };
    });
  });
  await Promise.all([queued, complete]);
  if (!result) throw new Error('学習開始を確認できません。');
  return result;
};

export const readLocalGraduatedReviewAvailableCount = async (
  getDb: () => Promise<IDBDatabase>, uid: string, now: number, bookId?: string, range?: StudyWordRange,
): Promise<number> => {
  const db = await getDb();
  const tx = db.transaction([STORES.SESSION, STORES.HISTORY, STORES.WORDS, STORES.BOOKS]);
  const complete = waitForTransaction(tx);
  const store = tx.objectStore(STORES.SESSION);
  const dayKey = getGraduatedReviewDayKey(now);
  let reads: IDBRequest[];
  try {
    reads = [store.get('current'), tx.objectStore(STORES.BOOKS).getAll(), tx.objectStore(STORES.WORDS).getAll(),
      tx.objectStore(STORES.HISTORY).getAll(), store.get(localGraduatedReviewDayKey(uid, dayKey))];
  } catch (error) {
    try { tx.abort(); } catch { /* An injected/native failure may have aborted already. */ }
    await complete.catch(() => {});
    throw error;
  }
  const [values] = await Promise.all([Promise.all(reads.map((request) => new Promise<unknown>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('長期復習の件数を取得できません。'));
  }))), complete]);
  const snapshot = snapshotFromRecords(uid, values[0] as StoredSessionRecord | undefined,
    values[1] as BookMetadata[], values[2] as WordData[], values[3] as StoredLearningHistoryRecord[]);
  if (bookId && !snapshot.books.some((book) => book.id === bookId)) throw new Error('この教材を利用できません。');
  const day = assertDay(values[4] as LocalGraduatedReviewDay | undefined, uid, dayKey);
  const allocated = new Set(day.allocatedWordIds);
  return selectBoundedLongTermReviewCandidates({
    scopedWords: snapshot.words.filter((word) => (!bookId || word.bookId === bookId)
      && isWordInStudyRange(word, range) && !allocated.has(word.id)),
    histories: snapshot.histories, now, limit: GRADUATED_REVIEW_DAILY_LIMIT,
    quota: GRADUATED_REVIEW_DAILY_LIMIT - day.allocatedWordIds.length,
  }).words.length;
};
