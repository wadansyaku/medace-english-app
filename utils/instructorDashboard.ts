import { StudentRiskLevel, type StudentSummary } from '../types';
import { getInstructorQueueSegment, type InstructorQueueSegment } from '../shared/retention';

export type InstructorStudentFilter = InstructorQueueSegment;

const queueWeight = (student: StudentSummary, now = Date.now()): number => {
  const segment = getInstructorQueueSegment(student, now);
  if (segment === 'IMMEDIATE') return 0;
  if (segment === 'WAITING') return 1;
  return 2;
};

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
  const queueDiff = queueWeight(left) - queueWeight(right);
  if (queueDiff !== 0) return queueDiff;

  if (left.needsFollowUpNow !== right.needsFollowUpNow) {
    return Number(Boolean(right.needsFollowUpNow)) - Number(Boolean(left.needsFollowUpNow));
  }

  if (left.latestInterventionOutcome !== right.latestInterventionOutcome) {
    return Number(Boolean(right.latestInterventionOutcome === 'EXPIRED')) - Number(Boolean(left.latestInterventionOutcome === 'EXPIRED'));
  }

  const riskDiff = riskWeight(left.riskLevel) - riskWeight(right.riskLevel);
  if (riskDiff !== 0) return riskDiff;

  const interventionDiff = (left.latestInterventionAt || 0) - (right.latestInterventionAt || 0);
  if (queueWeight(left) === 1 && interventionDiff !== 0) return interventionDiff;
  if (queueWeight(left) === 2 && interventionDiff !== 0) return -interventionDiff;

  const activeDiff = (left.lastActive || 0) - (right.lastActive || 0);
  if (activeDiff !== 0) return activeDiff;

  return left.name.localeCompare(right.name, 'ja');
});

export const filterStudentsForInstructorView = (
  students: StudentSummary[],
  filter: InstructorStudentFilter,
  query: string,
): StudentSummary[] => students.filter((student) => {
  if (getInstructorQueueSegment(student) !== filter) return false;
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
