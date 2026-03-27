
import {
  ActivityLog,
  AdminDashboardSnapshot,
  CommercialRequest,
  CommercialRequestStatus,
  BookAccessScope,
  BookCatalogSource,
  BookMetadata,
  BookProgress,
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
  WordData,
} from '../types';
import {
  CatalogImportIssue,
  CatalogImportRequest,
  CatalogImportRow,
  CatalogImportResult,
  CommercialRequestPayload,
  CommercialRequestUpdatePayload,
  ProductAnnouncementUpsertPayload,
} from '../contracts/storage';
import { CloudflareStorageService } from './cloudflare';
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
import { buildAnnouncementFeed, getEffectiveAudienceRole, isAnnouncementVisibleToUser } from '../shared/announcements';
import { hasDuplicateOpenRequest } from '../shared/commercial';
import { canAccessOfficialBook, normalizeBookVisibilityPolicy } from '../utils/bookAccess';
import {
  defaultLearningPreference,
  IDB_MOCK_COMMERCIAL_REQUESTS,
  IDB_MOCK_PRODUCT_ANNOUNCEMENTS,
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
  readAllStoreRecords,
  readStoreRecord,
  requestToPromise,
  STORES,
  type StoredAnnouncementReceiptRecord,
  type StoredCommercialRequestRecord,
  type StoredProductAnnouncementRecord,
  waitForTransaction,
} from './storage/idb-support';
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

const slugifySegment = (value: string): string => value
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
  .replace(/^-+|-+$/g, '')
  .replace(/-{2,}/g, '-')
  .slice(0, 48);

const hashString = (value: string): string => {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const createLocalOrganizationId = (displayName: string): string => {
  const slug = slugifySegment(displayName) || 'organization';
  return `org_local_${slug}_${hashString(displayName)}`;
};

const createBookId = (bookName: string, createdByUid?: string, uniqueSalt?: string): string => {
  const slug = slugifySegment(bookName) || 'book';
  const ownerSegment = createdByUid ? `${createdByUid.slice(0, 8)}-` : '';
  const suffixBase = `${createdByUid || 'official'}:${bookName}:${uniqueSalt || ''}`;
  const suffix = hashString(suffixBase);
  return `${ownerSegment}${slug}-${suffix}`;
};

const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  cells.push(current);
  return cells;
};

const normalizeCatalogImportRows = (
  request: CatalogImportRequest,
): { rows: CatalogImportRow[]; warnings: CatalogImportIssue[] } => {
  if (request.source.kind === 'rows') {
    return {
      rows: request.source.rows,
      warnings: [],
    };
  }

  const csvText = request.source.csvText.replace(/^\uFEFF/, '');
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return {
      rows: [],
      warnings: [{ code: 'EMPTY_PAYLOAD', message: 'CSV に有効な行がありません。' }],
    };
  }

  const headers = parseCsvLine(lines[0]).map((cell) => cell.trim());
  const headerLookup = new Map(headers.map((header, index) => [header.toLowerCase(), index]));
  const bookIndex = headerLookup.get('bookname') ?? headerLookup.get('book_name') ?? 0;
  const numberIndex = headerLookup.get('number') ?? 1;
  const wordIndex = headerLookup.get('word') ?? 2;
  const definitionIndex = headerLookup.get('meaning') ?? headerLookup.get('definition') ?? 3;

  if (wordIndex === undefined || definitionIndex === undefined) {
    return {
      rows: [],
      warnings: [{
        code: 'MISSING_REQUIRED_COLUMNS',
        message: 'CSV は Word / Meaning 列を含む必要があります。',
      }],
    };
  }

  return {
    rows: lines.slice(1).map((line) => {
      const cells = parseCsvLine(line);
      return {
        bookName: cells[bookIndex] || request.defaultBookName,
        number: cells[numberIndex] || '',
        word: cells[wordIndex] || '',
        definition: cells[definitionIndex] || '',
      };
    }),
    warnings: [],
  };
};

const mergeRecordsById = <T extends { id: string | number }>(seed: T[], stored: T[]): T[] => {
  const merged = new Map<string, T>();
  seed.forEach((record) => merged.set(String(record.id), record));
  stored.forEach((record) => merged.set(String(record.id), record));
  return [...merged.values()];
};

const buildAnnouncementReceiptId = (announcementId: string, userUid: string): string => `${announcementId}:${userUid}`;

class IndexedDBStorageService implements IStorageService {
  private dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = this.initDB();
  }

  private initDB(): Promise<IDBDatabase> {
    return initStorageDb();
  }

  private async getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
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

  private async getStoredCommercialRequests(): Promise<CommercialRequest[]> {
    const store = await this.getStore(STORES.COMMERCIAL_REQUESTS);
    const stored = await readAllStoreRecords<StoredCommercialRequestRecord>(store);
    return mergeRecordsById(IDB_MOCK_COMMERCIAL_REQUESTS, stored)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  private async getStoredAnnouncements(): Promise<ProductAnnouncement[]> {
    const store = await this.getStore(STORES.PRODUCT_ANNOUNCEMENTS);
    const stored = await readAllStoreRecords<StoredProductAnnouncementRecord>(store);
    return mergeRecordsById(IDB_MOCK_PRODUCT_ANNOUNCEMENTS, stored)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  private async getStoredAnnouncementReceipts(userUid: string): Promise<StoredAnnouncementReceiptRecord[]> {
    const store = await this.getStore(STORES.ANNOUNCEMENT_RECEIPTS);
    const receipts = await readAllStoreRecords<StoredAnnouncementReceiptRecord>(store);
    return receipts.filter((receipt) => receipt.userUid === userUid);
  }

  private async getNextCommercialRequestId(): Promise<number> {
    const requests = await this.getStoredCommercialRequests();
    return requests.reduce((maxId, request) => Math.max(maxId, Number(request.id || 0)), 100) + 1;
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
        const bookId = createBookId(bookName, request.createdByUid, request.createdByUid ? String(Date.now()) : undefined);
        const description = request.createdByUid
          ? JSON.stringify({ createdBy: request.createdByUid, type: 'USER_GENERATED' })
          : 'Imported';

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
          store.put(word);
        }
        resolve();
      };
      req.onerror = () => resolve();
    });
  }

  async prepareBookExamples(bookId: string): Promise<import('../contracts/storage').PrepareBookExamplesResult> {
    const store = await this.getStore(STORES.WORDS, 'readwrite');
    const words = await this.getWordsByBook(bookId);
    const targetWords = words.filter((word) => !word.exampleSentence?.trim() || !word.exampleMeaning?.trim());

    await Promise.all(targetWords.map((word) => new Promise<void>((resolve) => {
      const req = store.get(word.id);
      req.onsuccess = () => {
        const current = req.result as WordData | undefined;
        if (current) {
          current.exampleSentence = current.exampleSentence?.trim() || `We study "${current.word}" in today's lesson.`;
          current.exampleMeaning = current.exampleMeaning?.trim() || `今日の授業で「${current.word}」を学びます。`;
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
    questionMode: 'EN_TO_JA' | 'JA_TO_EN' | 'SPELLING_HINT',
    responseTimeMs = 0,
    missionAssignmentId?: string,
    taskIntentType?: LearningTaskIntentType,
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
    );
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
    const sessionUser = await this.getSession();
    if (!sessionUser) return [];
    const normalizedEmail = sessionUser.email.trim().toLowerCase();
    const requests = await this.getStoredCommercialRequests();
    return requests.filter((request) => (
      request.requestedByUid === sessionUser.uid
      || request.contactEmail.trim().toLowerCase() === normalizedEmail
    ));
  }

  async submitCommercialRequest(payload: CommercialRequestPayload): Promise<CommercialRequest> {
    const sessionUser = await this.getSession();
    if (!sessionUser) {
      throw new Error('ログイン後に申請してください。');
    }

    const existing = await this.getStoredCommercialRequests();
    if (hasDuplicateOpenRequest(existing, payload.contactEmail, payload.kind, sessionUser.uid)) {
      throw new Error('進行中の申請があるため、新しい申請は作成できません。');
    }

    const nextRequestId = await this.getNextCommercialRequestId();
    const store = await this.getStore(STORES.COMMERCIAL_REQUESTS, 'readwrite');
    const nextRequest: CommercialRequest = {
      id: nextRequestId,
      kind: payload.kind,
      status: CommercialRequestStatus.OPEN,
      contactName: payload.contactName.trim(),
      contactEmail: payload.contactEmail.trim().toLowerCase(),
      organizationName: payload.organizationName?.trim() || undefined,
      teachingFormat: payload.teachingFormat,
      desiredStartTiming: payload.desiredStartTiming?.trim() || undefined,
      requestedWorkspaceRole: payload.requestedWorkspaceRole,
      seatEstimate: payload.seatEstimate?.trim() || undefined,
      message: payload.message.trim(),
      source: payload.source,
      requestedByUid: sessionUser.uid,
      linkedUserUid: sessionUser.uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await requestToPromise(store.put(nextRequest));
    return nextRequest;
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
    const sessionUser = await this.getSession();
    if (!sessionUser) {
      return buildAnnouncementFeed([]);
    }
    const announcements = await this.getStoredAnnouncements();
    const receipts = await this.getStoredAnnouncementReceipts(sessionUser.uid);
    const receiptMap = new Map(receipts.map((receipt) => [receipt.announcementId, receipt]));
    const effectiveRole = getEffectiveAudienceRole(sessionUser);
    const visible = announcements
      .map((announcement) => ({
        ...announcement,
        receipt: receiptMap.get(announcement.id),
      }))
      .filter((announcement) => isAnnouncementVisibleToUser(announcement, sessionUser.subscriptionPlan, effectiveRole));
    return buildAnnouncementFeed(visible);
  }

  async markAnnouncementSeen(announcementId: string): Promise<void> {
    const sessionUser = await this.getSession();
    if (!sessionUser) return;
    const receiptId = buildAnnouncementReceiptId(announcementId, sessionUser.uid);
    const current = await readStoreRecord<StoredAnnouncementReceiptRecord>(
      await this.getStore(STORES.ANNOUNCEMENT_RECEIPTS),
      receiptId,
    );
    const nextSeenAt = current?.seenAt || Date.now();
    const store = await this.getStore(STORES.ANNOUNCEMENT_RECEIPTS, 'readwrite');
    await requestToPromise(store.put({
      id: receiptId,
      announcementId,
      userUid: sessionUser.uid,
      seenAt: nextSeenAt,
      acknowledgedAt: current?.acknowledgedAt,
      updatedAt: Date.now(),
    }));
  }

  async acknowledgeAnnouncement(announcementId: string): Promise<void> {
    const sessionUser = await this.getSession();
    if (!sessionUser) return;
    const receiptId = buildAnnouncementReceiptId(announcementId, sessionUser.uid);
    const current = await readStoreRecord<StoredAnnouncementReceiptRecord>(
      await this.getStore(STORES.ANNOUNCEMENT_RECEIPTS),
      receiptId,
    );
    const now = Date.now();
    const store = await this.getStore(STORES.ANNOUNCEMENT_RECEIPTS, 'readwrite');
    await requestToPromise(store.put({
      id: receiptId,
      announcementId,
      userUid: sessionUser.uid,
      seenAt: current?.seenAt || now,
      acknowledgedAt: now,
      updatedAt: now,
    }));
  }

  async listCommercialRequests(): Promise<CommercialRequest[]> {
    return this.getStoredCommercialRequests();
  }

  async updateCommercialRequest(payload: CommercialRequestUpdatePayload): Promise<CommercialRequest> {
    const requests = await this.getStoredCommercialRequests();
    const current = requests.find((request) => request.id === payload.id);
    if (!current) {
      throw new Error('申請が見つかりません。');
    }

    const nextRequest: CommercialRequest = {
      ...current,
      status: payload.status,
      resolutionNote: payload.resolutionNote || current.resolutionNote,
      linkedUserUid: payload.linkedUserUid || current.linkedUserUid,
      targetSubscriptionPlan: payload.targetSubscriptionPlan || current.targetSubscriptionPlan,
      targetOrganizationId: payload.targetOrganizationId
        || current.targetOrganizationId
        || (payload.targetOrganizationName ? createLocalOrganizationId(payload.targetOrganizationName) : undefined),
      targetOrganizationName: payload.targetOrganizationName || current.targetOrganizationName,
      targetOrganizationRole: payload.targetOrganizationRole || current.targetOrganizationRole,
      updatedAt: Date.now(),
    };

    const store = await this.getStore(STORES.COMMERCIAL_REQUESTS, 'readwrite');
    await requestToPromise(store.put(nextRequest));

    const sessionUser = await this.getSession();
    if (
      payload.status === CommercialRequestStatus.PROVISIONED
      && sessionUser
      && nextRequest.linkedUserUid === sessionUser.uid
    ) {
      const nextUserRole = nextRequest.targetOrganizationRole === OrganizationRole.GROUP_ADMIN
        || nextRequest.targetOrganizationRole === OrganizationRole.INSTRUCTOR
        ? UserRole.INSTRUCTOR
        : UserRole.STUDENT;
      await this.updateSessionUser({
        ...sessionUser,
        role: nextUserRole,
        subscriptionPlan: nextRequest.targetSubscriptionPlan || sessionUser.subscriptionPlan || SubscriptionPlan.TOC_FREE,
        organizationId: nextRequest.targetOrganizationId,
        organizationName: nextRequest.targetOrganizationName,
        organizationRole: nextRequest.targetOrganizationRole,
      });
    }

    return nextRequest;
  }

  async listProductAnnouncementsAdmin(): Promise<ProductAnnouncement[]> {
    return this.getStoredAnnouncements();
  }

  async upsertProductAnnouncement(payload: ProductAnnouncementUpsertPayload): Promise<ProductAnnouncement> {
    const store = await this.getStore(STORES.PRODUCT_ANNOUNCEMENTS, 'readwrite');
    const nextAnnouncement: ProductAnnouncement = {
      id: payload.id || `local-announcement-${Date.now().toString(36)}`,
      title: payload.title.trim(),
      body: payload.body.trim(),
      severity: payload.severity,
      subscriptionPlans: payload.subscriptionPlans,
      audienceRoles: payload.audienceRoles,
      startsAt: payload.startsAt,
      endsAt: payload.endsAt,
      publishedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await requestToPromise(store.put(nextAnnouncement));
    return nextAnnouncement;
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
