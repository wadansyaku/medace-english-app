import { AssignmentEvent, OrganizationDashboardSnapshot, OrganizationInstructorSummary, StudentRiskLevel, StudentSummary, SubscriptionPlan } from '../../types';

const DAY_MS = 86400000;

interface BuildOrganizationDashboardSnapshotInput {
  organizationName: string;
  subscriptionPlan: SubscriptionPlan;
  totalMembers: number;
  totalInstructors: number;
  learningPlanCount: number;
  notifications7d: number;
  instructors: OrganizationInstructorSummary[];
  students: StudentSummary[];
  assignmentEvents: AssignmentEvent[];
  reactivatedStudents7d: number;
  notifiedStudents7d: number;
  now?: number;
}

export const buildOrganizationDashboardSnapshot = ({
  organizationName,
  subscriptionPlan,
  totalMembers,
  totalInstructors,
  learningPlanCount,
  notifications7d,
  instructors,
  students,
  assignmentEvents,
  reactivatedStudents7d,
  notifiedStudents7d,
  now = Date.now(),
}: BuildOrganizationDashboardSnapshotInput): OrganizationDashboardSnapshot => {
  const assignedStudents = students.filter((student) => student.assignedInstructorUid).length;
  const activeStudents7d = students.filter((student) => student.lastActive && now - student.lastActive < 7 * DAY_MS).length;
  const atRiskStudents = students.filter((student) => student.riskLevel !== StudentRiskLevel.SAFE);
  const atRiskStudentList = [...atRiskStudents]
    .sort((left, right) => left.lastActive - right.lastActive)
    .slice(0, 8);

  return {
    organizationName,
    subscriptionPlan,
    totalMembers,
    totalStudents: students.length,
    totalInstructors,
    activeStudents7d,
    atRiskStudents: atRiskStudents.length,
    learningPlanCount,
    notifications7d,
    reactivatedStudents7d,
    reactivationRate7d: notifiedStudents7d > 0
      ? Math.round((reactivatedStudents7d / notifiedStudents7d) * 100)
      : 0,
    assignmentCoverageRate: students.length > 0 ? Math.round((assignedStudents / students.length) * 100) : 0,
    unassignedStudents: students.filter((student) => !student.assignedInstructorUid).length,
    instructors,
    atRiskStudentList,
    studentAssignments: [...students].sort((left, right) => left.name.localeCompare(right.name)),
    assignmentEvents,
  };
};
