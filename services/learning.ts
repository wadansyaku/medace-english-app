import { storage, type IStorageService } from './storage';

export type LearningService = Pick<IStorageService,
  | 'addXP'
  | 'getBookSession'
  | 'getBooks'
  | 'getDailySessionWords'
  | 'getDashboardSnapshot'
  | 'getStudiedWordIdsByBook'
  | 'getWordsByBook'
  | 'recordQuizAttempt'
  | 'reportWord'
  | 'saveSRSHistory'
  | 'updateWord'
  | 'updateWordCache'
>;

export const learningService: LearningService = {
  addXP: (user, amount) => storage.addXP(user, amount),
  getBookSession: (uid, bookId, limit, taskIntent) => storage.getBookSession(uid, bookId, limit, taskIntent),
  getBooks: () => storage.getBooks(),
  getDailySessionWords: (uid, limit, taskIntent) => storage.getDailySessionWords(uid, limit, taskIntent),
  getDashboardSnapshot: (uid) => storage.getDashboardSnapshot(uid),
  getStudiedWordIdsByBook: (uid, bookId) => storage.getStudiedWordIdsByBook(uid, bookId),
  getWordsByBook: (bookId) => storage.getWordsByBook(bookId),
  recordQuizAttempt: (
    uid,
    wordId,
    bookId,
    correct,
    questionMode,
    responseTimeMs,
    missionAssignmentId,
    taskIntentType,
  ) => storage.recordQuizAttempt(
    uid,
    wordId,
    bookId,
    correct,
    questionMode,
    responseTimeMs,
    missionAssignmentId,
    taskIntentType,
  ),
  reportWord: (wordId, reason) => storage.reportWord(wordId, reason),
  saveSRSHistory: (uid, word, rating, responseTimeMs, missionAssignmentId, taskIntentType) => (
    storage.saveSRSHistory(uid, word, rating, responseTimeMs, missionAssignmentId, taskIntentType)
  ),
  updateWord: (word) => storage.updateWord(word),
  updateWordCache: (wordId, sentence, translation) => storage.updateWordCache(wordId, sentence, translation),
};

export default learningService;
