import { useCallback, useEffect, useState } from 'react';

import { storage } from '../services/storage';
import { listWritingAssignments, listWritingReviewQueue } from '../services/writing';
import { resolveStorageMode } from '../shared/storageMode';
import type {
  BookMetadata,
  WeeklyMissionBoard,
  OrganizationDashboardSnapshot,
  OrganizationSettingsSnapshot,
  WritingAssignment,
  WritingQueueItem,
} from '../types';

const storageMode = resolveStorageMode(import.meta.env.VITE_STORAGE_MODE);

export const useBusinessAdminDashboardData = () => {
  const [snapshot, setSnapshot] = useState<OrganizationDashboardSnapshot | null>(null);
  const [settingsSnapshot, setSettingsSnapshot] = useState<OrganizationSettingsSnapshot | null>(null);
  const [missionBoard, setMissionBoard] = useState<WeeklyMissionBoard | null>(null);
  const [books, setBooks] = useState<BookMetadata[]>([]);
  const [writingAssignments, setWritingAssignments] = useState<WritingAssignment[]>([]);
  const [writingQueue, setWritingQueue] = useState<WritingQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextSnapshot, nextSettingsSnapshot, nextMissionBoard, nextBooks, nextWritingAssignments, nextWritingQueue] = await Promise.all([
        storage.getOrganizationDashboardSnapshot(),
        storage.getOrganizationSettingsSnapshot(),
        storage.getWeeklyMissionBoard(),
        storage.getBooks(),
        storageMode.isLocalMockData
          ? Promise.resolve<WritingAssignment[]>([])
          : listWritingAssignments('organization').then((response) => response.assignments),
        storageMode.isLocalMockData
          ? Promise.resolve<WritingQueueItem[]>([])
          : listWritingReviewQueue('QUEUE').then((response) => response.items),
      ]);

      setSnapshot(nextSnapshot);
      setSettingsSnapshot(nextSettingsSnapshot);
      setMissionBoard(nextMissionBoard);
      setBooks(nextBooks);
      setWritingAssignments(nextWritingAssignments);
      setWritingQueue(nextWritingQueue);
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
    settingsSnapshot,
    missionBoard,
    books,
    writingAssignments,
    writingQueue,
    loading,
    error,
    refresh,
  };
};

export default useBusinessAdminDashboardData;
