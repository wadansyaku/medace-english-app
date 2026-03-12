import { useCallback, useEffect, useState } from 'react';

import { storage } from '../services/storage';
import { listWritingAssignments, listWritingReviewQueue } from '../services/writing';
import type {
  StudentSummary,
  WritingAssignment,
  WritingQueueItem,
} from '../types';

export const useInstructorDashboardData = () => {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [writingAssignments, setWritingAssignments] = useState<WritingAssignment[]>([]);
  const [writingQueue, setWritingQueue] = useState<WritingQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [studentRows, assignmentResponse, queueResponse] = await Promise.all([
        storage.getAllStudentsProgress(),
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
