import { useCallback, useEffect, useState } from 'react';

import { workspaceService } from '../services/workspace';
import { listWritingAssignments, listWritingReviewQueue } from '../services/writing';
import { resolveStorageMode } from '../shared/storageMode';
import type {
  StudentSummary,
  WritingAssignment,
  WritingQueueItem,
} from '../types';

const storageMode = resolveStorageMode(import.meta.env.VITE_STORAGE_MODE);
const canUseInstructorWorkspaceApi = storageMode.capabilities.organization.available;
const canUseInstructorWorkspacePreview = storageMode.capabilities.organization.usesMockData;

export const useInstructorDashboardData = () => {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [writingAssignments, setWritingAssignments] = useState<WritingAssignment[]>([]);
  const [writingQueue, setWritingQueue] = useState<WritingQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!canUseInstructorWorkspaceApi && !canUseInstructorWorkspacePreview) {
      setStudents([]);
      setWritingAssignments([]);
      setWritingQueue([]);
      setLoading(false);
      setError('講師ワークスペースは Cloudflare storage mode でのみ利用できます。');
      return;
    }

    try {
      const [studentRows, assignmentResponse, queueResponse] = await Promise.all([
        workspaceService.getAllStudentsProgress(),
        listWritingAssignments('organization'),
        listWritingReviewQueue('QUEUE'),
      ]);

      setStudents(studentRows);
      setWritingAssignments(assignmentResponse.assignments);
      setWritingQueue(queueResponse.items);
    } catch (loadError) {
      console.error(loadError);
      setError((loadError as Error).message || '生徒データの取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    students,
    writingAssignments,
    writingQueue,
    loading,
    error,
    refresh,
  };
};

export default useInstructorDashboardData;
