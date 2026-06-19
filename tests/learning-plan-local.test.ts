import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getLearningPlanLocal,
  getLearningPreferenceLocal,
  saveLearningPlanLocal,
  saveLearningPreferenceLocal,
} from '../services/storage/learning-plan-local';
import { STORES, type GetStore } from '../services/storage/idb-support';
import { LearningPreferenceIntensity, type LearningPlan, type LearningPreference } from '../types';

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
};

const createRequest = <T>(result?: T, error?: Error): IDBRequest<T> => {
  const request: Partial<IDBRequest<T>> = {};
  queueMicrotask(() => {
    if (error) {
      Object.assign(request, { error });
      request.onerror?.call(request as IDBRequest<T>, new Event('error'));
      return;
    }
    Object.assign(request, { result });
    request.onsuccess?.call(request as IDBRequest<T>, new Event('success'));
  });
  return request as IDBRequest<T>;
};

const createControlledRequest = <T>() => {
  const request: Partial<IDBRequest<T>> = {};
  return {
    request: request as IDBRequest<T>,
    succeed: (result: T) => {
      Object.assign(request, { result });
      request.onsuccess?.call(request as IDBRequest<T>, new Event('success'));
    },
    fail: (error: Error) => {
      Object.assign(request, { error });
      request.onerror?.call(request as IDBRequest<T>, new Event('error'));
    },
  };
};

const createControlledTransaction = () => {
  const transaction: Partial<IDBTransaction> = {
    error: null,
  };
  return {
    transaction: transaction as IDBTransaction,
    complete: () => {
      transaction.oncomplete?.call(transaction as IDBTransaction, new Event('complete'));
    },
    fail: (error: Error) => {
      Object.assign(transaction, { error });
      transaction.onabort?.call(transaction as IDBTransaction, new Event('abort'));
    },
  };
};

const createControlledWriteStore = <T>() => {
  const request = createControlledRequest<T>();
  const transaction = createControlledTransaction();
  const put = vi.fn(() => request.request);
  return {
    put,
    request,
    transaction,
    store: {
      put,
      transaction: transaction.transaction,
    } as unknown as IDBObjectStore,
  };
};

const plan: LearningPlan = {
  uid: 'student-1',
  createdAt: 100,
  targetDate: '2026-07-01',
  goalDescription: 'DUO を毎日進める',
  dailyWordGoal: 20,
  selectedBookIds: ['duo-30'],
  status: 'ACTIVE',
};

const preference: LearningPreference = {
  userUid: 'student-1',
  targetExam: '高校入試',
  targetScore: '80',
  examDate: '2026-12-01',
  weeklyStudyDays: 5,
  dailyStudyMinutes: 30,
  weakSkillFocus: '長文',
  motivationNote: '毎日少しずつ',
  intensity: LearningPreferenceIntensity.REVIEW_HEAVY,
  updatedAt: 1,
};

describe('local learning plan storage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delegates learning plan writes to the plans store', async () => {
    const writeStore = createControlledWriteStore<IDBValidKey>();
    const getStore = vi.fn(async () => writeStore.store) as GetStore;
    const writePromise = saveLearningPlanLocal({ getStore }, plan);

    await flushMicrotasks();
    writeStore.request.succeed('student-1');
    writeStore.transaction.complete();
    await writePromise;

    expect(getStore).toHaveBeenCalledWith(STORES.PLANS, 'readwrite');
    expect(writeStore.put).toHaveBeenCalledWith(plan);
  });

  it('waits for learning plan put request and transaction completion before resolving', async () => {
    const writeStore = createControlledWriteStore<IDBValidKey>();
    const getStore = vi.fn(async () => writeStore.store) as GetStore;
    let resolved = false;

    const writePromise = saveLearningPlanLocal({ getStore }, plan)
      .then(() => {
        resolved = true;
      });
    await flushMicrotasks();

    expect(writeStore.put).toHaveBeenCalledWith(plan);
    expect(resolved).toBe(false);

    writeStore.request.succeed('student-1');
    await flushMicrotasks();
    expect(resolved).toBe(false);

    writeStore.transaction.complete();
    await writePromise;
    expect(resolved).toBe(true);
  });

  it('rejects learning plan writes when the transaction aborts after the put request succeeds', async () => {
    const writeStore = createControlledWriteStore<IDBValidKey>();
    const getStore = vi.fn(async () => writeStore.store) as GetStore;
    const transactionError = new Error('transaction aborted');

    const writePromise = saveLearningPlanLocal({ getStore }, plan);
    await flushMicrotasks();
    writeStore.request.succeed('student-1');
    writeStore.transaction.fail(transactionError);

    await expect(writePromise).rejects.toThrow('transaction aborted');
  });

  it('returns null when the stored learning plan cannot be read', async () => {
    const get = vi.fn(() => createRequest<LearningPlan>(undefined, new Error('read failed')));
    const getStore = vi.fn(async () => ({ get }) as unknown as IDBObjectStore) as GetStore;

    await expect(getLearningPlanLocal({ getStore }, 'student-1')).resolves.toBeNull();
    expect(getStore).toHaveBeenCalledWith(STORES.PLANS);
    expect(get).toHaveBeenCalledWith('student-1');
  });

  it('updates learning preference timestamps before writing preferences', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(987654321);
    const writeStore = createControlledWriteStore<IDBValidKey>();
    const getStore = vi.fn(async () => writeStore.store) as GetStore;
    const writePromise = saveLearningPreferenceLocal({ getStore }, preference);

    await flushMicrotasks();
    writeStore.request.succeed('student-1');
    writeStore.transaction.complete();
    await writePromise;

    expect(getStore).toHaveBeenCalledWith(STORES.PREFERENCES, 'readwrite');
    expect(writeStore.put).toHaveBeenCalledWith({ ...preference, updatedAt: 987654321 });
  });

  it('rejects learning preference writes when the put request fails', async () => {
    const writeStore = createControlledWriteStore<IDBValidKey>();
    const getStore = vi.fn(async () => writeStore.store) as GetStore;
    const requestError = new Error('put failed');

    const writePromise = saveLearningPreferenceLocal({ getStore }, preference);
    await flushMicrotasks();
    writeStore.request.fail(requestError);

    await expect(writePromise).rejects.toThrow('put failed');
  });

  it('falls back to a default learning preference when no local preference exists', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(123456789);
    const get = vi.fn(() => createRequest<LearningPreference | undefined>(undefined));
    const getStore = vi.fn(async () => ({ get }) as unknown as IDBObjectStore) as GetStore;

    const preference = await getLearningPreferenceLocal({ getStore }, 'student-1');

    expect(getStore).toHaveBeenCalledWith(STORES.PREFERENCES);
    expect(get).toHaveBeenCalledWith('student-1');
    expect(preference).toMatchObject({
      userUid: 'student-1',
      weeklyStudyDays: 4,
      dailyStudyMinutes: 20,
      intensity: LearningPreferenceIntensity.BALANCED,
      updatedAt: 123456789,
    });
  });
});
