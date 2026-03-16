import {
  StudentRiskLevel,
  type OrganizationDashboardSnapshot,
  type OrganizationInstructorBacklogSummary,
  type OrganizationInstructorSummary,
  type StudentSummary,
  type WritingAssignment,
  type WritingQueueItem,
} from '../types';
import { getInstructorQueueSegment } from '../shared/retention';

export type AssignmentFilter = 'ALL' | 'IMMEDIATE' | 'UNASSIGNED_AT_RISK';

export interface BusinessAdminWritingCounts {
  completedCount: number;
  issuedCount: number;
  reviewReadyCount: number;
  revisionRequestedCount: number;
}

const matchesStudentKeyword = (student: StudentSummary, query: string): boolean => {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return true;

  return student.name.toLowerCase().includes(keyword) || student.email.toLowerCase().includes(keyword);
};

export const filterAssignmentStudents = (
  students: StudentSummary[],
  filter: AssignmentFilter,
  query: string,
): StudentSummary[] => students.filter((student) => {
  if (filter === 'IMMEDIATE' && getInstructorQueueSegment(student) !== 'IMMEDIATE') return false;
  if (filter === 'UNASSIGNED_AT_RISK' && (student.assignedInstructorUid || student.riskLevel === StudentRiskLevel.SAFE)) return false;
  return matchesStudentKeyword(student, query);
});

export const sortAssignmentStudentsByPriority = (
  students: StudentSummary[],
): StudentSummary[] => [...students].sort((left, right) => (
  Number(Boolean(right.needsFollowUpNow)) - Number(Boolean(left.needsFollowUpNow))
  || Number(Boolean(!right.assignedInstructorUid)) - Number(Boolean(!left.assignedInstructorUid))
  || Number(Boolean(getInstructorQueueSegment(right) === 'IMMEDIATE')) - Number(Boolean(getInstructorQueueSegment(left) === 'IMMEDIATE'))
  || Number(Boolean(right.latestInterventionOutcome === 'EXPIRED')) - Number(Boolean(left.latestInterventionOutcome === 'EXPIRED'))
  || ((left.lastActive || 0) - (right.lastActive || 0))
  || left.name.localeCompare(right.name, 'ja')
));

export const resolveSelectedAssignmentStudentUid = (
  students: StudentSummary[],
  selectedStudentUid: string | null,
): string | null => {
  if (students.length === 0) return null;
  if (selectedStudentUid && students.some((student) => student.uid === selectedStudentUid)) {
    return selectedStudentUid;
  }
  return students[0].uid;
};

export const selectAssignmentStudent = (
  students: StudentSummary[],
  selectedStudentUid: string | null,
): StudentSummary | null => students.find((student) => student.uid === selectedStudentUid) || students[0] || null;

export const sortInstructorsByAssignedLoad = (
  instructors: OrganizationInstructorSummary[],
): OrganizationInstructorSummary[] => [...instructors].sort((left, right) => {
  if (right.assignedStudentCount !== left.assignedStudentCount) {
    return right.assignedStudentCount - left.assignedStudentCount;
  }
  if (right.notifications7d !== left.notifications7d) {
    return right.notifications7d - left.notifications7d;
  }
  return left.displayName.localeCompare(right.displayName, 'ja');
});

export const sortInstructorBacklogByLoad = (
  instructors: OrganizationInstructorBacklogSummary[],
): OrganizationInstructorBacklogSummary[] => [...instructors].sort((left, right) => (
  right.immediateCount - left.immediateCount
  || right.backlogCount - left.backlogCount
  || right.assignedStudentCount - left.assignedStudentCount
  || left.displayName.localeCompare(right.displayName, 'ja')
));

export const getPlanCoverageRate = (
  snapshot: Pick<OrganizationDashboardSnapshot, 'totalStudents' | 'learningPlanCount'>,
): number => {
  if (snapshot.totalStudents <= 0) return 0;
  return Math.round((snapshot.learningPlanCount / snapshot.totalStudents) * 100);
};

export const getBusinessAdminWritingCounts = (
  assignments: WritingAssignment[],
  queue: WritingQueueItem[],
): BusinessAdminWritingCounts => ({
  completedCount: assignments.filter((assignment) => assignment.status === 'COMPLETED').length,
  issuedCount: assignments.filter((assignment) => assignment.status === 'ISSUED').length,
  reviewReadyCount: queue.length,
  revisionRequestedCount: assignments.filter((assignment) => assignment.status === 'REVISION_REQUESTED').length,
});
