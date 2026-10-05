import {
  GUEST_LEARNING_MAX_ATTEMPTS, GUEST_LEARNING_MAX_RESPONSE_TIME_MS, GUEST_LEARNING_UUID_PATTERN,
  GUEST_LEARNING_VERSION, isGuestLearningWordId, parseGuestLearningProgress,
  type GuestLearningAttempt, type GuestLearningProgress,
} from '../shared/guestLearning';

export type { GuestLearningAttempt, GuestLearningProgress } from '../shared/guestLearning';
export { parseGuestLearningProgress } from '../shared/guestLearning';

export interface GuestLearningDeviceState {
  progress: GuestLearningProgress | null;
  persistent: boolean;
  notice: string | null;
}

const DEVICE_DB = 'steady-study-guest-learning';
const DEVICE_STORE = 'progress';
const DEVICE_KEY = 'current';
const MEMORY_NOTICE = 'この端末では一時記録を残せません。画面を閉じたり再読み込みすると消える場合があります。';
const LIMIT_NOTICE = '引継ぎ用の一時記録が上限に達しました。学習は続けられますが、以降の回答はアカウントへ引き継げません。';
class GuestLearningStateError extends Error {}

export const createGuestLearningAttemptId = (): string => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const createGuestLearningProgressStore = (options: {
  factory?: () => IDBFactory | undefined;
  now?: () => number;
  createId?: () => string;
  openTimeoutMs?: number;
} = {}) => {
  const now = options.now || Date.now;
  const createId = options.createId || createGuestLearningAttemptId;
  const factory = options.factory || (() => typeof indexedDB === 'undefined' ? undefined : indexedDB);
  let memory: GuestLearningProgress | null = null;
  let memoryMode = false;
  let queue: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => { try { listener(); } catch { /* A listener cannot invalidate a completed save. */ } });
  const copy = (p: GuestLearningProgress | null) => p ? structuredClone(p) : null;
  const deviceState = (p: GuestLearningProgress | null, persistent: boolean): GuestLearningDeviceState => ({
    progress: copy(p), persistent,
    notice: [!persistent ? MEMORY_NOTICE + (p?.importedAttemptIds.length ? '' : 'アカウントにはまだ保存されていません。') : null,
      p?.recordingLimitReached ? LIMIT_NOTICE : null].filter(Boolean).join(' ') || null,
  });
  const open = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    const idb = factory();
    if (!idb) { reject(new Error('DEVICE_STORAGE_UNAVAILABLE')); return; }
    const request = idb.open(DEVICE_DB, 1);
    let settled = false;
    const timeout = setTimeout(() => unavailable(), options.openTimeoutMs ?? 3000);
    const unavailable = () => {
      if (settled) return;
      settled = true; clearTimeout(timeout); reject(new Error('DEVICE_STORAGE_UNAVAILABLE'));
    };
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(DEVICE_STORE)) request.result.createObjectStore(DEVICE_STORE); };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) { db.close(); return; }
      settled = true; clearTimeout(timeout); db.onversionchange = () => db.close(); resolve(db);
    };
    request.onerror = unavailable; request.onblocked = unavailable;
  });
  type Change = (p: GuestLearningProgress | null) => GuestLearningProgress | null;
  const inMemory = (change?: Change): GuestLearningDeviceState => {
    const current = parseGuestLearningProgress(memory, now());
    memory = change ? change(copy(current)) : current;
    if (change) notify();
    return deviceState(memory, false);
  };
  const transact = async (change?: Change): Promise<GuestLearningDeviceState> => {
    if (memoryMode) return inMemory(change);
    let db: IDBDatabase | undefined;
    try {
      db = await open();
      const result = await new Promise<GuestLearningProgress | null>((resolve, reject) => {
        // IDB read/write transactions serialize reads and writes across tabs.
        const tx = db!.transaction(DEVICE_STORE, 'readwrite');
        const store = tx.objectStore(DEVICE_STORE);
        const request = store.get(DEVICE_KEY);
        let next: GuestLearningProgress | null = null;
        let failure: unknown;
        request.onsuccess = () => {
          try {
            const current = parseGuestLearningProgress(request.result, now());
            memory = copy(current);
            next = change ? change(copy(current)) : current;
            if (next) store.put(next, DEVICE_KEY); else store.delete(DEVICE_KEY);
          } catch (error) { failure = error; tx.abort(); }
        };
        tx.oncomplete = () => resolve(next);
        tx.onabort = () => reject(failure || new Error('DEVICE_STORAGE_UNAVAILABLE'));
        tx.onerror = () => reject(failure || new Error('DEVICE_STORAGE_UNAVAILABLE'));
      });
      memory = copy(result);
      if (change) notify();
      return deviceState(result, true);
    } catch (error) {
      if (error instanceof GuestLearningStateError) throw error;
      // Never restore a stale durable snapshot over immutable memory answers.
      memoryMode = true;
      return inMemory(change);
    } finally { db?.close(); }
  };
  const run = (change?: Change): Promise<GuestLearningDeviceState> => {
    // Serialize opens too: a delayed old load cannot overwrite clear/start or
    // replay an operation after another operation switched to memory storage.
    const operation = queue.then(() => transact(change));
    queue = operation.catch(() => undefined);
    return operation;
  };
  const requireSession = (p: GuestLearningProgress | null, sessionId: string): GuestLearningProgress => {
    if (!p || p.sessionId !== sessionId) throw new GuestLearningStateError('一時学習の記録が変わりました。画面を更新して確認してください。');
    return p;
  };
  return {
    load: () => run(),
    start: () => run(p => p || { sessionId: createId(), version: GUEST_LEARNING_VERSION, startedAt: now(), attempts: [], importedAttemptIds: [] }),
    answer: (sessionId: string, wordId: string, rating: number, responseTimeMs: number, attemptId = createId()) => {
      const answeredAt = now();
      return run(p => {
        const current = requireSession(p, sessionId);
        if (!GUEST_LEARNING_UUID_PATTERN.test(attemptId) || !isGuestLearningWordId(wordId)
          || !Number.isInteger(rating) || rating < 0 || rating > 3 || !Number.isSafeInteger(responseTimeMs)
          || responseTimeMs < 0 || responseTimeMs > GUEST_LEARNING_MAX_RESPONSE_TIME_MS) throw new GuestLearningStateError('回答を確認して、もう一度お試しください。');
        const existing = current.attempts.find(a => a.attemptId === attemptId);
        if (existing) {
          if (existing.wordId !== wordId || existing.rating !== rating || existing.responseTimeMs !== responseTimeMs) throw new GuestLearningStateError('同じ回答の識別子で内容を変更できません。');
          return current;
        }
        // A different tab may bind while an anonymous card is on screen.
        // Keep its pinned import snapshot immutable and allow the UI to continue
        // this card as a session-only result with the returned account binding.
        if (current.boundUserId) return current;
        if (answeredAt < current.startedAt) throw new GuestLearningStateError('一時学習の記録が変わりました。画面を更新して確認してください。');
        if (current.attempts.length >= GUEST_LEARNING_MAX_ATTEMPTS) return { ...current, recordingLimitReached: true };
        const attempt: GuestLearningAttempt = { attemptId, wordId, rating: rating as GuestLearningAttempt['rating'], responseTimeMs, answeredAt };
        return { ...current, attempts: [...current.attempts, attempt] };
      });
    },
    bind: (sessionId: string, userId: string) => run(p => {
      const current = requireSession(p, sessionId);
      if (typeof userId !== 'string' || !userId.trim() || userId.length > 200 || (current.boundUserId && current.boundUserId !== userId)) throw new GuestLearningStateError('この一時学習は別のアカウントで保存を開始しています。このアカウントには引き継げません。');
      return { ...current, boundUserId: userId };
    }),
    acknowledge: (sessionId: string, userId: string, attempts: readonly string[]) => run(p => {
      const current = requireSession(p, sessionId);
      const known = new Set(current.attempts.map(a => a.attemptId));
      if (!current.boundUserId || typeof userId !== 'string' || current.boundUserId !== userId
        || !Array.isArray(attempts) || attempts.some(id => !known.has(id))) throw new GuestLearningStateError('保存先を確認できませんでした。一時記録は端末に残っています。');
      return { ...current, importedAttemptIds: [...new Set([...current.importedAttemptIds, ...attempts])] };
    }),
    clear: (expectedSessionId?: string) => run(p => { if (expectedSessionId !== undefined) requireSession(p, expectedSessionId); return null; }),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
};

export const guestLearningProgressStore = createGuestLearningProgressStore();
