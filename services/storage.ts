
import {
  ActivityLog,
  AdminDashboardSnapshot,
  BookAccessScope,
  BookCatalogSource,
  BookMetadata,
  BookProgress,
  DashboardSnapshot,
  EnglishLevel,
  LeaderboardEntry,
  LearningHistory,
  LearningPlan,
  LearningPreference,
  LearningPreferenceIntensity,
  MasteryDistribution,
  OrganizationDashboardSnapshot,
  OrganizationRole,
  StudentRiskLevel,
  StudentSummary,
  StudentWorksheetSnapshot,
  SubscriptionPlan,
  UserGrade,
  UserProfile,
  UserRole,
  UserStats,
  WordData,
} from '../types';
import { getSubscriptionPolicy } from '../config/subscription';
import { CloudflareStorageService } from './cloudflare';

export interface IStorageService {
  login(role: UserRole, demoPassword?: string, organizationRole?: OrganizationRole): Promise<UserProfile | null>; 
  authenticate(email: string, password: string, isSignUp: boolean, role?: UserRole, displayName?: string): Promise<UserProfile | null>; 
  saveSession(user: UserProfile): Promise<void>;
  updateSessionUser(user: UserProfile): Promise<void>;
  clearSession(): Promise<void>;
  getSession(): Promise<UserProfile | null>;
  addXP(user: UserProfile, amount: number): Promise<{ user: UserProfile, leveledUp: boolean }>;
  
  batchImportWords(
    defaultBookName: string,
    csvRows: any[],
    onProgress: (progress: number) => void,
    createdByUid?: string,
    contextSummary?: string,
    options?: {
      catalogSource?: BookCatalogSource;
      accessScope?: BookAccessScope;
    }
  ): Promise<void>;
  getBooks(): Promise<BookMetadata[]>;
  deleteBook(bookId: string): Promise<void>; 
  
  getWordsByBook(bookId: string): Promise<WordData[]>;
  updateWord(word: WordData): Promise<void>;
  reportWord(wordId: string, reason: string): Promise<void>; // New
  
  updateWordCache(wordId: string, sentence: string, translation: string): Promise<void>;
  
  getDailySessionWords(uid: string, limit: number): Promise<WordData[]>;
  getBookSession(uid: string, bookId: string, limit: number): Promise<WordData[]>;
  getDueCount(uid: string): Promise<number>;
  
  saveSRSHistory(uid: string, word: WordData, rating: number): Promise<void>;
  saveHistory(uid: string, result: Partial<LearningHistory> & { wordId: string, bookId: string }): Promise<void>;
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

const DB_NAME = 'MedAceDB';
const DB_VERSION = 4;
const STORES = {
  BOOKS: 'books',
  WORDS: 'words',
  HISTORY: 'history',
  SESSION: 'session',
  PLANS: 'plans',
  PREFERENCES: 'preferences',
  ASSIGNMENTS: 'assignments',
};

// Mocks
const IDB_MOCK_USERS: UserProfile[] = [
  {
    uid: 'mock-student-free-001',
    displayName: '鈴木 健太',
    role: UserRole.STUDENT,
    email: 'kenta@medace.com',
    grade: UserGrade.JHS2,
    englishLevel: EnglishLevel.A2,
    subscriptionPlan: SubscriptionPlan.TOC_FREE,
    stats: { xp: 1250, level: 12, currentStreak: 5, lastLoginDate: '2023-10-27' }
  },
  {
    uid: 'mock-student-biz-001',
    displayName: '黒田 颯太',
    role: UserRole.STUDENT,
    organizationRole: OrganizationRole.STUDENT,
    email: 'sota@demo-school.jp',
    grade: UserGrade.JHS3,
    englishLevel: EnglishLevel.B1,
    subscriptionPlan: SubscriptionPlan.TOB_PAID,
    organizationName: 'Steady Study Demo Academy',
    stats: { xp: 820, level: 8, currentStreak: 3, lastLoginDate: '2023-10-27' }
  },
  {
    uid: 'mock-instructor-001',
    displayName: 'Oak 先生',
    role: UserRole.INSTRUCTOR,
    organizationRole: OrganizationRole.INSTRUCTOR,
    email: 'oak@medace.com',
    subscriptionPlan: SubscriptionPlan.TOB_PAID,
    organizationName: 'Steady Study Demo Academy'
  },
  {
    uid: 'mock-group-admin-001',
    displayName: '朝比奈 由奈',
    role: UserRole.INSTRUCTOR,
    organizationRole: OrganizationRole.GROUP_ADMIN,
    email: 'manager@medace-demo.jp',
    subscriptionPlan: SubscriptionPlan.TOB_PAID,
    organizationName: 'Steady Study Demo Academy'
  },
  {
    uid: 'mock-admin-001',
    displayName: 'システム管理者',
    role: UserRole.ADMIN,
    email: 'admin@medace.com',
    subscriptionPlan: SubscriptionPlan.TOB_PAID,
    organizationName: 'Steady Study HQ'
  }
];

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

// Helper for Progress Calculation
const calculatePercentage = (learned: number, total: number): number => {
    if (total === 0) return 0;
    if (learned === 0) return 0;
    if (learned === total) return 100;
    
    const pct = Math.round((learned / total) * 100);
    if (pct === 0 && learned > 0) return 1; // Ensure at least 1% if started
    if (pct === 100 && learned < total) return 99; // Prevent premature 100%
    return pct;
};

const WORKSHEET_STATUSES: Array<StudentWorksheetSnapshot['words'][number]['status']> = ['graduated', 'review', 'learning'];
const DEFAULT_LEARNING_PREFERENCE = (userUid: string): LearningPreference => ({
  userUid,
  targetExam: '',
  targetScore: '',
  examDate: '',
  weeklyStudyDays: 4,
  dailyStudyMinutes: 20,
  weakSkillFocus: '',
  motivationNote: '',
  intensity: LearningPreferenceIntensity.BALANCED,
  updatedAt: Date.now(),
});

const IDB_MOCK_ASSIGNMENTS = [
  { studentUid: 'student-biz-1', instructorUid: 'mock-instructor-001' },
  { studentUid: 'student-biz-2', instructorUid: 'mock-instructor-001' },
];

const normalizeBookVisibilityPolicy = (book: BookMetadata): BookMetadata => {
  if (book.catalogSource === BookCatalogSource.USER_GENERATED) return book;
  return {
    ...book,
    accessScope: BookAccessScope.BUSINESS_ONLY,
  };
};

const canAccessOfficialBook = (plan: SubscriptionPlan | undefined, book: BookMetadata): boolean => {
  const normalizedBook = normalizeBookVisibilityPolicy(book);
  if (normalizedBook.catalogSource === BookCatalogSource.USER_GENERATED) return false;
  if ((normalizedBook.accessScope || BookAccessScope.ALL_PLANS) === BookAccessScope.ALL_PLANS) return true;
  return plan === SubscriptionPlan.TOB_PAID;
};

const isBookOwnedByUser = (book: BookMetadata, userUid: string | undefined): boolean => {
  if (!userUid) return false;
  try {
    if (book.description?.includes(userUid)) return true;
    const parsed = JSON.parse(book.description || '{}') as { createdBy?: string };
    return parsed.createdBy === userUid;
  } catch {
    return false;
  }
};

class IndexedDBStorageService implements IStorageService {
  private dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = this.initDB();
  }

  private initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORES.BOOKS)) db.createObjectStore(STORES.BOOKS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORES.WORDS)) {
          const wordStore = db.createObjectStore(STORES.WORDS, { keyPath: 'id' });
          wordStore.createIndex('bookId', 'bookId', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.HISTORY)) db.createObjectStore(STORES.HISTORY, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORES.SESSION)) db.createObjectStore(STORES.SESSION, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(STORES.PLANS)) db.createObjectStore(STORES.PLANS, { keyPath: 'uid' });
        if (!db.objectStoreNames.contains(STORES.PREFERENCES)) db.createObjectStore(STORES.PREFERENCES, { keyPath: 'userUid' });
        if (!db.objectStoreNames.contains(STORES.ASSIGNMENTS)) db.createObjectStore(STORES.ASSIGNMENTS, { keyPath: 'studentUid' });
      };
      request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
    });
  }

  private async getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
    const db = await this.dbPromise;
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  async login(role: UserRole, demoPassword?: string, organizationRole?: OrganizationRole): Promise<UserProfile | null> {
    if (role === UserRole.ADMIN && demoPassword !== 'admin') return null;
    const matchedUser = IDB_MOCK_USERS.find((user) => user.role === role && (organizationRole ? user.organizationRole === organizationRole : !user.organizationRole || user.role === UserRole.ADMIN)) || null;
    if (matchedUser) {
      await this.saveSession(matchedUser);
    }
    return matchedUser;
  }

  async authenticate(email: string, password: string, isSignUp: boolean, role?: UserRole, displayName?: string): Promise<UserProfile | null> {
    if (isSignUp) {
        const createdUser = { 
            uid: `mock-user-${Date.now()}`, 
            displayName: displayName?.trim() || email.split('@')[0], 
            role: role || UserRole.STUDENT, 
            email,
            subscriptionPlan: SubscriptionPlan.TOC_FREE,
            needsOnboarding: (role || UserRole.STUDENT) === UserRole.STUDENT,
        };
        await this.saveSession(createdUser);
        return createdUser;
    }
    const matchedUser = IDB_MOCK_USERS.find(u => u.email === email) || IDB_MOCK_USERS[0];
    await this.saveSession(matchedUser);
    return matchedUser;
  }

  async saveSession(user: UserProfile): Promise<void> {
    const updatedUser = await this.updateStreak(user);
    const store = await this.getStore(STORES.SESSION, 'readwrite');
    store.put({ key: 'current', user: updatedUser });
  }
  
  async updateSessionUser(user: UserProfile): Promise<void> {
    const store = await this.getStore(STORES.SESSION, 'readwrite');
    store.put({ key: 'current', user });
  }

  async clearSession(): Promise<void> {
    const store = await this.getStore(STORES.SESSION, 'readwrite');
    store.delete('current');
  }

  async getSession(): Promise<UserProfile | null> {
    const store = await this.getStore(STORES.SESSION);
    return new Promise((resolve) => {
      const request = store.get('current');
      request.onsuccess = () => resolve(request.result ? request.result.user : null);
      request.onerror = () => resolve(null);
    });
  }

  private async updateStreak(user: UserProfile): Promise<UserProfile> {
    const today = new Date().toISOString().split('T')[0];
    let stats: UserStats = user.stats || { xp: 0, level: 1, currentStreak: 0, lastLoginDate: '' };
    if (stats.lastLoginDate !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        if (stats.lastLoginDate === yesterdayStr) stats.currentStreak += 1;
        else if (stats.lastLoginDate !== today) stats.currentStreak = 1;
        stats.lastLoginDate = today;
    }
    return { ...user, stats };
  }

  async addXP(user: UserProfile, amount: number): Promise<{ user: UserProfile, leveledUp: boolean }> {
    if (!user.stats) user.stats = { xp: 0, level: 1, currentStreak: 1, lastLoginDate: new Date().toISOString().split('T')[0] };
    let { xp, level } = user.stats;
    xp += amount;
    const xpToNextLevel = level * 100;
    let leveledUp = false;
    if (xp >= xpToNextLevel) { xp -= xpToNextLevel; level += 1; leveledUp = true; }
    const updatedStats = { ...user.stats, xp, level };
    const updatedUser = { ...user, stats: updatedStats };
    await this.updateSessionUser(updatedUser);
    return { user: updatedUser, leveledUp };
  }

  async batchImportWords(
    defaultBookName: string,
    csvRows: any[],
    onProgress: (progress: number) => void,
    createdByUid?: string,
    contextSummary?: string,
    options?: {
      catalogSource?: BookCatalogSource;
      accessScope?: BookAccessScope;
    }
  ): Promise<void> {
    const db = await this.dbPromise;
    const bookGroups = new Map<string, { meta: BookMetadata, words: WordData[] }>();
    const total = csvRows.length;

    for (let i = 0; i < total; i++) {
      const row = csvRows[i];
      let bookName = row['BookName'] || row['book_name'] || row['_col0'] || defaultBookName;
      if (!bookName || typeof bookName !== 'string') bookName = defaultBookName;
      const groupKey = `${createdByUid || 'official'}:${bookName}`;

      const number = parseInt(row['Number'] || row['_col1'] || '0');
      const word = row['Word'] || row['_col2'] || '';
      const def = row['Meaning'] || row['_col3'] || '';

      if (word && def) {
        if (!bookGroups.has(groupKey)) {
            const bookId = createBookId(bookName, createdByUid, createdByUid ? String(Date.now()) : undefined);
            const desc = createdByUid 
                ? JSON.stringify({ createdBy: createdByUid, type: 'USER_GENERATED' }) 
                : 'Imported';
            
            bookGroups.set(groupKey, {
                meta: { 
                    id: bookId, 
                    title: bookName, 
                    wordCount: 0, 
                    isPriority: !createdByUid && bookName.includes("DUO"), 
                    description: desc,
                    sourceContext: contextSummary,
                    catalogSource: createdByUid
                      ? BookCatalogSource.USER_GENERATED
                      : (options?.catalogSource || BookCatalogSource.LICENSED_PARTNER),
                    accessScope: createdByUid
                      ? BookAccessScope.ALL_PLANS
                      : (options?.accessScope || BookAccessScope.BUSINESS_ONLY),
                },
                words: []
            });
        }
        const bookId = bookGroups.get(groupKey)!.meta.id;
        bookGroups.get(groupKey)!.words.push({
          id: `${bookId}_${number}_${i}`, bookId, number, word, definition: def, searchKey: word.toLowerCase()
        });
      }
      if (i % 1000 === 0) { onProgress((i / total) * 50); await new Promise(r => setTimeout(r, 0)); }
    }

    const tx = db.transaction([STORES.BOOKS, STORES.WORDS], 'readwrite');
    for (const [bookId, data] of bookGroups) {
      data.meta.wordCount = data.words.length;
      tx.objectStore(STORES.BOOKS).put(data.meta);
      data.words.forEach(w => tx.objectStore(STORES.WORDS).put(w));
    }
    return new Promise((resolve) => {
        tx.oncomplete = () => { onProgress(100); resolve(); };
    });
  }

  async getBooks(): Promise<BookMetadata[]> {
    const store = await this.getStore(STORES.BOOKS);
    const sessionUser = await this.getSession();
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
    const historyStore = await this.getStore(STORES.HISTORY);
    const dueWordIds: string[] = [];
    const allStudiedWordIds = new Set<string>();
    const now = Date.now();

    await new Promise<void>((resolve) => {
      const request = historyStore.openCursor();
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const record = cursor.value;
          if (record.id.startsWith(uid + '_')) {
             const h = record.data as LearningHistory;
             if (h.status !== 'graduated') {
                 if (h.nextReviewDate <= now) dueWordIds.push(h.wordId);
             }
             allStudiedWordIds.add(h.wordId);
          }
          cursor.continue();
        } else { resolve(); }
      };
    });

    const sessionWords: WordData[] = [];
    const wordsStore = await this.getStore(STORES.WORDS);
    
    for (const id of dueWordIds.slice(0, limit)) {
        const w = await new Promise<WordData>((res) => { const req = wordsStore.get(id); req.onsuccess = () => res(req.result); });
        if (w) sessionWords.push(w);
    }

    if (sessionWords.length < limit) {
        const needed = limit - sessionWords.length;
        const request = wordsStore.openCursor();
        await new Promise<void>((resolve) => {
            let count = 0;
            request.onsuccess = (e) => {
                const cursor = (e.target as IDBRequest).result;
                if (cursor && count < needed) {
                    const word = cursor.value as WordData;
                    if (!allStudiedWordIds.has(word.id)) { sessionWords.push(word); count++; }
                    cursor.continue();
                } else { resolve(); }
            };
        });
    }
    return sessionWords;
  }

  async getBookSession(uid: string, bookId: string, limit: number): Promise<WordData[]> {
    const allWords = await this.getWordsByBook(bookId);
    const historyStore = await this.getStore(STORES.HISTORY);
    
    const historyMap = new Map<string, LearningHistory>();
    await new Promise<void>((resolve) => {
        const req = historyStore.getAll();
        req.onsuccess = () => {
            const records = req.result || [];
            records.forEach((r:any) => {
                if (r.id.startsWith(uid + '_')) historyMap.set(r.data.wordId, r.data);
            });
            resolve();
        }
    });

    const now = Date.now();
    const due: WordData[] = [];
    const newWords: WordData[] = [];
    const ahead: WordData[] = [];

    for (const word of allWords) {
        const h = historyMap.get(word.id);
        if (!h) {
            newWords.push(word);
        } else {
            if (h.status === 'graduated') continue;
            if (h.nextReviewDate <= now) due.push(word);
            else ahead.push(word);
        }
    }

    let session = [...due];
    if (session.length < limit) {
        const needed = limit - session.length;
        session = [...session, ...newWords.slice(0, needed)];
    }
    if (session.length < limit) {
        const needed = limit - session.length;
        ahead.sort((a,b) => {
            const hA = historyMap.get(a.id);
            const hB = historyMap.get(b.id);
            return (hA?.nextReviewDate || 0) - (hB?.nextReviewDate || 0);
        });
        session = [...session, ...ahead.slice(0, needed)];
    }
    
    return session;
  }

  async getDueCount(uid: string): Promise<number> {
    const historyStore = await this.getStore(STORES.HISTORY);
    let count = 0;
    const now = Date.now();
    return new Promise((resolve) => {
        const request = historyStore.openCursor();
        request.onsuccess = (e) => {
            const cursor = (e.target as IDBRequest).result;
            if (cursor) {
                const h = cursor.value.data as LearningHistory;
                if (cursor.value.id.startsWith(uid + '_') && h.nextReviewDate <= now && h.status !== 'graduated') count++;
                cursor.continue();
            } else resolve(count);
        };
    });
  }

  async saveSRSHistory(uid: string, word: WordData, rating: number): Promise<void> {
    const store = await this.getStore(STORES.HISTORY, 'readwrite');
    const id = `${uid}_${word.id}`;
    return new Promise((resolve) => {
        const req = store.get(id);
        req.onsuccess = () => {
            const existing = req.result?.data;
            let interval = existing?.interval || 0;
            let ease = existing?.easeFactor || 2.5;
            let attemptCount = (existing?.attemptCount || 0) + 1;
            let correctCount = (existing?.correctCount || 0) + (rating >= 2 ? 1 : 0);

            if (rating === 0) { interval = 0; ease = Math.max(1.3, ease - 0.2); }
            else {
                if (rating === 1) interval = 1;
                else if (rating === 2) interval = interval === 0 ? 1 : Math.ceil(interval * ease);
                else if (rating === 3) { interval = interval === 0 ? 3 : Math.ceil(interval * ease * 1.3); ease += 0.15; }
                if (interval > 365) interval = 365;
            }
            const nextReview = Date.now() + (interval * 86400000);
            store.put({ id, data: { wordId: word.id, bookId: word.bookId, status: interval > 20 ? 'graduated' : 'learning', lastStudiedAt: Date.now(), nextReviewDate: nextReview, interval, easeFactor: ease, correctCount, attemptCount } });
            resolve();
        };
    });
  }

  async saveHistory(uid: string, result: Partial<LearningHistory>): Promise<void> {
     const store = await this.getStore(STORES.HISTORY, 'readwrite');
     store.put({ id: `${uid}_${result.wordId}`, data: { ...result, lastStudiedAt: Date.now() } });
  }

  async getBookProgress(uid: string, bookId: string): Promise<BookProgress> {
    const words = await this.getWordsByBook(bookId);
    if (words.length === 0) return { bookId, learnedCount: 0, totalCount: 0, percentage: 0 };
    const store = await this.getStore(STORES.HISTORY);
    return new Promise((resolve) => {
        const request = store.getAll();
        request.onsuccess = () => {
            const all = request.result || [];
            let learned = 0;
            all.forEach((r: any) => {
                if (r.id.startsWith(uid + '_') && r.data.bookId === bookId) {
                    if(r.data.attemptCount > 0 || r.data.interval > 0) learned++;
                }
            });
            const percentage = calculatePercentage(learned, words.length);
            resolve({ bookId, learnedCount: learned, totalCount: words.length, percentage });
        };
    });
  }

  async getAllStudentsProgress(): Promise<StudentSummary[]> {
    const sessionUser = await this.getSession();
    const assignmentStore = await this.getStore(STORES.ASSIGNMENTS);
    const assignments = await new Promise<Array<{ studentUid: string; instructorUid: string | null }>>((resolve) => {
      const request = assignmentStore.getAll();
      request.onsuccess = () => resolve((request.result || []) as Array<{ studentUid: string; instructorUid: string | null }>);
      request.onerror = () => resolve([]);
    });
    const mergedAssignments = new Map<string, string | null>(
      [...IDB_MOCK_ASSIGNMENTS, ...assignments].map((entry) => [entry.studentUid, entry.instructorUid])
    );

    const allStudents: StudentSummary[] = [
      { uid: 'student-free-1', name: '鈴木 健太', email: 'kenta@medace.com', totalLearned: 150, totalAttempts: 300, lastActive: Date.now(), riskLevel: StudentRiskLevel.SAFE, accuracy: 0.85, subscriptionPlan: SubscriptionPlan.TOC_FREE, hasLearningPlan: true, riskReasons: ['直近7日で安定して学習'], recommendedAction: '称賛して現状維持' },
      { uid: 'student-biz-1', name: '黒田 颯太', email: 'sota@demo-school.jp', totalLearned: 96, totalAttempts: 130, lastActive: Date.now() - 86400000, riskLevel: StudentRiskLevel.WARNING, accuracy: 0.76, subscriptionPlan: SubscriptionPlan.TOB_PAID, organizationName: 'Steady Study Demo Academy', lastNotificationAt: Date.now() - 86400000, lastNotificationMessage: 'Oak先生より: 昨日の復習を10語だけ戻しましょう。', hasLearningPlan: true, riskReasons: ['1日学習が空いている', '復習を先に戻したい段階'], recommendedAction: '復習10語の再開を促す' },
      { uid: 'student-biz-2', name: '田中 陽葵', email: 'hina@demo-school.jp', totalLearned: 45, totalAttempts: 60, lastActive: Date.now() - 86400000 * 4, riskLevel: StudentRiskLevel.DANGER, accuracy: 0.60, subscriptionPlan: SubscriptionPlan.TOB_PAID, organizationName: 'Steady Study Demo Academy', lastNotificationAt: Date.now() - 86400000, lastNotificationMessage: 'Oak先生より: 2日空いたので、まずは10語だけ復習しましょう。', hasLearningPlan: false, riskReasons: ['3日以上学習が停止', '正答率が60%台', '学習プラン未設定'], recommendedAction: '担当講師が短い再開タスクを指定' },
      { uid: 'student-biz-3', name: '森 結月', email: 'yuzuki@demo-school.jp', totalLearned: 188, totalAttempts: 240, lastActive: Date.now(), riskLevel: StudentRiskLevel.SAFE, accuracy: 0.88, subscriptionPlan: SubscriptionPlan.TOB_PAID, organizationName: 'Steady Study Demo Academy', hasLearningPlan: true, riskReasons: ['高い正答率で安定'], recommendedAction: '次の教材へ拡張' }
    ];

    const withAssignments = allStudents.map((student) => {
      const assignedInstructorUid = mergedAssignments.get(student.uid) || undefined;
      const assignedInstructor = IDB_MOCK_USERS.find((user) => user.uid === assignedInstructorUid);
      return {
        ...student,
        assignedInstructorUid,
        assignedInstructorName: assignedInstructor?.displayName,
      };
    });

    if (sessionUser?.role === UserRole.ADMIN) {
      return withAssignments;
    }

    if (sessionUser?.organizationName) {
      const orgStudents = withAssignments.filter((student) => student.organizationName === sessionUser.organizationName);
      if (sessionUser.organizationRole === OrganizationRole.GROUP_ADMIN) {
        return orgStudents;
      }
      return orgStudents.filter((student) => !student.assignedInstructorUid || student.assignedInstructorUid === sessionUser.uid);
    }

    return withAssignments.filter((student) => !student.organizationName);
  }

  async getStudentWorksheetSnapshot(studentUid: string): Promise<StudentWorksheetSnapshot> {
    const students = await this.getAllStudentsProgress();
    const targetStudent = students.find((student) => student.uid === studentUid) || students[0];
    const books = await this.getBooks();

    let words: StudentWorksheetSnapshot['words'] = [];

    if (books.length > 0) {
      for (const [index, book] of books.slice(0, 3).entries()) {
        const bookWords = await this.getWordsByBook(book.id);
        const sampledWords = bookWords.slice(0, 4).map((word, wordIndex) => ({
          wordId: word.id,
          bookId: book.id,
          bookTitle: book.title,
          word: word.word,
          definition: word.definition,
          status: WORKSHEET_STATUSES[wordIndex % WORKSHEET_STATUSES.length],
          lastStudiedAt: Date.now() - (index + wordIndex + 1) * 86400000,
          attemptCount: 3 + wordIndex,
          correctCount: 2 + wordIndex,
        }));
        words = [...words, ...sampledWords];
      }
    }

    if (words.length === 0) {
      words = [
        {
          wordId: 'worksheet-1',
          bookId: 'mock-book-1',
          bookTitle: 'ビジネス英単語 小テスト',
          word: 'diagnosis',
          definition: '診断',
          status: 'graduated',
          lastStudiedAt: Date.now() - 86400000,
          attemptCount: 6,
          correctCount: 5,
        },
        {
          wordId: 'worksheet-2',
          bookId: 'mock-book-1',
          bookTitle: 'ビジネス英単語 小テスト',
          word: 'treatment',
          definition: '治療',
          status: 'review',
          lastStudiedAt: Date.now() - 2 * 86400000,
          attemptCount: 4,
          correctCount: 3,
        },
        {
          wordId: 'worksheet-3',
          bookId: 'mock-book-2',
          bookTitle: '医療英語ベーシック',
          word: 'symptom',
          definition: '症状',
          status: 'learning',
          lastStudiedAt: Date.now() - 3 * 86400000,
          attemptCount: 2,
          correctCount: 1,
        },
      ];
    }

    return {
      studentUid: targetStudent?.uid || studentUid,
      studentName: targetStudent?.name || '対象生徒',
      organizationName: targetStudent?.organizationName,
      words,
    };
  }

  async sendInstructorNotification(studentUid: string, message: string, triggerReason: string, usedAi: boolean): Promise<void> {
      void studentUid;
      void message;
      void triggerReason;
      void usedAi;
  }

  async resetAllData(): Promise<void> {
      const db = await this.dbPromise;
      const tx = db.transaction([STORES.BOOKS, STORES.WORDS, STORES.HISTORY, STORES.SESSION, STORES.PLANS, STORES.PREFERENCES, STORES.ASSIGNMENTS], 'readwrite');
      tx.objectStore(STORES.BOOKS).clear();
      tx.objectStore(STORES.WORDS).clear();
      tx.objectStore(STORES.HISTORY).clear();
      tx.objectStore(STORES.SESSION).clear();
      tx.objectStore(STORES.PLANS).clear();
      tx.objectStore(STORES.PREFERENCES).clear();
      tx.objectStore(STORES.ASSIGNMENTS).clear();
      return new Promise(r => { tx.oncomplete = () => r(); });
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
          req.onsuccess = () => resolve(req.result || DEFAULT_LEARNING_PREFERENCE(uid));
          req.onerror = () => resolve(DEFAULT_LEARNING_PREFERENCE(uid));
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
      const sessionUser = await this.getSession();
      const plan = getSubscriptionPolicy(sessionUser?.subscriptionPlan || SubscriptionPlan.TOC_FREE);
      const allBooks = await this.getBooks();
      const official: BookMetadata[] = [];
      const mine: BookMetadata[] = [];

      allBooks.forEach((book) => {
          let isMine = false;
          try {
              if (book.description && book.description.includes(uid)) isMine = true;
              const desc = JSON.parse(book.description || '{}');
              if (desc.createdBy === uid) isMine = true;
          } catch { }

          if (isMine) mine.push(book);
          else official.push(book);
      });

      const accessibleOfficial = official.filter((book) => canAccessOfficialBook(sessionUser?.subscriptionPlan, book));

      accessibleOfficial.sort((a, b) => (a.isPriority === b.isPriority ? a.title.localeCompare(b.title) : a.isPriority ? -1 : 1));
      mine.sort((a, b) => b.id.localeCompare(a.id));

      const progressResults = await Promise.all([...accessibleOfficial, ...mine].map((book) => this.getBookProgress(uid, book.id)));
      const progressMap: Record<string, BookProgress> = {};
      progressResults.forEach((progress) => {
          progressMap[progress.bookId] = progress;
      });

      const [dueCount, learningPlan, learningPreference, leaderboard, masteryDist, activityLogs] = await Promise.all([
          this.getDueCount(uid),
          this.getLearningPlan(uid),
          this.getLearningPreference(uid),
          this.getLeaderboard(uid),
          this.getMasteryDistribution(uid),
          this.getActivityLogs(uid),
      ]);

      return {
          dueCount,
          officialBooks: accessibleOfficial,
          myBooks: mine,
          progressMap,
          learningPlan,
          learningPreference,
          leaderboard,
          masteryDist,
          activityLogs,
          coachNotifications: [
              {
                  id: 1,
                  studentUid: uid,
                  studentName: sessionUser?.displayName || 'あなた',
                  instructorUid: 'mock-instructor-001',
                  instructorName: 'Oak先生',
                  message: 'Oak先生より: 今週は復習のペースが良いです。この調子で明日も15分だけ続けましょう。',
                  triggerReason: '学習フォローアップ',
                  deliveryChannel: 'IN_APP',
                  usedAi: false,
                  createdAt: Date.now() - 3600_000,
              },
          ],
          accountOverview: {
              subscriptionPlan: sessionUser?.subscriptionPlan || SubscriptionPlan.TOC_FREE,
                  organizationRole: sessionUser?.organizationRole,
                  organizationName: sessionUser?.organizationName,
                  priceLabel: plan.priceLabel,
                  pricingNote: plan.pricingNote,
                  audienceLabel: plan.audienceLabel,
                  featureSummary: plan.featureSummary,
                  aiUsage: {
                  monthKey: new Date().toISOString().slice(0, 7),
                  estimatedCostMilliYen: 240,
                  budgetMilliYen: plan.monthlyAiBudgetMilliYen,
                  remainingMilliYen: Math.max(0, plan.monthlyAiBudgetMilliYen - 240),
                  actionCounts: {
                      generateGeminiSentence: 2,
                  },
              },
          },
      };
  }

  async getAdminDashboardSnapshot(): Promise<AdminDashboardSnapshot> {
      const students = await this.getAllStudentsProgress();
      const totalStudents = students.length;
      const atRiskStudents = students
        .filter((student) => student.riskLevel !== StudentRiskLevel.SAFE)
        .sort((a, b) => a.lastActive - b.lastActive)
        .slice(0, 6);

      return {
          overview: {
              totalStudents,
              activeToday: students.filter((student) => Date.now() - student.lastActive < 86400000).length,
              active7d: students.filter((student) => Date.now() - student.lastActive < 7 * 86400000).length,
              atRiskCount: atRiskStudents.length,
              studentsWithPlan: Math.max(0, totalStudents - 1),
              averageLearnedWords: totalStudents ? Math.round(students.reduce((sum, student) => sum + student.totalLearned, 0) / totalStudents) : 0,
              averageAccuracyRate: totalStudents ? Math.round(students.reduce((sum, student) => sum + (student.accuracy || 0), 0) / totalStudents * 100) : 0,
              officialBookCount: 0,
              customBookCount: 0,
              totalWordCount: 0,
              reportedWordCount: 0,
              notifications7d: 0,
              aiRequestsThisMonth: 0,
              aiCostThisMonthMilliYen: 0,
          },
          planBreakdown: Object.values(SubscriptionPlan).map((plan) => ({
              plan,
              count: students.filter((student) => student.subscriptionPlan === plan).length,
          })),
          riskBreakdown: [
              { riskLevel: StudentRiskLevel.SAFE, count: students.filter((student) => student.riskLevel === StudentRiskLevel.SAFE).length },
              { riskLevel: StudentRiskLevel.WARNING, count: students.filter((student) => student.riskLevel === StudentRiskLevel.WARNING).length },
              { riskLevel: StudentRiskLevel.DANGER, count: students.filter((student) => student.riskLevel === StudentRiskLevel.DANGER).length },
          ],
          trend: [],
          topBooks: [],
          aiActions: [],
          recentNotifications: [],
          recentReports: [],
          organizations: [],
          atRiskStudents,
      };
  }

  async getOrganizationDashboardSnapshot(): Promise<OrganizationDashboardSnapshot> {
      const sessionUser = await this.getSession();
      const students = await this.getAllStudentsProgress();
      const instructors = IDB_MOCK_USERS
        .filter((user) => user.role === UserRole.INSTRUCTOR && user.organizationName === sessionUser?.organizationName)
        .map((user) => ({
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          organizationRole: user.organizationRole,
          notifiedStudentCount: user.organizationRole === OrganizationRole.GROUP_ADMIN ? students.length : Math.max(1, students.length - 1),
          notifications7d: user.organizationRole === OrganizationRole.GROUP_ADMIN ? 5 : 3,
          assignedStudentCount: students.filter((student) => student.assignedInstructorUid === user.uid).length,
        }));

      const assignedStudents = students.filter((student) => student.assignedInstructorUid).length;

      return {
        organizationName: sessionUser?.organizationName || 'Steady Study Demo Academy',
        subscriptionPlan: sessionUser?.subscriptionPlan || SubscriptionPlan.TOB_PAID,
        totalMembers: instructors.length + students.length,
        totalStudents: students.length,
        totalInstructors: instructors.length,
        activeStudents7d: students.filter((student) => Date.now() - student.lastActive < 7 * 86400000).length,
        atRiskStudents: students.filter((student) => student.riskLevel !== StudentRiskLevel.SAFE).length,
        learningPlanCount: Math.max(1, students.length - 1),
        notifications7d: 8,
        assignmentCoverageRate: students.length > 0 ? Math.round((assignedStudents / students.length) * 100) : 0,
        unassignedStudents: students.filter((student) => !student.assignedInstructorUid).length,
        instructors,
        atRiskStudentList: students.filter((student) => student.riskLevel !== StudentRiskLevel.SAFE),
        studentAssignments: students,
      };
  }

  // Analytics Mock (IDB)
  async getLeaderboard(currentUid: string): Promise<LeaderboardEntry[]> {
      // In pure IDB mode, only the current user exists usually. We can mock "other students".
      const user = await this.getSession();
      const entries: LeaderboardEntry[] = [
          { uid: 'rival-1', displayName: '田中 陽葵', xp: (user?.stats?.xp || 0) + 500, level: 15, rank: 1, isCurrentUser: false },
          { uid: 'rival-2', displayName: '佐藤 翔太', xp: (user?.stats?.xp || 0) + 200, level: 14, rank: 2, isCurrentUser: false },
          { uid: currentUid, displayName: user?.displayName || 'Me', xp: user?.stats?.xp || 0, level: user?.stats?.level || 1, rank: 3, isCurrentUser: true },
          { uid: 'rival-3', displayName: '高橋 優子', xp: Math.max(0, (user?.stats?.xp || 0) - 300), level: 10, rank: 4, isCurrentUser: false },
      ];
      return entries.sort((a,b) => b.xp - a.xp).map((e, i) => ({...e, rank: i + 1}));
  }

  async getMasteryDistribution(uid: string): Promise<MasteryDistribution> {
      const store = await this.getStore(STORES.HISTORY);
      return new Promise((resolve) => {
          const req = store.getAll();
          req.onsuccess = () => {
              const all = req.result || [];
              const dist = { new: 0, learning: 0, review: 0, graduated: 0, total: 0 };
              all.forEach((r:any) => {
                  if (r.id.startsWith(uid + '_')) {
                      const h = r.data as LearningHistory;
                      if (h.status === 'graduated') dist.graduated++;
                      else if (h.status === 'review' || (h.status === 'learning' && h.interval > 3)) dist.review++;
                      else dist.learning++;
                      dist.total++;
                  }
              });
              resolve(dist);
          }
      });
  }

  async getActivityLogs(uid: string): Promise<ActivityLog[]> {
    const store = await this.getStore(STORES.HISTORY);
    return new Promise((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => {
            const all = req.result || [];
            const counts: Record<string, number> = {};
            all.forEach((r: any) => {
                if(r.id.startsWith(uid + '_')) {
                    const date = new Date(r.data.lastStudiedAt).toISOString().split('T')[0];
                    counts[date] = (counts[date] || 0) + 1;
                }
            });
            
            const logs = Object.keys(counts).map(date => {
                const count = counts[date];
                let intensity: 0|1|2|3|4 = 0;
                if (count > 0) intensity = 1;
                if (count > 5) intensity = 2;
                if (count > 15) intensity = 3;
                if (count > 30) intensity = 4;
                return { date, count, intensity };
            });
            resolve(logs);
        }
    });
  }
}

const USE_REMOTE_STORAGE = import.meta.env.VITE_STORAGE_MODE !== 'idb';

export const storage: IStorageService = USE_REMOTE_STORAGE
    ? new CloudflareStorageService()
    : new IndexedDBStorageService();
