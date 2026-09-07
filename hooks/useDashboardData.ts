import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { dashboardService } from '../services/dashboard';
import type { LearningPlan, LearningPreference } from '../types';
import { createDashboardResource } from '../utils/dashboardResource';

export const useDashboardData = (uid?: string) => {
  const resource = useMemo(() => createDashboardResource(
    () => dashboardService.getDashboardSnapshot(uid!),
    Boolean(uid),
  ), [uid]);
  const state = useSyncExternalStore(resource.subscribe, resource.getSnapshot, resource.getSnapshot);

  useEffect(() => {
    void resource.refresh();
    return resource.cancel;
  }, [resource]);

  const updateLearningPlan = useCallback((nextPlan: LearningPlan | null) => {
    resource.update((previous) => ({ ...previous, learningPlan: nextPlan }));
  }, [resource]);

  const updateLearningPreference = useCallback((nextPreference: LearningPreference | null) => {
    resource.update((previous) => ({ ...previous, learningPreference: nextPreference }));
  }, [resource]);

  const removeMyBook = useCallback((bookId: string) => {
    resource.update((previous) => ({
      ...previous,
      myBooks: previous.myBooks.filter((book) => book.id !== bookId),
    }));
  }, [resource]);

  return {
    ...state,
    refresh: resource.refresh,
    updateLearningPlan,
    updateLearningPreference,
    removeMyBook,
  };
};
