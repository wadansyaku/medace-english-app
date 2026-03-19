import { useCallback, useEffect, useState } from 'react';
import { dashboardService } from '../services/dashboard';
import type { AdminDashboardSnapshot } from '../types';

export const useAdminDashboardSnapshot = () => {
  const [snapshot, setSnapshot] = useState<AdminDashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextSnapshot = await dashboardService.getAdminDashboardSnapshot();
      setSnapshot(nextSnapshot);
    } catch (loadError) {
      console.error(loadError);
      setError((loadError as Error).message || '管理者ダッシュボードの取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    snapshot,
    loading,
    error,
    refresh,
  };
};
