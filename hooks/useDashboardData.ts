import { useCallback, useEffect, useState } from 'react';
import { dashboardService } from '../services/dashboard';
import type { DashboardSnapshot, LearningPlan, LearningPreference } from '../types';

export const useDashboardData = (uid?: string) => {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!uid) return;

    try {
      setLoading(true);
      const nextSnapshot = await dashboardService.getDashboardSnapshot(uid);
      setSnapshot(nextSnapshot);
    } catch (error) {
      console.error('Failed to load dashboard data', error);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateLearningPlan = useCallback((nextPlan: LearningPlan | null) => {
    setSnapshot((previous) => (previous ? { ...previous, learningPlan: nextPlan } : previous));
  }, []);

  const updateLearningPreference = useCallback((nextPreference: LearningPreference | null) => {
    setSnapshot((previous) => (previous ? { ...previous, learningPreference: nextPreference } : previous));
  }, []);

  const removeMyBook = useCallback((bookId: string) => {
    setSnapshot((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        myBooks: previous.myBooks.filter((book) => book.id !== bookId),
      };
    });
  }, []);

  return {
    snapshot,
    loading,
    refresh,
    updateLearningPlan,
    updateLearningPreference,
    removeMyBook,
  };
};
