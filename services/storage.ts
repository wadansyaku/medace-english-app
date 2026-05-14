
import {
  ActivityLog,
  AdminDashboardSnapshot,
  AiGeneratedProblemReviewQueueItem,
  AiGeneratedProblemReviewQueueResponse,
  CommercialRequest,
  CommercialRequestStatus,
  BookAccessScope,
  BookCatalogSource,
  BookMetadata,
  BookProgress,
  ClassroomWorksheetLifecycleEventResult,
  DashboardSnapshot,
  LearningTrack,
  InterventionKind,
  LearningTaskIntent,
  LearningTaskIntentType,
  LeaderboardEntry,
  LearningPlan,
  LearningPreference,
  MasteryDistribution,
  MissionAssignment,
  MissionProgressEventType,
  OrganizationCohort,
  OrganizationDashboardSnapshot,
  OrganizationSettingsSnapshot,
  OrganizationRole,
  ProductAnnouncement,
  ProductAnnouncementFeed,
  RecommendedActionType,
  StudentSummary,
  StudentWorksheetSnapshot,
  SubscriptionPlan,
  UserProfile,
  UserRole,
  WeeklyMission,
  WeeklyMissionBoard,
  WorksheetQuestionMode,
  WordData,
  WordHintAssetType,
  GeneratedAssetAuditStatus,
} from '../types';
import {
  CatalogImportRequest,
  CatalogImportResult,
  AiGeneratedProblemReviewPayload,
  AiGeneratedProblemReviewQueueRequest,
  ClassroomWorksheetLifecycleEventPayload,
  CommercialRequestPayload,
  CommercialRequestUpdatePayload,
  EnglishPracticeAttemptPayload,
  EnglishPracticeAttemptResult,
  GenerateWordHintAssetPayload,
  ProductAnnouncementUpsertPayload,
} from '../contracts/storage';
import { CloudflareStorageService } from './cloudflare';
import { generateGeminiSentence, generateWordImage } from './gemini';
import {
  createLocalExampleHint,
  createWordImagePlaceholderDataUrl,
} from '../shared/wordHintAssets';
import type {
  AdminStorageService,
  AnnouncementStorageService,
  CatalogStorageService,
  CommercialStorageService,
  DashboardStorageService,
  IStorageService,
  LearningStorageService,
  MissionStorageService,
  OrganizationOpsStorageService,
  SessionStorageService,
  StorageClientMap,
} from './storage/types';
import { canAccessOfficialBook, normalizeBookVisibilityPolicy } from '../utils/bookAccess';
import {
  defaultLearningPreference,
  isBookOwnedByUser,
} from './storage/mockData';
import {
  addXP as addXpWithAuthSession,
  authenticate as authenticateWithAuthSession,
  clearSession as clearAuthSession,
  getSession as getAuthSession,
  login as loginWithAuthSession,
  saveSession as saveAuthSession,
  updateSessionUser as updateAuthSessionUser,
  type AuthSessionContext,
} from './storage/auth-session';
import {
  getActivityLogs as getActivityLogsReadModel,
  getAdminDashboardSnapshot as getAdminDashboardSnapshotReadModel,
  getDashboardSnapshot as getDashboardSnapshotReadModel,
  getLeaderboard as getLeaderboardReadModel,
  getMasteryDistribution as getMasteryDistributionReadModel,
  type DashboardReadModelContext,
} from './storage/dashboard-read-model';
import {
  getObjectStore,
  initStorageDb,
  requestToPromise,
  STORES,
  type GetStore,
  waitForTransaction,
} from './storage/idb-support';
import {
  getCommercialRequestStatus as getCommercialRequestStatusIdb,
  listCommercialRequests as listCommercialRequestsIdb,
  submitCommercialRequest as submitCommercialRequestIdb,
  updateCommercialRequest as updateCommercialRequestIdb,
} from './storage/idb-commercial';
import {
  acknowledgeAnnouncement as acknowledgeAnnouncementIdb,
  listProductAnnouncements as listProductAnnouncementsIdb,
  listProductAnnouncementsAdmin as listProductAnnouncementsAdminIdb,
  markAnnouncementSeen as markAnnouncementSeenIdb,
  upsertProductAnnouncement as upsertProductAnnouncementIdb,
} from './storage/idb-announcements';
import {
  getBookProgress as getBookProgressFromHistory,
  getBookSession as getBookSessionFromHistory,
  getDailySessionWords as getDailySessionWordsFromHistory,
  getDueCount as getDueCountFromHistory,
  getStudiedWordIdsByBook as getStudiedWordIdsByBookFromHistory,
  recordQuizAttempt as recordQuizAttemptFromHistory,
  saveSrsHistory as saveSrsHistoryFromHistory,
  type LearningHistoryContext,
} from './storage/learning-history';
import {
  getAllStudentsProgress as getAllStudentsProgressReadModel,
  getOrganizationDashboardSnapshot as getOrganizationDashboardSnapshotReadModel,
  getOrganizationSettingsSnapshot as getOrganizationSettingsSnapshotReadModel,
  getStudentWorksheetSnapshot as getStudentWorksheetSnapshotReadModel,
  sendInstructorNotification as sendInstructorNotificationReadModel,
  setInstructorCohorts as setInstructorCohortsReadModel,
  setStudentCohort as setStudentCohortReadModel,
  upsertOrganizationCohort as upsertOrganizationCohortReadModel,
  updateOrganizationProfile as updateOrganizationProfileReadModel,
  type OrganizationReadModelContext,
} from './storage/organization-read-model';
import {
  assignLocalWeeklyMission,
  createLocalWeeklyMission,
  getLocalPrimaryMissionSnapshot,
  getLocalWeeklyMissionBoard,
  getLocalMissionAssignmentByStudent,
  resetLocalMissionState,
  updateLocalMissionProgress,
} from './storage/missions';
import { getCoachNotifications } from './storage/writing-read-model';
import { resolveStorageMode } from '../shared/storageMode';
import { isWorksheetQuestionMode } from '../shared/worksheetQuestionMode';
import { createImportedBookId, normalizeCatalogImportRows } from './storage/catalog-import';

interface IndexedDBStorageServiceOptions {
  db?: IDBDatabase;
  getStore?: GetStore;
}

export class IndexedDBStorageService implements IStorageService {
  private dbPromise: Promise<IDBDatabase>;
  private readonly getStoreOverride?: GetStore;

  constructor(options: IndexedDBStorageServiceOptions = {}) {
    this.getStoreOverride = options.getStore;
    this.dbPromise = options.db
      ? Promise.resolve(options.db)
      : this.getStoreOverride
      ? Promise.resolve(null as IDBDatabase)
      : this.initDB();
  }

  private initDB(): Promise<IDBDatabase> {
    return initStorageDb();
  }

  private async getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
    if (this.getStoreOverride) {
      return this.getStoreOverride(storeName, mode);
    }
    return getObjectStore(this.dbPromise, storeName, mode);
  }

  private getAuthSessionContext(): AuthSessionContext {
    return {
      getStore: this.getStore.bind(this),
    };
  }

  private getLearningHistoryContext(): LearningHistoryContext {
    return {
      getStore: this.getStore.bind(this),
      getBooks: this.getBooks.bind(this),
      getWordsByBook: this.getWordsByBook.bind(this),
      getSession: this.getSession.bind(this),
    };
  }

  private getDashboardReadModelContext(): DashboardReadModelContext {
    return {
      getStore: this.getStore.bind(this),
      getSession: this.getSession.bind(this),
      getBooks: this.getBooks.bind(this),
      getBookProgress: this.getBookProgress.bind(this),
      getDueCount: this.getDueCount.bind(this),
      getLearningPlan: this.getLearningPlan.bind(this),
      getLearningPreference: this.getLearningPreference.bind(this),
      getAllStudentsProgress: this.getAllStudentsProgress.bind(this),
      getCoachNotifications,
    };
  }

  private getOrganizationReadModelContext(): OrganizationReadModelContext {
    return {
      getStore: this.getStore.bind(this),
      getSession: this.getSession.bind(this),
      getBooks: this.getBooks.bind(this),
      getWordsByBook: this.getWordsByBook.bind(this),
    };
  }

  private getCommercialStorageContext() {
    return {
      getStore: this.getStore.bind(this),
      getSession: this.getSession.bind(this),
      updateSessionUser: this.updateSessionUser.bind(this),
    };
  }

  private getAnnouncementStorageContext() {
    return {
      getStore: this.getStore.bind(this),
      getSession: this.getSession.bind(this),
    };
  }

  async login(role: UserRole, demoPassword?: string, organizationRole?: OrganizationRole): Promise<UserProfile | null> {
    return loginWithAuthSession(this.getAuthSessionContext(), role, demoPassword, organizationRole);
  }

  async authenticate(email: string, password: string, isSignUp: boolean, role?: UserRole, displayName?: string): Promise<UserProfile | null> {
    return authenticateWithAuthSession(this.getAuthSessionContext(), email, password, isSignUp, role, displayName);
  }

  async saveSession(user: UserProfile): Promise<void> {
    return saveAuthSession(this.getAuthSessionContext(), user);
  }

  async updateSessionUser(user: UserProfile): Promise<void> {
    return updateAuthSessionUser(this.getAuthSessionContext(), user);
  }

  async clearSession(): Promise<void> {
    return clearAuthSession(this.getAuthSessionContext());
  }

  async getSession(): Promise<UserProfile | null> {
    return getAuthSession(this.getAuthSessionContext());
  }

  async addXP(user: UserProfile, amount: number): Promise<{ user: UserProfile, leveledUp: boolean }> {
    return addXpWithAuthSession(this.getAuthSessionContext(), user, amount);
  }

  async batchImportWords(
    request: CatalogImportRequest,
    onProgress?: (progress: number) => void,
  ): Promise<CatalogImportResult> {
    const db = await this.dbPromise;
    const bookGroups = new Map<string, { meta: BookMetadata, words: WordData[] }>();
    const { rows, warnings } = normalizeCatalogImportRows(request);
    const total = rows.length;
    const issues = [...warnings];
    let skippedRowCount = 0;

    onProgress?.(5);

    for (let i = 0; i < total; i++) {
      const row = rows[i];
      const bookName = (row.bookName || request.defaultBookName || 'Imported').trim();
      const groupKey = `${request.createdByUid || 'official'}:${bookName}`;
      const word = row.word.trim();
      const definition = row.definition.trim();
      const parsedNumber = Number.parseInt(String(row.number || i + 1), 10);
      const number = Number.isFinite(parsedNumber) && parsedNumber > 0 ? parsedNumber : i + 1;

      if (!word) {
        skippedRowCount += 1;
        issues.push({ code: 'EMPTY_WORD', message: '単語が空の行をスキップしました。', rowNumber: i + 2 });
        continue;
      }
      if (!definition) {
        skippedRowCount += 1;
        issues.push({ code: 'EMPTY_DEFINITION', message: '訳が空の行をスキップしました。', rowNumber: i + 2 });
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
        issues.push({ code: 'DUPLICATE_ROW', message: '重複行をスキップしました。', rowNumber: i + 2 });
        continue;
      }

      bookGroup.words.push({
        id: `${bookGroup.meta.id}_${number}_${i}`,
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

      if (i % 250 === 0) {
        onProgress?.(Math.round((i / Math.max(total, 1)) * 90));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    const tx = db.transaction([STORES.BOOKS, STORES.WORDS], 'readwrite');
    const importedBookIds: string[] = [];
    let importedWordCount = 0;

    for (const [, data] of bookGroups) {
      data.meta.wordCount = data.words.length;
      importedBookIds.push(data.meta.id);
      importedWordCount += data.words.length;
      tx.objectStore(STORES.BOOKS).put(data.meta);
      data.words.forEach((word) => tx.objectStore(STORES.WORDS).put(word));
    }

    return new Promise((resolve) => {
      tx.oncomplete = () => {
        onProgress?.(100);
        resolve({
          importedBookIds,
          importedBookCount: importedBookIds.length,
          importedWordCount,
          skippedRowCount,
          warnings: issues,
        });
      };
    });
  }

  async getBooks(): Promise<BookMetadata[]> {
    const sessionUser = await this.getSession();
    const store = await this.getStore(STORES.BOOKS);
    return new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const books = ((request.result || []) as BookMetadata[]).map(normalizeBookVisibilityPolicy);
        resolve(
          books.filter((book) =>
            isBookOwnedByUser(book, sessionUser?.uid) ||
            canAccessOfficialBook(sessionUser?.subscriptionPlan, book)
          )
        );
      };
    });
  }
  
  async deleteBook(bookId: string): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction([STORES.BOOKS, STORES.WORDS, STORES.HISTORY], 'readwrite');
    
    tx.objectStore(STORES.BOOKS).delete(bookId);
    const wordsStore = tx.objectStore(STORES.WORDS);
    const index = wordsStore.index('bookId');
    const wordReq = index.getAllKeys(bookId);
    
    wordReq.onsuccess = () => {
        const keys = wordReq.result;
        keys.forEach(k => wordsStore.delete(k));
    };
    return new Promise(r => { tx.oncomplete = () => r(); });
  }

  async getWordsByBook(bookId: string): Promise<WordData[]> {
    const store = await this.getStore(STORES.WORDS);
    const index = store.index('bookId');
    return new Promise((resolve) => {
      const request = index.getAll(bookId);
      request.onsuccess = () => resolve((request.result || []).sort((a:any, b:any) => a.number - b.number));
    });
  }
  
  async updateWord(word: WordData): Promise<void> {
    const store = await this.getStore(STORES.WORDS, 'readwrite');
    return new Promise((resolve) => {
        store.put(word);
        resolve();
    });
  }

  async reportWord(wordId: string, reason: string): Promise<void> {
      const store = await this.getStore(STORES.WORDS, 'readwrite');
      return new Promise((resolve) => {
          const req = store.get(wordId);
          req.onsuccess = () => {
              const word = req.result;
              if (word) {
                  word.isReported = true;
                  // In real app, would save 'reason' to a reports table
                  store.put(word);
              }
              resolve();
          }
      });
  }

  async updateWordCache(wordId: string, sentence: string, translation: string): Promise<void> {
    const store = await this.getStore(STORES.WORDS, 'readwrite');
    return new Promise((resolve) => {
      const req = store.get(wordId);
      req.onsuccess = () => {
        const word = req.result;
        if (word) {
          word.exampleSentence = sentence;
          word.exampleMeaning = translation;
          word.exampleGeneratedAt = Date.now();
          word.exampleAuditStatus = GeneratedAssetAuditStatus.PENDING;
          store.put(word);
        }
        resolve();
      };
      req.onerror = () => resolve();
    });
  }

  private async readWordRecord(wordId: string): Promise<WordData | undefined> {
    const store = await this.getStore(STORES.WORDS, 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(wordId);
      req.onsuccess = () => resolve(req.result as WordData | undefined);
      req.onerror = () => reject(req.error || new Error('単語キャッシュの読み込みに失敗しました。'));
    });
  }

  private async writeWordRecord(word: WordData): Promise<void> {
    const store = await this.getStore(STORES.WORDS, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(word);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('単語キャッシュの保存に失敗しました。'));
    });
  }

  async generateWordHintAsset(payload: GenerateWordHintAssetPayload): Promise<WordData> {
    const word = await this.readWordRecord(payload.wordId);
    if (!word) {
      throw new Error('対象の単語が見つかりません。');
    }

    const nextWord: WordData = { ...word };
    if (payload.assetType === WordHintAssetType.EXAMPLE) {
      if (!payload.forceRefresh && nextWord.exampleSentence?.trim()) {
        return nextWord;
      }

      const generatedAt = Date.now();
      const context = await generateGeminiSentence(nextWord.word, nextWord.definition)
        || createLocalExampleHint(nextWord.word, nextWord.definition, generatedAt);
      const nextSentence = 'english' in context ? context.english : context.sentence;
      const nextTranslation = 'japanese' in context ? context.japanese : context.translation;

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

    await this.writeWordRecord(nextWord);
    return nextWord;
  }

  async prepareBookExamples(bookId: string): Promise<import('../contracts/storage').PrepareBookExamplesResult> {
    const store = await this.getStore(STORES.WORDS, 'readwrite');
    const words = await this.getWordsByBook(bookId);
    const targetWords = words.filter((word) => !word.exampleSentence?.trim());

    await Promise.all(targetWords.map((word) => new Promise<void>((resolve) => {
      const req = store.get(word.id);
      req.onsuccess = () => {
        const current = req.result as WordData | undefined;
        if (current) {
          current.exampleSentence = current.exampleSentence?.trim() || `We study "${current.word}" in today's lesson.`;
          current.exampleMeaning = current.exampleMeaning?.trim() || `語義: ${current.definition}`;
          current.exampleGeneratedAt = Date.now();
          current.exampleAuditStatus = GeneratedAssetAuditStatus.PENDING;
          store.put(current);
        }
        resolve();
      };
      req.onerror = () => resolve();
    })));

    return {
      bookId,
      preparedCount: targetWords.length,
      remainingCount: 0,
    };
  }

  async getDailySessionWords(uid: string, limit: number, taskIntent?: LearningTaskIntent): Promise<WordData[]> {
    return getDailySessionWordsFromHistory(this.getLearningHistoryContext(), uid, limit, taskIntent);
  }

  async getBookSession(uid: string, bookId: string, limit: number, taskIntent?: LearningTaskIntent): Promise<WordData[]> {
    return getBookSessionFromHistory(this.getLearningHistoryContext(), uid, bookId, limit, taskIntent);
  }

  async getDueCount(uid: string): Promise<number> {
    return getDueCountFromHistory(this.getLearningHistoryContext(), uid);
  }

  async saveSRSHistory(
    uid: string,
    word: WordData,
    rating: number,
    responseTimeMs = 0,
    missionAssignmentId?: string,
    taskIntentType?: LearningTaskIntentType,
  ): Promise<void> {
    return saveSrsHistoryFromHistory(
      this.getLearningHistoryContext(),
      uid,
      word,
      rating,
      responseTimeMs,
      missionAssignmentId,
      taskIntentType,
    );
  }

  async recordQuizAttempt(
    uid: string,
    wordId: string,
    bookId: string,
    correct: boolean,
    questionMode: WorksheetQuestionMode,
    responseTimeMs = 0,
    missionAssignmentId?: string,
    taskIntentType?: LearningTaskIntentType,
    generatedProblemId?: string,
    grammarScopeId?: import('../types').GrammarCurriculumScopeId,
    translationFeedback?: import('../types').JapaneseTranslationFeedback,
  ): Promise<void> {
    return recordQuizAttemptFromHistory(
      this.getLearningHistoryContext(),
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
    );
  }

  async recordEnglishPracticeAttempt(
    uid: string,
    payload: EnglishPracticeAttemptPayload,
  ): Promise<EnglishPracticeAttemptResult> {
    const delegatedQuizAttempt = Boolean(
      payload.wordId
      && payload.bookId
      && isWorksheetQuestionMode(payload.mode)
      && ['GRAMMAR_CLOZE', 'EN_WORD_ORDER', 'JA_TRANSLATION_INPUT', 'JA_TRANSLATION_ORDER'].includes(payload.mode),
    );
    if (delegatedQuizAttempt) {
      await this.recordQuizAttempt(
        uid,
        payload.wordId!,
        payload.bookId!,
        payload.correct,
        payload.mode as WorksheetQuestionMode,
        payload.responseTimeMs || 0,
        undefined,
        undefined,
        payload.generatedProblemId,
        payload.grammarScopeId,
        payload.translationFeedback,
      );
    }
    return {
      id: payload.clientAttemptId,
      deduplicated: false,
      delegatedQuizAttempt,
    };
  }

  async listAiGeneratedProblemReviewQueue(
    _payload: AiGeneratedProblemReviewQueueRequest = {},
  ): Promise<AiGeneratedProblemReviewQueueResponse> {
    return { items: [] };
  }

  async reviewAiGeneratedProblem(
    _payload: AiGeneratedProblemReviewPayload,
  ): Promise<AiGeneratedProblemReviewQueueItem> {
    throw new Error('AI生成問題レビューはクラウド保存でのみ利用できます。');
  }

  async getStudiedWordIdsByBook(uid: string, bookId: string): Promise<string[]> {
    return getStudiedWordIdsByBookFromHistory(this.getLearningHistoryContext(), uid, bookId);
  }

  async getBookProgress(uid: string, bookId: string): Promise<BookProgress> {
    return getBookProgressFromHistory(this.getLearningHistoryContext(), uid, bookId);
  }

  async getAllStudentsProgress(): Promise<StudentSummary[]> {
    return getAllStudentsProgressReadModel(this.getOrganizationReadModelContext());
  }

  async getStudentWorksheetSnapshot(studentUid: string): Promise<StudentWorksheetSnapshot> {
    return getStudentWorksheetSnapshotReadModel(this.getOrganizationReadModelContext(), studentUid);
  }

  async recordClassroomWorksheetLifecycleEvent(
    payload: ClassroomWorksheetLifecycleEventPayload,
  ): Promise<ClassroomWorksheetLifecycleEventResult> {
    return {
      runId: 'local-classroom-run',
      eventId: `local-classroom-event-${Date.now()}`,
      worksheetEventId: `local-worksheet-event-${Date.now()}`,
      worksheetSource: payload.worksheetSource,
      lifecycleStatus: payload.lifecycleStatus,
      occurredAt: payload.occurredAt || Date.now(),
    };
  }

  async sendInstructorNotification(
    studentUid: string,
    message: string,
    triggerReason: string,
    usedAi: boolean,
    interventionKind: InterventionKind,
    recommendedActionType?: RecommendedActionType,
  ): Promise<void> {
    return sendInstructorNotificationReadModel(
      this.getOrganizationReadModelContext(),
      studentUid,
      message,
      triggerReason,
      usedAi,
      interventionKind,
      recommendedActionType,
    );
  }

  async resetAllData(): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction(
      [
        STORES.BOOKS,
        STORES.WORDS,
        STORES.HISTORY,
        STORES.SESSION,
        STORES.PLANS,
        STORES.PREFERENCES,
        STORES.ASSIGNMENTS,
        STORES.INTERACTION_EVENTS,
        STORES.WEAKNESS_SIGNALS,
        STORES.COMMERCIAL_REQUESTS,
        STORES.PRODUCT_ANNOUNCEMENTS,
        STORES.ANNOUNCEMENT_RECEIPTS,
      ],
      'readwrite',
    );
    tx.objectStore(STORES.BOOKS).clear();
    tx.objectStore(STORES.WORDS).clear();
    tx.objectStore(STORES.HISTORY).clear();
    tx.objectStore(STORES.SESSION).clear();
    tx.objectStore(STORES.PLANS).clear();
    tx.objectStore(STORES.PREFERENCES).clear();
    tx.objectStore(STORES.ASSIGNMENTS).clear();
    tx.objectStore(STORES.INTERACTION_EVENTS).clear();
    tx.objectStore(STORES.WEAKNESS_SIGNALS).clear();
    tx.objectStore(STORES.COMMERCIAL_REQUESTS).clear();
    tx.objectStore(STORES.PRODUCT_ANNOUNCEMENTS).clear();
    tx.objectStore(STORES.ANNOUNCEMENT_RECEIPTS).clear();
    await waitForTransaction(tx);
    resetLocalMissionState();
  }

  async saveLearningPlan(plan: LearningPlan): Promise<void> {
      const store = await this.getStore(STORES.PLANS, 'readwrite');
      store.put(plan);
  }

  async getLearningPlan(uid: string): Promise<LearningPlan | null> {
      const store = await this.getStore(STORES.PLANS);
      return new Promise((resolve) => {
          const req = store.get(uid);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
      });
  }

  async saveLearningPreference(preference: LearningPreference): Promise<void> {
      const store = await this.getStore(STORES.PREFERENCES, 'readwrite');
      store.put({ ...preference, updatedAt: Date.now() });
  }

  async getLearningPreference(uid: string): Promise<LearningPreference | null> {
      const store = await this.getStore(STORES.PREFERENCES);
      return new Promise((resolve) => {
          const req = store.get(uid);
          req.onsuccess = () => resolve(req.result || defaultLearningPreference(uid));
          req.onerror = () => resolve(defaultLearningPreference(uid));
      });
  }

  async assignStudentInstructor(studentUid: string, instructorUid: string | null): Promise<void> {
      const store = await this.getStore(STORES.ASSIGNMENTS, 'readwrite');
      if (!instructorUid) {
          store.delete(studentUid);
          return;
      }
      store.put({ studentUid, instructorUid });
  }

  async createWeeklyMission(payload: {
    learningTrack: LearningTrack;
    title?: string;
    rationale?: string;
    bookId?: string;
    bookTitle?: string;
    newWordsTarget: number;
    reviewWordsTarget: number;
    quizTargetCount: number;
    writingAssignmentId?: string;
    dueAt?: number;
  }): Promise<WeeklyMission> {
    const sessionUser = await this.getSession();
    if (!sessionUser) {
      throw new Error('ログインが必要です。');
    }
    return createLocalWeeklyMission(sessionUser, payload);
  }

  async assignWeeklyMission(missionId: string, studentUid: string): Promise<MissionAssignment> {
    const sessionUser = await this.getSession();
    if (!sessionUser) {
      throw new Error('ログインが必要です。');
    }
    const student = (await this.getAllStudentsProgress()).find((candidate) => candidate.uid === studentUid);
    return assignLocalWeeklyMission(sessionUser, missionId, studentUid, student?.name);
  }

  async getWeeklyMissionBoard(): Promise<WeeklyMissionBoard> {
    return getLocalWeeklyMissionBoard(await this.getSession());
  }

  async updateMissionProgress(assignmentId: string, eventType: MissionProgressEventType): Promise<MissionAssignment> {
    const sessionUser = await this.getSession();
    if (!sessionUser) {
      throw new Error('ログインが必要です。');
    }
    return updateLocalMissionProgress(sessionUser, assignmentId, eventType);
  }

  async getDashboardSnapshot(uid: string): Promise<DashboardSnapshot> {
    const snapshot = await getDashboardSnapshotReadModel(this.getDashboardReadModelContext(), uid);
    const commercialRequests = await this.getCommercialRequestStatus();
    const sessionUser = await this.getSession();
    const primaryMission = sessionUser
      ? getLocalPrimaryMissionSnapshot({
          user: sessionUser,
          books: [...snapshot.officialBooks, ...snapshot.myBooks],
          learningPlan: snapshot.learningPlan,
          learningPreference: snapshot.learningPreference,
        })
      : null;
    return {
      ...snapshot,
      primaryMission,
      commercialRequests,
    };
  }

  async getAdminDashboardSnapshot(): Promise<AdminDashboardSnapshot> {
    return getAdminDashboardSnapshotReadModel(this.getDashboardReadModelContext());
  }

  async getOrganizationDashboardSnapshot(): Promise<OrganizationDashboardSnapshot> {
    return getOrganizationDashboardSnapshotReadModel(this.getOrganizationReadModelContext());
  }

  async getOrganizationSettingsSnapshot(): Promise<OrganizationSettingsSnapshot> {
    return getOrganizationSettingsSnapshotReadModel(this.getOrganizationReadModelContext());
  }

  async getLeaderboard(currentUid: string): Promise<LeaderboardEntry[]> {
    return getLeaderboardReadModel(this.getDashboardReadModelContext(), currentUid);
  }

  async getMasteryDistribution(uid: string): Promise<MasteryDistribution> {
    return getMasteryDistributionReadModel(this.getDashboardReadModelContext(), uid);
  }

  async getActivityLogs(uid: string): Promise<ActivityLog[]> {
    return getActivityLogsReadModel(this.getDashboardReadModelContext(), uid);
  }

  async getCommercialRequestStatus(): Promise<CommercialRequest[]> {
    return getCommercialRequestStatusIdb(this.getCommercialStorageContext());
  }

  async submitCommercialRequest(payload: CommercialRequestPayload): Promise<CommercialRequest> {
    return submitCommercialRequestIdb(this.getCommercialStorageContext(), payload);
  }

  async updateOrganizationProfile(displayName: string): Promise<OrganizationSettingsSnapshot> {
    const snapshot = await updateOrganizationProfileReadModel(this.getOrganizationReadModelContext(), displayName);
    const sessionUser = await this.getSession();
    if (sessionUser?.organizationId === snapshot.organizationId) {
      await this.updateSessionUser({
        ...sessionUser,
        organizationId: snapshot.organizationId,
        organizationName: snapshot.displayName,
        subscriptionPlan: snapshot.subscriptionPlan,
      });
    }
    return snapshot;
  }

  async upsertOrganizationCohort(cohortId: string | undefined, name: string): Promise<OrganizationCohort> {
    return upsertOrganizationCohortReadModel(this.getOrganizationReadModelContext(), cohortId, name);
  }

  async setStudentCohort(studentUid: string, cohortId: string | null): Promise<void> {
    await setStudentCohortReadModel(this.getOrganizationReadModelContext(), studentUid, cohortId);
  }

  async setInstructorCohorts(instructorUid: string, cohortIds: string[]): Promise<void> {
    await setInstructorCohortsReadModel(this.getOrganizationReadModelContext(), instructorUid, cohortIds);
  }

  async listProductAnnouncements(): Promise<ProductAnnouncementFeed> {
    return listProductAnnouncementsIdb(this.getAnnouncementStorageContext());
  }

  async markAnnouncementSeen(announcementId: string): Promise<void> {
    return markAnnouncementSeenIdb(this.getAnnouncementStorageContext(), announcementId);
  }

  async acknowledgeAnnouncement(announcementId: string): Promise<void> {
    return acknowledgeAnnouncementIdb(this.getAnnouncementStorageContext(), announcementId);
  }

  async listCommercialRequests(): Promise<CommercialRequest[]> {
    return listCommercialRequestsIdb(this.getCommercialStorageContext());
  }

  async updateCommercialRequest(payload: CommercialRequestUpdatePayload): Promise<CommercialRequest> {
    return updateCommercialRequestIdb(this.getCommercialStorageContext(), payload);
  }

  async listProductAnnouncementsAdmin(): Promise<ProductAnnouncement[]> {
    return listProductAnnouncementsAdminIdb(this.getAnnouncementStorageContext());
  }

  async upsertProductAnnouncement(payload: ProductAnnouncementUpsertPayload): Promise<ProductAnnouncement> {
    return upsertProductAnnouncementIdb(this.getAnnouncementStorageContext(), payload);
  }
}

export type {
  AdminClient,
  AdminStorageService,
  AnnouncementClient,
  AnnouncementStorageService,
  CatalogClient,
  CatalogStorageService,
  CommercialClient,
  CommercialStorageService,
  DashboardClient,
  DashboardStorageService,
  IStorageService,
  LearningClient,
  LearningStorageService,
  MissionClient,
  MissionStorageService,
  OrganizationClient,
  OrganizationOpsStorageService,
  SessionClient,
  SessionStorageService,
  StorageClientMap,
} from './storage/types';

export const storageModeSummary = resolveStorageMode(import.meta.env.VITE_STORAGE_MODE);

const USE_REMOTE_STORAGE = storageModeSummary.mode === 'cloudflare';

export const storage: IStorageService = USE_REMOTE_STORAGE
    ? new CloudflareStorageService()
    : new IndexedDBStorageService();

export const sessionStorage: SessionStorageService = storage;
export const catalogStorage: CatalogStorageService = storage;
export const learningStorage: LearningStorageService = storage;
export const dashboardStorage: DashboardStorageService = storage;
export const organizationOpsStorage: OrganizationOpsStorageService = storage;
export const missionStorage: MissionStorageService = storage;
export const commercialStorage: CommercialStorageService = storage;
export const announcementStorage: AnnouncementStorageService = storage;
export const adminStorage: AdminStorageService = storage;

export const storageClients: StorageClientMap = {
  announcements: announcementStorage,
  catalog: catalogStorage,
  commercial: commercialStorage,
  dashboard: dashboardStorage,
  learning: learningStorage,
  missions: missionStorage,
  organization: organizationOpsStorage,
  session: sessionStorage,
};
