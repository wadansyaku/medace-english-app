import type {
  AnnouncementReceipt,
  CommercialRequest,
  LearningHistory,
  ProductAnnouncement,
  StudentWorksheetSnapshot,
  UserProfile,
} from '../../types';

export const DB_NAME = 'MedAceDB';
export const DB_VERSION = 5;

export const STORES = {
  BOOKS: 'books',
  WORDS: 'words',
  HISTORY: 'history',
  SESSION: 'session',
  PLANS: 'plans',
  PREFERENCES: 'preferences',
  ASSIGNMENTS: 'assignments',
  COMMERCIAL_REQUESTS: 'commercialRequests',
  PRODUCT_ANNOUNCEMENTS: 'productAnnouncements',
  ANNOUNCEMENT_RECEIPTS: 'announcementReceipts',
} as const;

export interface StoredLearningHistoryRecord {
  id: string;
  data: LearningHistory;
}

export interface StoredSessionRecord {
  key: string;
  user: UserProfile;
}

export interface StoredAssignmentRecord {
  studentUid: string;
  instructorUid: string | null;
}

export type StoredCommercialRequestRecord = CommercialRequest;
export type StoredProductAnnouncementRecord = ProductAnnouncement;
export interface StoredAnnouncementReceiptRecord extends AnnouncementReceipt {
  id: string;
}

export type GetStore = (storeName: string, mode?: IDBTransactionMode) => Promise<IDBObjectStore>;

export const initStorageDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onerror = () => reject(request.error);
  request.onupgradeneeded = () => {
    const db = request.result;
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
    if (!db.objectStoreNames.contains(STORES.COMMERCIAL_REQUESTS)) db.createObjectStore(STORES.COMMERCIAL_REQUESTS, { keyPath: 'id', autoIncrement: true });
    if (!db.objectStoreNames.contains(STORES.PRODUCT_ANNOUNCEMENTS)) db.createObjectStore(STORES.PRODUCT_ANNOUNCEMENTS, { keyPath: 'id' });
    if (!db.objectStoreNames.contains(STORES.ANNOUNCEMENT_RECEIPTS)) db.createObjectStore(STORES.ANNOUNCEMENT_RECEIPTS, { keyPath: 'id' });
  };
  request.onsuccess = () => resolve(request.result);
});

export const getObjectStore = async (
  dbPromise: Promise<IDBDatabase>,
  storeName: string,
  mode: IDBTransactionMode = 'readonly',
): Promise<IDBObjectStore> => {
  const db = await dbPromise;
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
};

export const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export const waitForTransaction = (tx: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error);
});

export const readStoreRecord = async <T>(
  store: IDBObjectStore,
  key: IDBValidKey,
): Promise<T | undefined> => {
  try {
    return await requestToPromise(store.get(key) as IDBRequest<T>);
  } catch {
    return undefined;
  }
};

export const readAllStoreRecords = async <T>(store: IDBObjectStore): Promise<T[]> => {
  try {
    return await requestToPromise(store.getAll() as IDBRequest<T[]>);
  } catch {
    return [];
  }
};

export const putStoreRecord = async (store: IDBObjectStore, value: unknown): Promise<void> => {
  await requestToPromise(store.put(value));
};

export const deleteStoreRecord = async (store: IDBObjectStore, key: IDBValidKey): Promise<void> => {
  await requestToPromise(store.delete(key));
};

export const iterateStore = async <T>(
  store: IDBObjectStore,
  onValue: (value: T, cursor: IDBCursorWithValue) => boolean | void,
): Promise<void> => new Promise((resolve) => {
  const request = store.openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) {
      resolve();
      return;
    }

    const shouldContinue = onValue(cursor.value as T, cursor);
    if (shouldContinue === false) {
      resolve();
      return;
    }

    cursor.continue();
  };
  request.onerror = () => resolve();
});

export const calculatePercentage = (learned: number, total: number): number => {
  if (total === 0 || learned === 0) return 0;
  if (learned === total) return 100;

  const pct = Math.round((learned / total) * 100);
  if (pct === 0 && learned > 0) return 1;
  if (pct === 100 && learned < total) return 99;
  return pct;
};

export const WORKSHEET_STATUSES: Array<StudentWorksheetSnapshot['words'][number]['status']> = ['graduated', 'review', 'learning'];
export const FALLBACK_WORKSHEET_WORD_LIMIT = 40;

export const isUserScopedRecordId = (recordId: string, uid: string): boolean => recordId.startsWith(`${uid}_`);

export const buildUserScopedRecordId = (uid: string, entityId: string): string => `${uid}_${entityId}`;
