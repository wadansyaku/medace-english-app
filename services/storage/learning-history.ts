import type {
  BookProgress,
  LearningHistory,
  MasteryDistribution,
  WordData,
} from '../../types';
import {
  buildMasteryDistribution,
  getMasteryDistributionBucket,
  getStrictStudyWordIds,
  hasMasteryProgress,
  isDueMasteryHistory,
  isMasteryHistoryRecord,
  isMasteryProgressHistory,
  MASTERY_INTERACTION_SOURCE,
} from '../../shared/learningHistory';
import { buildQuizAttemptHistory } from '../../utils/quiz';
import {
  buildUserScopedRecordId,
  calculatePercentage,
  GetStore,
  isUserScopedRecordId,
  iterateStore,
  putStoreRecord,
  readAllStoreRecords,
  readStoreRecord,
  STORES,
  type StoredLearningHistoryRecord,
} from './idb-support';

export interface LearningHistoryContext {
  getStore: GetStore;
  getWordsByBook: (bookId: string) => Promise<WordData[]>;
}

export const getUserHistoryRecords = (
  records: StoredLearningHistoryRecord[],
  uid: string,
): StoredLearningHistoryRecord[] => records.filter((record) => isUserScopedRecordId(record.id, uid));

export const getUserLearningHistories = (
  records: StoredLearningHistoryRecord[],
  uid: string,
): LearningHistory[] => getUserHistoryRecords(records, uid).map((record) => record.data);

export const getDueCountFromHistoryRecords = (
  records: StoredLearningHistoryRecord[],
  uid: string,
  now: number,
): number => getUserLearningHistories(records, uid).filter((history) => isDueMasteryHistory(history, now)).length;

export const getStudiedWordIdsByBookFromHistoryRecords = (
  records: StoredLearningHistoryRecord[],
  uid: string,
  bookId: string,
): string[] => getStrictStudyWordIds(getUserLearningHistories(records, uid), bookId);

export const getBookProgressFromHistoryRecords = (
  records: StoredLearningHistoryRecord[],
  uid: string,
  bookId: string,
  totalCount: number,
): BookProgress => {
  const learnedCount = getUserLearningHistories(records, uid)
    .filter((history) => history.bookId === bookId && isMasteryProgressHistory(history))
    .length;

  return {
    bookId,
    learnedCount,
    totalCount,
    percentage: calculatePercentage(learnedCount, totalCount),
  };
};

export const getMasteryDistributionFromHistoryRecords = (
  records: StoredLearningHistoryRecord[],
  uid: string,
): MasteryDistribution => buildMasteryDistribution(getUserLearningHistories(records, uid));

export const buildBookSessionWords = ({
  words,
  histories,
  limit,
  now,
}: {
  words: WordData[];
  histories: LearningHistory[];
  limit: number;
  now: number;
}): WordData[] => {
  const historyMap = new Map<string, LearningHistory>();
  histories.forEach((history) => {
    if (isMasteryHistoryRecord(history)) {
      historyMap.set(history.wordId, history);
    }
  });

  const due: WordData[] = [];
  const newWords: WordData[] = [];
  const ahead: WordData[] = [];

  words.forEach((word) => {
    const history = historyMap.get(word.id);
    if (!history) {
      newWords.push(word);
      return;
    }

    if (getMasteryDistributionBucket(history) === 'graduated') return;
    if (isDueMasteryHistory(history, now)) due.push(word);
    else ahead.push(word);
  });

  let session = [...due];
  if (session.length < limit) {
    session = [...session, ...newWords.slice(0, limit - session.length)];
  }
  if (session.length < limit) {
    ahead.sort((left, right) => {
      const leftHistory = historyMap.get(left.id);
      const rightHistory = historyMap.get(right.id);
      return (leftHistory?.nextReviewDate || 0) - (rightHistory?.nextReviewDate || 0);
    });
    session = [...session, ...ahead.slice(0, limit - session.length)];
  }

  return session;
};

export const getDailySessionWords = async (
  context: LearningHistoryContext,
  uid: string,
  limit: number,
): Promise<WordData[]> => {
  const historyStore = await context.getStore(STORES.HISTORY);
  const dueWordIds: string[] = [];
  const studiedWordIds = new Set<string>();
  const now = Date.now();

  await iterateStore<StoredLearningHistoryRecord>(historyStore, (record) => {
    if (!isUserScopedRecordId(record.id, uid)) return;
    if (isDueMasteryHistory(record.data, now)) dueWordIds.push(record.data.wordId);
    if (isMasteryHistoryRecord(record.data)) studiedWordIds.add(record.data.wordId);
  });

  const wordsStore = await context.getStore(STORES.WORDS);
  const sessionWords: WordData[] = [];

  for (const wordId of dueWordIds.slice(0, limit)) {
    const word = await readStoreRecord<WordData>(wordsStore, wordId);
    if (word) sessionWords.push(word);
  }

  if (sessionWords.length < limit) {
    await iterateStore<WordData>(wordsStore, (word) => {
      if (sessionWords.length >= limit) return false;
      if (studiedWordIds.has(word.id)) return;
      sessionWords.push(word);
    });
  }

  return sessionWords;
};

export const getBookSession = async (
  context: LearningHistoryContext,
  uid: string,
  bookId: string,
  limit: number,
): Promise<WordData[]> => {
  const words = await context.getWordsByBook(bookId);
  const historyStore = await context.getStore(STORES.HISTORY);
  const records = await readAllStoreRecords<StoredLearningHistoryRecord>(historyStore);
  return buildBookSessionWords({
    words,
    histories: getUserLearningHistories(records, uid).filter((history) => history.bookId === bookId),
    limit,
    now: Date.now(),
  });
};

export const getDueCount = async (context: LearningHistoryContext, uid: string): Promise<number> => {
  const historyStore = await context.getStore(STORES.HISTORY);
  const records = await readAllStoreRecords<StoredLearningHistoryRecord>(historyStore);
  return getDueCountFromHistoryRecords(records, uid, Date.now());
};

export const saveSrsHistory = async (
  context: LearningHistoryContext,
  uid: string,
  word: WordData,
  rating: number,
  responseTimeMs = 0,
): Promise<void> => {
  const historyStore = await context.getStore(STORES.HISTORY, 'readwrite');
  const id = buildUserScopedRecordId(uid, word.id);
  const existing = await readStoreRecord<StoredLearningHistoryRecord>(historyStore, id);
  const current = existing?.data;
  let interval = current?.interval || 0;
  let easeFactor = current?.easeFactor || 2.5;
  const attemptCount = (current?.attemptCount || 0) + 1;
  const correctCount = (current?.correctCount || 0) + (rating >= 2 ? 1 : 0);
  const totalResponseTimeMs = (current?.totalResponseTimeMs || 0) + Math.max(0, Math.round(responseTimeMs));

  if (rating === 0) {
    interval = 0;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
  } else if (rating === 1) {
    interval = 1;
  } else if (rating === 2) {
    interval = interval === 0 ? 1 : Math.ceil(interval * easeFactor);
  } else if (rating === 3) {
    interval = interval === 0 ? 3 : Math.ceil(interval * easeFactor * 1.3);
    easeFactor += 0.15;
  }

  if (interval > 365) interval = 365;

  await putStoreRecord(historyStore, {
    id,
    data: {
      wordId: word.id,
      bookId: word.bookId,
      status: getMasteryDistributionBucket({
        interactionSource: MASTERY_INTERACTION_SOURCE,
        status: interval > 20 ? 'graduated' : 'learning',
        interval,
      }) === 'graduated' ? 'graduated' : 'learning',
      lastStudiedAt: Date.now(),
      nextReviewDate: Date.now() + interval * 86400000,
      interval,
      easeFactor,
      correctCount,
      attemptCount,
      totalResponseTimeMs,
      interactionSource: MASTERY_INTERACTION_SOURCE,
    },
  });
};

export const recordQuizAttempt = async (
  context: LearningHistoryContext,
  uid: string,
  wordId: string,
  bookId: string,
  correct: boolean,
  responseTimeMs = 0,
): Promise<void> => {
  const historyStore = await context.getStore(STORES.HISTORY, 'readwrite');
  const id = buildUserScopedRecordId(uid, wordId);
  const existing = await readStoreRecord<StoredLearningHistoryRecord>(historyStore, id);
  await putStoreRecord(historyStore, {
    id,
    data: buildQuizAttemptHistory({
      existing: existing?.data,
      wordId,
      bookId,
      correct,
      responseTimeMs,
    }),
  });
};

export const getStudiedWordIdsByBook = async (
  context: LearningHistoryContext,
  uid: string,
  bookId: string,
): Promise<string[]> => {
  const historyStore = await context.getStore(STORES.HISTORY);
  const records = await readAllStoreRecords<StoredLearningHistoryRecord>(historyStore);
  return getStudiedWordIdsByBookFromHistoryRecords(records, uid, bookId);
};

export const getBookProgress = async (
  context: LearningHistoryContext,
  uid: string,
  bookId: string,
): Promise<BookProgress> => {
  const words = await context.getWordsByBook(bookId);
  if (words.length === 0) {
    return { bookId, learnedCount: 0, totalCount: 0, percentage: 0 };
  }

  const historyStore = await context.getStore(STORES.HISTORY);
  const records = await readAllStoreRecords<StoredLearningHistoryRecord>(historyStore);
  return getBookProgressFromHistoryRecords(records, uid, bookId, words.length);
};

export const toWorksheetMasteryStatus = (
  history: Pick<LearningHistory, 'interactionSource' | 'status' | 'interval' | 'attemptCount'>,
): 'graduated' | 'review' | 'learning' | null => {
  if (!hasMasteryProgress(history.attemptCount, history.interval) || !isMasteryHistoryRecord(history)) {
    return null;
  }
  return getMasteryDistributionBucket(history);
};
