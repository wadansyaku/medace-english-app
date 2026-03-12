import { useCallback, useEffect, useState } from 'react';

import { storage } from '../services/storage';
import { listWritingAssignments, listWritingReviewQueue } from '../services/writing';
import type {
  OrganizationDashboardSnapshot,
  WritingAssignment,
  WritingQueueItem,
} from '../types';

export const useBusinessAdminDashboardData = () => {
  const [snapshot, setSnapshot] = useState<OrganizationDashboardSnapshot | null>(null);
  const [writingAssignments, setWritingAssignments] = useState<WritingAssignment[]>([]);
  const [writingQueue, setWritingQueue] = useState<WritingQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextSnapshot, assignmentResponse, queueResponse] = await Promise.all([
        storage.getOrganizationDashboardSnapshot(),
        listWritingAssignments('organization'),
        listWritingReviewQueue('QUEUE'),
      ]);

      setSnapshot(nextSnapshot);
      setWritingAssignments(assignmentResponse.assignments);
      setWritingQueue(queueResponse.items);
    } catch (loadError) {
      console.error(loadError);
      setError((loadError as Error).message || '組織ダッシュボードの取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    snapshot,
    writingAssignments,
    writingQueue,
    loading,
    error,
    refresh,
  };
};

export default useBusinessAdminDashboardData;
