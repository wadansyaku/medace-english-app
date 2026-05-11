import { learningClient, catalogClient, dashboardClient, sessionClient, type LearningClient, type CatalogClient, type DashboardClient, type SessionClient } from './clients';

type LearningSurface = Pick<LearningClient,
  | 'getBookSession'
  | 'getDailySessionWords'
  | 'getStudiedWordIdsByBook'
  | 'listAiGeneratedProblemReviewQueue'
  | 'recordQuizAttempt'
  | 'reviewAiGeneratedProblem'
  | 'saveSRSHistory'
>;

type LearningCatalogSurface = Pick<CatalogClient,
  | 'getBooks'
  | 'getWordsByBook'
  | 'reportWord'
  | 'updateWord'
  | 'updateWordCache'
  | 'generateWordHintAsset'
>;

type LearningDashboardSurface = Pick<DashboardClient, 'getDashboardSnapshot'>;
type LearningSessionSurface = Pick<SessionClient, 'addXP'>;

export type LearningService =
  & LearningSurface
  & LearningCatalogSurface
  & LearningDashboardSurface
  & LearningSessionSurface;

export const learningService: LearningService = {
  addXP: (user, amount) => sessionClient.addXP(user, amount),
  getBookSession: (uid, bookId, limit, taskIntent) => learningClient.getBookSession(uid, bookId, limit, taskIntent),
  getBooks: () => catalogClient.getBooks(),
  getDailySessionWords: (uid, limit, taskIntent) => learningClient.getDailySessionWords(uid, limit, taskIntent),
  getDashboardSnapshot: (uid) => dashboardClient.getDashboardSnapshot(uid),
  getStudiedWordIdsByBook: (uid, bookId) => learningClient.getStudiedWordIdsByBook(uid, bookId),
  listAiGeneratedProblemReviewQueue: (payload) => learningClient.listAiGeneratedProblemReviewQueue(payload),
  getWordsByBook: (bookId) => catalogClient.getWordsByBook(bookId),
  recordQuizAttempt: (
    uid,
    wordId,
    bookId,
    correct,
    questionMode,
    responseTimeMs,
    missionAssignmentId,
    taskIntentType,
    generatedProblemId,
    grammarScopeId,
    translationFeedback,
  ) => learningClient.recordQuizAttempt(
    uid,
    wordId,
    bookId,
    correct,
    questionMode,
    responseTimeMs,
    missionAssignmentId,
    taskIntentType,
    generatedProblemId,
    grammarScopeId,
    translationFeedback,
  ),
  reviewAiGeneratedProblem: (payload) => learningClient.reviewAiGeneratedProblem(payload),
  reportWord: (wordId, reason) => catalogClient.reportWord(wordId, reason),
  saveSRSHistory: (uid, word, rating, responseTimeMs, missionAssignmentId, taskIntentType) => (
    learningClient.saveSRSHistory(uid, word, rating, responseTimeMs, missionAssignmentId, taskIntentType)
  ),
  generateWordHintAsset: (payload) => catalogClient.generateWordHintAsset(payload),
  updateWord: (word) => catalogClient.updateWord(word),
  updateWordCache: (wordId, sentence, translation) => catalogClient.updateWordCache(wordId, sentence, translation),
};

export default learningService;
