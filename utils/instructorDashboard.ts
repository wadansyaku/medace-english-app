import { StudentRiskLevel, type StudentSummary } from '../types';

export type InstructorStudentFilter = 'ALL' | 'DANGER' | 'WARNING';

const riskWeight = (riskLevel: StudentRiskLevel): number => {
  if (riskLevel === StudentRiskLevel.DANGER) return 0;
  if (riskLevel === StudentRiskLevel.WARNING) return 1;
  return 2;
};

const matchesStudentKeyword = (student: StudentSummary, query: string): boolean => {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return true;

  return student.name.toLowerCase().includes(keyword) || student.email.toLowerCase().includes(keyword);
};

export const sortStudentsByPriority = (students: StudentSummary[]): StudentSummary[] => [...students].sort((left, right) => {
  const riskDiff = riskWeight(left.riskLevel) - riskWeight(right.riskLevel);
  if (riskDiff !== 0) return riskDiff;

  const activeDiff = (left.lastActive || 0) - (right.lastActive || 0);
  if (activeDiff !== 0) return activeDiff;

  return left.name.localeCompare(right.name, 'ja');
});

export const filterStudentsForInstructorView = (
  students: StudentSummary[],
  filter: InstructorStudentFilter,
  query: string,
): StudentSummary[] => students.filter((student) => {
  if (filter === 'DANGER' && student.riskLevel !== StudentRiskLevel.DANGER) return false;
  if (filter === 'WARNING' && student.riskLevel === StudentRiskLevel.SAFE) return false;
  return matchesStudentKeyword(student, query);
});

export const resolveFocusedStudentUid = (
  students: StudentSummary[],
  focusedStudentUid: string | null,
): string | null => {
  if (students.length === 0) return null;
  if (focusedStudentUid && students.some((student) => student.uid === focusedStudentUid)) {
    return focusedStudentUid;
  }
  return students[0].uid;
};

export const selectFocusedStudent = (
  students: StudentSummary[],
  focusedStudentUid: string | null,
): StudentSummary | null => students.find((student) => student.uid === focusedStudentUid) || students[0] || null;
