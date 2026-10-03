import {
  GUEST_TRIAL_QUESTIONS, GUEST_TRIAL_TTL_MS, GUEST_TRIAL_VERSION,
  getGuestTrialQuestion, type GuestTrialAnswer,
} from '../shared/guestTrial';

export interface GuestTrialProgress {
  trialId: string;
  version: string;
  startedAt: number;
  answers: GuestTrialAnswer[];
  boundUserId?: string;
  importedAttemptIds: string[];
}

export interface GuestTrialDeviceState {
  progress: GuestTrialProgress | null;
  persistent: boolean;
  notice: string | null;
}

const DEVICE_DB = 'steady-study-guest-trial';
const DEVICE_STORE = 'progress';
const DEVICE_KEY = 'current';
const MEMORY_NOTICE = 'この端末では体験の記録を残せません。画面を閉じたり再読み込みすると消える場合があります。';
const ID_PATTERN = /^[a-zA-Z0-9_-]{8,100}$/;
class GuestTrialStateError extends Error {}
const createDeviceId = (): string => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const parseGuestTrialProgress = (value: unknown, now: number): GuestTrialProgress | null => {
  if (!value || typeof value !== 'object') return null;
  const v = value as GuestTrialProgress;
  if (typeof v.trialId !== 'string' || !ID_PATTERN.test(v.trialId) || v.version !== GUEST_TRIAL_VERSION
    || !Number.isSafeInteger(v.startedAt) || v.startedAt <= 0 || v.startedAt > now + 60_000 || v.startedAt < now - GUEST_TRIAL_TTL_MS
    || !Array.isArray(v.answers) || v.answers.length > GUEST_TRIAL_QUESTIONS.length
    || !Array.isArray(v.importedAttemptIds) || v.importedAttemptIds.length > v.answers.length
    || (v.boundUserId !== undefined && (typeof v.boundUserId !== 'string' || !v.boundUserId || v.boundUserId.length > 200))) return null;
  const ids = new Set<string>();
  const questions = new Set<string>();
  const answers: GuestTrialAnswer[] = [];
  for (const a of v.answers) {
    const q = getGuestTrialQuestion(a?.questionId);
    if (!q || typeof a.attemptId !== 'string' || !ID_PATTERN.test(a.attemptId) || ids.has(a.attemptId)
      || questions.has(a.questionId) || !Number.isInteger(a.choiceIndex) || a.choiceIndex < 0 || a.choiceIndex >= q.choices.length
      || !Number.isSafeInteger(a.answeredAt) || a.answeredAt < v.startedAt || a.answeredAt > now + 60_000) return null;
    ids.add(a.attemptId); questions.add(a.questionId);
    answers.push({ attemptId: a.attemptId, questionId: a.questionId, choiceIndex: a.choiceIndex, answeredAt: a.answeredAt });
  }
  if (v.importedAttemptIds.some(id => typeof id !== 'string' || !ids.has(id))
    || new Set(v.importedAttemptIds).size !== v.importedAttemptIds.length
    || (v.importedAttemptIds.length > 0 && !v.boundUserId)) return null;
  return { trialId: v.trialId, version: GUEST_TRIAL_VERSION, startedAt: v.startedAt, answers,
    ...(v.boundUserId ? { boundUserId: v.boundUserId } : {}), importedAttemptIds: [...v.importedAttemptIds] };
};

export const createGuestTrialProgressStore = (options: {
  factory?: () => IDBFactory | undefined;
  now?: () => number;
  createId?: () => string;
} = {}) => {
  const now = options.now || Date.now;
  const createId = options.createId || createDeviceId;
  const factory = options.factory || (() => typeof indexedDB === 'undefined' ? undefined : indexedDB);
  let memory: GuestTrialProgress | null = null;
  // Once device persistence fails, keep this page's immutable answers and
  // account binding in memory. A recovered but older DB must not replace them.
  let memoryMode = false;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  const copy = (p: GuestTrialProgress | null) => p ? structuredClone(p) : null;
  const open = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    const idb = factory();
    if (!idb) { reject(new Error('DEVICE_STORAGE_UNAVAILABLE')); return; }
    const request = idb.open(DEVICE_DB, 1);
    let settled = false;
    const unavailable = () => {
      if (settled) return;
      settled = true;
      reject(new Error('DEVICE_STORAGE_UNAVAILABLE'));
    };
    request.onupgradeneeded = () => request.result.createObjectStore(DEVICE_STORE);
    request.onsuccess = () => {
      const db = request.result;
      if (settled) { db.close(); return; }
      settled = true;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = unavailable;
    request.onblocked = unavailable;
  });
  const inMemory = (change?: (p: GuestTrialProgress | null) => GuestTrialProgress | null): GuestTrialDeviceState => {
    const current = parseGuestTrialProgress(memory, now());
    memory = change ? change(copy(current)) : current;
    if (change) notify();
    return { progress: copy(memory), persistent: false, notice: MEMORY_NOTICE };
  };
  const transact = async (change?: (p: GuestTrialProgress | null) => GuestTrialProgress | null): Promise<GuestTrialDeviceState> => {
    if (memoryMode) return inMemory(change);
    let db: IDBDatabase | undefined;
    try {
      db = await open();
      if (memoryMode) return inMemory(change);
      const result = await new Promise<GuestTrialProgress | null>((resolve, reject) => {
        const tx = db!.transaction(DEVICE_STORE, 'readwrite');
        const store = tx.objectStore(DEVICE_STORE);
        const request = store.get(DEVICE_KEY);
        let next: GuestTrialProgress | null = null;
        let failure: unknown;
        request.onsuccess = () => {
          try {
            if (memoryMode) { tx.abort(); return; }
            const current = parseGuestTrialProgress(request.result, now());
            memory = copy(current);
            next = change ? change(copy(current)) : current;
            if (next) store.put(next, DEVICE_KEY); else store.delete(DEVICE_KEY);
          } catch (error) { failure = error; tx.abort(); }
        };
        tx.oncomplete = () => resolve(next);
        tx.onabort = () => reject(failure || new Error('DEVICE_STORAGE_UNAVAILABLE'));
        tx.onerror = () => reject(failure || new Error('DEVICE_STORAGE_UNAVAILABLE'));
      });
      if (memoryMode) return inMemory(change);
      memory = copy(result);
      if (change) notify();
      return { progress: copy(result), persistent: true, notice: null };
    } catch (error) {
      if (error instanceof GuestTrialStateError) throw error;
      memoryMode = true;
      return inMemory(change);
    } finally { db?.close(); }
  };
  const requireTrial = (p: GuestTrialProgress | null, trialId: string): GuestTrialProgress => {
    if (!p || p.trialId !== trialId) throw new GuestTrialStateError('体験の記録が変わりました。画面を更新して確認してください。');
    return p;
  };
  return {
    load: () => transact(),
    start: () => transact(p => p || { trialId: createId(), version: GUEST_TRIAL_VERSION, startedAt: now(), answers: [], importedAttemptIds: [] }),
    answer: (trialId: string, questionId: string, choiceIndex: number) => transact(p => {
      const current = requireTrial(p, trialId);
      const q = getGuestTrialQuestion(questionId);
      if (!q || !Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= q.choices.length) throw new GuestTrialStateError('回答を選び直してください。');
      // A read-write transaction serializes tabs. The first confirmed answer is
      // immutable, including the attempt ID used for every authenticated retry.
      if (current.answers.some(a => a.questionId === questionId)) return current;
      return { ...current, answers: [...current.answers, { attemptId: createId(), questionId, choiceIndex, answeredAt: now() }] };
    }),
    bind: (trialId: string, userId: string) => transact(p => {
      const current = requireTrial(p, trialId);
      if (!userId || userId.length > 200 || (current.boundUserId && current.boundUserId !== userId)) throw new GuestTrialStateError('この体験は別のアカウントで保存を開始しています。このアカウントには引き継げません。');
      return { ...current, boundUserId: userId };
    }),
    acknowledge: (trialId: string, userId: string, attempts: readonly string[]) => transact(p => {
      const current = requireTrial(p, trialId);
      if (current.boundUserId !== userId || attempts.some(id => !current.answers.some(a => a.attemptId === id))) throw new GuestTrialStateError('保存先を確認できませんでした。体験の記録は端末に残っています。');
      return { ...current, importedAttemptIds: [...new Set([...current.importedAttemptIds, ...attempts])] };
    }),
    clear: () => transact(() => null),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
};

export const guestTrialProgressStore = createGuestTrialProgressStore();
