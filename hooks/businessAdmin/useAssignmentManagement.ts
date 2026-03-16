import { useCallback, useEffect, useMemo, useState } from 'react';

import { storage } from '../../services/storage';
import type { OrganizationDashboardSnapshot } from '../../types';
import {
  filterAssignmentStudents,
  resolveSelectedAssignmentStudentUid,
  selectAssignmentStudent,
  sortAssignmentStudentsByPriority,
  type AssignmentFilter,
} from '../../utils/businessAdminDashboard';

interface NoticeState {
  tone: 'success' | 'error';
  message: string;
}

interface UseAssignmentManagementParams {
  snapshot: OrganizationDashboardSnapshot | null;
  refresh: () => Promise<void>;
  setNotice: (notice: NoticeState | null) => void;
}

export const useAssignmentManagement = ({
  snapshot,
  refresh,
  setNotice,
}: UseAssignmentManagementParams) => {
  const [assignmentSavingUid, setAssignmentSavingUid] = useState<string | null>(null);
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>('ALL');
  const [assignmentQuery, setAssignmentQuery] = useState('');
  const [selectedStudentUid, setSelectedStudentUid] = useState<string | null>(null);

  const sortedAssignments = useMemo(() => (
    sortAssignmentStudentsByPriority(snapshot?.studentAssignments || [])
  ), [snapshot?.studentAssignments]);

  const filteredAssignments = useMemo(() => (
    filterAssignmentStudents(sortedAssignments, assignmentFilter, assignmentQuery)
  ), [assignmentFilter, assignmentQuery, sortedAssignments]);

  const selectedAssignmentStudent = useMemo(() => (
    selectAssignmentStudent(filteredAssignments, selectedStudentUid)
  ), [filteredAssignments, selectedStudentUid]);

  useEffect(() => {
    const nextUid = resolveSelectedAssignmentStudentUid(filteredAssignments, selectedStudentUid);
    if (nextUid !== selectedStudentUid) {
      setSelectedStudentUid(nextUid);
    }
  }, [filteredAssignments, selectedStudentUid]);

  const handleAssignmentChange = useCallback(async (studentUid: string, instructorUid: string) => {
    if (!snapshot) return;

    setAssignmentSavingUid(studentUid);
    setNotice(null);

    try {
      await storage.assignStudentInstructor(studentUid, instructorUid || null);
      const instructorName = snapshot.instructors.find((instructor) => instructor.uid === instructorUid)?.displayName;
      setNotice({
        tone: 'success',
        message: instructorUid
          ? `担当講師を ${instructorName || '選択した講師'} に更新しました。`
          : '担当講師の割当を解除しました。',
      });
      await refresh();
    } catch (assignmentError) {
      console.error(assignmentError);
      setNotice({
        tone: 'error',
        message: (assignmentError as Error).message || '担当割当の更新に失敗しました。',
      });
    } finally {
      setAssignmentSavingUid(null);
    }
  }, [refresh, setNotice, snapshot]);

  return {
    assignmentSavingUid,
    assignmentFilter,
    assignmentQuery,
    filteredAssignments,
    selectedAssignmentStudent,
    selectedStudentUid,
    setAssignmentFilter,
    setAssignmentQuery,
    setSelectedStudentUid,
    handleAssignmentChange,
  };
};
