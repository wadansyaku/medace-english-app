import type { LearningPlan, LearningPreference } from '../../types';
import { putStoreRecord, STORES, type GetStore } from './idb-support';
import { defaultLearningPreference } from './mockData';

export interface LocalLearningPlanStorageContext {
  getStore: GetStore;
}

export const saveLearningPlanLocal = async (
  context: LocalLearningPlanStorageContext,
  plan: LearningPlan,
): Promise<void> => {
  const store = await context.getStore(STORES.PLANS, 'readwrite');
  await putStoreRecord(store, plan);
};

export const getLearningPlanLocal = async (
  context: LocalLearningPlanStorageContext,
  uid: string,
): Promise<LearningPlan | null> => {
  const store = await context.getStore(STORES.PLANS);
  return new Promise((resolve) => {
    const request = store.get(uid);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
};

export const saveLearningPreferenceLocal = async (
  context: LocalLearningPlanStorageContext,
  preference: LearningPreference,
): Promise<void> => {
  const store = await context.getStore(STORES.PREFERENCES, 'readwrite');
  await putStoreRecord(store, { ...preference, updatedAt: Date.now() });
};

export const getLearningPreferenceLocal = async (
  context: LocalLearningPlanStorageContext,
  uid: string,
): Promise<LearningPreference | null> => {
  const store = await context.getStore(STORES.PREFERENCES);
  return new Promise((resolve) => {
    const request = store.get(uid);
    request.onsuccess = () => resolve(request.result || defaultLearningPreference(uid));
    request.onerror = () => resolve(defaultLearningPreference(uid));
  });
};
