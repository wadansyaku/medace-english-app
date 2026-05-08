import type {
  BookMetadata,
  BookProgress,
  LearningHistory,
  LearningTaskIntent,
  LearningTaskIntentType,
  MasteryDistribution,
  StudentWeaknessProfile,
  UserProfile,
  WorksheetQuestionMode,
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
  isStudyInteractionSource,
  MASTERY_INTERACTION_SOURCE,
} from '../../shared/learningHistory';
import { selectColdStartSessionWords } from '../../shared/coldStartSession';
import {
  buildWeaknessProfile,
  deriveWeaknessSignals,
  rankWeaknessFocusedWords,
  toInteractionEventId,
  toWeaknessSignalRecordId,
  type WeaknessInteractionEvent,
} from '../../shared/weakness';
import { getBookProgressionIndex } from '../../shared/bookProgression';
import { formatDateKey } from '../../utils/date';
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
  type StoredInteractionEventRecord,
  type StoredLearningHistoryRecord,
  type StoredWeaknessSignalRecord,
} from './idb-support';
import { getLocalMissionAssignmentByStudent } from './missions';

export interface LearningHistoryContext {
  getStore: GetStore;
  getBooks: () => Promise<BookMetadata[]>;
  getWordsByBook: (bookId: string) => Promise<WordData[]>;
  getSession: () => Promise<UserProfile | null>;
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
  selectionPolicy = 'BOOK_DEFAULT',
}: {
  words: WordData[];
  histories: LearningHistory[];
  limit: number;
  now: number;
  selectionPolicy?: LearningTaskIntent['selectionPolicy'];
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

  if (selectionPolicy === 'BOOK_NEW_ONLY') {
    return newWords.slice(0, limit);
  }

  let session = [...due];
  if (selectionPolicy === 'BOOK_REVIEW_ONLY') {
    ahead.sort((left, right) => {
      const leftHistory = historyMap.get(left.id);
      const rightHistory = historyMap.get(right.id);
      return (leftHistory?.nextReviewDate || 0) - (rightHistory?.nextReviewDate || 0);
    });
    return [...session, ...ahead.slice(0, Math.max(0, limit - session.length))];
  }

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
  taskIntent?: LearningTaskIntent,
): Promise<WordData[]> => {
  const historyStore = await context.getStore(STORES.HISTORY);
  const historyRecords = await readAllStoreRecords<StoredLearningHistoryRecord>(historyStore);
  const userHistories = getUserLearningHistories(historyRecords, uid);
  const masteryHistories = userHistories.filter((history) => isMasteryHistoryRecord(history));
  const masteryHistoryExists = masteryHistories.some((history) => isStudyInteractionSource(history.interactionSource));
  const studiedWordIds = new Set(masteryHistories.map((history) => history.wordId));
  const now = Date.now();
  const dueHistories = masteryHistories
    .filter((history) => isDueMasteryHistory(history, now))
    .sort((left, right) => left.nextReviewDate - right.nextReviewDate);

  if (!masteryHistoryExists) {
    const [books, sessionUser] = await Promise.all([
      context.getBooks(),
      context.getSession(),
    ]);
    const wordsStore = await context.getStore(STORES.WORDS);
    const allWords = await readAllStoreRecords<WordData>(wordsStore);
    const selection = selectColdStartSessionWords({
      uid,
      limit,
      grade: sessionUser?.grade,
      level: sessionUser?.englishLevel,
      books,
      words: allWords,
    });

    if (selection.selectedWords.length >= limit) {
      return selection.selectedWords;
    }

    const selectedIds = new Set(selection.selectedWords.map((word) => word.id));
    const fallbackWords = allWords
      .filter((word) => !selectedIds.has(word.id) && !studiedWordIds.has(word.id))
      .sort((left, right) => (
        left.bookId === right.bookId
          ? left.number - right.number
          : left.bookId.localeCompare(right.bookId)
      ));

    return [
      ...selection.selectedWords,
      ...fallbackWords.slice(0, Math.max(0, limit - selection.selectedWords.length)),
    ];
  }

  const wordsStore = await context.getStore(STORES.WORDS);
  const sessionWords: WordData[] = [];

  for (const history of dueHistories.slice(0, limit)) {
    const word = await readStoreRecord<WordData>(wordsStore, history.wordId);
    if (word) sessionWords.push(word);
  }

  if (sessionWords.length < limit) {
    const [allWords, books, sessionUser, weaknessProfile] = await Promise.all([
      readAllStoreRecords<WordData>(wordsStore),
      context.getBooks(),
      context.getSession(),
      getWeaknessProfile(context, uid),
    ]);
    const bookBandsById = Object.fromEntries(
      books.map((book) => [book.id, getBookProgressionIndex(book)]),
    );
    const targetedWords = typeof taskIntent?.targetBandIndex === 'number'
      ? allWords.filter((word) => {
        const band = bookBandsById[word.bookId];
        return studiedWordIds.has(word.id)
          ? false
          : band === null || band === undefined || band >= taskIntent.targetBandIndex! - 1;
      })
      : allWords.filter((word) => !studiedWordIds.has(word.id));
    const rankedNewWords = rankWeaknessFocusedWords({
      uid,
      words: targetedWords,
      weaknessProfile,
      grade: sessionUser?.grade,
      level: sessionUser?.englishLevel,
      dateKey: formatDateKey(now),
      bookBandsById,
    });
    sessionWords.push(...rankedNewWords.slice(0, limit - sessionWords.length));
  }

  return sessionWords;
};

const getInteractionEvents = async (
  context: Pick<LearningHistoryContext, 'getStore'>,
  uid: string,
): Promise<WeaknessInteractionEvent[]> => {
  const store = await context.getStore(STORES.INTERACTION_EVENTS);
  const records = await readAllStoreRecords<StoredInteractionEventRecord>(store);
  return records
    .filter((record) => record.uid === uid)
    .map((record) => record.data)
    .sort((left, right) => right.createdAt - left.createdAt);
};

const rebuildWeaknessSignals = async (
  context: LearningHistoryContext,
  uid: string,
): Promise<StudentWeaknessProfile | null> => {
  const [historyStore, signalStore, sessionUser, events] = await Promise.all([
    context.getStore(STORES.HISTORY),
    context.getStore(STORES.WEAKNESS_SIGNALS, 'readwrite'),
    context.getSession(),
    getInteractionEvents(context, uid),
  ]);
  const histories = getUserLearningHistories(
    await readAllStoreRecords<StoredLearningHistoryRecord>(historyStore),
    uid,
  );
  const signals = deriveWeaknessSignals({
    events,
    histories,
    grade: sessionUser?.grade,
    level: sessionUser?.englishLevel,
  });

  for (const signal of signals) {
    await putStoreRecord(signalStore, {
      id: toWeaknessSignalRecordId(uid, signal.dimension),
      uid,
      data: signal,
    } satisfies StoredWeaknessSignalRecord);
  }

  return buildWeaknessProfile(signals);
};

export const getWeaknessProfile = async (
  context: Pick<LearningHistoryContext, 'getStore'>,
  uid: string,
): Promise<StudentWeaknessProfile | null> => {
  const store = await context.getStore(STORES.WEAKNESS_SIGNALS);
  const records = await readAllStoreRecords<StoredWeaknessSignalRecord>(store);
  const signals = records
    .filter((record) => record.uid === uid)
    .map((record) => record.data)
    .sort((left, right) => right.updatedAt - left.updatedAt);
  return buildWeaknessProfile(signals);
};

const resolveMissionAssignmentId = (uid: string, bookId: string): string | undefined => {
  const assignment = getLocalMissionAssignmentByStudent(uid);
  if (!assignment) return undefined;
  if (!assignment.mission.bookId || assignment.mission.bookId === bookId) {
    return assignment.id;
  }
  return undefined;
};

const appendInteractionEvent = async (
  context: Pick<LearningHistoryContext, 'getStore' | 'getBooks'>,
  event: WeaknessInteractionEvent,
): Promise<void> => {
  const [store, books] = await Promise.all([
    context.getStore(STORES.INTERACTION_EVENTS, 'readwrite'),
    context.getBooks(),
  ]);
  const book = books.find((candidate) => candidate.id === event.bookId);
  const enrichedEvent: WeaknessInteractionEvent = {
    ...event,
    bookProgressionBand: book ? getBookProgressionIndex(book) : event.bookProgressionBand,
  };
  await putStoreRecord(store, {
    id: toInteractionEventId(enrichedEvent),
    uid: event.userId,
    data: enrichedEvent,
  } satisfies StoredInteractionEventRecord);
};

export const getBookSession = async (
  context: LearningHistoryContext,
  uid: string,
  bookId: string,
  limit: number,
  taskIntent?: LearningTaskIntent,
): Promise<WordData[]> => {
  const words = await context.getWordsByBook(bookId);
  const historyStore = await context.getStore(STORES.HISTORY);
  const records = await readAllStoreRecords<StoredLearningHistoryRecord>(historyStore);
  return buildBookSessionWords({
    words,
    histories: getUserLearningHistories(records, uid).filter((history) => history.bookId === bookId),
    limit,
    now: Date.now(),
    selectionPolicy: taskIntent?.selectionPolicy,
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
  missionAssignmentId?: string,
  taskIntentType?: LearningTaskIntentType,
): Promise<void> => {
  const historyStore = await context.getStore(STORES.HISTORY, 'readwrite');
  const id = buildUserScopedRecordId(uid, word.id);
  const existing = await readStoreRecord<StoredLearningHistoryRecord>(historyStore, id);
  const current = existing?.data;
  const now = Date.now();
  let interval = current?.interval || 0;
  let easeFactor = current?.easeFactor || 2.5;
  const attemptCount = (current?.attemptCount || 0) + 1;
  const correctCount = (current?.correctCount || 0) + (rating >= 2 ? 1 : 0);
  const totalResponseTimeMs = (current?.totalResponseTimeMs || 0) + Math.max(0, Math.round(responseTimeMs));
  const intervalDaysBefore = current?.interval || 0;

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
      lastStudiedAt: now,
      nextReviewDate: now + interval * 86400000,
      interval,
      easeFactor,
      correctCount,
      attemptCount,
      totalResponseTimeMs,
      interactionSource: MASTERY_INTERACTION_SOURCE,
    },
  });

  await appendInteractionEvent(context, {
    userId: uid,
    wordId: word.id,
    bookId: word.bookId,
    createdAt: now,
    interactionSource: 'STUDY',
    correct: rating >= 2,
    rating,
    responseTimeMs,
    intervalDaysBefore,
    missionAssignmentId: missionAssignmentId || resolveMissionAssignmentId(uid, word.bookId),
    taskIntentType,
  });
  await rebuildWeaknessSignals(context, uid);
};

export const recordQuizAttempt = async (
  context: LearningHistoryContext,
  uid: string,
  wordId: string,
  bookId: string,
  correct: boolean,
  questionMode: WorksheetQuestionMode,
  responseTimeMs = 0,
  missionAssignmentId?: string,
  taskIntentType?: LearningTaskIntentType,
): Promise<void> => {
  const historyStore = await context.getStore(STORES.HISTORY, 'readwrite');
  const id = buildUserScopedRecordId(uid, wordId);
  const existing = await readStoreRecord<StoredLearningHistoryRecord>(historyStore, id);
  const now = Date.now();
  await putStoreRecord(historyStore, {
    id,
    data: buildQuizAttemptHistory({
      existing: existing?.data,
      wordId,
      bookId,
      correct,
      responseTimeMs,
      now,
    }),
  });
  await appendInteractionEvent(context, {
    userId: uid,
    wordId,
    bookId,
    createdAt: now,
    interactionSource: 'QUIZ',
    questionMode,
    correct,
    responseTimeMs,
    intervalDaysBefore: existing?.data?.interval || 0,
    missionAssignmentId: missionAssignmentId || resolveMissionAssignmentId(uid, bookId),
    taskIntentType,
  });
  await rebuildWeaknessSignals(context, uid);
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
