
import {
  ActivityLog,
  AdminDashboardSnapshot,
  BookAccessScope,
  BookCatalogSource,
  BookMetadata,
  BookProgress,
  DashboardSnapshot,
  LeaderboardEntry,
  LearningPlan,
  LearningPreference,
  MasteryDistribution,
  OrganizationDashboardSnapshot,
  OrganizationRole,
  StudentSummary,
  StudentWorksheetSnapshot,
  UserProfile,
  UserRole,
  WordData,
} from '../types';
import {
  CatalogImportIssue,
  CatalogImportRequest,
  CatalogImportRow,
  CatalogImportResult,
} from '../contracts/storage';
import { CloudflareStorageService } from './cloudflare';
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
  readStoreRecord,
  requestToPromise,
  STORES,
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
  getStudentWorksheetSnapshot as getStudentWorksheetSnapshotReadModel,
  sendInstructorNotification as sendInstructorNotificationReadModel,
  type OrganizationReadModelContext,
} from './storage/organization-read-model';
import { getCoachNotifications } from './storage/writing-read-model';

export interface IStorageService {
  login(role: UserRole, demoPassword?: string, organizationRole?: OrganizationRole): Promise<UserProfile | null>; 
  authenticate(email: string, password: string, isSignUp: boolean, role?: UserRole, displayName?: string): Promise<UserProfile | null>; 
  saveSession(user: UserProfile): Promise<void>;
  updateSessionUser(user: UserProfile): Promise<void>;
  clearSession(): Promise<void>;
  getSession(): Promise<UserProfile | null>;
  addXP(user: UserProfile, amount: number): Promise<{ user: UserProfile, leveledUp: boolean }>;
  
  batchImportWords(request: CatalogImportRequest, onProgress?: (progress: number) => void): Promise<CatalogImportResult>;
  getBooks(): Promise<BookMetadata[]>;
  deleteBook(bookId: string): Promise<void>; 
  
  getWordsByBook(bookId: string): Promise<WordData[]>;
  updateWord(word: WordData): Promise<void>;
  reportWord(wordId: string, reason: string): Promise<void>; // New
  
  updateWordCache(wordId: string, sentence: string, translation: string): Promise<void>;
  
  getDailySessionWords(uid: string, limit: number): Promise<WordData[]>;
  getBookSession(uid: string, bookId: string, limit: number): Promise<WordData[]>;
  getDueCount(uid: string): Promise<number>;
  
  saveSRSHistory(uid: string, word: WordData, rating: number, responseTimeMs?: number): Promise<void>;
  recordQuizAttempt(uid: string, wordId: string, bookId: string, correct: boolean, responseTimeMs?: number): Promise<void>;
  getStudiedWordIdsByBook(uid: string, bookId: string): Promise<string[]>;
  getBookProgress(uid: string, bookId: string): Promise<BookProgress>;
  
  getAllStudentsProgress(): Promise<StudentSummary[]>;
  getStudentWorksheetSnapshot(studentUid: string): Promise<StudentWorksheetSnapshot>;
  sendInstructorNotification(studentUid: string, message: string, triggerReason: string, usedAi: boolean): Promise<void>;
  resetAllData(): Promise<void>;

  // Plan
  saveLearningPlan(plan: LearningPlan): Promise<void>;
  getLearningPlan(uid: string): Promise<LearningPlan | null>;
  saveLearningPreference(preference: LearningPreference): Promise<void>;
  getLearningPreference(uid: string): Promise<LearningPreference | null>;
  assignStudentInstructor(studentUid: string, instructorUid: string | null): Promise<void>;

  // Analytics & Social
  getDashboardSnapshot(uid: string): Promise<DashboardSnapshot>;
  getAdminDashboardSnapshot(): Promise<AdminDashboardSnapshot>;
  getOrganizationDashboardSnapshot(): Promise<OrganizationDashboardSnapshot>;
  getLeaderboard(currentUid: string): Promise<LeaderboardEntry[]>;
  getMasteryDistribution(uid: string): Promise<MasteryDistribution>;
  getActivityLogs(uid: string): Promise<ActivityLog[]>;
}

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
      getWordsByBook: this.getWordsByBook.bind(this),
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

  async getDailySessionWords(uid: string, limit: number): Promise<WordData[]> {
    return getDailySessionWordsFromHistory(this.getLearningHistoryContext(), uid, limit);
  }

  async getBookSession(uid: string, bookId: string, limit: number): Promise<WordData[]> {
    return getBookSessionFromHistory(this.getLearningHistoryContext(), uid, bookId, limit);
  }

  async getDueCount(uid: string): Promise<number> {
    return getDueCountFromHistory(this.getLearningHistoryContext(), uid);
  }

  async saveSRSHistory(uid: string, word: WordData, rating: number, responseTimeMs = 0): Promise<void> {
    return saveSrsHistoryFromHistory(this.getLearningHistoryContext(), uid, word, rating, responseTimeMs);
  }

  async recordQuizAttempt(uid: string, wordId: string, bookId: string, correct: boolean, responseTimeMs = 0): Promise<void> {
    return recordQuizAttemptFromHistory(this.getLearningHistoryContext(), uid, wordId, bookId, correct, responseTimeMs);
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

  async sendInstructorNotification(studentUid: string, message: string, triggerReason: string, usedAi: boolean): Promise<void> {
    return sendInstructorNotificationReadModel(
      this.getOrganizationReadModelContext(),
      studentUid,
      message,
      triggerReason,
      usedAi,
    );
  }

  async resetAllData(): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction(
      [STORES.BOOKS, STORES.WORDS, STORES.HISTORY, STORES.SESSION, STORES.PLANS, STORES.PREFERENCES, STORES.ASSIGNMENTS],
      'readwrite',
    );
    tx.objectStore(STORES.BOOKS).clear();
    tx.objectStore(STORES.WORDS).clear();
    tx.objectStore(STORES.HISTORY).clear();
    tx.objectStore(STORES.SESSION).clear();
    tx.objectStore(STORES.PLANS).clear();
    tx.objectStore(STORES.PREFERENCES).clear();
    tx.objectStore(STORES.ASSIGNMENTS).clear();
    await waitForTransaction(tx);
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

  async getDashboardSnapshot(uid: string): Promise<DashboardSnapshot> {
    return getDashboardSnapshotReadModel(this.getDashboardReadModelContext(), uid);
  }

  async getAdminDashboardSnapshot(): Promise<AdminDashboardSnapshot> {
    return getAdminDashboardSnapshotReadModel(this.getDashboardReadModelContext());
  }

  async getOrganizationDashboardSnapshot(): Promise<OrganizationDashboardSnapshot> {
    return getOrganizationDashboardSnapshotReadModel(this.getOrganizationReadModelContext());
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
}

const USE_REMOTE_STORAGE = import.meta.env.VITE_STORAGE_MODE !== 'idb';

export const storage: IStorageService = USE_REMOTE_STORAGE
    ? new CloudflareStorageService()
    : new IndexedDBStorageService();
