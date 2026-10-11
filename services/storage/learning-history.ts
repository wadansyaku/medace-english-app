import {
  LearningTaskIntentType,
} from '../../types';
import type {
  BookMetadata,
  BookProgress,
  BookStudyOverview,
  StudyWordRange,
  GrammarCurriculumScopeId,
  JapaneseTranslationFeedback,
  LearningHistory,
  LearningPlan,
  LearningTaskIntent,
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
} from '../../shared/learningHistory';
import { buildSrsHistory, studyAttemptFingerprint, validateStudyAttempt } from '../../shared/srs';
import { quizAttemptFingerprint, validateQuizAttempt, type QuizAttemptReceipt } from '../../shared/quizAttempt';
import { normalizeStudySessionLimit } from '../../shared/studySession';
import { normalizeStudySessionStartId, studySessionStartFingerprint } from '../../shared/studySessionStart';
import { NARU_BOOK_ID } from '../../shared/naruBook';
import { assertNoDailyStudyWordRange, getBookTaskWordRange, isWordInStudyRange, normalizeStudyWordRange } from '../../shared/studyScope';
import { selectColdStartSessionWords } from '../../shared/coldStartSession';
import { normalizeTaskPreferredBookIds } from '../../shared/learningTask';
import { isBookSelectableForToday } from '../../shared/materialQuality';
import { projectWordHintAssetsForLearner } from '../../shared/wordHintAssets';
import {
  buildWeaknessProfile,
  deriveWeaknessSignals,
  rankWeaknessFocusedWords,
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
  requestToPromise,
  STORES,
  waitForTransaction,
  type StoredInteractionEventRecord,
  type StoredLearningHistoryRecord,
  type StoredQuizAttemptReceipt,
  type StoredStudyAttemptReceipt,
  type StoredWeaknessSignalRecord,
} from './idb-support';
import { getLocalMissionAssignmentByStudent } from './missions';
import {
  allocateLocalGraduatedReviewSession,
  getLocalStudyAccessibleBooks,
  readLocalGraduatedReviewAvailableCount,
  type LocalStudySnapshot,
} from './graduated-review-assignments';

export interface LearningHistoryContext {
  getDb?: () => Promise<IDBDatabase>;
  getStore: GetStore;
  getBooks: () => Promise<BookMetadata[]>;
  getWordsByBook: (bookId: string) => Promise<WordData[]>;
  getSession: () => Promise<UserProfile | null>;
  getLearningPlan?: (uid: string) => Promise<LearningPlan | null>;
}

const resolvePreferredBookIds = async (
  context: LearningHistoryContext,
  uid: string,
  taskIntent?: LearningTaskIntent,
  propagatePlanError = false,
): Promise<string[]> => {
  const taskBookIds = normalizeTaskPreferredBookIds(taskIntent?.preferredBookIds);
  if (taskBookIds.length > 0) return taskBookIds;
  if (!context.getLearningPlan) return [];

  try {
    const plan = await context.getLearningPlan(uid);
    return normalizeTaskPreferredBookIds(plan?.selectedBookIds);
  } catch (error) {
    if (propagatePlanError) throw error;
    return [];
  }
};

const sortWordsByPreferredBookOrder = (
  words: WordData[],
  preferredBookIds: string[],
): WordData[] => {
  const bookOrder = new Map(preferredBookIds.map((bookId, index) => [bookId, index]));
  return [...words].sort((left, right) => {
    const leftOrder = bookOrder.get(left.bookId) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = bookOrder.get(right.bookId) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    if (left.bookId !== right.bookId) return left.bookId.localeCompare(right.bookId);
    if (left.number !== right.number) return left.number - right.number;
    return left.id.localeCompare(right.id);
  });
};

const filterBooksByPreferredIds = (
  books: BookMetadata[],
  preferredBookIds: string[],
): BookMetadata[] => {
  if (preferredBookIds.length === 0) return books;
  const booksById = new Map(books.map((book) => [book.id, book]));
  return preferredBookIds
    .map((bookId) => booksById.get(bookId))
    .filter((book): book is BookMetadata => Boolean(book));
};

const filterWordsByPreferredIds = (
  words: WordData[],
  preferredBookIds: string[],
): WordData[] => {
  if (preferredBookIds.length === 0) return words;
  const preferredBookIdSet = new Set(preferredBookIds);
  return words.filter((word) => preferredBookIdSet.has(word.bookId));
};

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
  wordRange,
}: {
  words: WordData[];
  histories: LearningHistory[];
  limit: number;
  now: number;
  selectionPolicy?: LearningTaskIntent['selectionPolicy'];
  wordRange?: StudyWordRange;
}): WordData[] => {
  limit = normalizeStudySessionLimit(limit);
  const range = normalizeStudyWordRange(wordRange);
  const strictProgress = range !== undefined || selectionPolicy === 'BOOK_DUE_ONLY';
  const historyMap = new Map<string, LearningHistory>();
  histories.forEach((history) => {
    if (strictProgress ? (isMasteryProgressHistory(history) || (isMasteryHistoryRecord(history) && history.status === 'graduated')) : isMasteryHistoryRecord(history)) {
      historyMap.set(history.wordId, history);
    }
  });

  const due: WordData[] = [];
  const newWords: WordData[] = [];
  const ahead: WordData[] = [];

  words.filter(word => isWordInStudyRange(word, range)).forEach((word) => {
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

  let session = due.slice(0, limit);
  if (selectionPolicy === 'BOOK_DUE_ONLY') return session;
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
  clientSessionId?: string,
): Promise<WordData[]> => {
  assertNoDailyStudyWordRange(taskIntent);
  limit = normalizeStudySessionLimit(limit);
  const startId = normalizeStudySessionStartId(clientSessionId);
  if (startId && taskIntent?.mode !== 'quiz' && taskIntent?.selectionPolicy !== 'BOOK_NEW_ONLY') {
    if (!context.getDb) throw new Error('学習開始の保存先を利用できません。');
    const [requestedBookIds, weaknessProfile] = await Promise.all([
      resolvePreferredBookIds(context, uid, taskIntent, true), getWeaknessProfile(context, uid),
    ]);
    const now = Date.now();
    let preferredBookIds: string[] = [];
    return allocateLocalGraduatedReviewSession({
      getDb: context.getDb, uid, clientSessionId: startId,
      fingerprint: studySessionStartFingerprint({ action: 'daily', limit, taskIntent }), limit, now,
      selectionPolicy: taskIntent?.selectionPolicy,
      resolveScope: (snapshot) => {
        preferredBookIds = requestedBookIds.length === 0 && snapshot.books.some((book) => book.id === NARU_BOOK_ID)
          ? [NARU_BOOK_ID] : requestedBookIds;
        if (preferredBookIds.length > 0 && !snapshot.books.some((book) => preferredBookIds.includes(book.id))) {
          throw new Error('選択した教材を現在利用できません。教材を選び直してください。');
        }
        return sortWordsByPreferredBookOrder(filterWordsByPreferredIds(snapshot.words, preferredBookIds), preferredBookIds);
      },
      buildNormalWords: (snapshot, scopedWords) => buildLocalDailyNormalWords(snapshot, scopedWords, preferredBookIds, limit, now, taskIntent, weaknessProfile),
    });
  }
  const historyStore = await context.getStore(STORES.HISTORY);
  const historyRecords = await readAllStoreRecords<StoredLearningHistoryRecord>(historyStore);
  const userHistories = getUserLearningHistories(historyRecords, uid);
  const requestedBookIds = await resolvePreferredBookIds(context, uid, taskIntent);
  const books = (await context.getBooks()).filter(isBookSelectableForToday);
  const preferredBookIds = requestedBookIds.length === 0 && books.some(book => book.id === NARU_BOOK_ID)
    ? [NARU_BOOK_ID]
    : requestedBookIds;
  const preferredBooks = filterBooksByPreferredIds(books, preferredBookIds);
  const effectivePreferredBookIds = preferredBookIds.length > 0 && preferredBooks.length === 0
    ? []
    : preferredBookIds;
  const effectiveBooks = effectivePreferredBookIds.length === 0 ? books : preferredBooks;
  const effectiveBookIdSet = new Set(effectiveBooks.map(book => book.id));
  const isInPreferredBookScope = (bookId: string): boolean => (
    effectiveBookIdSet.has(bookId)
  );
  const masteryHistories = userHistories.filter((history) => isMasteryHistoryRecord(history));
  const scopedMasteryHistories = masteryHistories.filter((history) => isInPreferredBookScope(history.bookId));
  const masteryHistoryExists = scopedMasteryHistories.some((history) => isStudyInteractionSource(history.interactionSource));
  const studiedWordIds = new Set(scopedMasteryHistories.map((history) => history.wordId));
  const now = Date.now();
  const dueHistories = scopedMasteryHistories
    .filter((history) => isDueMasteryHistory(history, now))
    .sort((left, right) => left.nextReviewDate - right.nextReviewDate);

  if (!masteryHistoryExists) {
    const sessionUser = await context.getSession();
    const wordsStore = await context.getStore(STORES.WORDS);
    const allWords = (await readAllStoreRecords<WordData>(wordsStore))
      .map((word) => projectWordHintAssetsForLearner(word));
    const scopedWords = sortWordsByPreferredBookOrder(
      filterWordsByPreferredIds(allWords, effectivePreferredBookIds).filter(word => isInPreferredBookScope(word.bookId)),
      effectivePreferredBookIds,
    );
    if (effectivePreferredBookIds.length > 0) {
      return scopedWords
        .filter((word) => !studiedWordIds.has(word.id))
        .slice(0, limit);
    }
    const selection = selectColdStartSessionWords({
      uid,
      limit,
      grade: sessionUser?.grade,
      level: sessionUser?.englishLevel,
      books: effectiveBooks,
      words: scopedWords,
    });

    if (selection.selectedWords.length >= limit) {
      return selection.selectedWords;
    }

    const selectedIds = new Set(selection.selectedWords.map((word) => word.id));
    const fallbackWords = scopedWords
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
    if (word && word.bookId === history.bookId && isInPreferredBookScope(word.bookId)) sessionWords.push(projectWordHintAssetsForLearner(word));
  }

  if (sessionWords.length < limit) {
    const [allWords, books, sessionUser, weaknessProfile] = await Promise.all([
      readAllStoreRecords<WordData>(wordsStore).then((words) => (
        words.map((word) => projectWordHintAssetsForLearner(word))
      )),
      context.getBooks(),
      context.getSession(),
      getWeaknessProfile(context, uid),
    ]);
    const scopedWords = sortWordsByPreferredBookOrder(
      filterWordsByPreferredIds(allWords, effectivePreferredBookIds).filter(word => isInPreferredBookScope(word.bookId)),
      effectivePreferredBookIds,
    );
    const bookBandsById = Object.fromEntries(
      books.map((book) => [book.id, getBookProgressionIndex(book)]),
    );
    const targetedWords = typeof taskIntent?.targetBandIndex === 'number'
      ? scopedWords.filter((word) => {
        const band = bookBandsById[word.bookId];
        return studiedWordIds.has(word.id)
          ? false
          : band === null || band === undefined || band >= taskIntent.targetBandIndex! - 1;
      })
      : scopedWords.filter((word) => !studiedWordIds.has(word.id));
    const shouldUseSequentialNewWords = taskIntent?.intentType === LearningTaskIntentType.TODAY_FOCUS
      || effectivePreferredBookIds.length > 0;
    const newWords = shouldUseSequentialNewWords
      ? targetedWords
      : rankWeaknessFocusedWords({
          uid,
          words: targetedWords,
          weaknessProfile,
          grade: sessionUser?.grade,
          level: sessionUser?.englishLevel,
          dateKey: formatDateKey(now),
          bookBandsById,
        });
    sessionWords.push(...newWords.slice(0, limit - sessionWords.length));
  }

  return sessionWords;
};

const buildLocalDailyNormalWords = (
  snapshot: LocalStudySnapshot,
  scopedWords: WordData[],
  preferredBookIds: string[],
  limit: number,
  now: number,
  taskIntent?: LearningTaskIntent,
  weaknessProfile?: StudentWeaknessProfile | null,
): WordData[] => {
  const wordsById = new Map(scopedWords.map((word) => [word.id, word]));
  const scopedHistories = snapshot.histories.filter((history) => wordsById.get(history.wordId)?.bookId === history.bookId && isMasteryHistoryRecord(history));
  const studiedIds = new Set(scopedHistories.map((history) => history.wordId));
  const due = scopedHistories.filter((history) => isDueMasteryHistory(history, now))
    .sort((left, right) => left.nextReviewDate - right.nextReviewDate || left.wordId.localeCompare(right.wordId))
    .map((history) => wordsById.get(history.wordId)!).slice(0, limit);
  const availableNewWords = scopedWords.filter((word) => !studiedIds.has(word.id));
  if (!scopedHistories.some((history) => isStudyInteractionSource(history.interactionSource))) {
    if (preferredBookIds.length > 0) return availableNewWords.slice(0, limit);
    const selection = selectColdStartSessionWords({ uid: snapshot.user.uid, limit, grade: snapshot.user.grade,
      level: snapshot.user.englishLevel, books: snapshot.books, words: scopedWords });
    const selectedIds = new Set(selection.selectedWords.map((word) => word.id));
    return [...selection.selectedWords, ...availableNewWords.filter((word) => !selectedIds.has(word.id)).slice(0, Math.max(0, limit - selection.selectedWords.length))];
  }
  const bookBandsById = Object.fromEntries(snapshot.books.map((book) => [book.id, getBookProgressionIndex(book)]));
  const targeted = typeof taskIntent?.targetBandIndex === 'number'
    ? availableNewWords.filter((word) => {
      const band = bookBandsById[word.bookId];
      return band === null || band === undefined || band >= taskIntent.targetBandIndex! - 1;
    }) : availableNewWords;
  const newWords = taskIntent?.intentType === LearningTaskIntentType.TODAY_FOCUS || preferredBookIds.length > 0
    ? targeted : rankWeaknessFocusedWords({ uid: snapshot.user.uid, words: targeted, weaknessProfile,
      grade: snapshot.user.grade, level: snapshot.user.englishLevel, dateKey: formatDateKey(now), bookBandsById });
  return [...due, ...newWords.slice(0, Math.max(0, limit - due.length))].map((word) => projectWordHintAssetsForLearner(word));
};

const getInteractionEvents = async (
  context: Pick<LearningHistoryContext, 'getStore'>,
  uid: string,
): Promise<WeaknessInteractionEvent[]> => {
  const store = await context.getStore(STORES.INTERACTION_EVENTS);
  const records = await requestToPromise(store.getAll() as IDBRequest<StoredInteractionEventRecord[]>);
  return records
    .filter((record) => record.uid === uid)
    .map((record) => record.data)
    .sort((left, right) => right.createdAt - left.createdAt);
};

const rebuildWeaknessSignals = async (
  context: LearningHistoryContext,
  uid: string,
): Promise<StudentWeaknessProfile | null> => {
  const [historyRecords, sessionUser, events] = await Promise.all([
    context.getStore(STORES.HISTORY).then((store) => requestToPromise(store.getAll() as IDBRequest<StoredLearningHistoryRecord[]>)),
    context.getSession(),
    getInteractionEvents(context, uid),
  ]);
  const histories = getUserLearningHistories(
    historyRecords,
    uid,
  );
  const signals = deriveWeaknessSignals({
    events,
    histories,
    grade: sessionUser?.grade,
    level: sessionUser?.englishLevel,
  });

  const records = signals.map((signal) => ({
    id: toWeaknessSignalRecordId(uid, signal.dimension),
    uid,
    data: signal,
  } satisfies StoredWeaknessSignalRecord));
  if (context.getDb) {
    const db = await context.getDb();
    const transaction = db.transaction(STORES.WEAKNESS_SIGNALS, 'readwrite');
    const complete = waitForTransaction(transaction);
    const store = transaction.objectStore(STORES.WEAKNESS_SIGNALS);
    try {
      records.forEach((record) => store.put(record));
    } catch (error) {
      transaction.abort();
      await complete.catch(() => {});
      throw error;
    }
    await complete;
  } else {
    for (const record of records) {
      await putStoreRecord(await context.getStore(STORES.WEAKNESS_SIGNALS, 'readwrite'), record);
    }
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

export const getBookSession = async (
  context: LearningHistoryContext,
  uid: string,
  bookId: string,
  limit: number,
  taskIntent?: LearningTaskIntent,
  clientSessionId?: string,
): Promise<WordData[]> => {
  const range = getBookTaskWordRange(taskIntent, bookId);
  const startId = normalizeStudySessionStartId(clientSessionId);
  if (startId && taskIntent?.mode !== 'quiz' && taskIntent?.selectionPolicy !== 'BOOK_NEW_ONLY') {
    if (!context.getDb) throw new Error('学習開始の保存先を利用できません。');
    limit = normalizeStudySessionLimit(limit);
    const now = Date.now();
    return allocateLocalGraduatedReviewSession({
      getDb: context.getDb, uid, clientSessionId: startId,
      fingerprint: studySessionStartFingerprint({ action: 'book', bookId, limit, taskIntent }), limit, now,
      selectionPolicy: taskIntent?.selectionPolicy,
      resolveScope: (snapshot) => {
        if (!snapshot.books.some((book) => book.id === bookId)) throw new Error('この教材を利用できません。');
        return snapshot.words.filter((word) => word.bookId === bookId && isWordInStudyRange(word, range))
          .sort((left, right) => left.number - right.number || left.id.localeCompare(right.id));
      },
      buildNormalWords: (snapshot, words) => buildBookSessionWords({ words, histories: snapshot.histories.filter((history) => history.bookId === bookId),
        limit, now, selectionPolicy: taskIntent?.selectionPolicy, wordRange: range }),
    });
  }
  const strictScope = range !== undefined || taskIntent?.selectionPolicy === 'BOOK_DUE_ONLY';
  if (strictScope) await assertLocalBookStudyAccess(context, uid, bookId);
  const words = strictScope ? await readLocalStudyWords(context, bookId) : await context.getWordsByBook(bookId);
  const historyStore = await context.getStore(STORES.HISTORY);
  const records = strictScope
    ? await requestToPromise(historyStore.getAll() as IDBRequest<StoredLearningHistoryRecord[]>)
    : await readAllStoreRecords<StoredLearningHistoryRecord>(historyStore);
  return buildBookSessionWords({
    words,
    histories: strictScope
      ? getBookHistories(records, uid, bookId)
      : getUserLearningHistories(records, uid).filter(history => history.bookId === bookId),
    limit,
    now: Date.now(),
    selectionPolicy: taskIntent?.selectionPolicy,
    wordRange: range,
  });
};

const getBookHistories = (records: StoredLearningHistoryRecord[], uid: string, bookId: string): LearningHistory[] => (
  records.filter(record => record.id === buildUserScopedRecordId(uid, record.data.wordId)
    && record.data.bookId === bookId).map(record => record.data)
);

const assertLocalBookStudyAccess = async (context: LearningHistoryContext, uid: string, bookId: string): Promise<void> => {
  const user = await context.getSession();
  if (!user || user.uid !== uid) throw new Error('学習者のセッションを確認してください。');
  const store = await context.getStore(STORES.BOOKS);
  const rawBook = await requestToPromise(store.get(bookId) as IDBRequest<BookMetadata | undefined>);
  if (!rawBook) throw new Error('この教材を利用できません。');
  if (!getLocalStudyAccessibleBooks([rawBook], user).some((book) => book.id === bookId)) throw new Error('この教材を利用できません。');
};

const readLocalStudyWords = async (context: LearningHistoryContext, bookId: string): Promise<WordData[]> => {
  const store = await context.getStore(STORES.WORDS);
  const words = await requestToPromise(store.index('bookId').getAll(bookId) as IDBRequest<WordData[]>);
  return words.map(word => projectWordHintAssetsForLearner(word)).sort((left, right) => left.number - right.number);
};

export const getBookStudyOverview = async (
  context: LearningHistoryContext,
  uid: string,
  bookId: string,
  wordRange?: StudyWordRange,
): Promise<BookStudyOverview> => {
  const range = normalizeStudyWordRange(wordRange);
  await assertLocalBookStudyAccess(context, uid, bookId);
  const [words, records] = await Promise.all([
    readLocalStudyWords(context, bookId),
    context.getStore(STORES.HISTORY).then(store => requestToPromise(store.getAll() as IDBRequest<StoredLearningHistoryRecord[]>)),
  ]);
  const histories = new Map(getBookHistories(records, uid, bookId)
    .filter((history) => isMasteryProgressHistory(history) || (isMasteryHistoryRecord(history) && history.status === 'graduated'))
    .map(history => [history.wordId, history]));
  const scopedWords = words.filter(word => word.bookId === bookId && isWordInStudyRange(word, range));
  let studiedCount = 0;
  let dueCount = 0;
  const now = Date.now();
  for (const word of scopedWords) {
    const history = histories.get(word.id);
    if (!history) continue;
    studiedCount += 1;
    if (isDueMasteryHistory(history, now)) dueCount += 1;
  }
  const longTermReviewAvailableCount = context.getDb
    ? await getLongTermReviewAvailableCount(context, uid, bookId, range) : undefined;
  return { bookId, totalCount: scopedWords.length, studiedCount, newCount: scopedWords.length - studiedCount, dueCount,
    ...(longTermReviewAvailableCount === undefined ? {} : { longTermReviewAvailableCount }) };
};

export const getLongTermReviewAvailableCount = async (
  context: LearningHistoryContext, uid: string, bookId?: string, range?: StudyWordRange,
): Promise<number> => {
  if (!context.getDb) throw new Error('長期復習の保存先を利用できません。');
  return readLocalGraduatedReviewAvailableCount(context.getDb, uid, Date.now(), bookId, normalizeStudyWordRange(range));
};

export const getDueCount = async (context: LearningHistoryContext, uid: string): Promise<number> => {
  const user = await context.getSession();
  if (!user || user.uid !== uid) throw new Error('学習者のセッションを確認してください。');
  const [books, words, records] = await Promise.all([
    context.getBooks(),
    context.getStore(STORES.WORDS).then((store) => requestToPromise(store.getAll() as IDBRequest<WordData[]>)),
    context.getStore(STORES.HISTORY).then((store) => requestToPromise(store.getAll() as IDBRequest<StoredLearningHistoryRecord[]>)),
  ]);
  const bookIds = new Set(getLocalStudyAccessibleBooks(books, user).map((book) => book.id));
  const wordsById = new Map(words.filter((word) => bookIds.has(word.bookId)).map((word) => [word.id, word]));
  const now = Date.now();
  return records.filter((record) => record.id === buildUserScopedRecordId(uid, record.data.wordId)
    && wordsById.get(record.data.wordId)?.bookId === record.data.bookId && isDueMasteryHistory(record.data, now)).length;
};

export const saveSrsHistory = async (
  context: LearningHistoryContext,
  uid: string,
  word: WordData,
  rating: number,
  responseTimeMs = 0,
  missionAssignmentId?: string,
  taskIntentType?: LearningTaskIntentType,
  clientAttemptId?: string,
): Promise<void> => {
  const input = {
    wordId: word.id, bookId: word.bookId, rating, responseTimeMs,
    missionAssignmentId, taskIntentType, clientAttemptId,
  };
  validateStudyAttempt(input);
  if (!uid?.trim()) throw new Error('学習者を指定してください。');
  if (!context.getDb) throw new Error('学習記録の保存先を利用できません。');
  const db = await context.getDb();
  if (!db) throw new Error('学習記録の保存先を利用できません。');
  let book: BookMetadata | undefined;
  const attemptId = clientAttemptId || crypto.randomUUID();
  const receiptId = `study:${JSON.stringify([uid, attemptId])}`;
  const fingerprint = studyAttemptFingerprint(input);
  const transaction = db.transaction([
    STORES.HISTORY, STORES.INTERACTION_EVENTS, STORES.STUDY_ATTEMPT_RECEIPTS,
    STORES.SESSION, STORES.BOOKS, STORES.WORDS,
  ], 'readwrite');
  const complete = waitForTransaction(transaction);
  const historyStore = transaction.objectStore(STORES.HISTORY);
  const eventStore = transaction.objectStore(STORES.INTERACTION_EVENTS);
  const receiptStore = transaction.objectStore(STORES.STUDY_ATTEMPT_RECEIPTS);
  const mutationsQueued = new Promise<void>((resolve, reject) => {
    const fail = (error: unknown) => {
      reject(error);
      try { transaction.abort(); } catch { /* The transaction may already have aborted. */ }
    };
    const queueAuthorizedReceipt = () => {
    const receiptRequest = receiptStore.get(receiptId) as IDBRequest<StoredStudyAttemptReceipt | undefined>;
    receiptRequest.onerror = () => fail(receiptRequest.error || new Error('学習記録の照合に失敗しました。'));
    receiptRequest.onsuccess = () => {
      const receipt = receiptRequest.result;
      if (receipt) {
        if (receipt.fingerprint !== fingerprint) {
          fail(new Error('同じ学習記録に異なる解答が指定されました。'));
        } else {
          resolve();
        }
        return;
      }
      const id = buildUserScopedRecordId(uid, word.id);
      const historyRequest = historyStore.get(id) as IDBRequest<StoredLearningHistoryRecord | undefined>;
      historyRequest.onerror = () => fail(historyRequest.error || new Error('学習履歴の読み込みに失敗しました。'));
      historyRequest.onsuccess = () => {
        try {
          const current = historyRequest.result?.data;
          const now = Math.max(Date.now(), current?.lastStudiedAt || 0);
          const event: WeaknessInteractionEvent = {
            userId: uid,
            wordId: word.id,
            bookId: word.bookId,
            createdAt: now,
            interactionSource: 'STUDY',
            correct: rating >= 2,
            rating,
            responseTimeMs: Math.round(responseTimeMs),
            intervalDaysBefore: current?.interval || 0,
            bookProgressionBand: book ? getBookProgressionIndex(book) : undefined,
            missionAssignmentId: missionAssignmentId || resolveMissionAssignmentId(uid, word.bookId),
            taskIntentType,
          };
          historyStore.put({ id, data: buildSrsHistory(current, input, now) } satisfies StoredLearningHistoryRecord);
          eventStore.add({ id: receiptId, uid, data: event } satisfies StoredInteractionEventRecord);
          receiptStore.add({
            id: receiptId, uid, clientAttemptId: attemptId, fingerprint, committedAt: now,
          } satisfies StoredStudyAttemptReceipt);
          resolve();
        } catch (error) {
          fail(error);
        }
      };
    };
    };
    const authorizationReads = [
      transaction.objectStore(STORES.SESSION).get('current'),
      transaction.objectStore(STORES.BOOKS).get(word.bookId),
      transaction.objectStore(STORES.WORDS).get(word.id),
    ];
    const authorization: unknown[] = [];
    let pendingAuthorization = authorizationReads.length;
    authorizationReads.forEach((request, index) => {
      request.onerror = () => fail(request.error || new Error('学習記録の利用権限を確認できません。'));
      request.onsuccess = () => {
        authorization[index] = request.result;
        if (--pendingAuthorization !== 0) return;
        try {
          const session = authorization[0] as { user?: UserProfile } | undefined;
          const rawBook = authorization[1] as BookMetadata | undefined;
          const actualWord = authorization[2] as WordData | undefined;
          if (session?.user?.uid !== uid) throw new Error('学習者のセッションを確認してください。');
          if (!rawBook || !actualWord || actualWord.id !== word.id || actualWord.bookId !== word.bookId) throw new Error('この単語を利用できません。');
          book = getLocalStudyAccessibleBooks([rawBook], session.user)[0];
          if (!book) throw new Error('この教材を利用できません。');
          queueAuthorizedReceipt();
        } catch (error) { fail(error); }
      };
    });
  });
  await Promise.all([mutationsQueued, complete]);

  // Rebuild from the committed history/events, including on an exact retry.
  // A derived-view failure must never turn a committed answer into another attempt.
  try {
    await rebuildWeaknessSignals(context, uid);
  } catch {
    console.warn('[study] Saved locally; learning trend refresh deferred.');
  }
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
  generatedProblemId?: string,
  grammarScopeId?: GrammarCurriculumScopeId,
  translationFeedback?: JapaneseTranslationFeedback,
  clientAttemptId?: string,
): Promise<QuizAttemptReceipt | null> => {
  const input = {
    wordId, bookId, correct, questionMode, responseTimeMs,
    missionAssignmentId, taskIntentType, generatedProblemId, grammarScopeId,
    translationFeedback, clientAttemptId,
  };
  validateQuizAttempt(input);
  if (typeof uid !== 'string' || !uid.trim()) throw new Error('学習者を指定してください。');
  if (!context.getDb) throw new Error('小テスト記録の保存先を利用できません。');
  const db = await context.getDb();
  if (!db) throw new Error('小テスト記録の保存先を利用できません。');
  // Finish async catalog/hash work before opening a native IDB transaction.
  // These local receipts do not provide server authorization for the supplied uid.
  const [books, fingerprint] = await Promise.all([
    context.getBooks().catch(() => []),
    quizAttemptFingerprint(input),
  ]);
  const book = books.find((candidate) => candidate.id === bookId);
  const attemptId = clientAttemptId || crypto.randomUUID();
  const receiptId = `quiz:${JSON.stringify([uid, attemptId])}`;
  const transaction = db.transaction([
    STORES.HISTORY, STORES.INTERACTION_EVENTS, STORES.QUIZ_ATTEMPT_RECEIPTS,
  ], 'readwrite');
  const complete = waitForTransaction(transaction);
  const historyStore = transaction.objectStore(STORES.HISTORY);
  const eventStore = transaction.objectStore(STORES.INTERACTION_EVENTS);
  const receiptStore = transaction.objectStore(STORES.QUIZ_ATTEMPT_RECEIPTS);
  let committedReceipt: QuizAttemptReceipt | null = null;
  const mutationsQueued = new Promise<void>((resolve, reject) => {
    const fail = (error: unknown) => {
      reject(error);
      try { transaction.abort(); } catch { /* The transaction may already have aborted. */ }
    };
    const receiptRequest = receiptStore.get(receiptId) as IDBRequest<StoredQuizAttemptReceipt | undefined>;
    receiptRequest.onerror = () => fail(receiptRequest.error || new Error('小テスト記録の照合に失敗しました。'));
    receiptRequest.onsuccess = () => {
      const receipt = receiptRequest.result;
      if (receipt) {
        if (receipt.fingerprint !== fingerprint) {
          fail(new Error('同じ小テスト記録に異なる解答が指定されました。'));
        } else {
          committedReceipt = {
            clientAttemptId: receipt.clientAttemptId, wordId: receipt.wordId,
            bookId: receipt.bookId, committedAt: receipt.committedAt, storageMode: 'idb', projectionStatus: 'COMPLETE',
          };
          resolve();
        }
        return;
      }
      const id = buildUserScopedRecordId(uid, wordId);
      const historyRequest = historyStore.get(id) as IDBRequest<StoredLearningHistoryRecord | undefined>;
      historyRequest.onerror = () => fail(historyRequest.error || new Error('学習履歴の読み込みに失敗しました。'));
      historyRequest.onsuccess = () => {
        try {
          const existing = historyRequest.result?.data;
          const now = Math.max(Date.now(), existing?.lastStudiedAt || 0);
          const event: WeaknessInteractionEvent = {
            userId: uid, wordId, bookId, createdAt: now,
            interactionSource: 'QUIZ', questionMode, correct, responseTimeMs,
            intervalDaysBefore: existing?.interval || 0,
            bookProgressionBand: book ? getBookProgressionIndex(book) : undefined,
            missionAssignmentId: missionAssignmentId || resolveMissionAssignmentId(uid, bookId),
            taskIntentType,
          };
          const receipt = {
            clientAttemptId: attemptId, wordId, bookId, committedAt: now, storageMode: 'idb', projectionStatus: 'COMPLETE',
          } satisfies QuizAttemptReceipt;
          historyStore.put({
            id,
            data: buildQuizAttemptHistory({ existing, wordId, bookId, correct, responseTimeMs, now }),
          } satisfies StoredLearningHistoryRecord);
          eventStore.add({ id: receiptId, uid, data: event } satisfies StoredInteractionEventRecord);
          receiptStore.add({ id: receiptId, uid, fingerprint, ...receipt } satisfies StoredQuizAttemptReceipt);
          committedReceipt = receipt;
          resolve();
        } catch (error) {
          fail(error);
        }
      };
    };
  });
  // Request success only queues the writes. A receipt acknowledges transaction commit.
  await Promise.all([mutationsQueued, complete]);
  try {
    await rebuildWeaknessSignals(context, uid);
  } catch {
    if (committedReceipt) committedReceipt.projectionStatus = 'PENDING';
    console.warn('[quiz] Saved locally; learning trend refresh deferred.');
  }
  return clientAttemptId === undefined && committedReceipt?.projectionStatus !== 'PENDING' ? null : committedReceipt;
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
